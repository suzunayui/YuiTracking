import {OneEuroFilter} from './vendor/one-euro-filter.js';
const axes=['pitch','yaw','roll'];
const zero=()=>({pitch:0,yaw:0,roll:0});
const options={pitch:[1,2],yaw:[1,2],roll:[1,2]};
export class BodyStabilizer {
 constructor(){this.filters=Object.fromEntries(axes.map(axis=>[axis,new OneEuroFilter(10,...options[axis])]));this.reset();}
 reset(){this.value=zero();this.time=null;for(const filter of Object.values(this.filters))filter.reset();}
 update(pose,time){
  // Missing observations do not synthesize a return to neutral. An explicit
  // camera stop or calibration resets the filters and displayed pose.
  if(!pose||!Number.isFinite(time)||(this.time!==null&&time<=this.time))return {...this.value};
  this.time=time;
  for(const axis of axes)if(Number.isFinite(pose[axis]))this.value[axis]=this.filters[axis].filter(pose[axis],time/1000);
  return {...this.value};
 }
}
