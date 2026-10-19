import {OneEuroFilter} from './vendor/one-euro-filter.js';
import {clamp} from './rig-math.js';

const depth=matrix=>Number.isFinite(matrix?.[14])&&Math.abs(matrix[14])>1e-6?Math.abs(matrix[14]):null;

// Face-transform depth, relative to calibration, never changes model scale or rig.
export class DistanceZoom {
 constructor(){this.filter=new OneEuroFilter(30,1.2,3);this.reset();}
 reset(){this.reference=null;this.time=null;this.lastSeen=-Infinity;this.logRatio=0;this.factor=1;this.filter.reset();}
 calibrate(matrix,time){
  this.reset();this.reference=depth(matrix);
  if(this.reference!==null&&Number.isFinite(time)){this.time=time;this.lastSeen=time;this.filter.filter(0,time/1000);}
 }
 update(matrix,time,now,dt,nearStrength=0,farStrength=0){
  const distance=depth(matrix);
  if(this.reference!==null&&distance!==null&&Number.isFinite(time)&&time<=now&&(this.time===null||time>this.time)){
   this.time=time;this.lastSeen=now;
   this.logRatio=this.filter.filter(Math.log(clamp(this.reference/distance,.25,4)),time/1000);
  }
  const strength=this.logRatio>=0?nearStrength:farStrength;
  const gain=Number.isFinite(strength)?clamp(strength,0,5):0;
  if(gain===0){this.factor=1;return 1;}
  const target=this.reference!==null&&now-this.lastSeen<=250?Math.exp(clamp(this.logRatio*gain,Math.log(.5),Math.log(4))):1;
  this.factor+=(target-this.factor)*(1-Math.exp(-18*clamp(dt,0,.1)));
  return this.factor;
 }
}

// A separate camera keeps tracked zoom out of saved framing and mouse controls.
// Offset the projection so the face stays at its manually framed screen position.
export function distanceCamera(base,output,factor,anchor){
 base.updateMatrixWorld();output.copy(base);
 if(!Number.isFinite(factor)||Math.abs(factor-1)<1e-8)return output;
 const pivot=anchor.clone().project(base);
 output.zoom=base.zoom*clamp(factor,.5,4);output.updateProjectionMatrix();
 if([pivot.x,pivot.y,pivot.z].every(Number.isFinite)&&pivot.z>=-1&&pivot.z<=1){
  const gain=output.zoom/base.zoom-1;
  output.projectionMatrix.elements[8]+=(clamp(pivot.x,-1,1)+base.projectionMatrix.elements[8])*gain;
  output.projectionMatrix.elements[9]+=(clamp(pivot.y,-1,1)+base.projectionMatrix.elements[9])*gain;
  output.projectionMatrixInverse.copy(output.projectionMatrix).invert();
 }
 return output;
}
