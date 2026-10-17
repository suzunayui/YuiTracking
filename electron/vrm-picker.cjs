const fs=require('node:fs/promises');
const path=require('node:path');
module.exports=async function initialVrmDirectory(currentFile,lastFile){
 for(const file of [currentFile,lastFile]){
  if(typeof file!=='string'||!path.isAbsolute(file))continue;
  const folder=path.dirname(file);
  try{if((await fs.stat(folder)).isDirectory())return folder;}catch{}
 }
 return undefined;
};
