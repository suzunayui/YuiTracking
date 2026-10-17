import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRecognitionBackend} from '../src/recognition-backend.js';
test('CPU backend does not create a graphics context and rejects unknown delegates',()=>{
 assert.deepEqual(createRecognitionBackend(),{delegate:'CPU'});
 assert.throws(()=>createRecognitionBackend('CUDA'),/不正/);
});
test('GPU backend refuses unavailable, software, and unexpected adapters',()=>{
 const source=readFileSync(new URL('../src/recognition-backend.js',import.meta.url),'utf8').replace('export ','');
 const backend=(renderer,available=true)=>runInNewContext(source+';createRecognitionBackend',{
  OffscreenCanvas:class{getContext(){return available?{getExtension:()=>({UNMASKED_RENDERER_WEBGL:1}),getParameter:()=>renderer}:null;}}
 });
 assert.throws(()=>backend('',false)('GPU'),/WebGL 2/);
 assert.throws(()=>backend('ANGLE SwiftShader')('GPU'),/ソフトウェア/);
 assert.throws(()=>backend('GPU A')('GPU','GPU B'),/指定したGPU/);
 assert.equal(backend('ANGLE GPU B')('GPU','GPU B').renderer,'ANGLE GPU B');
});
