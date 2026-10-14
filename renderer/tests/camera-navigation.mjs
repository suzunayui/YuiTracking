import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const source=await fs.readFile('src/main.js','utf8');
const bundle=await build({stdin:{contents:source+`
window.cameraState=()=>({zoom:camera.zoom,position:camera.position.toArray(),target:cameraTarget.toArray()});
window.robotReach=()=>{
 makeDemo();
 const pose=[];pose[11]={x:.3,y:.5,z:0,visibility:1};pose[12]={x:.7,y:.5,z:0,visibility:1};
 rigHand('left',Array.from({length:21},()=>({x:.5,y:.2,z:0})),1,null,pose);
 return arms.left.hand.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,1.38,.17));
};
`,resolveDir:'src',loader:'js'},bundle:true,write:false,format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.setContent('<html><body></body></html>');
 await page.evaluate(()=>{window.commands=null;window.messages=[];window.yuiHost={postMessage:m=>window.messages.push(m),addEventListener:(_,fn)=>window.commands=fn};});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const initial=await page.evaluate(()=>cameraState());
 await page.mouse.move(150,150);await page.mouse.wheel(0,-120);
 await page.waitForFunction(()=>cameraState().zoom>1);
 await page.mouse.down({button:'right'});await page.mouse.move(230,190,{steps:5});await page.mouse.up({button:'right'});
 const orbit=await page.evaluate(()=>cameraState());
 assert.notDeepEqual(orbit.position,initial.position);assert.deepEqual(orbit.target,initial.target);
 const radius=v=>Math.hypot(...v.position.map((n,i)=>n-v.target[i]));assert.ok(Math.abs(radius(orbit)-radius(initial))<1e-9);
 await page.mouse.down({button:'middle'});await page.mouse.move(250,205,{steps:3});await page.mouse.up({button:'middle'});
 const moved=await page.evaluate(()=>cameraState());assert.notDeepEqual(moved.target,orbit.target);
 assert.ok(Math.abs(radius(moved)-radius(initial))<1e-9);
 await page.evaluate(()=>commands({data:{type:'resetFraming'}}));assert.deepEqual(await page.evaluate(()=>cameraState()),initial);
 await page.evaluate(m=>commands({data:{type:'restoreFraming',zoom:m.zoom,x:m.position[0],y:m.position[1],z:m.position[2],targetX:m.target[0],targetY:m.target[1],targetZ:m.target[2]}}),moved);
 assert.deepEqual(await page.evaluate(()=>cameraState()),moved);
 await page.evaluate(()=>commands({data:{type:'restoreFraming',zoom:1,x:.2,y:1.5,z:3.1}}));
 assert.deepEqual((await page.evaluate(()=>cameraState())).target,[.2,1.25,0]);
 assert.ok(await page.evaluate(()=>robotReach())<.08);
 console.log('PASS: wheel without Ctrl, right-drag orbit, middle-drag pan, reset, saved orbit restoration, legacy framing, robot hand reaches face');
}finally{await browser.close();}
