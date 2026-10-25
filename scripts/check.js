import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
async function walk(folder) {
    const result = [];
    for (const entry of await readdir(folder,{ withFileTypes:true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.env')) continue;
        const file = path.join(folder,entry.name);
        if (entry.isDirectory()) result.push(...await walk(file)); else result.push(file);
    }
    return result;
}
for (const folder of ['functions','scripts','public/js','admin','test']) {
    for (const file of await walk(folder)) if (file.endsWith('.js')) {
        const result = spawnSync(process.execPath,['--check',file],{ encoding:'utf8' });
        assert.equal(result.status,0,result.stderr);
    }
}
const seed = JSON.parse(await readFile('functions/seed.json','utf8'));
assert.ok(seed.filter(p=>p.featured).length <= 6);
for (const project of seed) await access(path.join('public',project.image));
for (const example of ['.env.example','functions/.env.example']) {
    const value = await readFile(example,'utf8');
    assert.ok(!/^ADMIN_PASSWORD=(?!replace-with-).+/m.test(value),'Examples must never contain a real password.');
}
await import('./build.js');
for (const site of ['public','admin']) {
    for (const file of await walk(path.join('dist',site))) {
        assert.ok(!/(?:server\.js|api\.js|package(?:-lock)?\.json|\.env|\.key|\.pem)$/.test(file),'Private file in Hosting build: '+file);
        if (!file.endsWith('.html')) continue;
        const html = await readFile(file,'utf8');
        assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html),'Inline script blocked by CSP: '+file);
        for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
            const ref = match[1].split(/[?#]/)[0];
            if (/^(?:https?:|mailto:|tel:|data:)/.test(ref)) continue;
            const target = ref.startsWith('/') ? path.join('dist',site,ref) : path.resolve(path.dirname(file),ref);
            // Shared error page points back to the public portfolio on the admin site.
            if (site==='admin' && ref==='/index.html') continue;
            await access(target);
        }
    }
}
await assert.rejects(access('dist/public/admin.html'));
await assert.rejects(access('dist/public/admin.js'));
console.log('Syntax, links, seed photos, config examples and Hosting isolation checks passed.');
