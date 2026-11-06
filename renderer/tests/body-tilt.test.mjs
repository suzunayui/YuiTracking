import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {BodyTilt,MAX_BODY_TILT,scaledBodyTilt,shoulderRoll} from '../src/body-tilt.js';
import {linkedBodyRotation} from '../src/head-linked-body.js';

const shoulders=(left,right)=>{const points=[];points[11]=left;points[12]=right;return points;};
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} is not near ${expected}`);

test('level shoulders have no roll and a lowered right shoulder is positive',()=>{
 near(shoulderRoll(shoulders({x:.2,y:-.4},{x:-.2,y:-.4})),0);
 near(shoulderRoll(shoulders({x:.2,y:-.4},{x:-.2,y:0})),Math.PI/4);
 near(shoulderRoll(shoulders({x:.2,y:0},{x:-.2,y:-.4})),-Math.PI/4);
});

test('missing, hidden or edge-on shoulders give no angle',()=>{
 assert.equal(shoulderRoll(null),null);
 assert.equal(shoulderRoll(shoulders({x:.2,y:0},null)),null);
 assert.equal(shoulderRoll(shoulders({x:.2,y:0,visibility:.2},{x:-.2,y:0,visibility:.9})),null);
 assert.equal(shoulderRoll(shoulders({x:.02,y:0},{x:-.02,y:.1})),null);
});

test('strength scales the tilt, zero turns it off, and the result is limited',()=>{
 near(scaledBodyTilt(.2,2),.4);
 near(scaledBodyTilt(.1,5),.5);
 assert.equal(scaledBodyTilt(.2,0),0);
 near(scaledBodyTilt(2,3),MAX_BODY_TILT);
 near(scaledBodyTilt(-2,3),-MAX_BODY_TILT);
});

test('calibration makes the current shoulder angle level',()=>{
 const tilt=new BodyTilt();
 tilt.update(.3,100,100);
 tilt.calibrate();
 assert.equal(tilt.value,0);
 near(tilt.update(.3,200,200),0);
 assert.ok(tilt.update(.5,300,300)>0,'moving past the reference tilts the body');
});

test('tilt follows new observations and ignores repeated ones',()=>{
 const tilt=new BodyTilt();
 let now=0,value=0;
 for(let i=1;i<=30;i++){now+=100;value=tilt.update(.2,now,now);}
 near(value,.2,.02);
 near(tilt.update(.9,now,now+16),value,.01);
});

test('losing the shoulders holds briefly and then eases back to level',()=>{
 const tilt=new BodyTilt();
 let now=0;
 for(let i=1;i<=30;i++){now+=100;tilt.update(.2,now,now);}
 const before=tilt.value;
 near(tilt.update(null,now,now+100),before,.02);
 let value=before;
 for(let t=now+400;t<=now+3000;t+=16)value=tilt.update(null,now,t);
 assert.ok(Math.abs(value)<.001,`${value} should have returned to level`);
});

test('a new recognition result glides over several display frames instead of jumping',()=>{
 const tilt=new BodyTilt();
 let now=0;
 for(let i=1;i<=60;i++){now+=33;tilt.update(0,now,now);}
 // One sample could be a spike, so the second one starts the movement.
 tilt.update(.3,now+33,now+33);now+=33;
 tilt.update(.3,now+33,now+33);now+=33;
 let previous=tilt.value,largest=0;
 for(let frame=1;frame<=4;frame++){now+=16;const value=tilt.update(.3,now-frame*16,now);largest=Math.max(largest,Math.abs(value-previous));previous=value;}
 assert.ok(largest<.06,`largest frame step ${largest}`);
 assert.ok(previous>0,'still moves toward the result');
});

test('shoulder noise is reduced even at high strength',()=>{
 const tilt=new BodyTilt();
 let now=0,previous=0,largest=0;
 for(let i=0;i<300;i++){
  now+=33;
  const value=scaledBodyTilt(tilt.update(.1+(i%2?.01:-.01),now,now),5);
  if(i>120)largest=Math.max(largest,Math.abs(value-previous));
  previous=value;
 }
 assert.ok(largest<.02,`largest step at five times ${largest}`);
});

test('a recorded still person does not move the avatar, and recorded leans do',()=>{
 const windows=JSON.parse(readFileSync(new URL('./fixtures/shoulder-roll-recording.json',import.meta.url),'utf8'));
 const tilt=new BodyTilt();
 const DEGREE=Math.PI/180,spans=[],peaks=[];
 let time=0,now=0;
 windows.forEach((samples,index)=>{
  let low=Infinity,high=-Infinity;
  for(const sample of samples){
   time+=3000/samples.length;
   for(;now<time;now+=16.67){const value=tilt.update(sample*DEGREE,time,now)/DEGREE;low=Math.min(low,value);high=Math.max(high,value);}
  }
  spans[index]=high-low;peaks[index]=[low,high];
 });
 // Windows 1-12 and 19-41 were recorded sitting still; the person leaned during 13-17.
 for(const index of spans.keys())if(index>=1&&index<=12||index>=19)assert.ok(spans[index]<.001,`moved ${spans[index]} degrees in still window ${index}`);
 assert.ok(peaks[14][0]<-5,'follows the lean to the left');
 assert.ok(Math.max(peaks[16][1],peaks[17][1])>6,'follows the lean to the right');
});

test('a recorded lean moves without a staircase of stops and starts',()=>{
 const windows=JSON.parse(readFileSync(new URL('./fixtures/shoulder-roll-recording.json',import.meta.url),'utf8'));
 const tilt=new BodyTilt();
 const DEGREE=Math.PI/180;
 let time=0,now=0,previous=0,previousStep=0,kink=0;
 windows.forEach((samples,index)=>{
  for(const sample of samples){
   time+=3000/samples.length;
   for(;now<time;now+=16.67){
    const value=tilt.update(sample*DEGREE,time,now)/DEGREE,step=value-previous;
    if(index>=13&&index<=17)kink=Math.max(kink,Math.abs(step-previousStep));
    previous=value;previousStep=step;
   }
  }
 });
 assert.ok(kink<.15,`largest change of speed between frames is ${kink} degrees`);
});

test('a slight shift of about two degrees is treated as sitting still',()=>{
 const tilt=new BodyTilt();
 let now=0;
 for(let i=0;i<120;i++){now+=100;tilt.update(i>60?.035:0,now,now);}
 assert.equal(tilt.value,0);
});

test('sitting back up ends exactly level despite a little noise',()=>{
 const tilt=new BodyTilt();
 let now=0;
 for(let i=0;i<40;i++){now+=100;tilt.update(.15,now,now);}
 for(let i=0;i<60;i++){now+=100;tilt.update(.01+(i%2?.005:-.005),now,now);}
 near(tilt.value,0,.0005);
});

test('a still body does not move at all at five times, even with shoulder noise',()=>{
 const tilt=new BodyTilt();
 let now=0,previous=null;
 for(let i=0;i<600;i++){
  now+=33;
  const noise=[.002,-.003,.001,.003,-.002,-.001][i%6];
  const value=scaledBodyTilt(tilt.update(noise,now,now),5);
  if(i>30){if(previous!==null)assert.ok(Math.abs(value-previous)<.002,`moved ${value-previous} at sample ${i}`);previous=value;}
 }
});

test('a light lean is followed all the way without a leftover offset',()=>{
 const tilt=new BodyTilt();
 let now=0;
 for(let i=0;i<60;i++){now+=33;tilt.update(0,now,now);}
 for(let i=0;i<60;i++){now+=33;tilt.update(.1,now,now);}
 near(tilt.value,.1,.003);
 for(let i=0;i<60;i++){now+=33;tilt.update(0,now,now);}
 near(tilt.value,0,.003);
});

test('reset clears the reference and the value',()=>{
 const tilt=new BodyTilt();
 tilt.update(.3,100,100);tilt.calibrate();tilt.reset();
 assert.equal(tilt.value,0);assert.equal(tilt.neutral,0);assert.equal(tilt.raw,null);
});

test('a positive tilt leans the avatar toward the viewer\'s right in both model orientations',()=>{
 for(const basis of [new Quaternion(),new Quaternion(0,1,0,0)]){
  const body=linkedBodyRotation(new Quaternion(),0,basis,1,.3);
  const world=basis.clone().multiply(body).multiply(basis.clone().invert());
  const up=new Vector3(0,1,0).applyQuaternion(world);
  assert.ok(up.x>.2,`up.x ${up.x}`);
  near(up.z,0);
 }
});

test('zero tilt leaves the existing body rotation unchanged',()=>{
 const head=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.4);
 const basis=new Quaternion(0,1,0,0);
 assert.deepEqual(linkedBodyRotation(head,.1,basis,1,0).toArray(),linkedBodyRotation(head,.1,basis,1).toArray());
});
