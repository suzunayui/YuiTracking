import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'esbuild';

const assets=path.resolve(import.meta.dirname,'../../src/HoloTrack.App/Assets/Renderer');
const model=await fs.readFile(process.argv[2]);
let bodyTestScript;
if(process.argv.includes('--check-body')||process.argv.includes('--check-hands')||process.argv.includes('--check-mouth')||process.argv.includes('--check-springs')){
 let source=await fs.readFile(path.resolve(import.meta.dirname,'../src/main.js'),'utf8');
 if(process.argv.includes('--check-mouth'))source=source.replace('function animate(now,dt){','function animate(now,dt){ if(window.testMouthWeights)latestFace={time:now,result:{faceBlendshapes:[{categories:Object.entries(window.testMouthWeights).map(([categoryName,score])=>({categoryName,score}))}]}};');
 const bundle=await build({stdin:{contents:source+`
 window.readTestSprings=()=>[...vrm.springBoneManager.joints].map(j=>({settings:{stiffness:j.settings.stiffness,drag:j.settings.dragForce},rotation:j.bone.quaternion.toArray()}));
 window.setTestMouth=weights=>{window.testMouthWeights=weights;};
 window.readTestMouthMorph=(name='aa')=>vrm.expressionManager.getExpression(name).binds.flatMap(bind=>bind.primitives?.map(mesh=>mesh.morphTargetInfluences[bind.index])??[]);
 window.readTestMouth=()=>Object.fromEntries(['aa','ih','ou','ee','oh','happy'].map(name=>[name,vrm.expressionManager.getValue(name)]));
 window.setTestPose=points=>{bodyNeutral={pitch:0,yaw:0,roll:0};latestPose={result:{worldLandmarks:[points]},time:performance.now()};};
 window.readTestBody=()=>({torso:['spine','chest','upperChest'].map(bone).filter(Boolean).map(n=>n.quaternion.toArray()),head:bone('head').quaternion.toArray()});
 window.setTestHand=(points)=>{latestHands={result:{landmarks:[points.map(p=>({x:.65+p.x,y:.55+p.y,z:p.z}))],worldLandmarks:[points],handedness:[[{categoryName:'Right'}]]},time:performance.now()};};
 window.readTestHand=()=>Object.fromEntries(['Hand','IndexProximal','IndexIntermediate','IndexDistal','ThumbMetacarpal','ThumbProximal','ThumbDistal'].map(n=>[n,bone('left'+n)?.quaternion.toArray()]));
 `,resolveDir:path.resolve(import.meta.dirname,'../src')},bundle:true,format:'esm',write:false});
 bodyTestScript=bundle.outputFiles[0].text;
}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu','--enable-unsafe-swiftshader']});
try{
 console.log('Browser started');
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 console.log('Page created');
 page.setDefaultTimeout(30000);
 page.on('pageerror',error=>console.error(error));
 await page.addInitScript(()=>{
  window.hostMessages=[];window.hostListener=null;
  window.chrome.webview={postMessage:m=>window.hostMessages.push(m),addEventListener:(type,f)=>{if(type==='message')window.hostListener=f;else if(type==='sharedbufferreceived')window.sharedListener=f;}};
 });
 // Mirror the native host origin without external network requests.
 await page.route('https://holotrack.local/**',route=>{
  if(bodyTestScript&&new URL(route.request().url()).pathname==='/main.js')return route.fulfill({body:bodyTestScript,contentType:'text/javascript'});
  if(new URL(route.request().url()).pathname==='/avatar.vrm')return route.fulfill({body:model,contentType:'model/gltf-binary'});
  const filename=(process.argv.includes('--baseline')&&new URL(route.request().url()).pathname==='/main.js')?path.resolve(import.meta.dirname,'../../artifacts/hair-before.js'):path.join(assets,new URL(route.request().url()).pathname.slice(1));
  return fs.readFile(filename).then(body=>route.fulfill({body,contentType:filename.endsWith('.js')?'text/javascript':filename.endsWith('.wasm')?'application/wasm':filename.endsWith('.html')?'text/html':'application/octet-stream'}));
 });
 await page.goto('https://holotrack.local/index.html');
 console.log('Renderer loaded');
 await page.waitForFunction(()=>window.hostMessages.some(m=>m.type==='ready'),null,{polling:100});
 if(!process.argv.includes('--check-pan')){
 await page.evaluate(()=>window.hostListener({data:{type:'loadModel',requestId:1}}));
 await page.waitForFunction(()=>window.hostMessages.some(m=>m.type==='modelLoaded'||m.type==='modelFailed'),null,{polling:100});
 assert.ok(await page.evaluate(()=>window.hostMessages.some(m=>m.type==='modelLoaded')), 'VRM must load successfully');
 await page.waitForTimeout(5000);
 }
 if(process.argv.includes('--check-mouth')){
  await page.evaluate(()=>window.hostListener({data:{type:'settings',mouthOpenStrength:2,mouthSensitivity:3,smoothing:.65,sensitivity:1,background:'#00ff00'}}));
  await page.evaluate(()=>window.hostListener({data:{type:'restoreFraming',zoom:2.46,x:0,y:1.6,z:3.08}}));
  await page.evaluate(()=>window.setTestMouth({jawOpen:.8,mouthFunnel:.7,mouthSmileLeft:.5,mouthSmileRight:.5}));
  await page.waitForTimeout(700);
  console.log('Wide-open mouth:',await page.evaluate(()=>window.readTestMouth()));
  assert.ok((await page.evaluate(()=>window.readTestMouth())).aa>.99);
  assert.ok((await page.evaluate(()=>window.readTestMouthMorph())).every(value=>value>1.9&&value<=2.01));
  await page.screenshot({path:path.resolve(assets,'../../../../artifacts/'+process.argv[3]+'-wide.png')});
  await page.evaluate(()=>window.setTestMouth({jawOpen:1}));
  await page.waitForTimeout(700);
  console.log('Full A:',await page.evaluate(()=>window.readTestMouth()));
  assert.ok((await page.evaluate(()=>window.readTestMouth())).aa>.99);
  console.log('PASS wide-open A and enlarged VRM morphs');
  for(const [name,weights] of [
   ['ih',{jawOpen:.02,mouthStretchLeft:.8,mouthStretchRight:.8}],
   ['ou',{jawOpen:.02,mouthPucker:.8}],
   ['ee',{jawOpen:.7,mouthStretchLeft:.8,mouthStretchRight:.8}],
   ['oh',{jawOpen:.7,mouthFunnel:.95}]
  ]){
   await page.evaluate(weights=>window.setTestMouth(weights),weights);await page.waitForTimeout(500);
   const values=await page.evaluate(()=>window.readTestMouth());
   assert.ok(values[name]>.7&&values.aa<.05,`${name} must retain its distinct mouth shape`);
   assert.ok((await page.evaluate(name=>window.readTestMouthMorph(name),name)).every(value=>value>1.4&&value<=2.01));
  }
  await page.evaluate(()=>window.setTestMouth({jawOpen:1}));await page.waitForTimeout(400);
  console.log('PASS all five vowel morphs are enlarged and preserve distinct shapes');
  await page.evaluate(()=>{window.setTestMouth({jawOpen:.1});window.hostListener({data:{type:'settings',mouthOpenStrength:1,mouthSensitivity:3,smoothing:.65,sensitivity:1,background:'#00ff00'}});});
  await page.waitForTimeout(400);
  const small=await page.evaluate(()=>({weight:window.readTestMouth().aa,morph:window.readTestMouthMorph()[0]}));
  await page.evaluate(()=>window.hostListener({data:{type:'settings',mouthOpenStrength:2,mouthSensitivity:3,smoothing:.65,sensitivity:1,background:'#00ff00'}}));await page.waitForTimeout(400);
  const large=await page.evaluate(()=>({weight:window.readTestMouth().aa,morph:window.readTestMouthMorph()[0]}));
  assert.ok(Math.abs(large.weight-small.weight)<.01,'Opening size must not change detection sensitivity');
  assert.ok(large.morph>small.morph*1.95,'Opening size must change rendered morph amplitude');
  await page.evaluate(()=>window.hostListener({data:{type:'settings',mouthOpenStrength:2,mouthSensitivity:.5,smoothing:.65,sensitivity:1,background:'#00ff00'}}));await page.waitForTimeout(400);
  assert.ok((await page.evaluate(()=>window.readTestMouth())).aa<large.weight*.3,'Sensitivity must control response to small input movements');
  console.log('PASS independent mouth size and sensitivity');


 }
 if(process.argv.includes('--check-springs')){
  const original=await page.evaluate(()=>window.readTestSprings());assert.ok(original.length>0);
  await page.evaluate(()=>window.hostListener({data:{type:'settings',springStrength:3,smoothing:.65,sensitivity:1,background:'#00ff00'}}));await page.waitForTimeout(1500);
  const strong=await page.evaluate(()=>window.readTestSprings());
  assert.ok(strong.every(j=>j.rotation.every(Number.isFinite)));
  assert.ok(strong.some((j,i)=>j.settings.drag<original[i].settings.drag));
  await page.evaluate(()=>window.hostListener({data:{type:'settings',springStrength:1,smoothing:.65,sensitivity:1,background:'#00ff00'}}));await page.waitForTimeout(300);
  assert.deepEqual((await page.evaluate(()=>window.readTestSprings())).map(j=>j.settings),original.map(j=>j.settings));
  console.log('PASS real VRM spring strength changes, finite rotations and restored physics');
 }
 if(process.argv.includes('--check-body')){
  const points=[];
  points[11]={x:-.05,y:-.5,z:-.1,visibility:1};points[12]={x:.35,y:-.5,z:.1,visibility:1};
  points[23]={x:-.15,y:0,z:0,visibility:1};points[24]={x:.15,y:0,z:0,visibility:1};
  await page.evaluate(points=>window.setTestPose(points),points);await page.waitForTimeout(150);
  const body=await page.evaluate(()=>window.readTestBody());
  assert.ok(body.torso.length>0&&body.torso.some(q=>Math.hypot(...q.slice(0,3))>.01),'VRM torso bones must respond to pose');
  assert.ok(Math.hypot(...body.head.slice(0,3))>.01,'Head must compensate for torso rotation');
  console.log('PASS pose rotates VRM torso and compensates head');
 }
 if(process.argv.includes('--check-hands')){
  const points=[{x:0,y:0,z:0}];
  for(let f=0;f<5;f++)for(let j=0;j<4;j++)points.push({x:(f-2)*.025,y:-.05-j*.025,z:0});
  for(let i=0;i<5;i++){await page.evaluate(p=>window.setTestHand(p),points);await page.waitForTimeout(100);}
  const open=await page.evaluate(()=>window.readTestHand());
  points[7]={x:points[6].x,y:points[6].y-.01,z:-.02};points[8]={x:points[6].x,y:points[6].y-.015,z:-.045};
  const tilted=points.map(v=>({x:v.x,y:v.y*Math.cos(.6)-v.z*Math.sin(.6),z:v.y*Math.sin(.6)+v.z*Math.cos(.6)}));
  for(let i=0;i<5;i++){await page.evaluate(p=>window.setTestHand(p),tilted);await page.waitForTimeout(100);}
  const closed=await page.evaluate(()=>window.readTestHand());
  for(const q of Object.values(closed))assert.ok(q&&q.every(Number.isFinite),'All hand and thumb bones must have finite rotations');
  const difference=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  assert.ok(difference(open.Hand,closed.Hand)>.05,'VRM hand must follow palm twist');
  assert.ok(difference(open.IndexIntermediate,closed.IndexIntermediate)>.05,'VRM finger must curl');
  assert.ok(difference(closed.IndexIntermediate,closed.IndexDistal)>.02,'Finger joints must have separate rotations');
  console.log('PASS VRM wrist twist, individual finger joints and thumb bones');
  await page.waitForTimeout(1800);
  const idle=await page.evaluate(()=>window.readTestHand());
  assert.ok(Math.hypot(...idle.Hand.slice(0,3))<.04,'Lost hand must ease back to neutral wrist');
  const restingFinger=[0,0,Math.sin(.12/2),Math.cos(.12/2)];
  assert.ok(difference(idle.IndexIntermediate,restingFinger)<.04,'Lost finger must ease back to resting curl');
  console.log('PASS lost VRM hand and fingers return to idle smoothly');
 }
 if(process.argv.includes('--check-transport')){
  await page.evaluate(()=>{
   window.testFrameBuffer=new ArrayBuffer(1280*720*4);
   window.sharedListener({additionalData:{type:'avatarFrame'},getBuffer:()=>window.testFrameBuffer});
   window.hostListener({data:{type:'output',value:true}});
  });
  await page.waitForTimeout(200);
  const first=await page.evaluate(()=>({count:window.hostMessages.filter(m=>m.type==='frameReady').length,pixel:[...new Uint8Array(window.testFrameBuffer).slice(0,4)]}));
  assert.equal(first.count,1,'Only one frame may be in flight');
  assert.deepEqual(first.pixel,[0,255,0,255],'Shared frame must contain avatar canvas pixels');
  await page.evaluate(()=>window.hostListener({data:{type:'privacy',value:true}}));
  await page.evaluate(()=>window.hostListener({data:{type:'frameAck'}}));await page.waitForTimeout(100);
  const next=await page.evaluate(()=>({count:window.hostMessages.filter(m=>m.type==='frameReady').length,pixel:[...new Uint8Array(window.testFrameBuffer).slice(0,4)]}));
  assert.equal(next.count,2,'Acknowledgment must release backpressure');
  assert.deepEqual(next.pixel,[23,27,46,255],'Shared output must preserve the privacy screen');
  await page.evaluate(()=>{window.hostListener({data:{type:'output',value:false}});window.hostListener({data:{type:'frameAck'}});});
  console.log('PASS shared-frame pixels, backpressure, acknowledgment and privacy');
 }
 if(process.argv.includes('--check-zoom')){
  await page.evaluate(()=>window.hostListener({data:{type:'demo'}}));
  await page.waitForTimeout(300);
  const snapshot=()=>page.locator('canvas').screenshot();
  const wheel=async(ctrlKey,deltaY)=>{
   const prevented=await page.locator('canvas').evaluate((canvas,{ctrlKey,deltaY})=>{
    const event=new WheelEvent('wheel',{ctrlKey,deltaY,bubbles:true,cancelable:true});
    canvas.dispatchEvent(event);return event.defaultPrevented;
   },{ctrlKey,deltaY});
   await page.waitForTimeout(100);return prevented;
  };
  // Compare rendered pixels, including ordinary wheel and both zoom directions.
  const before=await snapshot();
  assert.equal(await wheel(false,-120),false);
  assert.deepEqual(await snapshot(),before,'Ordinary wheel must not change framing');
  assert.equal(await wheel(true,-120),true);
  const enlarged=await snapshot();
  assert.notDeepEqual(enlarged,before,'Ctrl+wheel up must change avatar framing');
  await wheel(true,120);
  assert.deepEqual(await snapshot(),before,'Opposite wheel delta must restore framing');
  console.log('PASS Ctrl+wheel zoom and ordinary wheel behavior');
 }
 if(process.argv.includes('--check-pan')){
  await page.evaluate(()=>window.hostListener({data:{type:'demo'}}));
  await page.waitForTimeout(300);
  const centroid=()=>page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
   const ctx=canvas.getContext('2d');ctx.drawImage(document.querySelector('canvas'),0,0);
   const pixels=ctx.getImageData(0,0,1280,720).data;let x=0,y=0,n=0;
   for(let i=0;i<pixels.length;i+=4)if(pixels[i]>20&&pixels[i+2]>20){x+=(i/4)%1280;y+=Math.floor(i/4/1280);n++;}
   return {x:x/n,y:y/n};
  });
  const before=await centroid();
  await page.mouse.move(640,360);await page.mouse.down({button:'middle'});
  await page.mouse.move(720,310,{steps:5});await page.mouse.up({button:'middle'});
  await page.waitForTimeout(200);
  const after=await centroid();
  assert.ok(Math.abs(after.x-before.x-80)<3,'Avatar must follow horizontal drag');
  assert.ok(Math.abs(after.y-before.y+50)<3,'Avatar must follow vertical drag');
  await page.mouse.move(800,450);await page.waitForTimeout(100);
  const released=await centroid();
  assert.ok(Math.abs(released.x-after.x)<1&&Math.abs(released.y-after.y)<1,'Release must stop panning');
  await page.locator('canvas').evaluate(canvas=>canvas.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-120,cancelable:true})));
  await page.waitForTimeout(100);
  const saved=await page.evaluate(()=>window.hostMessages.filter(m=>m.type==='framingChanged').at(-1));
  assert.ok(saved.zoom>1,'Zoom must be included in saved framing');
  const framed=await centroid();
  await page.evaluate(()=>window.hostListener({data:{type:'restoreFraming',zoom:1,x:0,y:1.35,z:3.1}}));
  await page.waitForTimeout(100);
  const reset=await centroid();
  assert.ok(Math.abs(reset.x-before.x)<1&&Math.abs(reset.y-before.y)<1,'Default framing must restore');
  await page.evaluate(saved=>window.hostListener({data:{...saved,type:'restoreFraming'}}),saved);
  await page.waitForTimeout(100);
  const restored=await centroid();
  assert.ok(Math.abs(restored.x-framed.x)<1&&Math.abs(restored.y-framed.y)<1,'Saved zoom and position must restore');
  console.log('PASS framing save message and restore');
  console.log('PASS middle-button drag moves framing and release stops it');
 }
 const out=path.resolve(import.meta.dirname,'../../artifacts/'+(process.argv[3]||'vrm-render')+'.png');
 await page.locator('canvas').screenshot({path:out});
 if(process.argv.includes('--check-hair')){
  const pixels=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
   const ctx=canvas.getContext('2d');ctx.drawImage(document.querySelector('canvas'),0,0);
   const data=ctx.getImageData(0,0,1280,80).data;
   let n=0;for(let i=0;i<data.length;i+=4)if(data[i]>20&&data[i+2]>20)n++;return n;
  });
  assert.equal(pixels,0,'Hair must not stick upward into the top band of the frame');
  console.log('PASS hair stays below the top of the frame');
 }
 console.log(out);
}finally{await browser.close();}
