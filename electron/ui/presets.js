'use strict';
(()=>{
 let presets=[],menuPreset=null;
 const bar=$('preset-bar'),menu=$('preset-menu'),dialog=$('preset-name-dialog'),input=$('preset-name-input'),problem=$('preset-name-problem'),save=$('preset-name-save');
 const motionValues=()=>{const {gazeMode,handTracking,disabledSliders:off,...rest}=values();return rest;};
 function refresh(){
  const current=motionValues(),gazeMode=$('gazeMode').value;
  for(const button of bar.querySelectorAll('.preset-button')){
   const preset=presets.find(item=>item.name===button.dataset.name);
   button.setAttribute('aria-pressed',!!preset&&PresetLogic.matches(preset,gazeMode,current,disabledSliders));
  }
 }
 window.refreshPresetSelection=refresh;
 function applyPreset(preset){
  for(const [key,value] of Object.entries(preset.values))if(keys.includes(key))$(key).value=value;
  if([...$('gazeMode').options].some(option=>option.value===preset.gazeMode))$('gazeMode').value=preset.gazeMode;
  setDisabledSliders(preset.disabled);
  apply();
 }
 function render(){
  bar.replaceChildren();
  for(const preset of presets){
   const button=document.createElement('button');
   button.type='button';button.className='preset-button';button.textContent=preset.name;button.dataset.name=preset.name;
   button.title='押すとこの動きの調整に切り替えます。\n右クリックで上書き・名前変更・書き出し・削除ができます。';
   button.onclick=()=>applyPreset(preset);
   button.oncontextmenu=event=>{event.preventDefault();showMenu(event.clientX,event.clientY,preset);};
   bar.append(button);
  }
  const add=document.createElement('button');
  add.type='button';add.id='preset-add';add.textContent='＋ 今の設定を保存';add.title='今の動きの調整に名前を付けて保存します。';
  add.disabled=presets.length>=PresetLogic.MAX_PRESETS;
  add.onclick=()=>addPreset().catch(showError);
  bar.append(add);
  const load=document.createElement('button');
  load.type='button';load.id='preset-import';load.textContent='読み込み';load.title='書き出したプリセットのファイルを読み込みます。';
  load.disabled=presets.length>=PresetLogic.MAX_PRESETS;
  load.onclick=()=>importPreset().catch(showError);
  bar.append(load);
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
  if(name)await store(PresetLogic.added(presets,{name,gazeMode:$('gazeMode').value,values:motionValues(),disabled:disabledSliders}));
 }
 async function importPreset(){const updated=await host.importPreset();if(updated){presets=updated;render();setStatus('プリセットを読み込みました。',true);}}
 function showMenu(x,y,preset){
  menuPreset=preset;menu.hidden=false;
  const box=menu.getBoundingClientRect();
  menu.style.left=Math.min(x,innerWidth-box.width-4)+'px';menu.style.top=Math.min(y,innerHeight-box.height-4)+'px';
 }
 function hideMenu(){menu.hidden=true;}
 const fromMenu=action=>()=>{const preset=menuPreset;hideMenu();if(preset)action(preset).catch(showError);};
 $('preset-menu-overwrite').onclick=fromMenu(preset=>store(PresetLogic.overwritten(presets,preset.name,$('gazeMode').value,motionValues(),disabledSliders)));
 $('preset-menu-rename').onclick=fromMenu(async preset=>{const name=await askName('名前を変更',preset.name,preset.name);if(name)await store(PresetLogic.renamed(presets,preset.name,name));});
 $('preset-menu-export').onclick=fromMenu(async preset=>{if(await host.exportPreset(preset.name))setStatus('プリセットを書き出しました。',true);});
 $('preset-menu-delete').onclick=fromMenu(preset=>store(PresetLogic.without(presets,preset.name)));
 document.addEventListener('click',event=>{if(!menu.hidden&&!menu.contains(event.target))hideMenu();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hideMenu();});
 host.getPresets().then(saved=>{presets=saved;render();}).catch(showError);
})();
