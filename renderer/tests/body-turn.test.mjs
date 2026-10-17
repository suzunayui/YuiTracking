import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Object3D,Quaternion,Euler,Vector3} from 'three';
import {splitBodyTurn,applyBodyTurn} from '../src/body-turn.js';
const yaw=q=>new Euler().setFromQuaternion(q,'YXZ').y;

test('body turn keeps small twists and bends above the hips, but limits waist yaw to 30 degrees',()=>{
 for(const rootYaw of [0,Math.PI])for(const angle of [0,.2,.7,1.5,2.8,Math.PI,-.2,-.7,-1.5,-2.8,-Math.PI]){
  const basis=new Quaternion().setFromEuler(new Euler(0,rootYaw,0));
  const world=new Quaternion().setFromEuler(new Euler(.25,angle,.1,'YXZ'));
  const local=basis.clone().invert().multiply(world).multiply(basis);
  const split=splitBodyTurn(local,basis);
  assert.ok(split.pelvis.clone().multiply(split.upper).angleTo(local)<1e-7);
  const upperWorld=basis.clone().multiply(split.upper).multiply(basis.clone().invert());
  assert.ok(Math.abs(yaw(upperWorld))<=Math.PI/6+1e-10);
  const pelvisWorld=basis.clone().multiply(split.pelvis).multiply(basis.clone().invert());
  const up=new Vector3(0,1,0).applyQuaternion(pelvisWorld);
  assert.ok(up.distanceTo(new Vector3(0,1,0))<1e-10,'Pelvis follows yaw without bending the legs');
  if(Math.abs(angle)<Math.PI/6)assert.ok(split.pelvis.angleTo(new Quaternion())<1e-7);
 }
});

test('hips and upper body meet in the same backward pose from either turn direction',()=>{
 const back=new Quaternion().setFromEuler(new Euler(0,Math.PI,0));
 const poses=[-1,1].map(sign=>splitBodyTurn(new Quaternion().setFromEuler(new Euler(0,sign*(Math.PI-1e-6),0))));
 for(const pose of poses){assert.ok(pose.pelvis.angleTo(back)<3e-6);assert.ok(pose.upper.angleTo(new Quaternion())<2e-6);}
 assert.ok(poses[0].pelvis.angleTo(poses[1].pelvis)<5e-6);
});

test('whole-turn smoothing does not accumulate pelvis rotation and returns legs to neutral',()=>{
 const root=new Object3D(),hips=new Object3D(),spine=new Object3D(),leg=new Object3D();
 root.add(hips);hips.add(spine,leg);root.rotation.y=.7;
 const basis=root.getWorldQuaternion(new Quaternion()),back=new Quaternion().setFromEuler(new Euler(0,Math.PI,0));
 const target=basis.clone().invert().multiply(back).multiply(basis);
 const total=()=>basis.clone().invert().multiply(spine.getWorldQuaternion(new Quaternion()));
 let previous=total().angleTo(target);
 for(let i=0;i<120;i++){
  applyBodyTurn(spine,hips,root,target,.2);
  const remaining=total().angleTo(target);assert.ok(remaining<=previous+1e-7);previous=remaining;
 }
 assert.ok(total().angleTo(target)<1e-7);
 assert.ok(leg.getWorldQuaternion(new Quaternion()).angleTo(basis.clone().multiply(target))<1e-7);
 for(let i=0;i<120;i++)applyBodyTurn(spine,hips,root,new Quaternion(),.2);
 assert.ok(hips.quaternion.angleTo(new Quaternion())<1e-7&&spine.quaternion.angleTo(new Quaternion())<1e-7);
});

test('models without a pelvis ancestor keep the existing torso fallback',()=>{
 const root=new Object3D(),spine=new Object3D();root.add(spine);
 const target=new Quaternion().setFromEuler(new Euler(.1,.2,.3));
 applyBodyTurn(spine,null,root,target,1);assert.ok(spine.quaternion.angleTo(target)<1e-7);
});
