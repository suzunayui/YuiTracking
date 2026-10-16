import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {clamp,bend} from '../src/rig-math.js';
import {fingerBones,shoulderWristTarget} from '../src/hand-rig.js';

test('hand rendering reaches the shoulder-relative target and falls back only when pose shoulders are unavailable',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 for(const withShoulders of [true,false]){
  const scene=new THREE.Group(),nodes={};
  for(const [side,sign]of [['left',1],['right',-1]]){
   const upper=new THREE.Bone(),lower=new THREE.Bone(),hand=new THREE.Bone();
   upper.position.set(sign*.25,1.2,0);lower.position.x=sign*.27;hand.position.x=sign*.23;
   scene.add(upper);upper.add(lower);lower.add(hand);
   nodes[side+'UpperArm']=upper;nodes[side+'LowerArm']=lower;nodes[side+'Hand']=hand;
  }
  const landmarks=Array.from({length:21},()=>({x:.5,y:.2,z:0})),pose=[];
  pose[11]={x:.3,y:.5,z:0,visibility:1};pose[12]={x:.7,y:.5,z:0,visibility:1};
  const expected=withShoulders?shoulderWristTarget(landmarks[0],pose,new THREE.Vector3(0,1.2,0),.5,4/3):new THREE.Vector3(0,1.55,.2);
  const context={THREE,clamp,bend,fingerBones,shoulderWristTarget,video:null,handRest:{},
   vrm:{scene,humanoid:{getNormalizedBoneNode:name=>nodes[name]}}};
  runInNewContext(source.slice(source.indexOf('function bone('),source.indexOf('function animate(')),context);
  context.rigHand('left',landmarks,1,null,withShoulders?pose:null);
  assert.ok(nodes.leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-6);
 }
});
