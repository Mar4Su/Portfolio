import { Timestamp } from 'firebase-admin/firestore';
import { fail } from './api.js';
import { nextProject } from './project-state.js';

export function firebaseStore(db, bucket, seeds) {
    const projects = db.collection('portfolioProjects');
    const state = db.doc('portfolioSettings/projects');
    async function initialize() {
        await db.runTransaction(async tx => {
            if ((await tx.get(state)).exists) return;
            seeds.forEach((project,i) => tx.set(projects.doc(project.id), { ...project, createdAt:seeds.length - i }));
            tx.set(state, { featuredIds:seeds.filter(p => p.featured).map(p => p.id) });
        });
    }
    let ready;
    async function ensure() {
        if (!ready) ready = initialize().catch(error => { ready = undefined; throw error; });
        await ready;
    }
    return {
        async list() { await ensure(); return (await projects.orderBy('createdAt','desc').get()).docs.map(doc => doc.data()); },
        async save(id, input, creating) {
            await ensure();
            return db.runTransaction(async tx => {
                const [settings, existing] = await Promise.all([tx.get(state),tx.get(projects.doc(id))]);
                const previous = existing.data();
                const next = nextProject(id,input,previous,settings.data().featuredIds,creating);
                tx.set(projects.doc(id),next.project);
                tx.update(state,{ featuredIds:next.featuredIds });
                return { project:next.project, previous:previous || null };
            });
        },
        async remove(id) {
            await ensure();
            return db.runTransaction(async tx => {
                const [settings, existing] = await Promise.all([tx.get(state),tx.get(projects.doc(id))]);
                if (!existing.exists) fail('Project not found.',404);
                tx.delete(projects.doc(id));
                tx.update(state,{ featuredIds:settings.data().featuredIds.filter(value => value !== id) });
                return existing.data();
            });
        },
        async consumeAttempt(key, now) {
            const ref = db.collection('portfolioLoginAttempts').doc(key);
            await db.runTransaction(async tx => {
                const value = (await tx.get(ref)).data();
                const current = value && value.until > now ? value : { count:0, until:now + 900000 };
                if (current.count >= 10) fail('Too many attempts. Try again in 15 minutes.',429);
                tx.set(ref,{ count:current.count + 1, until:current.until, expiresAt:Timestamp.fromMillis(current.until) });
            });
        },
        async putSession(key, session) { await db.collection('portfolioSessions').doc(key).set({ ...session, expiresAt:Timestamp.fromMillis(session.until) }); },
        async getSession(key) { return (await db.collection('portfolioSessions').doc(key).get()).data(); },
        async deleteSession(key) { await db.collection('portfolioSessions').doc(key).delete(); },
        async writeUpload(name, bytes, type) { await bucket.file('uploads/' + name).save(bytes, { resumable:false, metadata:{ contentType:type, cacheControl:'private, max-age=0' } }); },
        async readUpload(name) {
            const file = bucket.file('uploads/' + name);
            const [bytes] = await file.download();
            const extension = name.split('.').pop();
            return { bytes, type:'image/' + extension };
        },
        async deleteUpload(name) { await bucket.file('uploads/' + name).delete({ ignoreNotFound:true }); }
    };
}
