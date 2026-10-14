import * as THREE from 'three';

export class AvatarBackground {
 constructor(scene){this.scene=scene;this.version=0;this.texture=null;}
 async set({color,imageUrl}){
  const version=++this.version;
  let texture=null;
  if(imageUrl){
   texture=await new THREE.TextureLoader().loadAsync(imageUrl);
   if(version!==this.version){texture.dispose();return false;}
   texture.colorSpace=THREE.SRGBColorSpace;
   const aspect=texture.image.width/texture.image.height,target=1280/720;
   if(aspect>target){texture.repeat.x=target/aspect;texture.offset.x=(1-texture.repeat.x)/2;}
   else {texture.repeat.y=aspect/target;texture.offset.y=(1-texture.repeat.y)/2;}
  }
  this.texture?.dispose();this.texture=texture;
  this.scene.background=texture??(color==='transparent'?null:new THREE.Color(color));
  return true;
 }
}
