import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {wristDepthRatio,handWristTarget,shoulderWristTarget} from '../src/hand-rig.js';
import {WristDepth} from '../src/wrist-depth.js';
const p=(x,y,z=0)=>({x,y,z,visibility:1});
function fixture(){
 const pose=[],world=[];pose[11]=p(.3,.5);pose[12]=p(.7,.5);pose[15]=p(.4,.4);pose[16]=p(.6,.4);
 world[11]=p(-.2,0);world[12]=p(.2,0);world[15]=p(0,0,-.1);world[16]=p(0,0,-.3);
 return {pose,world};
}

test('body-relative depth matches each wrist and is independent of body origin',()=>{
 const {pose,world}=fixture();
 assert.ok(Math.abs(wristDepthRatio(pose[15],pose,world)-.25)<1e-12);
 assert.ok(Math.abs(wristDepthRatio(pose[16],pose,world)-.75)<1e-12);
 for(const point of world)if(point)point.z+=10;
 assert.ok(Math.abs(wristDepthRatio(pose[15],pose,world)-.25)<1e-12);
 pose[15].visibility=0;assert.equal(wristDepthRatio(p(.4,.4),pose,world),null);
 assert.equal(wristDepthRatio(p(.4,.4),pose,null),null);
});

test('forward distance increases depth without changing screen-plane mapping and has a conservative fallback',()=>{
 const {pose}=fixture(),center=new Vector3(0,1.2,0);
 const base=shoulderWristTarget(pose[15],pose,center,.5),near=handWristTarget(pose[15],pose,center,.5,4/3,0),forward=handWristTarget(pose[15],pose,center,.5,4/3,.3);
 assert.equal(forward.x,base.x);assert.equal(forward.y,base.y);
 assert.ok(near.z>base.z);assert.ok(Math.abs(forward.z-near.z-.15)<1e-12);
 assert.equal(handWristTarget(pose[15],pose,center,.5,4/3,null).z,near.z);
 assert.equal(handWristTarget(pose[15],pose,center,.5,4/3,-.2).z,near.z);
});

test('depth loss holds briefly, eases back and recovers without jumping',()=>{
 const depth=new WristDepth();
 for(let i=0;i<=120;i++)depth.update(.5,i*1000/60,i*1000/60,1/60);
 const previous=depth.display;
 assert.equal(depth.update(null,2100,2100,1/60),previous);
 const first=depth.update(null,2250,2250,1/60);assert.ok(first>0&&first<previous);
 for(let i=1;i<=120;i++)depth.update(null,2250+i*1000/60,2250+i*1000/60,1/60);
 const idle=depth.display,recovered=depth.update(.8,4300,4300,1/60);
 assert.ok(recovered>idle&&recovered<.2);
 depth.reset();assert.equal(depth.update(null,4400,4400,1/60),null);
});
