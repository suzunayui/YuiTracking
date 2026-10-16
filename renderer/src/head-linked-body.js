import {Quaternion,Vector3} from 'three';

// Independent implementation inspired by head-driven body motion in VTubing
// tools. Reuse the filtered head; do not add another filter or motion gate.
export function linkedBodyRotation(headRotation,lean=0,basis=new Quaternion()){
 const body=new Quaternion().slerp(headRotation,.2);
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
