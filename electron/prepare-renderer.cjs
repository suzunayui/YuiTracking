const {execFileSync}=require('node:child_process');
const path=require('node:path');
execFileSync(process.execPath,['build.mjs'],{cwd:path.resolve(__dirname,'../renderer'),env:{...process.env,YUI_RENDERER_OUT:path.join(__dirname,'renderer')},stdio:'inherit'});
