import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BodyLean,scaledBodyLean} from '../src/body-lean.js';
import {linkedBodyRotation} from '../src/head-linked-body.js';
import {Quaternion,Vector3,Euler} from 'three';
const matrix=z=>{const m=new Array(16).fill(0);m[0]=m[5]=m[10]=m[15]=1;m[14]=z;return m;};

test('calibrated depth remains still and ignores lateral movement or shoulder data',()=>{
 const lean=new BodyLean();lean.calibrate(matrix(-50),0);
 for(let i=1;i<=100;i++){
  const m=matrix(-50);m[12]=Math.sin(i)*10;m[13]=Math.cos(i)*10;
  assert.equal(lean.update(m,i*50),0);
 }
});

test('approaching and retreating produce bounded forward and backward pitch at any calibrated distance',()=>{
 for(const reference of [30,50,100])for(const ratio of [.1,-.1,.9,-4]){
  const lean=new BodyLean();lean.calibrate(matrix(-reference),0);
  for(let i=1;i<=100;i++)lean.update(matrix(-reference*(1-ratio)),i*50);
  const expected=Math.max(-Math.PI/10,Math.min(Math.PI/9,Math.atan((ratio<0?2.6:2)*ratio)));
  assert.ok(Math.abs(lean.value-expected)<1e-5);
  assert.equal(Math.sign(lean.value),Math.sign(ratio));
 }
});

test('recalibration, stop/reset, invalid and repeated observations do not drift the reference',()=>{
 const lean=new BodyLean();assert.equal(lean.update(matrix(-40),0),0);
 lean.calibrate(matrix(-50),0);const moved=lean.update(matrix(-40),50);assert.ok(moved>0);
 for(const [m,t] of [[matrix(-60),50],[matrix(-60),25],[null,100],[matrix(NaN),100],[matrix(0),100],[matrix(-30),NaN]])assert.equal(lean.update(m,t),moved);
 lean.calibrate(matrix(-40),100);assert.equal(lean.value,0);assert.equal(lean.update(matrix(-40),150),0);
 lean.reset();assert.equal(lean.update(matrix(-20),200),0);
 lean.calibrate(null,250);assert.equal(lean.update(matrix(-20),300),0);
});

test('tiny forward movement responds continuously without a fixed hold threshold',()=>{
 const lean=new BodyLean();lean.calibrate(matrix(-50),0);let previous=0;
 for(let i=1;i<=100;i++){
  const value=lean.update(matrix(-50+i*.001),i*50);
  assert.ok(value>previous);previous=value;
 }
});

test('lean direction is consistent with model roots facing either direction',()=>{
 for(const angle of [0,Math.PI]){
  const basis=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle);
  const local=linkedBodyRotation(new Quaternion(),.2,basis);
  const world=basis.clone().multiply(local).multiply(basis.clone().invert());
  const up=new Vector3(0,1,0).applyQuaternion(world);
  assert.ok(up.z>0);assert.ok(Math.abs(world.y)<1e-12&&Math.abs(world.z)<1e-12);
 }
});

test('forward leaning keeps its response while retreating bends back more clearly',()=>{
 const settle=distance=>{
  const lean=new BodyLean();lean.calibrate(matrix(-50),0);
  for(let i=1;i<=150;i++)lean.update(matrix(-distance),i*50);
  return lean.value*180/Math.PI;
 };
 const forward=settle(45),backward=settle(55),fullBack=settle(65);
 assert.ok(forward>11&&forward<12,'Keep existing response for a 10% approach');
 assert.ok(backward<-14&&backward>-15,'A 10% retreat should bend back more clearly');
 assert.ok(Math.abs(fullBack+18)<1e-5,'Backward limit increases to 18 degrees');
});

test('head turns drive stronger body yaw without increasing pitch or roll',()=>{
 for(const angle of [-.8,.8])for(const rootYaw of [0,Math.PI]){
  const basis=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rootYaw);
  const worldHead=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle);
  const localHead=basis.clone().invert().multiply(worldHead).multiply(basis);
  const worldBody=basis.clone().multiply(linkedBodyRotation(localHead,0,basis)).multiply(basis.clone().invert());
  assert.ok(Math.abs(new Euler().setFromQuaternion(worldBody,'YXZ').y-angle*.3)<1e-10);
 }
 for(const axis of [new Vector3(1,0,0),new Vector3(0,0,1)]){
  const input=new Quaternion().setFromAxisAngle(axis,.6),expected=new Quaternion().slerp(input,.2);
  assert.ok(linkedBodyRotation(input).angleTo(expected)<1e-7);
 }
});


test('body strength scales yaw alone across model bases and keeps forward lean',()=>{
 for(const rootYaw of [0,Math.PI])for(const sign of [-1,1]){
  const basis=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rootYaw);
  const head=new Quaternion().setFromEuler(new Euler(.4,sign*.8,.2,'YXZ'));
  const local=basis.clone().invert().multiply(head).multiply(basis);
  const world=(gain,lean=0)=>basis.clone().multiply(linkedBodyRotation(local,lean,basis,gain)).multiply(basis.clone().invert());
  const original=new Euler().setFromQuaternion(world(1),'YXZ');
  for(const gain of [0,.5,2,3]){
   const scaled=new Euler().setFromQuaternion(world(gain),'YXZ');
   assert.ok(Math.abs(scaled.y-original.y*gain)<1e-10);
   assert.ok(Math.abs(scaled.x-original.x)<1e-10&&Math.abs(scaled.z-original.z)<1e-10);
   const expected=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.2).multiply(world(gain));
   assert.ok(world(gain,.2).angleTo(expected)<1e-7);
  }
  assert.ok(world(NaN).angleTo(world(1))<1e-7);
  assert.ok(world(100).angleTo(world(20))<1e-7);
  assert.ok(world(-1).angleTo(world(0))<1e-7);
 }
});


test('high body strength turns 30 or 45 degree head yaw to the back and caps rotation at 180 degrees',()=>{
 for(const [strength,threshold] of [[40/3,Math.PI/4],[20,Math.PI/6]]){
 for(const rootYaw of [0,Math.PI])for(const sign of [-1,1])for(const angle of [threshold,Math.PI/3,Math.PI/2]){
  const basis=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rootYaw);
  const head=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),sign*angle);
  const local=basis.clone().invert().multiply(head).multiply(basis);
  const result=basis.clone().multiply(linkedBodyRotation(local,0,basis,strength)).multiply(basis.clone().invert());
  const expected=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),sign*Math.PI);
  assert.ok(result.angleTo(expected)<1e-7);
 }
 }
});


test('forward and backward lean strengths are independent and preserve neutral and default response',()=>{
 for(const angle of [.01,.2,Math.PI/9]){
  assert.equal(scaledBodyLean(angle),angle);
  assert.equal(scaledBodyLean(-angle),-angle);
  assert.equal(scaledBodyLean(angle,2,3),angle*2);
  assert.equal(scaledBodyLean(-angle,2,3),-angle*3);
  assert.ok(Math.abs(scaledBodyLean(angle,0,3))===0);
  assert.ok(Math.abs(scaledBodyLean(-angle,2,0))===0);
 }
 assert.equal(scaledBodyLean(0,3,3),0);
 assert.equal(scaledBodyLean(NaN,3,3),0);
 assert.ok(Math.abs(scaledBodyLean(.2,100,1)-.6)<1e-12);
 assert.equal(scaledBodyLean(.2,NaN,1),.2);
});
