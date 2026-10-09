import {Quaternion} from 'three';

// Hold small orientation changes around any pose, not only calibrated neutral.
// Filter each camera observation once; the render loop handles interpolation.
export class RotationStabilizer {
 constructor(deadZone=.025){this.deadZone=deadZone;this.reset();}
 reset(){this.value=new Quaternion();this.target=new Quaternion();this.time=null;}
 update(rotation,time){
  if(!rotation||!Number.isFinite(time)||![rotation.x,rotation.y,rotation.z,rotation.w].every(Number.isFinite))return this.value.clone();
  if(time===this.time)return this.value.clone();
  const dt=this.time===null?.1:Math.max(.001,Math.min(.2,(time-this.time)/1000));
  if(this.time!==null&&time-this.time>500){this.target.copy(rotation);this.value.copy(rotation);}
  this.time=time;
  const angle=this.target.angleTo(rotation);
  if(angle>this.deadZone){
   // Keep an anchored target so alternating noise cannot creep the pose.
   // Interpolation below makes crossing the hold threshold smooth.
   this.target.copy(rotation);
  }
  const speed=this.value.angleTo(this.target)/dt;
  const alpha=1-Math.exp(-2*Math.PI*(1.5+2*speed)*dt);
  this.value.slerp(this.target,alpha);
  return this.value.clone();
 }
}
