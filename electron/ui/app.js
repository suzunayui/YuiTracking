const $=id=>document.getElementById(id),host=window.yuiDesktop;
const keys=['smoothing','sensitivity','mouthOpenStrength','mouthSensitivity','springStrength'];
let active=false,timer;
let syphonActive=false;
window.yuiHost.addEventListener('message',event=>$('preview').contentWindow.postMessage({yuiCommand:event.data},location.origin));
window.addEventListener('message',event=>{
 if(event.source!==$('preview').contentWindow||event.origin!==location.origin)return;
 if(event.data?.yuiRenderer)window.yuiHost.postMessage(event.data.yuiRenderer);
 if(event.data?.yuiAvatarFrame instanceof ArrayBuffer&&event.data.yuiAvatarFrame.byteLength===1280*720*4){
  host.sendAvatarFrame(event.data.yuiAvatarFrame).catch(showError).finally(()=>$('preview').contentWindow.postMessage({yuiCommand:{type:'frameAck'}},location.origin));
 }
});
host.syphonAvailable().then(available=>{ $('syphon').disabled=!available;if(!available)$('output-status').textContent='Syphon出力はMac版で利用できます。';});
$('syphon').onclick=async()=>{try{$('syphon').disabled=true;await host.setSyphon(!syphonActive);}catch(error){showError(error);}finally{$('syphon').disabled=false;}};
function send(type,rest={}){host.command({type,...rest});}
function settings(){return {...Object.fromEntries(keys.map(key=>[key,Number($(key).value)])),background:$('background').value};}
function apply(){for(const key of keys)$(key+'-value').textContent=Number($(key).value).toFixed(2);send('settings',settings());clearTimeout(timer);timer=setTimeout(()=>host.saveSettings(settings()).catch(showError),200);}
function showError(error){$('status').textContent=error.message||String(error);}
for(const key of [...keys,'background'])$(key).addEventListener('input',apply);
$('open').onclick=async()=>{try{const name=await host.openModel();if(name)$('model').textContent=name;}catch(error){showError(error);}};
$('demo').onclick=()=>send('demo');
$('calibrate').onclick=()=>send('calibrate');
$('privacy').onchange=()=>send('privacy',{value:$('privacy').checked});
$('tracking').onclick=()=>{send(active?'stopTracking':'startTracking',{deviceId:$('cameras').value});$('tracking').disabled=true;};
host.onEvent(message=>{
 if(message.type==='safety')$('privacy').checked=true;
 if(message.type==='syphon'){syphonActive=message.active;$('syphon').textContent=syphonActive?'Syphon出力を停止':'Syphon出力を開始';$('output-status').textContent=message.error|| (syphonActive?'送信中：YuiTracking / 1280 × 720':'Syphon：停止中');}
 if(['status','error'].includes(message.type))$('status').textContent=message.text;
 if(message.type==='error')$('tracking').disabled=false;
 if(message.type==='tracking'){active=message.active;$('tracking').textContent=active?'カメラを停止':'カメラを開始';$('tracking').disabled=false;}
 if(message.type==='cameras'){const previous=$('cameras').value;$('cameras').replaceChildren(...message.items.map(item=>new Option(item.label,item.deviceId)));if(message.items.some(item=>item.deviceId===previous))$('cameras').value=previous;}
 if(message.type==='cameraInput')$('input').textContent=`カメラ入力：${message.width} × ${message.height} / ${Math.round(message.fps)}fps`;
});
host.getSettings().then(saved=>{for(const key of keys)if(Number.isFinite(saved[key]))$(key).value=saved[key];if(saved.background)$('background').value=saved.background;if(saved.defaultVrmPath)$('model').textContent=saved.defaultVrmPath.split(/[\\/]/).pop();for(const key of keys)$(key+'-value').textContent=Number($(key).value).toFixed(2);}).catch(showError);
