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
  await app.close();app=null;
  app=await launch();page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#mouthOpenStrength')?.value==='2');
  assert.equal(await page.evaluate(()=>document.querySelector('#tracking').textContent),'カメラを開始');
  console.log('PASS Electron preview, synthetic camera/recognition, stop, settings restored, no camera auto-start');
 }finally{if(app)await app.close();await rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
