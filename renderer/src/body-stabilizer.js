import {MotionIntent} from './motion-intent.js';
const axes=['pitch','yaw','roll'];
const deadZone={pitch:.025,yaw:.045,roll:.02};
const zero=()=>({pitch:0,yaw:0,roll:0});
export class BodyStabilizer {
 constructor(){this.motion=Object.fromEntries(axes.map(axis=>[axis,new MotionIntent(1,deadZone[axis])]));this.input=new Float64Array(1);this.reset();}
 reset(){this.value=zero();this.target=zero();this.candidates={};this.time=null;this.lastReceived=-Infinity;for(const motion of Object.values(this.motion))motion.reset();}
 update(pose,time,now){
  if(!pose){this.candidates={};for(const motion of Object.values(this.motion))motion.reset();return now-this.lastReceived<=300?{...this.value}:zero();}
  if(time===this.time)return {...this.value};
  if(this.time!==null&&time-this.time>250)this.candidates={};
  const dt=this.time===null?.1:Math.max(.001,Math.min(.2,(time-this.time)/1000));
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
   const speed=Math.abs(this.target[axis]-this.value[axis])/dt;
   const alpha=1-Math.exp(-2*Math.PI*(1.2+4*speed)*dt);
   this.value[axis]+=(this.target[axis]-this.value[axis])*alpha;
  }
  return {...this.value};
 }
}
