import {readdir,mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';

// Releases ship these beside the bundle or under wasm/. Do not silently keep
// an older runtime in the build output if the package changes its layout.
export async function copyVisionWasm(packageRoot,destination){
 const files=new Map();
 for(const directory of [packageRoot,join(packageRoot,'wasm')]){
  let names;try{names=await readdir(directory);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  for(const name of names)if(/^vision_wasm(?:_module|_nosimd)?_internal\.(?:js|wasm)$/.test(name))files.set(name,join(directory,name));
 }
 for(const name of ['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'])if(!files.has(name))throw new Error('MediaPipe runtime file missing: '+name);
 await mkdir(destination,{recursive:true});
 for(const [name,source]of files)await copyFile(source,join(destination,name));
 return [...files.keys()];
}
