import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandIdentity} from '../src/hand-identity.js';
import {matchedPoseWrist} from '../src/hand-rig.js';
const point=x=>({x,y:.5,z:0,visibility:1});
const result=items=>({landmarks:items.map(([x])=>Array.from({length:21},()=>point(x))),worldLandmarks:items.map(()=>[point(0)]),handedness:items.map(([,label])=>[{categoryName:label,score:.99}])});
const xOf=(data,label)=>data.landmarks[data.handedness.findIndex(item=>item[0].categoryName===label)][0].x;

test('a one-frame handedness flip does not send either hand to the opposite arm',()=>{
 const identities=new HandIdentity();identities.assign(result([[.2,'Left'],[.8,'Right']]),0);
 const stable=identities.assign(result([[.79,'Left'],[.21,'Right']]),33);
 assert.equal(xOf(stable,'Left'),.21);assert.equal(xOf(stable,'Right'),.79);
});

test('a single remaining hand retains identity through a temporary wrong label',()=>{
 const identities=new HandIdentity();identities.assign(result([[.2,'Right']]),0);
 const stable=identities.assign(result([[.22,'Left']]),100);
 assert.equal(stable.landmarks.length,1);assert.equal(xOf(stable,'Right'),.22);
 const added=identities.assign(result([[.24,'Right'],[.8,'Left']]),133);
 assert.equal(xOf(added,'Left'),.8);assert.equal(xOf(added,'Right'),.24);
});

test('continuous crossed hands are allowed without assigning by screen side',()=>{
 const identities=new HandIdentity();
 for(let i=0;i<=20;i++){
  const x=.2+i*.03,data=identities.assign(result([[x,'Left'],[1-x,'Right']]),i*33);
  assert.equal(xOf(data,'Left'),x);assert.equal(xOf(data,'Right'),1-x);
 }
});

test('arm correspondence is retained rather than selecting the nearest opposite wrist',()=>{
 const identities=new HandIdentity(),pose=[];pose[15]=point(.2);pose[16]=point(.8);
 const first=identities.assign(result([[.2,'Left'],[.8,'Right']]),0,pose);
 assert.deepEqual(first.poseWristIndices,[15,16]);
 const later=identities.assign(result([[.22,'Left']]),100,pose);assert.equal(later.poseWristIndices[0],15);
 pose[15]=point(.8);pose[16]=point(.22);
 assert.equal(matchedPoseWrist(point(.22),pose,4/3,15),null,'Do not borrow the opposite arm when expected wrist is unavailable');
});

test('duplicate initial labels are not forced onto two arms and stale identity can reset',()=>{
 const identities=new HandIdentity();
 assert.equal(identities.assign(result([[.2,'Left'],[.8,'Left']]),0).landmarks.length,1);
 const later=identities.assign(result([[.7,'Right']]),1000);assert.equal(xOf(later,'Right'),.7);
 identities.reset();assert.equal(xOf(identities.assign(result([[.7,'Left']]),1100),'Left'),.7);
});
