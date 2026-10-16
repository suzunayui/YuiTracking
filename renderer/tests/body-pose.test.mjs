import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bodyPose,avatarBodyRotation} from '../src/body-pose.js';
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
test('raw torso geometry is independent of visibility and does not mix hip sway into roll',()=>{
 const p=fixture();p[12].y+=.1;const baseline=bodyPose(p);
 p[23].x+=.5;p[24].x+=.5;
 assert.equal(bodyPose(p).roll,baseline.roll);
 for(const point of [p[11],p[12],p[23],p[24]])point.visibility=.01;
 assert.deepEqual(bodyPose(p),baseline);
});
test('raw geometric angles are not clamped or subtracted from a neutral pose',()=>{
 const p=fixture();p[11].z=-2;p[12].z=2;
 assert.ok(bodyPose(p).yaw>.9);
 p[11].z=p[12].z=-2;
 assert.ok(bodyPose(p).pitch>.7);
 const tilt=fixture();tilt[12].y+=.8;
 assert.ok(bodyPose(tilt).roll>.6);
});
test('missing or nonfinite landmarks are rejected without switching geometry methods',()=>{
 const p=fixture();delete p[23];assert.equal(bodyPose(p),null);
 const invalid=fixture();invalid[11].x=NaN;assert.equal(bodyPose(invalid),null);
});
