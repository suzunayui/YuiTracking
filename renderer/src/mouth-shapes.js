import {clamp} from './rig-math.js';
// Visual mouth-shape estimation; no microphone or speech recognition.
export function mouthShapes(weights,strength=1.8,points=null,aspect=16/9){
 let jaw=clamp(weights.jawOpen??0,0,1);
 if([13,14,61,291].every(i=>points?.[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y))){
  const distance=(a,b)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
  const width=distance(points[61],points[291]);
  if(width>.01)jaw=Math.max(jaw,clamp((distance(points[13],points[14])/width-.025)*1.6,0,1));
 }
 const broadOpen=clamp((jaw-.25)/.3,0,1);
 const pucker=clamp(weights.mouthPucker??0,0,1);
 const funnel=clamp(weights.mouthFunnel??0,0,1);
 const stretch=clamp(((weights.mouthStretchLeft??0)+(weights.mouthStretchRight??0))/2,0,1);
 const roundEvidence=Math.max(pucker,clamp((funnel-.75)/.25,0,1));
 const rounded=clamp(Math.max(roundEvidence,funnel*(1-broadOpen))*1.5,0,1);
 const wide=clamp(Math.max(stretch,((weights.mouthSmileLeft??0)+(weights.mouthSmileRight??0))/2)*1.8,0,1);
 const open=clamp(jaw/.35,0,1);
 const activity=Math.max(Math.max(0,jaw-.015),Math.max(0,rounded-.25)*.35,Math.max(0,stretch-.25)*.3);
 // Amplify subtle openings, and concentrate mixtures so five weak morphs
 // do not wash out the visible change. Transitions remain continuous.
 const amount=clamp(Math.pow(activity,.7)*clamp(strength,.5,3),0,1);
 const priority=broadOpen*(1-clamp((roundEvidence-.2)/.4,0,1))*(1-clamp((stretch-.2)/.4,0,1));
 const shapes={aa:(1-rounded)*(1-wide)*(1-priority)+priority,ih:(1-rounded)*wide*(1-open)*(1-priority),ee:(1-rounded)*wide*open*(1-priority),oh:rounded*open*(1-priority),ou:rounded*(1-open)*(1-priority)};
 const sharpened=Object.fromEntries(Object.entries(shapes).map(([name,value])=>[name,value*value]));
 const total=Object.values(sharpened).reduce((sum,value)=>sum+value,0);
 return Object.fromEntries(Object.entries(sharpened).map(([name,value])=>[name,amount*value/total]));
}
