import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const bundle=await build({stdin:{contents:`
import * as THREE from 'three';
import {FrameCapture} from './frame-capture.js';
window.checkCapture=()=>{
 const width=1280,height=720;
 const renderer=new THREE.WebGLRenderer({alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:true});
 renderer.setSize(width,height);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
 for(const [x,y,color,opacity] of [[-.45,.45,0xff0000,1],[.45,-.45,0x00ff00,.5]]){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.7,.7),new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity}));
  mesh.position.set(x,y,0);scene.add(mesh);
 }
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const old=canvas.getContext('2d',{willReadFrequently:true}),capture=new FrameCapture(renderer,width,height);
 let maxDifference=0,reused=true,first,alpha;
 for(let frame=0;frame<120;frame++){
  scene.background=frame%3===0?null:new THREE.Color(frame%3===1?0x0000ff:0x000000);
  renderer.render(scene,camera);
  old.clearRect(0,0,width,height);old.drawImage(renderer.domElement,0,0);
  const expected=old.getImageData(0,0,width,height).data,actual=capture.read();
  first??=actual;reused&&=actual===first;
  for(let i=0;i<expected.length;i++)maxDifference=Math.max(maxDifference,Math.abs(expected[i]-actual[i]));
  if(frame===0)alpha=[actual[3],actual[(height-1)*width*4+3],actual[(540*width+900)*4+3]];
 }
 // A transferable host must receive an owned copy, leaving the reused buffer attached.
 const transferred=capture.read().slice();structuredClone(transferred,{transfer:[transferred.buffer]});
 const intact=capture.read().byteLength===width*height*4;
 renderer.dispose();return {maxDifference,reused,intact,alpha};
};`,resolveDir:'src'},bundle:true,write:false,format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.setContent('<html><body></body></html>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>window.checkCapture());
 assert.ok(result.maxDifference<=2,JSON.stringify(result));
 assert.ok(result.reused&&result.intact);assert.equal(result.alpha[0],0);assert.ok(Math.abs(result.alpha[2]-128)<=1);
 console.log('PASS WebGL capture parity: orientation, RGB, transparency, 120-frame buffer reuse, transferable copy',result);
}finally{await browser.close();}
