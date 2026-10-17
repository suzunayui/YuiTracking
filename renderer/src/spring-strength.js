import {clamp} from './rig-math.js';
export class SpringStrength {
 constructor(manager){
  const joints=[...(manager?.joints??[])],bones=new Set(joints.map(joint=>joint.bone));
  const chestBone=bone=>{
   if(/hair|cloth|髪|服/i.test(bone?.name??''))return false;
   for(let node=bone;node&&bones.has(node);node=node.parent){
    if(/bust|breast|(?:^|[_ .-])mune(?:[_ .\d-]|$)|胸/i.test(node.name??''))return true;
   }
   return false;
  };
  this.joints=joints.map(joint=>({joint,stiffness:joint.settings.stiffness,drag:joint.settings.dragForce,chest:chestBone(joint.bone)}));
  this.chestCount=this.joints.filter(item=>item.chest).length;
 }
 setStrength(value,chestValue=1){
  const strength=clamp(value,.3,5);
  const chestStrength=clamp(chestValue,.3,20);
  for(const {joint,stiffness,drag,chest}of this.joints){
   const gain=strength*(chest?chestStrength:1);
   joint.settings.stiffness=stiffness/Math.sqrt(gain);
   joint.settings.dragForce=gain===1?drag:clamp(drag/gain,.02,.98);
  }
 }
}
