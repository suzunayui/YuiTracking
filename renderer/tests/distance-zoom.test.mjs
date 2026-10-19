import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,PerspectiveCamera,Vector3} from 'three';
import {DistanceZoom,distanceCamera} from '../src/distance-zoom.js';
const matrix=z=>new Matrix4().makeTranslation(0,0,-z).toArray();
function settle(value,z,gain,start=0,far=gain){let factor;for(let i=1;i<=90;i++){const time=start+i*1000/30;factor=value.update(matrix(z),time,time,1/30,gain,far);}return factor;}
test('distance zoom needs calibration and defaults to off',()=>{
 const value=new DistanceZoom();assert.equal(settle(value,30,3),1);value.calibrate(matrix(60),0);
 assert.equal(settle(value,30,0),1);assert.equal(value.reference,60);
});
test('closer enlarges, farther shrinks, strength increases response and stays bounded',()=>{
 const factors=[1,3,5].map(gain=>{const value=new DistanceZoom();value.calibrate(matrix(60),0);return settle(value,45,gain);});
 assert.ok(Math.abs(factors[0]-4/3)<1e-6);assert.ok(factors[1]>factors[0]&&factors[2]>factors[1]);assert.ok(factors[2]<=4);
 const close=new DistanceZoom();close.calibrate(matrix(60),0);assert.ok(Math.abs(settle(close,1,5)-4)<1e-6);
 const far=new DistanceZoom();far.calibrate(matrix(60),0);assert.ok(Math.abs(settle(far,240,5)-.5)<1e-6);
});
test('stalled and missing samples return smoothly to base framing and off restores immediately',()=>{
 const value=new DistanceZoom();value.calibrate(matrix(60),0);settle(value,30,1);const held=value.factor;
 assert.ok(value.update(matrix(30),3000,3100,1/60,1,1)>=held-1e-6);
 let previous=value.factor;
 for(let i=1;i<90;i++){const factor=value.update(null,undefined,3300+i*1000/60,1/60,1,1);assert.ok(factor<=previous+1e-8);assert.ok(factor>=1);previous=factor;}
 assert.ok(Math.abs(value.factor-1)<1e-6);
 assert.equal(value.update(matrix(30),5000,5000,1/60,0),1);
});
test('calibration at a new distance removes zoom and invalid depth cannot poison framing',()=>{
 const value=new DistanceZoom();value.calibrate(matrix(60),0);settle(value,30,3);value.calibrate(matrix(30),4000);
 assert.equal(value.factor,1);assert.ok(Math.abs(settle(value,30,3,4000)-1)<1e-8);
 for(const z of [NaN,Infinity,0])assert.ok(Number.isFinite(value.update(matrix(z),8000,8000,1/60,5,5)));
 value.reset();assert.equal(value.factor,1);assert.equal(value.reference,null);
});
test('projection zoom preserves head framing, manual orbit/zoom and inverse projection',()=>{
 for(const zoom of [1,3,20])for(const yaw of [0,.4])for(const factor of [.5,1,2,4]){
  const base=new PerspectiveCamera(32,16/9,.01,100);base.position.set(Math.sin(yaw)*3,1.35,Math.cos(yaw)*3);base.lookAt(0,1.1,0);base.zoom=zoom;base.updateProjectionMatrix();base.updateMatrixWorld();
  const anchor=new Vector3(0,1.12,0),before=anchor.clone().project(base),output=new PerspectiveCamera();
  const original={position:base.position.toArray(),rotation:base.quaternion.toArray(),projection:base.projectionMatrix.toArray(),zoom:base.zoom};
  distanceCamera(base,output,factor,anchor);const after=anchor.clone().project(output);
  assert.ok(Math.abs(before.x-after.x)<1e-6&&Math.abs(before.y-after.y)<1e-6);
  assert.equal(output.zoom,zoom*factor);assert.equal(base.zoom,original.zoom);
  assert.deepEqual(base.position.toArray(),original.position);assert.deepEqual(base.quaternion.toArray(),original.rotation);assert.deepEqual(base.projectionMatrix.toArray(),original.projection);
  const inverse=new Matrix4().multiplyMatrices(output.projectionMatrix,output.projectionMatrixInverse).elements;
  assert.ok(inverse.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-6));
  const point=anchor.clone().add(new Vector3(.001,0,0));
  const ratio=(point.clone().project(output).x-after.x)/(point.clone().project(base).x-before.x);assert.ok(Math.abs(ratio-factor)<1e-6);
 }
});

test('near and far gains are independent and either side can be disabled',()=>{
 for(const [near,far] of [[0,0],[3,0],[0,2],[3,2]])for(const z of [30,120]){
  const value=new DistanceZoom();value.calibrate(matrix(60),0);const factor=settle(value,z,near,0,far);
  if(z<60)assert.ok(near===0?factor===1:factor>3.9);
  else assert.ok(far===0?factor===1:factor<.51);
 }
});
