import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TrackingPresence} from '../src/tracking-presence.js';

test('brief loss keeps tracking pose and sustained loss enters idle after 1.5 seconds',()=>{
 const state=new TrackingPresence();
 assert.equal(state.isAway(true,100,100),false);
 assert.equal(state.isAway(false,200,1000),false);
 assert.equal(state.isAway(false,1500,1599),false);
 assert.equal(state.isAway(false,1600,1600),true);
 assert.equal(state.isAway(true,1650,1650),false,'New face observation immediately resumes tracking');
 assert.equal(state.isAway(false,1700,3100),false);
 assert.equal(state.isAway(false,1700,3150),true);
});

test('a frozen recognition result cannot keep presence alive on render ticks',()=>{
 const state=new TrackingPresence();
 state.isAway(true,0,0);
 for(let now=100;now<1500;now+=100)assert.equal(state.isAway(true,0,now),false);
 assert.equal(state.isAway(true,0,1500),true);
 assert.equal(state.isAway(true,2000,1600),true,'Future timestamps cannot establish presence');
 assert.equal(state.isAway(true,NaN,1700),true);
});

test('starting without a face has a grace period and reset clears previous presence',()=>{
 const state=new TrackingPresence();
 assert.equal(state.isAway(false,undefined,10000),false);
 assert.equal(state.isAway(false,undefined,11499),false);
 assert.equal(state.isAway(false,undefined,11500),true);
 state.reset();assert.equal(state.isAway(false,undefined,20000),false);
});
