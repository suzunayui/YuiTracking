import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Quaternion} from 'three';
import {RotationStabilizer} from '../src/rotation-stabilizer.js';
import {BodyStabilizer} from '../src/body-stabilizer.js';

// Repeatable correlated camera-like noise, not just alternating single spikes.
// Units: radians and seconds. These bounds include both the hold gate and 1€.
for(const [name,Filter,hz,jitterLimit,lagLimit] of [
 ['head',RotationStabilizer,20,.45,90],
 ['torso',BodyStabilizer,10,.44,110],
]){
 test(`${name}: suppress correlated still noise while retaining slow, continuous motion`,()=>{
  for(const moving of [false,true]){
   const filter=new Filter();let squared=0,count=0,lag=0,lagCount=0;
   for(let i=0;i<=hz*8;i++){
    const t=i/hz,truth=moving?Math.min(.3,Math.max(0,t-1)*.05):0;
    const raw=truth+.015*Math.sin(2*Math.PI*1.7*t)+.004*Math.sin(2*Math.PI*4.1*t);
    const value=name==='head'
     ?new Euler().setFromQuaternion(filter.update(new Quaternion().setFromEuler(new Euler(0,raw,0)),t*1000),'YXZ').y
     :filter.update({pitch:raw,yaw:0,roll:0},t*1000,t*1000).pitch;
    if(t>=1){squared+=(value-truth)**2;count++;}
    if(moving&&t>=2&&t<=6){lag+=truth-value;lagCount++;}
   }
   if(!moving)assert.ok(Math.sqrt(squared/count)*180/Math.PI<jitterLimit,'Stationary RMS jitter exceeded the angular budget');
   else assert.ok(lag/lagCount/.05*1000<lagLimit,'Smoothing introduced too much lag in a slow turn');
  }
 });
}
