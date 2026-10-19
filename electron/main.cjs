const {app,BrowserWindow,dialog,ipcMain,protocol,net,session,globalShortcut,systemPreferences}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const {SyphonOutput}=require('./syphon-output.cjs');
app.setName('YuiTracking');
let window,settings={},avatarPath=null,backgroundPath=null,pendingModel=null,pendingBackground=null,sequence=0;
let rendererReady=false,restoreOutput=false,recoveryOpen=false,currentVrmPath=null;
let recognitionDelegate='CPU',recognitionGpuName='',macGpuPromise;
function macGpu(){
 return macGpuPromise??=(async()=>{
  if(process.platform!=='darwin')return '';
  try{const {stdout}=await promisify(execFile)('/usr/sbin/system_profiler',['SPDisplaysDataType','-json'],{timeout:10000,maxBuffer:1024*1024});
   const names=(JSON.parse(stdout).SPDisplaysDataType||[]).map(item=>item.sppci_model).filter(name=>typeof name==='string'&&name);
   return names.length===1?names[0]:'';
  }catch{return '';}
 })();
}
const origin='https://yuitracking.local';
const colors=['transparent','#00ff00','#ff0000','#0000ff','#000000'];
const syphon=new SyphonOutput((...args)=>{
 if(process.platform!=='darwin')throw new Error('Syphon出力はMac版で利用できます。');
 const {TextureSender}=require('@napolab/texture-bridge-core');return new TextureSender(...args);
},error=>{command({type:'output',value:false});notify({type:'syphon',active:false,error:error.message});});
function setOutput(enabled,save=true){
 if(enabled){if(!rendererReady)throw new Error('アバターの準備ができるまでお待ちください。');syphon.start();}
 else syphon.stop();
 command({type:'frameAck'});command({type:'output',value:enabled});notify({type:'syphon',active:enabled});
 if(save){settings.syphonEnabled=enabled;return persist();}
}
const settingsPath=()=>path.join(app.getPath('userData'),'settings.json');
async function save(){await fs.mkdir(path.dirname(settingsPath()),{recursive:true});await fs.writeFile(settingsPath()+'.tmp',JSON.stringify(settings,null,2));await fs.rename(settingsPath()+'.tmp',settingsPath());}
let saveQueue=Promise.resolve();
function persist(){saveQueue=saveQueue.catch(()=>{}).then(save);return saveQueue;}
function trusted(event,kind){return event.sender===window?.webContents && event.senderFrame?.url.startsWith(origin+'/'+kind+'/');}
function command(message){if(window&&!window.webContents.isDestroyed())window.webContents.send('command',message);}
function notify(message){if(window&&!window.webContents.isDestroyed())window.webContents.send('renderer-event',message);}
function safeSettings(value){const result={};for(const [key,min,max] of [['farZoomStrength',0,5],['nearZoomStrength',0,5],['gazeRange',1,5],['gazeStrength',0,3],['smoothing',0,.95],['sensitivity',.3,5],['bodyStrength',0,20],['forwardLeanStrength',0,3],['backwardLeanStrength',0,3],['mouthOpenStrength',.5,3],['mouthSensitivity',.5,3],['springStrength',.3,5],['chestSpringStrength',.3,20]])if(Number.isFinite(value?.[key]))result[key]=Math.min(max,Math.max(min,value[key]));if(['tracking','camera','fixed'].includes(value?.gazeMode))result.gazeMode=value.gazeMode;return result;}
function samplePath(sample){return path.join(app.isPackaged?path.join(process.resourcesPath,'Samples'):path.join(__dirname,'../src/YuiTracking.App/Assets/Samples'),`AvatarSample_${sample}.vrm`);}
function selectModel(file,sample){
 if(sample==='robot'){currentVrmPath=null;pendingModel=null;syphon.setLoading(false);command({type:'demo'});settings.defaultSample='robot';notify({type:'avatar',sample,label:'内蔵ロボット'});return persist();}
 const requestId=++sequence;pendingModel={file,sample,requestId,previous:avatarPath};avatarPath=file;syphon.setLoading(true);command({type:'loadModel',requestId});
}
function selectBackground(color,file){backgroundPath=file||null;const requestId=++sequence;pendingBackground={color,file,requestId};command({type:'background',color,imageUrl:file?origin+'/background-image?v='+requestId:undefined,requestId});}
ipcMain.handle('settings',event=>trusted(event,'ui')?settings:{});
ipcMain.handle('info',event=>trusted(event,'ui')?{version:app.getVersion(),platform:process.platform,cameraPermission:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('camera'):undefined}:{});
ipcMain.handle('native-cameras',async event=>{if(!trusted(event,'ui')||process.platform!=='darwin')return [];try{const {stdout}=await promisify(execFile)('/usr/sbin/system_profiler',['SPCameraDataType','-json'],{timeout:5000,maxBuffer:1024*1024});return (JSON.parse(stdout).SPCameraDataType||[]).map(item=>item._name).filter(name=>typeof name==='string');}catch{return [];}});
ipcMain.handle('memory',event=>{if(!trusted(event,'ui'))return;const metrics=app.getAppMetrics();return {mb:metrics.reduce((sum,item)=>sum+item.memory.workingSetSize,0)/1024,processes:metrics.map(item=>({type:item.type,mb:item.memory.workingSetSize/1024}))};});
ipcMain.handle('syphon-capability',event=>trusted(event,'ui')&&process.platform==='darwin');
ipcMain.handle('syphon-output',async(event,enabled)=>{if(!trusted(event,'ui')||typeof enabled!=='boolean')return;restoreOutput=false;await setOutput(enabled);});
ipcMain.handle('avatar-frame',(event,data)=>trusted(event,'ui')&&syphon.accept(data));
ipcMain.handle('save-settings',async(event,value)=>{if(!trusted(event,'ui'))return;Object.assign(settings,safeSettings(value));await persist();});
ipcMain.handle('recognition-settings',async event=>{
 if(!trusted(event,'ui'))return;
 const name=await macGpu();
 return {current:recognitionDelegate,currentName:recognitionGpuName||'CPU',saved:settings.recognitionDelegate==='GPU'?'GPU':'CPU',devices:[{id:'CPU',name:'CPU'},...(name?[{id:'GPU',name}]:[])]};
});
ipcMain.handle('save-recognition-settings',async(event,value)=>{
 if(!trusted(event,'ui'))return;
 if(!['CPU','GPU'].includes(value)||value==='GPU'&&!await macGpu())throw new Error('選択した認識デバイスはこの構成では使用できません。');
 settings.recognitionDelegate=value;await persist();
});
ipcMain.handle('sample',(event,sample)=>{if(trusted(event,'ui')&&['Y','Z','robot'].includes(sample))return selectModel(sample==='robot'?null:samplePath(sample),sample);});
ipcMain.handle('background',async(event,color)=>{if(!trusted(event,'ui'))return;if(colors.includes(color)){selectBackground(color,null);return;}if(color!=='image')return;
 const result=await dialog.showOpenDialog(window,{filters:[{name:'背景画像',extensions:['png','jpg','jpeg','bmp']}],properties:['openFile']});if(result.canceled)return;
 const file=result.filePaths[0];if((await fs.stat(file)).size>32*1024*1024)throw new Error('背景画像は32MB以下にしてください。');selectBackground(settings.background||'#00ff00',file);
});
ipcMain.handle('open-model',async event=>{if(!trusted(event,'ui'))return;const defaultPath=await require('./vrm-picker.cjs')(currentVrmPath,settings.defaultVrmPath);const result=await dialog.showOpenDialog(window,{defaultPath,filters:[{name:'VRM avatar',extensions:['vrm']}],properties:['openFile']});if(result.canceled)return;const chosen=result.filePaths[0];if((await fs.stat(chosen)).size>200*1024*1024)throw new Error('VRMは200MB以下にしてください。');selectModel(chosen,null);});
ipcMain.on('ui-command',(event,message)=>{
 if(!trusted(event,'ui'))return;
 if(message?.type==='privacy')syphon.setPrivacy(message.value);
 if(message?.type==='settings')command({type:'settings',...safeSettings(message)});
 else if(message?.type==='navigationMode')command({type:'navigationMode',pan:message.pan===true});
 else if(['startTracking','stopTracking','calibrate','privacy','resetFraming','refreshCameras'].includes(message?.type))command({type:message.type,deviceId:typeof message.deviceId==='string'?message.deviceId:undefined,cameraLabel:typeof message.cameraLabel==='string'?message.cameraLabel:undefined,singleNativeCamera:message.singleNativeCamera===true,value:!!message.value});
});
ipcMain.on('renderer-event',async(event,message)=>{
 if(!trusted(event,'ui')||!message||typeof message.type!=='string')return;
 try{
 if(message.type==='ready'){
  command({type:'recognitionConfig',delegate:recognitionDelegate,expectedRenderer:recognitionGpuName});
  rendererReady=true;command({type:'settings',farZoomStrength:0,nearZoomStrength:0,gazeMode:'tracking',gazeStrength:1,gazeRange:1,smoothing:.65,sensitivity:1,bodyStrength:1,forwardLeanStrength:1,backwardLeanStrength:1,mouthOpenStrength:1,mouthSensitivity:1.8,springStrength:1,chestSpringStrength:1,...safeSettings(settings)});
  if(settings.framing)command({type:'restoreFraming',...settings.framing});
  selectBackground(colors.includes(settings.background)?settings.background:'#00ff00',settings.backgroundImagePath);
  if(settings.defaultSample||!settings.defaultVrmPath)selectModel(samplePath(settings.defaultSample==='Z'?'Z':'Y'),settings.defaultSample||'Y');else selectModel(settings.defaultVrmPath,null);
  if(restoreOutput){restoreOutput=false;setOutput(true,false);}
 }
 if(['modelLoaded','modelFailed'].includes(message.type)&&pendingModel?.requestId===message.requestId){
  const pending=pendingModel;pendingModel=null;syphon.setLoading(false);
  if(message.type==='modelLoaded'){currentVrmPath=pending.sample?null:pending.file;settings.defaultSample=pending.sample;if(!pending.sample)settings.defaultVrmPath=pending.file;await persist();notify({type:'avatar',sample:pending.sample,label:pending.sample==='Y'?'女の子':pending.sample==='Z'?'男の子':path.basename(pending.file)});}
  else avatarPath=pending.previous;
 }
 if(['backgroundLoaded','backgroundFailed'].includes(message.type)&&pendingBackground?.requestId===message.requestId){const pending=pendingBackground;pendingBackground=null;if(message.type==='backgroundLoaded'){settings.background=pending.color;settings.backgroundImagePath=pending.file||null;await persist();notify({type:'background',color:pending.color,image:!!pending.file});}else notify({type:'error',text:message.text});}
 if(message.type==='calibrateRequest')command({type:'calibrate'});
 if(message.type==='error'){syphon.setPrivacy(true);notify({type:'safety',active:true});}
 if(message.type==='framingChanged'&&['zoom','x','y','z'].every(key=>Number.isFinite(message[key]))){settings.framing=Object.fromEntries(['zoom','x','y','z','targetX','targetY','targetZ'].filter(key=>Number.isFinite(message[key])).map(key=>[key,message[key]]));await persist();}
 if(['status','error','tracking','cameras','cameraListWarning','cameraInput','recognitionReady','springCapabilities','modelLoaded','modelFailed','ready','togglePreviewMaximized','restorePreview'].includes(message.type))notify(message);
 }catch(error){notify({type:'error',text:error.message});}
});
async function recover(){if(recoveryOpen||!window)return;rendererReady=false;syphon.setPrivacy(true);recoveryOpen=true;try{const result=await dialog.showMessageBox(window,{type:'error',title:'YuiTracking',message:'描画が停止しました。再起動しますか？',buttons:['再起動','閉じる'],defaultId:0,cancelId:1});if(result.response===0){await persist();app.relaunch();app.exit();}}finally{recoveryOpen=false;}}
app.whenReady().then(async()=>{
 try{settings=JSON.parse(await fs.readFile(settingsPath(),'utf8'));}catch{settings={};}
 if(settings.recognitionDelegate==='GPU'){recognitionGpuName=await macGpu();if(recognitionGpuName)recognitionDelegate='GPU';}
 restoreOutput=process.platform==='darwin'&&settings.syphonEnabled===true;
 protocol.handle('https',async request=>{
  const url=new URL(request.url);if(url.origin!==origin)return new Response('Blocked',{status:403});let file;
  if(url.pathname==='/avatar.vrm'&&avatarPath)file=avatarPath;
  else if(url.pathname==='/background-image'&&backgroundPath)file=backgroundPath;
  else{const relative=decodeURIComponent(url.pathname).replace(/^\//,'');if(!/^(ui|renderer)\//.test(relative))return new Response('Not found',{status:404});file=path.resolve(__dirname,relative);const rel=path.relative(__dirname,file);if(rel.startsWith('..')||path.isAbsolute(rel))return new Response('Blocked',{status:403});}
  try{return await net.fetch(pathToFileURL(file).href);}catch{return new Response('Not found',{status:404});}
 });
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===window?.webContents&&permission==='media'&&details.requestingUrl?.startsWith(origin+'/renderer/')&&details.mediaTypes?.every(type=>type==='video')));
 session.defaultSession.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>contents===window?.webContents&&requestingOrigin===origin&&permission==='media'&&details.mediaType==='video');
 const title='YuiTracking '+app.getVersion();
 window=new BrowserWindow({width:1280,height:800,minWidth:1000,minHeight:650,title,backgroundColor:'#11131c',icon:app.isPackaged?path.join(process.resourcesPath,'icon.png'):path.join(__dirname,'../src/YuiTracking.App/Assets/Branding/YuiTracking.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('render-process-gone',()=>recover().catch(()=>{}));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==origin+'/ui/index.html')event.preventDefault();});
 await window.loadURL(origin+'/ui/index.html');
 if(process.platform==='darwin')globalShortcut.register('CommandOrControl+Shift+C',()=>command({type:'calibrate'}));
 window.on('closed',()=>{syphon.stop();window=null;});
});
app.on('before-quit',()=>{globalShortcut.unregisterAll();syphon.stop();});
app.on('window-all-closed',()=>app.quit());
