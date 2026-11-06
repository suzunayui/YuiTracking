import {OneEuroFilter} from './vendor/one-euro-filter.js';

const MIN_VISIBILITY=.5;
// Below this shoulder width (metres) the body is turned too far for a reliable angle.
const MIN_SHOULDER_WIDTH=.08;
const LOSS_DELAY_MS=300,LOSS_RETURN_SECONDS=.35,GLIDE_SECONDS=.05;
// Shoulder landmarks are noisier than the face, and the strength multiplies that noise.
const FILTER_MIN_CUTOFF=.5,FILTER_BETA=4;
// Hold still while the angle stays within this range; follow directly once it leaves it.
const REST_RANGE=.0087,REST_SAMPLES=6;
export const MAX_BODY_TILT=Math.PI/3;

const usable=point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y)&&(point.visibility===undefined||point.visibility>=MIN_VISIBILITY);

// Angle of the shoulder line in pose world landmarks, where y points down.
// Positive when the person's right shoulder (12) is lower than the left (11).
export function shoulderRoll(points){
 const left=points?.[11],right=points?.[12];
 if(!usable(left)||!usable(right))return null;
 const dx=Math.abs(right.x-left.x);
 if(dx<MIN_SHOULDER_WIDTH)return null;
 return Math.atan2(right.y-left.y,dx);
}

export function scaledBodyTilt(tilt,strength){
 const gain=Number.isFinite(strength)?Math.max(0,strength):1;
 return Math.max(-MAX_BODY_TILT,Math.min(MAX_BODY_TILT,tilt*gain));
}

export class BodyTilt {
 constructor(){this.filter=new OneEuroFilter(30,FILTER_MIN_CUTOFF,FILTER_BETA);this.reset();}
 reset(){this.value=0;this.target=0;this.neutral=0;this.raw=null;this.time=null;this.lastSeen=null;this.lastUpdate=null;this.filter.reset();this.clearRest();}
 clearRest(){this.held=0;this.moving=false;this.recent=[];}
 // The current shoulder angle becomes level.
 calibrate(){
  if(this.raw!==null)this.neutral=this.raw;
  this.value=this.target=0;this.filter.reset();this.clearRest();
 }
 // Shoulder noise never moves a resting body, and a real lean is followed without an offset.
 settle(angle){
  if(!this.moving){
   if(Math.abs(angle-this.held)<=REST_RANGE)return this.held;
   this.moving=true;this.recent=[];
  }
  this.recent.push(angle);
  if(this.recent.length>REST_SAMPLES)this.recent.shift();
  if(this.recent.length===REST_SAMPLES&&Math.max(...this.recent)-Math.min(...this.recent)<=REST_RANGE){
   this.moving=false;this.held=angle;
  }
  return angle;
 }
 update(roll,time,now){
  const dt=this.lastUpdate===null?0:Math.max(0,now-this.lastUpdate)/1000;
  this.lastUpdate=now;
  if(Number.isFinite(roll)&&Number.isFinite(time)){
   this.lastSeen=now;
   if(this.time===null||time>this.time){
    this.time=time;this.raw=roll;
    this.target=this.settle(this.filter.filter(roll-this.neutral,time/1000));
   }
  }else if(this.lastSeen===null||now-this.lastSeen>LOSS_DELAY_MS){
   // Shoulders left the frame: ease back to level rather than holding a lean.
   this.target=0;
   this.filter.reset();this.clearRest();
  }
  // Recognition updates less often than the display, so glide between results every frame.
  const tau=this.lastSeen!==null&&now-this.lastSeen>LOSS_DELAY_MS?LOSS_RETURN_SECONDS:GLIDE_SECONDS;
  this.value+=(this.target-this.value)*(1-Math.exp(-dt/tau));
  return this.value;
 }
}
