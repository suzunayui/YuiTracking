import {OneEuroFilter} from './vendor/one-euro-filter.js';
import {TrackingTransition} from './tracking-transition.js';

export class WristDepth {
 constructor(){this.filter=new OneEuroFilter(10,1,2);this.transition=new TrackingTransition();this.reset();}
 reset(){this.time=null;this.value=null;this.display=0;this.filter.reset();this.transition.reset();}
 update(ratio,time,now=time,dt=1/60){
  const valid=Number.isFinite(ratio)&&Number.isFinite(time)&&time<=now&&now-time<300;
  const previous=this.transition.mode;
  const state=this.transition.update(valid,time,now,dt,1);
  if(valid){
   if(previous==='idle'){this.filter.reset();this.time=null;}
   if(this.time===null||time>this.time){this.time=time;this.value=this.filter.filter(ratio,time/1000);}
   this.display+=(this.value-this.display)*state.alpha;
  }else if(state.mode==='idle')this.display*=1-state.alpha;
  return this.value===null?null:this.display;
 }
}
