import test from 'node:test';
import assert from 'node:assert/strict';
import {browserCameraId,resolveNamedCamera} from '../src/camera-selection.js';
const camera=(deviceId,label)=>({kind:'videoinput',deviceId,label});
test('native label resolves the selected browser camera rather than enumeration order',()=>{
 assert.equal(resolveNamedCamera([camera('other','Other camera'),camera('chosen','USB Camera (046d:082d)')],'USB Camera'),'chosen');
 assert.throws(()=>resolveNamedCamera([camera('other','Other camera')],'USB Camera'),/見つかりません/);
 assert.throws(()=>resolveNamedCamera([camera('a','USB Camera'),camera('b','USB Camera')],'USB Camera'),/複数/);
});
test('permission probe stops all tracks before returning the selected browser ID',async()=>{
 let opened=false,stopped=0,refreshed=0;
 const devices={enumerateDevices:async()=>opened?[camera('other','Other'),camera('chosen','USB Camera')]:[camera('','')],getUserMedia:async options=>{assert.deepEqual(options,{video:true,audio:false});opened=true;return {getTracks:()=>[{stop:()=>stopped++}]};}};
 assert.equal(await browserCameraId(devices,'','USB Camera',()=>{assert.equal(stopped,1);refreshed++;}),'chosen');
 assert.equal(refreshed,1);
});
test('probe releases tracks when enumeration fails and known browser IDs never probe',async()=>{
 let calls=0,stopped=0;
 const devices={enumerateDevices:async()=>{if(calls++)throw new Error('enumeration failed');return [camera('','')];},getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})};
 await assert.rejects(browserCameraId(devices,'','USB Camera',()=>{}),/enumeration failed/);
 assert.equal(stopped,1);
 assert.equal(await browserCameraId(devices,'known','',()=>{}),'known');
 assert.equal(calls,2);
});
