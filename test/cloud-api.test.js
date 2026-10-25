import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApi } from '../functions/api.js';
import { fileStore } from '../scripts/file-store.js';

test('cloud-parsed bodies, shared sessions, password rotation and origin protection', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(),'marasu-cloud-test-'));
    const store = await fileStore(directory,[]);
    const origin = 'https://admin.marasu.tech';
    const password = 'test1234';
    const config = { store,password,adminOrigins:[origin],secure:true };
    const handlers = [createApi(config),createApi(config),createApi({...config,password:'rotated-test-only-password-12345'})];
    const server = http.createServer(async (req,res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        req.rawBody = Buffer.concat(chunks);
        const index = Number(req.headers['x-test-instance'] || 0);
        await handlers[index](req,res);
    });
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (route, options = {}) => fetch(base+route,options);
    try {
        const wrongOrigin = await request('/api/login',{method:'POST',headers:{Origin:'https://marasu.tech','Content-Type':'application/json'},body:JSON.stringify({password})});
        assert.equal(wrongOrigin.status,403);
        const login = await request('/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});
        assert.equal(login.status,200);
        const cookie = login.headers.get('set-cookie');
        assert.match(cookie,/^__session=/); assert.match(cookie,/Secure/); assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Strict/);
        assert.doesNotMatch(cookie,/Domain=/);
        const token = cookie.split(';')[0];
        const otherInstance = await request('/api/session',{headers:{Cookie:token,'x-test-instance':'1'}});
        assert.equal(otherInstance.status,200);
        assert.match(otherInstance.headers.get('cache-control'),/no-store/);
        assert.equal((await request('/api/session',{headers:{Cookie:token,'x-test-instance':'2'}})).status,401);
        const malformed = await request('/api/projects',{method:'POST',headers:{Origin:origin,Cookie:token,'Content-Type':'application/json'},body:'null'});
        assert.equal(malformed.status,400);
        assert.equal((await request('/api/logout',{method:'POST',headers:{Origin:origin,Cookie:token}})).status,200);
        assert.equal((await request('/api/session',{headers:{Cookie:token,'x-test-instance':'1'}})).status,401);
        for (let i=0;i<9;i++) await request('/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','x-test-instance':String(i%2)},body:JSON.stringify({password:'wrong'})});
        const limited = await request('/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});
        assert.equal(limited.status,429);
    } finally { await new Promise(resolve=>server.close(resolve)); await rm(directory,{recursive:true,force:true}); }
});
