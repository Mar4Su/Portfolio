import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'node:fs';
import { createApi } from './api.js';
import { firebaseStore } from './firestore-store.js';

initializeApp();
const password = defineSecret('ADMIN_PASSWORD');
const publicOrigin = defineString('PUBLIC_ORIGIN', { default:'https://marasu.tech' });
const adminOrigin = defineString('ADMIN_ORIGIN', { default:'https://admin.marasu.tech' });
const storageBucket = defineString('STORAGE_BUCKET', { default:'portfolio-marasu.firebasestorage.app' });
const seed = JSON.parse(readFileSync(new URL('./seed.json',import.meta.url),'utf8'));
let handler;
export const portfolioApi = onRequest({
    region:'asia-east1',
    secrets:[password],
    memory:'512MiB',
    timeoutSeconds:60,
    minInstances:0,
    maxInstances:3,
    concurrency:4,
    invoker:'public',
    cors:false
}, async (req,res) => {
    // Access secrets only at runtime, never during deployment discovery.
    if (!handler) {
        const store = firebaseStore(getFirestore(), getStorage().bucket(storageBucket.value()), seed);
        handler = createApi({ store, password:password.value(), adminOrigins:[
            adminOrigin.value(),
            'https://portfolio-marasu-admin.web.app',
            'https://portfolio-marasu-admin.firebaseapp.com'
        ], secure:true });
        // Read the parameter so deployment documents the public origin alongside admin.
        new URL(publicOrigin.value());
    }
    return handler(req,res);
});
