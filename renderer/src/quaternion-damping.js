const axes=['x','y','z','w'];
// Critically damped rotation: ease changes in velocity as well as position.
// Fixed buffers and an analytic step keep per-frame cost small.
export class QuaternionDamping {
 constructor(){this.velocity=new Float64Array(4);this.goal=new Float64Array(4);this.next=new Float64Array(4);}
 update(current,target,dt,smoothing){
  dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));if(!dt)return current;
  const sign=current.dot(target)<0?-1:1;
  let errorSquared=0;
  for(let i=0;i<4;i++){this.goal[i]=target[axes[i]]*sign;errorSquared+=(current[axes[i]]-this.goal[i])**2;}
  if(errorSquared<1e-12){current.copy(target);this.velocity.fill(0);return current;}
  const omega=1.7*(5+55*(1-Math.max(0,Math.min(.95,smoothing))));
  const decay=Math.exp(-omega*dt);let lengthSquared=0;
  for(let i=0;i<4;i++){
   const error=current[axes[i]]-this.goal[i],term=(this.velocity[i]+omega*error)*dt;
   this.next[i]=this.goal[i]+(error+term)*decay;
   this.velocity[i]=(this.velocity[i]-omega*term)*decay;
   lengthSquared+=this.next[i]**2;
  }
  const length=Math.sqrt(lengthSquared);let remainingDot=0,velocityDot=0;
  for(let i=0;i<4;i++){
   this.next[i]/=length;
   remainingDot+=(current[axes[i]]-this.goal[i])*(this.next[i]-this.goal[i]);
   velocityDot+=this.velocity[i]*this.next[i];
  }
  // Stop at the goal instead of letting momentum cross it or ring at rest.
  if(remainingDot<=0){current.copy(target);this.velocity.fill(0);return current;}
  for(let i=0;i<4;i++)this.velocity[i]=(this.velocity[i]-velocityDot*this.next[i])/length;
  current.fromArray(this.next);return current;
 }
}
