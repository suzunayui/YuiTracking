import {FaceLandmarker,HandLandmarker,PoseLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
let face,hands,pose,lastPose=0;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   const files=await FilesetResolver.forVisionTasks('./wasm');
   face=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true});
   hands=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minTrackingConfidence:.6});
   pose=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./pose_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6,outputSegmentationMasks:false});
   self.postMessage({type:'ready'});
  }else if(data.type==='frame'){
   const started=performance.now();
   const result={type:'result',time:data.time,generation:data.generation,face:face.detectForVideo(data.bitmap,data.time),hands:hands.detectForVideo(data.bitmap,data.time)};
   if(data.time-lastPose>=95){lastPose=data.time;result.pose=pose.detectForVideo(data.bitmap,data.time);}
   result.duration=performance.now()-started;self.postMessage(result);
  }
 }catch(error){face?.close();hands?.close();pose?.close();self.postMessage({type:'error',message:error.message});}
 finally{data.bitmap?.close();}
};
