import {OneEuroFilter} from './vendor/one-euro-filter.js';

// Face-transform depth is independent of shoulder landmark depth. Only a
// calibrated distance ratio drives pitch; it never changes body yaw or roll.
const depth=matrix=>Number.isFinite(matrix?.[14])&&Math.abs(matrix[14])>1e-6?Math.abs(matrix[14]):null;
export class BodyLean {
 constructor(){this.filter=new OneEuroFilter(20,1,2);this.reset();}
 reset(){this.reference=null;this.time=null;this.value=0;this.filter.reset();}
 calibrate(matrix,time){
  this.reset();this.reference=depth(matrix);
  if(this.reference!==null&&Number.isFinite(time)){this.time=time;this.filter.filter(0,time/1000);}
 }
 update(matrix,time){
  const distance=depth(matrix);
  if(this.reference===null||distance===null||!Number.isFinite(time)||(this.time!==null&&time<=this.time))return this.value;
  const ratio=(this.reference-distance)/this.reference;
  // Map distance changes to gentle forward/backward bending, bounded to avoid
  // extreme poses when the face approaches the camera. No stationary gate.
  const gain=ratio<0?2.6:2;
  const pitch=Math.max(-Math.PI/10,Math.min(Math.PI/9,Math.atan(gain*ratio)));
  this.time=time;this.value=this.filter.filter(pitch,time/1000);
  return this.value;
 }
}
