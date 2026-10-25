import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const imageName = value => /^\/uploads\/([a-f0-9-]+\.(?:png|jpeg|webp))$/.exec(value || '')?.[1];
const tokenFrom = req => /(?:^|;\s*)__session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
export function securityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'private, no-store');
}
async function body(req) {
    // Cloud Functions parses JSON before invoking the handler.
    if (req.rawBody) {
        if (req.rawBody.length > 7 * 1024 * 1024) fail('Request too large.', 413);
        try { return JSON.parse(req.rawBody.toString('utf8')); } catch { fail('Invalid JSON.'); }
    }
    const chunks = []; let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 7 * 1024 * 1024) fail('Request too large.', 413);
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('Invalid JSON.'); }
}
function text(value, max, required = true) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('Please check the project fields.');
    return value.trim();
}
function fields(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid project.');
    const name = text(input.name, 160), category = text(input.category, 100);
    const description = text(input.description, 10000), url = text(input.url || '', 2048, false);
    if (url) {
        try { if (!['https:', 'http:'].includes(new URL(url).protocol)) fail('Project links must use https:// or http://.'); }
        catch { fail('Project links must use https:// or http://.'); }
    }
    if (typeof input.featured !== 'boolean') fail('Invalid featured switch.');
    return { name, category, description, url, featured:input.featured };
}
function photoData(value) {
    const match = typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
    if (!match) fail('Use a PNG, JPEG, or WebP photo.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) fail('Photo must be smaller than 5 MB.');
    const valid = match[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    if (!valid) fail('This photo is not a valid image.');
    return { name:`${randomUUID()}.${match[1]}`, bytes, type:`image/${match[1]}` };
}
export function createApi({ store, password, adminOrigins, secure = true, requireAdminHost = false }) {
    if (!password || password.length < 8 || password.startsWith('replace-with-')) throw new Error('Set ADMIN_PASSWORD to at least 8 characters.');
    const salt = randomBytes(32);
    const passwordHash = scrypt(password, salt, 64);
    // Password rotation invalidates all old sessions across all cloud instances.
    const version = hash(password);
    const cookie = token => `__session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 28800 : 0}${secure ? '; Secure' : ''}`;
    return async function api(req, res) {
        securityHeaders(res);
        const json = (status, value, headers = {}) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(value)); };
        try {
            const url = new URL(req.url, 'http://localhost');
            const filename = imageName(url.pathname);
            if (filename && ['GET','HEAD'].includes(req.method)) {
                const photo = await store.readUpload(filename);
                res.writeHead(200, { 'Content-Type':photo.type, 'Cache-Control':'public, max-age=86400' });
                return res.end(req.method === 'HEAD' ? undefined : photo.bytes);
            }
            if (url.pathname === '/api/projects' && req.method === 'GET') return json(200, await store.list());
            if (requireAdminHost && !adminOrigins.some(origin => new URL(origin).host === req.headers.host)) return json(404, { error:'Not found.' });
            // Origin protects all admin mutations even when Hosting rewrites the Host header.
            if (req.method !== 'GET' && !adminOrigins.includes(req.headers.origin)) return json(403, { error:'Invalid request origin.' });
            if (url.pathname === '/api/login' && req.method === 'POST') {
                if (!(req.headers['content-type'] || '').startsWith('application/json')) fail('Use a JSON request.',415);
                const input = await body(req);
                // A shared transaction protects the login limit across cold starts and instances.
                const ip = req.ip || req.socket?.remoteAddress || 'unknown';
                await store.consumeAttempt(hash(ip), Date.now());
                if (!input || typeof input.password !== 'string' || input.password.length > 1024 || !timingSafeEqual(await scrypt(input.password, salt, 64), await passwordHash)) return json(401, { error:'Incorrect password.' });
                const token = randomBytes(32).toString('hex');
                await store.putSession(hash(token), { until:Date.now() + 28800000, version });
                return json(200, { ok:true }, { 'Set-Cookie':cookie(token) });
            }
            const token = tokenFrom(req);
            const session = token && await store.getSession(hash(token));
            if (!session || session.until < Date.now() || session.version !== version) return json(401, { error:'Please sign in.' });
            if (url.pathname === '/api/session' && req.method === 'GET') return json(200, { ok:true });
            if (url.pathname === '/api/logout' && req.method === 'POST') {
                await store.deleteSession(hash(token));
                return json(200, { ok:true }, { 'Set-Cookie':cookie('') });
            }
            const id = /^\/api\/projects\/([a-zA-Z0-9-]{1,80})$/.exec(url.pathname)?.[1];
            if (id && req.method === 'DELETE') {
                const previous = await store.remove(id);
                if (imageName(previous.image)) await store.deleteUpload(imageName(previous.image)).catch(() => {});
                return json(200, { ok:true });
            }
            if ((url.pathname === '/api/projects' && req.method === 'POST') || (id && req.method === 'PUT')) {
                if (!(req.headers['content-type'] || '').startsWith('application/json')) fail('Use a JSON request.',415);
                const input = await body(req), project = fields(input);
                let photo;
                if (input.photo) {
                    photo = photoData(input.photo);
                    await store.writeUpload(photo.name, photo.bytes, photo.type);
                    project.image = '/uploads/' + photo.name;
                }
                try {
                    const result = await store.save(id || randomUUID(), project, !id);
                    if (photo && imageName(result.previous?.image)) await store.deleteUpload(imageName(result.previous.image)).catch(() => {});
                    return json(id ? 200 : 201, result.project);
                } catch (error) {
                    if (photo) await store.deleteUpload(photo.name).catch(() => {});
                    throw error;
                }
            }
            return json(404, { error:'Not found.' });
        } catch (error) {
            const status = error.status || (['ENOENT',404].includes(error.code) ? 404 : 500);
            if (status === 500) console.error('Portfolio operation failed:', error.code || error.name);
            return json(status, { error:error.status ? error.message : status === 404 ? 'Not found.' : 'Unable to load or save projects. Please try again.' });
        }
    };
}
