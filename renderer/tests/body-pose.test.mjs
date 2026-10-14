import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bodyPose,relativeBodyPose,avatarBodyRotation} from '../src/body-pose.js';
import {Euler,Quaternion} from 'three';
const fixture=()=>{
 const p=[];
 p[11]={x:-.2,y:-.5,z:0,visibility:1};p[12]={x:.2,y:-.5,z:0,visibility:1};
 p[23]={x:-.15,y:0,z:0,visibility:1};p[24]={x:.15,y:0,z:0,visibility:1};return p;
};
test('body leaning, bending and turning agree across rig coordinate systems',()=>{
 const body={pitch:.2,yaw:.3,roll:-.15};
 const expected=new Quaternion().setFromEuler(new Euler(-.2,.3,.15,'YXZ'));
 for(const basis of [new Quaternion(),new Quaternion(0,1,0,0),new Quaternion().setFromEuler(new Euler(.1,.7,-.2))]){
  const local=avatarBodyRotation(body,basis);
  const world=basis.clone().multiply(local).multiply(basis.clone().invert());
  assert.ok(world.angleTo(expected)<1e-7);
  assert.ok(avatarBodyRotation({pitch:0,yaw:0,roll:0},basis).angleTo(new Quaternion())<1e-7);
 }
 const legacy=avatarBodyRotation(body);
 const before=new Quaternion().setFromEuler(new Euler(body.pitch,body.yaw,body.roll,'YXZ'));
 assert.ok(legacy.angleTo(before)<1e-7,'existing VRM 0 motion is preserved');
});
test('neutral torso and calibration do not add rotation',()=>{
 const p=fixture();const pose=bodyPose(p);
 assert.ok(Math.abs(pose.pitch)+Math.abs(pose.yaw)+Math.abs(pose.roll)<1e-10);
 p[11].z=-.1;p[12].z=.1;
 assert.deepEqual(relativeBodyPose(bodyPose(p),bodyPose(p)),{pitch:0,yaw:0,roll:0});
});
test('torso leaning, bending and turning produce separate bounded rotations',()=>{
 const p=fixture();p[11].x+=.15;p[12].x+=.15;
 assert.ok(bodyPose(p).roll>0);assert.equal(Math.abs(bodyPose(p).pitch),0);
 const bend=fixture();bend[11].z=-.15;bend[12].z=-.15;
 assert.ok(bodyPose(bend).pitch>0);assert.equal(Math.abs(bodyPose(bend).yaw),0);
 const twist=fixture();twist[11].z=-.15;twist[12].z=.15;
 assert.ok(bodyPose(twist).yaw>0);
 const opposite=fixture();opposite[11].z=.15;opposite[12].z=-.15;
 assert.ok(bodyPose(opposite).yaw<0);
 assert.ok(Math.abs(bodyPose(opposite).yaw+bodyPose(twist).yaw)<1e-10);
 assert.ok(Math.abs(relativeBodyPose(bodyPose(twist),null).yaw)<=.7);
});
test('hidden shoulders reset torso; hidden hips preserve shoulder tracking',()=>{
 const p=fixture();p[11].visibility=.2;
 assert.equal(bodyPose(p),null);
 assert.deepEqual(relativeBodyPose(null,null),{pitch:0,yaw:0,roll:0});
 const upper=fixture();upper[23].visibility=.1;upper[24].visibility=.1;upper[12].y+=.1;
 assert.ok(bodyPose(upper).roll>0);assert.equal(bodyPose(upper).pitch,0);
 upper[11].x=NaN;assert.equal(bodyPose(upper),null);
});
