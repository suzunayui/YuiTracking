import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ArmAssociation} from '../src/arm-association.js';
const pose=()=>Array.from({length:33},(_,i)=>({x:i===15?.7:i===16?.3:.5,y:.5,z:0,visibility:1}));
test('pose fallback follows the observed hand even when its handedness and pose side labels differ',()=>{
 const binding=new ArmAssociation(),p=pose();binding.updatePose(p,1,100);
 binding.observe('left',p[15],1,100);assert.equal(binding.wrist('left',100),null);
 binding.observe('left',p[15],2,110);assert.equal(binding.wrist('left',110),p[15]);assert.equal(binding.wrist('right',110),p[16]);
 const moved=pose();moved[15].x=.8;binding.updatePose(moved,2,150);assert.equal(binding.wrist('left',150).x,.8);
});
test('render repeats, crossed wrists and stale or hidden pose observations cannot bind or drive an arm',()=>{
 const b=new ArmAssociation(),p=pose();b.updatePose(p,1,100);for(let i=0;i<10;i++)b.observe('left',p[15],1,100);assert.equal(b.wrist('left',100),null);
 b.observe('left',{x:.5,y:.5,z:0},2,100);assert.equal(b.wrist('left',100),null);
 b.observe('left',p[15],3,100);b.observe('left',p[15],4,110);assert.ok(b.wrist('left',110));assert.equal(b.wrist('left',400),null);
 const hidden=pose();hidden[13].visibility=.1;b.updatePose(hidden,2,500);assert.equal(b.wrist('left',500),null);b.reset();assert.equal(b.wrist('right',500),null);
});
test('a confirmed association stays stable when arms cross',()=>{
 const b=new ArmAssociation(),p=pose();b.updatePose(p,1,0);b.observe('left',p[15],1,0);b.observe('left',p[15],2,10);
 const crossed=pose();crossed[15].x=.3;crossed[16].x=.7;b.updatePose(crossed,2,100);b.observe('left',crossed[16],3,100);
 assert.equal(b.wrist('left',100),crossed[15]);
});
