import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const scheduler=source.slice(source.indexOf('let loopHandle,loopTimer=false;'),source.indexOf('function loop(now)'));

test('camera tracking keeps a timer loop when output is off and preview is hidden',()=>{
 const calls=[];
 const context={
  output:false,tracking:false,lastRender:0,loop(){},
  performance:{now:()=>100},
  setTimeout:()=>{calls.push('timer');return 2;},
  requestAnimationFrame:()=>{calls.push('animation');return 1;},
  clearTimeout:()=>calls.push('cancelTimer'),
  cancelAnimationFrame:()=>calls.push('cancelAnimation'),
 };
 runInNewContext(scheduler,context);
 context.scheduleLoop();
 assert.deepEqual(calls,['animation']);
 context.tracking=true;context.restartRenderLoop();
 assert.deepEqual(calls.slice(-2),['cancelAnimation','timer']);
 context.output=true;context.tracking=false;context.restartRenderLoop();
 assert.deepEqual(calls.slice(-2),['cancelTimer','timer']);
 context.output=false;context.restartRenderLoop();
 assert.deepEqual(calls.slice(-2),['cancelTimer','animation']);
});
