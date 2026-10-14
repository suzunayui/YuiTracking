import {test} from 'node:test';
import assert from 'node:assert/strict';
import {limbPose,crouchRatio,LimbFollower} from '../src/full-body.js';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const fixture=()=>{const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1})),screen=world.map(()=>({x:.5,y:.5,z:0,visibility:1}));for(const [h,k,a,heel,toe]of [[23,25,27,29,31],[24,26,28,30,32]]){world[h].x=h===23?-.1:.1;world[k]={...world[h],y:.4};world[a]={...world[h],y:.8};world[heel]={...world[a]};world[toe]={...world[a],z:-.15};}return {world,screen};};
test('standing legs, bent knee and toes have finite scene-space directions',()=>{const {world,screen}=fixture();const pose=limbPose(world,screen,'left');assert.ok(pose.upper.distanceTo(new THREE.Vector3(0,-1,0))<1e-8);assert.ok(pose.foot.z>.99);world[26].z=-.3;const bent=limbPose(world,screen,'left');assert.ok(bent.upper.z>0&&bent.lower.z<0);assert.equal(crouchRatio(fixture().world,screen),1);assert.equal(crouchRatio(world,screen),1,'raising one leg keeps the supporting hip height');world[25].z=-.3;assert.ok(crouchRatio(world,screen)<.9);});
test('offscreen, hidden and invalid legs do not drive bones; each side remains independent',()=>{const {world,screen}=fixture();screen[28].y=1.1;assert.equal(limbPose(world,screen,'left'),null);assert.ok(limbPose(world,screen,'right'));assert.equal(crouchRatio(world,screen),null);screen[28].y=.5;world[26].visibility=.1;assert.equal(limbPose(world,screen,'left'),null);world[26].visibility=1;world[26].x=NaN;assert.equal(limbPose(world,screen,'left'),null);});
test('new pose drives limbs, short occlusions hold, stale repeated observations return to rest',()=>{const f=new LimbFollower(),sample=limbPose(fixture().world,fixture().screen,'left');f.update(sample,1,0,.1);const held=f.update(null,1,100,.1);assert.ok(held.blend>.9);for(let i=0;i<30;i++)f.update(sample,1,500+i*16,.016);assert.ok(f.blend<.03);f.reset();assert.equal(f.sample,null);assert.equal(f.blend,0);});
test('VRM leg solver lifts a knee correctly across avatar root rotations and resets when disabled',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 for(const angle of [0,Math.PI]){
  const root=new THREE.Group();root.rotation.y=angle;const hips=new THREE.Group();hips.position.y=.9;root.add(hips);const nodes={hips};
  for(const side of ['left','right']){const upper=new THREE.Group();upper.position.x=side==='left'?.12:-.12;hips.add(upper);const lower=new THREE.Group();lower.position.y=-.4;upper.add(lower);const foot=new THREE.Group();foot.position.y=-.4;lower.add(foot);const toe=new THREE.Group();toe.position.z=.15;foot.add(toe);Object.assign(nodes,{[side+'UpperLeg']:upper,[side+'LowerLeg']:lower,[side+'Foot']:foot,[side+'Toes']:toe});}
  const {world,screen}=fixture();world[25].z=-.25;world[25].y=.3;world[26].z=-.25;world[26].y=.3;const context={THREE,limbPose,crouchRatio,fullBody:true,crouch:0,hipsRest:hips.position.clone(),vrm:{},demo:null,bone:name=>nodes[name],latestPose:{result:{worldLandmarks:[world]},time:1},safeTracking:()=>true,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),restQ:new THREE.Quaternion(),limbFollowers:{leftleg:new LimbFollower(),rightleg:new LimbFollower()}};
  runInNewContext(source.slice(source.indexOf('function aim(node'),source.indexOf('function rigHand')),context);
  runInNewContext(source.slice(source.indexOf('function aimDirection'),source.indexOf('function fitFullBody')),context);
  for(let i=0;i<40;i++){context.latestPose.time=i;context.rigLegs(i*16,.016,.4,screen);}root.updateWorldMatrix(true,true);
  assert.ok(nodes.leftLowerLeg.getWorldPosition(new THREE.Vector3()).z>.15,'knee follows camera-space forward direction');assert.ok(hips.position.y<.9,'crouch lowers hips');
  context.fullBody=false;for(let i=0;i<100;i++)context.rigLegs(1000+i*16,.016,.4,screen);assert.ok(nodes.leftUpperLeg.quaternion.angleTo(new THREE.Quaternion())<1e-6);assert.ok(Math.abs(hips.position.y-.9)<1e-5);
 }
});

test('lifting only the opposite camera-side knee moves the expected avatar leg',()=>{
 const {world,screen}=fixture();world[26].z=-.3;
 const avatarLeft=limbPose(world,screen,'left'),avatarRight=limbPose(world,screen,'right');
 assert.ok(avatarLeft.upper.z>.5);assert.ok(Math.abs(avatarRight.upper.z)<1e-8);
});
