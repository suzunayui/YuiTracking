import test from 'node:test';
import assert from 'node:assert/strict';
import {cardLayout,CARD_COLUMNS,drawSettingsCard} from '../src/settings-card.js';

const section=(title,rows)=>({title,rows:Array.from({length:rows},(_,i)=>({label:`${title}${i}`,value:'1.0倍'}))});
const sections=[section('目線',3),section('顔・口',4),section('揺れ',2),section('体',4),section('手',1),section('ズーム',4)];

test('every section appears once and in the panel order',()=>{
 const titles=cardLayout(sections).columns.flat().map(item=>item.title);
 assert.deepEqual(titles,sections.map(item=>item.title));
});
test('sections fill all three columns without an extreme imbalance',()=>{
 const {columns}=cardLayout(sections);
 assert.equal(columns.length,CARD_COLUMNS);
 assert.ok(columns.every(column=>column.length>0));
 const rows=columns.map(column=>column.reduce((sum,item)=>sum+item.rows.length+1,0));
 assert.ok(Math.max(...rows)-Math.min(...rows)<=4,rows.join());
});
test('the image is wider than tall so it stays readable when shared',()=>{
 assert.ok(cardLayout(sections).height<1600);
});
test('an empty card still has a size',()=>{
 assert.ok(cardLayout([]).height>0);
});
test('drawing shows OFF instead of the stored value',()=>{
 const drawn=[];
 const context={measureText:text=>({width:text.length*10}),fillRect(){},beginPath(){},roundRect(){},fill(){},fillText:text=>drawn.push(text)};
 const canvas={getContext:()=>context};
 drawSettingsCard(canvas,{title:'設定',preset:'プリセット：配信',sections:[{title:'体',rows:[{label:'体の強さ',value:'1.0倍'},{label:'傾き',value:'2.0倍',off:true}]}]});
 assert.ok(drawn.includes('OFF'));
 assert.ok(drawn.includes('1.0倍'));
 assert.ok(!drawn.includes('2.0倍'));
 assert.ok(drawn.includes('プリセット：配信'));
 assert.equal(canvas.width,1600);
});
