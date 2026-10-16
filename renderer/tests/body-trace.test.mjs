import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BodyTrace} from '../src/body-trace.js';
const pose={pitch:.1,yaw:.2,roll:.3,privateData:'exclude'};
const q={x:0,y:0,z:0,w:1};
test('body diagnosis captures numeric stages once per observation and stops after 20 seconds',()=>{
 const batches=[],trace=new BodyTrace(value=>batches.push(value));
 trace.start(0);
 for(let i=0;i<200;i++){
  trace.observe(i*100,i*100,pose,pose,pose,pose,q);
  trace.observe(i*100,i*100+16,pose,pose,pose,pose,q);
 }
 trace.observe(20000,20000,pose,pose,pose,pose,q);
 trace.observe(20100,20100,pose,pose,pose,pose,q);
 assert.equal(batches.flatMap(b=>b.samples).length,200);
 assert.ok(batches.every(b=>b.samples.length<=20));
 assert.ok(!JSON.stringify(batches).includes('privateData'));
 trace.start(30000);trace.observe(30000,30000,pose,pose,pose,pose,q);trace.observe(50000,50000,pose,pose,pose,pose,q);
 assert.equal(batches.at(-1).samples.length,1);
});
test('missing observations are rate limited and recorded separately from measured neutral',()=>{
 const batches=[],trace=new BodyTrace(value=>batches.push(value));trace.start(0);
 for(let i=0;i<100;i++)trace.observe(undefined,i,null,null,pose,pose,q);
 trace.observe(undefined,20000,null,null,pose,pose,q);
 assert.equal(batches[0].samples.length,1);assert.equal(batches[0].samples[0].raw,null);
 assert.equal(batches[0].samples[0].ageMs,null);
});
