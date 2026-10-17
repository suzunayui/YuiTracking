import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LandmarkFilter,handFilterOptions} from '../src/landmark-filter.js';
import {smoothingAlpha,handSmoothingAlpha} from '../src/rig-math.js';

// Feed 30 Hz camera observations into a 60 Hz display. Compare the full
// filter + display path, including repeated display ticks between samples.
function replay(options,response,{moving=false}={}){
 const filter=new LandmarkFilter(options);let target=.2,display=.2,error=0,count=0;
 for(let frame=0;frame<240;frame++){
  const truth=moving&&frame>=120?.2+(frame-120)/120*.6:.2;
  if(frame%2===0){
   const observed=truth+(moving?0:((frame/2)%2?.002:-.002));
   target=filter.update([{x:observed,y:.5,z:0}],frame*1000/60)[0].x;
  }
  display+=(target-display)*response(.65,1/60);
  if((moving&&frame>=150)||(!moving&&frame>=120)){error+=moving?truth-display:(display-truth)**2;count++;}
 }
 return moving?error/count:Math.sqrt(error/count);
}
test('hand response reduces movement lag while keeping synthetic stationary noise bounded',()=>{
 const previous={minCutoff:1,beta:5};
 const oldLag=replay(previous,smoothingAlpha,{moving:true}),newLag=replay(handFilterOptions,handSmoothingAlpha,{moving:true});
 const oldNoise=replay(previous,smoothingAlpha),newNoise=replay(handFilterOptions,handSmoothingAlpha);
 assert.ok(newLag<oldLag*.7,`Movement lag ${oldLag} -> ${newLag}`);
 assert.ok(newNoise<.0002&&newNoise-oldNoise<.0001,`Stationary RMS ${oldNoise} -> ${newNoise}`);
 console.log(`Synthetic hand lag: ${(oldLag/.3*1000).toFixed(1)} -> ${(newLag/.3*1000).toFixed(1)} ms; stationary RMS: ${newNoise.toFixed(6)}`);
});

test('hand display response is time-based and zero smoothing stays direct',()=>{
 assert.equal(handSmoothingAlpha(0,1/60),1);
 const results=[30,60,120].map(fps=>{let value=0;for(let i=0;i<fps/5;i++)value+=(1-value)*handSmoothingAlpha(.65,1/fps);return value;});
 assert.ok(Math.abs(results[0]-results[1])<1e-12&&Math.abs(results[1]-results[2])<1e-12);
 for(const smoothing of [.2,.65,.95])assert.ok(handSmoothingAlpha(smoothing,1/60)>smoothingAlpha(smoothing,1/60));
});
