import {Euler,Quaternion} from 'three';
export function avatarBodyRotation(pose,basis=new Quaternion(0,1,0,0)){
 const world=new Quaternion().setFromEuler(new Euler(-pose.pitch,pose.yaw,-pose.roll,'YXZ'));
 return basis.clone().invert().multiply(world).multiply(basis);
}
const finite=p=>p&&[p.x,p.y,p.z].every(axis=>Number.isFinite(axis));
// One fixed geometric calculation. No shoulder/hip mixture, visibility branch,
// neutral subtraction or angle clamp. Reject only missing/nonfinite geometry.
export function bodyPose(points){
 const left=points?.[11],right=points?.[12],lh=points?.[23],rh=points?.[24];
 if(![left,right,lh,rh].every(finite))return null;
 const dx=right.x-left.x,dy=right.y-left.y,dz=right.z-left.z;
 const width=Math.hypot(dx,dy);if(width<Number.EPSILON)return null;
 const upY=(left.y+right.y-lh.y-rh.y)/2,upZ=(left.z+right.z-lh.z-rh.z)/2;
 return {pitch:Math.atan2(-upZ,-upY),yaw:Math.atan2(dz,width),roll:Math.atan2(dy,Math.abs(dx))};
}
