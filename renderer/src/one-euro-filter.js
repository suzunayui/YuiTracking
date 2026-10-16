/**
 * Adapted from Gery Casiez's One Euro Filter JavaScript implementation.
 * https://github.com/casiez/OneEuroFilter/blob/main/javascript/OneEuroFilter.js
 * Copyright 2019 Inria
 *
 * BSD 3-Clause License
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
import {Quaternion,Vector3} from 'three';

// Timestamps are camera observation times in milliseconds, never render ticks.
// Estimate velocity from consecutive inputs (not the lagging output). Smooth
// signed velocity first so alternating noise does not look like deliberate speed.
// Exact exponential low-pass step keeps the response consistent when the
// camera observation interval changes; the cutoff still adapts via 1€ speed.
const alpha=(cutoff,dt)=>-Math.expm1(-2*Math.PI*cutoff*dt);
export class OneEuroFilter {
 constructor({minCutoff=.8,beta=8,derivativeCutoff=1}={}){
  this.minCutoff=minCutoff;this.beta=beta;this.derivativeCutoff=derivativeCutoff;this.reset();
 }
 reset(){this.time=null;this.raw=0;this.value=0;this.velocity=0;}
 update(raw,time){
  if(!Number.isFinite(raw)||!Number.isFinite(time))return this.value;
  if(this.time!==null&&time<=this.time)return this.value;
  if(this.time===null||time-this.time>500){this.raw=raw;this.value=raw;this.velocity=0;this.time=time;return this.value;}
  const dt=(time-this.time)/1000;this.time=time;
  const speed=(raw-this.raw)/dt;this.raw=raw;
  this.velocity+=(speed-this.velocity)*alpha(this.derivativeCutoff,dt);
  this.value+=(raw-this.value)*alpha(this.minCutoff+this.beta*Math.abs(this.velocity),dt);
  return this.value;
 }
}

// Filter rotation on the unit sphere, avoiding Euler wrap and independent
// component filtering. The angular velocity vector is in fixed/world axes.
export class QuaternionOneEuroFilter {
 constructor({minCutoff=1,beta=6,derivativeCutoff=1}={}){
  this.minCutoff=minCutoff;this.beta=beta;this.derivativeCutoff=derivativeCutoff;
  this.value=new Quaternion();this.raw=new Quaternion();this.delta=new Quaternion();
  this.velocity=new Vector3();this.step=new Vector3();this.reset();
 }
 reset(){this.time=null;this.value.identity();this.raw.identity();this.velocity.set(0,0,0);}
 update(raw,time){
  if(!raw||!Number.isFinite(time)||![raw.x,raw.y,raw.z,raw.w].every(Number.isFinite)||raw.lengthSq()<1e-12)return this.value.clone();
  if(this.time!==null&&time<=this.time)return this.value.clone();
  if(this.time===null||time-this.time>500){this.raw.copy(raw).normalize();this.value.copy(this.raw);this.velocity.set(0,0,0);this.time=time;return this.value.clone();}
  const dt=(time-this.time)/1000;this.time=time;
  this.delta.copy(this.raw).invert().premultiply(raw).normalize();
  // q and -q are the same orientation. Always take the shortest arc.
  if(this.delta.w<0)this.delta.set(-this.delta.x,-this.delta.y,-this.delta.z,-this.delta.w);
  const sinHalf=Math.hypot(this.delta.x,this.delta.y,this.delta.z);
  const scale=sinHalf>1e-9?2*Math.atan2(sinHalf,this.delta.w)/(sinHalf*dt):2/dt;
  this.step.set(this.delta.x,this.delta.y,this.delta.z).multiplyScalar(scale);
  this.velocity.lerp(this.step,alpha(this.derivativeCutoff,dt));
  this.raw.copy(raw).normalize();
  this.value.slerp(this.raw,alpha(this.minCutoff+this.beta*this.velocity.length(),dt)).normalize();
  return this.value.clone();
 }
}
