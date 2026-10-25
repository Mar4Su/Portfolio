import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, securityHeaders } from './functions/api.js';
import { fileStore } from './scripts/file-store.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root,'public');
const adminDir = path.join(root,'admin');
const publicOrigin = process.env.PUBLIC_ORIGIN || 'http://localhost:3000';
const adminOrigin = process.env.ADMIN_ORIGIN || 'http://localhost:3000';
const seed = JSON.parse(await readFile(path.join(root,'functions/seed.json'),'utf8'));
const store = await fileStore(path.resolve(process.env.DATA_DIR || path.join(root,'data')),seed);
const api = createApi({ store,password:process.env.ADMIN_PASSWORD,adminOrigins:[adminOrigin],secure:process.env.COOKIE_SECURE === 'true',requireAdminHost:true });
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.txt':'text/plain','.xml':'application/xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json' };
const server = http.createServer(async (req,res) => {
    securityHeaders(res);
    try {
        const url = new URL(req.url,'http://localhost');
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return await api(req,res);
        if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
        let pathname = decodeURIComponent(url.pathname);
        const isAdmin = req.headers.host === new URL(adminOrigin).host;
        let base = publicDir;
        if (pathname === '/admin.html' || (pathname === '/' && isAdmin && adminOrigin !== publicOrigin)) {
            if (!isAdmin) { res.writeHead(404); return res.end(); }
            base = adminDir; pathname = '/index.html';
        } else if (pathname === '/admin.js') {
            if (!isAdmin) { res.writeHead(404); return res.end(); }
            base = adminDir;
        } else if (pathname === '/projects.seed.json') {
            res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify(seed));
        }
        if (pathname === '/') pathname = '/index.html';
        const file = path.resolve(base,'.'+pathname);
        if (!file.startsWith(base+path.sep) || pathname.split('/').some(part=>part.startsWith('.'))) { res.writeHead(404); return res.end(); }
        const bytes = await readFile(file);
        res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream',...(base===adminDir?{'X-Robots-Tag':'noindex, nofollow'}:{})});
        res.end(req.method==='HEAD'?undefined:bytes);
    } catch { res.writeHead(404); res.end('Not found.'); }
});
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',()=>console.log('Portfolio running on port '+(process.env.PORT || 3000)));
