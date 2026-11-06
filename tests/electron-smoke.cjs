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
  if(process.argv.includes('--vrm-picker')){
   const model=await app.evaluate(async({app,dialog})=>{
    const fs=process.mainModule.require('node:fs/promises'),path=process.mainModule.require('node:path');
    const folder=path.join(app.getPath('userData'),'VRM folder');await fs.mkdir(folder,{recursive:true});
    const file=path.join(folder,'picker-avatar.vrm');
    const source=app.isPackaged?path.join(process.resourcesPath,'Samples','AvatarSample_Y.vrm'):path.resolve(app.getAppPath(),'../src/YuiTracking.App/Assets/Samples/AvatarSample_Y.vrm');
    await fs.copyFile(source,file);globalThis.pickerCalls=[];
    dialog.showOpenDialog=async(_owner,options)=>{globalThis.pickerCalls.push(options);return globalThis.pickerCalls.length===1?{canceled:false,filePaths:[file]}:{canceled:true,filePaths:[]};};
    return {folder,file};
   });
   await page.locator('#open').click();await page.locator('#vrm-file').click();
   await page.waitForFunction(()=>document.querySelector('#model').textContent==='picker-avatar.vrm');
   await page.evaluate(()=>window.yuiDesktop.openModel());
   assert.equal(await app.evaluate(()=>globalThis.pickerCalls[1].defaultPath),model.folder);
   await page.evaluate(()=>{document.querySelector('#samples').open=true;});await page.locator('[data-sample=Y]').click();
   await page.waitForFunction(()=>document.querySelector('[data-sample=Y]').getAttribute('aria-pressed')==='true');
   await page.evaluate(()=>window.yuiDesktop.openModel());
   assert.equal(await app.evaluate(()=>globalThis.pickerCalls[2].defaultPath),model.folder,'Built-in sample must fall back to last custom VRM folder');
   assert.equal((await page.evaluate(()=>window.yuiDesktop.getSettings())).defaultVrmPath,model.file,'Cancel must preserve saved model');
   console.log('PASS VRM dialog current folder, last custom folder after sample selection, and cancellation');
  }
  if(process.argv.includes('--gpu-recognition')){
   await page.waitForFunction(()=>document.querySelector('#recognition-device option[value=GPU]'));
   const before=await page.evaluate(()=>window.yuiDesktop.getRecognitionSettings());assert.equal(before.current,'CPU');
   await page.locator('#recognition-device').selectOption('GPU');await page.locator('#save-recognition').click();
   await page.waitForFunction(async()=>(await window.yuiDesktop.getRecognitionSettings()).saved==='GPU');
   assert.equal((await page.evaluate(()=>window.yuiDesktop.getRecognitionSettings())).current,'CPU','Saving must not switch engines in a running process');
   await app.close();app=null;app=await launch();page=await app.firstWindow();
   await page.waitForFunction(()=>document.querySelector('[data-sample=Y]')?.getAttribute('aria-pressed')==='true');
   const after=await page.evaluate(()=>window.yuiDesktop.getRecognitionSettings());assert.equal(after.current,'GPU');
  }
  assert.equal(await app.evaluate(async({session})=>(await session.defaultSession.fetch('https://example.invalid/yuitracking-network-check')).status),403,'External worker/session network requests must remain blocked');
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
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
  await page.waitForFunction(()=>!document.querySelector('#chestSpringStrength').disabled);
  await page.locator('#chestSpringStrength').fill('20');
  await page.locator('#nearZoomStrength').fill('20');
  await page.locator('#zoomCenterX').fill('12.3');
  await page.locator('#zoomCenterY').fill('-18.6');
  await page.locator('#farZoomStrength').fill('2');
  await page.locator('#gazeRange').fill('4');
  await page.locator('#gazeStrength').fill('2');await page.locator('#gazeMode').selectOption('camera');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).gazeMode==='camera');
  assert.equal(await page.locator('#gazeStrength').isDisabled(),true);
  assert.equal(await page.locator('#gazeRange').isDisabled(),false);
  await page.locator('#gazeMode').selectOption('fixed');assert.equal(await page.locator('#gazeRange').isDisabled(),true);
  await page.locator('#gazeMode').selectOption('tracking');assert.equal(await page.locator('#gazeStrength').isDisabled(),false);assert.equal(await page.locator('#gazeRange').isDisabled(),false);
  await page.locator('#gazeMode').selectOption('camera');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).chestSpringStrength===20);
  await page.locator('#mouthOpenStrength').fill('2');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).mouthOpenStrength===2);
  await page.evaluate(()=>{window.smokeTrackingResults=[];window.addEventListener('message',event=>{const message=event.data?.yuiRenderer;if(message?.type==='handDetection')window.smokeTrackingResults.push(message);if(message?.type==='recognitionReady')window.smokeBackend=message;});});
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
   const options=await page.locator('#cameras option').evaluateAll(items=>items.map(item=>item.value).filter(id=>id!=='default:'&&!id.startsWith('native:')));
   assert.equal(options.length,2);assert.ok(options.every(id=>id&&!id.startsWith('native:')),'Error must expose browser IDs instead of restoring the native list');
   await page.locator('#cameras').selectOption(options[0]);
  }
  if(process.argv.includes('--default-camera-enumeration-failure')){
   await page.locator('#cameras').selectOption('default:');
   const frame=page.frames().find(f=>f.url().includes('/renderer/'));
   await frame.evaluate(()=>{navigator.mediaDevices.enumerateDevices=async()=>{throw new DOMException('Enumeration unavailable','NotReadableError');};});
  }
  await page.locator('#tracking').click();
  await page.waitForFunction(()=>document.querySelector('#tracking').textContent==='カメラを停止',null,{timeout:60000});
  await page.waitForFunction(()=>window.smokeTrackingResults.length>0,null,{timeout:60000});
  if(process.argv.includes('--gpu-recognition')){
   const backend=await page.evaluate(()=>window.smokeBackend);assert.equal(backend.delegate,'GPU');
   const info=await page.evaluate(()=>window.yuiDesktop.getRecognitionSettings());assert.ok(backend.renderer.includes(info.currentName));
   console.log('PASS saved GPU recognition after restart: '+backend.renderer);
  }
  if(process.argv.includes('--default-camera-enumeration-failure')){
   await page.waitForFunction(()=>document.querySelector('#camera-note').textContent.includes('Enumeration unavailable'));
   assert.ok(!(await page.locator('#status').textContent()).includes('カメラを開始できません'));
   await page.locator('#pan-mode').click();
   const frame=page.frames().find(f=>f.url().includes('/renderer/')),bounds=await frame.locator('canvas').boundingBox();
   await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
   await page.mouse.wheel(30,-30);
   await page.waitForFunction(async()=>!!(await window.yuiDesktop.getSettings()).framing);
   const framing=await page.evaluate(()=>window.yuiDesktop.getSettings());assert.ok(framing.framing.x>0&&framing.framing.y>1.35);
   await page.locator('#pan-mode').click();
   console.log('PASS system-default recognition survives enumeration failure; scroll pan button moves and saves framing');
  }
  if(process.argv.includes('--camera-list-disappears')){
   await page.evaluate(()=>{
    nativeLabels=['MacBook Air Camera','iPhone Camera'];cameraPicker.known.clear();
    cameraMessage={items:[],selectionReady:true,labelsAvailable:false};updateCameras();
   });
   const labels=await page.locator('#cameras option').allTextContents();
   assert.deepEqual(labels,['システム既定のカメラ','MacBook Air Camera','iPhone Camera']);
   const phone=await page.locator('#cameras option').nth(2).getAttribute('value');
   await page.locator('#cameras').selectOption(phone);
   await page.evaluate(()=>window.yuiHost.postMessage({type:'cameras',items:[],selectionReady:true,labelsAvailable:false}));
   await page.waitForFunction(value=>document.querySelector('#cameras').value===value,phone);
   assert.equal(await page.locator('#cameras option').count(),3);
   assert.equal(await page.locator('#cameras option').nth(2).isDisabled(),false);
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
   await page.locator('#syphon').click();
   await page.waitForFunction(()=>document.querySelector('#output-status').textContent.includes('送信中'));
   await app.evaluate(({app})=>{const {TextureReceiver}=process.mainModule.require(app.getAppPath()+'/node_modules/@napolab/texture-bridge-core');globalThis.syphonReceiver=new TextureReceiver('YuiTracking');});
   const waitTransparent=async()=>{
    for(let attempt=0;attempt<100;attempt++){
     const pixel=await app.evaluate(()=>{const frame=globalThis.syphonReceiver.receiveFrame();return frame?{width:frame.width,height:frame.height,alpha:frame.data[3]}:null;});
     if(pixel?.alpha===0){assert.equal(pixel.width,1280);assert.equal(pixel.height,720);return;}
     await page.waitForTimeout(50);
    }
    throw new Error('Transparent Syphon frame not received');
   };
   try{
    await waitTransparent();
    await page.locator('#privacy').click();
    await waitTransparent();
    await page.locator('#privacy').click();
    await waitTransparent();
    await page.locator('#syphon').click();
    console.log('PASS native Syphon receiver: avatar-only 720p, transparent output and hidden state, stop');
   }finally{await app.evaluate(()=>globalThis.syphonReceiver.stop());}
  }
  const screenshotDir=process.env.YUI_SMOKE_SCREENSHOTS||require('node:os').tmpdir();
  const shot=name=>page.screenshot({path:path.join(screenshotDir,name)});
  if(await page.locator('#privacy').getAttribute('aria-pressed')==='true')await page.locator('#privacy').click();
  const pickerFile=await app.evaluate(async({app,dialog})=>{
   const fs=process.mainModule.require('node:fs/promises'),path=process.mainModule.require('node:path');
   const folder=path.join(app.getPath('userData'),'Gallery');await fs.mkdir(folder,{recursive:true});
   const file=path.join(folder,'gallery-avatar.vrm');
   await fs.copyFile(app.isPackaged?path.join(process.resourcesPath,'Samples','AvatarSample_Y.vrm'):path.resolve(app.getAppPath(),'../src/YuiTracking.App/Assets/Samples/AvatarSample_Y.vrm'),file);
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
   return file;
  });
  // An unseen window pauses requestAnimationFrame on macOS; Syphon output renders on a timer instead.
  const previewFrame=page.frames().find(f=>f.url().includes('/renderer/'));
  console.log('Preview state',await previewFrame.evaluate(()=>new Promise(resolve=>{let frames=0;const count=()=>{frames++;requestAnimationFrame(count);};requestAnimationFrame(count);setTimeout(()=>resolve({visibility:document.visibilityState,framesIn500ms:frames}),500);})));
  const timedRender=process.platform==='darwin';
  if(timedRender){await page.locator('#syphon').click();await page.waitForFunction(()=>document.querySelector('#output-status').textContent.includes('送信中'));}
  await page.locator('#open').click();
  assert.equal(await page.locator('#vrm-dialog').evaluate(element=>element.open),true);
  await page.locator('#vrm-file').click();
  await page.waitForFunction(()=>document.querySelector('#model').textContent==='gallery-avatar.vrm',null,{timeout:60000});
  await page.waitForFunction(async file=>{const entry=(await window.yuiDesktop.vrmHistory())[0];return entry?.file===file&&entry.current&&entry.exists&&entry.thumbnail?.startsWith('data:image/png;base64,');},pickerFile,{timeout:30000});
  await page.locator('#open').click();
  await page.waitForFunction(()=>document.querySelector('#vrm-cards .vrm-picture img')?.naturalWidth===320);
  assert.equal(await page.locator('.vrm-badge').textContent(),'使用中');
  await shot('yuitracking-mac-vrm-dialog.png');
  await page.locator('#vrm-close').click();
  if(timedRender)await page.locator('#syphon').click();
  await assert.rejects(page.evaluate(()=>window.yuiDesktop.openVrm('/etc/passwd')),/一覧にないファイル/);
  console.log('PASS VRM dialog history, thumbnail, current marker, and rejection of other paths');
  await page.locator('#smoothing').fill('0.5');
  await page.locator('#preset-add').click();
  assert.equal(await page.locator('#preset-name-input').inputValue(),'プリセット1');
  await page.locator('#preset-name-save').click();
  const firstPreset=page.locator('.preset-button',{hasText:'プリセット1'});
  await firstPreset.waitFor();
  assert.equal(await firstPreset.getAttribute('aria-pressed'),'true');
  await page.locator('#smoothing').fill('0.2');
  assert.equal(await firstPreset.getAttribute('aria-pressed'),'false');
  await firstPreset.click();
  assert.equal(await page.locator('#smoothing').inputValue(),'0.5');
  assert.equal(await firstPreset.getAttribute('aria-pressed'),'true');
  await page.locator('.preset-gear[data-name="プリセット1"]').click();
  assert.equal(await page.locator('#preset-actions-dialog').evaluate(element=>element.open),true,'The gear must open a modal');
  assert.equal(await page.locator('#preset-actions-title').textContent(),'プリセット1');
  await page.locator('#preset-action-close').click();
  assert.equal(await page.locator('#preset-actions-dialog').evaluate(element=>element.open),false);
  assert.equal(await page.locator('.preset-button',{hasText:'プリセット1'}).count(),1,'Closing must change nothing');
  await page.locator('.preset-gear[data-name="プリセット1"]').click();
  await page.locator('#preset-action-rename').click();
  await page.locator('#preset-name-input').fill('配信');
  await page.locator('#preset-name-save').click();
  await page.locator('.preset-button',{hasText:'配信'}).waitFor();
  await page.locator('#preset-add').click();await page.locator('#preset-name-input').fill('配信');
  assert.equal(await page.locator('#preset-name-save').isDisabled(),true,'Duplicate names must be rejected');
  await page.locator('#preset-name-input').fill('雑談');await page.locator('#preset-name-save').click();
  await page.locator('.preset-gear[data-name="雑談"]').click();
  await page.locator('#preset-action-delete').click();
  await page.waitForFunction(()=>!document.querySelector('.preset-button[data-name="雑談"]'));
  await page.locator('#sideTiltStrength-enabled').uncheck();
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).disabledSliders?.includes('sideTiltStrength'));
  assert.equal(await page.locator('.preset-button',{hasText:'配信'}).getAttribute('aria-pressed'),'false','Turning a slider off must leave the preset');
  await page.locator('.preset-button',{hasText:'配信'}).click();
  assert.equal(await page.locator('#sideTiltStrength-enabled').isChecked(),true,'Applying a preset restores its checkboxes');
  await page.locator('#handTracking').uncheck();
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).handTracking===false);
  await page.locator('#gazeRange-enabled').uncheck();
  console.log('PASS slider checkboxes and hand tracking switch');
  const storedPresets=()=>page.evaluate(()=>window.yuiDesktop.getPresets());
  await page.evaluate(()=>{window.statusLog=[];const status=document.querySelector('#status');new MutationObserver(()=>window.statusLog.push(status.textContent)).observe(status,{childList:true,characterData:true,subtree:true});});
  const statusShown=text=>page.waitForFunction(value=>window.statusLog.some(line=>line.includes(value)),text);
  const presetFolder=await app.evaluate(async({app,dialog})=>{
   const fs=process.mainModule.require('node:fs/promises'),path=process.mainModule.require('node:path');
   const folder=path.join(app.getPath('userData'),'PresetFiles');await fs.mkdir(folder,{recursive:true});
   dialog.showSaveDialog=async(_owner,options)=>{globalThis.presetSaveName=options.defaultPath;return {canceled:false,filePath:path.join(folder,'exported.json')};};
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(folder,'exported.json')]});
   return folder;
  });
  await page.locator('#preset-export').click();
  assert.equal(await page.locator('#preset-export-list button').count(),1);
  await page.locator('#preset-export-list button[data-name="配信"]').click();
  await statusShown('エクスポートしました');
  assert.equal(await app.evaluate(()=>globalThis.presetSaveName),'配信.json');
  const exported=JSON.parse(await require('node:fs/promises').readFile(path.join(presetFolder,'exported.json'),'utf8'));
  assert.equal(exported.format,'yuitracking-preset');assert.equal(exported.name,'配信');assert.ok(!JSON.stringify(exported).includes('vrm'),'Preset files must not carry model paths');
  await page.locator('#preset-import').click();
  await page.locator('.preset-button',{hasText:'配信 (2)'}).waitFor();
  assert.equal((await storedPresets()).length,2,'Importing must add, not replace');
  await page.locator('.preset-gear[data-name="配信 (2)"]').click();
  await page.locator('#preset-action-delete').click();
  await page.waitForFunction(()=>!document.querySelector('.preset-button[data-name="配信 (2)"]'));
  await require('node:fs/promises').writeFile(path.join(presetFolder,'exported.json'),'not a preset');
  await page.locator('#preset-import').click();
  await statusShown('読み込めません');
  assert.equal((await storedPresets()).length,1,'A broken file must change nothing');
  console.log('PASS preset export, import under a new name, and broken file rejection');
  await app.evaluate(async({app,dialog})=>{const path=process.mainModule.require('node:path');dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(app.getPath('userData'),'PresetFiles','settings.png')});});
  await page.locator('#settings-card').click();
  await statusShown('設定の画像を保存して');
  const cardBytes=await require('node:fs/promises').readFile(path.join(presetFolder,'settings.png'));
  assert.equal(cardBytes.subarray(1,4).toString(),'PNG');
  assert.equal(await app.evaluate(({clipboard})=>clipboard.readImage().getSize().width),1600,'The card must also be on the clipboard');
  console.log('PASS settings card saved as PNG and copied');
  await shot('yuitracking-mac-presets.png');
  console.log('PASS presets save, apply, match, rename, duplicate rejection, and delete');
  await page.evaluate(()=>{document.querySelector('#samples').open=true;});await page.locator('[data-sample=Z]').click();
  await page.waitForFunction(()=>document.querySelector('[data-sample=Z]').getAttribute('aria-pressed')==='true',null,{timeout:60000});
  assert.equal(await page.locator('#chestSpringStrength').isDisabled(),true,'Model without authored chest springs must not offer chest adjustment');
  await page.locator('#maximize').click();
  assert.equal(await page.locator('#main').evaluate(el=>el.classList.contains('maximized')),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#main').evaluate(el=>el.classList.contains('maximized')),false);
  assert.ok((await page.evaluate(()=>window.yuiDesktop.memory())).mb>0);
  await page.evaluate(()=>window.yuiHost.postMessage({type:'status',text:'キャリブレーションの調整しました',temporary:true}));
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='キャリブレーションの調整しました');
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='VRMを表示中',null,{timeout:6000});
  if(await page.locator('#privacy').getAttribute('aria-pressed')==='true')await page.locator('#privacy').click();
  const zoomFrame=page.frames().find(f=>f.url().includes('/renderer/'));
  await zoomFrame.locator('canvas').evaluate(canvas=>{for(let i=0;i<5;i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-720,cancelable:true}));});
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).framing?.zoom===20);
  await page.waitForTimeout(300);
  await shot('yuitracking-mac-ui.png');
  await app.close();app=null;
  app=await launch();page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#mouthOpenStrength')?.value==='2'&&document.querySelector('#springStrength')?.value==='5'&&document.querySelector('#sensitivity')?.value==='4'&&document.querySelector('#bodyStrength')?.value==='20'&&document.querySelector('#forwardLeanStrength')?.value==='2'&&document.querySelector('#backwardLeanStrength')?.value==='3');
  await page.waitForFunction(()=>document.querySelector('[data-sample=Z]').getAttribute('aria-pressed')==='true',null,{timeout:60000});
  assert.deepEqual((await page.evaluate(()=>window.yuiDesktop.getPresets())).map(preset=>preset.name),['配信'],'Presets must survive a restart');
  assert.equal(await page.locator('.preset-button').count(),1);
  assert.equal(await page.locator('#handTracking').isChecked(),false,'Hand tracking choice must survive a restart');
  assert.equal(await page.locator('#gazeRange-enabled').isChecked(),false,'Slider checkbox must survive a restart');
  assert.equal(await page.locator('#chestSpringStrength').inputValue(),'20');
  assert.equal(await page.locator('#nearZoomStrength').inputValue(),'20');
  assert.equal(await page.locator('#zoomCenterX').inputValue(),'12.3');
  assert.equal(await page.locator('#zoomCenterY').inputValue(),'-18.6');
  assert.equal(await page.locator('#zoomCenterX-value').textContent(),'右12.3%');
  assert.equal(await page.locator('#zoomCenterY-value').textContent(),'下18.6%');
  assert.equal(await page.locator('#farZoomStrength').inputValue(),'2');
  assert.equal(await page.locator('#gazeRange').inputValue(),'4');assert.equal(await page.locator('#gazeRange').isDisabled(),false);
  assert.equal(await page.locator('#gazeMode').inputValue(),'camera');assert.equal(await page.locator('#gazeStrength').inputValue(),'2');assert.equal(await page.locator('#gazeStrength').isDisabled(),true);
  assert.equal(await page.locator('#chestSpringStrength').isDisabled(),true);
  assert.equal((await page.evaluate(()=>window.yuiDesktop.getSettings())).framing.zoom,20);
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
  console.log('PASS Electron preview, synthetic camera/recognition, stop, settings restored, no camera auto-start');
 }finally{if(app)await app.close();await rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
