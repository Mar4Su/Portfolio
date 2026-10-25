import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import http from 'node:http';

test('authenticated project lifecycle, feature limit, host isolation and persistence', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'marasu-test-'));
    const port = 14000 + Math.floor(Math.random() * 20000);
    const base = `http://127.0.0.1:${port}`;
    const admin = `http://admin.localhost:${port}`;
    const password = 'test-password-only-123456789';
    const env = { ...process.env, PORT:String(port), HOST:'127.0.0.1', ADMIN_PASSWORD:password, DATA_DIR:directory, PUBLIC_ORIGIN:base, ADMIN_ORIGIN:admin, COOKIE_SECURE:'false' };
    let child;
    async function start() {
        child = spawn(process.execPath,['server.js'],{ env, stdio:['ignore','pipe','pipe'] });
        await Promise.race([once(child.stdout,'data'), once(child,'exit').then(() => { throw new Error('Server did not start'); })]);
    }
    async function stop() { const done = once(child,'exit'); child.kill(); await done; }
    let cookie = '';
    async function request(route, method='GET', body, onAdmin=true) {
        const headers = { ...(onAdmin ? { Host:`admin.localhost:${port}`, Origin:admin } : {}), ...(cookie ? { Cookie:cookie } : {}) };
        if (body) headers['Content-Type'] = 'application/json';
        return new Promise((resolve,reject) => {
            const req = http.request(base+route,{ method, headers },res => {
                const chunks=[]; res.on('data',chunk=>chunks.push(chunk));
                res.on('end',()=> { const value=Buffer.concat(chunks).toString(); resolve({status:res.statusCode,headers:{get:key=>Array.isArray(res.headers[key])?res.headers[key].join('; '):res.headers[key]},text:async()=>value,json:async()=>JSON.parse(value)}); });
            });
            req.on('error',reject); req.end(body ? JSON.stringify(body) : undefined);
        });
    }
    try {
        await start();
        assert.match(await (await request('/')).text(), /Private studio/);
        assert.equal((await request('/admin.html','GET',undefined,false)).status,404);
        assert.equal((await request('/server.js')).status,404);
        assert.equal((await request('/api/projects','POST',{})).status,401);
        assert.equal((await request('/api/login','POST',{password:'wrong'})).status,401);
        const login = await request('/api/login','POST',{password});
        assert.equal(login.status,200); cookie=login.headers.get('set-cookie').split(';')[0];
        assert.match(login.headers.get('set-cookie'), /HttpOnly/);
        let projects=await (await request('/api/projects')).json();
        assert.equal(projects.filter(p=>p.featured).length,6);
        const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4S8AAAAASUVORK5CYII=';
        const input={name:'New project',category:'Website',description:'A test project',url:'https://example.com',featured:true,photo};
        assert.equal((await request('/api/projects','POST',input)).status,409);
        assert.equal((await request('/api/projects/'+projects[0].id,'PUT',{...projects[0],featured:false})).status,200);
        const create=await request('/api/projects','POST',input); assert.equal(create.status,201);
        const added=await create.json();
        assert.equal((await request(added.image,'GET',undefined,false)).status,200);
        assert.equal((await request('/api/projects/'+added.id,'PUT',{...added,url:'javascript:alert(1)'})).status,400);
        // Concurrent feature changes must never allow more than six.
        const attempts=await Promise.all([request('/api/projects/'+projects[0].id,'PUT',{...projects[0],featured:true}),request('/api/projects/'+added.id,'PUT',{...added,featured:true})]);
        assert.equal(attempts[0].status,409); assert.equal(attempts[1].status,200);
        assert.equal((await request('/api/projects','POST',input,false)).status,404);
        await stop(); await start(); cookie='';
        projects=await (await request('/api/projects')).json();
        assert.ok(projects.some(p=>p.id===added.id));
        assert.equal(projects.filter(p=>p.featured).length,6);
        assert.equal((await request('/api/session')).status,401);
        const again=await request('/api/login','POST',{password}); cookie=again.headers.get('set-cookie').split(';')[0];
        assert.equal((await request('/api/projects/'+added.id,'DELETE')).status,200);
        assert.equal((await request('/api/logout','POST',{})).status,200);
        assert.equal((await request('/api/session')).status,401);
    } finally { if(child && child.exitCode===null) await stop(); await rm(directory,{recursive:true,force:true}); }
});
