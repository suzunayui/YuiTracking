// MToon stores texture references in shader uniforms as well as material maps.
export function avatarTextures(scene){
 const textures=new Set();
 scene.traverse(object=>{
  for(const material of (Array.isArray(object.material)?object.material:[object.material])){
   if(!material)continue;
   for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
   for(const uniform of Object.values(material.uniforms??{}))if(uniform.value?.isTexture)textures.add(uniform.value);
  }
 });
 return textures;
}
