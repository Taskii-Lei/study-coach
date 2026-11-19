importScripts('./protocol.js');
const P=LeetCodeProtocol,BASE='https://leetcode.cn',jobs=new Map();
const problems=fetch(chrome.runtime.getURL('problems.json')).then(r=>r.json());
class SiteError extends Error{constructor(code,message){super(message);this.code=code;}}
let officialTab,officialTabReady;
function officialPage(){if(!officialTabReady)officialTabReady=resolveOfficialPage().finally(()=>{officialTabReady=null;});return officialTabReady;}
async function resolveOfficialPage(){
 if(officialTab){try{const tab=await chrome.tabs.get(officialTab);if(new URL(tab.url).origin===BASE&&tab.status==='complete')return officialTab;}catch{officialTab=null;}}
 const stored=(await chrome.storage.session.get('officialTab')).officialTab;
 if(stored){try{const tab=await chrome.tabs.get(stored);if(new URL(tab.url).origin===BASE&&tab.status==='complete'){officialTab=stored;return stored;}}catch{}}
 const tab=await chrome.tabs.create({url:BASE+'/problemset/',active:false});officialTab=tab.id;
 await chrome.storage.session.set({officialTab});
 if(tab.status!=='complete')await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(new SiteError('site_blocked','力扣页面未能加载，请打开力扣官网确认登录或完成页面验证。'));},30000);
  function listener(id,change){if(id===tab.id&&change.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve();}}
  chrome.tabs.onUpdated.addListener(listener);
 });
 return officialTab;
}
async function siteFetch(path,body,signal){
 if(signal?.aborted)throw new DOMException('Stopped','AbortError');
 const tabId=await officialPage();
 const injected=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:async (path,body)=>{
  // Requests run on leetcode.cn itself: browser cookies and origin remain local.
  if(location.origin!=='https://leetcode.cn')return {error:'力扣标签页已被切换，请重试。',code:'site_error'};
  const cookie=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('csrftoken='));
  const csrf=cookie?decodeURIComponent(cookie.slice('csrftoken='.length)):'';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
   const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:{'accept':'application/json','content-type':'application/json',...(csrf?{'x-csrftoken':csrf}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
   if(response.status===401)return {error:'请先在力扣官网登录。',code:'login_required'};
   if(response.status===403)return {error:'力扣拒绝了请求，请打开官网确认登录状态或完成页面验证。',code:'site_blocked'};
   if(response.status===429)return {error:'力扣请求过于频繁，请稍后重试。',code:'rate_limited'};
   if(!response.ok)return {error:'力扣请求失败：HTTP '+response.status,code:'site_error'};
   try{return {data:await response.json()};}catch{return {error:'请打开力扣官网检查登录或验证页面。',code:'site_error'};}
  }catch(error){return {error:error.name==='AbortError'?'连接力扣超时，请检查网络。':error.message,code:'network_error'};}
  finally{clearTimeout(timer);}
 },args:[path,body]});
 if(signal?.aborted)throw new DOMException('Stopped','AbortError');
 const result=injected[0]?.result;
 if(!result)throw new SiteError('site_error','未能读取力扣页面响应');
 if(result.error)throw new SiteError(result.code,result.error);
 return result.data;
}
async function recent(message,signal){
 const username=String(message.username||'').trim();if(!/^[a-zA-Z0-9_-]{1,100}$/.test(username))throw new SiteError('invalid_user','请填写力扣个人主页中的用户名。');
 const response=await siteFetch('/graphql/noj-go/',{variables:{username},query:'query recentAcSubmissions($username: String!) { recentACSubmissions(userSlug: $username) { submissionId submitTime question { titleSlug translatedTitle } } }'},signal);
 if(response.errors)throw new SiteError('site_error','力扣同步接口返回错误，请确认用户名或稍后重试。');
 if(!Array.isArray(response.data?.recentACSubmissions))throw new SiteError('site_error','未取得有效的最近 AC 记录。');
 return {submissions:response.data.recentACSubmissions.map(s=>({submissionId:String(s.submissionId),submitTime:Number(s.submitTime),slug:String(s.question?.titleSlug||''),title:String(s.question?.translatedTitle||'')})),syncedAt:new Date().toISOString()};
}
async function submit(message,tabId){
 if(jobs.size)throw new SiteError('busy','已有一道题正在判题，请等它结束。');
 const input=P.request(message,await problems),controller=new AbortController();
 const key='job-'+input.requestId,existing=(await chrome.storage.session.get(key))[key];
 if(existing){if(existing.result)return existing.result;throw new SiteError('unknown_submission','该请求曾经开始提交，请先查看力扣提交记录，避免重复提交。');}
 if(jobs.size)throw new SiteError('busy','已有一道题正在判题，请等它结束。');
 jobs.set(input.requestId,controller);let id;
 const update=async details=>{try{await chrome.tabs.sendMessage(tabId,{type:'progress',requestId:input.requestId,...details});}catch{}};
 try{
  await update({stage:'question',message:'正在读取力扣题目接口…'});
  const question=await siteFetch('/graphql/',{query:'query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionId questionFrontendId titleSlug } }',variables:{titleSlug:input.slug}},controller.signal);
  const info=question.data?.question;
  if(!info||String(info.questionFrontendId)!==input.problemId.slice(3))throw new SiteError('question_error','力扣题目信息与当前题目不匹配，已停止提交。');
  await chrome.storage.session.set({[key]:{state:'sending',problemId:input.problemId,startedAt:Date.now()}});
  await update({stage:'submitting',message:'正在提交到力扣官方判题…'});
  const response=await siteFetch('/problems/'+input.slug+'/submit/',{lang:'python3',question_id:String(info.questionId),typed_code:input.code},controller.signal);
  id=response.submission_id;
  if(!id||!/^\d+$/.test(String(id)))throw new SiteError('submit_error','力扣未返回提交编号：'+String(response.error || '请查看官网提交记录后再重试。'));
  await chrome.storage.session.set({[key]:{state:'submitted',submissionId:String(id)}});
  await update({stage:'pending',submissionId:String(id),message:'力扣正在判题…'});
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
   if(controller.signal.aborted)throw new DOMException('Stopped','AbortError');
   const checked=await siteFetch('/submissions/detail/'+id+'/check/',null,controller.signal);
   if(checked.state==='SUCCESS'){
    const result=P.result(checked,id,info.questionId);await chrome.storage.session.set({[key]:{state:'finished',result}});return result;
   }
   if(checked.state!=='PENDING'&&checked.state!=='STARTED')throw new SiteError('site_error','力扣返回了未知状态，请查看官方提交记录。');
   await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new SiteError('poll_timeout','等待官方结果超时；代码已提交，请先查看力扣记录，避免重复提交。');
 }catch(error){
  if(error.name==='AbortError')throw new SiteError('cancelled',id?'已停止等待，力扣上的提交仍会继续运行。':'已停止等待；若请求已发送，请检查力扣提交记录。');
  if(!id&&error.code==='login_required')await chrome.storage.session.remove(key);
  if(id)error.submissionUrl=BASE+'/submissions/detail/'+id+'/';
  throw error;
 }finally{jobs.delete(input.requestId);}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id||!P.trustedPage(sender.url))return;
 if(message?.source!=='xunxu-app'||message.protocol!==1)return;
 (async()=>{
  try{
   if(message.action==='cancel'){jobs.get(message.targetRequestId)?.abort();return {ok:true,cancelled:true};}
   if(message.action==='sync')return {ok:true,result:await recent(message)};
   if(message.action==='submit')return {ok:true,result:await submit(message,sender.tab.id)};
   throw new SiteError('invalid_request','不支持的操作');
  }catch(error){return {ok:false,error:{code:error.code||'network_error',message:error.message||'连接力扣失败',submissionUrl:error.submissionUrl}};}
 })().then(sendResponse);
 return true;
});
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:'https://taskii-lei.github.io/study-coach/'}));
