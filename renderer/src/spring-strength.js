import {clamp} from './rig-math.js';
export class SpringStrength {
 constructor(manager){this.joints=[...(manager?.joints??[])].map(joint=>({joint,stiffness:joint.settings.stiffness,drag:joint.settings.dragForce}));}
 setStrength(value){
  const strength=clamp(value,.3,3);
  for(const {joint,stiffness,drag}of this.joints){
   joint.settings.stiffness=stiffness/Math.sqrt(strength);
   joint.settings.dragForce=strength===1?drag:clamp(drag/strength,.02,.98);
  }
 }
}
