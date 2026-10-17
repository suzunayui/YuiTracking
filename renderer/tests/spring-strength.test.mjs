import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SpringStrength} from '../src/spring-strength.js';
import * as THREE from 'three';
import {VRMSpringBoneJoint,VRMSpringBoneManager} from '@pixiv/three-vrm';
test('stronger springs retain more motion; adjustment does not accumulate and restores authored settings',()=>{
 const joint={settings:{stiffness:2,dragForce:.4,hitRadius:.03,gravityPower:.1}};
 const control=new SpringStrength({joints:[joint]});
 control.setStrength(3);const strong={...joint.settings};
 assert.ok(strong.stiffness<2&&strong.dragForce<.4);
 control.setStrength(5);const maximum={...joint.settings};
 assert.ok(maximum.stiffness<strong.stiffness&&maximum.dragForce<strong.dragForce);
 control.setStrength(5);assert.deepEqual(joint.settings,maximum);
 control.setStrength(3);assert.deepEqual(joint.settings,strong);
 assert.equal(joint.settings.hitRadius,.03);assert.equal(joint.settings.gravityPower,.1);
 control.setStrength(.3);assert.ok(joint.settings.stiffness>2&&joint.settings.dragForce>.4);
 control.setStrength(1);assert.deepEqual(joint.settings,{stiffness:2,dragForce:.4,hitRadius:.03,gravityPower:.1});
});

test('chest adjustment affects authored bust chains but leaves hair, cloth, colliders and gravity intact',()=>{
 const torso={name:'Chest'},bust={name:'J_Sec_L_Bust1',parent:torso},tip={name:'Tip',parent:bust};
 const joints=[bust,tip,{name:'Hair1',parent:torso},{name:'Skirt1',parent:torso}].map(bone=>({bone,settings:{stiffness:2,dragForce:.4,hitRadius:.03,gravityPower:.1}}));
 const control=new SpringStrength({joints});assert.equal(control.chestCount,2);
 control.setStrength(1,5);
 for(const joint of joints.slice(0,2)){assert.ok(joint.settings.stiffness<2);assert.ok(joint.settings.dragForce<.4);assert.equal(joint.settings.hitRadius,.03);assert.equal(joint.settings.gravityPower,.1);}
 for(const joint of joints.slice(2))assert.deepEqual(joint.settings,{stiffness:2,dragForce:.4,hitRadius:.03,gravityPower:.1});
 const five=joints[0].settings.stiffness;control.setStrength(1,20);assert.ok(joints[0].settings.stiffness<five);
 control.setStrength(5,20);const combined=joints.map(joint=>({...joint.settings}));control.setStrength(5,20);assert.deepEqual(joints.map(j=>j.settings),combined);
 control.setStrength(1,1);for(const joint of joints)assert.deepEqual(joint.settings,{stiffness:2,dragForce:.4,hitRadius:.03,gravityPower:.1});
 assert.equal(new SpringStrength({joints:[{bone:{name:'J_Sec_L_Bust1'},settings:{stiffness:1,dragForce:.5}}]}).chestCount,1);
 assert.equal(new SpringStrength().chestCount,0);
});

test('small movement produces more sustained chest spring motion at higher gain with finite rotations',()=>{
 function simulate(gain,overall=1){
  const root=new THREE.Object3D(),bone=new THREE.Object3D(),tip=new THREE.Object3D();bone.name='Bust1';tip.position.y=-.1;root.add(bone);bone.add(tip);root.updateMatrixWorld(true);
  const manager=new VRMSpringBoneManager();manager.addJoint(new VRMSpringBoneJoint(bone,tip,{stiffness:2,dragForce:.4,gravityPower:0}));
  manager.setInitState();new SpringStrength(manager).setStrength(overall,gain);let motion=0;
  for(let frame=0;frame<240;frame++){
   root.position.x=frame>=60&&frame<72?.01*Math.sin((frame-60)/12*Math.PI):0;
   manager.update(1/60);
   assert.ok(bone.quaternion.toArray().every(Number.isFinite));
   if(frame>=72)motion+=bone.quaternion.angleTo(new THREE.Quaternion())**2;
  }
  return motion;
 }
 const normal=simulate(1),strong=simulate(5);
 assert.ok(strong>normal*1.2,`Expected longer motion after small movement: normal=${normal}, strong=${strong}`);
 for(const motion of [simulate(20),simulate(20,5)])assert.ok(Number.isFinite(motion)&&motion>0);
});
