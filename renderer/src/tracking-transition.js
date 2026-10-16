// Transition only around detection loss/recovery. Stable tracking keeps the
// existing rendering response, without another motion filter or dead zone.
export class TrackingTransition {
 constructor(){this.reset();}
 reset(){this.lastSeen=null;this.mode='idle';this.recoverUntil=0;}
 update(detected,time,now,dt,alpha,forceIdle=false){
  const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  const fresh=!forceIdle&&detected&&Number.isFinite(time)&&time<=now&&now-time<300;
  if(fresh){
   if(this.mode!=='tracked')this.recoverUntil=now+500;
   this.lastSeen=Math.max(this.lastSeen??time,time);this.mode='tracked';
   return {mode:this.mode,alpha:now<this.recoverUntil?Math.min(alpha,1-Math.exp(-10*step)):alpha};
  }
  if(!forceIdle&&this.lastSeen!==null&&now-this.lastSeen<200){
   this.mode='hold';return {mode:this.mode,alpha:0};
  }
  this.mode='idle';return {mode:this.mode,alpha:1-Math.exp(-3*step)};
 }
}
