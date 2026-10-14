import { Euler, Quaternion } from 'three';
import { clamp } from './rig-math.js';

const legacyBasis=new Quaternion(0,1,0,0);
export function avatarHeadRotation(relative,sensitivity,basis=legacyBasis){
 const e=new Euler().setFromQuaternion(relative,'YXZ');
 // Desired rotation in scene coordinates. VRM 0.x is displayed with a half
 // turn; VRM 1.0 faces the camera already. Convert to the normalized rig's
 // actual basis instead of treating both rigs as VRM 0.x.
 const world=new Quaternion().setFromEuler(new Euler(
  clamp(e.x*sensitivity,-.65,.65),
  clamp(-e.y*sensitivity,-.9,.9),
  clamp(-e.z*sensitivity,-.5,.5),'YXZ'));
 return basis.clone().invert().multiply(world).multiply(basis);
}
