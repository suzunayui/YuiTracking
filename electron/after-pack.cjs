const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
module.exports=async context=>{
 if(context.electronPlatformName!=='darwin')return;
 const contents=path.join(context.appOutDir,'YuiTracking.app','Contents');
 const framework=path.join(contents,'Frameworks','Syphon.framework');require('./syphon-framework.cjs')(framework,framework);
 const natives=path.join(contents,'Resources','app.asar.unpacked','node_modules','@napolab');
 for(const folder of fs.readdirSync(natives))for(const file of fs.readdirSync(path.join(natives,folder)))if(file.endsWith('.node'))execFileSync('codesign',['--force','--sign','-',path.join(natives,folder,file)]);
};
