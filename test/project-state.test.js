import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextProject } from '../functions/project-state.js';

test('cloud and local stores share project and featured-limit invariants', () => {
    const ids = ['1','2','3','4','5','6'];
    const input = { name:'Project',category:'Website',description:'Description',url:'',featured:true,image:'/uploads/photo.png' };
    assert.throws(()=>nextProject('7',input,undefined,ids,true),/Only six/);
    const previous = { ...input,id:'1',createdAt:123 };
    const edited = nextProject('1',{...input,name:'Edited'},previous,ids,false);
    assert.equal(edited.featuredIds.length,6);
    assert.equal(edited.project.createdAt,123);
    assert.equal(nextProject('1',{...input,featured:false},previous,ids,false).featuredIds.length,5);
    assert.throws(()=>nextProject('new',input,undefined,[],false),/not found/);
    assert.throws(()=>nextProject('1',input,previous,ids,true),/already exists/);
    assert.throws(()=>nextProject('new',{...input,image:undefined},undefined,[],true),/photo/);
});
