import { fail } from './api.js';

// Used inside a Firestore transaction (or the local file-store write queue).
export function nextProject(id, input, previous, featuredIds, creating) {
    if (creating && previous) fail('Project already exists.',409);
    if (!creating && !previous) fail('Project not found.',404);
    const image = input.image || previous?.image;
    if (!image) fail('Please upload a project photo.');
    const nextIds = featuredIds.filter(value => value !== id);
    if (input.featured) nextIds.push(id);
    if (nextIds.length > 6) fail('Only six projects can appear on the index. Turn one off first.',409);
    return { project:{ ...input, id, image, createdAt:previous?.createdAt ?? Date.now() }, featuredIds:nextIds };
}
