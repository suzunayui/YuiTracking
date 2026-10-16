import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {clamp,bend} from '../src/rig-math.js';
import {fingerBones,shoulderWristTarget,trackedElbowTarget,elbowPoleDirection} from '../src/hand-rig.js';

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
  const context={THREE,clamp,bend,fingerBones,shoulderWristTarget,trackedElbowTarget,elbowPoleDirection,video:null,handRest:{},
   vrm:{scene,humanoid:{getNormalizedBoneNode:name=>nodes[name]}}};
  runInNewContext(source.slice(source.indexOf('function bone('),source.indexOf('function animate(')),context);
  context.rigHand('left',landmarks,1,null,withShoulders?pose:null);
  assert.ok(nodes.leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-6);
 }
});

test('tracked elbows change the bend plane on both arms while wrists retain their existing targets',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 for(const side of ['left','right']){
  const scene=new THREE.Group(),nodes={};
  for(const [name,sign]of [['left',1],['right',-1]]){
   const upper=new THREE.Bone(),lower=new THREE.Bone(),hand=new THREE.Bone();
   upper.position.set(sign*.25,1.2,0);lower.position.x=sign*.27;hand.position.x=sign*.23;
   scene.add(upper);upper.add(lower);lower.add(hand);
   nodes[name+'UpperArm']=upper;nodes[name+'LowerArm']=lower;nodes[name+'Hand']=hand;
  }
  const landmarks=Array.from({length:21},()=>({x:.5,y:.2,z:0})),pose=[];
  pose[11]={x:.3,y:.5,z:0,visibility:1};pose[12]={x:.7,y:.5,z:0,visibility:1};
  pose[15]={x:.5,y:.2,z:0,visibility:1};pose[16]={x:.85,y:.7,z:0,visibility:1};
  const context={THREE,clamp,bend,fingerBones,shoulderWristTarget,trackedElbowTarget,elbowPoleDirection,video:null,handRest:{},
   vrm:{scene,humanoid:{getNormalizedBoneNode:name=>nodes[name]}}};
  runInNewContext(source.slice(source.indexOf('function bone('),source.indexOf('function animate(')),context);
  const center=new THREE.Vector3(0,1.2,0),wrist=shoulderWristTarget(landmarks[0],pose,center,.5,4/3),elbows=[];
  for(const raw of [{x:.25,y:.3,z:-.2,visibility:1},{x:.7,y:.55,z:.2,visibility:1}]){
   pose[13]=raw;context.rigHand(side,landmarks,1,null,pose);
   const shoulder=nodes[side+'UpperArm'].getWorldPosition(new THREE.Vector3());
   const elbow=nodes[side+'LowerArm'].getWorldPosition(new THREE.Vector3());
   assert.ok(nodes[side+'Hand'].getWorldPosition(new THREE.Vector3()).distanceTo(wrist)<1e-6);
   const direction=wrist.clone().sub(shoulder).normalize(),projected=elbow.clone().sub(shoulder);
   projected.addScaledVector(direction,-projected.dot(direction)).normalize();
   const expected=elbowPoleDirection(trackedElbowTarget(landmarks[0],pose,center,.5),shoulder,direction,side==='left'?1:-1);
   assert.ok(projected.dot(expected)>.99999);elbows.push(elbow);
  }
  assert.ok(elbows[0].distanceTo(elbows[1])>.1,'Changing observed elbow moves the actual rig elbow');
 }
});
