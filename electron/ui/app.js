const $=id=>document.getElementById(id),host=window.yuiDesktop;
const keys=['smoothing','sensitivity','bodyStrength','forwardLeanStrength','backwardLeanStrength','mouthOpenStrength','mouthSensitivity','springStrength'];
let active=false,timer,statusTimer,statusRevision=0,syphonActive=false,maximized=false,nativeLabels=[],browserLabels=false;
const cameraPicker=new CameraPicker();let cameraMessage={items:[],labelsAvailable:false};
function updateCameras(){
 const result=cameraPicker.update(cameraMessage,nativeLabels,$('cameras').value);
 $('cameras').replaceChildren(...result.options.map(item=>{const option=new Option(item.label+(item.disabled?'（未検出）':''),item.deviceId);option.disabled=item.disabled;return option;}));
 $('cameras').value=result.selected;
}
window.yuiHost.addEventListener('message',event=>$('preview').contentWindow.postMessage({yuiCommand:event.data},location.origin));
window.addEventListener('message',event=>{if(event.source!==$('preview').contentWindow||event.origin!==location.origin)return;if(event.data?.yuiRenderer)window.yuiHost.postMessage(event.data.yuiRenderer);if(event.data?.yuiAvatarFrame instanceof ArrayBuffer&&event.data.yuiAvatarFrame.byteLength===1280*720*4)host.sendAvatarFrame(event.data.yuiAvatarFrame).catch(showError).finally(()=>$('preview').contentWindow.postMessage({yuiCommand:{type:'frameAck'}},location.origin));});
function setStatus(text,temporary=false){clearTimeout(statusTimer);const revision=++statusRevision;$('status').textContent=text;if(temporary)statusTimer=setTimeout(()=>{if(statusRevision===revision)$('status').textContent=active?'トラッキング中':'VRMを表示中';},3000);}
function showError(error){setStatus(error.message||String(error));}
function send(type,rest={}){host.command({type,...rest});}
function values(){return Object.fromEntries(keys.map(key=>[key,Number($(key).value)]));}
function labels(){for(const key of keys)$(key+'-value').textContent=key==='smoothing'?Math.round(Number($(key).value)*100)+'%':Number($(key).value).toFixed(1)+'倍';}
function apply(){labels();send('settings',values());clearTimeout(timer);timer=setTimeout(()=>host.saveSettings(values()).catch(showError),200);}
for(const key of keys)$(key).addEventListener('input',apply);
for(const tab of ['avatar','motion'])$(tab+'-tab').onclick=()=>{for(const name of ['avatar','motion']){$(name+'-tab').setAttribute('aria-selected',name===tab);$(name+'-settings').hidden=name!==tab;}};
function maximize(value){maximized=value;$('main').classList.toggle('maximized',value);$('maximize').textContent=value?'元に戻す':'最大化';}
$('maximize').onclick=()=>maximize(!maximized);document.addEventListener('keydown',event=>{if(event.key==='Escape')maximize(false);});
const held=new Set();let shortcut=null;
document.addEventListener('keydown',event=>{held.add(event.code);if(!event.repeat&&held.size===1&&['ControlRight','ShiftRight'].includes(event.code))shortcut=event.code;else if(event.code!==shortcut)shortcut=null;});
document.addEventListener('keyup',event=>{if(shortcut===event.code&&held.size===1)send('calibrate');held.delete(event.code);shortcut=null;});window.addEventListener('blur',()=>{held.clear();shortcut=null;});
$('open').onclick=()=>host.openModel().catch(showError);
for(const button of document.querySelectorAll('[data-sample]'))button.onclick=()=>host.selectSample(button.dataset.sample).catch(showError);
for(const button of document.querySelectorAll('[data-background]'))button.onclick=()=>host.selectBackground(button.dataset.background).catch(showError);
$('background-image').onclick=()=>host.selectBackground('image').catch(showError);
$('calibrate').onclick=()=>send('calibrate');$('reset').onclick=()=>send('resetFraming');
$('privacy').onclick=()=>{const value=$('privacy').getAttribute('aria-pressed')!=='true';$('privacy').setAttribute('aria-pressed',value);send('privacy',{value});};
$('tracking').onclick=()=>{send(active?'stopTracking':'startTracking',{singleNativeCamera:$('cameras').value.startsWith('native:')&&nativeLabels.length===1,deviceId:$('cameras').value.startsWith('native:')?'':$('cameras').value,cameraLabel:$('cameras').value.startsWith('native:')?$('cameras').selectedOptions[0]?.textContent:undefined});$('tracking').disabled=true;};
$('refresh-cameras').onclick=async()=>{try{$('refresh-cameras').disabled=true;nativeLabels=await host.nativeCameras();send('refreshCameras');updateCameras();await updateCameraPermission();}catch(error){showError(error);}finally{$('refresh-cameras').disabled=false;}};
host.syphonAvailable().then(available=>{$('syphon').disabled=!available;if(!available)$('output-status').textContent='Syphon出力はMac版で利用できます。';});
$('syphon').onclick=async()=>{try{$('syphon').disabled=true;await host.setSyphon(!syphonActive);}catch(error){showError(error);}finally{$('syphon').disabled=false;}};
host.onEvent(message=>{
 if(message.type==='ready'){$('open').disabled=false;$('tracking').disabled=false;}
 if(message.type==='safety')$('privacy').setAttribute('aria-pressed',true);
 if(message.type==='syphon'){syphonActive=message.active;$('syphon').textContent=syphonActive?'Syphon出力を停止':'Syphon出力を開始';$('output-status').textContent=message.error||(syphonActive?'送信中：YuiTracking / 1280 × 720':'Syphon：停止中');}
 if(['status','error'].includes(message.type))setStatus(message.text,message.temporary===true);
 if(message.type==='error')$('tracking').disabled=false;
 if(message.type==='tracking'){active=message.active;$('tracking').textContent=active?'カメラを停止':'カメラを開始';$('tracking').disabled=false;updateCameraPermission().catch(()=>{});}
 if(message.type==='cameras'){browserLabels=browserLabels||message.labelsAvailable===true||message.selectionReady===true;cameraMessage=message;updateCameras();}
 if(message.type==='cameraInput')$('input').textContent=`カメラ入力：${message.width} × ${message.height} / ${Math.round(message.fps)}fps`;
 if(message.type==='avatar'){$('model').textContent=message.label;for(const button of document.querySelectorAll('[data-sample]'))button.setAttribute('aria-pressed',button.dataset.sample===message.sample);}
 if(message.type==='background'){for(const button of document.querySelectorAll('[data-background]'))button.setAttribute('aria-pressed',!message.image&&button.dataset.background===message.color);$('background-image').setAttribute('aria-pressed',message.image);}
 if(message.type==='togglePreviewMaximized')maximize(!maximized);if(message.type==='restorePreview')maximize(false);
});
host.getSettings().then(saved=>{for(const key of keys)if(Number.isFinite(saved[key]))$(key).value=saved[key];labels();}).catch(showError);
async function updateCameraPermission(){const info=await host.info();document.title='YuiTracking '+info.version;
 const names={granted:'許可済み','not-determined':'未確認（開始時に確認）',denied:'拒否されています。システム設定 → プライバシーとセキュリティ → カメラで許可し、アプリを再起動してください。',restricted:'macOS側で使用が制限されています。',unknown:'状態を確認できません。'};
 $('camera-permission').textContent=info.platform==='darwin'?'カメラ権限：'+(names[info.cameraPermission]||'不明'):'';
}
updateCameraPermission().catch(showError);
async function memory(){try{const result=await host.memory();$('memory').textContent='メモリ：'+Math.round(result.mb)+' MB';$('memory').title='YuiTrackingと描画・認識プロセスの使用量合計\n'+result.processes.map(item=>item.type+'：'+Math.round(item.mb)+' MB').join('\n');}catch{} }
memory();setInterval(memory,5000);

host.nativeCameras().then(items=>{nativeLabels=items;updateCameras();}).catch(()=>{});
