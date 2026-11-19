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
 function failureInfo(result){
  const raw=String(result.error||result.message||''),explicit=result.errorCode||result.code;
  const code=explicit||(/401|未.*登录|先.*登录/.test(raw)?'login_required':/403|验证|拒绝/.test(raw)?'site_blocked':/context invalidated|message port|receiving end|扩展/i.test(raw)?'extension_error':/timeout|超时/i.test(raw)?'connection_timeout':'network_error');
  const entries={
   login_required:['力扣尚未登录','在同一 Chrome / Edge 中登录 leetcode.cn，再回来提交。'],
   site_blocked:['力扣拒绝了请求','打开力扣官网，检查登录状态并处理官网显示的验证或访问提示。'],
   rate_limited:['力扣请求过于频繁','稍后再试；若已有提交编号，先查看官方提交记录。'],
   extension_error:['扩展连接已中断','在扩展管理页重新加载扩展，再刷新学习网页。'],
   not_connected:['力扣扩展未连接','请在安装扩展的 Chrome / Edge 中打开学习网页。'],
   connection_timeout:['等待扩展响应超时','先检查力扣官方提交记录，确认是否已提交，再检查扩展连接。'],
   poll_timeout:['尚未取回官方判题结果','代码已经发往力扣，请先打开官方提交记录查看结果。'],
   question_error:['题目信息核对失败','查看下方具体错误；先确认这道题在力扣官网能正常打开。'],
   submit_error:['力扣未确认收到提交','先查看官方提交记录，再决定是否重试，避免重复提交。'],
   unknown_submission:['提交状态待确认','该请求曾经开始提交，请先查看力扣官方记录。'],
   busy:['已有一道题正在判题','等待当前判题结束，或停止等待后再操作。'],
   site_error:['力扣接口返回异常','查看具体错误，并检查力扣官网是否能正常访问。'],
   network_error:['未能连接力扣','在同一浏览器打开 leetcode.cn，确认网站可访问；具体原因见下方错误。']
  };
  const [title,action]=entries[code]||entries.network_error;
  return {code,title,action,detail:raw};
 }
 root.LeetCodeClient={failureInfo,get connected(){return connected;},get version(){return version;},request,starter,onConnection:cb=>listeners.add(cb),announce};
 announce();const poll=setInterval(()=>{if(connected)clearInterval(poll);else announce();},2000);setTimeout(()=>clearInterval(poll),30000);
})(window);
