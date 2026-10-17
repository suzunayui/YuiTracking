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
test('one-times head conversion retains the existing rotation without angle clamps',()=>{
 const raw=new Quaternion().setFromEuler(new Euler(.8,1,.7,'YXZ'));
 const result=new Euler().setFromQuaternion(avatarHeadRotation(raw,1),'YXZ');
 assert.ok(Math.abs(result.x+.8)<1e-10);
 assert.ok(Math.abs(result.y+1)<1e-10);
 assert.ok(Math.abs(result.z-.7)<1e-10);
 assert.ok(avatarHeadRotation(raw,2).angleTo(avatarHeadRotation(raw,1))>.1);
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

test('face strength scales pure turns nods and tilts while keeping calibrated neutral unchanged',()=>{
 for(const [axis,sign]of [['x',1],['y',-1],['z',-1]])for(const gain of [.3,1,1.5,2]){
  const angle=.3,raw=new Quaternion().setFromEuler(new Euler(axis==='x'?angle:0,axis==='y'?angle:0,axis==='z'?angle:0,'YXZ'));
  const result=new Euler().setFromQuaternion(avatarHeadRotation(raw,gain,new Quaternion()),'YXZ');
  assert.ok(Math.abs(result[axis]-angle*sign*gain)<1e-10);
  assert.ok(avatarHeadRotation(new Quaternion(),gain).angleTo(new Quaternion())<1e-7);
 }
});

test('strength gain is independent of model basis and invalid values keep the default',()=>{
 const raw=new Quaternion().setFromEuler(new Euler(.2,.3,-.1,'YXZ'));
 const expected=avatarHeadRotation(raw,1.5,new Quaternion());
 for(const basis of [new Quaternion(),new Quaternion(0,1,0,0),new Quaternion().setFromEuler(new Euler(.1,.7,-.2))]){
  const world=basis.clone().multiply(avatarHeadRotation(raw,1.5,basis)).multiply(basis.clone().invert());
  assert.ok(world.angleTo(expected)<1e-7);
 }
 assert.ok(avatarHeadRotation(raw,NaN).angleTo(avatarHeadRotation(raw,1))<1e-7);
 assert.ok(avatarHeadRotation(raw,10).angleTo(avatarHeadRotation(raw,5))<1e-7);
});


test('four-times head yaw reaches the back at 45 degrees and stays there at larger angles',()=>{
 for(const basis of [new Quaternion(),new Quaternion(0,1,0,0)])for(const sign of [-1,1]){
  for(const angle of [Math.PI/4,Math.PI/3,Math.PI/2]){
   const raw=new Quaternion().setFromEuler(new Euler(0,sign*angle,0,'YXZ'));
   const local=avatarHeadRotation(raw,4,basis);
   const world=basis.clone().multiply(local).multiply(basis.clone().invert());
   const expected=new Quaternion().setFromEuler(new Euler(0,-sign*Math.PI,0,'YXZ'));
   assert.ok(world.angleTo(expected)<1e-7);
  }
 }
});
