import {MotionIntent} from './motion-intent.js';
import {OneEuroFilter} from './one-euro-filter.js';
const axes=['pitch','yaw','roll'];
const deadZone={pitch:.025,yaw:.045,roll:.02};
const zero=()=>({pitch:0,yaw:0,roll:0});
export class BodyStabilizer {
 constructor(){this.motion=Object.fromEntries(axes.map(axis=>[axis,new MotionIntent(1,deadZone[axis])]));this.filters=Object.fromEntries(axes.map(axis=>[axis,new OneEuroFilter()]));this.input=new Float64Array(1);this.reset();}
 reset(){this.value=zero();this.target=zero();this.candidates={};this.time=null;this.lastReceived=-Infinity;for(const motion of Object.values(this.motion))motion.reset();for(const filter of Object.values(this.filters))filter.reset();}
 update(pose,time,now){
  if(!pose){this.candidates={};for(const motion of Object.values(this.motion))motion.reset();return now-this.lastReceived<=300?{...this.value}:zero();}
  if(!Number.isFinite(time)||(this.time!==null&&time<=this.time))return {...this.value};
  if(this.time!==null&&time-this.time>250)this.candidates={};
  this.time=time;this.lastReceived=now;
  for(const axis of axes){
   const raw=pose[axis];
   if(!Number.isFinite(raw))continue;
   this.input[0]=raw;
   const moving=this.motion[axis].update(this.input,time);
   const target=raw;
   const distance=Math.abs(target-this.target[axis]);
   if(moving){if(distance>deadZone[axis]*.03)this.target[axis]=target;delete this.candidates[axis];}
   else if(distance>deadZone[axis]){
    const candidate=this.candidates[axis];
    if(distance>deadZone[axis]*3||(candidate!==undefined&&Math.abs(target-candidate)<=deadZone[axis])){
     this.target[axis]=target;delete this.candidates[axis];
    }else this.candidates[axis]=target;
   }else delete this.candidates[axis];
   this.value[axis]=this.filters[axis].update(this.target[axis],time);
  }
  return {...this.value};
 }
}
