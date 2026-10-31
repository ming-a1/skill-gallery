/**
 * Optional SkillHub registry enrichment for installed skills.
 *
 * Three gaps are filled from one cached lookup per installed skill:
 *
 * - a skill whose own metadata has no CJK display name can borrow the
 *   registry's Chinese `displayName`;
 * - the publisher comes from the registry owner instead of the numeric
 *   `ownerId` stored in `_meta.json`;
 * - the registry's `latestVersion` is compared with the installed version so
 *   the card can flag an available update.
 *
 * A lookup is cached for 10 minutes (misses included); a forced check bypasses
 * that cache, and registry failures leave the local projection untouched.
 */
const CJK = /[\u3400-\u9FFF]/;
const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 1800;
const MAX_LOOKUPS = 20;
const CACHE = new Map();
const API_BASE = String(process.env.DSH_SKILLHUB_API ?? 'https://api.skillhub.cn').replace(/\/+$/, '');

/**
 * Enrich scanned skills with registry display name, publisher, and update state.
 *
 * @param skills - scanned skill projections, mutated in place.
 * @param options - `{ refresh: true }` bypasses the lookup cache.
 * @returns nothing; failures leave the projection untouched.
 */
export async function enrichRegistry(skills, options = {}) {
  if (API_BASE.length === 0 || !Array.isArray(skills)) return;
  const refresh = options !== null && typeof options === 'object' && options.refresh === true;
  const targets = [];
  for (const skill of skills) {
    if (targets.length >= MAX_LOOKUPS) break;
    if (typeof skill.slug !== 'string' || skill.slug.length === 0) continue;
    if (skill.via !== 'skillhub') continue;
    targets.push(skill);
  }
  await Promise.all(
    targets.map(async (skill) => {
      const info = await lookup(skill.slug, refresh);
      if (info === undefined) return;
      if (info.displayName !== undefined && !hasCjk(skill.zhName)) skill.registryName = info.displayName;
      if (info.publisher !== undefined) skill.publisherName = info.publisher;
      if (info.latestVersion !== undefined) {
        skill.latestVersion = info.latestVersion;
        const current = typeof skill.version === 'string' ? skill.version : undefined;
        if (current !== undefined) {
          const newer = isNewerVersion(info.latestVersion, current);
          if (newer !== undefined) skill.updateAvailable = newer;
        }
      }
    }),
  );
}

/**
 * Resolve one slug's registry metadata, cached.
 *
 * @param slug - skill slug.
 * @param refresh - bypass the cache.
 * @returns `{ displayName?, publisher?, latestVersion? }` or undefined.
 */
async function lookup(slug, refresh) {
  const cached = CACHE.get(slug);
  if (!refresh && cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return cached.info;
  let info;
  try {
    const response = await fetch(API_BASE + '/api/v1/skills/' + encodeURIComponent(slug), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (response.ok) {
      const body = await response.json();
      const skill = body !== null && typeof body === 'object' && body.skill !== null && typeof body.skill === 'object'
        ? body.skill
        : undefined;
      const displayName = cleanName(skill?.displayName, 120);
      const publisher = cleanName(
        body?.owner?.displayName
          ?? body?.owner?.handle
          ?? body?.namespace?.displayName
          ?? body?.publisher?.name,
        80,
      );
      const latestVersion = cleanName(
        body !== null && typeof body === 'object' && body.latestVersion !== null && typeof body.latestVersion === 'object'
          ? body.latestVersion.version
          : undefined,
        40,
      );
      if (displayName !== undefined || publisher !== undefined || latestVersion !== undefined) {
        info = {};
        if (displayName !== undefined && CJK.test(displayName)) info.displayName = displayName;
        if (publisher !== undefined) info.publisher = publisher;
        if (latestVersion !== undefined) info.latestVersion = latestVersion;
      }
    }
  } catch {
    /* registry unreachable: keep local names */
  }
  CACHE.set(slug, { at: Date.now(), info });
  return info;
}

/**
 * Whether `latest` is a newer numeric version than `current`.
 *
 * @param latest - registry version.
 * @param current - installed version.
 * @returns true/false, or undefined when a version is not parseable.
 */
function isNewerVersion(latest, current) {
  const left = parseVersion(latest);
  const right = parseVersion(current);
  if (left === undefined || right === undefined) return undefined;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * Parse a dotted numeric version.
 *
 * @param value - version text, with or without a leading v and a prerelease.
 * @returns numeric parts or undefined.
 */
function parseVersion(value) {
  if (typeof value !== 'string') return undefined;
  const core = value.trim().replace(/^v/i, '').split('-')[0];
  const parts = core.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts;
}

/**
 * Normalize one registry string.
 *
 * @param value - candidate.
 * @param limit - maximum length.
 * @returns cleaned text or undefined.
 */
function cleanName(value, limit) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, limit);
}

/**
 * Whether a value contains a CJK character.
 *
 * @param value - candidate.
 * @returns true for CJK text.
 */
function hasCjk(value) {
  return typeof value === 'string' && CJK.test(value);
}
