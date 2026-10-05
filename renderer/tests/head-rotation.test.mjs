import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Quaternion} from 'three';
import {avatarHeadRotation} from '../src/head-rotation.js';

test('face turns and nodding reverse while tilt keeps its direction',()=>{
 for(const yaw of [-.4,.4]){
 for(const pitch of [-.2,.2]){
  const input=new Quaternion().setFromEuler(new Euler(pitch,yaw,-.15,'YXZ'));
  const result=new Euler().setFromQuaternion(avatarHeadRotation(input,1),'YXZ');
  assert.ok(Math.abs(result.y+yaw)<1e-10);
  assert.ok(Math.abs(result.x+pitch)<1e-10);
  assert.ok(Math.abs(result.z+.15)<1e-10);
 }
 }
});
test('calibrated neutral stays neutral and large turns remain bounded',()=>{
 const raw=new Quaternion().setFromEuler(new Euler(.1,.3,.2,'YXZ'));
 const neutral=raw.clone().invert().multiply(raw);
 assert.ok(avatarHeadRotation(neutral,2).angleTo(new Quaternion())<1e-7);
 const result=new Euler().setFromQuaternion(avatarHeadRotation(new Quaternion().setFromEuler(new Euler(.8,1,.7,'YXZ')),2),'YXZ');
 assert.ok(Math.abs(result.x+.65)<1e-10);
 assert.ok(Math.abs(result.y+.9)<1e-10);
 assert.ok(Math.abs(result.z-.5)<1e-10);
});
