import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BodyStabilizer} from '../src/body-stabilizer.js';
import {bodyPose} from '../src/body-pose.js';

test('stationary shoulder depth oscillation cannot repeatedly unlock torso yaw',()=>{
 const filter=new BodyStabilizer();
 for(let i=0;i<=200;i++){
  const t=i/10,depth=.006*Math.sin(2*Math.PI*1.7*t)+.0015*Math.sin(2*Math.PI*3.1*t);
  const points=[];
  points[11]={x:-.2,y:-.5,z:-depth,visibility:1};
  points[12]={x:.2,y:-.5,z:depth,visibility:1};
  const value=filter.update(bodyPose(points),i*100,i*100);
  assert.equal(value.yaw,0,'Bounded shoulder-depth noise should remain held');
 }
});

test('slow intentional yaw starts within 500ms then follows smoothly in either direction',()=>{
 for(const sign of [-1,1]){
  const filter=new BodyStabilizer();let previous=0;
  for(let i=0;i<=40;i++){
   const raw=sign*i*.005;
   const value=filter.update({pitch:0,yaw:raw,roll:0},i*100,i*100).yaw*sign;
   if(i===5)assert.ok(value>.005,'Do not freeze a slow turn until the full hold boundary');
   if(i>=8)assert.ok(value-previous>.002,'A sustained turn must not advance in steps');
   if(i>=10)assert.ok(raw*sign-value<.015,'Limit steady slow-yaw lag to 300ms');
   previous=value;
  }
 }
});

test('deliberate yaw reversals stay responsive and settle after stopping',()=>{
 const filter=new BodyStabilizer();filter.update({pitch:0,yaw:0,roll:0},0,0);
 assert.ok(filter.update({pitch:0,yaw:.3,roll:0},100,100).yaw>.2);
 assert.ok(filter.update({pitch:0,yaw:-.3,roll:0},200,200).yaw<-.2);
 for(let i=3;i<=40;i++)filter.update({pitch:0,yaw:-.3,roll:0},i*100,i*100);
 const held=filter.value.yaw;
 for(let i=41;i<=140;i++){
  const raw=-.3+.02*Math.sin(2*Math.PI*1.7*i/10);
  assert.ok(Math.abs(filter.update({pitch:0,yaw:raw,roll:0},i*100,i*100).yaw-held)<1e-6);
 }
});
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
