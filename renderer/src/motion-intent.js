// Recognize a coherent trend before the static hold boundary is crossed.
// Once moving, keep following through brief pauses or a change of direction.
export class MotionIntent {
 constructor(size,threshold,{minSamples=3,minTravel=.15,holdMs=200}={}){this.threshold=threshold;this.minSamples=minSamples;this.minTravel=minTravel;this.holdMs=holdMs;this.last=new Float64Array(size);this.direction=new Float64Array(size);this.anchor=new Float64Array(size);this.reset();}
 reset(){this.haveLast=false;this.count=0;this.lastTime=-Infinity;this.until=-Infinity;this.direction.fill(0);}
 update(values,time){
  if(time<=this.lastTime)return time<this.until;
  if(!this.haveLast||time-this.lastTime>250){this.reset();this.haveLast=true;this.last.set(values);this.lastTime=time;return false;}
  let lengthSquared=0,dot=0,previousSquared=0;
  for(let i=0;i<values.length;i++){const step=values[i]-this.last[i];lengthSquared+=step*step;dot+=step*this.direction[i];previousSquared+=this.direction[i]**2;}
  if(lengthSquared>(this.threshold*.005)**2){
   const coherent=dot>.7*Math.sqrt(lengthSquared*previousSquared);
   if(coherent)this.count=Math.min(this.minSamples+1,this.count+1);
   else{this.count=1;this.anchor.set(this.last);}
   let travelSquared=0;
   for(let i=0;i<values.length;i++){this.direction[i]=values[i]-this.last[i];travelSquared+=(values[i]-this.anchor[i])**2;}
   if(this.count>=this.minSamples&&travelSquared>(this.threshold*this.minTravel)**2)this.until=time+this.holdMs;
  }else{this.count=0;this.direction.fill(0);}
  this.last.set(values);this.lastTime=time;
  return time<this.until;
 }
}
