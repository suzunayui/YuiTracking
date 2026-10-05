export class AutoCalibration {
 constructor(){this.stop();}
 start(now){this.stop();this.armed=true;this.started=now;}
 stop(){this.armed=false;this.previous=null;this.stableSince=null;this.count=0;}
 observe(sample,now){
  if(!this.armed)return false;
  if(!sample?.rotation||sample.eyesOpen===false||now-sample.time>500||sample.time>now){this.previous=null;this.stableSince=null;this.count=0;return false;}
  if(this.previous?.time===sample.time)return false;
  const previous=this.previous;this.previous=sample;
  const dot=previous?Math.abs(sample.rotation.reduce((sum,value,i)=>sum+value*previous.rotation[i],0)):0;
  const stable=previous&&sample.time-previous.time<=400&&2*Math.acos(Math.min(1,dot))<.07;
  if(now-this.started<800){this.stableSince=null;this.count=0;return false;}
  if(!stable||this.stableSince===null){this.stableSince=now;this.count=1;return false;}
  this.count++;
  if(this.count<3||now-this.stableSince<650)return false;
  this.armed=false;return true;
 }
}
