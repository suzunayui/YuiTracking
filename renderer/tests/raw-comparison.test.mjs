import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {relativeBodyPose,avatarBodyRotation} from '../src/body-pose.js';
import {avatarHeadRotation} from '../src/head-rotation.js';

test('comparison rendering applies the filtered pose directly without joint mixing, interpolation or added physics',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const body={pitch:.9,yaw:1.1,roll:.8};
 const head=new THREE.Quaternion().setFromEuler(new THREE.Euler(.8,.7,.6));
 const nodes=Object.fromEntries(['spine','chest','upperChest','head'].map(name=>[name,{quaternion:new THREE.Quaternion()}]));
 let rigUpdates=0,expressionUpdates=0;
 const context={THREE,latestPose:{result:{worldLandmarks:[[]]},time:0},latestFace:null,latestHands:null,
  safeTracking:value=>!!value,bodyPose:()=>body,relativeBodyPose,bodyNeutral:null,bodyStabilizer:{update:value=>value},avatarBodyRotation,avatarHeadRotation,
  headStabilizer:{value:head},bone:name=>nodes[name],mouthShapes:()=>({aa:0}),mouthSensitivity:1,mouthOpenStrength:1,
  blinkBaseline:{left:0,right:0},calibratedBlink:value=>value,
  video:null,mouthMorphBinds:[],rigHand(){},demo:null,
  vrm:{humanoid:{normalizedHumanBonesRoot:{getWorldQuaternion:q=>q.identity()},update(){rigUpdates++;}},
   expressionManager:{getValue:()=>0,setValue(){},update(){expressionUpdates++;}},materials:[],
   update(){throw new Error('Whole-model update would add physics and constraints');}},
 };
 runInNewContext(source.slice(source.indexOf('function animate('),source.indexOf('async function sendFrame()')),context);
 context.animate(0,1/60);
 assert.ok(nodes.spine.quaternion.angleTo(avatarBodyRotation(body,new THREE.Quaternion()))<1e-7);
 assert.ok(nodes.head.quaternion.angleTo(avatarHeadRotation(head,1,new THREE.Quaternion()))<1e-7);
 assert.ok(nodes.chest.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 assert.ok(nodes.upperChest.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 assert.equal(rigUpdates,1);assert.equal(expressionUpdates,1);
});
