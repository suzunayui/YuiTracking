import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { bend, clamp, smoothingAlpha, handSmoothingAlpha, safeTracking, calibratedBlink } from './rig-math.js';
import { placeAvatar } from './avatar-placement.js';
import { avatarHeadRotation } from './head-rotation.js';
import {applyBodyTurn} from './body-turn.js';
import {linkedBodyRotation,headRotationInRoot,applyLinkedHeadRotation} from './head-linked-body.js';
import {bodyPose,relativeBodyPose,avatarBodyRotation} from './body-pose.js';
import {fingerBones,palmBasis,fingerSegments,captureHandRest,shoulderWristTarget,handWristTarget,wristDepthRatio,trackedElbowTarget,elbowPoleDirection,keepElbowInFront} from './hand-rig.js';
import {LandmarkFilter,handFilterOptions} from './landmark-filter.js';
import {BodyStabilizer} from './body-stabilizer.js';
import {AutoCalibration} from './auto-calibration.js';
import {mouthShapes} from './mouth-shapes.js';
import {RotationStabilizer} from './rotation-stabilizer.js';
import {BodyLean,scaledBodyLean} from './body-lean.js';
import {TrackingPresence} from './tracking-presence.js';
import {TrackingTransition} from './tracking-transition.js';
import {WristDepth} from './wrist-depth.js';
import {HandIdentity} from './hand-identity.js';
import {SpringStrength} from './spring-strength.js';
import {EyeGaze,applyVrmGaze} from './eye-gaze.js';
import {openCameraStream,selectableCameras} from './camera-selection.js';
import {AvatarBackground} from './background.js';
import {FrameCapture} from './frame-capture.js';
import {avatarTextures} from './avatar-textures.js';

