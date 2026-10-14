import {Vector3} from 'three';
const visible=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&(p.visibility??1)>=.65&&(p.presence??1)>=.5;
const onScreen=p=>visible(p)&&p.x>=.01&&p.x<=.99&&p.y>=.01&&p.y<=.99;
const world=p=>new Vector3(-p.x,-p.y,-p.z);
function direction(points,a,b){const v=world(points[b]).sub(world(points[a]));return v.lengthSq()>1e-6?v.normalize():null;}
// Anatomical landmark indices; the camera input remains unmirrored.
export function limbPose(points,screen,side,kind='leg'){
 const left=side==='left',indices=kind==='leg'?(left?[23,25,27]:[24,26,28]):(left?[11,13,15]:[12,14,16]);
 if(!indices.every(i=>visible(points?.[i])&&onScreen(screen?.[i])))return null;
 const [a,b,c]=indices,upper=direction(points,a,b),lower=direction(points,b,c);if(!upper||!lower)return null;
 let foot=null;if(kind==='leg'){const heel=left?29:30,toe=left?31:32;if([heel,toe].every(i=>visible(points?.[i])&&onScreen(screen?.[i])))foot=direction(points,heel,toe);}
 return {upper,lower,foot};
}
export function crouchRatio(points,screen){
 const legs=['left','right'].map(side=>limbPose(points,screen,side));if(legs.some(leg=>!leg))return null;
 const ratio=[ [23,25,27],[24,26,28] ].map(([h,k,a])=>{const length=world(points[h]).distanceTo(world(points[k]))+world(points[k]).distanceTo(world(points[a]));return (points[a].y-points[h].y)/length;});
 return Math.max(.35,Math.min(1,Math.max(...ratio)));
}
// Brief occlusions hold the last observation; longer gaps ease toward rest.
export class LimbFollower {
 constructor(){this.reset();}
 reset(){this.sample=null;this.time=null;this.receivedAt=-Infinity;this.blend=0;}
 update(sample,time,now,dt){
  if(sample&&time!==this.time){this.sample=sample;this.time=time;this.receivedAt=now;}
  const present=now-this.receivedAt<220;
  this.blend+=(Number(present)-this.blend)*(1-Math.exp(-(present?18:8)*Math.max(0,dt)));
  return {sample:this.sample,blend:this.blend};
 }
}
