const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const initialFolder=require('../electron/vrm-picker.cjs');
test('VRM picker prefers current file directory and falls back to last custom VRM',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'yuitracking-picker-'));
 try{
  const current=path.join(root,'モデル Current'),previous=path.join(root,'Last VRM');
  await fs.mkdir(current);await fs.mkdir(previous);
  const file=path.join(current,'avatar.vrm'),last=path.join(previous,'last.vrm');
  assert.equal(await initialFolder(file,last),current);
  assert.equal(await initialFolder(undefined,last),previous);
  assert.equal(await initialFolder(path.join(root,'missing','avatar.vrm'),last),previous);
  assert.equal(await initialFolder('relative.vrm',undefined),undefined);
  assert.equal(await initialFolder(),undefined);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
