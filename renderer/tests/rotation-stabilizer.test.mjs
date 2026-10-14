import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Quaternion} from 'three';
import {RotationStabilizer} from '../src/rotation-stabilizer.js';
const rotation=(x,y=0,z=0)=>new Quaternion().setFromEuler(new Euler(x,y,z,'YXZ'));
test('slow head motion starts before the static boundary and continues without repeated holds',()=>{
 const filter=new RotationStabilizer();let previous=0;
 for(let i=0;i<=40;i++){
  const angle=filter.update(rotation(i*.0025),i*50).angleTo(new Quaternion());
  if(i===4)assert.ok(angle>.001,'A slow turn must already move within 200ms');
  if(i>=7)assert.ok(angle-previous>.001,'Do not re-enter the static hold during a continuous turn');
  previous=angle;
 }
});
test('head motion returns to a stationary anchor after stopping',()=>{
 const filter=new RotationStabilizer();for(let i=0;i<=40;i++)filter.update(rotation(i*.0025),i*50);
 for(let i=41;i<=80;i++)filter.update(rotation(.1),i*50);
 const held=filter.value.clone();
 for(let i=81;i<=110;i++)assert.ok(filter.update(rotation(.1+(i%2?.003:-.003)),i*50).angleTo(held)<1e-6);
});
test('isolated threshold crossings and alternating head spikes stay still',()=>{
 const filter=new RotationStabilizer();filter.update(rotation(0),0);
 for(let i=1;i<30;i++)assert.ok(filter.update(rotation(i%3===0?0:i%2?.04:-.04),i*50).angleTo(new Quaternion())<1e-7);
});
test('a sustained small head movement is accepted on the next observation',()=>{
 const filter=new RotationStabilizer();filter.update(rotation(0),0);
 assert.ok(filter.update(rotation(.04),50).angleTo(new Quaternion())<1e-7);
 assert.ok(filter.update(rotation(.04),100).angleTo(new Quaternion())>.02);
});
test('stationary head noise stays still and deliberate turns remain responsive',()=>{
 const filter=new RotationStabilizer();
 for(let i=0;i<50;i++)assert.ok(filter.update(rotation((i%2?1:-1)*.008,.009,-.006),i*60).angleTo(new Quaternion())<1e-7);
 assert.ok(filter.update(rotation(.3,-.4,.2),3100).angleTo(rotation(.3,-.4,.2))<.06);
});
test('small noise is held around a turned head and render ticks do not refilter',()=>{
 const filter=new RotationStabilizer();
 for(let i=0;i<80;i++)filter.update(rotation(.3,.4,.1),i*60);
 const held=filter.update(rotation(.3,.4,.1),4800);
 for(let i=1;i<30;i++)assert.ok(filter.update(rotation(.3+(i%2?1:-1)*.003,.4,.1),4800+i*60).angleTo(held)<1e-6);
 assert.deepEqual(filter.update(rotation(-.4),6540),filter.update(rotation(.6),6540));
 filter.reset();assert.ok(filter.update(rotation(0),7000).angleTo(new Quaternion())<1e-7);
});
test('slow intentional head movement accumulates beyond the hold region',()=>{
 const filter=new RotationStabilizer();
 for(let i=0;i<=40;i++)filter.update(rotation(i*.002),i*60);
 assert.ok(filter.value.angleTo(new Quaternion())>.04);
});
