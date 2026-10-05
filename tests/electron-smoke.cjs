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
  const launch=()=>_electron.launch({executablePath:require('../electron/node_modules/electron'),args:[path.resolve(__dirname,'../electron'),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--user-data-dir='+profile],env});
  app=await launch();let page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('内蔵サンプル'));
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
  await page.locator('#mouthOpenStrength').fill('2');
  await page.waitForFunction(async()=>(await window.yuiDesktop.getSettings()).mouthOpenStrength===2);
  await page.locator('#tracking').click();
  await page.waitForFunction(()=>document.querySelector('#tracking').textContent==='カメラを停止',{timeout:60000});
  await page.locator('#tracking').click();
  await page.waitForFunction(()=>document.querySelector('#tracking').textContent==='カメラを開始');
  await page.locator('#privacy').check();
  if(process.platform==='darwin'){
   await page.locator('#syphon').click();
   await page.waitForFunction(()=>document.querySelector('#output-status').textContent.includes('送信中'));
   await app.evaluate(({app})=>{const {TextureReceiver}=require(app.getAppPath()+'/node_modules/@napolab/texture-bridge-core');globalThis.syphonReceiver=new TextureReceiver('YuiTracking');});
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
    await page.locator('#privacy').uncheck();await waitPixel([0,255,0]);
    await page.locator('#background').selectOption('#0000ff');await page.locator('#background').dispatchEvent('input');await waitPixel([0,0,255]);
    await page.locator('#privacy').check();await waitPixel([23,27,46]);
    await page.locator('#syphon').click();
    console.log('PASS native Syphon receiver: avatar-only 720p, blue/green channels, emergency standby, stop');
   }finally{await app.evaluate(()=>globalThis.syphonReceiver.stop());}
  }
  await app.close();app=null;
  app=await launch();page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#mouthOpenStrength')?.value==='2');
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
  console.log('PASS Electron preview, synthetic camera/recognition, stop, settings restored, no camera auto-start');
 }finally{if(app)await app.close();await rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
