import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {copyVisionWasm} from '../copy-vision-wasm.mjs';
const files=['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'];
test('both package layouts replace old runtime files with matching package assets',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'yui-vision-runtime-'));
 try{
  for(const layout of ['root','nested']){
   const root=join(temporary,layout),source=layout==='root'?root:join(root,'wasm'),output=join(temporary,layout+'-out');
   await mkdir(source,{recursive:true});await mkdir(output);
   for(const name of files){await writeFile(join(source,name),'new-'+layout+'-'+name);await writeFile(join(output,name),'old-'+name);}
   assert.equal((await copyVisionWasm(root,output)).length,4);
   for(const name of files)assert.equal(await readFile(join(output,name),'utf8'),'new-'+layout+'-'+name);
  }
 }finally{await rm(temporary,{recursive:true,force:true});}
});
test('an absent runtime fails the build instead of retaining old output',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'yui-vision-runtime-'));
 try{await assert.rejects(copyVisionWasm(temporary,join(temporary,'out')),/runtime file missing/);}
 finally{await rm(temporary,{recursive:true,force:true});}
});
