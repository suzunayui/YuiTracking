import {Vector3} from 'three';
const valid=p=>p&&[p.x,p.y].every(Number.isFinite);
function axes(head,sign=1){
 head.updateWorldMatrix(true,false);
 const forward=new Vector3(0,0,sign).transformDirection(head.matrixWorld);
 const up=new Vector3(0,1,0).transformDirection(head.matrixWorld);
 return {forward,up,right:new Vector3().crossVectors(up,forward).normalize()};
}

// Measure the visible face near the mouth once, rather than guessing its depth
// from eye bones alone. Hair above the mouth and vertices behind the face are excluded.
export function captureFaceSurface(vrm){
 const head=vrm.humanoid.getNormalizedBoneNode('head'),left=vrm.humanoid.getNormalizedBoneNode('leftEye'),right=vrm.humanoid.getNormalizedBoneNode('rightEye');
 if(head){head.updateWorldMatrix(true,false);head.userData.yuiFaceForwardSign=new Vector3(0,0,1).transformDirection(head.matrixWorld).z<0?-1:1;}
 if(!head||!left||!right)return null;
 vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
 const l=head.worldToLocal(left.getWorldPosition(new Vector3())),r=head.worldToLocal(right.getWorldPosition(new Vector3()));
 const eye=l.clone().add(r).multiplyScalar(.5),span=l.distanceTo(r),sign=Math.sign(eye.z)||1;
 if(span<1e-6)return null;
 const raw=[vrm.humanoid.getRawBoneNode('head'),vrm.humanoid.getRawBoneNode('jaw')].filter(Boolean);
 let front=eye.z*sign,count=0,halfWidth=0;
 vrm.scene.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
  if(!indices||!weights)return;
  const bones=new Set(raw.map(b=>mesh.skeleton.bones.indexOf(b)).filter(i=>i>=0));
  if(!bones.size)return;mesh.skeleton.update();
  let meshWidth=0,meshCount=0;
  for(let i=0;i<indices.count;i++){
   let weight=0;for(let j=0;j<4;j++)if(bones.has(indices.getComponent(i,j)))weight+=weights.getComponent(i,j);
   if(weight<.5)continue;
   const point=head.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i,new Vector3())));
   if(Math.abs(point.y-eye.y*.55)>span*.55||point.z*sign<=0)continue;
   meshWidth=Math.max(meshWidth,Math.abs(point.x-eye.x));
   if(Math.abs(point.x-eye.x)>span*.75)continue;
   front=Math.max(front,point.z*sign);count++;meshCount++;
  }
  if(meshCount)halfWidth=Math.max(halfWidth,meshWidth);
 });
 return count?{front,width:halfWidth*2,count}:null;
}

export function avatarFaceAnchor(head,leftEye,rightEye,shoulderSpan){
 if(!head)return null;
 const demoMouth=head.getObjectByName('mouth');
 if(demoMouth)return {mouth:demoMouth.getWorldPosition(new Vector3()),width:shoulderSpan*.36,...axes(head)};
 if(leftEye&&rightEye){
  const left=leftEye.getWorldPosition(new Vector3()),right=rightEye.getWorldPosition(new Vector3());
  const eyeSpan=left.distanceTo(right);
  if(eyeSpan>.005){
   const local=head.worldToLocal(left.add(right).multiplyScalar(.5));
   const scale=head.getWorldScale(new Vector3());
   const sign=Math.sign(local.z)||1;
   local.y*=.55;local.z+=(Math.sign(local.z)||1)*shoulderSpan*.03/Math.max(Math.abs(scale.z),1e-6);
   if(head.userData.yuiFaceSurface)local.z=sign*Math.max(Math.abs(local.z),head.userData.yuiFaceSurface.front);
   return {mouth:head.localToWorld(local),width:Math.max(eyeSpan*2.2,(head.userData.yuiFaceSurface?.width??0)*Math.abs(scale.x)),...axes(head,sign)};
  }
 }
 const orientation=axes(head,head.userData.yuiFaceForwardSign??1);
 return {mouth:head.getWorldPosition(new Vector3()).addScaledVector(orientation.up,shoulderSpan*.12).addScaledVector(orientation.forward,shoulderSpan*.18),width:shoulderSpan*.36,...orientation};
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
 const near=anchor.mouth.clone()
  .addScaledVector(anchor.right??new Vector3(1,0,0),(mouth.x-wrist.x)*aspect*scale)
  .addScaledVector(anchor.up??new Vector3(0,1,0),(mouth.y-wrist.y)*scale)
  .addScaledVector(anchor.forward??new Vector3(0,0,1),Math.max(.05,anchor.width*.35));
 return base.clone().lerp(near,weight);
}


// Test actual palm/finger positions after interpolation and posing, not just the
// wrist. Push the whole hand out together, preserving its pose and mouth offset.
export function clearHandFromFace(wrist,points,anchor,radius,shoulder,reach){
 if(!anchor||!Number.isFinite(anchor.width)||anchor.width<=0)return wrist;
 const n=anchor.forward??new Vector3(0,0,1),up=anchor.up??new Vector3(0,1,0),right=anchor.right??new Vector3(1,0,0);
 const margin=Math.max(.006,anchor.width*.04)+radius;
 let push=0;
 for(const point of points){
  const offset=point.clone().sub(anchor.mouth),x=offset.dot(right),y=offset.dot(up),z=offset.dot(n);
  if(Math.abs(x)>anchor.width*.6+radius||y< -anchor.width*.5-radius||y>anchor.width+radius||z< -anchor.width)continue;
  push=Math.max(push,margin-z);
 }
 if(push<=0)return wrist;
 const result=wrist.clone().addScaledVector(n,push+.001);
 if(!shoulder||!Number.isFinite(reach)||result.distanceTo(shoulder)<=reach)return result;
 // Reach the safe plane on the arm's reachable sphere rather than clamping
 // toward the shoulder, which would pull the hand back into the face.
 const distance=result.clone().sub(shoulder).dot(n);
 if(Math.abs(distance)>=reach)return shoulder.clone().addScaledVector(n,Math.sign(distance)*reach);
 const center=shoulder.clone().addScaledVector(n,distance),tangent=result.clone().sub(center);
 const available=Math.sqrt(Math.max(0,reach*reach-distance*distance));
 if(tangent.length()>available)tangent.setLength(available);
 return center.add(tangent);
}
