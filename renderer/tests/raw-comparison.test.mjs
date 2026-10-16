import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {relativeBodyPose,avatarBodyRotation} from '../src/body-pose.js';
import {avatarHeadRotation} from '../src/head-rotation.js';
import {smoothingAlpha} from '../src/rig-math.js';
import {linkedBodyRotation,headRotationInRoot,applyLinkedHeadRotation} from '../src/head-linked-body.js';

function fixture(smoothing=0){
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const body={pitch:.9,yaw:1.1,roll:.8};
 const head=new THREE.Quaternion().setFromEuler(new THREE.Euler(.8,.7,.6));
 const nodes=Object.fromEntries(['spine','chest','upperChest','head'].map(name=>[name,new THREE.Object3D()]));
 const root=new THREE.Object3D();root.add(nodes.spine);nodes.spine.add(nodes.chest);nodes.chest.add(nodes.upperChest);nodes.upperChest.add(nodes.head);
 let rigUpdates=0,expressionUpdates=0;
 const context={THREE,smoothing,bodyFromHead:false,linkedBodyRotation,headRotationInRoot,applyLinkedHeadRotation,smoothingAlpha,latestPose:{result:{worldLandmarks:[[]]},time:0},latestFace:null,latestHands:null,
  safeTracking:value=>!!value,bodyPose:()=>body,relativeBodyPose,bodyNeutral:null,bodyStabilizer:{update:value=>value},avatarBodyRotation,avatarHeadRotation,
  headStabilizer:{value:head},bone:name=>nodes[name],mouthShapes:()=>({aa:0}),mouthSensitivity:1,mouthOpenStrength:1,
  blinkBaseline:{left:0,right:0},calibratedBlink:value=>value,
  video:null,mouthMorphBinds:[],rigHand(){},demo:null,
  vrm:{humanoid:{normalizedHumanBonesRoot:root,update(){rigUpdates++;}},
   expressionManager:{getValue:()=>0,setValue(){},update(){expressionUpdates++;}},materials:[],
   update(){throw new Error('Whole-model update would add physics and constraints');}},
 };
 runInNewContext(source.slice(source.indexOf('function animate('),source.indexOf('async function sendFrame()')),context);
 return {context,nodes,body,head,updates:()=>({rigUpdates,expressionUpdates})};
}

test('zero interpolation retains the approved direct pose without joint mixing or added physics',()=>{
 const {context,nodes,body,head,updates}=fixture();
 context.animate(0,1/60);
 assert.ok(nodes.spine.quaternion.angleTo(avatarBodyRotation(body,new THREE.Quaternion()))<1e-7);
 assert.ok(nodes.head.quaternion.angleTo(avatarHeadRotation(head,1,new THREE.Quaternion()))<1e-7);
 assert.ok(nodes.chest.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 assert.ok(nodes.upperChest.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 assert.deepEqual(updates(),{rigUpdates:1,expressionUpdates:1});
});

test('render interpolation converges continuously without overshoot and retains the authored target',()=>{
 const {context,nodes,body}=fixture(.65),expected=avatarBodyRotation(body,new THREE.Quaternion());
 const untouched={...body};let previous=nodes.spine.quaternion.angleTo(expected);
 for(let i=0;i<60;i++){
  context.animate(i*1000/60,1/60);
  const remaining=nodes.spine.quaternion.angleTo(expected);
  assert.ok(remaining<=previous+1e-7);
  if(i===0)assert.ok(remaining>0&&remaining<previous,'A pose update should contribute over multiple render ticks');
  previous=remaining;
 }
 assert.ok(previous<1e-6);assert.deepEqual(body,untouched);
});

test('30fps and 60fps interpolation have the same response over equal elapsed time',()=>{
 const results=[30,60].map(fps=>{
  const {context,nodes}=fixture(.65);
  for(let i=0;i<fps/5;i++)context.animate(i*1000/fps,1/fps);
  return nodes.spine.quaternion;
 });
 assert.ok(results[0].angleTo(results[1])<1e-7);
});

test('recognized hands are passed to arm and finger rendering with screen and world landmarks',()=>{
 const {context}=fixture(.65),screen=Array.from({length:21},(_,i)=>({x:.4+i*.001,y:.5,z:0}));
 const world=screen.map(p=>({...p})),calls=[];
 context.latestHands={time:0,result:{landmarks:[screen],worldLandmarks:[world],handedness:[[{categoryName:'Left'}]]}};
 context.rigHand=(side,landmarks,alpha,worldLandmarks)=>calls.push({side,landmarks,alpha,worldLandmarks});
 context.animate(0,1/60);
 const active=calls.find(call=>call.landmarks);
 assert.equal(active.side,'right');assert.equal(active.landmarks,screen);assert.equal(active.worldLandmarks,world);
 assert.ok(active.alpha>0&&active.alpha<1);
});

test('head-linked mode ignores noisy shoulders and keeps displayed head direction unchanged',()=>{
 const {context,nodes,head}=fixture(0);
 context.bodyFromHead=true;
 context.bodyPose=()=>{throw new Error('Shoulder noise must not drive head-linked body motion');};
 context.bodyStabilizer.update=()=>{throw new Error('Do not filter head motion a second time');};
 const expected=avatarHeadRotation(head,1,new THREE.Quaternion());
 for(let i=0;i<50;i++){
  context.latestPose.time=i*100;
  context.animate(i*100,1/60);
  assert.ok(nodes.spine.quaternion.angleTo(linkedBodyRotation(expected))<1e-7);
  assert.ok(headRotationInRoot(nodes.head,context.vrm.humanoid.normalizedHumanBonesRoot).angleTo(expected)<1e-7);
 }
 context.latestPose=null;
 context.animate(6000,1/60);
 assert.ok(nodes.spine.quaternion.angleTo(linkedBodyRotation(expected))<1e-7);
});

test('head-linked motion preserves calibrated neutral and head response across 30/60fps',()=>{
 const results=[30,60].map(fps=>{
  const {context,nodes}=fixture(.65);
  context.bodyFromHead=true;
  for(let i=0;i<fps/5;i++)context.animate(i*1000/fps,1/fps);
  const displayed=headRotationInRoot(nodes.head,context.vrm.humanoid.normalizedHumanBonesRoot);
  return {body:nodes.spine.quaternion.clone(),displayed};
 });
 assert.ok(results[0].body.angleTo(results[1].body)<1e-7);
 assert.ok(results[0].displayed.angleTo(results[1].displayed)<1e-7);
 const {context,nodes}=fixture(0);context.bodyFromHead=true;context.headStabilizer.value.identity();
 context.animate(0,1/60);
 assert.ok(nodes.spine.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 assert.ok(nodes.head.quaternion.angleTo(new THREE.Quaternion())<1e-7);
});

test('head compensation handles rotated model roots and intermediate neck bones',()=>{
 const root=new THREE.Object3D(),torso=new THREE.Object3D(),neck=new THREE.Object3D(),head=new THREE.Object3D();
 root.add(torso);torso.add(neck);neck.add(head);
 root.rotation.set(.1,.7,-.2);torso.rotation.set(.2,-.1,.1);neck.rotation.set(.1,.2,-.1);head.rotation.set(.3,.2,.1);
 const before=headRotationInRoot(head,root),target=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.1,.4,.2));
 torso.quaternion.copy(linkedBodyRotation(target));
 applyLinkedHeadRotation(head,root,before,target,.3);
 assert.ok(headRotationInRoot(head,root).angleTo(before.clone().slerp(target,.3))<1e-7);
});
