import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:`
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {avatarHeadRotation} from './head-rotation.js';
import {avatarBodyRotation} from './body-pose.js';
window.checkHead=async()=>{
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 const gltf=await loader.loadAsync('/avatar.vrm'); const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
 const head=vrm.humanoid.getNormalizedBoneNode('head'),raw=vrm.humanoid.getRawBoneNode('head');
 vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
 const neutral=raw.getWorldQuaternion(new THREE.Quaternion());
 const basis=vrm.humanoid.normalizedHumanBonesRoot.getWorldQuaternion(new THREE.Quaternion());
 const result={version:vrm.meta.metaVersion,basis:basis.toArray(),axes:{},bodyAxes:{}};
 for(const axis of ['x','y','z']){
  const e=new THREE.Euler();e[axis]=.2;
  head.quaternion.copy(avatarHeadRotation(new THREE.Quaternion().setFromEuler(e),1,basis));
  vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
  const delta=raw.getWorldQuaternion(new THREE.Quaternion()).multiply(neutral.clone().invert());
  const world=new THREE.Euler().setFromQuaternion(delta,'YXZ');
  result.axes[axis]=[world.x,world.y,world.z];
 }
 const torso=['spine','chest','upperChest'].map(name=>vrm.humanoid.getNormalizedBoneNode(name)).filter(Boolean);
 const rawTorso=vrm.humanoid.getRawBoneNode(torso.at(-1)===vrm.humanoid.getNormalizedBoneNode('upperChest')?'upperChest':torso.at(-1)===vrm.humanoid.getNormalizedBoneNode('chest')?'chest':'spine');
 const torsoNeutral=rawTorso.getWorldQuaternion(new THREE.Quaternion());
 for(const axis of ['pitch','yaw','roll']){
  const pose={pitch:0,yaw:0,roll:0};pose[axis]=.2;
  const target=avatarBodyRotation(pose,basis);
  for(const node of torso)node.quaternion.copy(new THREE.Quaternion().slerp(target,1/torso.length));
  head.quaternion.copy(target.clone().invert());
  vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
  const world=new THREE.Euler().setFromQuaternion(rawTorso.getWorldQuaternion(new THREE.Quaternion()).multiply(torsoNeutral.clone().invert()),'YXZ');
  result.bodyAxes[axis]=[world.x,world.y,world.z];
  result.bodyAxes[axis].push(raw.getWorldQuaternion(new THREE.Quaternion()).angleTo(neutral));
 }
 VRMUtils.deepDispose(vrm.scene);return result;
};`,resolveDir:path.resolve(import.meta.dirname,'../src')},bundle:true,format:'esm',write:false});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const modelPaths=process.argv.slice(2);
 if(!modelPaths.length)modelPaths.push(...['Y','Z'].map(name=>path.resolve(import.meta.dirname,`../../src/YuiTracking.App/Assets/Samples/AvatarSample_${name}.vrm`)));
 for(const modelPath of modelPaths){
  const model=await fs.readFile(modelPath);const page=await browser.newPage();
  await page.route('https://yui-head.test/**',route=>{
   const url=new URL(route.request().url());
   return route.fulfill({body:url.pathname==='/avatar.vrm'?model:url.pathname==='/main.js'?bundle.outputFiles[0].text:'<script type="module" src="/main.js"></script>',contentType:url.pathname==='/avatar.vrm'?'model/gltf-binary':url.pathname==='/main.js'?'text/javascript':'text/html'});
  });
  await page.goto('https://yui-head.test/');await page.waitForFunction(()=>!!window.checkHead);
  const result=await page.evaluate(()=>window.checkHead());
  for(const [axis,expected] of Object.entries({x:[.2,0,0],y:[0,-.2,0],z:[0,0,-.2]}))
   result.axes[axis].forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-5,modelPath+' '+axis+' must match the same scene-space direction'));
  for(const [axis,expected] of Object.entries({pitch:[-.2,0,0],yaw:[0,.2,0],roll:[0,0,-.2]})){
   result.bodyAxes[axis].slice(0,3).forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-5,modelPath+' body '+axis+' must agree'));
   assert.ok(result.bodyAxes[axis][3]<1e-5,'torso motion must not rotate the tracked head twice');
  }
  console.log('PASS',path.basename(modelPath),'VRM',result.version,'head/body directions agree; head compensation stays neutral');
  await page.close();
 }
}finally{await browser.close();}
