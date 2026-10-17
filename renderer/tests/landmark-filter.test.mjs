import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LandmarkFilter} from '../src/landmark-filter.js';
const points=x=>[{x,y:.5,z:.1,visibility:.9}];
test('tiny hand movement is filtered immediately instead of discarded',()=>{
 const filter=new LandmarkFilter();filter.update(points(.5),0);
 const value=filter.update(points(.5001),50)[0];assert.ok(value.x>.5&&value.x<.5001);assert.equal(value.visibility,.9);
});
test('hand noise is reduced and normal movement follows without candidate confirmation',()=>{
 const filter=new LandmarkFilter();filter.update(points(.5),0);let energy=0;
 for(let i=1;i<=100;i++){
  const value=filter.update(points(.5+(i%2?.004:-.004)),i*50)[0].x;
  if(i>50)energy+=(value-.5)**2;
 }
 assert.ok(Math.sqrt(energy/50)<.002);
 filter.update(points(.6),5100);filter.update(points(.6),5150);
 assert.ok(filter.update(points(.6),5200)[0].x>.58);
});
test('hand duplicates, invalid observations and reset cannot introduce jumps or NaN',()=>{
 const filter=new LandmarkFilter();filter.update(points(.5),0);const value=filter.update(points(.6),50);
 assert.deepEqual(filter.update(points(.9),50),value);assert.deepEqual(filter.update(points(.9),25),value);
 assert.ok(Number.isFinite(filter.update(points(NaN),100)[0].x));
 assert.equal(filter.update(null,150),null);assert.deepEqual(filter.update(points(.2),200),points(.2));
});
