import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mouthShapes} from '../src/mouth-shapes.js';
test('open, stretched and rounded mouths drive all five VRM vowels',()=>{
 const a=mouthShapes({jawOpen:.4});assert.ok(a.aa>0&&a.ih===0&&a.oh===0);
 const i=mouthShapes({jawOpen:.08,mouthStretchLeft:.8,mouthStretchRight:.8});assert.ok(i.ih>i.ee&&i.aa===0);
 const e=mouthShapes({jawOpen:.3,mouthStretchLeft:.8,mouthStretchRight:.8});assert.ok(e.ee>e.ih);
 const u=mouthShapes({jawOpen:.05,mouthPucker:.8});assert.ok(u.ou>u.oh&&u.aa===0);
 const o=mouthShapes({jawOpen:.4,mouthFunnel:.8,mouthPucker:.8});assert.ok(o.oh>0&&o.ou===0);
});
test('closed mouth clears every vowel; gain changes size while mixtures stay bounded',()=>{
 assert.deepEqual(mouthShapes({}),{aa:0,ih:0,ee:0,oh:0,ou:0});
 const weights={jawOpen:.15,mouthFunnel:.3,mouthStretchLeft:.4,mouthStretchRight:.4};
 const low=mouthShapes(weights,.5),high=mouthShapes(weights,3);
 assert.ok(Object.values(high).reduce((a,b)=>a+b,0)>Object.values(low).reduce((a,b)=>a+b,0));
 assert.ok(Object.values(high).reduce((a,b)=>a+b,0)<=1);
});
test('a wide open jaw prioritizes A even when funnel and smile scores are high',()=>{
 const mouth=mouthShapes({jawOpen:.8,mouthFunnel:.7,mouthSmileLeft:.5,mouthSmileRight:.5},3);
 assert.equal(mouth.aa,1);assert.equal(mouth.oh,0);assert.equal(mouth.ee,0);
});
test('large E and O mouths retain their shape instead of being overridden by A',()=>{
 const e=mouthShapes({jawOpen:.7,mouthStretchLeft:.8,mouthStretchRight:.8},3);
 const o=mouthShapes({jawOpen:.7,mouthFunnel:.95},3);
 assert.ok(e.ee>.95&&e.aa<.05);
 assert.ok(o.oh>.95&&o.aa<.05);
});
test('stretched I and puckered U can respond strongly with little jaw opening',()=>{
 const i=mouthShapes({jawOpen:.02,mouthStretchLeft:.8,mouthStretchRight:.8},3);
 const u=mouthShapes({jawOpen:.02,mouthPucker:.8},3);
 assert.ok(i.ih>.7&&i.aa<.05);
 assert.ok(u.ou>.9&&u.aa<.05);
});
test('small openings are amplified without turning neutral score noise into speech',()=>{
 assert.ok(mouthShapes({jawOpen:.1},1.8).aa>.3);
 assert.equal(mouthShapes({jawOpen:.01}).aa,0);
 const mixture=mouthShapes({jawOpen:.2,mouthFunnel:.2,mouthStretchLeft:.4,mouthStretchRight:.4},1.8);
 const previousStrongest=.2*1.8*(1-.3)*.72*(.2/.35);
 assert.ok(Math.max(...Object.values(mixture))>previousStrongest*2);
});
test('visible lip separation drives the mouth even when the jaw score stays low',()=>{
 const points=[];points[61]={x:.4,y:.5};points[291]={x:.6,y:.5};points[13]={x:.5,y:.47};points[14]={x:.5,y:.53};
 assert.ok(mouthShapes({jawOpen:.01},1.8,points,1).aa>.9);
 points[14]=points[13];assert.equal(mouthShapes({jawOpen:.01},1.8,points,1).aa,0);
});
