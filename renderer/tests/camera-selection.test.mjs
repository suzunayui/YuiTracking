import test from 'node:test';
import assert from 'node:assert/strict';
import {openCameraStream,resolveNamedCamera} from '../src/camera-selection.js';
const camera=(deviceId,label)=>({kind:'videoinput',deviceId,label});
function fixture(list){
 let opened=false,stopped=0;const requests=[];
 const track={getSettings:()=>({deviceId:list[0]?.deviceId}),stop(){stopped++;}};
 const probe={getTracks:()=>[track],getVideoTracks:()=>[track]};
 const devices={enumerateDevices:async()=>opened?list:[camera('','')],getUserMedia:async options=>{requests.push(options);opened=true;return probe;}};
 return {devices,probe,requests,stopped:()=>stopped};
}

test('native label resolves selected camera without guessing enumeration order',()=>{
 assert.equal(resolveNamedCamera([camera('other','Other'),camera('chosen','USB Camera (046d:082d)')],'USB Camera'),'chosen');
 assert.throws(()=>resolveNamedCamera([camera('other','Other')],'USB Camera'),/選び直して/);
 assert.throws(()=>resolveNamedCamera([camera('a','USB Camera'),camera('b','USB Camera')],'USB Camera'),/複数/);
});
test('single native and browser camera can have different display labels',async()=>{
 const f=fixture([camera('internal','Browser camera label')]);let refreshed=0;
 assert.equal(await openCameraStream(f.devices,'','macOS camera label',()=>{refreshed++;},{singleNativeCamera:true}),f.probe);
 assert.equal(refreshed,1);assert.equal(f.requests.length,1);assert.equal(f.stopped(),0,'Keep the acquired camera running');
 assert.equal(f.requests[0].audio,false);assert.equal(f.requests[0].video.width.ideal,1280);
});
test('multiple cameras with mismatching labels refresh the list and do not select another camera',async()=>{
 const f=fixture([camera('a','Camera A'),camera('b','Camera B')]);let refreshed=0;
 await assert.rejects(openCameraStream(f.devices,'','Different native label',()=>{refreshed++;},{singleNativeCamera:true}),/選び直して/);
 assert.equal(f.requests.length,1);assert.equal(f.stopped(),1);assert.equal(refreshed,1);
});
test('matching probe stream is reused even with multiple cameras',async()=>{
 const f=fixture([camera('a','Camera A'),camera('b','Camera B')]);
 assert.equal(await openCameraStream(f.devices,'','Camera A',()=>{}),f.probe);
 assert.equal(f.requests.length,1);assert.equal(f.stopped(),0);
});
test('selecting another physical camera releases the probe and opens the chosen ID',async()=>{
 const f=fixture([camera('a','Camera A'),camera('b','Camera B')]);
 await openCameraStream(f.devices,'','Camera B',()=>{});
 assert.equal(f.requests.length,2);assert.equal(f.stopped(),1);
 assert.deepEqual(f.requests[1].video.deviceId,{exact:'b'});
});
test('probe releases tracks if enumeration fails',async()=>{
 const f=fixture([camera('a','Camera A')]);let calls=0;
 const enumerate=f.devices.enumerateDevices;f.devices.enumerateDevices=async()=>{if(calls++)throw new Error('enumeration failed');return enumerate();};
 await assert.rejects(openCameraStream(f.devices,'','Camera A',()=>{}),/enumeration failed/);assert.equal(f.stopped(),1);
});
test('known browser IDs open exactly that camera without probing or enumeration',async()=>{
 const f=fixture([]);f.devices.enumerateDevices=()=>{throw new Error('must not enumerate');};
 await openCameraStream(f.devices,'chosen','',()=>{});
 assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].video.deviceId,{exact:'chosen'});
});
test('denied camera permission is preserved and does not fall back to another input',async()=>{
 const f=fixture([camera('a','Camera A')]);const error=new Error('Permission denied');f.devices.getUserMedia=async()=>{throw error;};
 await assert.rejects(openCameraStream(f.devices,'','Camera A',()=>{},{singleNativeCamera:true}),value=>value===error);
});
