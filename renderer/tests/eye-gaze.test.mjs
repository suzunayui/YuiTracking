import {test} from 'node:test';
import assert from 'node:assert/strict';
import {irisGaze,EyeGaze,applyVrmGaze,setGazeRange} from '../src/eye-gaze.js';
function points(x=0,y=0,roll=0){
 const p=[];
 for(const [a,b,t,d,i,cx] of [[33,133,159,145,468,.3],[362,263,386,374,473,.7]]){
  for(const [index,px,py] of [[a,-.05,0],[b,.05,0],[t,0,-.015],[d,0,.015],[i,x*.1,y*.1]])p[index]={x:cx+px*Math.cos(roll)-py*Math.sin(roll),y:.4+px*Math.sin(roll)+py*Math.cos(roll)};
 }
 return p;
}
test('iris axes are invariant under head roll, scale and translation',()=>{
 const a=irisGaze(points(.1,.05),{},1),b=irisGaze(points(.1,.05,.7),{},1);
 assert.ok(Math.abs(a.x-.1)<1e-8&&Math.abs(a.y-.05)<1e-8);
 assert.ok(Math.abs(a.x-b.x)<1e-8&&Math.abs(a.y-b.y)<1e-8);
 const c=irisGaze(points(.1,.05).map(p=>p&&({x:p.x*.5+.2,y:p.y*.5+.1})),{},1);
 assert.ok(Math.abs(a.x-c.x)<1e-8&&Math.abs(a.y-c.y)<1e-8);
});
test('blink and invalid landmarks cannot drive the eyes; one visible eye remains usable',()=>{
 assert.equal(irisGaze(points(),{eyeBlinkLeft:1,eyeBlinkRight:1}),null);
 assert.ok(irisGaze(points(.1),{eyeBlinkRight:1}));assert.equal(irisGaze([]),null);
 const p=points();p[468].x=NaN;p[473].x=NaN;assert.equal(irisGaze(p),null);
});
test('calibration removes iris offset, holds short blinks then returns to neutral and resets',()=>{
 const gaze=new EyeGaze();assert.equal(gaze.calibrate(points(.05,.02),{},1),true);
 let v=gaze.update(points(.05,.02),{},0,0,1/60,1,1);assert.ok(Math.abs(v.x)<1e-8&&Math.abs(v.y)<1e-8);
 for(let i=1;i<30;i++)v=gaze.update(points(.2,.1),{},i*33,i*33,1/30,1,1);
 assert.ok(v.x>.5&&v.y>.8);const held=gaze.update(null,{},1000,1000,1/30,1,1);assert.deepEqual(held,v);
 for(let i=0;i<100;i++)v=gaze.update(null,{},1100+i*33,1100+i*33,1/30,1,1);
 assert.ok(Math.abs(v.x)<1e-6&&Math.abs(v.y)<1e-6);
 gaze.reset();assert.deepEqual(gaze.update(null,{},5000,5000,1/30),{x:0,y:0});
});
test('strength is bounded and unsupported VRM is a no-op',()=>{
 const gaze=new EyeGaze(),v=gaze.update(points(.3,.2),{},1,1,1/30,3,1);assert.deepEqual(v,{x:1,y:1});
 assert.equal(applyVrmGaze({},null,'camera',v,1/60),false);
});

class BoneRanges {
 static type='bone';
 constructor(horizontal=3.75){for(const [name,value] of [['HorizontalInner',horizontal],['HorizontalOuter',horizontal],['VerticalDown',10],['VerticalUp',10]])this['rangeMap'+name]={outputScale:value};}
}
test('eye range scales authored limits without accumulation, restores exactly and isolates models',()=>{
 const a=new BoneRanges(),b=new BoneRanges(5);
 setGazeRange(a,5);setGazeRange(a,5);assert.equal(a.rangeMapHorizontalInner.outputScale,18.75);assert.equal(a.rangeMapVerticalUp.outputScale,45);
 setGazeRange(a,2);assert.equal(a.rangeMapHorizontalInner.outputScale,7.5);assert.equal(b.rangeMapHorizontalInner.outputScale,5);
 setGazeRange(a,1);assert.equal(a.rangeMapHorizontalInner.outputScale,3.75);assert.equal(a.rangeMapVerticalUp.outputScale,10);
 setGazeRange(b,NaN);assert.equal(b.rangeMapHorizontalInner.outputScale,5);
 const wide=new BoneRanges(60);setGazeRange(wide,5);assert.equal(wide.rangeMapHorizontalInner.outputScale,60);setGazeRange(wide,1);assert.equal(wide.rangeMapHorizontalInner.outputScale,60);
});
test('expression range stays within authored expression weight and restores at one',()=>{
 const expression={rangeMapHorizontalInner:{outputScale:.4},rangeMapVerticalDown:{outputScale:1}};
 setGazeRange(expression,5);assert.equal(expression.rangeMapHorizontalInner.outputScale,1);assert.equal(expression.rangeMapVerticalDown.outputScale,1);
 setGazeRange(expression,1);assert.equal(expression.rangeMapHorizontalInner.outputScale,.4);
});
