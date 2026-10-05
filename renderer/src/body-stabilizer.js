const axes=['pitch','yaw','roll'];
const deadZone={pitch:.025,yaw:.045,roll:.02};
const zero=()=>({pitch:0,yaw:0,roll:0});
export class BodyStabilizer {
 constructor(){this.reset();}
 reset(){this.value=zero();this.target=zero();this.time=null;this.lastReceived=-Infinity;}
 update(pose,time,now){
  if(!pose)return now-this.lastReceived<=300?{...this.value}:zero();
  if(time===this.time)return {...this.value};
  const dt=this.time===null?.1:Math.max(.001,Math.min(.2,(time-this.time)/1000));
  this.time=time;this.lastReceived=now;
  for(const axis of axes){
   const raw=pose[axis];
   if(!Number.isFinite(raw))continue;
   // Remove small neutral errors continuously, avoiding a jump at the boundary.
   const target=Math.sign(raw)*Math.max(0,Math.abs(raw)-deadZone[axis]);
   if(Math.abs(target-this.target[axis])>deadZone[axis]*.5)this.target[axis]=target;
   const speed=Math.abs(this.target[axis]-this.value[axis])/dt;
   const alpha=1-Math.exp(-2*Math.PI*(1.2+4*speed)*dt);
   this.value[axis]+=(this.target[axis]-this.value[axis])*alpha;
  }
  return {...this.value};
 }
}
