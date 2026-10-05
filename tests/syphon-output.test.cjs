const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SyphonOutput,BYTES}=require('../electron/syphon-output.cjs');
test('avatar frames convert RGBA to BGRA; privacy, loading and stale frames replace output',()=>{
 let time=1000,latest,stopped=false;
 const output=new SyphonOutput(()=>({sendRgbaBuffer:frame=>latest=frame,stop:()=>{stopped=true;}}),error=>{throw error;},()=>time);
 try{
  output.start();assert.equal(latest,output.standby);
  const data=new ArrayBuffer(BYTES);new Uint8Array(data).set([12,34,56,255]);output.accept(data);output.tick();assert.deepEqual([...latest.subarray(0,4)],[56,34,12,255]);
  time+=701;output.tick();assert.equal(latest,output.standby);
  output.setPrivacy(true);assert.equal(output.accept(new ArrayBuffer(BYTES)),false);assert.equal(latest,output.standby);
  output.setPrivacy(false);output.tick();assert.equal(latest,output.standby);
  output.setLoading(true);assert.equal(output.accept(new ArrayBuffer(BYTES)),false);
  output.setLoading(false);assert.throws(()=>output.accept(new ArrayBuffer(4)),/Invalid/);
 }finally{output.stop();}
 assert.equal(stopped,true);assert.equal(output.sender,null);
});
