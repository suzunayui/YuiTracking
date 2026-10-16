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
test('head conversion has no sensitivity gain or angle clamp',()=>{
 const raw=new Quaternion().setFromEuler(new Euler(.8,1,.7,'YXZ'));
 const result=new Euler().setFromQuaternion(avatarHeadRotation(raw,2),'YXZ');
 assert.ok(Math.abs(result.x+.8)<1e-10);
 assert.ok(Math.abs(result.y+1)<1e-10);
 assert.ok(Math.abs(result.z-.7)<1e-10);
 assert.ok(avatarHeadRotation(raw,2).angleTo(avatarHeadRotation(raw,1))<1e-7);
});

test('VRM 0, VRM 1 and rotated rig bases produce the same scene-space head motion',()=>{
 const input=new Quaternion().setFromEuler(new Euler(.2,-.3,.15,'YXZ'));
 const expected=new Quaternion().setFromEuler(new Euler(.2,.3,-.15,'YXZ'));
 for(const basis of [new Quaternion(),new Quaternion(0,1,0,0),new Quaternion().setFromEuler(new Euler(.1,.7,-.2))]){
  const local=avatarHeadRotation(input,1,basis);
  const world=basis.clone().multiply(local).multiply(basis.clone().invert());
  assert.ok(world.angleTo(expected)<1e-7,'pitch, yaw and tilt must agree in scene coordinates');
  assert.ok(avatarHeadRotation(new Quaternion(),1,basis).angleTo(new Quaternion())<1e-7);
 }
});
