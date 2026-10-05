const WIDTH=1280,HEIGHT=720,BYTES=WIDTH*HEIGHT*4;
// Only avatar-canvas pixels enter this sender. Never capture a window or screen.
class SyphonOutput {
 constructor(createSender,onError,now=()=>performance.now()){
  this.createSender=createSender;this.onError=onError;this.now=now;this.sender=null;this.timer=null;this.last=null;this.privacy=false;this.loading=false;this.receivedAt=0;
  this.standby=Buffer.alloc(BYTES);
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
   const p=(y*WIDTH+x)*4,bar=y>=312&&y<408&&((x>=610&&x<630)||(x>=650&&x<670));
   this.standby[p]=bar?0xc0:0x2e;this.standby[p+1]=bar?0xe2:0x1b;this.standby[p+2]=bar?0x82:0x17;this.standby[p+3]=255;
  }
 }
 start(){if(this.sender)return;try{this.sender=this.createSender('YuiTracking',WIDTH,HEIGHT);this.tick();this.timer=setInterval(()=>this.tick(),1000/60);}catch(error){this.stop();throw error;}}
 accept(data){
  if(!this.sender)return false;
  if(!(data instanceof ArrayBuffer)||data.byteLength!==BYTES)throw new Error('Invalid avatar frame');
  if(this.privacy||this.loading)return false;
  const buffer=Buffer.from(data);
  // Canvas RGBA -> native BGRA, top-down. Swap once, without a vertical flip.
  for(let i=0;i<BYTES;i+=4){const red=buffer[i];buffer[i]=buffer[i+2];buffer[i+2]=red;buffer[i+3]=255;}
  this.last=buffer;this.receivedAt=this.now();return true;
 }
 setPrivacy(value){this.privacy=!!value;this.last=null;this.tick();}
 setLoading(value){this.loading=!!value;this.last=null;this.tick();}
 tick(){if(!this.sender)return;try{this.sender.sendRgbaBuffer(!this.privacy&&!this.loading&&this.last&&this.now()-this.receivedAt<700?this.last:this.standby,WIDTH,HEIGHT);}catch(error){this.stop();this.onError(error);}}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;const sender=this.sender;this.sender=null;this.last=null;if(sender){try{sender.sendRgbaBuffer(this.standby,WIDTH,HEIGHT);}finally{sender.stop();}}}
}
module.exports={SyphonOutput,WIDTH,HEIGHT,BYTES};
