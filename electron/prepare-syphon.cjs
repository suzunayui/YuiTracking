const fs=require('node:fs');
const path=require('node:path');
if(process.platform==='darwin'){
 const framework=path.join(path.dirname(require.resolve('@napolab/texture-bridge-darwin-'+process.arch+'/package.json')),'Syphon.framework');
 const frameworks=path.resolve(path.dirname(require('electron')),'../Frameworks');
 require('./syphon-framework.cjs')(framework,path.join(frameworks,'Syphon.framework'));
}
