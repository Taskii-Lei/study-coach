(() => {
 'use strict';
 const origin='https://taskii-lei.github.io';
 function post(data){window.postMessage({source:'xunxu-extension',protocol:1,...data},origin);}
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==origin||event.data?.source!=='xunxu-app'||event.data.protocol!==1)return;
  const message=event.data;
  if(message.action==='hello'){post({type:'connected',version:chrome.runtime.getManifest().version});return;}
  if(!['submit','cancel','sync'].includes(message.action))return;
  chrome.runtime.sendMessage(message).then(response=>post({type:'response',requestId:message.requestId,...response})).catch(error=>post({type:'response',requestId:message.requestId,ok:false,error:{code:'extension_error',message:error.message}}));
 });
 chrome.runtime.onMessage.addListener(message=>{
  if(message?.type==='progress')post(message);
 });
 post({type:'connected',version:chrome.runtime.getManifest().version});
})();
