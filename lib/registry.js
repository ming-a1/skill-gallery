/**
 * Optional SkillHub registry enrichment for installed skills.
 *
 * Two gaps are filled from the same cached lookup:
 *
 * - a skill whose own metadata has no CJK display name can borrow the
 *   registry's Chinese `displayName`;
 * - the publisher comes from the registry owner instead of the numeric
 *   `ownerId` stored in `_meta.json`.
 *
 * Only one request per slug is made (cached for 10 minutes, misses included),
 * registry failures leave the local projection untouched, and the page never
 * waits longer than the lookup timeout for the whole batch.
 */
const CJK = /[\u3400-\u9FFF]/;
const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 1800;
const MAX_LOOKUPS = 20;
const CACHE = new Map();
const API_BASE = String(process.env.DSH_SKILLHUB_API ?? 'https://api.skillhub.cn').replace(/\/+$/, '');

/**
 * Enrich scanned skills with a Chinese registry name and a publisher name.
 *
 * @param skills - scanned skill projections, mutated in place.
 * @returns nothing; failures leave the projection untouched.
 */
export async function enrichRegistry(skills) {
  if (API_BASE.length === 0 || !Array.isArray(skills)) return;
  const targets = [];
  for (const skill of skills) {
    if (targets.length >= MAX_LOOKUPS) break;
    if (typeof skill.slug !== 'string' || skill.slug.length === 0) continue;
    targets.push(skill);
  }
  await Promise.all(
    targets.map(async (skill) => {
      const info = await lookup(skill.slug);
      if (info === undefined) return;
      if (info.displayName !== undefined && !hasCjk(skill.zhName)) skill.registryName = info.displayName;
      if (info.publisher !== undefined) skill.publisherName = info.publisher;
    }),
  );
}

/**
 * Resolve one slug's registry name and publisher, cached.
 *
 * @param slug - skill slug.
 * @returns `{ displayName?, publisher? }` or undefined.
 */
async function lookup(slug) {
  const cached = CACHE.get(slug);
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return cached.info;
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
      if (displayName !== undefined || publisher !== undefined) {
        info = {};
        if (displayName !== undefined && CJK.test(displayName)) info.displayName = displayName;
        if (publisher !== undefined) info.publisher = publisher;
      }
    }
  } catch {
    /* registry unreachable: keep local names */
  }
  CACHE.set(slug, { at: Date.now(), info });
  return info;
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
