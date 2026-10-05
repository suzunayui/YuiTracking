import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..');
if(process.argv.includes('--prepare')){
 const source=await fs.readFile(path.join(root,'renderer/src/main.js'),'utf8');
 await build({stdin:{contents:source+`
 window.yuiPerf={start:async()=>{await startTracking();if(!tracking)throw new Error('Tracking test failed');output=true;restartRenderLoop();},stop:()=>{output=false;restartRenderLoop();stopTracking();},stats:()=>({...perfStats})};
 `,resolveDir:path.join(root,'renderer/src')},bundle:true,format:'esm',outfile:path.join(root,'.tools/transport-smoke/Assets/Renderer/main.js')});
 console.log('Prepared isolated native performance test');
}else{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9229');
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('holotrack.local'));
 if(!page)throw new Error('Native WebView2 test page not found');
 await page.waitForFunction(()=>window.yuiPerf,null,{polling:100});
 await page.waitForTimeout(3000);
 await page.evaluate(()=>window.yuiPerf.start());
 await page.waitForTimeout(4000);
 const samples=[];
 for(let i=0;i<3;i++){await page.waitForTimeout(3100);samples.push(await page.evaluate(()=>window.yuiPerf.stats()));}
 console.log(JSON.stringify(samples,null,2));
 await fs.writeFile(path.join(root,'artifacts/'+(process.argv[2]||'native-perf')+'.json'),JSON.stringify(samples,null,2));
 await page.evaluate(()=>window.yuiPerf.stop());
 await browser.close();
}
