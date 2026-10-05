import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LandmarkFilter} from '../src/landmark-filter.js';
const points=x=>[{x,y:0,z:0}];
test('stationary noise holds a stable position without accumulating drift',()=>{
 const filter=new LandmarkFilter(.004);filter.update(points(.5),0);
 for(let i=1;i<30;i++)assert.equal(filter.update(points(.5+(i%2?.003:-.003)),i*50)[0].x,.5);
});
test('intentional movement remains responsive and reacquisition resets old positions',()=>{
 const filter=new LandmarkFilter(.004);filter.update(points(.5),0);
 assert.ok(filter.update(points(.65),50)[0].x>.64);
 filter.update([],100);assert.equal(filter.update(points(.2),150)[0].x,.2);
 assert.equal(filter.update(points(.8),800)[0].x,.8);
});
