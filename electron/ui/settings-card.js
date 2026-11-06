'use strict';
(()=>{
 const row=key=>{
  const [label,value='']=$(key).closest('.slider-control').querySelector('.slider-label').textContent.split('：');
  return {label,value,off:disabledSliders.includes(key)};
 };
 function card(){
  const preset=document.querySelector('.preset-button[aria-pressed="true"]')?.dataset.name;
  const gaze=$('gazeMode');
  return {title:'YuiTracking の設定',preset:preset?`プリセット：${preset}`:null,sections:[
   {title:'目線',rows:[{label:'目線モード',value:gaze.options[gaze.selectedIndex]?.textContent??'',off:false},row('gazeStrength'),row('gazeRange')]},
   {title:'顔・口',rows:[row('smoothing'),row('sensitivity'),row('mouthOpenStrength'),row('mouthSensitivity')]},
   {title:'揺れ',rows:[row('springStrength'),row('chestSpringStrength')]},
   {title:'体',rows:[row('bodyStrength'),row('forwardLeanStrength'),row('backwardLeanStrength'),row('sideTiltStrength')]},
   {title:'手',rows:[{label:'手のトラッキング',value:$('handTracking').checked?'オン':'オフ',off:false}]},
   {title:'ズーム',rows:[row('nearZoomStrength'),row('farZoomStrength'),row('zoomCenterX'),row('zoomCenterY')]}
  ]};
 }
 $('settings-card').onclick=async()=>{
  try{
   const result=await host.settingsCard(card());
   setStatus(result.saved?'設定の画像を保存して、コピーしました。':'設定の画像をコピーしました。',true);
  }catch(error){showError(error);}
 };
})();
