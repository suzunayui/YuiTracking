import {Euler,Quaternion} from 'three';
const legacyBasis=new Quaternion(0,1,0,0);
// Fixed axis/basis conversion only; no angle cap, gain or neutral calibration.
export function avatarHeadRotation(raw,_sensitivity=1,basis=legacyBasis){
 const e=new Euler().setFromQuaternion(raw,'YXZ');
 const world=new Quaternion().setFromEuler(new Euler(e.x,-e.y,-e.z,'YXZ'));
 return basis.clone().invert().multiply(world).multiply(basis);
}
