import { build } from 'esbuild';
import { mkdir, copyFile, cp, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve('../src/HoloTrack.App/Assets/Renderer');
await mkdir(out, { recursive: true });
await build({entryPoints:['src/main.js'],bundle:true,format:'esm',outfile:out+'/main.js',minify:true,sourcemap:true});
await build({entryPoints:['src/tracking-worker.js'],bundle:true,format:'iife',outfile:out+'/tracking-worker.js',minify:true,sourcemap:true});
await copyFile('index.html',out+'/index.html');
await cp('node_modules/@mediapipe/tasks-vision/wasm',out+'/wasm',{recursive:true});
for (const name of ['face_landmarker','hand_landmarker','pose_landmarker']) {
  const dest = out+'/'+name+'.task';
  try { await access(dest); } catch {
    const variant=name==='pose_landmarker'?'pose_landmarker_lite':name;
    const r = await fetch(`https://storage.googleapis.com/mediapipe-models/${name}/${variant}/float16/1/${variant}.task`);
    if (!r.ok) throw new Error(`Model download: ${r.status}`);
    await writeFile(dest,Buffer.from(await r.arrayBuffer()));
  }
}
console.log('Renderer and offline recognition models built:',out);
