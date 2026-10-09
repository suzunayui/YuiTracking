import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BodyStabilizer} from '../src/body-stabilizer.js';
test('stationary shoulder and depth noise does not rotate the torso',()=>{
 const filter=new BodyStabilizer();
 for(let i=0;i<50;i++){
  const sign=i%2?1:-1;
  assert.deepEqual(filter.update({pitch:sign*.02,yaw:sign*.04,roll:sign*.015},i*100,i*100),{pitch:0,yaw:0,roll:0});
 }
});
test('intentional turns remain responsive and repeated rendering does not refilter',()=>{
 const filter=new BodyStabilizer();filter.update({pitch:0,yaw:0,roll:0},0,0);
 const moved=filter.update({pitch:.3,yaw:-.4,roll:.2},100,100);
 assert.ok(moved.pitch>.2&&moved.yaw<-.3&&moved.roll>.15);
 assert.deepEqual(filter.update({pitch:.3,yaw:-.4,roll:.2},100,130),moved);
 assert.deepEqual(filter.update(null,100,200),moved);
 assert.deepEqual(filter.update(null,100,500),{pitch:0,yaw:0,roll:0});
 filter.reset();assert.deepEqual(filter.update({pitch:0,yaw:0,roll:0},600,600),{pitch:0,yaw:0,roll:0});
});

test('stationary noise around a leaning pose stays anchored',()=>{
 const filter=new BodyStabilizer();
 for(let i=0;i<60;i++)filter.update({pitch:.2,yaw:.3,roll:.1},i*100,i*100);
 const held=filter.update({pitch:.2,yaw:.3,roll:.1},6000,6000);
 for(let i=1;i<30;i++){
  const sign=i%2?1:-1;
  const result=filter.update({pitch:.2+sign*.01,yaw:.3+sign*.015,roll:.1+sign*.008},6000+i*100,6000+i*100);
  for(const axis of ['pitch','yaw','roll'])assert.ok(Math.abs(result[axis]-held[axis])<1e-6);
 }
});
