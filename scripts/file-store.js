import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fail } from '../functions/api.js';
import { nextProject } from '../functions/project-state.js';

export async function fileStore(directory, seed) {
    await mkdir(path.join(directory,'uploads'),{ recursive:true });
    const database = path.join(directory,'projects.json');
    let projects;
    try { projects = JSON.parse(await readFile(database,'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; projects = seed; await writeFile(database,JSON.stringify(projects,null,2)); }
    async function persist(next) {
        await writeFile(database + '.tmp',JSON.stringify(next,null,2));
        await rename(database + '.tmp',database); projects = next;
    }
    let queue = Promise.resolve();
    function serial(fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result; }
    const sessions = new Map(), attempts = new Map();
    return {
        async list() { return projects; },
        save(id,input,creating) { return serial(async () => {
            const previous = projects.find(p => p.id === id);
            const { project } = nextProject(id,input,previous,projects.filter(p => p.featured).map(p => p.id),creating);
            await persist(creating ? [project,...projects] : projects.map(p => p.id === id ? project : p));
            return { project, previous };
        }); },
        remove(id) { return serial(async () => {
            const previous = projects.find(p => p.id === id); if (!previous) fail('Project not found.',404);
            await persist(projects.filter(p => p.id !== id)); return previous;
        }); },
        async consumeAttempt(key, now) {
            for (const [id,value] of attempts) if (value.until < now) attempts.delete(id);
            const value = attempts.get(key) || { count:0, until:now + 900000 };
            if (value.count >= 10) fail('Too many attempts. Try again in 15 minutes.',429);
            value.count++; attempts.set(key,value);
        },
        async putSession(key,value) { for (const [id,session] of sessions) if (session.until < Date.now()) sessions.delete(id); sessions.set(key,value); },
        async getSession(key) { return sessions.get(key); },
        async deleteSession(key) { sessions.delete(key); },
        async writeUpload(name,bytes) { await writeFile(path.join(directory,'uploads',name),bytes); },
        async readUpload(name) { return { bytes:await readFile(path.join(directory,'uploads',name)), type:'image/' + name.split('.').pop() }; },
        async deleteUpload(name) { await unlink(path.join(directory,'uploads',name)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    };
}
