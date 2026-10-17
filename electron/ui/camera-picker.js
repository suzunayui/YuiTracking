// Browser IDs select inputs. macOS names remain discoverable until permission
// or Continuity Camera availability lets Chromium resolve an input ID.
class CameraPicker {
 constructor(){this.known=new Map();this.current=[];}
 update(message,nativeLabels,selected){
  const items=message.items||[];
  for(const item of items){
   const old=this.known.get(item.deviceId);
   const named=message.labelsAvailable===true&&!/^カメラ \d+$/.test(item.label);
   this.known.set(item.deviceId,{...item,label:named||!old?item.label:old.label});
  }
  this.current=items.map(item=>item.deviceId);
  const live=new Set(this.current);let options=[...this.known.values()].map(item=>({...item,disabled:!live.has(item.deviceId)}));
  const normalize=name=>name.trim().replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i,'').replace(/\s*\(built-in\)\s*$/i,'').toLowerCase();
  nativeLabels.forEach(label=>{
   if(options.some(item=>!item.disabled&&normalize(item.label)===normalize(label)))return;
   options=options.filter(item=>!item.disabled||normalize(item.label)!==normalize(label));
   options.push({label,deviceId:'native:'+encodeURIComponent(label),disabled:false});
  });
  options.unshift({label:'システム既定のカメラ',deviceId:'default:',disabled:false});
  const current=options.find(item=>item.deviceId===selected);
  const previousName=this.known.get(selected)?.label||(selected?.startsWith('native:')?decodeURIComponent(selected.slice(7)):'');
  const sameCamera=options.find(item=>normalize(item.label)===normalize(previousName));
  return {options,selected:current?.deviceId||sameCamera?.deviceId||options.find(item=>!item.disabled)?.deviceId||''};
 }
}
