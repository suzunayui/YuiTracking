export function createRecognitionBackend(delegate='CPU',expectedRenderer=''){
 if(!['CPU','GPU'].includes(delegate))throw new Error('認識デバイスの設定が不正です。');
 if(delegate==='CPU')return {delegate};
 const canvas=new OffscreenCanvas(1,1);
 const gl=canvas.getContext('webgl2',{powerPreference:'default'});
 if(!gl)throw new Error('選択したGPUでWebGL 2を開始できません。CPUを選び直してください。');
 const debug=gl.getExtension('WEBGL_debug_renderer_info');
 const renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
 if(/swiftshader|llvmpipe|software|microsoft basic render/i.test(renderer))throw new Error('ソフトウェア描画のためGPU認識を開始できません。CPUを選び直してください。');
 if(expectedRenderer&&!renderer.toLowerCase().includes(expectedRenderer.toLowerCase()))throw new Error('指定したGPUを確認できません。実際のGPU：'+renderer);
 return {delegate,canvas,renderer};
}
