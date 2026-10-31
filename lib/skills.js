/**
 * Disk scanner behind the Skill Gallery page.
 *
 * The page needs more than the session skill catalog exposes: file count, byte
 * size, update time, install metadata (`_meta.json`) and the resolved
 * `SKILL.md` path. All of it is derived from the skill roots on disk, read-only.
 *
 * A skill is either a directory bundle `<slug>/SKILL.md` or a flat
 * `<slug>.md` file directly under a scanned root, matching the filesystem
 * skill provider's discovery rules.
 */
import { lstat, readdir, readFile, realpath, rm, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Upper bound on files counted for one skill, so a runaway bundle cannot stall the route. */
const MAX_FILES = 4000;

/**
 * Resolve the skill roots in priority order.
 *
 * @param env - process environment.
 * @returns `[{ source, path }]` with sources the Client localizes.
 */
export function resolveRoots(env = process.env) {
  const home = env.HOME && env.HOME.length > 0 ? env.HOME : homedir();
  const dshHome = env.DSH_HOME && env.DSH_HOME.length > 0 ? env.DSH_HOME : join(home, '.dsh');
  return [{ source: 'user', path: join(dshHome, 'skills'), removable: true }];
}

/**
 * Scan every root and merge the results, first root winning on a name clash.
 *
 * @param options - overrides for tests.
 * @returns `{ skills, roots, scannedAt }`.
 */
export async function collectSkills(options = {}) {
  const roots = options.roots ?? resolveRoots(options.env);
  const scanned = [];
  const merged = new Map();
  for (const root of roots) {
    const listing = await scanRoot(root);
    scanned.push({ source: listing.source, path: listing.path, exists: listing.exists, count: listing.count });
    for (const skill of listing.skills) {
      const key = skill.name.toLowerCase();
      if (!merged.has(key)) merged.set(key, skill);
    }
  }
  const skills = [...merged.values()].sort(compareSkills);
  return { skills, roots: scanned, scannedAt: new Date().toISOString() };
}

/**
 * Order the newest skills first, then by title.
 *
 * @param a - first skill.
 * @param b - second skill.
 * @returns comparator result.
 */
function compareSkills(a, b) {
  const left = Date.parse(a.updatedAt ?? '') || 0;
  const right = Date.parse(b.updatedAt ?? '') || 0;
  if (left !== right) return right - left;
  return a.title.localeCompare(b.title);
}

/**
 * Scan one root's direct children.
 *
 * @param root - `{ source, path }`.
 * @returns listing with parsed skills.
 */
async function scanRoot(root) {
  const result = { source: root.source, path: root.path, exists: false, count: 0, skills: [] };
  let entries;
  try {
    entries = await readdir(root.path, { withFileTypes: true });
  } catch {
    return result;
  }
  result.exists = true;
  for (const dirent of entries) {
    if (dirent.name.startsWith('.')) continue;
    const target = join(root.path, dirent.name);
    let info;
    try {
      info = await stat(target);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      const skillFile = join(target, 'SKILL.md');
      const skillInfo = await stat(skillFile).catch(() => undefined);
      if (skillInfo === undefined || !skillInfo.isFile()) continue;
      const skill = await buildSkill({
        source: root.source,
        rootPath: root.path,
        slug: dirent.name,
        skillFile,
        bundleDir: target,
        removable: root.removable !== false,
      });
      if (skill !== undefined) {
        result.skills.push(skill);
        result.count += 1;
      }
      continue;
    }
    if (info.isFile() && dirent.name.toLowerCase().endsWith('.md')) {
      const skill = await buildSkill({
        source: root.source,
        rootPath: root.path,
        slug: dirent.name.slice(0, -3),
        skillFile: target,
        bundleDir: undefined,
        removable: root.removable !== false,
      });
      if (skill !== undefined) {
        result.skills.push(skill);
        result.count += 1;
      }
    }
  }
  return result;
}

/**
 * Read and normalize one discovered skill.
 *
 * @param input - discovery coordinates.
 * @returns card projection, or undefined when the frontmatter is unusable.
 */
async function buildSkill(input) {
  let text = '';
  try {
    text = await readFile(input.skillFile, 'utf8');
  } catch {
    return undefined;
  }
  const frontmatter = parseFrontmatter(text);
  const data = frontmatter.data;
  if (typeof data !== 'object' || data === null) return undefined;
  const meta = input.bundleDir === undefined ? {} : await readInstallMeta(input.bundleDir);
  const name = scalarString(data.name) ?? input.slug;
  if (name.length === 0) return undefined;
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const stats = input.bundleDir === undefined ? await singleFileStats(input.skillFile) : await bundleStats(input.bundleDir);
  const skillDir = input.bundleDir ?? dirname(input.skillFile);
  const install = normalizeInstallMeta(meta);
  return {
    id: input.source + ':' + input.slug,
    slug: install.slug ?? input.slug,
    name,
    title: scalarString(data.displayName) ?? name,
    zhName: scalarString(metadata.displayName),
    summary: scalarString(metadata.summary),
    description: scalarString(data.description) ?? scalarString(metadata.summary) ?? '',
    version: scalarString(data.version) ?? install.version ?? scalarString(metadata.version),
    owner: install.ownerId ?? scalarString(metadata.author),
    author: scalarString(data.author),
    tags: scalarArray(metadata.tags ?? data.tags),
    source: input.source,
    rootPath: input.rootPath,
    dir: skillDir,
    path: input.skillFile,
    files: stats.files,
    bytes: stats.bytes,
    updatedAt: stats.updatedAt,
    installedAt: install.publishedAt,
    kind: input.bundleDir === undefined ? 'file' : 'bundle',
    removable: input.removable !== false,
    via: Object.keys(meta).length > 0 ? 'skillhub' : 'local',
    modelInvocable: !parseBoolean(data['disable-model-invocation'], false),
    userInvocable: parseBoolean(data['user-invocable'], true),
    hasScripts: await hasChild(skillDir, 'scripts'),
    hasReferences: await hasChild(skillDir, 'references'),
  };
}

/**
 * Sum file count, bytes, and the newest mtime below one bundle directory.
 *
 * @param root - skill directory.
 * @returns `{ files, bytes, updatedAt }`.
 */
async function bundleStats(root) {
  let files = 0;
  let bytes = 0;
  let newest = 0;
  const stack = [root];
  while (stack.length > 0 && files < MAX_FILES) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of entries) {
      const target = join(current, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(target);
        continue;
      }
      let info;
      try {
        info = await stat(target);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      files += 1;
      bytes += info.size;
      if (info.mtimeMs > newest) newest = info.mtimeMs;
    }
  }
  return { files, bytes, updatedAt: newest > 0 ? new Date(newest).toISOString() : undefined };
}

