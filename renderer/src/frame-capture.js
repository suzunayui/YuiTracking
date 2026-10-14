// Read the already rendered avatar canvas without allocating ImageData each frame.
// WebGL rows are bottom-up; both host transports expect top-down RGBA bytes.
export class FrameCapture {
 constructor(renderer,width,height){
  this.renderer=renderer;this.target=null;this.gl=renderer.getContext();this.width=width;this.height=height;
  this.raw=new Uint8Array(width*height*4);this.pixels=new Uint8Array(this.raw.length);
  const stride=width*4;
  this.rows=Array.from({length:height},(_,y)=>this.raw.subarray(y*stride,(y+1)*stride));
 }
 read(){
  const gl=this.gl;
  if(this.target)this.renderer.readRenderTargetPixels(this.target,0,0,this.width,this.height,this.raw);
  else gl.readPixels(0,0,this.width,this.height,gl.RGBA,gl.UNSIGNED_BYTE,this.raw);
  const stride=this.width*4;
  for(let y=0;y<this.height;y++)this.pixels.set(this.rows[y],(this.height-y-1)*stride);
  return this.pixels;
 }
}
