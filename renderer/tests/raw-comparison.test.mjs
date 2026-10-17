import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {relativeBodyPose,avatarBodyRotation} from '../src/body-pose.js';
import {scaledBodyLean} from '../src/body-lean.js';
import {avatarHeadRotation} from '../src/head-rotation.js';
import {smoothingAlpha,handSmoothingAlpha,clamp} from '../src/rig-math.js';
import {applyBodyTurn} from '../src/body-turn.js';
import {EyeGaze,applyVrmGaze} from '../src/eye-gaze.js';
import {TrackingPresence} from '../src/tracking-presence.js';
import {linkedBodyRotation,headRotationInRoot,applyLinkedHeadRotation} from '../src/head-linked-body.js';

function fixture(smoothing=0){
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const body={pitch:.9,yaw:1.1,roll:.8};
 const head=new THREE.Quaternion().setFromEuler(new THREE.Euler(.8,.7,.6));
 const nodes=Object.fromEntries(['spine','chest','upperChest','head'].map(name=>[name,new THREE.Object3D()]));
 const root=new THREE.Object3D();root.add(nodes.spine);nodes.spine.add(nodes.chest);nodes.chest.add(nodes.upperChest);nodes.upperChest.add(nodes.head);
 let rigUpdates=0,expressionUpdates=0,springUpdates=0;const order=[];
 const transition={update:(detected,time,now,dt,alpha)=>({mode:detected?'tracked':'idle',alpha}),reset(){}};
 const context={eyeGaze:new EyeGaze(),applyVrmGaze,camera:new THREE.PerspectiveCamera(),gazeMode:"tracking",gazeStrength:1,gazeRange:1,THREE,clamp,applyBodyTurn,handSmoothingAlpha,sensitivity:1,bodyStrength:1,forwardLeanStrength:1,backwardLeanStrength:1,scaledBodyLean,wristDepthFilters:{left:{reset(){}},right:{reset(){}}},handTransitions:{left:transition,right:transition},elbowTransitions:{left:transition,right:transition},trackingPresence:{isAway:()=>false},smoothing,bodyFromHead:false,bodyLeanEnabled:true,bodyLean:{value:0,update(){}},linkedBodyRotation,headRotationInRoot,applyLinkedHeadRotation,smoothingAlpha,latestPose:{result:{worldLandmarks:[[]]},time:0},latestFace:null,latestHands:null,
  safeTracking:value=>!!value,bodyPose:()=>body,relativeBodyPose,bodyNeutral:null,bodyStabilizer:{update:value=>value},avatarBodyRotation,avatarHeadRotation,
  headStabilizer:{value:head},bone:name=>nodes[name],mouthShapes:()=>({aa:0}),mouthSensitivity:1,mouthOpenStrength:1,
  blinkBaseline:{left:0,right:0},calibratedBlink:value=>value,
  video:null,mouthMorphBinds:[],rigHand(){},demo:null,
  vrm:{humanoid:{normalizedHumanBonesRoot:root,update(){rigUpdates++;order.push('rig');}},
   expressionManager:{getValue:()=>0,setValue(){},update(){expressionUpdates++;order.push('expression');}},springBoneManager:{update(dt){assert.ok(dt>=0&&dt<=1/30);springUpdates++;order.push('spring');}},materials:[],
   update(){throw new Error('Whole-model update would add look-at and constraints');}},
 };
 runInNewContext(source.slice(source.indexOf('function animate('),source.indexOf('async function sendFrame()')),context);
 return {context,nodes,body,head,updates:()=>({rigUpdates,expressionUpdates,springUpdates}),order};
}

