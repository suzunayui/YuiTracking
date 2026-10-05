export class HandTransition {
 constructor(holdMs=120){this.holdMs=holdMs;this.sample=null;this.lastSeen=-Infinity;this.recoverUntil=-Infinity;}
 update(sample,now,dt,trackingAlpha){
  const wrist=sample?.landmarks?.[0];
  const visible=wrist&&Number.isFinite(wrist.x)&&Number.isFinite(wrist.y)&&wrist.x>=0&&wrist.x<=1&&wrist.y>=0&&wrist.y<=1;
  const receivedAt=sample?.receivedAt??sample?.time;
  if(visible&&sample.time<=now&&now-sample.time<=500&&receivedAt<=now&&now-receivedAt<=this.holdMs){
   if(now-this.lastSeen>this.holdMs)this.recoverUntil=now+250;
   this.sample=sample;this.lastSeen=receivedAt;
  }
  const active=now-this.lastSeen<=this.holdMs;
  // Brief detection gaps hold the last pose, then all joints ease toward idle.
  const rate=active?(now<this.recoverUntil?8:null):3;
  return {sample:active?this.sample:null,alpha:rate===null?trackingAlpha:Math.min(trackingAlpha,1-Math.exp(-rate*Math.max(0,Math.min(dt,.1))))};
 }
}
