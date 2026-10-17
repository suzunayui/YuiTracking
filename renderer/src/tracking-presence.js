// Only sustained face loss enters idle. A held/stalled recognition result
// must not keep refreshing presence on each render frame.
export class TrackingPresence {
 constructor(delay=1500){this.delay=delay;this.reset();}
 reset(){this.started=null;this.lastSeen=null;}
 isAway(detected,sampleTime,now){
  if(!Number.isFinite(now))return false;
  this.started??=now;
  if(detected&&Number.isFinite(sampleTime)&&sampleTime<=now&&(this.lastSeen===null||sampleTime>this.lastSeen))this.lastSeen=sampleTime;
  return now-(this.lastSeen??this.started)>=this.delay;
 }
}
