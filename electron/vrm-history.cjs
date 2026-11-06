const crypto=require('node:crypto');
const MAX_ENTRIES=24,MAX_THUMBNAIL_BYTES=2*1024*1024;
const PNG_PREFIX='data:image/png;base64,';

function list(value){return Array.isArray(value)?value.filter(item=>typeof item==='string'):[];}
function withUsed(history,file){return [file,...list(history).filter(item=>item!==file)].slice(0,MAX_ENTRIES);}
function without(history,file){return list(history).filter(item=>item!==file);}
function thumbnailName(file){return crypto.createHash('sha256').update(file,'utf8').digest('hex')+'.png';}

// Only accepts the PNG data URL the renderer produces.
function decodeThumbnail(dataUrl){
 if(typeof dataUrl!=='string'||!dataUrl.startsWith(PNG_PREFIX)||dataUrl.length>MAX_THUMBNAIL_BYTES*4/3+PNG_PREFIX.length)return null;
 const encoded=dataUrl.slice(PNG_PREFIX.length);
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return null;
 const bytes=Buffer.from(encoded,'base64');
 return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47?bytes:null;
}
function encodeThumbnail(bytes){return PNG_PREFIX+bytes.toString('base64');}

module.exports={MAX_ENTRIES,withUsed,without,thumbnailName,decodeThumbnail,encodeThumbnail};
