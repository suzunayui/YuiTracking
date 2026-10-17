import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const bundle=await build({stdin:{contents:`
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {captureFaceSurface,avatarFaceAnchor} from './face-hand-placement.js';
window.checkSurface=async()=>{
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 const gltf=await loader.loadAsync('/avatar.vrm'),vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
 const bone=name=>vrm.humanoid.getNormalizedBoneNode(name),head=bone('head');
 const surface=captureFaceSurface(vrm);head.userData.yuiFaceSurface=surface;
 const anchor=avatarFaceAnchor(head,bone('leftEye'),bone('rightEye'),.4),origin=head.getWorldPosition(new THREE.Vector3());
 const localMouth=head.worldToLocal(anchor.mouth.clone()),samples=[];
 for(const angle of [0,.9,-.9,Math.PI]){
  head.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),angle);vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
  const moved=avatarFaceAnchor(head,bone('leftEye'),bone('rightEye'),.4),expected=head.localToWorld(localMouth.clone());
  samples.push({error:moved.mouth.distanceTo(expected),normalLength:moved.forward.length(),orthogonal:moved.right.dot(moved.forward),mouthForward:moved.mouth.clone().sub(head.getWorldPosition(new THREE.Vector3())).dot(moved.forward)});
 }
 return {surface,width:anchor.width,depth:anchor.mouth.clone().sub(origin).dot(anchor.forward),samples};
};`,resolveDir:path.resolve(import.meta.dirname,'../src')},bundle:true,format:'esm',write:false});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const name of ['Y','Z']){
  const model=await fs.readFile(path.resolve(import.meta.dirname,'../../src/YuiTracking.App/Assets/Samples/AvatarSample_'+name+'.vrm')),page=await browser.newPage();
  await page.route('https://yui-face.test/**',route=>{
   const p=new URL(route.request().url()).pathname;
   return route.fulfill({body:p==='/avatar.vrm'?model:p==='/main.js'?bundle.outputFiles[0].text:'<script type="module" src="/main.js"></script>',contentType:p==='/avatar.vrm'?'model/gltf-binary':p==='/main.js'?'text/javascript':'text/html'});
  });
  await page.goto('https://yui-face.test/');await page.waitForFunction(()=>!!window.checkSurface);
  const result=await page.evaluate(()=>window.checkSurface());
  assert.ok(result.surface?.count>10&&result.surface.front>0,'Measure actual face vertices');
  assert.ok(result.depth>0&&result.depth<result.width,'Face anchor should lie at a plausible measured surface');
  for(const sample of result.samples){assert.ok(sample.error<1e-6&&Math.abs(sample.normalLength-1)<1e-10&&Math.abs(sample.orthogonal)<1e-10&&sample.mouthForward>0);}
  console.log('PASS measured face surface',name,JSON.stringify(result));await page.close();
 }
}finally{await browser.close();}
