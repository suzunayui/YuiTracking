import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {LandmarkFilter} from '../src/landmark-filter.js';
import {trackedElbowTarget,elbowPoleDirection} from '../src/hand-rig.js';
const point=(x,y,z=0)=>({x,y,z,visibility:1});
function pose(){
 const p=[];p[11]=point(.3,.5);p[12]=point(.7,.5);
 p[13]=point(.2,.4,-.1);p[14]=point(.8,.4,.1);
 p[15]=point(.4,.2);p[16]=point(.6,.2);return p;
}
const center=new Vector3(0,1.2,0);

test('elbows follow matched wrists even when hands cross on screen',()=>{
 const p=pose(),left=trackedElbowTarget(p[15],p,center,.5),right=trackedElbowTarget(p[16],p,center,.5);
 assert.ok(left.x>0&&right.x<0);assert.ok(left.z>.15&&right.z<.15);
 [p[15],p[16]]=[p[16],p[15]];
 assert.ok(trackedElbowTarget(p[15],p,center,.5).distanceTo(left)<1e-12);
 assert.ok(trackedElbowTarget(p[16],p,center,.5).distanceTo(right)<1e-12);
});

test('missing, low-confidence or unmatched arm observations use fallback',()=>{
 for(const mutate of [p=>p[13]=null,p=>p[13].visibility=.1,p=>p[11].visibility=.1,p=>p[13].z=NaN,p=>{p[15]=point(0,1);p[16]=point(1,1);}]){
  const p=pose();mutate(p);assert.equal(trackedElbowTarget(point(.4,.2),p,center,.5),null);
 }
 assert.equal(trackedElbowTarget(point(.4,.2),null,center,.5),null);
});

test('collinear elbow hints keep a finite perpendicular bend direction',()=>{
 for(const dir of [new Vector3(1,0,0),new Vector3(.4,-1,-.2).normalize()]){
  const pole=elbowPoleDirection(dir.clone(),new Vector3(),dir,1);
  assert.ok(Math.abs(pole.length()-1)<1e-12);assert.ok(Math.abs(pole.dot(dir))<1e-12);
 }
});

test('only elbow and pose-wrist observations are filtered and missing arms reset their history',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const elbowFilters=Array.from({length:4},()=>new LandmarkFilter()),context={elbowFilters};
 runInNewContext(source.slice(source.indexOf('function stabilizeElbows('),source.indexOf('async function listCameras(')),context);
 const a=pose(),b=pose(),world=[point(0,0)];context.stabilizeElbows({landmarks:[a],worldLandmarks:[world]},0);
 b[13].x=.4;const result=context.stabilizeElbows({landmarks:[b],worldLandmarks:[world]},100);
 assert.ok(result.landmarks[0][13].x>.2&&result.landmarks[0][13].x<.4);
 assert.equal(b[13].x,.4);assert.equal(result.landmarks[0][11],b[11]);assert.equal(result.worldLandmarks[0],world);
 const missing=pose();missing[13].visibility=.1;context.stabilizeElbows({landmarks:[missing]},200);
 assert.equal(elbowFilters[0].points,null);
 context.stabilizeElbows({landmarks:[]},300);assert.ok(elbowFilters.every(filter=>filter.points===null));
});
