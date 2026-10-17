import {Euler,Quaternion,Vector3} from 'three';

// Keep small turns in the upper body, but never put a large yaw into the waist.
// Fade the remaining twist to zero at 180 degrees so both turn directions meet
// at the same pose without a discontinuity at the back.
export function splitBodyTurn(rotation,basis=new Quaternion()){
 const world=basis.clone().multiply(rotation).multiply(basis.clone().invert());
 const yaw=new Euler().setFromQuaternion(world,'YXZ').y;
 const magnitude=Math.abs(yaw),limit=Math.PI/6;
 const twist=Math.sign(yaw)*Math.max(0,Math.min(magnitude,limit,Math.PI-magnitude));
 const pelvisWorld=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw-twist);
 const pelvis=basis.clone().invert().multiply(pelvisWorld).multiply(basis);
 return {pelvis,upper:pelvis.clone().invert().multiply(rotation)};
}

export function applyBodyTurn(torso,hips,root,target,alpha){
 if(!torso)return;
 let ancestor=torso.parent;
 while(ancestor&&ancestor!==hips)ancestor=ancestor.parent;
 if(!hips||hips===torso||!ancestor){torso.quaternion.slerp(target,alpha);return;}
 const basis=root.getWorldQuaternion(new Quaternion());
 const total=basis.clone().invert().multiply(torso.getWorldQuaternion(new Quaternion())).slerp(target,alpha);
 const {pelvis}=splitBodyTurn(total,basis);
 const hipParent=hips.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();
 hips.quaternion.copy(hipParent.invert().multiply(basis.clone().multiply(pelvis)));
 // Preserve the requested combined torso direction after its parent has turned.
 const parent=torso.parent.getWorldQuaternion(new Quaternion());
 torso.quaternion.copy(parent.invert().multiply(basis.multiply(total)));
}
