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
 const source=readFileSync(new URL('../../electron/ui/app.js',import.meta.url),'utf8');
 const handler=source.slice(source.indexOf("if(message.type==='cameras')"),source.indexOf("if(message.type==='cameraInput')"));
 const select={value:'native:0',replaceChildren(...items){this.items=items;this.value=items[0]?.value||'';}};
 const context={nativeLabels:['macOS camera label'],browserLabels:false,$:()=>select,Option:function(label,value){this.label=label;this.value=value;}};
 const dispatch=message=>{context.message=message;runInNewContext(handler,context);};
 dispatch({type:'cameras',selectionReady:true,labelsAvailable:false,items:[{deviceId:'internal',label:'Camera 1'},{deviceId:'other',label:'Camera 2'}]});
 assert.equal(select.value,'internal');assert.equal(context.browserLabels,true);
 select.value='other';
 dispatch({type:'cameras',selectionReady:false,labelsAvailable:false,items:[{deviceId:'internal',label:'Camera 1'},{deviceId:'other',label:'Camera 2'}]});
 assert.equal(select.value,'other','Refresh must preserve the selected browser ID instead of restoring native labels');
});

test('camera list accepts a usable label even if another device label is hidden',async()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');let result;
 const context={selectableCameras,post:(type,message)=>{result=message;}};
 runInNewContext(source.slice(source.indexOf('async function listCameras('),source.indexOf('async function startTracking(')),context);
 await context.listCameras([camera('internal','Internal camera'),camera('hidden',''),camera('obs','OBS Virtual Camera')]);
 assert.equal(result.labelsAvailable,true);assert.equal(result.items.length,2);
});
