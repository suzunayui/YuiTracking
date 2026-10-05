const {app,BrowserWindow,dialog,ipcMain,protocol,net,session}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
app.setName('YuiTracking');
let window,settings={},avatarPath=null,pendingPath=null;
const origin='https://holotrack.local';
const settingsPath=()=>path.join(app.getPath('userData'),'settings.json');
async function save(){await fs.mkdir(path.dirname(settingsPath()),{recursive:true});await fs.writeFile(settingsPath()+'.tmp',JSON.stringify(settings,null,2));await fs.rename(settingsPath()+'.tmp',settingsPath());}
let saveQueue=Promise.resolve();
function persist(){saveQueue=saveQueue.catch(()=>{}).then(save);return saveQueue;}
function trusted(event,kind){return event.sender===window?.webContents && event.senderFrame?.url.startsWith(origin+'/'+kind+'/');}
function command(message){window.webContents.send('command',message);}
function notify(message){window.webContents.send('renderer-event',message);}
function safeSettings(value){
 const result={};
 for(const [key,min,max] of [['smoothing',0,.95],['sensitivity',.3,2],['mouthOpenStrength',.5,3],['mouthSensitivity',.5,3],['springStrength',.3,3]])if(Number.isFinite(value?.[key]))result[key]=Math.min(max,Math.max(min,value[key]));
 if(['#00ff00','#0000ff','#171b2e'].includes(value?.background))result.background=value.background;
 return result;
}
ipcMain.handle('settings',event=>trusted(event,'ui')?settings:{});
ipcMain.handle('save-settings',async(event,value)=>{if(!trusted(event,'ui'))return;Object.assign(settings,safeSettings(value));await persist();});
ipcMain.handle('open-model',async event=>{
 if(!trusted(event,'ui'))return;
 const result=await dialog.showOpenDialog(window,{filters:[{name:'VRM avatar',extensions:['vrm']}],properties:['openFile']});
 if(result.canceled)return;
 const chosen=result.filePaths[0];const stat=await fs.stat(chosen);
 if(stat.size>200*1024*1024)throw new Error('VRMは200MB以下にしてください。');
 avatarPath=pendingPath=chosen;command({type:'loadModel',requestId:chosen});return path.basename(chosen);
});
ipcMain.on('ui-command',(event,message)=>{
 if(!trusted(event,'ui'))return;
 if(message?.type==='settings')command({type:'settings',...safeSettings(message)});
 else if(['startTracking','stopTracking','calibrate','demo','privacy'].includes(message?.type))command({type:message.type,deviceId:typeof message.deviceId==='string'?message.deviceId:undefined,value:!!message.value});
});
ipcMain.on('renderer-event',async(event,message)=>{
 if(!trusted(event,'ui')||!message||typeof message.type!=='string')return;
 if(message.type==='ready'){
  command({type:'settings',smoothing:.65,sensitivity:1,mouthOpenStrength:1,mouthSensitivity:1.8,springStrength:1,background:'#00ff00',...safeSettings(settings)});
  if(settings.framing)command({type:'restoreFraming',...settings.framing});
  if(settings.defaultVrmPath){avatarPath=pendingPath=settings.defaultVrmPath;command({type:'loadModel',requestId:pendingPath});}
 }
 if(message.type==='framingChanged'&&['zoom','x','y','z'].every(key=>Number.isFinite(message[key]))){settings.framing=Object.fromEntries(['zoom','x','y','z'].map(key=>[key,message[key]]));await persist();}
 if(message.type==='modelLoaded'&&message.requestId===pendingPath){settings.defaultVrmPath=pendingPath;pendingPath=null;await persist();}
 if(['status','error','tracking','cameras','cameraInput','modelLoaded','modelFailed','ready'].includes(message.type))notify(message);
});
app.whenReady().then(async()=>{
 try{settings=JSON.parse(await fs.readFile(settingsPath(),'utf8'));}catch{settings={};}
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
 window.webContents.on('will-navigate',(event,url)=>{if(url!==origin+'/ui/index.html')event.preventDefault();});
 await window.loadURL(origin+'/ui/index.html');
 window.on('closed',()=>{window=null;});
});
app.on('window-all-closed',()=>app.quit());
