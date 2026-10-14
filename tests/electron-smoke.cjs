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
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
  await page.locator('#motion-tab').click();
  await page.locator('#full-body').click();
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).fullBody===true);
  await page.locator('#mouthOpenStrength').fill('2');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).mouthOpenStrength===2);
  await page.locator('#tracking').click();
  await page.waitForFunction(()=>document.querySelector('#tracking').textContent==='カメラを停止',null,{timeout:60000});
  await page.locator('#tracking').click();
  await page.waitForFunction(()=>document.querySelector('#tracking').textContent==='カメラを開始');
  await page.locator('#privacy').click();
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
  await page.waitForTimeout(100);
  const previewSize=await page.frameLocator('#preview').locator('canvas').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,viewWidth:innerWidth,viewHeight:innerHeight}));
  assert.ok(Math.abs(previewSize.width/previewSize.height-previewSize.viewWidth/previewSize.viewHeight)<.01);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#main').evaluate(el=>el.classList.contains('maximized')),false);
  assert.ok((await page.evaluate(()=>window.yuiDesktop.memory())).mb>0);
  await page.evaluate(()=>window.yuiHost.postMessage({type:'status',text:'キャリブレーションの調整しました',temporary:true}));
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='キャリブレーションの調整しました');
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='VRMを表示中',null,{timeout:6000});
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'yuitracking-mac-ui.png')});
  await app.close();app=null;
  app=await launch();page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#mouthOpenStrength')?.value==='2');
  await page.waitForFunction(()=>document.querySelector('[data-sample=Z]').getAttribute('aria-pressed')==='true',null,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
  assert.equal(await page.locator('#full-body').getAttribute('aria-pressed'),'true');
  console.log('PASS Electron preview, synthetic camera/recognition, stop, settings restored, no camera auto-start');
 }finally{if(app)await app.close();await rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
