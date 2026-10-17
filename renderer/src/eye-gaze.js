import {OneEuroFilter} from './vendor/one-euro-filter.js';
import {clamp} from './rig-math.js';

// Camera input is unmirrored. Both eye axes point towards image-right.
const eyeIndices=[{corners:[33,133],lids:[159,145],iris:468,blink:'eyeBlinkRight'},
 {corners:[362,263],lids:[386,374],iris:473,blink:'eyeBlinkLeft'}];
export function irisGaze(points,weights={},aspect=16/9){
 if(!points||!Number.isFinite(aspect)||aspect<=0)return null;
 const valid=[];
 for(const eye of eyeIndices){
  const indices=[...eye.corners,...eye.lids,eye.iris];
  if(indices.some(i=>!Number.isFinite(points[i]?.x)||!Number.isFinite(points[i]?.y))||(weights[eye.blink]??0)>.65)continue;
  const [a,b,top,bottom,iris]=indices.map(i=>({x:points[i].x*aspect,y:points[i].y}));
  const dx=b.x-a.x,dy=b.y-a.y,width=Math.hypot(dx,dy);if(width<1e-4)continue;
  const ux=dx/width,uy=dy/width,vx=-uy,vy=ux;
  const aperture=((bottom.x-top.x)*vx+(bottom.y-top.y)*vy)/width;
  if(aperture<.06)continue;
  const ix=iris.x-(a.x+b.x)/2,iy=iris.y-(a.y+b.y)/2;
  const x=(ix*ux+iy*uy)/width,y=(ix*vx+iy*vy)/width;
  if(Math.abs(x)>.6||Math.abs(y)>.35)continue;
  valid.push({x,y});
 }
 if(!valid.length)return null;
 return {x:valid.reduce((sum,v)=>sum+v.x,0)/valid.length,y:valid.reduce((sum,v)=>sum+v.y,0)/valid.length};
}

export class EyeGaze {
 constructor(){this.filters=[new OneEuroFilter(30,1.5,6),new OneEuroFilter(30,1.5,6)];this.reset();}
 reset(){this.neutral={x:0,y:0};this.value={x:0,y:0};this.time=null;this.lastValid=-Infinity;for(const filter of this.filters)filter.reset();}
 calibrate(points,weights,aspect){
  const value=irisGaze(points,weights,aspect);if(!value)return false;
  this.neutral=value;this.value={x:0,y:0};this.time=null;this.lastValid=-Infinity;for(const filter of this.filters)filter.reset();return true;
 }
 update(points,weights,time,now,dt,strength=1,aspect=16/9){
  if(Number.isFinite(time)&&(this.time===null||time>this.time)){
   this.time=time;
   const raw=irisGaze(points,weights,aspect);
   if(raw){this.lastValid=now;this.value={x:this.filters[0].filter(raw.x-this.neutral.x,time/1000),y:this.filters[1].filter(raw.y-this.neutral.y,time/1000)};}
  }
  if(now-this.lastValid>250){const decay=Math.exp(-8*clamp(dt,0,.1));this.value.x*=decay;this.value.y*=decay;}
  return {x:clamp(this.value.x*4*strength,-1,1),y:clamp(this.value.y*12*strength,-1,1)};
 }
}

const gazeRanges=new WeakMap();
// Keep authored values per applier so changes never accumulate or leak to another model.
export function setGazeRange(applier,strength=1){
 if(!applier)return;
 let original=gazeRanges.get(applier);
 if(!original){
  original=['rangeMapHorizontalInner','rangeMapHorizontalOuter','rangeMapVerticalDown','rangeMapVerticalUp']
   .map(key=>applier[key]).filter(map=>map&&Number.isFinite(map.outputScale)).map(map=>({map,scale:map.outputScale}));
  gazeRanges.set(applier,original);
 }
 const gain=Number.isFinite(strength)?clamp(strength,1,5):1;
 const limit=applier.constructor.type==='bone'?45:1;
 for(const {map,scale} of original)map.outputScale=gain===1?scale:Math.min(scale*gain,Math.max(scale,limit));
}

export function applyVrmGaze(vrm,camera,mode,gaze,dt,range=1){
 const look=vrm?.lookAt;if(!look)return false;
 setGazeRange(look.applier,range);
 look.autoUpdate=false;
 if(mode==='camera'){
  vrm.scene.updateWorldMatrix(true,true);
  look.lookAt(camera.getWorldPosition(camera.position.clone()));
 }else{
  const applier=look.applier;
  const horizontal=Math.min(applier.rangeMapHorizontalInner?.inputMaxValue??90,applier.rangeMapHorizontalOuter?.inputMaxValue??90);
  const vertical=gaze.y>=0?applier.rangeMapVerticalDown?.inputMaxValue:applier.rangeMapVerticalUp?.inputMaxValue;
  look.yaw=mode==='tracking'?gaze.x*horizontal:0;
  look.pitch=mode==='tracking'?gaze.y*(vertical??90):0;
 }
 look.update(dt);return true;
}
