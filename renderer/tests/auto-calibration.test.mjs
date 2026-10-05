import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutoCalibration} from '../src/auto-calibration.js';
const sample=time=>({time,rotation:[0,0,0,1],eyesOpen:true});
test('camera start calibrates once after warmup and stable distinct face observations',()=>{
 const state=new AutoCalibration();state.start(0);
 for(let time=0;time<1500;time+=100)assert.equal(state.observe(sample(time),time),false);
 assert.equal(state.observe(sample(1500),1500),true);
 assert.equal(state.observe(sample(1700),1700),false);
 state.start(2000);assert.equal(state.observe(sample(2000),2000),false);
});
test('missing faces, closed eyes, movement and stopping prevent premature calibration',()=>{
 const state=new AutoCalibration();state.start(0);
 state.observe(sample(1000),1000);
 assert.equal(state.observe(sample(1000),1500),false);
 state.observe({...sample(1600),eyesOpen:false},1600);
 assert.equal(state.observe(sample(1700),1700),false);
 state.observe({...sample(1800),rotation:[0,.5,0,Math.sqrt(.75)]},1800);
 assert.equal(state.observe(sample(1900),1900),false);
 assert.equal(state.observe(null,2000),false);
 state.stop();assert.equal(state.observe(sample(3000),3000),false);
});
