import {matchedPoseWrist} from './hand-rig.js';
const labels=['Left','Right'];
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);

export class HandIdentity {
 constructor(){this.reset();}
 reset(){this.tracks={};}
 assign(result,time,pose=null){
  const candidates=(result.landmarks??[]).map((points,i)=>({i,wrist:points?.[0],label:result.handedness?.[i]?.[0]?.categoryName})).filter(p=>valid(p.wrist)).slice(0,2);
  const recent=label=>this.tracks[label]&&time>=this.tracks[label].time&&time-this.tracks[label].time<800?this.tracks[label]:null;
  const anyRecent=labels.some(recent);
  const cost=(candidate,label)=>{
   const track=recent(label);
   if(!track)return candidate.label===label?(anyRecent ? .15 : 0):Infinity;
   const distance=Math.hypot(candidate.wrist.x-track.wrist.x,candidate.wrist.y-track.wrist.y);
   return 4*distance*distance+(candidate.label===label?0:.04);
  };
  let best={cost:Infinity,items:[]};
  const visit=(index,used,items,total)=>{
   if(index===candidates.length){if(total<best.cost)best={cost:total,items:items.slice()};return;}
   visit(index+1,used,items,total+1.5);
   for(const label of labels)if(!used.has(label)){
    used.add(label);items.push({candidate:candidates[index],label});
    visit(index+1,used,items,total+cost(candidates[index],label));items.pop();used.delete(label);
   }
  };
  visit(0,new Set(),[],0);
  const output={...result,landmarks:[],worldLandmarks:[],handedness:[],poseWristIndices:[]};
  for(const {candidate,label}of best.items){
   const previous=recent(label),poseIndex=previous?.poseIndex??matchedPoseWrist(candidate.wrist,pose);
   this.tracks[label]={wrist:{...candidate.wrist},time,poseIndex};
   output.landmarks.push(result.landmarks[candidate.i]);output.worldLandmarks.push(result.worldLandmarks?.[candidate.i]);
   output.handedness.push([{...(result.handedness?.[candidate.i]?.[0]??{}),categoryName:label}]);output.poseWristIndices.push(poseIndex);
  }
  return output;
 }
}
