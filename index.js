/**
 * Host half of the Skill Gallery bundle.
 *
 * Serves two read/write endpoints over the scanned skill roots:
 *
 * - `GET /skill-gallery/skills` lists every installed skill with the fields a
 *   card needs (title, version, description, file count, byte size, update
 *   time, invocation flags, install path).
 * - `POST /skill-gallery/uninstall` removes exactly one scanned skill after the
 *   page's confirmation dialog, using the same safe direct-child checks as the
 *   scanner.
 *
 * Both endpoints stay behind the Host's browser trust fence.
 */
import { enrichRegistry } from './lib/registry.js';
import { collectSkills, removeSkill } from './lib/skills.js';

const SKILLS_ROUTE = '/skill-gallery/skills';
const UNINSTALL_ROUTE = '/skill-gallery/uninstall';
const BODY_LIMIT = 8 * 1024;

/** Services the endpoints need. */
export const inject = ['webServer'];

/**
 * Reject requests the Host's browser fence does not admit.
 *
 * @param req - incoming request.
 * @param services - `{ connection }` resolved from the plugin context.
 * @returns true when the caller must be answered with a rejection.
 */
function rejected(req, res, services) {
  const rejection = services.connection?.requestRejection?.({ headers: req.headers });
  if (rejection === undefined) return false;
  respondText(req, res, rejection, rejection === 401 ? 'unauthorized' : 'forbidden');
  return true;
}

/**
 * Answer one plain-text response.
 *
 * @param req - incoming request.
 * @param res - response to complete.
 * @param status - HTTP status.
 * @param text - response body.
 */
function respondText(req, res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : text);
}

/**
 * Answer one JSON response.
 *
 * @param res - response to complete.
 * @param status - HTTP status.
 * @param payload - JSON-serializable body.
 * @param head - whether this is a HEAD request.
 */
function respondJson(res, status, payload, head = false) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(head ? undefined : body);
}

/**
 * Read a small JSON request body.
 *
 * @param req - incoming request.
 * @returns body text.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Scan and answer the skills endpoint.
 *
 * @param req - incoming request.
 * @param res - response to complete.
 * @param services - plugin services.
 */
async function handleSkills(req, res, services) {
  if (rejected(req, res, services)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
    res.end('method not allowed');
    return;
  }
  try {
    const payload = await collectSkills();
    const requestUrl = new URL(req.url ?? '/', 'http://dsh.internal');
    await enrichRegistry(payload.skills, { refresh: requestUrl.searchParams.get('refresh') === '1' });
    respondJson(res, 200, payload, req.method === 'HEAD');
  } catch (error) {
    services.logger?.warn?.(`skill-gallery: scan failed: ${messageOf(error)}`);
    respondJson(res, 500, { error: messageOf(error) });
  }
}

/**
 * Delete one skill the scanner currently reports.
 *
 * @param req - incoming request.
 * @param res - response to complete.
 * @param services - plugin services.
 */
async function handleUninstall(req, res, services) {
  if (rejected(req, res, services)) return;
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain; charset=utf-8' });
    res.end('method not allowed');
    return;
  }
  const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    res.writeHead(415, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('content-type must be application/json');
    return;
  }
  try {
    const raw = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      respondJson(res, 400, { error: 'body is not JSON' });
      return;
    }
    const id = payload !== null && typeof payload === 'object' && typeof payload.id === 'string' ? payload.id : '';
    if (id.length === 0 || id.length > 512) {
      respondJson(res, 400, { error: 'id must be a non-empty skill id' });
      return;
    }
    const { skills } = await collectSkills();
    const skill = skills.find((entry) => entry.id === id);
    if (skill === undefined) {
      respondJson(res, 404, { error: 'skill not found' });
      return;
    }
    if (skill.removable === false) {
      respondJson(res, 403, { error: 'this skill is provided by a bundle and cannot be removed here' });
      return;
    }
    const removed = await removeSkill(skill);
    services.logger?.info?.(`skill-gallery: uninstalled ${skill.slug} (${removed.path})`);
    respondJson(res, 200, { ok: true, id, removed });
  } catch (error) {
    services.logger?.warn?.(`skill-gallery: uninstall failed: ${messageOf(error)}`);
    respondJson(res, 500, { error: messageOf(error) });
  }
}

/**
 * Render one error message.
 *
 * @param error - caught value.
 * @returns message text.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Mount both endpoints.
 *
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  const services = {
    connection: ctx.get('connection'),
    logger: ctx.logger,
  };
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: SKILLS_ROUTE,
        handler: (req, res) => {
          void handleSkills(req, res, services);
        },
      }),
    'skill-gallery: skills route',
  );
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: UNINSTALL_ROUTE,
        handler: (req, res) => {
          void handleUninstall(req, res, services);
        },
      }),
    'skill-gallery: uninstall route',
  );
}
