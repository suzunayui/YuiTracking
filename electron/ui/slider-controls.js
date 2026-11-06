'use strict';
// Adds minus, plus, numeric entry and reset controls around a range input.
function addSliderControls(input,scale,onChange){
 const label=input.closest('label');
 const element=(tag,className,text)=>{const item=document.createElement(tag);if(className)item.className=className;if(text)item.textContent=text;return item;};
 const min=Number(input.min),max=Number(input.max),step=Number(input.step),resetValue=Number(input.defaultValue);
 const name=label.firstChild.textContent.replace('：','');
 const round=value=>Math.round(value*1e6)/1e6;
 const set=value=>{input.value=Math.min(max,Math.max(min,round(value)));onChange();};
 const stepButton=(text,title,delta)=>{const button=element('button','slider-button',text);button.type='button';button.title=title;button.setAttribute('aria-label',title);button.onclick=()=>set(Number(input.value)+delta);return button;};

 const control=element('div','slider-control');
 if(label.id)control.id=label.id;
 if(label.title)control.title=label.title;
 const head=element('div','slider-head'),text=element('span','slider-label');
 while(label.firstChild&&label.firstChild!==input)text.appendChild(label.firstChild);
 const reset=stepButton('↺',`${name}を初期値（${Number((resetValue*scale).toFixed(1))}）に戻す`,0);
 reset.onclick=()=>set(resetValue);
 head.append(text,reset);

 const number=element('input','slider-number');
 number.type='number';number.min=min*scale;number.max=max*scale;number.step='any';
 number.setAttribute('aria-label',`${name}の数値`);
 number.onchange=()=>{const value=Number(number.value);if(number.value!==''&&Number.isFinite(value))set(value/scale);else sync();};
 const sync=()=>{number.value=Number((Number(input.value)*scale).toFixed(scale===1?1:0));};
 const minus=stepButton('−',`${name}を下げる`,-step),plus=stepButton('＋',`${name}を上げる`,step);
 const syncDisabled=()=>{for(const item of [minus,plus,reset,number])item.disabled=input.disabled;};
 new MutationObserver(syncDisabled).observe(input,{attributes:true,attributeFilter:['disabled']});
 syncDisabled();

 const row=element('div','slider-row');
 label.replaceWith(control);
 row.append(minus,input,plus,number);
 control.append(head,row);
 return sync;
}
