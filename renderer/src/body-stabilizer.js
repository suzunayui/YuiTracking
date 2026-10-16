import {OneEuroFilter} from './one-euro-filter.js';
const axes=['pitch','yaw','roll'];
const zero=()=>({pitch:0,yaw:0,roll:0});
// Filter each body observation directly: no dead zone, candidate confirmation,
// or motion-intent state can turn smooth measurement changes into target jumps.
const options={pitch:{minCutoff:.8,beta:2},yaw:{minCutoff:.5,beta:1.5},roll:{minCutoff:.8,beta:2}};
export class BodyStabilizer {
 constructor(){this.filters=Object.fromEntries(axes.map(axis=>[axis,new OneEuroFilter(options[axis])]));this.reset();}
 reset(){this.value=zero();this.target=zero();this.time=null;this.lastReceived=-Infinity;for(const filter of Object.values(this.filters))filter.reset();}
 update(pose,time,now){
  if(!pose)return now-this.lastReceived<=300?{...this.value}:zero();
  if(!Number.isFinite(time)||(this.time!==null&&time<=this.time))return {...this.value};
  this.time=time;this.lastReceived=now;
  for(const axis of axes){
   if(!Number.isFinite(pose[axis]))continue;
   this.target[axis]=pose[axis];
   this.value[axis]=this.filters[axis].update(pose[axis],time);
  }
  return {...this.value};
 }
}
