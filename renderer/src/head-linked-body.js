import {Quaternion,Vector3,Euler} from 'three';

// Independent implementation inspired by head-driven body motion in VTubing
// tools. Reuse the filtered head; do not add another filter or motion gate.
export function linkedBodyRotation(headRotation,lean=0,basis=new Quaternion(),strength=1){
 const body=new Quaternion().slerp(headRotation,.2);
 // Add only yaw in world space: a pure head turn drives 30% body rotation,
 // while pitch/roll and the separate depth-driven lean keep their response.
 const worldHead=basis.clone().multiply(headRotation).multiply(basis.clone().invert());
 const yaw=new Euler().setFromQuaternion(worldHead,'YXZ').y;
 const extraYaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw*.1);
 body.premultiply(basis.clone().invert().multiply(extraYaw).multiply(basis));
 // Scale world yaw only; preserve pitch/roll and depth-driven lean.
 const gain=Number.isFinite(strength)?Math.max(0,Math.min(15,strength)):1;
 if(gain!==1){
  const worldBody=basis.clone().multiply(body).multiply(basis.clone().invert());
  const bodyYaw=new Euler().setFromQuaternion(worldBody,'YXZ').y;
  const adjustment=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.max(-Math.PI,Math.min(Math.PI,bodyYaw*gain))-bodyYaw);
  body.premultiply(basis.clone().invert().multiply(adjustment).multiply(basis));
 }
 if(lean===0)return body;
 // Positive world X bends the upper body toward the default camera (+Z).
 const pitch=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),lean);
 return basis.clone().invert().multiply(pitch).multiply(basis).multiply(body);
}

export function headRotationInRoot(head,root){
 return root.getWorldQuaternion(new Quaternion()).invert().multiply(head.getWorldQuaternion(new Quaternion()));
}

// Keep the same displayed head direction while its torso parent moves.
// Smooth in root space so torso motion does not get added to head rotation.
export function applyLinkedHeadRotation(head,root,previous,target,alpha){
 const desired=previous.clone().slerp(target,alpha);
 const world=root.getWorldQuaternion(new Quaternion()).multiply(desired);
 const parent=head.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();
 head.quaternion.copy(parent.invert().multiply(world));
}
