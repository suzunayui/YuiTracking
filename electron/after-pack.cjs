const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
module.exports=async context=>{
 if(context.electronPlatformName!=='darwin')return;
 const app=path.join(context.appOutDir,'YuiTracking.app');
 const contents=path.join(app,'Contents');
 // Chromium discovers Continuity Camera from its helper process.
 for(const name of fs.readdirSync(path.join(contents,'Frameworks'))){
  if(!name.endsWith('.app'))continue;
  const plist=path.join(contents,'Frameworks',name,'Contents','Info.plist');
  execFileSync('/usr/bin/plutil',['-replace','NSCameraUseContinuityCameraDeviceType','-bool','YES',plist]);
 }
 const framework=path.join(contents,'Frameworks','Syphon.framework');require('./syphon-framework.cjs')(framework,framework);
 const natives=path.join(contents,'Resources','app.asar.unpacked','node_modules','@napolab');
 for(const folder of fs.readdirSync(natives))for(const file of fs.readdirSync(path.join(natives,folder)))if(file.endsWith('.node'))execFileSync('codesign',['--force','--sign','-',path.join(natives,folder,file)]);
 // Seal the complete Electron bundle after native files have been modified.
 execFileSync('codesign',['--force','--deep','--sign','-','--entitlements',path.join(__dirname,'entitlements.mac.plist'),app]);
 execFileSync('codesign',['--verify','--deep','--strict',app]);
};
