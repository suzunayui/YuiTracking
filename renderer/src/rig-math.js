export const clamp = (v, low, high) => Math.max(low, Math.min(high, Number.isFinite(v) ? v : 0));
export function calibratedBlink(value, baseline=0) {
 const neutral=clamp(baseline,0,.95);
 // Detector scores often stay below 1 even with fully shut eyelids.
 const closingRange=(1-neutral)*.55;
 return clamp((clamp(value,0,1)-neutral)/closingRange,0,1);
}
export function bend(a,b,c) {
  const u=[a.x-b.x,a.y-b.y,a.z-b.z], v=[c.x-b.x,c.y-b.y,c.z-b.z];
  const den=Math.hypot(...u)*Math.hypot(...v);
  if (den<1e-8) return 0;
  return clamp(Math.PI-Math.acos(clamp(u.reduce((s,x,i)=>s+x*v[i],0)/den,-1,1)),0,1.7);
}
export function smoothingAlpha(smoothing, dt) {
  return 1-Math.exp(-clamp(dt,0,0.1)* (5+55*(1-clamp(smoothing,0,0.95))));
}
export function safeTracking(result, now, maxAge=500) {
  return !!result && now-result.time>=0 && now-result.time<maxAge;
}
