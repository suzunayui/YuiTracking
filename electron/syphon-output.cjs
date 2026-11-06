const WIDTH=1280,HEIGHT=720,BYTES=WIDTH*HEIGHT*4;
// Only avatar-canvas pixels enter this sender. Never capture a window or screen.
class SyphonOutput {
 constructor(createSender,onError,now=()=>performance.now()){
  this.createSender=createSender;this.onError=onError;this.now=now;this.sender=null;this.timer=null;this.last=null;this.privacy=false;this.loading=false;this.receivedAt=0;
  this.transparent=Buffer.alloc(BYTES);
 }
 start(){if(this.sender)return;try{this.sender=this.createSender('YuiTracking',WIDTH,HEIGHT);this.tick();this.timer=setInterval(()=>this.tick(),1000/60);}catch(error){this.stop();throw error;}}
 accept(data){
  if(!this.sender)return false;
  if(!(data instanceof ArrayBuffer)||data.byteLength!==BYTES)throw new Error('Invalid avatar frame');
  if(this.privacy||this.loading)return false;
  const buffer=Buffer.from(data);
  // Canvas RGBA -> native BGRA, top-down. Swap once, without a vertical flip.
  for(let i=0;i<BYTES;i+=4){const red=buffer[i];buffer[i]=buffer[i+2];buffer[i+2]=red;}
  this.last=buffer;this.receivedAt=this.now();return true;
 }
 setPrivacy(value){this.privacy=!!value;this.last=null;this.tick();}
 setLoading(value){this.loading=!!value;this.last=null;this.tick();}
 frame(){if(this.privacy||this.loading)return this.transparent;return this.last&&this.now()-this.receivedAt<700?this.last:this.transparent;}
 tick(){if(!this.sender)return;try{this.sender.sendRgbaBuffer(this.frame(),WIDTH,HEIGHT);}catch(error){this.stop();this.onError(error);}}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;const sender=this.sender;this.sender=null;this.last=null;if(sender){try{sender.sendRgbaBuffer(this.transparent,WIDTH,HEIGHT);}finally{sender.stop();}}}
}
module.exports={SyphonOutput,WIDTH,HEIGHT,BYTES};
