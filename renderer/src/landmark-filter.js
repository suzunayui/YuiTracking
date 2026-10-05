// Filter each newly received observation once, before the render loop.
// A small dead zone holds still poses; faster movement raises the cutoff.
export class LandmarkFilter {
 constructor(deadZone){this.deadZone=deadZone;this.points=null;this.time=0;}
 reset(){this.points=null;this.time=0;}
 update(points,time){
  if(!points?.length){this.reset();return points;}
  if(!this.points||this.points.length!==points.length||time-this.time>500){
   this.points=points.map(p=>({...p}));this.time=time;return this.points;
  }
  const dt=Math.max(.001,Math.min(.2,(time-this.time)/1000));this.time=time;
  this.points=points.map((point,i)=>{
   const old=this.points[i];
   const distance=Math.hypot(point.x-old.x,point.y-old.y,point.z-old.z);
   if(!Number.isFinite(distance)){return {...old};}
   if(distance<=this.deadZone)return {...point,x:old.x,y:old.y,z:old.z};
   const alpha=1-Math.exp(-2*Math.PI*(3+45*distance/dt)*dt);
   return {...point,x:old.x+(point.x-old.x)*alpha,y:old.y+(point.y-old.y)*alpha,z:old.z+(point.z-old.z)*alpha};
  });
  return this.points;
 }
}
