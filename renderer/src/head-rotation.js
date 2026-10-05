import { Euler, Quaternion } from 'three';
import { clamp } from './rig-math.js';

export function avatarHeadRotation(relative,sensitivity){
 const e=new Euler().setFromQuaternion(relative,'YXZ');
 // Match face turns and nodding to the avatar; keep head tilt unchanged.
 return new Quaternion().setFromEuler(new Euler(
  clamp(-e.x*sensitivity,-.65,.65),
  clamp(-e.y*sensitivity,-.9,.9),
  clamp(e.z*sensitivity,-.5,.5),'YXZ'));
}
