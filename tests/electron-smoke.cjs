const {_electron}=require('../renderer/node_modules/playwright');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const profile=await mkdtemp(path.join(tmpdir(),'yuitracking-smoke-'));
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'));
 let app;
 try{
  const packaged=process.argv.includes('--packaged');
  const launch=()=>_electron.launch({executablePath:packaged?path.resolve(__dirname,'../dist/electron/mac-arm64/YuiTracking.app/Contents/MacOS/YuiTracking'):require('../electron/node_modules/electron'),args:[...(packaged?[]:[path.resolve(__dirname,'../electron')]),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--user-data-dir='+profile],env});
  app=await launch();let page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('[data-sample=Y]')?.getAttribute('aria-pressed')==='true');
  assert.equal(await app.evaluate(async({session})=>(await session.defaultSession.fetch('https://example.invalid/yuitracking-network-check')).status),403,'External worker/session network requests must remain blocked');
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
  await page.locator('#motion-tab').click();
  assert.equal(await page.locator('#sensitivity').isDisabled(),false);
  await page.locator('#sensitivity').fill('4');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).sensitivity===4);
  await page.locator('#forwardLeanStrength').fill('2');
  await page.locator('#backwardLeanStrength').fill('3');
  await page.waitForFunction(async()=>{const s=await window.yuiDesktop.getSettings();return s.forwardLeanStrength===2&&s.backwardLeanStrength===3;});
  await page.locator('#bodyStrength').fill('20');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).bodyStrength===20);
  await page.locator('#springStrength').fill('5');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).springStrength===5);
  await page.locator('#mouthOpenStrength').fill('2');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).mouthOpenStrength===2);
  await page.evaluate(()=>{window.smokeTrackingResults=[];window.addEventListener('message',event=>{const message=event.data?.yuiRenderer;if(message?.type==='handDetection')window.smokeTrackingResults.push(message);});});
  if(process.argv.includes('--camera-label-mismatch')){
   await page.evaluate(()=>{nativeLabels=['macOS camera label'];browserLabels=false;document.querySelector('#cameras').replaceChildren(new Option('macOS camera label','native:0'));});
   const frame=page.frames().find(f=>f.url().includes('/renderer/'));
   await frame.evaluate(()=>{
    const media=navigator.mediaDevices,enumerate=media.enumerateDevices.bind(media),open=media.getUserMedia.bind(media);
    window.cameraOpenCalls=0;
    media.enumerateDevices=async()=>{const list=await enumerate();return window.cameraOpenCalls?list:list.map(d=>({kind:d.kind,deviceId:'',label:''}));};
    media.getUserMedia=async options=>{window.cameraOpenCalls++;return open(options);};
   });
  }
  if(process.argv.includes('--camera-reselect')){
   await page.evaluate(()=>{nativeLabels=['macOS camera label'];browserLabels=false;document.querySelector('#cameras').replaceChildren(new Option('macOS camera label','native:0'));});
   const frame=page.frames().find(f=>f.url().includes('/renderer/'));
   await frame.evaluate(()=>{
    const media=navigator.mediaDevices,enumerate=media.enumerateDevices.bind(media),open=media.getUserMedia.bind(media);
    window.cameraOpenCalls=0;
    media.enumerateDevices=async()=>{
     const list=await enumerate();
     if(!window.cameraOpenCalls)return list.map(d=>({kind:d.kind,deviceId:'',label:''}));
     return [...list.map(d=>({kind:d.kind,deviceId:d.deviceId,label:''})),{kind:'videoinput',deviceId:'second-camera',label:''}];
    };
    media.getUserMedia=async options=>{window.cameraOpenCalls++;return open(options);};
   });
   await page.locator('#tracking').click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('カメラ一覧を更新しました'),null,{timeout:60000});
   const options=await page.locator('#cameras option').evaluateAll(items=>items.map(item=>item.value).filter(id=>!id.startsWith('native:')));
   assert.equal(options.length,2);assert.ok(options.every(id=>id&&!id.startsWith('native:')),'Error must expose browser IDs instead of restoring the native list');
   await page.locator('#cameras').selectOption(options[0]);
  }
  await page.locator('#tracking').click();
  await page.waitForFunction(()=>document.querySelector('#tracking').textContent==='カメラを停止',null,{timeout:60000});
  await page.waitForFunction(()=>window.smokeTrackingResults.length>0,null,{timeout:60000});
  if(process.argv.includes('--camera-list-disappears')){
   await page.evaluate(()=>{
    nativeLabels=['MacBook Air Camera','iPhone Camera'];cameraPicker.known.clear();
    cameraMessage={items:[],selectionReady:true,labelsAvailable:false};updateCameras();
   });
   const labels=await page.locator('#cameras option').allTextContents();
   assert.deepEqual(labels,['MacBook Air Camera','iPhone Camera']);
   const phone=await page.locator('#cameras option').nth(1).getAttribute('value');
   await page.locator('#cameras').selectOption(phone);
   await page.evaluate(()=>window.yuiHost.postMessage({type:'cameras',items:[],selectionReady:true,labelsAvailable:false}));
   await page.waitForFunction(value=>document.querySelector('#cameras').value===value,phone);
   assert.equal(await page.locator('#cameras option').count(),2);
   assert.equal(await page.locator('#cameras option').nth(1).isDisabled(),false);
   const frame=page.frames().find(f=>f.url().includes('/renderer/'));
   const canvas=frame.locator('canvas');const bounds=await canvas.boundingBox();
   await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);
   await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.5+30,bounds.y+bounds.height*.5+35,{steps:4});await page.mouse.up();
   await page.waitForFunction(async()=>!!(await window.yuiDesktop.getSettings()).framing);
   assert.ok((await page.evaluate(()=>window.yuiDesktop.getSettings())).framing.y>1.35);
   console.log('PASS empty camera list keeps Mac/iPhone selection; primary drag moves and saves avatar framing');
  }
  if(process.argv.includes('--camera-label-mismatch')){
   const frame=page.frames().find(f=>f.url().includes('/renderer/'));
   assert.equal(await frame.evaluate(()=>window.cameraOpenCalls),1,'Mismatched single-camera labels must reuse one acquired stream');
   console.log('PASS native/browser label mismatch: recognition starts with one camera open and no stop/reopen');
  }
  if(process.argv.includes('--camera-reselect')){
   const frame=page.frames().find(f=>f.url().includes('/renderer/'));
   assert.equal(await frame.evaluate(()=>window.cameraOpenCalls),2,'Reselection opens exactly the selected ID after releasing the probe');
   console.log('PASS camera reselection: multiple hidden labels preserve browser IDs and recognition starts on retry');
  }
  await page.locator('#tracking').click();
  await page.waitForFunction(()=>document.querySelector('#tracking').textContent==='カメラを開始');
  if(await page.locator('#privacy').getAttribute('aria-pressed')!=='true')await page.locator('#privacy').click();
  if(process.platform==='darwin'){
   await page.locator('#avatar-tab').click();await page.locator('#syphon').click();
   await page.waitForFunction(()=>document.querySelector('#output-status').textContent.includes('送信中'));
   await app.evaluate(({app})=>{const {TextureReceiver}=process.mainModule.require(app.getAppPath()+'/node_modules/@napolab/texture-bridge-core');globalThis.syphonReceiver=new TextureReceiver('YuiTracking');});
   const waitPixel=async expected=>{
    for(let attempt=0;attempt<100;attempt++){
     const pixel=await app.evaluate(()=>{const frame=globalThis.syphonReceiver.receiveFrame();return frame?{width:frame.width,height:frame.height,rgba:[...frame.data.subarray(0,4)]}:null;});
     if(pixel&&pixel.rgba.slice(0,3).every((value,i)=>Math.abs(value-expected[i])<=2)){assert.equal(pixel.width,1280);assert.equal(pixel.height,720);return;}
     await page.waitForTimeout(50);
    }
    throw new Error('Syphon receiver did not receive expected avatar pixel '+expected);
   };
   try{
    await waitPixel([23,27,46]);
    await page.locator('#privacy').click();await waitPixel([0,255,0]);
    await page.locator('[data-background="#0000ff"]').click();await waitPixel([0,0,255]);
    await page.locator('[data-background=transparent]').click();
    await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).background==='transparent');
    for(let attempt=0;attempt<100;attempt++){const alpha=await app.evaluate(()=>globalThis.syphonReceiver.receiveFrame()?.data[3]);if(alpha===0)break;if(attempt===99)throw new Error('Transparent Syphon frame not received');await page.waitForTimeout(50);}
    await page.locator('#privacy').click();await waitPixel([23,27,46]);
    await page.locator('#avatar-tab').click();await page.locator('#syphon').click();
    console.log('PASS native Syphon receiver: avatar-only 720p, blue/green channels, emergency standby, stop');
   }finally{await app.evaluate(()=>globalThis.syphonReceiver.stop());}
  }
  await page.locator('#avatar-tab').click();
  await page.locator('[data-sample=Z]').click();
  await page.waitForFunction(()=>document.querySelector('[data-sample=Z]').getAttribute('aria-pressed')==='true',null,{timeout:60000});
  await page.locator('#maximize').click();
  assert.equal(await page.locator('#main').evaluate(el=>el.classList.contains('maximized')),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#main').evaluate(el=>el.classList.contains('maximized')),false);
  assert.ok((await page.evaluate(()=>window.yuiDesktop.memory())).mb>0);
  await page.evaluate(()=>window.yuiHost.postMessage({type:'status',text:'キャリブレーションの調整しました',temporary:true}));
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='キャリブレーションの調整しました');
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='VRMを表示中',null,{timeout:6000});
  if(await page.locator('#privacy').getAttribute('aria-pressed')==='true')await page.locator('#privacy').click();
  await page.waitForTimeout(300);
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'yuitracking-mac-ui.png')});
  await app.close();app=null;
  app=await launch();page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#mouthOpenStrength')?.value==='2'&&document.querySelector('#springStrength')?.value==='5'&&document.querySelector('#sensitivity')?.value==='4'&&document.querySelector('#bodyStrength')?.value==='20'&&document.querySelector('#forwardLeanStrength')?.value==='2'&&document.querySelector('#backwardLeanStrength')?.value==='3');
  await page.waitForFunction(()=>document.querySelector('[data-sample=Z]').getAttribute('aria-pressed')==='true',null,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
  console.log('PASS Electron preview, synthetic camera/recognition, stop, settings restored, no camera auto-start');
 }finally{if(app)await app.close();await rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
