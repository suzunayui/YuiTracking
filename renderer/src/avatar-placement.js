import * as THREE from 'three';
import {VRMSpringBoneColliderShapeSphere, VRMSpringBoneColliderShapeCapsule} from '@pixiv/three-vrm';

export function placeAvatar(vrm, height=1.7) {
  const bounds=new THREE.Box3().setFromObject(vrm.scene);
  const originalHeight=bounds.max.y-bounds.min.y;
  const scale=originalHeight>0?height/originalHeight:1;
  vrm.scene.scale.setScalar(scale);
  vrm.scene.position.y=-bounds.min.y*scale;
  // Spring settings are distances in world space, not scene-local units.
  const springs=vrm.springBoneManager;
  if(springs){
    for(const joint of springs.joints){
      joint.settings.stiffness*=scale;
      joint.settings.hitRadius*=scale;
      joint.settings.gravityPower*=scale;
    }
    for(const collider of springs.colliders){
      const shape=collider.shape;
      if(shape instanceof VRMSpringBoneColliderShapeSphere)shape.radius*=scale;
      else if(shape instanceof VRMSpringBoneColliderShapeCapsule){shape.radius*=scale;shape.tail.multiplyScalar(scale);}
    }
    vrm.scene.updateMatrixWorld(true);
    springs.reset();
  }
}
