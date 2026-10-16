// Temporary numeric-only diagnosis: bounded to 20 seconds per camera start.
// No image pixels, landmark arrays, device names or model paths are recorded.
const rounded=value=>Number.isFinite(value)?Math.round(value*100000)/100000:null;
const angles=value=>value?Object.fromEntries(['pitch','yaw','roll'].map(axis=>[axis,rounded(value[axis])])):null;
export class BodyTrace {
 constructor(send){this.send=send;this.active=false;this.rows=[];}
 start(now){this.active=true;this.started=now;this.lastTime=null;this.lastMissing=-Infinity;this.rows=[];}
 flush(){if(this.rows.length){this.send({units:'radians',samples:this.rows});this.rows=[];}}
 observe(time,now,raw,relative,filtered,target,render){
  if(!this.active)return;
  if(now-this.started>=20000){this.flush();this.active=false;return;}
  if(raw){if(time===this.lastTime)return;this.lastTime=time;}
  else{if(now-this.lastMissing<100)return;this.lastMissing=now;}
  this.rows.push({ms:Math.round(now-this.started),ageMs:Number.isFinite(time)?Math.round(now-time):null,
   raw:angles(raw),relative:angles(relative),filtered:angles(filtered),target:angles(target),
   render:['x','y','z','w'].map(axis=>rounded(render[axis]))});
  if(this.rows.length>=20)this.flush();
 }
}
