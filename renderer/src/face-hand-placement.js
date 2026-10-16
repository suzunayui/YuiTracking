import {Vector3} from 'three';
const valid=p=>p&&[p.x,p.y].every(Number.isFinite);

export function avatarFaceAnchor(head,leftEye,rightEye,shoulderSpan){
 if(!head)return null;
 const demoMouth=head.getObjectByName('mouth');
 if(demoMouth)return {mouth:demoMouth.getWorldPosition(new Vector3()),width:shoulderSpan*.36};
 if(leftEye&&rightEye){
  const left=leftEye.getWorldPosition(new Vector3()),right=rightEye.getWorldPosition(new Vector3());
  const eyeSpan=left.distanceTo(right);
  if(eyeSpan>.005){
   const local=head.worldToLocal(left.add(right).multiplyScalar(.5));
   const scale=head.getWorldScale(new Vector3());
   local.y*=.55;local.z+=(Math.sign(local.z)||1)*shoulderSpan*.03/Math.max(Math.abs(scale.z),1e-6);
   return {mouth:head.localToWorld(local),width:eyeSpan*2.2};
  }
 }
 return {mouth:head.getWorldPosition(new Vector3()).add(new Vector3(0,shoulderSpan*.12,shoulderSpan*.18)),width:shoulderSpan*.36};
}

export function faceRelativeWristTarget(base,hand,face,anchor,aspect=4/3){
 if(!base||!anchor||!Number.isFinite(anchor.width)||anchor.width<=0||!valid(hand?.[0]))return base;
 if(![13,14,234,454].every(i=>valid(face?.[i])))return base;
 const mouth={x:(face[13].x+face[14].x)/2,y:(face[13].y+face[14].y)/2};
 const width=Math.hypot((face[454].x-face[234].x)*aspect,face[454].y-face[234].y);
 if(width<.025)return base;
 const distance=Math.min(...hand.filter(valid).map(p=>Math.hypot((p.x-mouth.x)*aspect,p.y-mouth.y)));
 const proximity=Math.max(0,Math.min(1,(.55-distance/width)/.4));
 if(proximity===0)return base;
 const weight=proximity*proximity*(3-2*proximity),scale=anchor.width/width,wrist=hand[0];
 // Preserve the wrist's offset from the mouth; do not pin a palm or finger
 // to the lips. Face-local scaling accounts for different avatar proportions.
 const near=new Vector3(anchor.mouth.x+(mouth.x-wrist.x)*aspect*scale,anchor.mouth.y+(mouth.y-wrist.y)*scale,anchor.mouth.z+Math.max(.035,anchor.width*.25));
 return base.clone().lerp(near,weight);
}
