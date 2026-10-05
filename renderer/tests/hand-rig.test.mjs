import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {palmBasis,fingerSegments,shoulderWristTarget} from '../src/hand-rig.js';
export function fixture(){
 const p=[{x:0,y:0,z:0}];
 for(let f=0;f<5;f++)for(let j=0;j<4;j++)p.push({x:(f-2)*.025,y:-.05-j*.025,z:0});
 return p;
}
test('palm orientation follows wrist twist without invalid quaternions',()=>{
 const p=fixture();const before=palmBasis(p);assert.ok(before);
 const tilted=p.map(v=>({x:v.x,y:v.y*Math.cos(.6),z:v.y*Math.sin(.6)}));
 const after=palmBasis(tilted);assert.ok(Math.abs(before.angleTo(after)-.6)<1e-8);
 assert.equal(palmBasis(Array.from({length:21},()=>({x:0,y:0,z:0}))),null);
});
test('each finger segment follows its own direction including thumb',()=>{
 const p=fixture();const open=fingerSegments(p);
 p[7]={x:p[6].x,y:p[6].y-.01,z:-.02};p[8]={x:p[6].x,y:p[6].y-.015,z:-.045};
 const curled=fingerSegments(p);
 assert.ok(open[1][1].angleTo(curled[1][1])>.5);
 assert.ok(curled[1][1].angleTo(curled[1][2])>.1);
 assert.ok(open[2][1].angleTo(curled[2][1])<1e-7);
 assert.ok(curled[0].every(v=>v&&Math.abs(v.length()-1)<1e-8));
});
test('wrist location uses shoulder center and falls back when shoulders disappear',()=>{
 const pose=[];pose[11]={x:.3,y:.4,z:0,visibility:1};pose[12]={x:.7,y:.4,z:0,visibility:1};
 const center=new Vector3(0,1.3,0);
 const raised=shoulderWristTarget({x:.5,y:.2,z:0},pose,center,.4);
 const lowered=shoulderWristTarget({x:.5,y:.6,z:0},pose,center,.4);
 assert.ok(raised.y>center.y&&lowered.y<center.y);
 assert.ok(shoulderWristTarget({x:.7,y:.4,z:0},pose,center,.4).x<0);
 pose[11].visibility=.1;assert.equal(shoulderWristTarget({x:.5,y:.2,z:0},pose,center,.4),null);
});
