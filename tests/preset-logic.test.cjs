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

const sharedFile='{"format":"yuitracking-preset","version":1,"name":"配信","gazeMode":"camera","values":{"smoothing":0.5,"sideTiltStrength":2,"unknownKey":9},"disabled":["sideTiltStrength","unknownKey"]}';
test('a preset file keeps known values and drops unknown ones',()=>{
 const preset=logic.parsed(sharedFile);
 assert.equal(preset.name,'配信');assert.equal(preset.gazeMode,'camera');
 assert.deepEqual(preset.values,{smoothing:.5,sideTiltStrength:2});
 assert.deepEqual(preset.disabled,['sideTiltStrength']);
});
test('a preset file survives writing and reading',()=>{
 const preset={name:'雑談',gazeMode:'fixed',values:{smoothing:.25},disabled:['smoothing']};
 assert.deepEqual(logic.parsed(logic.serialized(preset)),preset);
});
test('broken preset files are rejected',()=>{
 for(const text of ['','[]','{}','not json','{"format":"other","version":1}',sharedFile.replace('"version":1','"version":"1"'),sharedFile.replace('"camera"','"other"'),sharedFile.replace('"配信"','"  "'),'{"format":"yuitracking-preset","version":1,"name":"a","gazeMode":"camera","values":{"unknown":1}}','{"format":"yuitracking-preset","version":1,"name":"a","gazeMode":"camera","values":{"smoothing":"1"}}'])assert.throws(()=>logic.parsed(text),{message:/読み込めません/},text);
 assert.throws(()=>logic.parsed(sharedFile.replace('"version":1','"version":2')),{message:/新しいバージョン/});
});
test('a preset file cannot set an inherited property',()=>{
 const preset=logic.parsed('{"format":"yuitracking-preset","version":1,"name":"a","gazeMode":"camera","values":{"__proto__":1,"smoothing":1}}');
 assert.deepEqual(Object.keys(preset.values),['smoothing']);
 assert.equal(({}).polluted,undefined);
});
test('long names are shortened on import',()=>{
 const preset=logic.parsed(logic.serialized({name:'あ'.repeat(30),gazeMode:'camera',values:{smoothing:1}}));
 assert.equal(preset.name.length,20);
});
test('imported names never collide',()=>{
 const taken=[{name:'配信'},{name:'配信 (2)'}];
 assert.equal(logic.uniqueName(taken,'雑談'),'雑談');
 assert.equal(logic.uniqueName(taken,' 配信'.trim()),'配信 (3)');
 const long='あ'.repeat(20);
 assert.equal(logic.uniqueName([{name:long}],long),'あ'.repeat(16)+' (2)');
});
test('file names avoid characters Windows refuses',()=>{
 assert.equal(logic.fileName('配信'),'配信.json');
 assert.equal(logic.fileName('a/b:c*'),'a_b_c_.json');
 assert.equal(logic.fileName('...'),'preset.json');
});
