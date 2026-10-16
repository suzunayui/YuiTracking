import {Euler,Quaternion} from 'three';
const legacyBasis=new Quaternion(0,1,0,0);
// Apply gain after the fixed axis conversion and filtering. Quaternion gain
// avoids independently scaling Euler angles through a gimbal boundary.
export function avatarHeadRotation(raw,sensitivity=1,basis=legacyBasis){
 const e=new Euler().setFromQuaternion(raw,'YXZ');
 const world=new Quaternion().setFromEuler(new Euler(e.x,-e.y,-e.z,'YXZ'));
 const gain=Number.isFinite(sensitivity)?Math.max(.3,Math.min(5,sensitivity)):1;
 if(gain!==1){
  if(world.w<0)world.set(-world.x,-world.y,-world.z,-world.w);
  // Stop at the back instead of wrapping around when gain exceeds 180 degrees.
  const angle=new Quaternion().angleTo(world);
  world.copy(new Quaternion().slerp(world,angle>0?Math.min(gain,Math.PI/angle):gain));
 }
 return basis.clone().invert().multiply(world).multiply(basis);
}
