import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Euler} from 'three';
import {QuaternionDamping} from '../src/quaternion-damping.js';
import {smoothingAlpha} from '../src/rig-math.js';
const turn=y=>new Quaternion().setFromEuler(new Euler(0,y,0));
test('rotation eases into a new observation instead of making an immediate velocity jump',()=>{
 const q=turn(0),goal=turn(.6),filter=new QuaternionDamping();
 filter.update(q,goal,1/60,.7);
 assert.ok(q.angleTo(turn(0))<.6*smoothingAlpha(.7,1/60));
 let error=q.angleTo(goal);
 for(let i=1;i<60;i++){filter.update(q,goal,1/60,.7);const next=q.angleTo(goal);assert.ok(next<=error+1e-7);error=next;}
 assert.ok(error<1e-5);
});
test('30fps and 60fps have comparable response without changing the authored goal',()=>{
 const results=[30,60].map(fps=>{const q=turn(0),filter=new QuaternionDamping();for(let i=0;i<fps*.2;i++)filter.update(q,turn(.6),1/fps,.7);return q;});
 assert.ok(results[0].angleTo(results[1])<.01);
 for(const q of results)assert.ok(q.angleTo(turn(.6))<.02);
});
test('reversals and opposite quaternion signs stay finite and normalized',()=>{
 const q=turn(0),filter=new QuaternionDamping();
 for(let i=0;i<200;i++){
  const goal=turn(i%60<30?.8:-.8);if(i%2)goal.set(-goal.x,-goal.y,-goal.z,-goal.w);
  filter.update(q,goal,1/60,.7);
  assert.ok(q.toArray().every(Number.isFinite));assert.ok(Math.abs(q.length()-1)<1e-10);assert.ok(q.angleTo(turn(0))<1);
 }
});
test('stationary targets remain stationary and smoothness still controls responsiveness',()=>{
 const q=turn(.3),filter=new QuaternionDamping();
 for(let i=0;i<60;i++)filter.update(q,turn(.3),1/60,.7);
 assert.ok(q.angleTo(turn(.3))<1e-7);
 const errors=[.2,.9].map(smoothing=>{const q=turn(0),filter=new QuaternionDamping();for(let i=0;i<6;i++)filter.update(q,turn(.6),1/60,smoothing);return q.angleTo(turn(.6));});
 assert.ok(errors[0]<errors[1]);
});
