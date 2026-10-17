import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const bundle=await build({stdin:{contents:`
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {applyBodyTurn} from './body-turn.js';
window.checkWaist=async()=>{
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 const gltf=await loader.loadAsync('/avatar.vrm'),vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
 const root=vrm.humanoid.normalizedHumanBonesRoot,hips=vrm.humanoid.getNormalizedBoneNode('hips'),spine=vrm.humanoid.getNormalizedBoneNode('spine');
 const rawHips=vrm.humanoid.getRawBoneNode('hips'),rawSpine=vrm.humanoid.getRawBoneNode('spine');
 const selections=[];
 vrm.scene.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
  const hi=mesh.skeleton.bones.indexOf(rawHips),si=mesh.skeleton.bones.indexOf(rawSpine),vertices=[];
  if(hi<0||si<0)return;
  for(let i=0;i<indices.count;i++){
   let hw=0,sw=0;
   for(let j=0;j<4;j++){const index=indices.getComponent(i,j),weight=weights.getComponent(i,j);if(index===hi)hw+=weight;if(index===si)sw+=weight;}
   if(hw>.15&&sw>.15&&hw+sw>.95)vertices.push(i);
  }
  if(vertices.length)selections.push({mesh,vertices});
 });
 const radius=()=>{
  vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
  const points=[];
  for(const {mesh,vertices}of selections){mesh.skeleton.update();for(const index of vertices)points.push(mesh.localToWorld(mesh.getVertexPosition(index,new THREE.Vector3())));}
  const center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(points.length);
  return {count:points.length,radius:Math.sqrt(points.reduce((sum,p)=>sum+(p.x-center.x)**2+(p.z-center.z)**2,0)/points.length)};
 };
 hips.quaternion.identity();spine.quaternion.identity();const neutral=radius();
 const basis=root.getWorldQuaternion(new THREE.Quaternion()),worldBack=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
 const back=basis.clone().invert().multiply(worldBack).multiply(basis);
 spine.quaternion.copy(back);const previous=radius();
 applyBodyTurn(spine,hips,root,back,1);const fixed=radius();
 return {version:vrm.meta.metaVersion,neutral,previous,fixed};
};`,resolveDir:path.resolve(import.meta.dirname,'../src')},bundle:true,format:'esm',write:false});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const name of ['Y','Z']){
  const model=await fs.readFile(path.resolve(import.meta.dirname,'../../src/YuiTracking.App/Assets/Samples/AvatarSample_'+name+'.vrm'));
  const page=await browser.newPage();
  await page.route('https://yui-waist.test/**',route=>{
   const pathname=new URL(route.request().url()).pathname;
   return route.fulfill({body:pathname==='/avatar.vrm'?model:pathname==='/main.js'?bundle.outputFiles[0].text:'<script type="module" src="/main.js"></script>',contentType:pathname==='/avatar.vrm'?'model/gltf-binary':pathname==='/main.js'?'text/javascript':'text/html'});
  });
  await page.goto('https://yui-waist.test/');await page.waitForFunction(()=>!!window.checkWaist);
  const result=await page.evaluate(()=>window.checkWaist());
  assert.ok(result.neutral.count>20,'Need vertices blended between hips and spine');
  assert.ok(result.previous.radius<result.neutral.radius*.8,'Old 180 degree spine-only turn must reproduce waist collapse');
  assert.ok(Math.abs(result.fixed.radius/result.neutral.radius-1)<1e-4,'A backward full-body turn must preserve waist radius');
  console.log('PASS sample',name,'VRM',result.version,JSON.stringify(result));await page.close();
 }
}finally{await browser.close();}
