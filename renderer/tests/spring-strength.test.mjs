import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SpringStrength} from '../src/spring-strength.js';
test('stronger springs retain more motion; adjustment does not accumulate and restores authored settings',()=>{
 const joint={settings:{stiffness:2,dragForce:.4,hitRadius:.03,gravityPower:.1}};
 const control=new SpringStrength({joints:[joint]});
 control.setStrength(3);const strong={...joint.settings};
 assert.ok(strong.stiffness<2&&strong.dragForce<.4);
 control.setStrength(3);assert.deepEqual(joint.settings,strong);
 assert.equal(joint.settings.hitRadius,.03);assert.equal(joint.settings.gravityPower,.1);
 control.setStrength(.3);assert.ok(joint.settings.stiffness>2&&joint.settings.dragForce>.4);
 control.setStrength(1);assert.deepEqual(joint.settings,{stiffness:2,dragForce:.4,hitRadius:.03,gravityPower:.1});
});
