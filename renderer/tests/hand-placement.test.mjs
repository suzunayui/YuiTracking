import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {clamp,bend} from '../src/rig-math.js';
import {TrackingTransition} from '../src/tracking-transition.js';
import {fingerBones,palmBasis,fingerSegments,shoulderWristTarget,trackedElbowTarget,elbowPoleDirection,keepElbowInFront} from '../src/hand-rig.js';

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
  const context={THREE,clamp,bend,palmBasis,fingerSegments,fingerBones,shoulderWristTarget,trackedElbowTarget,elbowPoleDirection,keepElbowInFront,video:null,handRest:{},
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
  const context={THREE,clamp,bend,palmBasis,fingerSegments,fingerBones,shoulderWristTarget,trackedElbowTarget,elbowPoleDirection,keepElbowInFront,video:null,handRest:{},
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
   const along=elbow.clone().sub(shoulder).dot(direction),height=elbow.clone().sub(shoulder).addScaledVector(direction,-along).length();
   keepElbowInFront(expected,direction,along,height);
   assert.ok(projected.dot(expected)>.99999);assert.ok(elbow.z>=shoulder.z-1e-8);elbows.push(elbow);
  }
  assert.ok(elbows[0].distanceTo(elbows[1])>.1,'Changing observed elbow moves the actual rig elbow');
 }
});

test('elbow changes with render smoothing do not pull a stationary wrist away from its target',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 for(const side of ['left','right'])for(const alpha of [.15,.33,.65]){
  const scene=new THREE.Group(),nodes={};
  for(const [name,sign]of [['left',1],['right',-1]]){
   const upper=new THREE.Bone(),lower=new THREE.Bone(),hand=new THREE.Bone();
   upper.position.set(sign*.25,1.2,0);lower.position.x=sign*.27;hand.position.x=sign*.23;
   scene.add(upper);upper.add(lower);lower.add(hand);
   nodes[name+'UpperArm']=upper;nodes[name+'LowerArm']=lower;nodes[name+'Hand']=hand;
  }
  const landmarks=Array.from({length:21},()=>({x:.5,y:.2,z:0})),pose=[];
  pose[11]={x:.3,y:.5,z:0,visibility:1};pose[12]={x:.7,y:.5,z:0,visibility:1};
  pose[13]={x:.25,y:.3,z:-.2,visibility:1};pose[15]={x:.5,y:.2,z:0,visibility:1};pose[16]={x:.85,y:.7,z:0,visibility:1};
  const context={THREE,clamp,bend,palmBasis,fingerSegments,fingerBones,shoulderWristTarget,trackedElbowTarget,elbowPoleDirection,keepElbowInFront,video:null,handRest:{},
   vrm:{scene,humanoid:{getNormalizedBoneNode:name=>nodes[name]}}};
  runInNewContext(source.slice(source.indexOf('function bone('),source.indexOf('function animate(')),context);
  const world=Array.from({length:21},()=>({x:0,y:0,z:0}));world[5]={x:-.05,y:-.1,z:0};world[9]={x:0,y:-.1,z:0};world[17]={x:.05,y:-.1,z:0};
  context.handRest[side]={palm:new THREE.Quaternion(),directions:{}};
  const palm=palmBasis(world);
  const target=shoulderWristTarget(landmarks[0],pose,new THREE.Vector3(0,1.2,0),.5);
  context.rigHand(side,landmarks,1,world,pose);
  for(let frame=0;frame<30;frame++){
   pose[13]=frame<15?{x:.7,y:.55,z:.2,visibility:1}:{x:.25,y:.3,z:-.2,visibility:1};
   context.rigHand(side,landmarks,alpha,world,pose);
   const error=nodes[side+'Hand'].getWorldPosition(new THREE.Vector3()).distanceTo(target);
   assert.ok(nodes[side+'Hand'].getWorldQuaternion(new THREE.Quaternion()).angleTo(palm)<1e-7,'Elbow rotation must not twist a stationary palm');
   assert.ok(error<1e-6,`Stationary wrist drifted ${error}m with alpha=${alpha}`);
   assert.ok(nodes[side+'LowerArm'].getWorldPosition(new THREE.Vector3()).z>=-1e-8);
  }
 }
});

test('elbow loss and reappearance preserve wrist position and ease the bend instead of switching instantly',()=>{
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
  pose[13]={x:.25,y:.3,z:0,visibility:1};pose[15]={x:.5,y:.2,z:0,visibility:1};pose[16]={x:.85,y:.7,z:0,visibility:1};
  const elbowTransitions={left:new TrackingTransition(),right:new TrackingTransition()};
  const context={THREE,clamp,bend,palmBasis,fingerSegments,fingerBones,shoulderWristTarget,trackedElbowTarget,elbowPoleDirection,keepElbowInFront,elbowTransitions,video:null,handRest:{},
   vrm:{scene,humanoid:{getNormalizedBoneNode:name=>nodes[name]}}};
  runInNewContext(source.slice(source.indexOf('function bone('),source.indexOf('function animate(')),context);
  const step=now=>context.rigHand(side,landmarks,1,null,pose,{now,dt:1/60,poseTime:now});
  const target=shoulderWristTarget(landmarks[0],pose,new THREE.Vector3(0,1.2,0),.5);
  for(let i=0;i<=60;i++)step(i*1000/60);
  const before=nodes[side+'LowerArm'].getWorldPosition(new THREE.Vector3());
  pose[13].visibility=0;step(1100);
  assert.ok(nodes[side+'LowerArm'].getWorldPosition(new THREE.Vector3()).distanceTo(before)<1e-7,'Brief elbow loss holds its bend');
  for(let i=1;i<=100;i++){
   step(1100+i*1000/60);
   assert.ok(nodes[side+'Hand'].getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-6);
  }
  const relaxed=nodes[side+'LowerArm'].getWorldPosition(new THREE.Vector3());
  assert.ok(relaxed.distanceTo(before)>.01,'Sustained elbow loss relaxes the bend');
  pose[13]={x:.7,y:.55,z:0,visibility:1};step(2800);
  const recovered=nodes[side+'LowerArm'].getWorldPosition(new THREE.Vector3());
  assert.ok(recovered.distanceTo(relaxed)<.08,'Reacquisition must not snap to the new bend');
  assert.ok(nodes[side+'Hand'].getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-6);
 }
});
