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
window.checkHead=async()=>{
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 const gltf=await loader.loadAsync('/avatar.vrm'); const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
 const head=vrm.humanoid.getNormalizedBoneNode('head'),raw=vrm.humanoid.getRawBoneNode('head');
 vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
 const neutral=raw.getWorldQuaternion(new THREE.Quaternion());
 const basis=vrm.humanoid.normalizedHumanBonesRoot.getWorldQuaternion(new THREE.Quaternion());
 const result={version:vrm.meta.metaVersion,basis:basis.toArray(),axes:{}};
 for(const axis of ['x','y','z']){
  const e=new THREE.Euler();e[axis]=.2;
  head.quaternion.copy(avatarHeadRotation(new THREE.Quaternion().setFromEuler(e),1,basis));
  vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
  const delta=raw.getWorldQuaternion(new THREE.Quaternion()).multiply(neutral.clone().invert());
  const world=new THREE.Euler().setFromQuaternion(delta,'YXZ');
  result.axes[axis]=[world.x,world.y,world.z];
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
  console.log('PASS',path.basename(modelPath),'VRM',result.version,'pitch, yaw and tilt agree in scene coordinates');
  await page.close();
 }
}finally{await browser.close();}
