import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bend,safeTracking,smoothingAlpha,calibratedBlink} from '../src/rig-math.js';
test('eye calibration opens resting eyelids while preserving full blinks',()=>{
 for(const baseline of [.15,.4,.8]){
  assert.equal(calibratedBlink(baseline,baseline),0);
  assert.equal(calibratedBlink(baseline/2,baseline),0);
  assert.ok(Math.abs(calibratedBlink(baseline+(1-baseline)*.275,baseline)-.5)<1e-10);
  assert.equal(calibratedBlink(baseline+(1-baseline)*.6,baseline),1);
  assert.equal(calibratedBlink(1,baseline),1);
 }
 assert.equal(calibratedBlink(.6,0),1);
 assert.ok(Number.isFinite(calibratedBlink(1,1)));
});
test('straight and bent fingers produce bounded rotations',()=>{
 assert.equal(bend({x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0}),0);
 assert.ok(Math.abs(bend({x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:1,z:0})-Math.PI/2)<1e-6);
 assert.equal(bend({x:0,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:0}),0);
});
test('stale and future recognition data never drive the avatar',()=>{
 assert.equal(safeTracking({time:100},700),false);assert.equal(safeTracking(null,700),false);
 assert.equal(safeTracking({time:800},700),false);assert.equal(safeTracking({time:650},700),true);
});
test('smoothing is frame-rate independent',()=>{
 const a=smoothingAlpha(.65,1/30),b=smoothingAlpha(.65,1/60);
 assert.ok(Math.abs(a-(1-(1-b)**2))<1e-10);
});
