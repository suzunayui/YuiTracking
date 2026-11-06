'use strict';
(()=>{
 const dialog=$('vrm-dialog'),cards=$('vrm-cards');
 const element=(tag,className,text)=>{const item=document.createElement(tag);if(className)item.className=className;if(text)item.textContent=text;return item;};
 function card(entry){
  const wrapper=element('div','vrm-card');
  const select=element('button','vrm-select');
  select.type='button';select.disabled=!entry.exists;select.title=entry.exists?entry.file:'ファイルが見つかりません：'+entry.file;
  select.setAttribute('aria-label',entry.name+(entry.current?'（使用中）':entry.exists?'':'（見つかりません）'));
  if(entry.current)select.classList.add('vrm-current');
  const picture=element('div','vrm-picture');
  if(entry.thumbnail){const image=document.createElement('img');image.src=entry.thumbnail;image.alt='';picture.append(image);}
  else picture.append(element('span','vrm-none','画像なし'));
  select.append(picture,element('span','vrm-name',entry.name));
  select.onclick=async()=>{dialog.close();try{await host.openVrm(entry.file);}catch(error){showError(error);}};
  const remove=element('button','vrm-remove','×');
  remove.type='button';remove.title='一覧から外します。VRMファイルは消えません。';remove.setAttribute('aria-label',entry.name+'を一覧から外す');
  remove.onclick=async()=>{try{await host.removeVrm(entry.file);await refresh();}catch(error){showError(error);}};
  wrapper.append(select,remove);
  if(entry.current||!entry.exists)wrapper.append(element('span','vrm-badge',entry.exists?'使用中':'見つかりません'));
  return wrapper;
 }
 async function refresh(){
  const history=await host.vrmHistory();
  cards.replaceChildren(...history.map(card));
  if(!history.length)cards.append(element('p','vrm-empty','まだ読み込んだVRMはありません。「ファイルから開く」で読み込むと、ここに並びます。'));
 }
 window.openVrmDialog=async()=>{
  if(dialog.open)return;
  try{await refresh();dialog.showModal();}catch(error){showError(error);}
 };
 $('vrm-file').onclick=()=>{dialog.close();host.openModel().catch(showError);};
 $('vrm-close').onclick=()=>dialog.close();
})();
