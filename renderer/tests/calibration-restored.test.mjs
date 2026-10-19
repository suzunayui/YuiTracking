import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {bodyPose,relativeBodyPose} from '../src/body-pose.js';
import {safeTracking,clamp} from '../src/rig-math.js';

test('manual calibration sets face/body/eye references and clears filter history without restoring other corrections',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.3,.1));
 const matrix=new THREE.Matrix4().makeRotationFromQuaternion(rotation).toArray();
 const points=[];
 points[11]={x:-.2,y:-.5,z:-.1};points[12]={x:.2,y:-.4,z:.1};
 points[23]={x:-.15,y:0,z:0};points[24]={x:.15,y:0,z:0};
 let bodyResets=0,headResets=0,cancelled=0,leanCalibration=null;
 const context={distanceZoom:{calibrate(){}},eyeGaze:{calibrate(){}},video:null,resetArmTransitions(){},elbowFilters:[],bodyLean:{calibrate(matrix){leanCalibration=matrix;}},THREE,bodyPose,safeTracking,clamp,performance:{now:()=>1100},
  latestFace:{time:1000,result:{facialTransformationMatrixes:[{data:matrix}],faceBlendshapes:[{categories:[
   {categoryName:'eyeBlinkLeft',score:.15},{categoryName:'eyeBlinkRight',score:.2}]}]}},
  latestPose:{time:1000,result:{worldLandmarks:[points]}},calibration:new THREE.Quaternion(),
  autoCalibration:{stop(){cancelled++;}},bodyStabilizer:{reset(){bodyResets++;}},headStabilizer:{reset(){headResets++;}},
  vrm:{expressionManager:{setValue(){}}},status(){},
 };
 runInNewContext(source.slice(source.indexOf('function calibrateFace('),source.indexOf('function bone(')),context);
 assert.equal(context.calibrateFace(),true);
 assert.ok(context.calibration.angleTo(rotation)<1e-7);
 assert.deepEqual(relativeBodyPose(bodyPose(points),context.bodyNeutral),{pitch:0,yaw:0,roll:0});
 assert.equal(context.blinkBaseline.left,.15);assert.equal(context.blinkBaseline.right,.2);
 assert.equal(bodyResets,1);assert.equal(headResets,1);assert.equal(cancelled,1);
 assert.equal(leanCalibration,matrix);
 assert.equal(relativeBodyPose({pitch:2,yaw:2,roll:2},null).yaw,2,'Calibration must not reintroduce angle limits');
 context.latestFace.time=0;
 assert.equal(context.calibrateFace(),false,'Stale input must not replace the references');
 assert.equal(bodyResets,1);
});
