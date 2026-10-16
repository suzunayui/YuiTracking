import {OneEuroFilter} from './vendor/one-euro-filter.js';
const axes=['x','y','z'];
export class LandmarkFilter {
 constructor({minCutoff=1,beta=5}={}){this.minCutoff=minCutoff;this.beta=beta;this.reset();}
 reset(){this.points=null;this.filters=[];this.time=null;}
 update(points,time){
  if(!points?.length){this.reset();return points;}
  if(!Number.isFinite(time)||(this.time!==null&&time<=this.time))return this.points??points;
  if(this.filters.length!==points.length){this.reset();this.filters=points.map(()=>axes.map(()=>new OneEuroFilter(20,this.minCutoff,this.beta)));}
  this.time=time;
  this.points=points.map((point,i)=>{
   const result={...point};
   for(let j=0;j<axes.length;j++){
    const axis=axes[j];
    result[axis]=Number.isFinite(point[axis])?this.filters[i][j].filter(point[axis],time/1000):(this.points?.[i]?.[axis]??0);
   }
   return result;
  });
  return this.points;
 }
}