/**
 * Stats for a flat `<name>.md` skill.
 *
 * @param file - skill file path.
 * @returns `{ files: 1, bytes, updatedAt }`.
 */
async function singleFileStats(file) {
  const info = await stat(file).catch(() => undefined);
  return { files: 1, bytes: info?.size ?? 0, updatedAt: info?.mtime?.toISOString() };
}

/**
 * Read the installer's `_meta.json` when present.
 *
 * @param dir - skill directory.
 * @returns parsed object or `{}`.
 */
async function readInstallMeta(dir) {
  try {
    const raw = await readFile(join(dir, '_meta.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Project `_meta.json` onto the card fields we publish.
 *
 * @param meta - raw installer metadata.
 * @returns normalized fields.
 */
function normalizeInstallMeta(meta) {
  const publishedAt = typeof meta.publishedAt === 'number' && Number.isFinite(meta.publishedAt)
    ? new Date(meta.publishedAt).toISOString()
    : undefined;
  return {
    slug: scalarString(meta.slug),
    version: scalarString(meta.version),
    ownerId: scalarString(meta.ownerId),
    publishedAt,
  };
}

/**
 * Whether a bundle contains a named child directory.
 *
 * @param dir - skill directory.
 * @param name - child name.
 * @returns true when the child is a directory.
 */
async function hasChild(dir, name) {
  const info = await stat(join(dir, name)).catch(() => undefined);
  return info !== undefined && info.isDirectory();
}

/**
 * Parse a `SKILL.md` file's YAML frontmatter.
 *
 * Supports the subset skills actually use: top-level scalars, one level of
 * nested maps (`metadata:`), scalar lists, quoted and folded scalars. Anything
 * else is skipped instead of throwing, so a malformed skill cannot break the
 * whole gallery.
 *
 * @param text - file contents.
 * @returns `{ data, body }`.
 */
export function parseFrontmatter(text) {
  const normalized = String(text).replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return { data: {}, body: normalized };
  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      end = index;
      break;
    }
  }
  if (end < 0) return { data: {}, body: normalized };
  return { data: parseMap(lines.slice(1, end), 0), body: lines.slice(end + 1).join('\n') };
}

/**
 * Parse an indentation-based YAML map subset.
 *
 * @param lines - raw lines.
 * @param baseIndent - minimum indentation accepted.
 * @returns parsed object.
 */
function parseMap(lines, baseIndent) {
  const out = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().length === 0 || line.trim().startsWith('#')) {
      index += 1;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent < baseIndent) break;
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (match === null) {
      index += 1;
      continue;
    }
    const key = match[1];
    const rest = match[2];
    if (rest.length === 0 || /^[|>][+-]?$/.test(rest)) {
      const gathered = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const child = lines[cursor];
        if (child.trim().length === 0) {
          if (gathered.length > 0) gathered.push('');
          cursor += 1;
          continue;
        }
        const childIndent = child.length - child.trimStart().length;
        if (childIndent <= indent) break;
        gathered.push(child);
        cursor += 1;
      }
      const meaningful = gathered.filter((entry) => entry.trim().length > 0);
      if (rest.length === 0 && meaningful.length > 0 && meaningful.every((entry) => /^\s*-\s+/.test(entry))) {
        out[key] = meaningful.map((entry) => parseScalar(entry.replace(/^\s*-\s+/, ''))).filter((value) => value !== '');
      } else if (rest.length === 0 && meaningful.some((entry) => /^\s*[A-Za-z0-9_.-]+\s*:/.test(entry))) {
        out[key] = parseMap(gathered, indent + 1);
      } else {
        const flattened = gathered.map((entry) => entry.slice(Math.min(indent + 1, entry.length))).join('\n');
        out[key] = parseScalar(flattened);
      }
      index = cursor;
      continue;
    }
    out[key] = parseScalar(rest);
    index += 1;
  }
  return out;
}

