import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OneEuroFilter} from '../src/vendor/one-euro-filter.js';
test('official filter matches the reference fixed-cutoff step response',()=>{
 const filter=new OneEuroFilter(10,1,0);assert.equal(filter.filter(0,0),0);
 assert.ok(Math.abs(filter.filter(1,.1)-.38586954509503757)<1e-12);
 assert.ok(Math.abs(filter.filter(1,.2)-.6228437843582239)<1e-12);
});
test('official speed adaptation follows a turn faster than a fixed cutoff',()=>{
 const adaptive=new OneEuroFilter(10,1,2),fixed=new OneEuroFilter(10,1,0);
 adaptive.filter(0,0);fixed.filter(0,0);assert.ok(adaptive.filter(.3,.1)>fixed.filter(.3,.1)+.05);
 adaptive.reset();assert.equal(adaptive.filter(.7,.2),.7);
});

test('vendored official source is unchanged at the recorded upstream revision',()=>{
 const source=readFileSync(new URL('../src/vendor/one-euro-filter.js',import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),'5c3d876a98d1592aaedb85818b4a6102dd6a0c0e9237f19d584096d8924a02a7');
});