test('zero interpolation retains direct tracked pose while restoring model springs after rig updates',()=>{
 const {context,nodes,body,head,updates,order}=fixture();
 context.animate(0,1/60);
 assert.ok(nodes.spine.quaternion.angleTo(avatarBodyRotation(body,new THREE.Quaternion()))<1e-7);
 assert.ok(nodes.head.quaternion.angleTo(avatarHeadRotation(head,1,new THREE.Quaternion()))<1e-7);
 assert.ok(nodes.chest.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 assert.ok(nodes.upperChest.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 assert.deepEqual(updates(),{rigUpdates:1,expressionUpdates:1,springUpdates:1});
 assert.deepEqual(order,['rig','expression','spring']);
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
 assert.ok(active.alpha>smoothingAlpha(.65,1/60)&&active.alpha<1,'Hands must use the faster response while head/body retain the original smoothing');
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

test('forward leaning affects torso pitch while preserving head direction and the off switch',()=>{
 const {context,nodes}=fixture(0);context.bodyFromHead=true;context.headStabilizer.value.identity();context.bodyLean.value=.15;
 context.animate(0,1/60);
 const up=new THREE.Vector3(0,1,0).applyQuaternion(nodes.spine.quaternion);
 assert.ok(up.z>0,'Closer to camera must lean toward the default camera');
 assert.ok(Math.abs(nodes.spine.quaternion.y)<1e-12&&Math.abs(nodes.spine.quaternion.z)<1e-12);
 assert.ok(headRotationInRoot(nodes.head,context.vrm.humanoid.normalizedHumanBonesRoot).angleTo(new THREE.Quaternion())<1e-7);
 context.bodyLeanEnabled=false;context.animate(100,1/60);
 assert.ok(nodes.spine.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 context.bodyFromHead=false;context.bodyLeanEnabled=true;context.animate(200,1/60);
 assert.ok(nodes.spine.quaternion.angleTo(avatarBodyRotation({pitch:.9,yaw:1.1,roll:.8},new THREE.Quaternion()))<1e-7);
});

test('sustained face loss returns head, body and hands smoothly to idle in both body modes',()=>{
 for(const linked of [false,true]){
  const {context,nodes}=fixture(0);context.bodyFromHead=linked;
  context.animate(0,1/60);
  const before=nodes.spine.quaternion.angleTo(new THREE.Quaternion());assert.ok(before>.1);
  const presence=new TrackingPresence();presence.isAway(true,0,0);context.trackingPresence=presence;
  context.latestPose=null;context.bodyStabilizer.update=()=>({pitch:.9,yaw:1.1,roll:.8});
  const calls=[];context.rigHand=(side,landmarks)=>calls.push(landmarks);
  context.latestHands={time:1600,result:{landmarks:[[]],handedness:[[{categoryName:'Left'}]]}};
  context.animate(1600,1/60);
  const first=nodes.spine.quaternion.angleTo(new THREE.Quaternion());
  assert.ok(first>0&&first<before,'Even zero smoothing must ease back instead of snapping');
  assert.ok(calls.every(value=>value===null),'Ignore stray hand detections while away');
  for(let i=1;i<=180;i++)context.animate(1600+i*1000/60,1/60);
  assert.ok(nodes.spine.quaternion.angleTo(new THREE.Quaternion())<.001);
  assert.ok(headRotationInRoot(nodes.head,context.vrm.humanoid.normalizedHumanBonesRoot).angleTo(new THREE.Quaternion())<.001);
 }
});

test('face strength changes displayed head rotation while body response stays unchanged',()=>{
 const bodies=[];
 for(const gain of [.5,1,4,5]){
  const {context,nodes,head}=fixture(0);context.bodyFromHead=true;context.sensitivity=gain;
  context.animate(0,1/60);bodies.push(nodes.spine.quaternion.clone());
  const displayed=headRotationInRoot(nodes.head,context.vrm.humanoid.normalizedHumanBonesRoot);
  assert.ok(displayed.angleTo(avatarHeadRotation(head,gain,new THREE.Quaternion()))<1e-7);
 }
 assert.ok(bodies[0].angleTo(bodies[1])<1e-7&&bodies[1].angleTo(bodies[2])<1e-7);
});


test('body strength changes torso twist without changing displayed head direction',()=>{
 const bodies=[];
 for(const gain of [0,1,13.3]){
  const {context,nodes,head}=fixture(0);context.bodyFromHead=true;context.bodyStrength=gain;
  context.animate(0,1/60);bodies.push(nodes.spine.quaternion.clone());
  const displayed=headRotationInRoot(nodes.head,context.vrm.humanoid.normalizedHumanBonesRoot);
  assert.ok(displayed.angleTo(avatarHeadRotation(head,1,new THREE.Quaternion()))<1e-7);
 }
 assert.ok(bodies[0].angleTo(bodies[1])>.001&&bodies[1].angleTo(bodies[2])>.001);
});


test('face four times and body thirteen-and-a-third turn head and torso to the back together',()=>{
 for(const sign of [-1,1]){
  const {context,nodes,head}=fixture(0);context.bodyFromHead=true;context.sensitivity=4;context.bodyStrength=40/3;
  head.setFromEuler(new THREE.Euler(0,sign*Math.PI/4,0,'YXZ'));
  context.animate(0,1/60);
  const displayed=headRotationInRoot(nodes.head,context.vrm.humanoid.normalizedHumanBonesRoot);
  const back=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI,0));
  assert.ok(displayed.angleTo(back)<1e-7);
  assert.ok(nodes.spine.quaternion.angleTo(back)<1e-7);
  assert.ok(nodes.head.quaternion.angleTo(new THREE.Quaternion())<1e-7);
 }
});


test('rendering applies directional lean strength independently of head and torso yaw strengths',()=>{
 for(const lean of [.15,-.15])for(const [forward,backward] of [[0,3],[2,0],[2,3]]){
  const {context,nodes,head}=fixture(0);context.bodyFromHead=true;context.sensitivity=4;context.bodyStrength=2;
  context.bodyLean.value=lean;context.forwardLeanStrength=forward;context.backwardLeanStrength=backward;
  context.animate(0,1/60);
  const target=avatarHeadRotation(head,1,new THREE.Quaternion());
  const expected=linkedBodyRotation(target,lean*(lean<0?backward:forward),new THREE.Quaternion(),2);
  assert.ok(nodes.spine.quaternion.angleTo(expected)<1e-7);
  assert.ok(headRotationInRoot(nodes.head,context.vrm.humanoid.normalizedHumanBonesRoot).angleTo(avatarHeadRotation(head,4,new THREE.Quaternion()))<1e-7);
 }
});


test('rendering turns hips and legs with a backward torso while preserving the tracked head',()=>{
 const {context,nodes,head}=fixture(0),root=context.vrm.humanoid.normalizedHumanBonesRoot;
 const hips=new THREE.Object3D(),leg=new THREE.Object3D();root.add(hips);hips.add(nodes.spine,leg);nodes.hips=hips;
 context.bodyFromHead=true;context.sensitivity=4;context.bodyStrength=40/3;head.setFromEuler(new THREE.Euler(0,Math.PI/4,0));
 context.animate(0,1/60);
 const back=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI,0));
 assert.ok(hips.quaternion.angleTo(back)<1e-7);
 assert.ok(nodes.spine.quaternion.angleTo(new THREE.Quaternion())<1e-7,'No 180 degree twist left at the waist');
 assert.ok(leg.getWorldQuaternion(new THREE.Quaternion()).angleTo(back)<1e-7);
 assert.ok(headRotationInRoot(nodes.head,root).angleTo(back)<1e-7);
});
