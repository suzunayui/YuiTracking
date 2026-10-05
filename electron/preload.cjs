const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('yuiHost',{
 postMessage:message=>ipcRenderer.send('renderer-event',message),
 addEventListener:(type,callback)=>{if(type==='message')ipcRenderer.on('command',(_event,data)=>callback({data}));}
});
contextBridge.exposeInMainWorld('yuiDesktop',{
 openModel:()=>ipcRenderer.invoke('open-model'),
 getSettings:()=>ipcRenderer.invoke('settings'),
 saveSettings:value=>ipcRenderer.invoke('save-settings',value),
 command:value=>ipcRenderer.send('ui-command',value),
 onEvent:callback=>ipcRenderer.on('renderer-event',(_event,data)=>callback(data))
});
