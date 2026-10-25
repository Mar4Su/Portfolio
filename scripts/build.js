import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output = path.resolve(root,'dist');
// Never clean anything outside this repository's generated build directory.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unsafe build output.');
await rm(output,{ recursive:true,force:true });
await mkdir(output,{ recursive:true });
await cp(path.join(root,'public'),path.join(output,'public'),{ recursive:true });
await cp(path.join(root,'admin'),path.join(output,'admin'),{ recursive:true });
for (const folder of ['css','images']) await cp(path.join(root,'public',folder),path.join(output,'admin',folder),{ recursive:true });
await cp(path.join(root,'functions/seed.json'),path.join(output,'public/projects.seed.json'));
await writeFile(path.join(output,'admin/404.html'),await readFile(path.join(root,'public/404.html')));
// New CSS/JS versions bypass copies cached by returning visitors.
for (const site of ['public','admin']) {
    const siteRoot = path.join(output,site);
    for (const filename of ['index.html','projects.html','404.html']) {
        const file = path.join(siteRoot,filename);
        let html;
        try { html = await readFile(file,'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        for (const match of html.matchAll(/(?:href|src)="([^"?]+\.(?:css|js))"/g)) {
            const asset = match[1];
            if (/^(?:https?:)?\/\//.test(asset)) continue;
            const bytes = await readFile(path.join(siteRoot,asset));
            const version = createHash('sha256').update(bytes).digest('hex').slice(0,12);
            html = html.replaceAll(`"${asset}"`,`"${asset}?v=${version}"`);
        }
        await writeFile(file,html);
    }
}
console.log('Built isolated public and admin Hosting sites in dist/.');
