import {Vector3,Matrix4,Quaternion} from 'three';

export const fingerBones=[
 ['ThumbMetacarpal','ThumbProximal','ThumbDistal'],
 ['IndexProximal','IndexIntermediate','IndexDistal'],
 ['MiddleProximal','MiddleIntermediate','MiddleDistal'],
 ['RingProximal','RingIntermediate','RingDistal'],
 ['LittleProximal','LittleIntermediate','LittleDistal']
];
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
export const handVector=p=>new Vector3(-p.x,-p.y,-p.z);
function basis(forward,across){
 if(forward.lengthSq()<1e-8)return null;
 forward.normalize();across.addScaledVector(forward,-across.dot(forward));
 if(across.lengthSq()<1e-8)return null;
 across.normalize();
 const normal=new Vector3().crossVectors(forward,across).normalize();
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across,normal,forward));
}
export function palmBasis(points){
 if(![0,5,9,17].every(i=>valid(points?.[i])))return null;
 return basis(handVector(points[9]).sub(handVector(points[0])),handVector(points[5]).sub(handVector(points[17])));
}
export function fingerSegments(points){
 return fingerBones.map((_,finger)=>{
  const start=1+finger*4;
  return [0,1,2].map(j=>{
   if(!valid(points?.[start+j])||!valid(points?.[start+j+1]))return null;
   const v=handVector(points[start+j+1]).sub(handVector(points[start+j]));
   return v.lengthSq()>1e-10?v.normalize():null;
  });
 });
}
export function captureHandRest(hand,nodes,sign){
 hand.updateWorldMatrix(true,true);
 const position=node=>node?hand.worldToLocal(node.getWorldPosition(new Vector3())):null;
 const middle=position(nodes.MiddleProximal),index=position(nodes.IndexProximal),little=position(nodes.LittleProximal);
 const palm=middle&&index&&little?basis(middle,index.sub(little)):basis(new Vector3(sign,0,0),new Vector3(0,0,1));
 const directions={};
 for(const names of fingerBones){
  names.forEach((name,i)=>{
   const node=nodes[name];if(!node)return;
   const next=nodes[names[i+1]];
   const direction=next?node.worldToLocal(next.getWorldPosition(new Vector3())):node.position.clone();
   directions[name]=direction.lengthSq()>1e-10?direction.normalize():new Vector3(sign,0,0);
  });
 }
 return {palm,directions};
}
export function shoulderWristTarget(wrist,pose,center,span,aspect=4/3){
 const left=pose?.[11],right=pose?.[12];
 if(!valid(wrist)||![left,right].every(p=>valid(p)&&(p.visibility??1)>=.6))return null;
 const width=Math.hypot((right.x-left.x)*aspect,right.y-left.y);
 if(width<.08||!Number.isFinite(span)||span<.05)return null;
 const scale=Math.min(span/width,3);
 return new Vector3(center.x+((left.x+right.x)/2-wrist.x)*aspect*scale,center.y+((left.y+right.y)/2-wrist.y)*scale,center.z+.15);
}

export function trackedElbowTarget(wrist,pose,center,span,aspect=4/3){
 if(!valid(wrist))return null;
 const visible=p=>valid(p)&&(p.visibility??1)>=.6;
 // Match the hand's wrist to pose wrists instead of relying on the two
 // detectors having identical handedness conventions or screen ordering.
 const candidates=[15,16].filter(i=>visible(pose?.[i])).map(i=>({i,d:Math.hypot((pose[i].x-wrist.x)*aspect,pose[i].y-wrist.y)})).sort((a,b)=>a.d-b.d);
 const match=candidates[0];
 if(!match||match.d>.18)return null;
 const elbow=pose[match.i-2];
 if(!visible(elbow))return null;
 const target=shoulderWristTarget(elbow,pose,center,span,aspect);
 if(!target)return null;
 // Webcam depth can reverse the bend plane. Use the observed screen direction;
 // the arm solver selects the forward-facing solution instead of inferred Z.
 return target;
}

export function elbowPoleDirection(elbowTarget,shoulder,armDirection,sign){
 const fallback=new Vector3(sign*.4,-1,-.2);
 const pole=elbowTarget?elbowTarget.clone().sub(shoulder):fallback.clone();
 pole.addScaledVector(armDirection,-pole.dot(armDirection));
 if(pole.lengthSq()<1e-8){
  pole.copy(fallback).addScaledVector(armDirection,-fallback.dot(armDirection));
  if(pole.lengthSq()<1e-8)pole.crossVectors(armDirection,Math.abs(armDirection.y)<.9?new Vector3(0,1,0):new Vector3(1,0,0));
 }
 return pole.normalize();
}

export function keepElbowInFront(pole,direction,along,height){
 // Elbow = shoulder + along * direction + height * pole. Select the closest
 // point on that bend circle with elbow.z >= shoulder.z when reachable.
 const front=new Vector3(0,0,1).addScaledVector(direction,-direction.z);
 const length=front.length();
 if(height<1e-8||length<1e-8)return pole;
 front.divideScalar(length);
 const minimum=Math.max(-1,Math.min(1,-along*direction.z/(height*length)));
 const dot=pole.dot(front);
 if(dot>=minimum)return pole;
 const tangent=pole.clone().addScaledVector(front,-dot);
 if(tangent.lengthSq()<1e-8)tangent.crossVectors(front,direction);
 return pole.copy(front).multiplyScalar(minimum).addScaledVector(tangent.normalize(),Math.sqrt(Math.max(0,1-minimum*minimum))).normalize();
}