/**
 * Parse one YAML scalar.
 *
 * @param raw - scalar source.
 * @returns string, number, boolean, or a scalar array.
 */
function parseScalar(raw) {
  const value = String(raw).trim();
  if (value.length === 0) return '';
  if (value.startsWith('"')) {
    const match = /^"((?:[^"\\]|\\.)*)"/.exec(value);
    if (match !== null) {
      try {
        return JSON.parse('"' + match[1] + '"');
      } catch {
        return match[1];
      }
    }
  }
  if (value.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'/.exec(value);
    if (match !== null) return match[1].replace(/''/g, "'");
  }
  if (/^(true|yes|on)$/i.test(value)) return true;
  if (/^(false|no|off)$/i.test(value)) return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith('[')) {
    try {
      return JSON.parse(value.replace(/'/g, '"'));
    } catch {
      return value;
    }
  }
  return value.replace(/\s+#.*$/, '');
}

/**
 * Strict boolean grammar for invocation keys.
 *
 * @param value - raw frontmatter value.
 * @param fallback - default when absent or invalid.
 * @returns boolean.
 */
function parseBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'on', '1'].includes(normalized)) return true;
    if (['false', 'no', 'off', '0'].includes(normalized)) return false;
  }
  return fallback;
}

/**
 * Coerce an unknown value to a non-empty trimmed string.
 *
 * @param value - candidate.
 * @returns string or undefined.
 */
function scalarString(value) {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Coerce an unknown value to a string array.
 *
 * @param value - candidate.
 * @returns string array.
 */
function scalarArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
}

/**
 * Whether a value is a plain object.
 *
 * @param value - candidate.
 * @returns true for a non-array object.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Delete one discovered skill's entries from disk.
 *
 * Only the exact target the scanner found is removed: a bundle directory, a
 * flat `<name>.md` file, or a symlink (the link itself, never its target).
 * The target must remain a direct child of its scanned root after resolving
 * symlinks, so a crafted id cannot reach any other path.
 *
 * @param skill - one skill entry returned by {@link collectSkills}.
 * @returns `{ kind, path }` describing what was removed.
 */
export async function removeSkill(skill) {
  if (typeof skill !== 'object' || skill === null) throw new Error('invalid skill');
  if (skill.kind !== 'bundle' && skill.kind !== 'file') throw new Error('unsupported skill kind');
  if (skill.removable === false) throw new Error('refusing to remove a provided skill');
  const rootPath = typeof skill.rootPath === 'string' ? skill.rootPath : '';
  if (rootPath.length === 0) throw new Error('skill root is unknown');
  const target = skill.kind === 'bundle' ? skill.dir : skill.path;
  if (typeof target !== 'string' || target.length === 0) throw new Error('skill target is unknown');

  const realRoot = await realpath(rootPath);
  const entryInfo = await lstat(target);
  if (entryInfo.isSymbolicLink()) {
    await unlink(target);
    return { kind: 'symlink', path: target };
  }
  const realTarget = await realpath(target);
  if (dirname(realTarget) !== realRoot) throw new Error('refusing to delete outside the skill root');
  if (skill.kind === 'file') {
    if (!entryInfo.isFile()) throw new Error('skill file is not a regular file');
    if (!realTarget.toLowerCase().endsWith('.md')) throw new Error('refusing to delete a non-markdown skill file');
    await unlink(target);
    return { kind: 'file', path: target };
  }
  if (realTarget === realRoot) throw new Error('refusing to delete the skill root');
  if (!entryInfo.isDirectory()) throw new Error('skill bundle is not a directory');
  await rm(target, { recursive: true, force: false });
  return { kind: 'directory', path: target };
}
