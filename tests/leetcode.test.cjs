const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const P=require('../extension/protocol.js');
const C=require('../web/core.js');
const problems=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../extension/problems.json')));
const catalog=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../curriculum.json')));
test('extension only trusts the exact study-coach path on the user origin',()=>{
 assert.ok(P.trustedPage('https://taskii-lei.github.io/study-coach/#today'));
 for(const url of ['https://evil.example/study-coach/','https://taskii-lei.github.io.evil.example/study-coach/','http://taskii-lei.github.io/study-coach/','https://taskii-lei.github.io/other/'])assert.equal(P.trustedPage(url),false);
});
test('requests are constrained to the Hot 100 allowlist and a bounded code payload',()=>{
 assert.equal(Object.keys(problems).length,100);
 assert.equal(P.request({requestId:'job-1',problemId:'lc-1',code:'print(1)'},problems).slug,'two-sum');
 for(const problemId of ['code-01','__proto__','lc-999999'])assert.throws(()=>P.request({requestId:'x',problemId,code:'x'},problems));
 assert.throws(()=>P.request({requestId:'x',problemId:'lc-1',code:''},problems));
});
test('official result states are distinct and unknown states never become Accepted',()=>{
 const expected={10:'accepted',11:'wrong_answer',12:'memory_limit',13:'output_limit',14:'time_limit',15:'runtime_error',16:'internal_error',20:'compile_error'};
 for(const [code,status]of Object.entries(expected))assert.equal(P.result({status_code:Number(code)},'123','1').status,status);
 assert.throws(()=>P.result({status_code:999},'123','1'));
 const result=P.result({status_code:11,total_correct:2,total_testcases:50,last_testcase:'[3,3]\n6',expected_output:'[0,1]',code_output:[0,0]},'123','1');
 assert.equal(result.actual,'[0,0]');assert.equal(result.passed,2);assert.equal(result.submissionUrl,'https://leetcode.cn/submissions/detail/123/');
});
test('saved official feedback survives backup import, while unsafe links are discarded',()=>{
 const state=C.emptyState();state.submissions.push({id:'lc-1',at:'2026-11-19T12:00:00Z',answer:'x',reflection:'',result:P.result({status_code:10,total_correct:50,total_testcases:50},'123','1')});
 state.leetcode={username:'example',roundStart:'2026-11-19',accepted:{'lc-1':{submissionId:'123',submitTime:1795089600}}};
 const restored=C.importState(JSON.parse(JSON.stringify(state)),catalog);
 assert.equal(restored.submissions[0].result.status,'accepted');assert.equal(restored.leetcode.username,'example');
 state.submissions[0].result.submissionUrl='javascript:alert(1)';assert.equal(C.importState(state,catalog).submissions[0].result.submissionUrl,undefined);
});
test('all Hot 100 get callable templates and stateful designs get their required methods',()=>{
 const callbacks={},window={LEETCODE_PROBLEMS:problems,addEventListener:(n,cb)=>callbacks[n]=cb,postMessage:()=>{}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../web/leetcode.js'),'utf8'),{window,location:{origin:'https://taskii-lei.github.io'},setInterval:()=>0,setTimeout:()=>0,clearInterval:()=>{},clearTimeout:()=>{},crypto:{randomUUID:()=> 'r'}});
 for(const id of Object.keys(problems))assert.match(window.LeetCodeClient.starter(id),/class /);
 assert.match(window.LeetCodeClient.starter('lc-146'),/def put\(self, key, value\)/);
 assert.match(window.LeetCodeClient.starter('lc-208'),/def startsWith/);
});
async function backgroundScenario({status=10,deny=false}={}){
 const storage={},calls=[],messages=[];let receiver;
 const chrome={runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,onMessage:{addListener:fn=>{receiver=fn;}}},storage:{session:{get:async k=>({[k]:storage[k]}),set:async values=>Object.assign(storage,values),remove:async k=>{delete storage[k];}}},tabs:{get:async()=>({id:7,url:'https://leetcode.cn/problemset/',status:'complete'}),create:async()=>({id:7,url:'https://leetcode.cn/problemset/',status:'complete'}),sendMessage:async(_,m)=>messages.push(m),onUpdated:{addListener(){},removeListener(){}}},action:{onClicked:{addListener(){}}}};
 const fetch=async(url,options={})=>{
  if(url.startsWith('chrome-extension:'))return {json:async()=>problems};
  calls.push({url,options});
  if(deny)return {status:401,ok:false};
  let data;
  if(url==='/graphql/')data={data:{question:{questionId:'1',questionFrontendId:'1',titleSlug:'two-sum'}}};
  else if(url.endsWith('/submit/'))data={submission_id:123};
  else if(url.includes('/check/'))data={state:'SUCCESS',status_code:status,total_correct:status===10?50:2,total_testcases:50,status_runtime:'1 ms',status_memory:'40 MB',last_testcase:'[3,3]\n6',expected_output:'[0,1]',code_output:'[0,0]'};
  else if(url==='/graphql/noj-go/')data={data:{recentACSubmissions:[]}};
  else throw Error('Unexpected URL '+url);
  return {ok:true,status:200,json:async()=>data};
 };
 chrome.scripting={executeScript:async({world,func,args})=>{assert.equal(world,'MAIN');return [{result:await func(...args)}];}};
 const context={chrome,LeetCodeProtocol:P,importScripts(){},fetch,URL,AbortController,DOMException,location:{origin:'https://leetcode.cn'},document:{cookie:'csrftoken=test-only'},setTimeout,clearTimeout,Map,Date,console};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../extension/background.js'),'utf8'),context);
 const send=message=>new Promise(resolve=>receiver({source:'xunxu-app',protocol:1,...message},{id:'test-extension',url:'https://taskii-lei.github.io/study-coach/',tab:{id:3}},resolve));
 return {send,calls,messages,storage};
}
test('extension submits the saved code to the official endpoint and polls its verdict',async()=>{
 const env=await backgroundScenario();const response=await env.send({action:'submit',requestId:'real-flow',problemId:'lc-1',code:'class Solution: pass'});
 assert.equal(response.ok,true);assert.equal(response.result.status,'accepted');
 const sent=env.calls.find(c=>c.url.endsWith('/submit/'));assert.equal(JSON.parse(sent.options.body).typed_code,'class Solution: pass');assert.equal(sent.options.credentials,'same-origin');
 assert.equal(sent.options.headers['x-csrftoken'],'test-only');assert.ok(env.calls.some(c=>c.url.endsWith('/123/check/')));
 const again=await env.send({action:'submit',requestId:'real-flow',problemId:'lc-1',code:'class Solution: pass'});assert.equal(again.result.status,'accepted');assert.equal(env.calls.filter(c=>c.url.endsWith('/submit/')).length,1);
 assert.equal(JSON.stringify(response).includes('test-only'),false);
});
test('official wrong answers and logged-out sessions cannot turn into a pass',async()=>{
 const wrong=await backgroundScenario({status:11});const wa=await wrong.send({action:'submit',requestId:'wa',problemId:'lc-1',code:'pass'});assert.equal(wa.result.status,'wrong_answer');assert.equal(wa.result.input,'[3,3]\n6');
 const denied=await backgroundScenario({deny:true});const no=await denied.send({action:'submit',requestId:'no-login',problemId:'lc-1',code:'pass'});assert.equal(no.ok,false);assert.equal(no.error.code,'login_required');assert.equal(denied.calls.some(c=>c.url.endsWith('/submit/')),false);
});
test('old-project recent-AC synchronization preserves empty results as unknown rather than failure',async()=>{
 const env=await backgroundScenario();const response=await env.send({action:'sync',requestId:'sync',username:'example'});
 assert.equal(response.ok,true);assert.equal(response.result.submissions.length,0);assert.ok(env.calls[0].options.body.includes('recentACSubmissions'));
});
