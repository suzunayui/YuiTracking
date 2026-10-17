export function normalizedCameraLabel(label) {
 return label.trim().replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i,'').replace(/\s*\(built-in\)\s*$/i,'').toLowerCase();
}

export function selectableCameras(devices){
 return devices.filter(d=>d.kind==='videoinput'&&d.deviceId&&!/YuiTracking Camera|HoloTrack Avatar Camera|Unity Video Capture|OBS Virtual Camera|WarudoCam/i.test(d.label));
}

export function resolveNamedCamera(devices,label,{singleNativeCamera=false}={}) {
 const name=normalizedCameraLabel(label);
 const cameras=selectableCameras(devices);
 const matches=cameras.filter(d=>normalizedCameraLabel(d.label)===name);
 if(matches.length===1)return matches[0].deviceId;
 if(matches.length>1)throw new Error('同名のカメラが複数あります。更新された一覧からカメラを選び直してください。');
 if(singleNativeCamera&&cameras.length===1)return cameras[0].deviceId;
 throw new Error('カメラ一覧を更新しました。表示名が異なるか、接続が変わった可能性があります。一覧から使用するカメラを選び直してください。');
}

// A probe is opened only after an explicit Start. Reuse its stream when it is
// already the selected camera, avoiding a stop/reopen cycle on macOS.
export async function openCameraStream(mediaDevices,deviceId,label,onDiscovered,selection={}){
 const preferred={width:{ideal:1280},height:{ideal:720},aspectRatio:{ideal:16/9},frameRate:{ideal:30,max:30}};
 const open=id=>mediaDevices.getUserMedia({video:{...(id?{deviceId:{exact:id}}:{}),...preferred},audio:false});
 if(deviceId||!label)return open(deviceId);
 let probe=null;
 try{
  let devices=await mediaDevices.enumerateDevices();
  if(!devices.some(d=>d.kind==='videoinput'&&d.label)){
   probe=await open();devices=await mediaDevices.enumerateDevices();
  }
  await onDiscovered(devices);
  const selected=resolveNamedCamera(devices,label,selection);
  if(probe&&probe.getVideoTracks()[0]?.getSettings().deviceId===selected){
   const stream=probe;probe=null;return stream;
  }
  if(probe){probe.getTracks().forEach(t=>t.stop());probe=null;}
  return await open(selected);
 }finally{probe?.getTracks().forEach(t=>t.stop());}
}
