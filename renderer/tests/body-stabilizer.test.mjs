import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BodyStabilizer} from '../src/body-stabilizer.js';
test('slow torso movement follows within 300ms and does not repeatedly stop at hold boundaries',()=>{
 const filter=new BodyStabilizer();let previous=0;
 for(let i=0;i<=30;i++){
  const value=filter.update({pitch:i*.0025,yaw:0,roll:0},i*100,i*100).pitch;
  if(i===3)assert.ok(value>.001);
  if(i>=6)assert.ok(value-previous>.001);
  previous=value;
 }
});
test('torso holds its final position when a deliberate movement stops',()=>{
 const filter=new BodyStabilizer();for(let i=0;i<=30;i++)filter.update({pitch:i*.0025,yaw:0,roll:0},i*100,i*100);
 for(let i=31;i<=60;i++)filter.update({pitch:.075,yaw:0,roll:0},i*100,i*100);
 const held=filter.value.pitch;
 for(let i=61;i<=90;i++)assert.ok(Math.abs(filter.update({pitch:.075+(i%2?.01:-.01),yaw:0,roll:0},i*100,i*100).pitch-held)<1e-6);
});
test('alternating torso noise outside the neutral region does not jerk the body',()=>{
 const filter=new BodyStabilizer();filter.update({pitch:0,yaw:0,roll:0},0,0);
 for(let i=1;i<30;i++)assert.equal(filter.update({pitch:(i%2?1:-1)*.06,yaw:0,roll:0},i*100,i*100).pitch,0);
});
test('a sustained small torso movement remains responsive',()=>{
 const filter=new BodyStabilizer();filter.update({pitch:0,yaw:0,roll:0},0,0);
 assert.equal(filter.update({pitch:.06,yaw:0,roll:0},100,100).pitch,0);
 assert.ok(filter.update({pitch:.06,yaw:0,roll:0},200,200).pitch>.02);
});
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
