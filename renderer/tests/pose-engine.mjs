import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const assets=path.resolve(import.meta.dirname,'../../src/HoloTrack.App/Assets/Renderer');
const result=await build({stdin:{contents:`
 import {PoseLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
 try{
  const files=await FilesetResolver.forVisionTasks('./wasm');
  const task=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./pose_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,outputSegmentationMasks:false});
  const image=new Image();image.src='./avatar.png';await image.decode();
  const output=task.detectForVideo(image,1);
  window.testResult={valid:Array.isArray(output.worldLandmarks),count:output.worldLandmarks.length};
  task.close();
 }catch(e){window.testResult={error:String(e)};}
 `,resolveDir:path.resolve(import.meta.dirname,'..')},bundle:true,format:'esm',write:false});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(60000);
 await page.route('https://holotrack.local/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  if(name==='index.html')return route.fulfill({body:'<script type="module" src="pose-test.js"></script>',contentType:'text/html'});
  if(name==='pose-test.js')return route.fulfill({body:result.outputFiles[0].text,contentType:'text/javascript'});
  const file=name==='avatar.png'?path.resolve(import.meta.dirname,'../../artifacts/body-preview.png'):path.join(assets,name);
  return route.fulfill({body:await fs.readFile(file),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':name.endsWith('.png')?'image/png':'application/octet-stream'});
 });
 await page.goto('https://holotrack.local/index.html');
 await page.waitForFunction(()=>window.testResult,null,{polling:100});
 const output=await page.evaluate(()=>window.testResult);
 assert.equal(output.error,undefined);assert.equal(output.valid,true);
 console.log('PASS bundled offline PoseLandmarker loads and runs inference:',output.count,'poses');
}finally{await browser.close();}
