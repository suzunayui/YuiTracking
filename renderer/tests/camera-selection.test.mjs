import test from 'node:test';
import assert from 'node:assert/strict';
import {openCameraStream,resolveNamedCamera,selectableCameras} from '../src/camera-selection.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
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

test('virtual cameras and empty IDs do not prevent unique physical-camera selection',()=>{
 const list=[camera('internal','Browser internal camera'),camera('obs','OBS Virtual Camera'),camera('','')];
 assert.equal(resolveNamedCamera(list,'macOS built-in camera',{singleNativeCamera:true}),'internal');
 assert.deepEqual(selectableCameras(list),[list[0]]);
});

test('an unidentified probe is not reused as the chosen physical camera',async()=>{
 const f=fixture([camera('internal','Internal camera')]);
 f.probe.getVideoTracks()[0].getSettings=()=>({});
 await openCameraStream(f.devices,'','Internal camera',()=>{});
 assert.equal(f.requests.length,2);assert.equal(f.stopped(),1);
 assert.deepEqual(f.requests[1].video.deviceId,{exact:'internal'});
});

test('Mac camera picker keeps discovered browser IDs when a camera label is blank',()=>{
 const source=readFileSync(new URL('../../electron/ui/camera-picker.js',import.meta.url),'utf8');
 const Picker=runInNewContext(source+';CameraPicker');const picker=new Picker();
 const message={labelsAvailable:false,items:[{deviceId:'internal',label:'カメラ 1'},{deviceId:'other',label:'カメラ 2'}]};
 assert.equal(picker.update(message,['macOS camera label'],'').selected,'default:');
 assert.equal(picker.update(message,['macOS camera label'],'other').selected,'other');
});

test('Mac native camera and iPhone names remain present after an empty browser refresh',()=>{
 const Picker=runInNewContext(readFileSync(new URL('../../electron/ui/camera-picker.js',import.meta.url),'utf8')+';CameraPicker');
 const picker=new Picker(),native=['MacBook Air Camera','iPhone Camera'];
 const before=picker.update({items:[]},native,'');
 const after=picker.update({selectionReady:true,items:[]},native,before.selected);
 assert.equal(after.options.length,3);assert.equal(after.selected,before.selected);
 assert.equal(after.options[2].label,'iPhone Camera');assert.equal(after.options[2].disabled,false);
});

test('blank labels keep the camera name and missing browser IDs remain marked unavailable',()=>{
 const Picker=runInNewContext(readFileSync(new URL('../../electron/ui/camera-picker.js',import.meta.url),'utf8')+';CameraPicker');
 const picker=new Picker();
 picker.update({labelsAvailable:true,items:[{deviceId:'phone',label:'iPhone Camera'}]},[],'');
 const hidden=picker.update({labelsAvailable:false,items:[{deviceId:'phone',label:'カメラ 1'}]},[],'phone');
 assert.equal(hidden.options[1].label,'iPhone Camera');assert.equal(hidden.options[1].disabled,false);
 const missing=picker.update({items:[]},[],'phone');
 assert.equal(missing.options[1].label,'iPhone Camera');assert.equal(missing.options[1].disabled,true);
 assert.equal(missing.selected,'phone');
});

test('explicit selection of a hidden iPhone probes permission even if another camera has a label',async()=>{
 const f=fixture([camera('webcam','Webcam'),camera('phone','iPhone Camera')]);
 const enumerate=f.devices.enumerateDevices;let calls=0;
 f.devices.enumerateDevices=async()=>calls++===0?[camera('webcam','Webcam')]:enumerate();
 await openCameraStream(f.devices,'','iPhone Camera',()=>{});
 assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1].video.deviceId,{exact:'phone'});
});

test('camera list accepts a usable label even if another device label is hidden',async()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');let result;
 const context={selectableCameras,post:(type,message)=>{result=message;}};
 runInNewContext(source.slice(source.indexOf('async function listCameras('),source.indexOf('async function startTracking(')),context);
 await context.listCameras([camera('internal','Internal camera'),camera('hidden',''),camera('obs','OBS Virtual Camera')]);
 assert.equal(result.labelsAvailable,true);assert.equal(result.items.length,2);
});

test('explicit system-default camera starts without label lookup or device enumeration',async()=>{
 const f=fixture([]);f.devices.enumerateDevices=()=>{throw new Error('Enumeration unavailable');};
 await openCameraStream(f.devices,'',undefined,()=>{throw new Error('Must not resolve names');});
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].video.deviceId,undefined);
});

test('camera enumeration failure warns without raising a tracking-stop error',async()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');let result;
 const context={navigator:{mediaDevices:{enumerateDevices:async()=>{throw new Error('Cannot enumerate');}}},post:(type,message)=>{result={type,...message};}};
 runInNewContext(source.slice(source.indexOf('async function listCameras('),source.indexOf('async function startTracking(')),context);
 await context.listCameras();assert.equal(result.type,'cameraListWarning');assert.match(result.text,/Cannot enumerate/);
});
