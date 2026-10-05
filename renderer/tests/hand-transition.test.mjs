import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandTransition} from '../src/hand-transition.js';
const sample=time=>({landmarks:[{x:.5,y:.5}],time});
test('worker latency does not alternate recognized hands with idle poses',()=>{
 const state=new HandTransition(250);
 const hand={...sample(1000),receivedAt:1120};
 state.update(hand,1120,1/30,.7);
 assert.equal(state.update(hand,1230,1/30,.7).sample,hand);
 const next={...sample(1200),receivedAt:1320};
 assert.equal(state.update(next,1320,1/30,.7).sample,next);
 assert.equal(state.update(next,1590,1/30,.7).sample,null);
 assert.equal(state.update({...sample(1000),receivedAt:1700},1700,1/30,.7).sample,null);
});
test('short recognition gaps hold pose then hands ease back to idle',()=>{
 const state=new HandTransition();const hand=sample(1000);
 state.update(hand,1000,1/30,.7);
 assert.equal(state.update(null,1080,1/30,.7).sample,hand);
 const lost=state.update(null,1150,1/30,.7);
 assert.equal(lost.sample,null);assert.ok(lost.alpha>0&&lost.alpha<.1);
});
test('hands return smoothly after reappearing and each side is independent',()=>{
 const left=new HandTransition(),right=new HandTransition();
 left.update(sample(1000),1000,1/30,.7);left.update(null,1400,1/30,.7);
 const recovered=left.update(sample(1600),1600,1/30,.7);
 assert.ok(recovered.sample&&recovered.alpha<.25);
 assert.equal(right.update(null,1600,1/30,.7).sample,null);
 assert.equal(left.update(sample(1900),1900,1/30,.7).sample.time,1900);
});
test('out-of-frame and stale observations cannot keep hands frozen',()=>{
 const state=new HandTransition();state.update(sample(1000),1000,1/30,.7);
 assert.equal(state.update({...sample(1300),landmarks:[{x:1.2,y:.5}]},1300,1/30,.7).sample,null);
 assert.equal(state.update(sample(1000),1400,1/30,.7).sample,null);
 const a=new HandTransition().update(null,1000,1/30,.7).alpha;
 const b=new HandTransition().update(null,1000,1/60,.7).alpha;
 assert.ok(Math.abs(a-(1-(1-b)**2))<1e-10);
});
