const visible=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&(p.visibility??1)>=.55;
// Handedness labels and pose indices use different side conventions. Learn their
// association from two distinct, unambiguous wrist observations, then lock it
// until the camera/model/calibration is reset. Never guess an opposite wrist.
export class ArmAssociation {
 constructor(){this.reset();}
 reset(){this.mapping={};this.candidates={};this.observed={};this.pose=null;this.poseAt=-Infinity;this.poseTime=null;}
 updatePose(points,time,now){if(time===this.poseTime)return;this.poseTime=time;this.pose=points;this.poseAt=now;}
 observe(side,wrist,time,now){
  if(this.mapping[side]!==undefined||this.observed[side]===time||!visible(wrist)||now-this.poseAt>180)return;
  this.observed[side]=time;
  const distances=[15,16].filter(index=>visible(this.pose?.[index])).map(index=>({index,d:Math.hypot(wrist.x-this.pose[index].x,wrist.y-this.pose[index].y)})).sort((a,b)=>a.d-b.d);
  if(distances.length!==2||distances[0].d>.12||distances[1].d-distances[0].d<.04){this.candidates[side]=null;return;}
  const index=distances[0].index,previous=this.candidates[side];this.candidates[side]={index,count:previous?.index===index?previous.count+1:1};
  if(this.candidates[side].count>=2){this.mapping[side]=index;this.mapping[side==='left'?'right':'left']=index===15?16:15;}
 }
 wrist(side,now){
  const index=this.mapping[side];if(index===undefined||now-this.poseAt>220)return null;
  const chain=index===15?[11,13,15]:[12,14,16];if(!chain.every(i=>visible(this.pose?.[i])))return null;
  return this.pose[index];
 }
}
