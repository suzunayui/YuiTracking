const fs=require('node:fs');
const path=require('node:path');
if(process.platform==='darwin'){
 const framework=path.join(path.dirname(require.resolve('@napolab/texture-bridge-darwin-'+process.arch+'/package.json')),'Syphon.framework');
 const frameworks=path.resolve(path.dirname(require('electron')),'../Frameworks');
 fs.cpSync(framework,path.join(frameworks,'Syphon.framework'),{recursive:true});
 require('node:child_process').execFileSync('codesign',['--force','--deep','--sign','-',path.join(frameworks,'Syphon.framework')]);
}
