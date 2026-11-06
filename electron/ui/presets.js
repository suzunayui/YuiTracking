'use strict';
(()=>{
 let presets=[];
 const bar=$('preset-bar'),actions=$('preset-actions-dialog'),dialog=$('preset-name-dialog'),input=$('preset-name-input'),problem=$('preset-name-problem'),save=$('preset-name-save');
 const motionValues=()=>{const {gazeMode,handTracking,disabledSliders:off,...rest}=values();return rest;};
 function refresh(){
  const current=motionValues(),gazeMode=$('gazeMode').value;
  for(const button of bar.querySelectorAll('.preset-button')){
   const preset=presets.find(item=>item.name===button.dataset.name);
   button.setAttribute('aria-pressed',!!preset&&PresetLogic.matches(preset,gazeMode,current,disabledSliders,$('handTracking').checked));
  }
 }
 window.refreshPresetSelection=refresh;
 function applyPreset(preset){
  for(const [key,value] of Object.entries(preset.values))if(keys.includes(key))$(key).value=value;
  if([...$('gazeMode').options].some(option=>option.value===preset.gazeMode))$('gazeMode').value=preset.gazeMode;
  if(typeof preset.handTracking==='boolean')$('handTracking').checked=preset.handTracking;
  setDisabledSliders(preset.disabled);
  apply();
 }
 function render(){
  bar.replaceChildren();
  for(const preset of presets){
   const button=document.createElement('button');
   button.type='button';button.className='preset-button';button.textContent=preset.name;button.dataset.name=preset.name;
   button.title='押すとこの動きの調整に切り替えます。';
   button.onclick=()=>applyPreset(preset);
   const gear=document.createElement('button');
   gear.type='button';gear.className='preset-gear';gear.textContent='⚙';gear.dataset.name=preset.name;
   gear.title='上書き・名前変更・削除';gear.setAttribute('aria-label',`${preset.name}の設定`);
   gear.onclick=()=>showActions(preset);
   const item=document.createElement('span');
   item.className='preset-item';item.append(button,gear);
   bar.append(item);
  }
  const add=document.createElement('button');
  add.type='button';add.id='preset-add';add.textContent='＋ 今の設定を保存';add.title='今の動きの調整に名前を付けて保存します。';
  add.disabled=presets.length>=PresetLogic.MAX_PRESETS;
  add.onclick=()=>addPreset().catch(showError);
  bar.append(add);
  const importButton=document.createElement('button');
  importButton.type='button';importButton.id='preset-import';importButton.textContent='インポート';importButton.title='エクスポートしたプリセットのファイルを追加します。';
  importButton.disabled=presets.length>=PresetLogic.MAX_PRESETS;
  importButton.onclick=()=>importPreset().catch(showError);
  const exportButton=document.createElement('button');
  exportButton.type='button';exportButton.id='preset-export';exportButton.textContent='エクスポート';exportButton.title='プリセットを選んで、ファイルに保存します。';
  exportButton.disabled=!presets.length;
  exportButton.onclick=choosePresetToExport;
  bar.append(importButton,exportButton);
  refresh();
 }
 async function store(updated){presets=await host.savePresets(updated);render();}
 function askName(title,initial,currentName){
  return new Promise(resolve=>{
   $('preset-name-title').textContent=title;
   input.value=initial;
   const validate=()=>{const message=PresetLogic.nameProblem(presets,input.value,currentName);problem.textContent=message??'';save.disabled=message!==null;};
   input.oninput=validate;validate();
   dialog.returnValue='';
   dialog.onclose=()=>resolve(dialog.returnValue==='save'?input.value.trim():null);
   dialog.showModal();input.select();
  });
 }
 async function addPreset(){
  const name=await askName('プリセットを保存',PresetLogic.nextName(presets),null);
  if(name)await store(PresetLogic.added(presets,{name,gazeMode:$('gazeMode').value,values:motionValues(),disabled:disabledSliders,handTracking:$('handTracking').checked}));
 }
 async function importPreset(){const updated=await host.importPreset();if(updated){presets=updated;render();setStatus('プリセットをインポートしました。',true);}}
 function choosePresetToExport(){
  const list=$('preset-export-list'),exporter=$('preset-export-dialog');
  list.replaceChildren(...presets.map(preset=>{
   const button=document.createElement('button');
   button.value=preset.name;button.dataset.name=preset.name;button.textContent=preset.name;
   return button;
  }));
  exporter.returnValue='';
  exporter.onclose=async()=>{
   if(!exporter.returnValue)return;
   try{if(await host.exportPreset(exporter.returnValue))setStatus('プリセットをエクスポートしました。',true);}catch(error){showError(error);}
  };
  exporter.showModal();
 }
 function confirmAction(title,message,action){
  const confirmDialog=$('preset-confirm-dialog');
  $('preset-confirm-title').textContent=title;$('preset-confirm-message').textContent=message;$('preset-confirm-ok').textContent=action;
  confirmDialog.returnValue='';
  return new Promise(resolve=>{confirmDialog.onclose=()=>resolve(confirmDialog.returnValue==='ok');confirmDialog.showModal();});
 }
 const presetActions={
  overwrite:async preset=>{if(await confirmAction(`「${preset.name}」を上書きしますか？`,'今の設定に置き換わります。元の設定には戻せません。','上書き'))await store(PresetLogic.overwritten(presets,preset.name,$('gazeMode').value,motionValues(),disabledSliders,$('handTracking').checked));},
  rename:async preset=>{const name=await askName('名前を変更',preset.name,preset.name);if(name)await store(PresetLogic.renamed(presets,preset.name,name));},
  delete:async preset=>{if(await confirmAction(`「${preset.name}」を削除しますか？`,'削除すると元に戻せません。','削除'))await store(PresetLogic.without(presets,preset.name));}
 };
 function showActions(preset){
  $('preset-actions-title').textContent=preset.name;
  actions.returnValue='';
  // The action runs after closing because the rename dialog cannot open on top of this one cleanly.
  actions.onclose=()=>{const action=presetActions[actions.returnValue];if(action)action(preset).catch(showError);};
  actions.showModal();
 }
 host.getPresets().then(saved=>{presets=saved;render();}).catch(showError);
})();
