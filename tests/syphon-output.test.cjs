const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SyphonOutput,BYTES}=require('../electron/syphon-output.cjs');
test('avatar frames convert RGBA to BGRA; privacy, loading and stale frames replace output',()=>{
 let time=1000,latest,stopped=false;
 const output=new SyphonOutput(()=>({sendRgbaBuffer:frame=>latest=frame,stop:()=>{stopped=true;}}),error=>{throw error;},()=>time);
 try{
  output.start();assert.equal(latest,output.standby);
  const data=new ArrayBuffer(BYTES);new Uint8Array(data).set([12,34,56,128]);output.accept(data);output.tick();assert.deepEqual([...latest.subarray(0,4)],[56,34,12,128]);
  time+=701;output.tick();assert.equal(latest,output.standby);
  output.setPrivacy(true);assert.equal(output.accept(new ArrayBuffer(BYTES)),false);assert.equal(latest,output.standby);
  output.setPrivacy(false);output.tick();assert.equal(latest,output.standby);
  output.setLoading(true);assert.equal(output.accept(new ArrayBuffer(BYTES)),false);
  output.setLoading(false);assert.throws(()=>output.accept(new ArrayBuffer(4)),/Invalid/);
 }finally{output.stop();}
 assert.equal(stopped,true);assert.equal(output.sender,null);
});
test('480p and 1080p use exact native frame sizes and preserve alpha',()=>{
 for(const [width,height]of [[848,480],[1920,1080]]){
  let latest;const output=new SyphonOutput((name,w,h)=>{assert.equal(w,width);assert.equal(h,height);return {sendRgbaBuffer:(frame,w,h)=>{assert.equal(w,width);assert.equal(h,height);latest=frame;},stop(){}};},error=>{throw error;});
  output.setSize(width,height);try{output.start();assert.throws(()=>output.setSize(1280,720),/停止/);const data=new ArrayBuffer(width*height*4);new Uint8Array(data).set([12,34,56,128]);output.accept(data);output.tick();assert.equal(latest.length,width*height*4);assert.deepEqual([...latest.subarray(0,4)],[56,34,12,128]);output.setPrivacy(true);assert.equal(latest,output.standby);}finally{output.stop();}
 }
});
