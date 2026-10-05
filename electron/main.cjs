const {app,BrowserWindow,dialog,ipcMain,protocol,net,session}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {SyphonOutput}=require('./syphon-output.cjs');
app.setName('YuiTracking');
let window,settings={},avatarPath=null,pendingPath=null;
let rendererReady=false,restoreOutput=false;
const syphon=new SyphonOutput((...args)=>{
 if(process.platform!=='darwin')throw new Error('Syphon出力はMac版で利用できます。');
 const {TextureSender}=require('@napolab/texture-bridge-core');return new TextureSender(...args);
},error=>{command({type:'output',value:false});notify({type:'syphon',active:false,error:error.message});});
function setOutput(enabled,save=true){
 if(enabled){if(!rendererReady)throw new Error('アバターの準備ができるまでお待ちください。');syphon.start();if(!syphon.sender)throw new Error('Syphon出力を開始できませんでした。');}
 else syphon.stop();
 command({type:'frameAck'});command({type:'output',value:enabled});notify({type:'syphon',active:enabled});
 if(save){settings.syphonEnabled=enabled;return persist();}
}
const origin='https://holotrack.local';
const settingsPath=()=>path.join(app.getPath('userData'),'settings.json');
async function save(){await fs.mkdir(path.dirname(settingsPath()),{recursive:true});await fs.writeFile(settingsPath()+'.tmp',JSON.stringify(settings,null,2));await fs.rename(settingsPath()+'.tmp',settingsPath());}
let saveQueue=Promise.resolve();
function persist(){saveQueue=saveQueue.catch(()=>{}).then(save);return saveQueue;}
function trusted(event,kind){return event.sender===window?.webContents && event.senderFrame?.url.startsWith(origin+'/'+kind+'/');}
function command(message){if(window&&!window.webContents.isDestroyed())window.webContents.send('command',message);}
function notify(message){if(window&&!window.webContents.isDestroyed())window.webContents.send('renderer-event',message);}
function safeSettings(value){
 const result={};
 for(const [key,min,max] of [['smoothing',0,.95],['sensitivity',.3,2],['mouthOpenStrength',.5,3],['mouthSensitivity',.5,3],['springStrength',.3,3]])if(Number.isFinite(value?.[key]))result[key]=Math.min(max,Math.max(min,value[key]));
 if(['#00ff00','#0000ff','#171b2e'].includes(value?.background))result.background=value.background;
 return result;
}
ipcMain.handle('settings',event=>trusted(event,'ui')?settings:{});
ipcMain.handle('syphon-capability',event=>trusted(event,'ui')&&process.platform==='darwin');
ipcMain.handle('syphon-output',async(event,enabled)=>{if(!trusted(event,'ui')||typeof enabled!=='boolean')return;restoreOutput=false;await setOutput(enabled);});
ipcMain.handle('avatar-frame',(event,data)=>{if(!trusted(event,'ui'))return false;return syphon.accept(data);});
ipcMain.handle('save-settings',async(event,value)=>{if(!trusted(event,'ui'))return;Object.assign(settings,safeSettings(value));await persist();});
ipcMain.handle('open-model',async event=>{
 if(!trusted(event,'ui'))return;
 const result=await dialog.showOpenDialog(window,{filters:[{name:'VRM avatar',extensions:['vrm']}],properties:['openFile']});
 if(result.canceled)return;
 const chosen=result.filePaths[0];const stat=await fs.stat(chosen);
 if(stat.size>200*1024*1024)throw new Error('VRMは200MB以下にしてください。');
 syphon.setLoading(true);avatarPath=pendingPath=chosen;command({type:'loadModel',requestId:chosen});return path.basename(chosen);
});
ipcMain.on('ui-command',(event,message)=>{
 if(!trusted(event,'ui'))return;
 if(message?.type==='privacy')syphon.setPrivacy(message.value);
 if(message?.type==='settings')command({type:'settings',...safeSettings(message)});
 else if(['startTracking','stopTracking','calibrate','demo','privacy'].includes(message?.type))command({type:message.type,deviceId:typeof message.deviceId==='string'?message.deviceId:undefined,value:!!message.value});
});
ipcMain.on('renderer-event',async(event,message)=>{
 if(!trusted(event,'ui')||!message||typeof message.type!=='string')return;
 if(message.type==='ready'){
  rendererReady=true;
  command({type:'settings',smoothing:.65,sensitivity:1,mouthOpenStrength:1,mouthSensitivity:1.8,springStrength:1,background:'#00ff00',...safeSettings(settings)});
  if(settings.framing)command({type:'restoreFraming',...settings.framing});
  if(settings.defaultVrmPath){syphon.setLoading(true);avatarPath=pendingPath=settings.defaultVrmPath;command({type:'loadModel',requestId:pendingPath});}
  else if(restoreOutput){restoreOutput=false;try{setOutput(true,false);}catch(error){notify({type:'syphon',active:false,error:error.message});}}
 }
 if(['modelLoaded','modelFailed'].includes(message.type)){syphon.setLoading(false);if(restoreOutput){restoreOutput=false;try{setOutput(true,false);}catch(error){notify({type:'syphon',active:false,error:error.message});}}}
 if(message.type==='error'){syphon.setPrivacy(true);notify({type:'safety',active:true});}
 if(message.type==='framingChanged'&&['zoom','x','y','z'].every(key=>Number.isFinite(message[key]))){settings.framing=Object.fromEntries(['zoom','x','y','z'].map(key=>[key,message[key]]));await persist();}
 if(message.type==='modelLoaded'&&message.requestId===pendingPath){settings.defaultVrmPath=pendingPath;pendingPath=null;await persist();}
 if(['status','error','tracking','cameras','cameraInput','modelLoaded','modelFailed','ready'].includes(message.type))notify(message);
});
app.whenReady().then(async()=>{
 try{settings=JSON.parse(await fs.readFile(settingsPath(),'utf8'));}catch{settings={};}
 restoreOutput=process.platform==='darwin'&&settings.syphonEnabled===true;
 protocol.handle('https',async request=>{
  const url=new URL(request.url);if(url.origin!==origin)return new Response('Blocked',{status:403});
  let file;
  if(url.pathname==='/avatar.vrm'&&avatarPath)file=avatarPath;
  else {
   const relative=decodeURIComponent(url.pathname).replace(/^\//,'');
   if(!/^(ui|renderer)\//.test(relative))return new Response('Not found',{status:404});
   file=path.resolve(__dirname,relative);const rel=path.relative(__dirname,file);
   if(rel.startsWith('..')||path.isAbsolute(rel))return new Response('Blocked',{status:403});
  }
  try{return await net.fetch(pathToFileURL(file).href);}catch{return new Response('Not found',{status:404});}
 });
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===window?.webContents&&permission==='media'&&details.requestingUrl?.startsWith(origin+'/renderer/')&&details.mediaTypes?.every(type=>type==='video')));
 session.defaultSession.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>contents===window?.webContents&&requestingOrigin===origin&&permission==='media'&&details.mediaType==='video');
 window=new BrowserWindow({width:1480,height:980,minWidth:1000,minHeight:700,title:'YuiTracking',backgroundColor:'#11131c',icon:app.isPackaged?path.join(process.resourcesPath,'icon.png'):path.join(__dirname,'../src/HoloTrack.App/Assets/Branding/YuiTracking.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('render-process-gone',()=>syphon.setPrivacy(true));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==origin+'/ui/index.html')event.preventDefault();});
 await window.loadURL(origin+'/ui/index.html');
 window.on('closed',()=>{syphon.stop();window=null;});
});
app.on('before-quit',()=>syphon.stop());
app.on('window-all-closed',()=>app.quit());
