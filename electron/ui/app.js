const $=id=>document.getElementById(id),host=window.yuiDesktop;
const keys=['zoomCenterX','zoomCenterY','farZoomStrength','nearZoomStrength','gazeRange','gazeStrength','smoothing','sensitivity','bodyStrength','forwardLeanStrength','backwardLeanStrength','sideTiltStrength','mouthOpenStrength','mouthSensitivity','springStrength','chestSpringStrength'];
let active=false,timer,statusTimer,statusRevision=0,syphonActive=false,maximized=false,nativeLabels=[],browserLabels=false;
const cameraPicker=new CameraPicker();let cameraMessage={items:[],labelsAvailable:false};
function updateCameras(){
 const result=cameraPicker.update(cameraMessage,nativeLabels,$('cameras').value);
 $('cameras').replaceChildren(...result.options.map(item=>{const option=new Option(item.label+(item.disabled?'（未検出）':''),item.deviceId);option.disabled=item.disabled;return option;}));
 $('cameras').value=result.selected;
}
window.yuiHost.addEventListener('message',event=>$('preview').contentWindow.postMessage({yuiCommand:event.data},location.origin));
window.addEventListener('message',event=>{if(event.source!==$('preview').contentWindow||event.origin!==location.origin)return;if(event.data?.yuiRenderer)window.yuiHost.postMessage(event.data.yuiRenderer);if(event.data?.yuiAvatarFrame instanceof ArrayBuffer&&event.data.yuiAvatarFrame.byteLength===1280*720*4)host.sendAvatarFrame(event.data.yuiAvatarFrame).catch(showError).finally(()=>$('preview').contentWindow.postMessage({yuiCommand:{type:'frameAck'}},location.origin));});
new MutationObserver(()=>{$('status').hidden=['VRMを表示中','内蔵サンプルを表示中'].includes($('status').textContent);}).observe($('status'),{childList:true,characterData:true,subtree:true});
function setStatus(text,temporary=false){clearTimeout(statusTimer);const revision=++statusRevision;$('status').textContent=text;if(temporary)statusTimer=setTimeout(()=>{if(statusRevision===revision)$('status').textContent=active?'トラッキング中':'VRMを表示中';},3000);}
function showError(error){setStatus(error.message||String(error));}
function send(type,rest={}){host.command({type,...rest});}
function values(){return {...Object.fromEntries(keys.map(key=>[key,Number($(key).value)])),gazeMode:$('gazeMode').value};}
function labels(){
 if(typeof sliderSync!=='undefined')for(const sync of sliderSync)sync();
 window.refreshPresetSelection?.();
 $('gazeRange').disabled=$('gazeMode').value==='fixed';$('gazeStrength').disabled=$('gazeMode').value!=='tracking';
 for(const key of keys){
  const value=Number($(key).value);
  if(['zoomCenterX','zoomCenterY'].includes(key)){
   const direction=key==='zoomCenterX'?(value<0?'左':'右'):(value<0?'下':'上');
   $(key+'-value').textContent=value===0?'顔の位置':direction+Math.abs(value).toFixed(1)+'%';
  }else $(key+'-value').textContent=['nearZoomStrength','farZoomStrength','sideTiltStrength'].includes(key)&&value===0?'オフ':key==='smoothing'?Math.round(value*100)+'%':value.toFixed(1)+'倍';
 }
}
function apply(){labels();send('settings',values());clearTimeout(timer);timer=setTimeout(()=>host.saveSettings(values()).catch(showError),200);}
const sliderSync=keys.map(key=>addSliderControls($(key),key==='smoothing'?100:1,apply));
for(const key of keys)$(key).addEventListener('input',apply);
$('gazeMode').addEventListener('change',apply);
host.getRecognitionSettings().then(info=>{
 $('recognition-device').replaceChildren(...info.devices.map(device=>new Option(device.name,device.id)));
 $('recognition-device').value=info.devices.some(device=>device.id===info.saved)?info.saved:'CPU';
 $('recognition-status').textContent='現在の認識設定：'+info.currentName+(info.saved!==info.current?'（保存した設定と異なります）':'');
 $('recognition-summary').textContent='認識：'+info.currentName;
}).catch(showError);
$('save-recognition').onclick=async()=>{try{await host.saveRecognitionSettings($('recognition-device').value);$('recognition-status').textContent='保存しました。アプリを再起動すると反映します。';}catch(error){showError(error);}};
function maximize(value){maximized=value;$('main').classList.toggle('maximized',value);$('maximize').textContent=value?'元に戻す':'最大化';}
$('maximize').onclick=()=>maximize(!maximized);document.addEventListener('keydown',event=>{if(event.key==='Escape')maximize(false);});
const held=new Set();let shortcut=null;
document.addEventListener('keydown',event=>{held.add(event.code);if(!event.repeat&&held.size===1&&['ControlRight','ShiftRight'].includes(event.code))shortcut=event.code;else if(event.code!==shortcut)shortcut=null;});
document.addEventListener('keyup',event=>{if(shortcut===event.code&&held.size===1)send('calibrate');held.delete(event.code);shortcut=null;});window.addEventListener('blur',()=>{held.clear();shortcut=null;});
$('open').onclick=()=>window.openVrmDialog();
for(const button of document.querySelectorAll('[data-sample]'))button.onclick=()=>host.selectSample(button.dataset.sample).catch(showError);
$('calibrate').onclick=()=>send('calibrate');$('reset').onclick=()=>send('resetFraming');
function showPrivacy(value){$('privacy').setAttribute('aria-pressed',value);$('standby-notice').hidden=!value;}
$('privacy').onclick=()=>{const value=$('privacy').getAttribute('aria-pressed')!=='true';showPrivacy(value);send('privacy',{value});};
$('tracking').onclick=()=>{const choice=$('cameras').value;send(active?'stopTracking':'startTracking',{singleNativeCamera:choice.startsWith('native:')&&nativeLabels.length===1,deviceId:choice==='default:'||choice.startsWith('native:')?'':choice,cameraLabel:choice.startsWith('native:')?$('cameras').selectedOptions[0]?.textContent:undefined});$('tracking').disabled=true;};
$('pan-mode').onclick=()=>{const value=$('pan-mode').getAttribute('aria-pressed')!=='true';$('pan-mode').setAttribute('aria-pressed',value);send('navigationMode',{pan:value});};
$('refresh-cameras').onclick=async()=>{try{$('refresh-cameras').disabled=true;nativeLabels=await host.nativeCameras();send('refreshCameras');updateCameras();await updateCameraPermission();}catch(error){showError(error);}finally{$('refresh-cameras').disabled=false;}};
host.syphonAvailable().then(available=>{$('syphon').disabled=!available;if(!available)$('output-status').textContent='Syphon出力はMac版で利用できます。';});
$('syphon').onclick=async()=>{try{$('syphon').disabled=true;await host.setSyphon(!syphonActive);}catch(error){showError(error);}finally{$('syphon').disabled=false;}};
host.onEvent(message=>{
 if(message.type==='ready'){$('open').disabled=false;$('tracking').disabled=false;}
 if(message.type==='safety')showPrivacy(true);
 if(message.type==='syphon'){syphonActive=message.active;$('syphon').textContent=syphonActive?'Syphon出力を停止':'Syphon出力を開始';$('output-status').textContent=message.error||(syphonActive?'送信中：YuiTracking / 1280 × 720':'Syphon：停止中');}
 if(['status','error'].includes(message.type))setStatus(message.text,message.temporary===true);
 if(message.type==='error')$('tracking').disabled=false;
 if(message.type==='tracking'){active=message.active;$('tracking').textContent=active?'カメラを停止':'カメラを開始';$('tracking').classList.toggle('camera-active',active);$('tracking').disabled=false;updateCameraPermission().catch(()=>{});}
 if(message.type==='cameras'){browserLabels=browserLabels||message.labelsAvailable===true||message.selectionReady===true;cameraMessage=message;updateCameras();}
 if(message.type==='cameraListWarning')$('camera-note').textContent=message.text;
 if(message.type==='cameras')$('camera-note').textContent='';
 if(message.type==='cameraInput')$('input').textContent=`カメラ入力：${message.label||'名称不明'} / ${message.width} × ${message.height} / ${Math.round(message.fps)}fps`;
 if(message.type==='recognitionReady'){$('recognition-status').textContent='認識中：'+message.delegate+(message.renderer?' / '+message.renderer:'');$('recognition-summary').textContent='認識：'+(message.renderer||message.delegate);}
 if(message.type==='springCapabilities'){$('chestSpringStrength').disabled=!(message.chestJoints>0);const control=$('chest-spring-control');const status=message.chestJoints>0?'胸の揺れ設定を検出しました。':'このモデルには対応する胸の揺れ設定がありません。';control.title=status+'\n'+control.title.substring(control.title.indexOf('\n')+1);}
 if(message.type==='avatar'){$('model').textContent=message.label;for(const button of document.querySelectorAll('[data-sample]'))button.setAttribute('aria-pressed',button.dataset.sample===message.sample);}
 if(message.type==='togglePreviewMaximized')maximize(!maximized);if(message.type==='restorePreview')maximize(false);
});
host.getSettings().then(saved=>{if(['tracking','camera','fixed'].includes(saved.gazeMode))$('gazeMode').value=saved.gazeMode;for(const key of keys)if(Number.isFinite(saved[key]))$(key).value=saved[key];labels();}).catch(showError);
async function updateCameraPermission(){const info=await host.info();document.title='YuiTracking '+info.version;
 const names={granted:'許可済み','not-determined':'未確認（開始時に確認）',denied:'拒否されています。システム設定 → プライバシーとセキュリティ → カメラで許可し、アプリを再起動してください。',restricted:'macOS側で使用が制限されています。',unknown:'状態を確認できません。'};
 $('camera-permission').textContent=info.platform==='darwin'?'カメラ権限：'+(names[info.cameraPermission]||'不明'):'';
}
updateCameraPermission().catch(showError);
async function memory(){try{const result=await host.memory();$('memory').textContent='メモリ：'+Math.round(result.mb)+' MB';$('memory').title='YuiTrackingと描画・認識プロセスの使用量合計\n'+result.processes.map(item=>item.type+'：'+Math.round(item.mb)+' MB').join('\n');}catch{} }
memory();setInterval(memory,5000);

host.nativeCameras().then(items=>{nativeLabels=items;updateCameras();}).catch(()=>{});
