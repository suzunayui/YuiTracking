import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { bend, clamp, smoothingAlpha, safeTracking, calibratedBlink } from './rig-math.js';
import { placeAvatar } from './avatar-placement.js';
import { avatarHeadRotation } from './head-rotation.js';
import {bodyPose,relativeBodyPose} from './body-pose.js';
import {fingerBones,palmBasis,fingerSegments,captureHandRest,shoulderWristTarget} from './hand-rig.js';
import {HandTransition} from './hand-transition.js';
import {LandmarkFilter} from './landmark-filter.js';
import {BodyStabilizer} from './body-stabilizer.js';
import {mouthShapes} from './mouth-shapes.js';
import {AutoCalibration} from './auto-calibration.js';
import {SpringStrength} from './spring-strength.js';

const W=1280,H=720;
const host=window.yuiHost ?? window.chrome?.webview ?? (window.parent!==window ? {
 postMessage:message=>window.parent.postMessage({yuiRenderer:message},location.origin),
 addEventListener:(type,callback)=>{if(type==='message')window.addEventListener('message',event=>{if(event.source===window.parent&&event.origin===location.origin&&event.data?.yuiCommand)callback({data:event.data.yuiCommand});});}
}:null);
const post=(type,rest={})=>host?.postMessage({type,...rest});
const status=text=>post('status',{text});
const scene=new THREE.Scene(); scene.background=new THREE.Color('#00ff00');
const camera=new THREE.PerspectiveCamera(32,W/H,0.01,100); camera.position.set(0,1.35,3.1); camera.lookAt(0,1.1,0);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(W,H,false); renderer.setPixelRatio(1); renderer.outputColorSpace=THREE.SRGBColorSpace;
// Keep the VRM's authored colors without filmic highlight compression.
renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;
document.body.appendChild(renderer.domElement);
renderer.domElement.title='Ctrl＋マウスホイール：拡大・縮小／ホイールドラッグ：上下左右に移動';
let panPointer=null,panX=0,panY=0;
const panDepth=Math.hypot(3.1,.25);
function saveFraming(){post('framingChanged',{zoom:camera.zoom,x:camera.position.x,y:camera.position.y,z:camera.position.z});}
function endPan(){
 const pointer=panPointer;panPointer=null;renderer.domElement.style.cursor='';
 if(pointer!==null&&renderer.domElement.hasPointerCapture(pointer))renderer.domElement.releasePointerCapture(pointer);
}
renderer.domElement.addEventListener('pointerdown',event=>{
 if(event.button!==1||panPointer!==null)return;
 event.preventDefault();
 panPointer=event.pointerId;panX=event.clientX;panY=event.clientY;
 renderer.domElement.setPointerCapture(event.pointerId);renderer.domElement.style.cursor='grabbing';
});
renderer.domElement.addEventListener('pointermove',event=>{
 if(event.pointerId!==panPointer)return;
 if(!(event.buttons&4)){endPan();return;}
 event.preventDefault();
 const rect=renderer.domElement.getBoundingClientRect();
 const height=Math.min(rect.height,rect.width/(W/H));
 if(height>0){
  const units=2*panDepth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(camera.zoom*height);
  // Move perpendicular to the view so the avatar follows the pointer at any zoom.
  camera.position.add(new THREE.Vector3(-(event.clientX-panX)*units,(event.clientY-panY)*units,0).applyQuaternion(camera.quaternion));
  saveFraming();
 }
 panX=event.clientX;panY=event.clientY;
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(type,event=>{
 if(event.pointerId===panPointer)endPan();
});
window.addEventListener('blur',endPan);
renderer.domElement.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
renderer.domElement.addEventListener('wheel',event=>{
 if(!event.ctrlKey)return;
 event.preventDefault();
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?H:1);
 camera.zoom=clamp(camera.zoom*Math.exp(-clamp(delta,-720,720)*.0015),.5,4);
 camera.updateProjectionMatrix();
 saveFraming();
},{passive:false});
scene.add(new THREE.HemisphereLight(0xffffff,0xffffff,.35));
const key=new THREE.DirectionalLight(0xffffff,Math.PI*.85); key.position.set(1,3,3); scene.add(key);
let vrm=null,demo=null,head=null,eyes=[],arms={},loading=false,privacy=false,output=false;
let smoothing=.65,sensitivity=1,mouthOpenStrength=1,mouthSensitivity=1.8,tracking=false,video,stream,initializing=false;
let latestFace=null,latestHands=null,frameNumber=0,lastVideoTime=-1,lastDetect=0,lastRender=0;
let calibration=new THREE.Quaternion(),rawHead=new THREE.Quaternion(),haveFace=false;
let blinkBaseline={left:0,right:0};
const autoCalibration=new AutoCalibration();
let latestPose=null,lastPoseDetect=0,bodyNeutral=null;
const bodyStabilizer=new BodyStabilizer();
let handRest={};
let mouthMorphBinds=[];
let springStrength=1,springPhysics=null;
const handTransitions={left:new HandTransition(250),right:new HandTransition(250)};
const handFilters=Object.fromEntries(['Left','Right'].map(side=>[side,{screen:new LandmarkFilter(.004),world:new LandmarkFilter(.0015)}]));
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
const captureCanvas=document.createElement('canvas'); captureCanvas.width=W;captureCanvas.height=H;
const capture=captureCanvas.getContext('2d',{willReadFrequently:true});
// Only this WebGL canvas is ever copied to the outbound frame buffer. The input
// video is kept detached and is passed exclusively to the landmark detectors.
const standby=new THREE.Scene(); standby.background=new THREE.Color('#171b2e');
const standbyCam=new THREE.OrthographicCamera(-W/2,W/2,H/2,-H/2,.1,10);standbyCam.position.z=1;
for (const x of [-20,20]) {const b=new THREE.Mesh(new THREE.PlaneGeometry(20,96),new THREE.MeshBasicMaterial({color:'#82e2c0'}));b.position.x=x;standby.add(b);}
function mesh(geometry,color,parent,x=0,y=0,z=0) {
 const o=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.55})); o.position.set(x,y,z);parent.add(o);return o;
}
function removeAvatar() {
 springPhysics=null;
 mouthMorphBinds=[];
 if(vrm){scene.remove(vrm.scene);VRMUtils.deepDispose(vrm.scene);vrm=null;}
 if(demo){scene.remove(demo);demo.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});demo=null;}
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
 loading=false;status('内蔵サンプルを表示中。カメラ開始で顔・手を動かせます。');
}
async function loadModel(requestId){
 const version=++loadVersion;loading=true;status('VRMを読み込み中…');
 try{
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
   if(url.startsWith('blob:')||url.startsWith('data:')||url.startsWith('https://holotrack.local/avatar.vrm'))return url;
   throw new Error('外部ファイル参照のあるモデルには対応していません。');
  });
  const loader=new GLTFLoader(manager);loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.loadAsync(`https://holotrack.local/avatar.vrm?v=${version}`);
  const next=gltf.userData.vrm;if(!next)throw new Error('VRM 0.x / 1.0のモデルを選択してください。');
  if(version!==loadVersion){VRMUtils.deepDispose(next.scene);return;}
  removeAvatar();vrm=next;VRMUtils.rotateVRM0(vrm);scene.add(vrm.scene);
  mouthMorphBinds=['aa','ih','ou','ee','oh'].flatMap(name=>(vrm.expressionManager?.getExpression(name)?.binds??[]).filter(bind=>bind.primitives&&Number.isInteger(bind.index)).map(bind=>({bind,baseWeight:bind.weight})));
  placeAvatar(vrm);
  springPhysics=new SpringStrength(vrm.springBoneManager);springPhysics.setStrength(springStrength);
  handRest={};
  for(const side of ['left','right']){
   const hand=bone(side+'Hand');if(!hand)continue;
   const nodes=Object.fromEntries(fingerBones.flat().map(name=>[name,bone(side+name)]));
   handRest[side]=captureHandRest(hand,nodes,side==='left'?1:-1);
  }
  status('VRMを読み込みました。正面を向いてキャリブレーションしてください。');
  post('modelLoaded',{requestId});
 }catch(e){if(version===loadVersion){post('modelFailed',{requestId});post('error',{text:'VRM読み込み失敗：'+e.message});}}
 finally{if(version===loadVersion)loading=false;}
}
let trackingWorker,workerReady,workerBusy=false,trackingGeneration=0;
async function ensureTasks(){
 if(workerReady)return workerReady;
 status('顔・手・上半身の認識エンジンを準備中…');
 workerReady=new Promise((resolve,reject)=>{
  trackingWorker=new Worker('./tracking-worker.js');
  const fail=error=>{trackingWorker?.terminate();trackingWorker=null;workerReady=null;workerBusy=false;reject(error);if(tracking){stopTracking();post('error',{text:'認識を停止しました：'+error.message});}};
  trackingWorker.onerror=e=>fail(new Error(e.message));
  trackingWorker.onmessage=({data})=>{
   if(data.type==='ready'){resolve();return;}
   if(data.type==='error'){fail(new Error(data.message));return;}
   workerBusy=false;perfDetect=Math.max(perfDetect,data.duration);
   if(!tracking||data.generation!==trackingGeneration)return;
   latestFace={result:data.face,time:data.time};latestHands={result:stabilizeHands(data.hands,data.time),time:data.time,receivedAt:performance.now()};
   if(data.pose)latestPose={result:data.pose,time:data.time};
   const matrix=data.face.facialTransformationMatrixes?.[0]?.data;
   const weights=Object.fromEntries((data.face.faceBlendshapes?.[0]?.categories??[]).map(c=>[c.categoryName,c.score]));
   const sample=matrix?{time:data.time,rotation:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(matrix)).toArray(),eyesOpen:Math.max(weights.eyeBlinkLeft??0,weights.eyeBlinkRight??0)<.7}:null;
   if(autoCalibration.observe(sample,performance.now()))calibrateFace(true);
  };
  trackingWorker.postMessage({type:'init'});
 });
 return workerReady;
}
async function listCameras(){
 const devices=await navigator.mediaDevices.enumerateDevices();
 post('cameras',{items:devices.filter(d=>d.kind==='videoinput'&&!/YuiTracking Camera|HoloTrack Avatar Camera|Unity Video Capture|OBS Virtual Camera|WarudoCam/i.test(d.label)).map((d,i)=>({deviceId:d.deviceId,label:d.label||`カメラ ${i+1}`}))});
}
async function startTracking(deviceId){
 if(initializing||tracking)return;initializing=true;
 try{
  await ensureTasks();
  // No audio capture, no display capture, and no automatic start on launch.
  stream=await navigator.mediaDevices.getUserMedia({video:{...(deviceId?{deviceId:{exact:deviceId}}:{}),width:{ideal:1280},height:{ideal:720},aspectRatio:{ideal:16/9},frameRate:{ideal:30,max:30}},audio:false});
  const track=stream.getVideoTracks()[0];
  await listCameras();
  if(/YuiTracking Camera|HoloTrack Avatar Camera|Unity Video Capture|OBS Virtual Camera|WarudoCam/i.test(track.label))throw new Error('入力に実際のWebカメラを選択してください。');
  video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
  await video.play(); await listCameras();
  const input=track.getSettings();post('cameraInput',{width:input.width??video.videoWidth,height:input.height??video.videoHeight,fps:input.frameRate??0});
  track.onended=()=>{stopTracking();status('カメラが切断されました。待機ポーズに戻ります。');};
  tracking=true;lastVideoTime=-1;lastPoseDetect=0;bodyNeutral=null;calibration.identity();blinkBaseline={left:0,right:0};autoCalibration.start(performance.now());post('tracking',{active:true});status('正面を向いて目を開けてください。顔の検出が安定すると一度だけ自動でキャリブレーションします。');
 }catch(e){stopTracking();post('error',{text:'カメラを開始できません：'+e.message});}
 finally{initializing=false;}
}
function stopTracking(){
 autoCalibration.stop();
 bodyStabilizer.reset();
 for(const filter of Object.values(handFilters)){filter.screen.reset();filter.world.reset();}
 trackingGeneration++;tracking=false;stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;
 if(video){video.pause();video.srcObject=null;video=null;}
 latestFace=latestHands=latestPose=null;bodyNeutral=null;haveFace=false;post('tracking',{active:false});status('カメラ停止中。待機ポーズを表示しています。');
}
function detect(now){
 if(workerBusy||!tracking||!video||video.readyState<2||video.currentTime===lastVideoTime||now-lastDetect<48)return;
 lastVideoTime=video.currentTime;lastDetect=now;workerBusy=true;
 const generation=trackingGeneration;
 createImageBitmap(video).then(bitmap=>{
  if(!tracking||generation!==trackingGeneration||!trackingWorker){bitmap.close();workerBusy=false;return;}
  trackingWorker.postMessage({type:'frame',bitmap,time:now,generation},[bitmap]);
 }).catch(e=>{workerBusy=false;stopTracking();post('error',{text:'認識を停止しました：'+e.message});});
}
function calibrateFace(automatic=false){
 const matrix=latestFace?.result.facialTransformationMatrixes?.[0]?.data;
 if(matrix&&safeTracking(latestFace,performance.now())){
    calibration.setFromRotationMatrix(new THREE.Matrix4().fromArray(matrix));
    autoCalibration.stop();
    const pose=safeTracking(latestPose,performance.now())?bodyPose(latestPose.result.worldLandmarks?.[0]):null;
    bodyNeutral=pose?{...pose}:null;
    bodyStabilizer.reset();
    const weights=Object.fromEntries((latestFace.result.faceBlendshapes?.[0]?.categories??[]).map(c=>[c.categoryName,c.score]));
    blinkBaseline={left:clamp(weights.eyeBlinkLeft??0,0,.95),right:clamp(weights.eyeBlinkRight??0,0,.95)};
    if(vrm){vrm.expressionManager?.setValue('blinkLeft',0);vrm.expressionManager?.setValue('blinkRight',0);}
    else eyes.forEach(eye=>eye.scale.y=1);
    status((automatic?'自動キャリブレーション完了。':'')+'正面位置・目の開き具合・上半身の基準を調整しました。');
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
function rigHand(side,landmarks,alpha,worldLandmarks=null,poseLandmarks=null){
 const sign=side==='left'?1:-1;
 const upper=vrm?bone(side+'UpperArm'):arms[side].upper;
 const lower=vrm?bone(side+'LowerArm'):arms[side].lower;
 const hand=vrm?bone(side+'Hand'):arms[side].hand;
 if(!upper||!lower||!hand)return;
 if(!landmarks){
  // VRM normalized arms start in T pose; lower them to an idle pose.
  if(vrm){
   upper.updateWorldMatrix(true,false);
   aim(upper,lower,upper.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(sign*.18,-1,0)),alpha);
  }else upper.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,sign*.10)),alpha);
  lower.quaternion.slerp(restQ,alpha);hand.quaternion.slerp(restQ,alpha);
 }else{
  const wrist=landmarks[0];
  let target=null;
  if(vrm){
   const a=bone('leftUpperArm'),b=bone('rightUpperArm');
   if(a&&b){
    vrm.scene.updateWorldMatrix(true,true);
    const left=a.getWorldPosition(new THREE.Vector3()),right=b.getWorldPosition(new THREE.Vector3());
    target=shoulderWristTarget(wrist,poseLandmarks,left.clone().add(right).multiplyScalar(.5),left.distanceTo(right),video?video.videoWidth/video.videoHeight:4/3);
   }
  }
  target??=new THREE.Vector3((.5-wrist.x)*1.7,1.85-wrist.y*1.5,.20);
  upper.updateWorldMatrix(true,true);
  const shoulder=upper.getWorldPosition(new THREE.Vector3());
  const l1=shoulder.distanceTo(lower.getWorldPosition(new THREE.Vector3()));
  const l2=lower.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  const dir=target.clone().sub(shoulder);const d=clamp(dir.length(),Math.abs(l1-l2)+.01,l1+l2-.01);dir.normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d);
  const pole=new THREE.Vector3(sign*.4,-1,-.2);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
  const elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
  aim(upper,lower,elbow,alpha);upper.updateWorldMatrix(true,true);aim(lower,hand,shoulder.clone().addScaledVector(dir,d),alpha);
  if(vrm&&worldLandmarks&&handRest[side]){
   const palm=palmBasis(worldLandmarks),rest=handRest[side];
   if(palm&&rest.palm){
    hand.parent.updateWorldMatrix(true,false);
    const worldTarget=palm.multiply(rest.palm.clone().invert());
    const parentRotation=hand.parent.getWorldQuaternion(new THREE.Quaternion());
    hand.quaternion.slerp(parentRotation.invert().multiply(worldTarget),alpha);
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
     const localDirection=direction.clone().applyQuaternion(node.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
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
 const alpha=smoothingAlpha(smoothing,dt);
 const pose=safeTracking(latestPose,now)?bodyPose(latestPose.result.worldLandmarks?.[0]):null;
 if(pose&&!bodyNeutral)bodyNeutral={...pose};
 const body=bodyStabilizer.update(pose?relativeBodyPose(pose,bodyNeutral):null,latestPose?.time,now);
 const bodyTarget=new THREE.Quaternion().setFromEuler(new THREE.Euler(body.pitch,body.yaw,body.roll,'YXZ'));
 const bodyActual=new THREE.Quaternion();
 if(vrm){
  const torso=['spine','chest','upperChest'].map(bone).filter(Boolean);
  for(const node of torso){
   node.quaternion.slerp(new THREE.Quaternion().slerp(bodyTarget,1/torso.length),alpha);
   bodyActual.multiply(node.quaternion);
  }
 }else if(demo){demo.quaternion.slerp(bodyTarget,alpha);bodyActual.copy(demo.quaternion);}
 const face=safeTracking(latestFace,now)?latestFace.result:null;
 const categories=face?.faceBlendshapes?.[0]?.categories??[];
 const weights=Object.fromEntries(categories.map(c=>[c.categoryName,c.score]));
 const blinkLeft=calibratedBlink(weights.eyeBlinkRight??0,blinkBaseline.right);
 const blinkRight=calibratedBlink(weights.eyeBlinkLeft??0,blinkBaseline.left);
 const mat=face?.facialTransformationMatrixes?.[0]?.data;
 const target=new THREE.Quaternion();haveFace=!!mat;
 if(mat){
  rawHead.setFromRotationMatrix(new THREE.Matrix4().fromArray(mat));
  const relative=calibration.clone().invert().multiply(rawHead);
  target.copy(avatarHeadRotation(relative,sensitivity));
 }
 if(vrm){
  // Face tracking is absolute: remove torso rotation to avoid turning twice.
  rotateBone('head',bodyActual.clone().invert().multiply(target),alpha);
  const expr=vrm.expressionManager;
  const vowels=mouthShapes(weights,mouthSensitivity,face?.faceLandmarks?.[0],video?.videoWidth&&video?.videoHeight?video.videoWidth/video.videoHeight:16/9);
  for(const [name,value]of Object.entries({blinkLeft,blinkRight,...vowels,happy:((weights.mouthSmileLeft??0)+(weights.mouthSmileRight??0))*.5})){
   if(expr){
    const expressionAlpha=name.startsWith('blink')?1-Math.exp(-45*dt):name in vowels?Math.max(alpha,1-Math.exp(-35*dt)):alpha;
    expr.setValue(name,THREE.MathUtils.lerp(expr.getValue(name)??0,value,expressionAlpha));
   }
  }
 }else if(head){
  head.quaternion.slerp(bodyActual.clone().invert().multiply(target),alpha);eyes.forEach((eye,i)=>eye.scale.y=1-clamp(i?blinkRight:blinkLeft,0,.93));
  const amount=Object.values(mouthShapes(weights,mouthSensitivity)).reduce((sum,value)=>sum+value,0);
  head.getObjectByName('mouth').scale.y=1+(8/1.4)*mouthOpenStrength*amount;
 }
 const hands=safeTracking(latestHands,now)?latestHands.result:null;
 const poseLandmarks=safeTracking(latestPose,now)?latestPose.result.landmarks?.[0]:null;
 for(const side of ['left','right']){
  // MediaPipe handedness assumes a mirrored/selfie image. Input is unmirrored.
  const label=side==='left'?'Right':'Left';
  const index=hands?.handedness?.findIndex(h=>h[0]?.categoryName===label)??-1;
  const sample=index>=0?{landmarks:hands.landmarks[index],worldLandmarks:hands.worldLandmarks?.[index],time:latestHands.time,receivedAt:latestHands.receivedAt}:null;
  const transition=handTransitions[side].update(sample,now,dt,alpha);
  rigHand(side,transition.sample?.landmarks??null,transition.alpha,transition.sample?.worldLandmarks??null,poseLandmarks);
 }
 // Strength also enlarges the model's morphs; detector weights alone cap at 1.
 const morphScale=mouthOpenStrength;
 for(const {bind,baseWeight}of mouthMorphBinds)bind.weight=baseWeight*morphScale;
 vrm?.update(dt);
}
async function sendFrame(){
 if(framePending||!output)return;framePending=true;
 let sharedPosted=false;
 try{
  const started=performance.now();
  capture.drawImage(renderer.domElement,0,0,W,H);
  const pixels=capture.getImageData(0,0,W,H).data;
  perfCapture=Math.max(perfCapture,performance.now()-started);perfPendingAt=performance.now();
  if(sharedFramePixels){sharedFramePixels.set(pixels);post('frameReady');sharedPosted=true;return;}
  const response=await fetch('/frame',{method:'POST',body:pixels,signal:AbortSignal.timeout(1500)});
  if(!response.ok)throw new Error('Frame receiver rejected frame.');
  perfSent++;perfAck=Math.max(perfAck,performance.now()-perfPendingAt);
 }catch(e){post('error',{text:'仮想カメラ送信エラー：'+e.message});}
 finally{if(!sharedPosted)framePending=false;}
}
let loopHandle,loopTimer=false;
function scheduleLoop(){
 loopTimer=output;
 loopHandle=output?setTimeout(()=>loop(performance.now()),Math.max(1,16.667-(performance.now()-lastRender))):requestAnimationFrame(loop);
}
function restartRenderLoop(){if(loopTimer)clearTimeout(loopHandle);else cancelAnimationFrame(loopHandle);scheduleLoop();}
function loop(now){
 if(now-lastRender<15){scheduleLoop();return;}
 const dt=Math.min((now-lastRender)/1000,.1);lastRender=now;scheduleLoop();
 detect(now);animate(now,dt);
 if(privacy||loading)renderer.render(standby,standbyCam);else renderer.render(scene,camera);
 sendFrame();frameNumber++;
 perfFrames++;
 if(now-perfLast>=3000){
  const seconds=(now-perfLast)/1000;
  Object.assign(perfStats,{renderFps:perfFrames/seconds,frameFps:perfSent/seconds,detectMs:perfDetect,captureMs:perfCapture,ackMs:perfAck});
  if(output)post('performance',perfStats);
  perfLast=now;perfFrames=perfSent=perfDetect=perfCapture=perfAck=0;
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
    camera.zoom=clamp(m.zoom,.5,4);camera.position.set(m.x,m.y,m.z);camera.updateProjectionMatrix();
   }
   break;
  case'loadModel':await loadModel(m.requestId);break;
  case'demo':loadVersion++;makeDemo();break;
  case'startTracking':await startTracking(m.deviceId);break;
  case'stopTracking':stopTracking();break;
  case'calibrate':calibrateFace();break;
  case'settings':smoothing=clamp(m.smoothing,0,.95);sensitivity=clamp(m.sensitivity,.3,2);mouthOpenStrength=clamp(m.mouthOpenStrength??1,.5,3);mouthSensitivity=clamp(m.mouthSensitivity??1.8,.5,3);springStrength=clamp(m.springStrength??1,.3,3);springPhysics?.setStrength(springStrength);scene.background.set(m.background);break;
  case'privacy':privacy=!!m.value;break;
  case'output':output=!!m.value;restartRenderLoop();break;
 }
 }catch(err){post('error',{text:err.message});}
});
window.addEventListener('error',e=>{privacy=true;post('error',{text:e.message});});
window.addEventListener('unhandledrejection',e=>{privacy=true;post('error',{text:String(e.reason)});});
makeDemo();scheduleLoop();post('ready');
listCameras().catch(()=>{});
