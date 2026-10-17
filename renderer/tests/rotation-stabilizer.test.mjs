import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Quaternion} from 'three';
import {RotationStabilizer} from '../src/rotation-stabilizer.js';
const rotation=y=>new Quaternion().setFromEuler(new Euler(0,y,0));
test('small slow head movement contributes on every observation without a hold threshold',()=>{
 const filter=new RotationStabilizer();filter.update(rotation(0),0);let previous=0;
 for(let i=1;i<=80;i++){
  const angle=filter.update(rotation(i*.001),i*50).angleTo(rotation(0));
  assert.ok(angle>previous&&angle<=i*.001+1e-7);previous=angle;
 }
 assert.ok(previous>.075);
});
test('equivalent head quaternion signs and 180 degree wrapping do not cause flips',()=>{
 const filter=new RotationStabilizer();filter.update(rotation(Math.PI-.02),0);
 for(let i=1;i<=80;i++){
  const q=rotation(Math.PI+.02);if(i%2)q.set(-q.x,-q.y,-q.z,-q.w);
  const result=filter.update(q,i*50);
  assert.ok(Math.abs(result.length()-1)<1e-10);
  assert.ok(result.angleTo(rotation(Math.PI))<.021);
 }
 assert.ok(filter.value.angleTo(rotation(Math.PI+.02))<1e-6);
});
test('head observation filtering reduces noise while following a deliberate turn',()=>{
 const filter=new RotationStabilizer();filter.update(rotation(0),0);let energy=0;
 for(let i=1;i<=100;i++){
  const angle=filter.update(rotation(i%2?.01:-.01),i*50).angleTo(rotation(0));
  if(i>50)energy+=angle**2;
 }
 assert.ok(Math.sqrt(energy/50)<.004);
 filter.update(rotation(.4),5100);filter.update(rotation(.4),5150);
 assert.ok(filter.update(rotation(.4),5200).angleTo(rotation(.4))<.1);
});
test('head reset and rejected observations keep finite normalized state',()=>{
 const filter=new RotationStabilizer();filter.update(rotation(0),0);const value=filter.update(rotation(.2),100);
 assert.deepEqual(filter.update(rotation(1),100),value);assert.deepEqual(filter.update(rotation(1),50),value);
 assert.deepEqual(filter.update(new Quaternion(0,0,0,0),200),value);
 filter.reset();assert.ok(filter.update(rotation(.3),300).angleTo(rotation(.3))<1e-7);
});
