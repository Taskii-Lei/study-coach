(function(root){
 'use strict';
 function trustedPage(url){try{const u=new URL(url);return u.origin==='https://taskii-lei.github.io'&&(u.pathname==='/study-coach/'||u.pathname.startsWith('/study-coach/'));}catch{return false;}}
 function request(data,problems){
  if(!data||typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(data.requestId))throw Error('请求编号无效');
  if(!Object.hasOwn(problems,data.problemId))throw Error('仅支持已配置的 Hot 100 题目');
  if(typeof data.code!=='string'||!data.code.trim()||data.code.length>300000)throw Error('代码为空或过长');
  return {requestId:data.requestId,problemId:data.problemId,code:data.code,slug:problems[data.problemId].slug};
 }
 function result(raw,id,questionId){
  if(!raw||typeof raw!=='object')throw Error('力扣返回了无效结果');
  const code=Number(raw.status_code);
  const statuses={10:'accepted',11:'wrong_answer',12:'memory_limit',13:'output_limit',14:'time_limit',15:'runtime_error',16:'internal_error',20:'compile_error'};
  if(!Object.hasOwn(statuses,code))throw Error('力扣返回未知判题状态，请查看官方提交记录');
  const number=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
  const string=x=>x==null?'':(typeof x==='object'?JSON.stringify(x):String(x)).slice(0,8000);
  return {provider:'leetcode',status:statuses[code],submissionId:String(id),questionId:String(questionId),submissionUrl:`https://leetcode.cn/submissions/detail/${id}/`,passed:number(raw.total_correct),total:number(raw.total_testcases),runtime:string(raw.status_runtime),memory:string(raw.status_memory),input:string(raw.last_testcase),expected:string(raw.expected_output),actual:string(raw.code_output),error:string(raw.full_runtime_error || raw.runtime_error || raw.full_compile_error || raw.compile_error),officialMessage:string(raw.status_msg),receivedAt:new Date().toISOString()};
 }
 const api={trustedPage,request,result};if(typeof module!=='undefined')module.exports=api;else root.LeetCodeProtocol=api;
})(typeof self==='undefined'?globalThis:self);
