import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const assets=path.resolve(import.meta.dirname,'../../src/YuiTracking.App/Assets/Renderer');
const packageRoot=path.resolve(import.meta.dirname,'../node_modules/@mediapipe/tasks-vision');
const version=JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8')).version;
for(const name of (await fs.readdir(path.join(assets,'wasm'))).filter(name=>/^vision_wasm.*\.(js|wasm)$/.test(name))){
 let original;try{original=await fs.readFile(path.join(packageRoot,name));}catch{original=await fs.readFile(path.join(packageRoot,'wasm',name));}
 const actual=await fs.readFile(path.join(assets,'wasm',name));
 assert.equal(createHash('sha256').update(actual).digest('hex'),createHash('sha256').update(original).digest('hex'),'WASM runtime must match installed package: '+name);
}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{window.hostMessages=[];window.chrome.webview={postMessage:message=>window.hostMessages.push(message),addEventListener:(type,callback)=>{if(type==='message')window.hostListener=callback;}};});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://yuitracking.local')return route.fulfill({status:403,body:'Blocked'});
  const relative=url.pathname.slice(1),extension=path.extname(relative);
  try{return route.fulfill({body:await fs.readFile(path.join(assets,relative)),contentType:extension==='.js'?'text/javascript':extension==='.wasm'?'application/wasm':extension==='.html'?'text/html':'application/octet-stream'});}
  catch{return route.fulfill({status:404,body:'Not found'});}
 });
 await page.goto('https://yuitracking.local/index.html');
 await page.waitForFunction(()=>window.hostMessages.some(m=>m.type==='ready'));
 await page.evaluate(()=>window.hostListener({data:{type:'startTracking'}}));
 await page.waitForFunction(()=>window.hostMessages.some(m=>m.type==='handDetection')||window.hostMessages.some(m=>m.type==='error'),null,{timeout:60000});
 const result=await page.evaluate(()=>window.hostMessages);
 assert.ok(!result.some(m=>m.type==='error'),JSON.stringify(result.filter(m=>m.type==='error')));
 assert.ok(result.some(m=>m.type==='tracking'&&m.active)&&result.some(m=>m.type==='cameraInput')&&result.some(m=>m.type==='handDetection'));
 await page.evaluate(()=>window.hostListener({data:{type:'stopTracking'}}));
 await page.waitForFunction(()=>window.hostMessages.some(m=>m.type==='tracking'&&!m.active));
 console.log('PASS Chrome recognition worker: MediaPipe '+version+', matching WASM assets, three model initialization/inference and stop');
}finally{await browser.close();}
