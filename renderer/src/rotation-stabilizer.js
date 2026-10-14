import {Quaternion} from 'three';
import {MotionIntent} from './motion-intent.js';

// Hold small orientation changes around any pose, not only calibrated neutral.
// Filter each camera observation once; the render loop handles interpolation.
export class RotationStabilizer {
 constructor(deadZone=.025){this.deadZone=deadZone;this.motion=new MotionIntent(4,deadZone*.5);this.input=new Float64Array(4);this.reset();}
 reset(){this.value=new Quaternion();this.target=new Quaternion();this.candidate=new Quaternion();this.hasCandidate=false;this.time=null;this.motion.reset();}
 update(rotation,time){
  if(!rotation||!Number.isFinite(time)||![rotation.x,rotation.y,rotation.z,rotation.w].every(Number.isFinite))return this.value.clone();
  if(time===this.time)return this.value.clone();
  if(this.time!==null&&time-this.time>150)this.hasCandidate=false;
  const dt=this.time===null?.1:Math.max(.001,Math.min(.2,(time-this.time)/1000));
  if(this.time!==null&&time-this.time>500){this.target.copy(rotation);this.value.copy(rotation);this.hasCandidate=false;}
  this.time=time;
  rotation.toArray(this.input);
  // q and -q denote the same rotation; do not interpret a sign flip as motion.
  if(this.motion.haveLast&&this.input.reduce((sum,value,i)=>sum+value*this.motion.last[i],0)<0)for(let i=0;i<4;i++)this.input[i]*=-1;
  const moving=this.motion.update(this.input,time);
  const angle=this.target.angleTo(rotation);
  if(moving){if(angle>this.deadZone*.03)this.target.copy(rotation);this.hasCandidate=false;}
  else if(angle>this.deadZone){
   // Keep an anchored target so alternating noise cannot creep the pose.
   // Interpolation below makes crossing the hold threshold smooth.
   // Small threshold crossings need a second coherent observation. Isolated
   // spikes and alternating noise stay anchored; large turns remain immediate.
   if(angle>this.deadZone*3||(this.hasCandidate&&this.candidate.angleTo(rotation)<=this.deadZone)){
    this.target.copy(rotation);this.hasCandidate=false;
   }else{this.candidate.copy(rotation);this.hasCandidate=true;}
  }else this.hasCandidate=false;
  const speed=this.value.angleTo(this.target)/dt;
  const alpha=1-Math.exp(-2*Math.PI*(1.5+2*speed)*dt);
  this.value.slerp(this.target,alpha);
  return this.value.clone();
 }
}
