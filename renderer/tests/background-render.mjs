import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const bundle=await build({stdin:{contents:`
import * as THREE from 'three';
import {AvatarBackground} from './background.js';
window.checkBackground=async()=>{
 const scene=new THREE.Scene(),background=new AvatarBackground(scene);
 const renderer=new THREE.WebGLRenderer({alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
 renderer.setSize(128,72);renderer.setClearColor(0,0);
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
 const captureCanvas=document.createElement('canvas');captureCanvas.width=128;captureCanvas.height=72;
 const capture=captureCanvas.getContext('2d',{willReadFrequently:true});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.5,.5),new THREE.MeshBasicMaterial({color:0xffffff}));scene.add(mesh);
 const pixel=(x,y)=>{const data=new Uint8Array(4);renderer.getContext().readPixels(x,y,1,1,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,data);return [...data];};
 const colors={};
 for(const color of ['#ff0000','#00ff00','#0000ff','#000000','transparent']){
  await background.set({color});renderer.render(scene,camera);
  capture.clearRect(0,0,128,72);capture.drawImage(renderer.domElement,0,0);
  colors[color]={corner:pixel(0,0),avatar:pixel(64,36),output:[...capture.getImageData(0,0,1,1).data]};
 }
 const images=[];
 for(const [w,h] of [[400,100],[100,400]]){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const context=canvas.getContext('2d');context.fillStyle='#ff0000';context.fillRect(0,0,w,h);
  await background.set({imageUrl:canvas.toDataURL()});renderer.render(scene,camera);
  images.push({repeat:background.texture.repeat.toArray(),offset:background.texture.offset.toArray(),corner:pixel(0,0)});
 }
 const previous=scene.background;
 let failed=false;try{await background.set({imageUrl:'data:image/png;base64,invalid'});}catch{failed=true;}
 const preserved=scene.background===previous;
 const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
 const pending=background.set({imageUrl:canvas.toDataURL()});await background.set({color:'#00ff00'});
 const stale=await pending;
 renderer.render(scene,camera);const final=pixel(0,0);renderer.dispose();
 return {colors,images,failed,preserved,stale,final};
};`,resolveDir:'src',loader:'js'},bundle:true,write:false,format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.setContent('<html><body></body></html>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>window.checkBackground());
 for(const [color,expected] of Object.entries({'#ff0000':[255,0,0,255],'#00ff00':[0,255,0,255],'#0000ff':[0,0,255,255],'#000000':[0,0,0,255],transparent:[0,0,0,0]})){
  assert.deepEqual(result.colors[color].corner,expected);assert.deepEqual(result.colors[color].output,expected);assert.equal(result.colors[color].avatar[3],255);
 }
 assert.ok(result.images[0].repeat[0]<1);assert.equal(result.images[0].repeat[1],1);
 assert.ok(result.images[1].repeat[1]<1);assert.equal(result.images[1].repeat[0],1);
 for(const image of result.images)assert.deepEqual(image.corner,[255,0,0,255]);
 assert.ok(result.failed&&result.preserved);assert.equal(result.stale,false);assert.deepEqual(result.final,[0,255,0,255]);
 console.log('PASS: colors, transparent alpha, opaque avatar, image cover, failed image preservation, stale load cancellation');
}finally{await browser.close();}
