import {clamp} from './rig-math.js';

const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&(p.visibility??1)>=.6;
export function bodyPose(points){
 const left=points?.[11],right=points?.[12];
 if(!valid(left)||!valid(right))return null;
 const dx=right.x-left.x,dy=right.y-left.y,dz=right.z-left.z;
 const width=Math.hypot(dx,dy);
 if(width<.08)return null;
 let roll=Math.atan2(dy,Math.abs(dx)),pitch=0;
 const lh=points[23],rh=points[24];
 if(valid(lh)&&valid(rh)){
  const up={x:(left.x+right.x-lh.x-rh.x)/2,y:(left.y+right.y-lh.y-rh.y)/2,z:(left.z+right.z-lh.z-rh.z)/2};
  if(-up.y>.1){roll=.7*Math.atan2(up.x,-up.y)+.3*roll;pitch=Math.atan2(-up.z,-up.y);}
 }
 return {pitch:clamp(pitch,-.7,.7),yaw:clamp(Math.atan2(dz,width),-.9,.9),roll:clamp(roll,-.6,.6)};
}
export function relativeBodyPose(pose,neutral){
 if(!pose)return {pitch:0,yaw:0,roll:0};
 return {pitch:clamp(pose.pitch-(neutral?.pitch??0),-.55,.55),yaw:clamp(pose.yaw-(neutral?.yaw??0),-.7,.7),roll:clamp(pose.roll-(neutral?.roll??0),-.5,.5)};
}