const W=1280,H=720;
const host=window.yuiHost ?? window.chrome?.webview ?? (window.parent!==window ? {
 postMessage:message=>window.parent.postMessage({yuiRenderer:message},location.origin),
 sendFrame:pixels=>window.parent.postMessage({yuiAvatarFrame:pixels.buffer},location.origin,[pixels.buffer]),
 addEventListener:(type,callback)=>{if(type==='message')window.addEventListener('message',event=>{if(event.source===window.parent&&event.origin===location.origin&&event.data?.yuiCommand)callback({data:event.data.yuiCommand});});}
}:null);
const post=(type,rest={})=>host?.postMessage({type,...rest});
const status=(text,temporary=false)=>post('status',{text,temporary});
const scene=new THREE.Scene(); scene.background=new THREE.Color('#00ff00');
const avatarBackground=new AvatarBackground(scene);
const cameraTarget=new THREE.Vector3(0,1.1,0);
const camera=new THREE.PerspectiveCamera(32,W/H,0.01,100); camera.position.set(0,1.35,3.1); camera.lookAt(cameraTarget);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true,premultipliedAlpha:false});
renderer.setClearColor(0x000000,0);
renderer.setSize(W,H,false); renderer.setPixelRatio(1); renderer.outputColorSpace=THREE.SRGBColorSpace;
// Keep the VRM's authored colors without filmic highlight compression.
renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;
document.body.appendChild(renderer.domElement);
renderer.domElement.title='マウスホイール／ピンチ：拡大・縮小\nドラッグ：上下左右に移動（Macの3本指ドラッグ対応）\n右ドラッグ：カメラを回転';
renderer.domElement.style.touchAction='none';
// Handle this inside WebView2; its native surface does not reliably bubble
// pointer gestures to the surrounding XAML controls. Keep the same WebView
// alive so expanding the preview cannot restart tracking or virtual output.
if(host){
 renderer.domElement.title+='\nダブルクリック：最大化・元に戻す\nEsc：最大化から元に戻す';
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  event.preventDefault();
  post('restorePreview');
 });
 document.body.addEventListener('dblclick',event=>{
  if(event.button!==0)return;
  event.preventDefault();
  post('togglePreviewMaximized');
 });
}
// Electron uses a parent frame; Windows handles these keys in its native host.
if(window.parent!==window&&!window.chrome?.webview){
 const held=new Set();let candidate=null;
 document.addEventListener('keydown',event=>{held.add(event.code);if(!event.repeat&&held.size===1&&['ControlRight','ShiftRight'].includes(event.code))candidate=event.code;else if(event.code!==candidate)candidate=null;});
 document.addEventListener('keyup',event=>{if(candidate===event.code&&held.size===1)post('calibrateRequest');held.delete(event.code);candidate=null;});
 window.addEventListener('blur',()=>{held.clear();candidate=null;});
}
let panPointer=null,panButton=4,panX=0,panY=0,orbitPointer=null,orbitX=0,orbitY=0;
let scrollToPan=false;
const panDepth=Math.hypot(3.1,.25);
function saveFraming(){post('framingChanged',{zoom:camera.zoom,x:camera.position.x,y:camera.position.y,z:camera.position.z,targetX:cameraTarget.x,targetY:cameraTarget.y,targetZ:cameraTarget.z});}
function endPan(){
 const pointer=panPointer;panPointer=null;renderer.domElement.style.cursor='';
 if(pointer!==null&&renderer.domElement.hasPointerCapture(pointer))renderer.domElement.releasePointerCapture(pointer);
}
renderer.domElement.addEventListener('pointerdown',event=>{
 if(event.button===2&&panPointer===null&&orbitPointer===null){
  event.preventDefault();orbitPointer=event.pointerId;orbitX=event.clientX;orbitY=event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);renderer.domElement.style.cursor='grabbing';return;
 }
 if(![0,1].includes(event.button)||panPointer!==null||orbitPointer!==null)return;
 event.preventDefault();
 panPointer=event.pointerId;panButton=event.button===0?1:4;panX=event.clientX;panY=event.clientY;
 renderer.domElement.setPointerCapture(event.pointerId);renderer.domElement.style.cursor='grabbing';
});
renderer.domElement.addEventListener('pointermove',event=>{
 if(event.pointerId===orbitPointer){
  if(!(event.buttons&2)){endOrbit();return;}
  event.preventDefault();
  const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(cameraTarget));
  spherical.theta-=(event.clientX-orbitX)*.006;
  spherical.phi=clamp(spherical.phi-(event.clientY-orbitY)*.006,.05,Math.PI-.05);
  camera.position.copy(cameraTarget).add(new THREE.Vector3().setFromSpherical(spherical));camera.lookAt(cameraTarget);
  orbitX=event.clientX;orbitY=event.clientY;saveFraming();return;
 }
 if(event.pointerId!==panPointer)return;
 if(!(event.buttons&panButton)){endPan();return;}
 event.preventDefault();
 const rect=renderer.domElement.getBoundingClientRect();
 const height=Math.min(rect.height,rect.width/(W/H));
 if(height>0){
  const units=2*panDepth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(camera.zoom*height);
  // Move perpendicular to the view so the avatar follows the pointer at any zoom.
  const movement=new THREE.Vector3(-(event.clientX-panX)*units,(event.clientY-panY)*units,0).applyQuaternion(camera.quaternion);
  camera.position.add(movement);cameraTarget.add(movement);
  saveFraming();
 }
 panX=event.clientX;panY=event.clientY;
});
function endOrbit(){const pointer=orbitPointer;orbitPointer=null;renderer.domElement.style.cursor='';if(pointer!==null&&renderer.domElement.hasPointerCapture(pointer))renderer.domElement.releasePointerCapture(pointer);}
for(const type of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(type,event=>{
 if(event.pointerId===panPointer)endPan();
 if(event.pointerId===orbitPointer)endOrbit();
});
window.addEventListener('blur',()=>{endPan();endOrbit();});
renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
renderer.domElement.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
renderer.domElement.addEventListener('wheel',event=>{
 event.preventDefault();
 if(scrollToPan&&!event.ctrlKey){
  const rect=renderer.domElement.getBoundingClientRect(),height=Math.min(rect.height,rect.width/(W/H));
  if(height<=0)return;
  const scale=event.deltaMode===1?16:event.deltaMode===2?height:1;
  const units=2*panDepth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(camera.zoom*height);
  const movement=new THREE.Vector3(event.deltaX*scale*units,-event.deltaY*scale*units,0).applyQuaternion(camera.quaternion);
  camera.position.add(movement);cameraTarget.add(movement);saveFraming();return;
 }
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?H:1);
 camera.zoom=clamp(camera.zoom*Math.exp(-clamp(delta,-720,720)*.0015),.5,20);
 camera.updateProjectionMatrix();
 saveFraming();
},{passive:false});
scene.add(new THREE.HemisphereLight(0xffffff,0xffffff,.35));
const key=new THREE.DirectionalLight(0xffffff,Math.PI*.85); key.position.set(1,3,3); scene.add(key);
let vrm=null,demo=null,head=null,eyes=[],arms={},loading=false,privacy=false,output=false;
const bodyFromHead=true,bodyLeanEnabled=true;
let springStrength=1,chestSpringStrength=1,springControl=null;
let smoothing=.65,sensitivity=1,bodyStrength=1,forwardLeanStrength=1,backwardLeanStrength=1,mouthOpenStrength=1,mouthSensitivity=1.8,tracking=false,video,stream,initializing=false;
let latestFace=null,latestHands=null,frameNumber=0,lastVideoTime=-1,lastDetect=0,lastRender=0;
let calibration=new THREE.Quaternion(),rawHead=new THREE.Quaternion(),haveFace=false;
let blinkBaseline={left:0,right:0};
const eyeGaze=new EyeGaze();let gazeMode='tracking',gazeStrength=1,gazeRange=1;
const autoCalibration=new AutoCalibration();
let latestPose=null,lastPoseDetect=0,bodyNeutral=null;
let lastHandDetection=-1;
const bodyStabilizer=new BodyStabilizer();
const headStabilizer=new RotationStabilizer();
const elbowFilters=Array.from({length:4},()=>new LandmarkFilter({minCutoff:1,beta:5}));
const bodyLean=new BodyLean();
const trackingPresence=new TrackingPresence();
const handIdentity=new HandIdentity();
const handTransitions=Object.fromEntries(['left','right'].map(side=>[side,new TrackingTransition({holdMs:600,recoveryMs:150,recoveryRate:20})]));
const wristDepthFilters=Object.fromEntries(['left','right'].map(side=>[side,new WristDepth()]));
const elbowTransitions=Object.fromEntries(['left','right'].map(side=>[side,new TrackingTransition()]));
function resetArmTransitions(){handIdentity.reset();for(const filter of Object.values(wristDepthFilters))filter.reset();for(const transition of [...Object.values(handTransitions),...Object.values(elbowTransitions)])transition.reset();}
let handRest={};
let mouthMorphBinds=[];
const handFilters=Object.fromEntries(['Left','Right'].map(side=>[side,{screen:new LandmarkFilter(handFilterOptions),world:new LandmarkFilter(handFilterOptions)}]));
function stabilizeHands(result,time){
 const seen=new Set();
 for(let i=0;i<(result.landmarks?.length??0);i++){
  const side=result.handedness?.[i]?.[0]?.categoryName,filter=handFilters[side];
  if(!filter)continue;
  seen.add(side);result.landmarks[i]=filter.screen.update(result.landmarks[i],time);
  if(result.worldLandmarks?.[i])result.worldLandmarks[i]=filter.world.update(result.worldLandmarks[i],time);
 }
 for(const [side,filter]of Object.entries(handFilters))if(!seen.has(side)){filter.screen.reset();filter.world.reset();}
 return result;
}
let framePending=false,loadVersion=0;
let sharedFramePixels=null;
let perfLast=0,perfFrames=0,perfSent=0,perfDetect=0,perfCapture=0,perfAck=0,perfPendingAt=0;
const perfStats={renderFps:0,frameFps:0,detectMs:0,captureMs:0,ackMs:0};
const capture=new FrameCapture(renderer,W,H);
// Only this WebGL canvas is ever copied to the outbound frame buffer. The input
// video is kept detached and is passed exclusively to the landmark detectors.
const standby=new THREE.Scene(); standby.background=new THREE.Color('#171b2e');
const standbyCam=new THREE.OrthographicCamera(-W/2,W/2,H/2,-H/2,.1,10);standbyCam.position.z=1;
for (const x of [-20,20]) {const b=new THREE.Mesh(new THREE.PlaneGeometry(20,96),new THREE.MeshBasicMaterial({color:'#82e2c0'}));b.position.x=x;standby.add(b);}
function mesh(geometry,color,parent,x=0,y=0,z=0) {
 const o=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.55})); o.position.set(x,y,z);parent.add(o);return o;
}
function disposeAvatarScene(avatarScene){
 const images=new Set([...avatarTextures(avatarScene)].map(texture=>texture.image));
 VRMUtils.deepDispose(avatarScene);
 for(const image of images)image?.close?.();
}
function removeAvatar() {
 mouthMorphBinds=[];springControl=null;post('springCapabilities',{chestJoints:0});resetArmTransitions();
 if(vrm){scene.remove(vrm.scene);disposeAvatarScene(vrm.scene);vrm=null;}
 if(demo){scene.remove(demo);demo.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});demo=null;}
 head=null;eyes=[];arms={};handRest={};renderer.renderLists.dispose();
}
function makeDemo(){
 removeAvatar(); demo=new THREE.Group(); scene.add(demo);
 mesh(new THREE.CapsuleGeometry(.18,.38,8,16),'#8380f7',demo,0,.87,0);
 mesh(new THREE.SphereGeometry(.07,20,16),'#82e2c0',demo,0,.98,.19);
 head=new THREE.Group();head.position.set(0,1.38,0);demo.add(head);
 mesh(new THREE.BoxGeometry(.46,.36,.32),'#e5e5ff',head);
 mesh(new THREE.BoxGeometry(.39,.23,.025),'#232941',head,0,.015,.169);
 eyes=[-.10,.10].map(x=>mesh(new THREE.SphereGeometry(.037,16,12),'#83e2c0',head,x,.035,.194));
 mesh(new THREE.BoxGeometry(.09,.018,.015),'#83e2c0',head,0,-.055,.192).name='mouth';
 mesh(new THREE.CylinderGeometry(.012,.012,.12),'#e5e5ff',head,0,.23,0);
 mesh(new THREE.SphereGeometry(.036,16,12),'#83e2c0',head,0,.30,0);
 arms={};
 for(const side of ['left','right']){
  const sign=side==='left'?1:-1;
  const upper=new THREE.Group();upper.position.set(sign*.25,1.05,0);demo.add(upper);
  mesh(new THREE.CapsuleGeometry(.065,.20,6,12),'#e5e5ff',upper,0,-.14,0);
  const lower=new THREE.Group();lower.position.y=-.27;upper.add(lower);
  mesh(new THREE.CapsuleGeometry(.05,.17,6,12),'#b9b8ea',lower,0,-.11,0);
  const hand=new THREE.Group();hand.position.y=-.23;lower.add(hand);
  mesh(new THREE.BoxGeometry(.105,.115,.065),'#e5e5ff',hand,0,-.04,0);
  const fingers=[];
  for(let i=0;i<5;i++){const f=new THREE.Group();f.position.set((i-2)*.026,-.085,0);hand.add(f);mesh(new THREE.CapsuleGeometry(.01,.065,3,6),'#83e2c0',f,0,-.028,0);fingers.push(f);}
  arms[side]={upper,lower,hand,fingers};
  mesh(new THREE.CapsuleGeometry(.073,.24,6,12),'#b9b8ea',demo,sign*.1,.40,0);
 }
 loading=false;status('内蔵サンプルを表示中');
}
async function loadModel(requestId){
 const version=++loadVersion;loading=true;status('VRMを読み込み中…');
 try{
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
   if(url.startsWith('blob:')||url.startsWith('data:')||url.startsWith('https://yuitracking.local/avatar.vrm'))return url;
   throw new Error('外部ファイル参照のあるモデルには対応していません。');
  });
  const loader=new GLTFLoader(manager);loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.loadAsync(`https://yuitracking.local/avatar.vrm?v=${version}`);
  const next=gltf.userData.vrm;if(!next)throw new Error('VRM 0.x / 1.0のモデルを選択してください。');
  if(version!==loadVersion){disposeAvatarScene(next.scene);return;}
  removeAvatar();vrm=next;VRMUtils.rotateVRM0(vrm);scene.add(vrm.scene);
  mouthMorphBinds=['aa','ih','ou','ee','oh'].flatMap(name=>(vrm.expressionManager?.getExpression(name)?.binds??[]).filter(bind=>bind.primitives&&Number.isInteger(bind.index)).map(bind=>({bind,baseWeight:bind.weight})));
  placeAvatar(vrm);
  springControl=new SpringStrength(vrm.springBoneManager);springControl.setStrength(springStrength,chestSpringStrength);
  post('springCapabilities',{chestJoints:springControl.chestCount});
  handRest={};
  for(const side of ['left','right']){
   const hand=bone(side+'Hand');if(!hand)continue;
   const nodes=Object.fromEntries(fingerBones.flat().map(name=>[name,bone(side+name)]));
   handRest[side]=captureHandRest(hand,nodes,side==='left'?1:-1);
  }
  status('VRMを表示中');
  post('modelLoaded',{requestId});
 }catch(e){if(version===loadVersion){post('modelFailed',{requestId});post('error',{text:'VRM読み込み失敗：'+e.message});}}
 finally{if(version===loadVersion)loading=false;}
}
let trackingWorker,workerReady,workerBusy=false,trackingGeneration=0;
let detectionTimer=null;
function scheduleDetection(){
 if(detectionTimer!==null)clearTimeout(detectionTimer);
 detectionTimer=null;
 if(tracking)detectionTimer=setTimeout(()=>{detectionTimer=null;detect(performance.now());scheduleDetection();},16);
}
let lastTrackingReceived=0,trackingGapMs=0,trackingLatencyMs=0,trackingResults=0;
let recognitionDelegate='CPU',expectedRecognitionRenderer='';
async function ensureTasks(){
 if(workerReady)return workerReady;
 status('顔・手・上半身の認識エンジンを準備中…');
 workerReady=new Promise((resolve,reject)=>{
  trackingWorker=new Worker('./tracking-worker.js');
  const fail=error=>{trackingWorker?.terminate();trackingWorker=null;workerReady=null;workerBusy=false;reject(error);if(tracking){stopTracking();post('error',{text:'認識を停止しました：'+error.message});}};
  trackingWorker.onerror=e=>fail(new Error(e.message));
  trackingWorker.onmessage=({data})=>{
   if(data.type==='ready'){post('recognitionReady',{delegate:data.delegate,renderer:data.renderer});resolve();return;}
   if(data.type==='error'){fail(new Error(data.message));return;}
   workerBusy=false;perfDetect=Math.max(perfDetect,data.duration);
   if(!tracking||data.generation!==trackingGeneration)return;
   const receivedAt=performance.now();
   if(lastTrackingReceived)trackingGapMs=Math.max(trackingGapMs,receivedAt-lastTrackingReceived);
   lastTrackingReceived=receivedAt;trackingLatencyMs=Math.max(trackingLatencyMs,receivedAt-data.time);trackingResults++;
   latestFace={result:data.face,time:data.time,receivedAt};
   if(data.pose)latestPose={result:stabilizeElbows(data.pose,data.time),time:data.time,receivedAt};
   const identified=handIdentity.assign(data.hands,data.time,safeTracking(latestPose,data.time)?latestPose.result.landmarks?.[0]:null);
   latestHands={result:stabilizeHands(identified,data.time),time:data.time,receivedAt};
   const handCount=data.hands.landmarks?.length??0;
   if(handCount!==lastHandDetection){lastHandDetection=handCount;post('handDetection',{count:handCount});}
   const matrix=data.face.facialTransformationMatrixes?.[0]?.data;
   const weights=Object.fromEntries((data.face.faceBlendshapes?.[0]?.categories??[]).map(c=>[c.categoryName,c.score]));
   const sample=matrix?{time:data.time,rotation:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(matrix)).toArray(),eyesOpen:Math.max(weights.eyeBlinkLeft??0,weights.eyeBlinkRight??0)<.7}:null;
   if(autoCalibration.observe(sample,performance.now()))calibrateFace(true);

  };
  trackingWorker.postMessage({type:'init',delegate:recognitionDelegate,expectedRenderer:expectedRecognitionRenderer});
 });
 return workerReady;
}
function stabilizeElbows(result,time){
 const points=result.landmarks?.[0];
 if(!points){for(const filter of elbowFilters)filter.reset();return result;}
 const filtered=points.slice();
 for(const [i,index]of [13,14,15,16].entries()){
  const point=points[index];
  if(point&&[point.x,point.y,point.z].every(Number.isFinite)&&(point.visibility??1)>=.6)filtered[index]=elbowFilters[i].update([point],time)[0];
  else elbowFilters[i].reset();
 }
 return {...result,landmarks:[filtered,...result.landmarks.slice(1)]};
}
async function listCameras(devices,selectionReady=false){
 try{devices??=await navigator.mediaDevices.enumerateDevices();}
 catch(error){post('cameraListWarning',{text:'カメラ一覧を更新できません。取得済みの候補を保持しています。'+error.name+'：'+error.message});return;}
 const cameras=selectableCameras(devices);
 post('cameras',{selectionReady,labelsAvailable:cameras.some(d=>!!d.label),items:cameras.map((d,i)=>({deviceId:d.deviceId,label:d.label||`カメラ ${i+1}`}))});
}
async function startTracking(deviceId,cameraLabel,singleNativeCamera=false){
 if(initializing||tracking)return;initializing=true;
 let stage='認識エンジンの準備';
 try{
  await ensureTasks();
  stage='カメラの取得';
  // No audio capture, no display capture, and no automatic start on launch.
  stream=await openCameraStream(navigator.mediaDevices,deviceId,cameraLabel,devices=>listCameras(devices,true),{singleNativeCamera});
  const track=stream.getVideoTracks()[0];
  await listCameras();
  if(/YuiTracking Camera|HoloTrack Avatar Camera|Unity Video Capture|OBS Virtual Camera|WarudoCam/i.test(track.label))throw new Error('入力に実際のWebカメラを選択してください。');
  video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
  stage='カメラ映像の再生';
  await video.play(); await listCameras();
  const input=track.getSettings();post('cameraInput',{label:track.label,deviceId:input.deviceId,width:input.width??video.videoWidth,height:input.height??video.videoHeight,fps:input.frameRate??0});
  track.onended=()=>{stopTracking();status('カメラが切断されました。待機ポーズに戻ります。');};
  lastHandDetection=-1;lastTrackingReceived=0;trackingGapMs=trackingLatencyMs=trackingResults=0;tracking=true;restartRenderLoop();scheduleDetection();lastVideoTime=-1;lastPoseDetect=0;bodyNeutral=null;bodyLean.reset();trackingPresence.reset();resetArmTransitions();calibration.identity();eyeGaze.reset();blinkBaseline={left:0,right:0};autoCalibration.start(performance.now());post('tracking',{active:true});status('正面を向いてカメラを見てください。顔の検出が安定すると一度だけ自動でキャリブレーションします。');
 }catch(e){stopTracking();post('error',{text:'カメラを開始できません：'+stage+' / '+e.name+(e.constraint?' ('+e.constraint+')':'')+'：'+e.message});}
 finally{initializing=false;}
}
function stopTracking(){
 eyeGaze.reset();
 autoCalibration.stop();
 bodyStabilizer.reset();headStabilizer.reset();bodyLean.reset();trackingPresence.reset();resetArmTransitions();
 for(const filter of elbowFilters)filter.reset();
 for(const filter of Object.values(handFilters)){filter.screen.reset();filter.world.reset();}
 trackingGeneration++;tracking=false;scheduleDetection();restartRenderLoop();stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;
 // Stopped tracking should release all three WASM recognition engines.
 trackingWorker?.terminate();trackingWorker=null;workerReady=null;workerBusy=false;
 if(video){video.pause();video.srcObject=null;video=null;}
 latestFace=latestHands=latestPose=null;bodyNeutral=null;haveFace=false;post('tracking',{active:false});status('カメラ停止中。待機ポーズを表示しています。');
}
function detect(now){
 if(workerBusy||!tracking||!video||video.readyState<2||video.currentTime===lastVideoTime||now-lastDetect<24)return;
 lastVideoTime=video.currentTime;lastDetect=now;workerBusy=true;
 const generation=trackingGeneration;
 createImageBitmap(video).then(bitmap=>{
  if(!tracking||generation!==trackingGeneration||!trackingWorker){bitmap.close();if(generation===trackingGeneration)workerBusy=false;return;}
  trackingWorker.postMessage({type:'frame',bitmap,time:now,generation},[bitmap]);
 }).catch(e=>{if(generation!==trackingGeneration)return;workerBusy=false;stopTracking();post('error',{text:'認識を停止しました：'+e.message});});
}
function calibrateFace(automatic=false){
 const matrix=latestFace?.result.facialTransformationMatrixes?.[0]?.data;
 if(matrix&&safeTracking(latestFace,performance.now())){
    calibration.setFromRotationMatrix(new THREE.Matrix4().fromArray(matrix));
    autoCalibration.stop();
    const pose=safeTracking(latestPose,performance.now())?bodyPose(latestPose.result.worldLandmarks?.[0]):null;
    bodyNeutral=pose?{...pose}:null;
    bodyStabilizer.reset();headStabilizer.reset();bodyLean.calibrate(matrix,latestFace.time);resetArmTransitions();
    for(const filter of elbowFilters)filter.reset();
    const weights=Object.fromEntries((latestFace.result.faceBlendshapes?.[0]?.categories??[]).map(c=>[c.categoryName,c.score]));
    blinkBaseline={left:clamp(weights.eyeBlinkLeft??0,0,.95),right:clamp(weights.eyeBlinkRight??0,0,.95)};
    eyeGaze.calibrate(latestFace.result.faceLandmarks?.[0],weights,video?.videoWidth&&video?.videoHeight?video.videoWidth/video.videoHeight:16/9);
    if(vrm){vrm.expressionManager?.setValue('blinkLeft',0);vrm.expressionManager?.setValue('blinkRight',0);}
    else eyes.forEach(eye=>eye.scale.y=1);
    status((automatic?'自動キャリブレーション完了。':'')+'正面位置・目の開き具合・目線・上半身の基準を調整しました。',true);
    return true;
 }
 if(!automatic)status('顔が検出されてからキャリブレーションしてください。');
 return false;
}
function bone(name){return vrm?.humanoid.getNormalizedBoneNode(name);}
function rotateBone(name,q,alpha){const n=bone(name);if(n)n.quaternion.slerp(q,alpha);}
const restQ=new THREE.Quaternion();
function aim(node,child,target,alpha){
 if(!node||!child)return;
 node.parent.updateWorldMatrix(true,false);
 const localTarget=node.parent.worldToLocal(target.clone()).sub(node.position).normalize();
 const direction=child.position.clone().normalize();
 if(direction.lengthSq()>.1)node.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(direction,localTarget),alpha);
}
// Camera targets, forward limits and IK share a frame that turns with the torso.
function armTrackingFrame(){
 const torso=vrm?(bone('spine')??bone('chest')??bone('hips')):demo;
 const rotation=new THREE.Quaternion(),origin=new THREE.Vector3();
 if(torso){
  torso.updateWorldMatrix(true,false);torso.getWorldPosition(origin);
  const root=vrm?(vrm.humanoid.normalizedHumanBonesRoot??vrm.scene):torso.parent;
  const basis=root?.getWorldQuaternion(new THREE.Quaternion())??new THREE.Quaternion();
  rotation.copy(torso.getWorldQuaternion(new THREE.Quaternion())).multiply(basis.invert());
 }
 const inverse=rotation.clone().invert();
 return {rotation,toLocal:p=>p.clone().sub(origin).applyQuaternion(inverse).add(origin),toWorld:p=>p.clone().sub(origin).applyQuaternion(rotation).add(origin)};
}
function rigHand(side,landmarks,alpha,worldLandmarks=null,poseLandmarks=null,recovery=null){
 const sign=side==='left'?1:-1;
 const upper=vrm?bone(side+'UpperArm'):arms[side].upper;
 const lower=vrm?bone(side+'LowerArm'):arms[side].lower;
 const hand=vrm?bone(side+'Hand'):arms[side].hand;
 if(!upper||!lower||!hand)return;
 const frame=armTrackingFrame();
 if(!landmarks){
  // VRM normalized arms start in T pose; lower them to an idle pose.
  if(vrm){
   upper.updateWorldMatrix(true,false);
   aim(upper,lower,upper.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(sign*.18,-1,0).applyQuaternion(frame.rotation)),alpha);
  }else upper.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,sign*.10)),alpha);
  lower.quaternion.slerp(restQ,alpha);hand.quaternion.slerp(restQ,alpha);
 }else{
  const wrist=landmarks[0];
  // Map the observed wrist relative to the person's shoulders, scaled to
  // this avatar's shoulder span. This changes placement, not noise filtering.
  let target=null,elbowTarget=null;
  const leftShoulder=vrm?bone('leftUpperArm'):arms.left?.upper;
  const rightShoulder=vrm?bone('rightUpperArm'):arms.right?.upper;
  if(leftShoulder&&rightShoulder){
   (vrm?.scene??demo).updateWorldMatrix(true,true);
   const left=frame.toLocal(leftShoulder.getWorldPosition(new THREE.Vector3())),right=frame.toLocal(rightShoulder.getWorldPosition(new THREE.Vector3()));
   const center=left.clone().add(right).multiplyScalar(.5),span=left.distanceTo(right),aspect=video?video.videoWidth/video.videoHeight:4/3;
   const rawDepth=recovery?wristDepthRatio(wrist,poseLandmarks,recovery.poseWorld,aspect,recovery.poseWristIndex):null;
   const depth=recovery?wristDepthFilters[side].update(rawDepth,recovery.poseTime,recovery.now,recovery.dt):null;
   target=handWristTarget(wrist,poseLandmarks,center,span,aspect,depth)??new THREE.Vector3((.5-wrist.x)*1.7,1.85-wrist.y*1.5,.20);
   elbowTarget=trackedElbowTarget(wrist,poseLandmarks,center,span,aspect,recovery?.poseWristIndex);
  }
  target??=new THREE.Vector3((.5-wrist.x)*1.7,1.85-wrist.y*1.5,.20);
  upper.updateWorldMatrix(true,true);
  const shoulder=frame.toLocal(upper.getWorldPosition(new THREE.Vector3()));
  const l1=shoulder.distanceTo(frame.toLocal(lower.getWorldPosition(new THREE.Vector3())));
  const l2=lower.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  const previousHandRotation=hand.getWorldQuaternion(new THREE.Quaternion());
  // Smooth the wrist in position space first, then solve the complete arm.
  // Independently slerping upper/lower joints makes elbow changes pull the wrist.
  const displayedTarget=frame.toLocal(hand.getWorldPosition(new THREE.Vector3())).lerp(target,alpha);
  displayedTarget.z=Math.max(displayedTarget.z,shoulder.z+.03);
  const dir=displayedTarget.sub(shoulder);const d=clamp(dir.length(),Math.abs(l1-l2)+.01,l1+l2-.01);dir.normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d);
  const currentPole=elbowPoleDirection(frame.toLocal(lower.getWorldPosition(new THREE.Vector3())),shoulder,dir,sign);
  const elbowTransition=recovery?elbowTransitions[side].update(!!elbowTarget,recovery.poseTime,recovery.now,recovery.dt,alpha):{mode:'tracked',alpha};
  // A brief missing elbow holds the bend plane. Sustained loss relaxes it
  // toward a forward-facing bend, while the wrist continues following the hand.
  const trackedElbow=elbowTransition.mode==='tracked'?elbowTarget:null;
  const relaxed=recovery&&!trackedElbow?shoulder.clone().add(new THREE.Vector3(sign*.4,-1,.2)):null;
  const pole=elbowTransition.mode==='hold'?currentPole.clone():elbowPoleDirection(trackedElbow??relaxed,shoulder,dir,sign);
  const turn=new THREE.Quaternion().setFromUnitVectors(currentPole,pole);
  pole.copy(currentPole.applyQuaternion(new THREE.Quaternion().slerp(turn,elbowTransition.alpha)));
  const height=Math.sqrt(Math.max(0,l1*l1-along*along));
  if(elbowTarget||recovery)keepElbowInFront(pole,dir,along,height);
  const elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(pole,height);
  aim(upper,lower,frame.toWorld(elbow),1);upper.updateWorldMatrix(true,true);aim(lower,hand,frame.toWorld(shoulder.clone().addScaledVector(dir,d)),1);
  if(vrm&&worldLandmarks&&handRest[side]){
   const palm=palmBasis(worldLandmarks),rest=handRest[side];
   if(palm&&rest.palm){
    hand.parent.updateWorldMatrix(true,false);
    const worldTarget=frame.rotation.clone().multiply(palm).multiply(rest.palm.clone().invert());
    const parentRotation=hand.parent.getWorldQuaternion(new THREE.Quaternion());
    hand.quaternion.copy(parentRotation.invert().multiply(previousHandRotation.slerp(worldTarget,alpha)));
   }
  }
 }
 const names=['Thumb','Index','Middle','Ring','Little'];
 const segments=worldLandmarks?fingerSegments(worldLandmarks):null;
 for(let i=0;i<5;i++){
  const root=1+i*4;
  const amount=landmarks?bend(landmarks[root],landmarks[root+1],landmarks[root+2]):.12;
  if(vrm){
   for(const [j,name]of fingerBones[i].entries()){
    const node=bone(side+name),direction=segments?.[i]?.[j],rest=handRest[side]?.directions[name];
    if(node&&direction&&rest){
     node.parent.updateWorldMatrix(true,false);
     const localDirection=direction.clone().applyQuaternion(frame.rotation).applyQuaternion(node.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
     node.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(rest,localDirection),alpha);
    }else{
     const jointAmount=landmarks?bend(landmarks[j===0?0:root+j-1],landmarks[root+j],landmarks[root+j+1]):.12;
     rotateBone(side+name,new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,sign*jointAmount)),alpha);
    }
   }
  }else arms[side].fingers[i].rotation.x=THREE.MathUtils.lerp(arms[side].fingers[i].rotation.x,-amount,alpha);
 }
}
function animate(now,dt){
 // Interpolate the already-filtered pose only. Zero reproduces the direct
 // rendering baseline; no prediction, motion gate or additional damping.
 let alpha=smoothing===0?1:smoothingAlpha(smoothing,dt);
 const basis=vrm?vrm.humanoid.normalizedHumanBonesRoot.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();
 const face=safeTracking(latestFace,now)?latestFace.result:null;
 const categories=face?.faceBlendshapes?.[0]?.categories??[];
 const weights=Object.fromEntries(categories.map(c=>[c.categoryName,c.score]));
 const blinkLeft=calibratedBlink(weights.eyeBlinkRight??0,blinkBaseline.right);
 const blinkRight=calibratedBlink(weights.eyeBlinkLeft??0,blinkBaseline.left);
 const mat=face?.facialTransformationMatrixes?.[0]?.data;
 const away=trackingPresence.isAway(!!mat,latestFace?.time,now);
 if(away)alpha=1-Math.exp(-3*clamp(dt,0,.1));
 const target=avatarHeadRotation(headStabilizer.value,sensitivity,basis);haveFace=!!mat;
 if(mat){
  rawHead.setFromRotationMatrix(new THREE.Matrix4().fromArray(mat));
  const relative=calibration.clone().invert().multiply(rawHead);
  target.copy(avatarHeadRotation(headStabilizer.update(relative,latestFace.time),sensitivity,basis));
  bodyLean.update(mat,latestFace.time);
 }
 const bodyHeadTarget=avatarHeadRotation(headStabilizer.value,1,basis);
 if(away){target.identity();bodyHeadTarget.identity();}
 // Linked mode reads only the calibrated, One Euro filtered head rotation.
 // Pose landmarks remain available to the existing shoulder-relative hand IK.
 const pose=!bodyFromHead&&safeTracking(latestPose,now)?bodyPose(latestPose.result.worldLandmarks?.[0]):null;
 const body=bodyFromHead?null:bodyStabilizer.update(pose?relativeBodyPose(pose,bodyNeutral):null,latestPose?.time,now);
 const bodyTarget=away?new THREE.Quaternion():bodyFromHead?linkedBodyRotation(bodyHeadTarget,bodyLeanEnabled?scaledBodyLean(bodyLean.value,forwardLeanStrength,backwardLeanStrength):0,basis,bodyStrength):avatarBodyRotation(body,basis);
 const headNode=vrm?bone('head'):head;
 const rigRoot=vrm?vrm.humanoid.normalizedHumanBonesRoot:scene;
 const previousHead=bodyFromHead&&headNode?headRotationInRoot(headNode,rigRoot):null;
 if(vrm){
  const torso=bone('spine')??bone('chest')??bone('hips');
  applyBodyTurn(torso,bone('hips'),rigRoot,bodyTarget,alpha);
 }else if(demo)demo.quaternion.slerp(bodyTarget,alpha);
 if(bodyFromHead&&headNode)applyLinkedHeadRotation(headNode,rigRoot,previousHead,target,alpha);
 if(vrm){
  if(!bodyFromHead&&headNode)headNode.quaternion.slerp(target,alpha);
  const expr=vrm.expressionManager;
  const vowels=mouthShapes(weights,mouthSensitivity,face?.faceLandmarks?.[0],video?.videoWidth&&video?.videoHeight?video.videoWidth/video.videoHeight:16/9);
  for(const [name,value]of Object.entries({blinkLeft,blinkRight,...vowels,happy:((weights.mouthSmileLeft??0)+(weights.mouthSmileRight??0))*.5})){
   if(expr){
    const expressionAlpha=name.startsWith('blink')?1-Math.exp(-45*dt):1;
    expr.setValue(name,THREE.MathUtils.lerp(expr.getValue(name)??0,value,expressionAlpha));
   }
  }
 }else if(head){
  if(!bodyFromHead)head.quaternion.slerp(target,alpha);eyes.forEach((eye,i)=>eye.scale.y=1-clamp(i?blinkRight:blinkLeft,0,.93));
  const amount=Object.values(mouthShapes(weights,mouthSensitivity)).reduce((sum,value)=>sum+value,0);
  head.getObjectByName('mouth').scale.y=1+(8/1.4)*mouthOpenStrength*amount;
 }
 const hands=!away&&safeTracking(latestHands,now)?latestHands.result:null;
 const poseLandmarks=safeTracking(latestPose,now)?latestPose.result.landmarks?.[0]:null;
 for(const side of ['left','right']){
  // MediaPipe handedness assumes a mirrored/selfie image. Input is unmirrored.
  const label=side==='left'?'Right':'Left';
  const index=hands?.handedness?.findIndex(h=>h[0]?.categoryName===label)??-1;
  const sample=index>=0?{landmarks:hands.landmarks[index],worldLandmarks:hands.worldLandmarks?.[index],time:latestHands.time,receivedAt:latestHands.receivedAt,poseWristIndex:hands.poseWristIndices?.[index]}:null;
  const transition=handTransitions[side].update(!!sample,sample?.time,now,dt,handSmoothingAlpha(smoothing,dt),away);
  const active=transition.mode==='tracked'?sample:null;
  if(transition.mode==='idle'){elbowTransitions[side].reset();wristDepthFilters[side].reset();}
  rigHand(side,active?.landmarks??null,transition.alpha,active?.worldLandmarks??null,poseLandmarks,{now,dt,poseTime:latestPose?.time,poseWorld:safeTracking(latestPose,now)?latestPose.result.worldLandmarks?.[0]:null,poseWristIndex:active?.poseWristIndex});
 }
 // Strength also enlarges the model's morphs; detector weights alone cap at 1.
 const morphScale=mouthOpenStrength;
 for(const {bind,baseWeight}of mouthMorphBinds)bind.weight=baseWeight*morphScale;
 // Synchronize tracked bones before simulating model-authored spring bones.
 // Apply only eye look-at after tracked humanoid bones; node constraints stay disabled.
 if(vrm){
  const gaze=eyeGaze.update(face?.faceLandmarks?.[0],weights,latestFace?.time,now,dt,gazeStrength,video?.videoWidth&&video?.videoHeight?video.videoWidth/video.videoHeight:16/9);
  vrm.humanoid.update();applyVrmGaze(vrm,camera,gazeMode,gaze,dt,gazeRange);vrm.expressionManager?.update();
  vrm.springBoneManager?.update(Math.min(Math.max(dt,0),1/30));
  for(const material of vrm.materials??[])material.update?.(dt);
 }
}
async function sendFrame(){
 if(framePending||!output)return;framePending=true;
 let sharedPosted=false;
 try{
  const started=performance.now();
  const pixels=capture.read();
  perfCapture=Math.max(perfCapture,performance.now()-started);perfPendingAt=performance.now();
  // The iframe host transfers/detaches its buffer; give that path an owned copy.
  if(host?.sendFrame){host.sendFrame(pixels.slice());sharedPosted=true;return;}
  if(sharedFramePixels){sharedFramePixels.set(pixels);post('frameReady');sharedPosted=true;return;}
  const response=await fetch('/frame',{method:'POST',body:pixels,signal:AbortSignal.timeout(1500)});
  if(!response.ok)throw new Error('Frame receiver rejected frame.');
  perfSent++;perfAck=Math.max(perfAck,performance.now()-perfPendingAt);
 }catch(e){post('error',{text:'仮想カメラ送信エラー：'+e.message});}
 finally{if(!sharedPosted)framePending=false;}
}
let loopHandle,loopTimer=false;
function renderInterval(){return 1000/60;}
function scheduleLoop(){
 // Tracking must also run when the preview is occluded or output is disabled.
 loopTimer=output||tracking;
 loopHandle=loopTimer?setTimeout(()=>loop(performance.now()),Math.max(1,renderInterval()-(performance.now()-lastRender))):requestAnimationFrame(loop);
}
function restartRenderLoop(){if(loopTimer)clearTimeout(loopHandle);else cancelAnimationFrame(loopHandle);scheduleLoop();}
function loop(now){
 if(now-lastRender<renderInterval()-1.5){scheduleLoop();return;}
 const dt=Math.min((now-lastRender)/1000,.1);lastRender=now;scheduleLoop();
 animate(now,dt);
 if(privacy||loading)renderer.render(standby,standbyCam);else renderer.render(scene,camera);
 sendFrame();frameNumber++;
 perfFrames++;
 if(now-perfLast>=3000){
  const seconds=(now-perfLast)/1000;
  Object.assign(perfStats,{renderFps:perfFrames/seconds,frameFps:perfSent/seconds,detectMs:perfDetect,captureMs:perfCapture,ackMs:perfAck,trackingFps:trackingResults/seconds,trackingGapMs,trackingLatencyMs});
  if(output)post('performance',perfStats);
  perfLast=now;perfFrames=perfSent=perfDetect=perfCapture=perfAck=0;trackingGapMs=trackingLatencyMs=trackingResults=0;
 }
}
window.chrome?.webview?.addEventListener('sharedbufferreceived',e=>{
 if(e.additionalData?.type!=='avatarFrame')return;
 const buffer=e.getBuffer();
 if(buffer.byteLength!==W*H*4){window.chrome.webview.releaseBuffer(buffer);return;}
 if(sharedFramePixels)window.chrome.webview.releaseBuffer(sharedFramePixels.buffer);
 sharedFramePixels=new Uint8Array(buffer);
});
host?.addEventListener('message',async e=>{
 const m=e.data;
 try{
 switch(m.type){
  case'frameAck':if(framePending){perfSent++;perfAck=Math.max(perfAck,performance.now()-perfPendingAt);}framePending=false;break;
  case'restoreFraming':
   if([m.zoom,m.x,m.y,m.z].every(Number.isFinite)){
    camera.zoom=clamp(m.zoom,.5,20);camera.position.set(m.x,m.y,m.z);
    cameraTarget.set(...([m.targetX,m.targetY,m.targetZ].every(Number.isFinite)?[m.targetX,m.targetY,m.targetZ]:[m.x,m.y-.25,m.z-3.1]));
    camera.lookAt(cameraTarget);camera.updateProjectionMatrix();
   }
   break;
  case'resetFraming':
   endPan();endOrbit();camera.zoom=1;camera.position.set(0,1.35,3.1);cameraTarget.set(0,1.1,0);camera.lookAt(cameraTarget);camera.updateProjectionMatrix();saveFraming();break;
  case'loadModel':await loadModel(m.requestId);break;
  case'demo':loadVersion++;makeDemo();break;
  case'startTracking':await startTracking(m.deviceId,m.cameraLabel,m.singleNativeCamera);break;
  case'recognitionConfig':
   if(initializing||tracking)throw new Error('認識デバイスを変更する前にカメラを停止してください。');
   if(!['CPU','GPU'].includes(m.delegate))throw new Error('認識デバイスの設定が不正です。');
   trackingWorker?.terminate();trackingWorker=null;workerReady=null;workerBusy=false;
   recognitionDelegate=m.delegate;expectedRecognitionRenderer=typeof m.expectedRenderer==='string'?m.expectedRenderer:'';break;
  case'navigationMode':scrollToPan=m.pan===true;break;
  case'refreshCameras':await listCameras();break;
  case'stopTracking':stopTracking();break;
  case'calibrate':calibrateFace();break;
  case'background':
   try{if(await avatarBackground.set(m))post('backgroundLoaded',{requestId:m.requestId});}
   catch(err){post('backgroundFailed',{requestId:m.requestId,text:'背景画像を読み込めませんでした。'});}
   break;
  case'settings':
   if(['tracking','camera','fixed'].includes(m.gazeMode))gazeMode=m.gazeMode;
   if(Number.isFinite(m.gazeRange))gazeRange=clamp(m.gazeRange,1,5);
   if(Number.isFinite(m.gazeStrength))gazeStrength=clamp(m.gazeStrength,0,3);
   if(Number.isFinite(m.forwardLeanStrength))forwardLeanStrength=clamp(m.forwardLeanStrength,0,3);
   if(Number.isFinite(m.backwardLeanStrength))backwardLeanStrength=clamp(m.backwardLeanStrength,0,3);
   if(Number.isFinite(m.bodyStrength))bodyStrength=clamp(m.bodyStrength,0,20);
   if(Number.isFinite(m.sensitivity))sensitivity=clamp(m.sensitivity,.3,5);
   if(Number.isFinite(m.springStrength))springStrength=clamp(m.springStrength,.3,5);
   if(Number.isFinite(m.chestSpringStrength))chestSpringStrength=clamp(m.chestSpringStrength,.3,20);
   springControl?.setStrength(springStrength,chestSpringStrength);
   smoothing=clamp(m.smoothing??.65,0,.95);mouthOpenStrength=clamp(m.mouthOpenStrength??1,.5,3);mouthSensitivity=clamp(m.mouthSensitivity??1.8,.5,3);break;
  case'privacy':privacy=!!m.value;break;
  case'output':output=!!m.value;restartRenderLoop();break;
 }
 }catch(err){post('error',{text:err.message});}
});
window.addEventListener('error',e=>{privacy=true;post('error',{text:e.message});});
window.addEventListener('unhandledrejection',e=>{privacy=true;post('error',{text:String(e.reason)});});
makeDemo();scheduleLoop();post('ready');
listCameras().catch(()=>{});
navigator.mediaDevices?.addEventListener('devicechange',()=>listCameras().catch(()=>{}));
