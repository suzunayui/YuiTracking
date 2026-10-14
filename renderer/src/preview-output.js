// A single WebGL context draws a window-shaped preview and a fixed-size output.
export class PreviewOutput {
 constructor(renderer,camera,standbyCamera,{width=1280,height=720,createTarget}){this.renderer=renderer;this.camera=camera;this.previewStandby=standbyCamera.clone();this.outputCamera=camera.clone();this.standbyCamera=standbyCamera;this.width=width;this.height=height;this.createTarget=createTarget;this.target=null;}
 resize(width,height){const aspect=Math.max(1,width)/Math.max(1,height),scale=Math.min(1,1280/Math.max(1,width),720/Math.max(1,height));this.renderer.setSize(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)),false);this.camera.aspect=aspect;this.camera.updateProjectionMatrix();this.previewStandby.left=-720*aspect/2;this.previewStandby.right=720*aspect/2;this.previewStandby.updateProjectionMatrix();}
 setOutputSize(width,height){this.release();this.width=width;this.height=height;}
 render(scene,standby,waiting,send){
  if(send){this.target??=this.createTarget(this.width,this.height);this.outputCamera.copy(this.camera);this.outputCamera.aspect=this.width/this.height;this.outputCamera.updateProjectionMatrix();this.renderer.setRenderTarget(this.target);this.renderer.render(waiting?standby:scene,waiting?this.standbyCamera:this.outputCamera);}
  this.renderer.setRenderTarget(null);this.renderer.render(waiting?standby:scene,waiting?this.previewStandby:this.camera);
 }
 release(){this.target?.dispose();this.target=null;}
}
