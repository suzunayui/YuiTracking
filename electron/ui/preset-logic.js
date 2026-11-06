'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PresetLogic=factory();})(typeof self!=='undefined'?self:this,function(){
 const MAX_PRESETS=30,MAX_NAME_LENGTH=20,TOLERANCE=.0005;
 // What each slider sends while its checkbox is off.
 const OFF_VALUES={zoomCenterX:0,zoomCenterY:0,farZoomStrength:0,nearZoomStrength:0,gazeRange:1,gazeStrength:1,smoothing:0,sensitivity:1,bodyStrength:0,forwardLeanStrength:0,backwardLeanStrength:0,sideTiltStrength:0,mouthOpenStrength:1,mouthSensitivity:1,springStrength:1,chestSpringStrength:1};
 const safeDisabled=value=>Array.isArray(value)?[...new Set(value.filter(key=>Object.hasOwn(OFF_VALUES,key)))]:[];
 function effective(values,disabled){const result={...values};for(const key of safeDisabled(disabled))result[key]=OFF_VALUES[key];return result;}
 const same=(left,right)=>left.trim().toLowerCase()===right.trim().toLowerCase();
 // Returns what is wrong with the name, or null when it can be used.
 function nameProblem(presets,name,currentName=null){
  const text=typeof name==='string'?name.trim():'';
  if(!text)return '名前を入力してください。';
  if(text.length>MAX_NAME_LENGTH)return `名前は${MAX_NAME_LENGTH}文字以内にしてください。`;
  if(presets.some(preset=>same(preset.name,text)&&(currentName===null||!same(preset.name,currentName))))return '同じ名前のプリセットがあります。';
  return null;
 }
 function nextName(presets){
  for(let number=presets.length+1;;number++){
   const name=`プリセット${number}`;
   if(!presets.some(preset=>same(preset.name,name)))return name;
  }
 }
 const added=(presets,preset)=>[...presets,{...preset,name:preset.name.trim()}].slice(0,MAX_PRESETS);
 const overwritten=(presets,name,gazeMode,values,disabled=[])=>presets.map(preset=>same(preset.name,name)?{...preset,gazeMode,values,disabled}:preset);
 const renamed=(presets,name,newName)=>presets.map(preset=>same(preset.name,name)?{...preset,name:newName.trim()}:preset);
 const without=(presets,name)=>presets.filter(preset=>!same(preset.name,name));
 // Keys added in a later version are not part of an older preset, so only saved values are compared.
 function matches(preset,gazeMode,current,disabled=[]){
  const off=safeDisabled(preset.disabled),now=safeDisabled(disabled);
  return preset.gazeMode===gazeMode&&Object.entries(preset.values).every(([key,value])=>Number.isFinite(current[key])&&Math.abs(current[key]-value)<=TOLERANCE)&&off.length===now.length&&off.every(key=>now.includes(key));
 }
 return {MAX_PRESETS,MAX_NAME_LENGTH,OFF_VALUES,safeDisabled,effective,nameProblem,nextName,added,overwritten,renamed,without,matches};
});
