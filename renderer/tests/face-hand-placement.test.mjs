import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Object3D} from 'three';
import {avatarFaceAnchor,faceRelativeWristTarget} from '../src/face-hand-placement.js';
function fixture(){
 const face=[];face[13]={x:.5,y:.34};face[14]={x:.5,y:.36};face[234]={x:.4,y:.3};face[454]={x:.6,y:.3};
 const hand=Array.from({length:21},()=>({x:.5,y:.48,z:0}));hand[9]={x:.5,y:.35,z:0};
 return {face,hand,anchor:{mouth:new Vector3(0,1.6,.12),width:.16},base:new Vector3(0,1.3,.5)};
}

test('mouth coverage aligns the wrist offset to the avatar mouth and brings depth near the face',()=>{
 const {face,hand,anchor,base}=fixture(),target=faceRelativeWristTarget(base,hand,face,anchor);
 assert.ok(target.y>1.5&&target.y<anchor.mouth.y,'Wrist stays below the mouth while the palm/fingers cover it');
 assert.ok(target.z>anchor.mouth.z&&target.z<.2,'Do not push face gestures beyond arm reach');
 assert.equal(base.y,1.3);assert.equal(base.z,.5,'Do not modify the normal placement target');
});

test('hands away from the mouth and missing face tracking retain their existing placement',()=>{
 const {face,hand,anchor,base}=fixture();for(const point of hand)point.y=.8;
 assert.equal(faceRelativeWristTarget(base,hand,face,anchor),base);
 assert.equal(faceRelativeWristTarget(base,hand,null,anchor),base);
 assert.equal(faceRelativeWristTarget(base,hand,face,null),base);
});

test('face-relative placement scales with camera framing rather than shoulder-to-head proportions',()=>{
 const {face,hand,anchor,base}=fixture(),first=faceRelativeWristTarget(base,hand,face,anchor);
 const scale=p=>p?{...p,x:.5+(p.x-.5)*.6,y:.35+(p.y-.35)*.6}:p;
 const second=faceRelativeWristTarget(base,hand.map(scale),face.map(scale),anchor);
 assert.ok(first.distanceTo(second)<1e-12);
});

test('approaching the face blend boundary is continuous',()=>{
 const {face,hand,anchor,base}=fixture(),width=.2*4/3;
 for(const point of hand)point.y=.35+width*.55+.000001;
 const outside=faceRelativeWristTarget(base,hand,face,anchor);
 for(const point of hand)point.y-=.000002;
 const inside=faceRelativeWristTarget(base,hand,face,anchor);
 assert.ok(outside.distanceTo(inside)<1e-6);
});

test('avatar anchor follows head/eye transforms and uses an explicit demo mouth when present',()=>{
 const head=new Object3D(),left=new Object3D(),right=new Object3D();head.position.y=1.5;
 left.position.set(-.03,.18,.09);right.position.set(.03,.18,.09);head.add(left,right);
 const anchor=avatarFaceAnchor(head,left,right,.5);assert.ok(anchor.mouth.y>1.58&&anchor.mouth.y<1.62);
 const mouth=new Object3D();mouth.name='mouth';mouth.position.set(0,.1,.1);head.add(mouth);
 assert.ok(avatarFaceAnchor(head,null,null,.5).mouth.distanceTo(mouth.getWorldPosition(new Vector3()))<1e-12);
});
