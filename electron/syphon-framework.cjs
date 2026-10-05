const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=function installFramework(source,destination){
 if(path.basename(destination)!=='Syphon.framework')throw new Error('Unexpected framework destination');
 // npm flattens framework symlinks; restore Apple's versioned bundle layout.
 const temporary=fs.mkdtempSync(path.join(path.dirname(destination),'syphon-bundle-'));
 fs.mkdirSync(path.join(temporary,'Versions'),{recursive:true});
 fs.cpSync(path.join(source,'Versions','A'),path.join(temporary,'Versions','A'),{recursive:true});
 fs.symlinkSync('A',path.join(temporary,'Versions','Current'));
 for(const name of ['Syphon','Headers','Modules','Resources'])fs.symlinkSync('Versions/Current/'+name,path.join(temporary,name));
 fs.rmSync(destination,{recursive:true,force:true});fs.renameSync(temporary,destination);
 execFileSync('codesign',['--force','--deep','--sign','-',destination]);
};
