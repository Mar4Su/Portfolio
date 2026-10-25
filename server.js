import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(root, 'mara-1.0.8');
const data = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 16) throw new Error('Set ADMIN_PASSWORD to at least 16 characters in .env.');
const salt = randomBytes(32), passwordHash = scryptSync(password, salt, 64);
const sessions = new Map(), attempts = new Map();
const adminOrigin = process.env.ADMIN_ORIGIN || 'http://localhost:3000';
const publicOrigin = process.env.PUBLIC_ORIGIN || 'http://localhost:3000';
const secure = process.env.COOKIE_SECURE === 'true';
const database = path.join(data, 'projects.json');
await mkdir(path.join(data, 'uploads'), { recursive: true });
let projects;
try { projects = JSON.parse(await readFile(database, 'utf8')); }
catch (error) {
    if (error.code !== 'ENOENT') throw error;
    projects = JSON.parse(await readFile(path.join(site, 'projects.seed.json'), 'utf8'));
    await writeFile(database, JSON.stringify(projects, null, 2));
}
async function persist(next) {
    await writeFile(database + '.tmp', JSON.stringify(next, null, 2));
    await rename(database + '.tmp', database);
    projects = next;
}
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
async function body(req) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) fail('Upload must be smaller than 5 MB.', 413);
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString()); }
    catch { fail('Invalid JSON.'); }
}
const cookie = token => `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 28800 : 0}${secure ? '; Secure' : ''}`;
function authenticated(req) {
    const token = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const expires = sessions.get(token);
    if (!expires || expires < Date.now()) { sessions.delete(token); return false; }
    return true;
}
function text(value, max, required = true) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('Please check the project fields.');
    return value.trim();
}
async function validate(input, previous) {
    const name = text(input.name, 160), category = text(input.category, 100);
    const description = text(input.description, 10000), url = text(input.url || '', 2048, false);
    if (url && !/^https?:\/\//i.test(url)) fail('Project links must start with https:// or http://.');
    if (url) { try { new URL(url); } catch { fail('Invalid project URL.'); } }
    if (typeof input.featured !== 'boolean') fail('Invalid featured switch.');
    if (input.featured && projects.filter(p => p.featured && p.id !== previous?.id).length >= 6) fail('Only six projects can appear on the index. Turn one off first.', 409);
    let image = previous?.image;
    if (input.photo) {
        const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input.photo);
        if (!match) fail('Use a PNG, JPEG, or WebP photo.');
        const bytes = Buffer.from(match[2], 'base64');
        if (!bytes.length || bytes.length > 5 * 1024 * 1024) fail('Photo must be smaller than 5 MB.');
        const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
        if (!valid) fail('This photo is not a valid image.');
        image = `/uploads/${randomUUID()}.${match[1]}`;
        await writeFile(path.join(data, image), bytes);
    }
    if (!image) fail('Please upload a project photo.');
    return { id: previous?.id || randomUUID(), name, category, description, url, image, featured: input.featured };
}
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json' };
// Serialize writes so concurrent edits cannot bypass the six-project limit.
let queue = Promise.resolve();
http.createServer(async (req, res) => {
    const json = (status, value, headers = {}) => { res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store', ...headers }); res.end(JSON.stringify(value)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
        const url = new URL(req.url, 'http://localhost');
        const adminHost = req.headers.host === new URL(adminOrigin).host;
        if (url.pathname.startsWith('/api/')) {
            if (url.pathname === '/api/projects' && req.method === 'GET') return json(200, projects);
            if (!adminHost) return json(404, { error:'Not found.' });
            if (req.method !== 'GET' && req.headers.origin !== adminOrigin) return json(403, { error:'Invalid request origin.' });
            if (url.pathname === '/api/login' && req.method === 'POST') {
                const ip = req.socket.remoteAddress;
                const now = Date.now();
                const attempt = attempts.get(ip) || { count:0, until:now + 15 * 60 * 1000 };
                if (attempt.until < now) { attempt.count = 0; attempt.until = now + 15 * 60 * 1000; }
                if (attempt.count >= 10) return json(429, { error:'Too many attempts. Try again in 15 minutes.' });
                const input = await body(req);
                attempt.count++; attempts.set(ip, attempt);
                if (typeof input.password !== 'string' || input.password.length > 1024 || !timingSafeEqual(scryptSync(input.password, salt, 64), passwordHash)) return json(401, { error:'Incorrect password.' });
                attempts.delete(ip);
                for (const [token, expiry] of sessions) if (expiry < now) sessions.delete(token);
                const token = randomBytes(32).toString('hex'); sessions.set(token, now + 28800000);
                return json(200, { ok:true }, { 'Set-Cookie':cookie(token) });
            }
            if (!authenticated(req)) return json(401, { error:'Please sign in.' });
            if (url.pathname === '/api/session' && req.method === 'GET') return json(200, { ok:true });
            if (url.pathname === '/api/logout' && req.method === 'POST') {
                sessions.delete(/(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie || '')?.[1]);
                return json(200, { ok:true }, { 'Set-Cookie':cookie('') });
            }
            const id = /^\/api\/projects\/([a-zA-Z0-9-]+)$/.exec(url.pathname)?.[1];
            if ((url.pathname === '/api/projects' && req.method === 'POST') || (id && ['PUT','DELETE'].includes(req.method))) {
                const input = req.method === 'DELETE' ? null : await body(req);
                const operation = queue.then(async () => {
                    const previous = id && projects.find(p => p.id === id);
                    if (id && !previous) fail('Project not found.', 404);
                    if (req.method === 'DELETE') { await persist(projects.filter(p => p.id !== id)); return { ok:true }; }
                    const project = await validate(input, previous);
                    await persist(previous ? projects.map(p => p.id === id ? project : p) : [project, ...projects]);
                    return project;
                });
                queue = operation.catch(() => {});
                return json(200, await operation);
            }
            return json(404, { error:'Not found.' });
        }
        if (!['GET','HEAD'].includes(req.method)) return json(405, { error:'Method not allowed.' });
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/') pathname = adminHost && adminOrigin !== publicOrigin ? '/admin.html' : '/index.html';
        if (pathname === '/admin.html' && !adminHost) return json(404, { error:'Not found.' });
        const uploads = pathname.startsWith('/uploads/');
        if (!uploads && !/^\/(index\.html|projects\.html|admin\.html|projects\.seed\.json|site\.webmanifest|favicon[^/]*|apple-touch-icon\.png|android-chrome-[^/]+|(?:css|js|images)\/.*)$/.test(pathname)) return json(404, { error:'Not found.' });
        const base = uploads ? path.join(data, 'uploads') : site;
        const file = path.resolve(base, uploads ? pathname.slice(9) : '.' + pathname);
        if (!file.startsWith(base + path.sep)) return json(404, { error:'Not found.' });
        const content = await readFile(file);
        res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', ...(pathname === '/admin.html' ? { 'X-Robots-Tag':'noindex, nofollow' } : {}) });
        res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { json(error.status || (error.code === 'ENOENT' ? 404 : 500), { error:error.status ? error.message : error.code === 'ENOENT' ? 'Not found.' : 'Unable to save or load projects.' }); }
}).listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('Portfolio running on port ' + (process.env.PORT || 3000)));
