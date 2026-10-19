import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('recognition timer keeps its cadence independently of rendering and cancels on stop',()=>{
  let next,interval,cleared=0,detected=0;
  const context={eyeGaze:{reset(){}},tracking:true,performance:{now:()=>100},detect(){detected++;},setTimeout(fn,ms){next=fn;interval=ms;return 1;},clearTimeout(){cleared++;}};
  runInNewContext(source.slice(source.indexOf('let detectionTimer=null;'),source.indexOf('let lastTrackingReceived')),context);
  context.scheduleDetection();assert.equal(interval,16);next();assert.equal(detected,1);
  context.tracking=false;context.scheduleDetection();assert.equal(cleared,1);
});

test('stopping the camera releases recognition worker and webcam, allowing fresh initialization',()=>{
 let terminated=0,stopped=0,paused=0;
 const context={distanceZoom:{reset(){}},eyeGaze:{reset(){}},resetArmTransitions(){},elbowFilters:[],trackingPresence:{reset(){}},bodyLean:{reset(){}},autoCalibration:{stop(){}},bodyStabilizer:{reset(){}},headStabilizer:{reset(){}},handFilters:{},
  trackingGeneration:1,tracking:true,scheduleDetection(){},restartRenderLoop(){},stream:{getTracks:()=>[{onended(){},stop(){stopped++;}}]},
  trackingWorker:{terminate(){terminated++;}},workerReady:Promise.resolve(),workerBusy:true,
  video:{pause(){paused++;},srcObject:{}},latestFace:{},latestHands:{},latestPose:{},bodyNeutral:{},haveFace:true,post(){},status(){}};
 runInNewContext(source.slice(source.indexOf('function stopTracking(){'),source.indexOf('function detect(now)')),context);
 context.stopTracking();context.stopTracking();
 assert.equal(terminated,1);assert.equal(stopped,1);assert.equal(paused,1);
 assert.equal(context.trackingWorker,null);assert.equal(context.workerReady,null);assert.equal(context.workerBusy,false);
 assert.equal(context.tracking,false);assert.equal(context.stream,null);assert.equal(context.latestPose,null);
});

for(const failed of [false,true])test('late '+(failed?'failed':'completed')+' camera frame cannot interrupt a restarted tracking session',async()=>{
 let resolve,reject,closed=0,stopped=0;
 const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const context={eyeGaze:{reset(){}},workerBusy:false,tracking:true,video:{readyState:2,currentTime:1},lastVideoTime:0,lastDetect:0,
  trackingGeneration:1,trackingWorker:{postMessage(){throw new Error('Stale frame sent');}},
  createImageBitmap:()=>pending,stopTracking(){stopped++;},post(){}};
 runInNewContext(source.slice(source.indexOf('function detect(now)'),source.indexOf('function calibrateFace')),context);
 context.detect(100);context.trackingGeneration=2;context.workerBusy=true;
 if(failed)reject(new Error('Old camera closed'));else resolve({close(){closed++;}});
 await new Promise(done=>setImmediate(done));
 assert.equal(stopped,0);assert.equal(context.workerBusy,true);assert.equal(closed,failed?0:1);
});

test('recognition accepts consecutive 30fps camera frames and never queues while busy',async()=>{
 let frames=0;
 const context={eyeGaze:{reset(){}},workerBusy:false,tracking:true,video:{readyState:2,currentTime:1},lastVideoTime:0,lastDetect:0,trackingGeneration:1,
  createImageBitmap:async()=>({close(){}}),trackingWorker:{postMessage(){frames++;}},stopTracking(){},post(){}};
 runInNewContext(source.slice(source.indexOf('function detect(now)'),source.indexOf('function calibrateFace')),context);
 context.detect(100);await Promise.resolve();assert.equal(frames,1);
 context.video.currentTime=2;context.detect(134);await Promise.resolve();assert.equal(frames,1,'Busy worker must not accumulate frames');
 context.workerBusy=false;context.detect(134);await Promise.resolve();assert.equal(frames,2,'Next 30fps frame should be eligible');
 context.workerBusy=false;context.detect(167);await Promise.resolve();assert.equal(frames,2,'Never infer the same camera frame twice');
});
