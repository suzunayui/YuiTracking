export function normalizedCameraLabel(label) {
 return label.trim().replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i,'').replace(/\s*\(built-in\)\s*$/i,'').toLowerCase();
}

export function resolveNamedCamera(devices,label) {
 const name=normalizedCameraLabel(label);
 const matches=devices.filter(d=>d.kind==='videoinput' && d.deviceId && normalizedCameraLabel(d.label)===name);
 if(matches.length===1)return matches[0].deviceId;
 if(matches.length>1)throw new Error('同名のカメラが複数あります。更新された一覧からカメラを選び直してください。');
 throw new Error('選択したカメラが見つかりません。接続を確認し、一覧から選び直してください。');
}

// Native Windows IDs and browser device IDs are different namespaces.
// Acquire browser labels only after the user explicitly starts the camera.
export async function browserCameraId(mediaDevices,deviceId,label,onDiscovered) {
 if(deviceId || !label)return deviceId;
 let devices=await mediaDevices.enumerateDevices();
 if(!devices.some(d=>d.kind==='videoinput' && d.label)) {
  const probe=await mediaDevices.getUserMedia({video:true,audio:false});
  try { devices=await mediaDevices.enumerateDevices(); }
  finally { probe.getTracks().forEach(t=>t.stop()); }
 }
 await onDiscovered(devices);
 return resolveNamedCamera(devices,label);
}
