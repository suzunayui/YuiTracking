import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Quaternion} from 'three';
import {OneEuroFilter,QuaternionOneEuroFilter} from '../src/one-euro-filter.js';
const rotation=angle=>new Quaternion().setFromEuler(new Euler(0,angle,0));

test('stationary measurement noise is attenuated without accumulating drift',()=>{
 const filter=new OneEuroFilter();filter.update(0,0);let sum=0;
 for(let i=1;i<=200;i++){
  const value=filter.update(i%2?.01:-.01,i*50);
  if(i>100)sum+=value*value;
 }
 assert.ok(Math.sqrt(sum/100)<.003,'At least 70% RMS jitter reduction on alternating input noise');
});

test('speed adaptation follows quick movement faster than fixed low-pass smoothing',()=>{
 const adaptive=new OneEuroFilter(),fixed=new OneEuroFilter({beta:0});
 adaptive.update(0,0);fixed.update(0,0);
 const moved=adaptive.update(.3,100),slow=fixed.update(.3,100);
 assert.ok(moved>.2&&moved>slow+.08);
 for(let i=2;i<=20;i++)assert.ok(adaptive.update(.3,i*100)<=.3,'A stop must not overshoot');
});

test('slow motion remains continuous across observation rates and direction changes',()=>{
 for(const hz of [10,20,30]){
  const filter=new OneEuroFilter();let previous=filter.update(0,0);
  for(let i=1;i<=hz*2;i++){
   const raw=.04*i/hz,value=filter.update(raw,1000*i/hz);
   assert.ok(value>previous&&value<=raw);previous=value;
  }
  assert.ok(previous>.07,'Slow turns must not be frozen');
  for(let i=1;i<=hz*2;i++)previous=filter.update(.08-.04*i/hz,2000+1000*i/hz);
  assert.ok(previous<.01,'Reversals must follow back to neutral');
 }
});

test('invalid, duplicate and older observations do not advance filter state',()=>{
 const scalar=new OneEuroFilter();scalar.update(0,0);const value=scalar.update(.1,50);
 for(const [raw,time] of [[1,50],[1,25],[NaN,100],[1,NaN]])assert.equal(scalar.update(raw,time),value);
 const quat=new QuaternionOneEuroFilter();quat.update(rotation(0),0);const q=quat.update(rotation(.1),50);
 for(const [raw,time] of [[rotation(1),50],[rotation(1),25],[new Quaternion(0,0,0,0),100],[rotation(1),NaN]])assert.ok(quat.update(raw,time).angleTo(q)<1e-7);
});

test('a tracking gap and explicit reset discard old velocity and position',()=>{
 const scalar=new OneEuroFilter();scalar.update(0,0);scalar.update(.5,50);
 assert.equal(scalar.update(-.2,700),-.2);
 scalar.reset();assert.equal(scalar.update(.1,750),.1);
 const quat=new QuaternionOneEuroFilter();quat.update(rotation(0),0);quat.update(rotation(.5),50);
 assert.ok(quat.update(rotation(-.2),700).angleTo(rotation(-.2))<1e-7);
 quat.reset();assert.ok(quat.update(rotation(.1),750).angleTo(rotation(.1))<1e-7);
});

test('quaternion filtering handles sign flips and the 180 degree boundary',()=>{
 const filter=new QuaternionOneEuroFilter();filter.update(rotation(Math.PI-.02),0);
 for(let i=1;i<=60;i++){
  const raw=rotation(Math.PI+.02);
  if(i%2)raw.set(-raw.x,-raw.y,-raw.z,-raw.w);
  const value=filter.update(raw,i*50);
  assert.ok(Math.abs(value.length()-1)<1e-10);
  assert.ok(value.angleTo(rotation(Math.PI))<.021,'Stay near 180 degrees rather than rotating through zero');
 }
 assert.ok(filter.value.angleTo(rotation(Math.PI+.02))<1e-6);
});

test('head rotation suppresses alternating noise and follows a deliberate turn',()=>{
 const filter=new QuaternionOneEuroFilter();filter.update(rotation(0),0);let sum=0;
 for(let i=1;i<=100;i++){
  const angle=filter.update(rotation(i%2?.01:-.01),i*50).angleTo(rotation(0));
  if(i>50)sum+=angle*angle;
 }
 assert.ok(Math.sqrt(sum/50)<.003);
 assert.ok(filter.update(rotation(.4),5100).angleTo(rotation(.4))<.06);
});
