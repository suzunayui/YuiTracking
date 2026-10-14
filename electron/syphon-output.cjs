const WIDTH=1280,HEIGHT=720,BYTES=WIDTH*HEIGHT*4;
// Only avatar-canvas pixels enter this sender. Never capture a window or screen.
class SyphonOutput {
 constructor(createSender,onError,now=()=>performance.now()){
  this.createSender=createSender;this.onError=onError;this.now=now;this.sender=null;this.timer=null;this.last=null;this.privacy=false;this.loading=false;this.receivedAt=0;
  this.setSize(WIDTH,HEIGHT);
 }
 setSize(width,height){
  if(this.sender)throw new Error('出力を停止してから解像度を変更してください。');
  if(![[848,480],[1280,720],[1920,1080]].some(([w,h])=>w===width&&h===height))throw new Error('Unsupported output resolution');
  this.width=width;this.height=height;this.bytes=width*height*4;this.last=null;this.standby=Buffer.alloc(this.bytes);
  const scale=height/720;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const p=(y*width+x)*4,bar=Math.abs(y-height/2)<48*scale&&(Math.abs(x-width/2-20*scale)<10*scale||Math.abs(x-width/2+20*scale)<10*scale);
   this.standby[p]=bar?0xc0:0x2e;this.standby[p+1]=bar?0xe2:0x1b;this.standby[p+2]=bar?0x82:0x17;this.standby[p+3]=255;
  }
 }
 start(){if(this.sender)return;try{this.sender=this.createSender('YuiTracking',this.width,this.height);this.tick();this.timer=setInterval(()=>this.tick(),1000/60);}catch(error){this.stop();throw error;}}
 accept(data){
  if(!this.sender)return false;
  if(!(data instanceof ArrayBuffer)||data.byteLength!==this.bytes)throw new Error('Invalid avatar frame');
  if(this.privacy||this.loading)return false;
  const buffer=Buffer.from(data);
  // Canvas RGBA -> native BGRA, top-down. Swap once, without a vertical flip.
  for(let i=0;i<this.bytes;i+=4){const red=buffer[i];buffer[i]=buffer[i+2];buffer[i+2]=red;}
  this.last=buffer;this.receivedAt=this.now();return true;
 }
 setPrivacy(value){this.privacy=!!value;this.last=null;this.tick();}
 setLoading(value){this.loading=!!value;this.last=null;this.tick();}
 tick(){if(!this.sender)return;try{this.sender.sendRgbaBuffer(!this.privacy&&!this.loading&&this.last&&this.now()-this.receivedAt<700?this.last:this.standby,this.width,this.height);}catch(error){this.stop();this.onError(error);}}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;const sender=this.sender;this.sender=null;this.last=null;if(sender){try{sender.sendRgbaBuffer(this.standby,this.width,this.height);}finally{sender.stop();}}}
}
module.exports={SyphonOutput,WIDTH,HEIGHT,BYTES};
