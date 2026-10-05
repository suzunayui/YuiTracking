import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bodyPose,relativeBodyPose} from '../src/body-pose.js';
const fixture=()=>{
 const p=[];
 p[11]={x:-.2,y:-.5,z:0,visibility:1};p[12]={x:.2,y:-.5,z:0,visibility:1};
 p[23]={x:-.15,y:0,z:0,visibility:1};p[24]={x:.15,y:0,z:0,visibility:1};return p;
};
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
