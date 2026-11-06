const test=require('node:test');
const assert=require('node:assert/strict');
const {MAX_ENTRIES,withUsed,without,thumbnailName,decodeThumbnail,encodeThumbnail}=require('../electron/vrm-history.cjs');

test('reopening a VRM moves it first without duplicating',()=>{
 assert.deepEqual(withUsed(['/a.vrm','/b.vrm'],'/b.vrm'),['/b.vrm','/a.vrm']);
});
test('history starts empty, ignores invalid data, and keeps a limited number of entries',()=>{
 assert.deepEqual(withUsed(undefined,'/a.vrm'),['/a.vrm']);
 assert.deepEqual(withUsed(['/a.vrm',5,null],'/b.vrm'),['/b.vrm','/a.vrm']);
 assert.equal(withUsed(Array.from({length:40},(_,i)=>`/${i}.vrm`),'/new.vrm').length,MAX_ENTRIES);
});
test('removing leaves the other entries',()=>{assert.deepEqual(without(['/a.vrm','/b.vrm'],'/a.vrm'),['/b.vrm']);});
test('thumbnail name is stable, unique per path, and safe as a file name',()=>{
 assert.equal(thumbnailName('/a/b.vrm'),thumbnailName('/a/b.vrm'));
 assert.notEqual(thumbnailName('/a/b.vrm'),thumbnailName('/a/c.vrm'));
 assert.match(thumbnailName('/../../etc/passwd'),/^[0-9a-f]{64}\.png$/);
});
test('PNG thumbnails are accepted and round trip',()=>{
 const png=Buffer.from([0x89,0x50,0x4e,0x47,13,10,26,10]);
 assert.deepEqual(decodeThumbnail(encodeThumbnail(png)),png);
});
test('other data is rejected',()=>{
 for(const value of [null,5,'data:text/html;base64,AAAA','data:image/png;base64,###','data:image/png;base64,AAAAAAAAAAA=',`data:image/png;base64,${'A'.repeat(4*1024*1024)}`])assert.equal(decodeThumbnail(value),null);
});
