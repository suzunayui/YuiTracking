import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,OrthographicCamera} from 'three';
import {PreviewOutput} from '../src/preview-output.js';
import {FrameCapture} from '../src/frame-capture.js';
test('window-shaped preview keeps a fixed 16:9 output and releases its render target',()=>{
 const passes=[],sizes=[];let current,disposed=0;
 const renderer={setSize:(w,h)=>sizes.push([w,h]),setRenderTarget:target=>current=target,render:(scene,camera)=>passes.push({scene,aspect:camera.aspect,target:current})};
 const camera=new PerspectiveCamera(32,16/9),standby=new OrthographicCamera(-640,640,360,-360,.1,10);
 const view=new PreviewOutput(renderer,camera,standby,{createTarget:(w,h)=>({width:w,height:h,dispose:()=>disposed++})});
 view.resize(600,900);assert.equal(camera.aspect,2/3);assert.ok(sizes[0][1]<=720);
 const scene={};view.render(scene,{},false,true);assert.equal(passes[0].aspect,16/9);assert.equal(passes[1].aspect,2/3);assert.equal(passes[0].target.width,1280);assert.equal(passes[0].target.height,720);assert.equal(passes[1].target,null);
 passes.length=0;view.resize(1600,700);view.render(scene,{},false,false);assert.equal(passes.length,1);assert.equal(passes[0].aspect,1600/700);view.release();assert.equal(disposed,1);assert.equal(view.target,null);
});
test('capture reads fixed output target and flips rows, preserving transparency',()=>{
 const target={},gl={readPixels(){throw new Error('Preview pixels must not be captured');}};
 const renderer={getContext:()=>gl,readRenderTargetPixels:(actual,x,y,w,h,raw)=>{assert.equal(actual,target);assert.equal(w,1);assert.equal(h,2);raw.set([1,2,3,0,4,5,6,128]);}};
 const capture=new FrameCapture(renderer,1,2);capture.target=target;assert.deepEqual([...capture.read()],[4,5,6,128,1,2,3,0]);assert.equal(capture.read(),capture.pixels);
});
