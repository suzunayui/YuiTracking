const test=require('node:test');
const assert=require('node:assert/strict');
const logic=require('../electron/ui/preset-logic.js');

const values=a=>({a,b:2});
const list=logic.added([],{name:' 配信 ',gazeMode:'camera',values:values(1)});

test('added preset keeps a trimmed name',()=>{assert.equal(list[0].name,'配信');});
test('invalid names are rejected',()=>{
 assert.ok(logic.nameProblem(list,'  '));
 assert.ok(logic.nameProblem(list,'あ'.repeat(21)));
 assert.ok(logic.nameProblem(list,'配信'));
 assert.equal(logic.nameProblem(list,'雑談'),null);
 assert.equal(logic.nameProblem(list,'配信','配信'),null,'renaming may keep its own name');
});
test('next name counts existing presets and skips used names',()=>{
 assert.equal(logic.nextName(list),'プリセット2');
 assert.equal(logic.nextName([{name:'プリセット2'}]),'プリセット3');
});
test('match needs the same values and gaze mode',()=>{
 assert.ok(logic.matches(list[0],'camera',values(1.0002)));
 assert.ok(!logic.matches(list[0],'camera',values(1.1)));
 assert.ok(!logic.matches(list[0],'fixed',values(1)));
 assert.ok(!logic.matches(list[0],'camera',{a:1}));
});
test('settings newer than the preset do not break a match',()=>{assert.ok(logic.matches(list[0],'camera',{...values(1),newer:9}));});
test('overwrite, rename, and delete change only the named preset',()=>{
 const two=logic.added(list,{name:'雑談',gazeMode:'fixed',values:values(5)});
 const changed=logic.overwritten(two,'配信','fixed',values(3));
 assert.deepEqual(changed[0],{name:'配信',gazeMode:'fixed',values:values(3),disabled:[]});
 assert.equal(changed[1].values.a,5);
 assert.equal(logic.renamed(two,'配信',' 歌 ')[0].name,'歌');
 assert.deepEqual(logic.without(two,'配信').map(item=>item.name),['雑談']);
});
test('the number of presets is limited',()=>{
 let many=[];
 for(let i=0;i<40;i++)many=logic.added(many,{name:`p${i}`,gazeMode:'camera',values:{}});
 assert.equal(many.length,logic.MAX_PRESETS);
});
test('a disabled slider sends its off value and keeps the others',()=>{
 assert.deepEqual(logic.effective({bodyStrength:5,sensitivity:3,smoothing:.6},['bodyStrength','sensitivity']),{bodyStrength:0,sensitivity:1,smoothing:.6});
 assert.deepEqual(logic.effective({bodyStrength:5},['unknown']),{bodyStrength:5});
 assert.deepEqual(logic.safeDisabled(['bodyStrength','bodyStrength','x',3]),['bodyStrength']);
 assert.deepEqual(logic.safeDisabled('bodyStrength'),[]);
});
test('match includes which sliders are off, and older presets mean all on',()=>{
 const preset={name:'x',gazeMode:'camera',values:{sensitivity:1},disabled:['sensitivity']};
 assert.ok(logic.matches(preset,'camera',{sensitivity:1},['sensitivity']));
 assert.ok(!logic.matches(preset,'camera',{sensitivity:1},[]));
 assert.ok(logic.matches({name:'old',gazeMode:'camera',values:{sensitivity:1}},'camera',{sensitivity:1},[]));
});
