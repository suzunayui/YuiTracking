import {Quaternion} from 'three';
import {OneEuroFilter} from './vendor/one-euro-filter.js';
const axes=['x','y','z','w'];
export class RotationStabilizer {
 constructor(){this.filters=axes.map(()=>new OneEuroFilter(20,1,2));this.raw=new Quaternion();this.value=new Quaternion();this.reset();}
 reset(){this.time=null;this.raw.identity();this.value.identity();for(const filter of this.filters)filter.reset();}
 update(rotation,time){
  if(!rotation||!Number.isFinite(time)||!axes.every(axis=>Number.isFinite(rotation[axis]))||rotation.lengthSq()<1e-12||(this.time!==null&&time<=this.time))return this.value.clone();
  const raw=rotation.clone().normalize();
  // Equivalent quaternion signs must use the same hemisphere before scalar
  // filtering. Normalization is representation conversion, not another filter.
  if(this.raw.dot(raw)<0)raw.set(-raw.x,-raw.y,-raw.z,-raw.w);
  this.raw.copy(raw);this.time=time;
  this.value.fromArray(axes.map((axis,i)=>this.filters[i].filter(raw[axis],time/1000))).normalize();
  return this.value.clone();
 }
}
