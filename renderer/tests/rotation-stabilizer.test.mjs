import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Quaternion} from 'three';
import {RotationStabilizer} from '../src/rotation-stabilizer.js';
const rotation=(x,y=0,z=0)=>new Quaternion().setFromEuler(new Euler(x,y,z,'YXZ'));
test('stationary head noise stays still and deliberate turns remain responsive',()=>{
 const filter=new RotationStabilizer();
 for(let i=0;i<50;i++)assert.ok(filter.update(rotation((i%2?1:-1)*.008,.009,-.006),i*60).angleTo(new Quaternion())<1e-7);
 assert.ok(filter.update(rotation(.3,-.4,.2),3100).angleTo(rotation(.3,-.4,.2))<.06);
});
test('small noise is held around a turned head and render ticks do not refilter',()=>{
 const filter=new RotationStabilizer();
 for(let i=0;i<80;i++)filter.update(rotation(.3,.4,.1),i*60);
 const held=filter.update(rotation(.3,.4,.1),4800);
 for(let i=1;i<30;i++)assert.ok(filter.update(rotation(.3+(i%2?1:-1)*.003,.4,.1),4800+i*60).angleTo(held)<1e-6);
 assert.deepEqual(filter.update(rotation(-.4),6540),filter.update(rotation(.6),6540));
 filter.reset();assert.ok(filter.update(rotation(0),7000).angleTo(new Quaternion())<1e-7);
});
test('slow intentional head movement accumulates beyond the hold region',()=>{
 const filter=new RotationStabilizer();
 for(let i=0;i<=40;i++)filter.update(rotation(i*.002),i*60);
 assert.ok(filter.value.angleTo(new Quaternion())>.04);
});
