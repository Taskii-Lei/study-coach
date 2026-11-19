(function(root){
 'use strict';
 const pending=new Map(),listeners=new Set();let connected=false,version='';
 function announce(){window.postMessage({source:'xunxu-app',protocol:1,action:'hello'},location.origin);}
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.source!=='xunxu-extension'||event.data.protocol!==1)return;
  const msg=event.data;
  if(msg.type==='connected'){connected=true;version=String(msg.version||'');for(const cb of listeners)cb(true);return;}
  const task=pending.get(msg.requestId);if(!task)return;
  if(msg.type==='progress'){task.progress(msg);return;}
  if(msg.type==='response'){clearTimeout(task.timer);pending.delete(msg.requestId);msg.ok?task.resolve(msg.result):task.reject(msg.error || {message:'扩展连接失败'});}
 });
 function request(action,payload={},onProgress=()=>{}){
  const requestId=crypto.randomUUID();let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  if(!connected){reject({code:'not_connected',message:'请在 Chrome／Edge 中安装并连接力扣扩展。'});return {promise,cancel:()=>{}};}
  const timer=setTimeout(()=>{pending.delete(requestId);reject({code:'connection_timeout',message:'扩展连接超时；若代码已经提交，请先查看力扣提交记录。'});},270000);
  pending.set(requestId,{resolve,reject,progress:onProgress,timer});
  window.postMessage({source:'xunxu-app',protocol:1,action,requestId,...payload},location.origin);
  return {promise,cancel:()=>window.postMessage({source:'xunxu-app',protocol:1,action:'cancel',requestId:crypto.randomUUID(),targetRequestId:requestId},location.origin)};
 }
 function starter(id){const s=root.LEETCODE_PROBLEMS[id];if(!s)return null;
  const methods={LRUCache:[['__init__','capacity'],['get','key'],['put','key, value']],Trie:[['__init__',''],['insert','word'],['search','word'],['startsWith','prefix']],MinStack:[['__init__',''],['push','val'],['pop',''],['top',''],['getMin','']],MedianFinder:[['__init__',''],['addNum','num'],['findMedian','']]};
  if(s.kind==='design')return 'class '+s.method+':\n'+methods[s.method].map(([name,args])=>`    def ${name}(self${args?', '+args:''}):\n        pass\n`).join('\n');
  return `class Solution:\n    def ${s.method}(self${s.params?', '+s.params:''}):\n        # 完成后提交到力扣官方判题\n        pass\n`;
 }
 root.LeetCodeClient={get connected(){return connected;},get version(){return version;},request,starter,onConnection:cb=>listeners.add(cb),announce};
 announce();const poll=setInterval(()=>{if(connected)clearInterval(poll);else announce();},2000);setTimeout(()=>clearInterval(poll),30000);
})(window);
