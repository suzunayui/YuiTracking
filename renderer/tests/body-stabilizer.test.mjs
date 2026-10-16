import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BodyStabilizer} from '../src/body-stabilizer.js';
import {bodyPose} from '../src/body-pose.js';
const pose=(yaw=0)=>({pitch:0,yaw,roll:0});

test('shoulder depth noise is attenuated without hold/release discontinuities',()=>{
 const filter=new BodyStabilizer();let inputEnergy=0,outputEnergy=0;
 for(let i=0;i<=200;i++){
  const t=i/10,depth=.006*Math.sin(2*Math.PI*1.7*t)+.0015*Math.sin(2*Math.PI*3.1*t);
  const points=[];points[11]={x:-.2,y:-.5,z:-depth,visibility:1};points[12]={x:.2,y:-.5,z:depth,visibility:1};
  const raw=bodyPose(points),value=filter.update(raw,i*100,i*100);
  if(i>20){inputEnergy+=raw.yaw**2;outputEnergy+=value.yaw**2;}
 }
 assert.ok(Math.sqrt(outputEnergy/inputEnergy)<.5,'Reduce correlated yaw jitter by at least half on this trace');
});

test('tiny slow movement starts on the first observation and never freezes at a threshold',()=>{
 for(const axis of ['pitch','yaw','roll'])for(const sign of [-1,1]){
  const filter=new BodyStabilizer();let previous=0;filter.update(pose(),0,0);
  for(let i=1;i<=80;i++){
   const raw=i*.001*sign,observation={...pose(),[axis]:raw};
   const value=filter.update(observation,i*100,i*100)[axis]*sign;
   assert.ok(value>previous&&value<=raw*sign,'Every observation must contribute without fixed plateaus');
   if(i>10)assert.ok(raw*sign-value<.004,'Steady lag below 400ms at 0.01 radians/second');
   previous=value;
  }
 }
});

test('ordinary yaw and reversals respond promptly without overshoot',()=>{
 const filter=new BodyStabilizer();filter.update(pose(),0,0);
 assert.ok(filter.update(pose(.3),100,100).yaw>.2);
 assert.ok(filter.update(pose(-.3),200,200).yaw<-.15);
 let previous=filter.value.yaw;
 for(let i=3;i<=60;i++){
  const value=filter.update(pose(-.3),i*100,i*100).yaw;
  assert.ok(value>=-.3&&value<=previous);previous=value;
 }
 assert.ok(Math.abs(previous+.3)<1e-7);
});

test('stationary input at a leaned pose settles with no self-generated oscillation',()=>{
 const filter=new BodyStabilizer();const input={pitch:.2,yaw:.3,roll:.1};
 for(let i=0;i<=100;i++)assert.deepEqual(filter.update(input,i*100,i*100),input);
});

test('body observation cadence, invalid data and brief loss do not corrupt state',()=>{
 const filter=new BodyStabilizer();filter.update(pose(),0,0);
 const moved=filter.update({pitch:.3,yaw:-.4,roll:.2},100,100);
 assert.ok(moved.pitch>.2&&moved.yaw<-.3&&moved.roll>.15);
 assert.deepEqual(filter.update(pose(1),100,130),moved);
 assert.deepEqual(filter.update(pose(1),50,150),moved);
 assert.deepEqual(filter.update(null,100,200),moved);
 assert.deepEqual(filter.update({pitch:NaN,yaw:NaN,roll:NaN},200,200),moved);
 assert.deepEqual(filter.update(null,200,600),pose());
 assert.deepEqual(filter.update(pose(.1),800,800),pose(.1));
 filter.reset();assert.deepEqual(filter.update(pose(),900,900),pose());
});
