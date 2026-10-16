import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BodyLean} from '../src/body-lean.js';
import {linkedBodyRotation} from '../src/head-linked-body.js';
import {Quaternion,Vector3} from 'three';
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
  const expected=Math.max(-Math.PI/15,Math.min(Math.PI/9,Math.atan(2*ratio)));
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
