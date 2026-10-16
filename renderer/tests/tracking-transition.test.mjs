import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TrackingTransition} from '../src/tracking-transition.js';

test('brief dropout holds the pose then sustained loss eases toward idle even at zero smoothing',()=>{
 const state=new TrackingTransition();state.update(true,0,0,1/60,1);
 assert.deepEqual(state.update(false,undefined,100,1/60,1),{mode:'hold',alpha:0});
 const idle=state.update(false,undefined,200,1/60,1);
 assert.equal(idle.mode,'idle');assert.ok(idle.alpha>0&&idle.alpha<.1);
 const resumed=state.update(true,250,250,1/60,1);
 assert.equal(resumed.mode,'tracked');assert.ok(resumed.alpha>0&&resumed.alpha<.2);
 assert.equal(state.update(true,800,800,1/60,1).alpha,1,'Stable tracking recovers its original response');
});

test('stalled results expire and left/right state does not leak between hands',()=>{
 const left=new TrackingTransition(),right=new TrackingTransition();
 left.update(true,0,0,1/60,.33);right.update(true,0,0,1/60,.33);
 assert.equal(left.update(true,0,350,1/60,.33).mode,'idle');
 assert.equal(right.update(true,350,350,1/60,.33).mode,'tracked');
 assert.equal(left.update(true,1000,400,1/60,.33).mode,'idle','Reject a future observation');
 left.reset();assert.equal(left.update(false,undefined,450,1/60,.33).mode,'idle');
});

test('leaving the desk bypasses holding and idle easing has the same elapsed-time response at 30/60fps',()=>{
 const state=new TrackingTransition();state.update(true,0,0,1/60,1);
 assert.equal(state.update(false,undefined,50,1/60,1,true).mode,'idle');
 const remaining=[30,60].map(fps=>{
  const transition=new TrackingTransition();let value=1;
  for(let i=0;i<fps;i++)value*=1-transition.update(false,undefined,i*1000/fps,1/fps,1).alpha;
  return value;
 });
 assert.ok(Math.abs(remaining[0]-remaining[1])<1e-12);
});
