const MIN_VISIBILITY=.5;
// Below this shoulder width (metres) the body is turned too far for a reliable angle.
const MIN_SHOULDER_WIDTH=.08;
const LOSS_DELAY_MS=300,LOSS_RETURN_SECONDS=.5;
// Shoulders update about nine times a second. Keeping the velocity between updates avoids a
// staircase of moving and stopping, which the strength would make obvious.
const GLIDE_SECONDS=.24;
// Measured on a seated person with a webcam: the shoulder angle in image landmarks varies by
// about 2 degrees at rest, with single-sample spikes, and a light lean moves it 6 to 8 degrees.
const DEGREE=Math.PI/180,MEDIAN_SAMPLES=3,REST_SAMPLES=4;
const LEAVE_REST=3*DEGREE,REST_RANGE=1.6*DEGREE,LEVEL_RANGE=1.5*DEGREE;
export const MAX_BODY_TILT=Math.PI/3;

const usable=point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y)&&(point.visibility===undefined||point.visibility>=MIN_VISIBILITY);

// Angle of the shoulder line, where y points down. Use image landmarks with the image's
// aspect ratio: they are about three times steadier than world landmarks for this angle.
// Positive when the person's right shoulder (12) is lower than the left (11).
export function shoulderRoll(points,aspect=1){
 const left=points?.[11],right=points?.[12];
 if(!usable(left)||!usable(right))return null;
 const dx=Math.abs(right.x-left.x)*aspect;
 if(dx<MIN_SHOULDER_WIDTH)return null;
 return Math.atan2(right.y-left.y,dx);
}

export function scaledBodyTilt(tilt,strength){
 const gain=Number.isFinite(strength)?Math.max(0,strength):1;
 return Math.max(-MAX_BODY_TILT,Math.min(MAX_BODY_TILT,tilt*gain));
}

export class BodyTilt {
 constructor(){this.reset();}
 reset(){this.value=0;this.velocity=0;this.target=0;this.neutral=0;this.raw=null;this.time=null;this.lastSeen=null;this.lastUpdate=null;this.clearRest();}
 clearRest(){this.held=0;this.moving=false;this.recent=[];this.samples=[];}
 // The current shoulder angle becomes level.
 calibrate(){
  if(this.raw!==null)this.neutral=this.raw;
  this.value=this.target=this.velocity=0;this.clearRest();
 }
 // Shoulder noise never moves a resting body, and a real lean is followed without an offset.
 settle(angle){
  // A median removes single-sample spikes without smearing a real lean much.
  this.samples.push(angle);
  if(this.samples.length>MEDIAN_SAMPLES)this.samples.shift();
  angle=[...this.samples].sort((a,b)=>a-b)[this.samples.length>>1];
  if(!this.moving){
   if(Math.abs(angle-this.held)<=LEAVE_REST)return this.held;
   this.moving=true;this.recent=[];
  }
  this.recent.push(angle);
  if(this.recent.length>REST_SAMPLES)this.recent.shift();
  if(this.recent.length===REST_SAMPLES&&Math.max(...this.recent)-Math.min(...this.recent)<=REST_RANGE){
   const average=this.recent.reduce((sum,item)=>sum+item,0)/REST_SAMPLES;
   // Sitting back up should look exactly level, not a little off because of noise.
   this.moving=false;this.held=Math.abs(average)<=LEVEL_RANGE?0:average;
   return this.held;
  }
  return angle;
 }
 // A critically damped follow: position and velocity both stay continuous.
 glide(seconds,dt){
  const omega=2/seconds,x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x);
  const change=this.value-this.target,step=(this.velocity+omega*change)*dt;
  this.velocity=(this.velocity-omega*step)*decay;
  this.value=this.target+(change+step)*decay;
 }
 update(roll,time,now){
  const dt=this.lastUpdate===null?0:Math.max(0,now-this.lastUpdate)/1000;
  this.lastUpdate=now;
  if(Number.isFinite(roll)&&Number.isFinite(time)){
   this.lastSeen=now;
   if(this.time===null||time>this.time){
    this.time=time;this.raw=roll;
    this.target=this.settle(roll-this.neutral);
   }
  }else if(this.lastSeen===null||now-this.lastSeen>LOSS_DELAY_MS){
   // Shoulders left the frame: ease back to level rather than holding a lean.
   this.target=0;
   this.clearRest();
  }
  // Recognition updates less often than the display, so glide between results every frame.
  const seconds=this.lastSeen!==null&&now-this.lastSeen>LOSS_DELAY_MS?LOSS_RETURN_SECONDS:GLIDE_SECONDS;
  this.glide(seconds,dt);
  return this.value;
 }
}
