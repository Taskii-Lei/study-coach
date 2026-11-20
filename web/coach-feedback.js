(function(root){
  'use strict';
  const KIND='xunxu-coach-feedback',VERDICTS=['correct','partial','incorrect'];
  const stamp=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,19)===value.slice(0,19);
  const text=(value,name,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(name+'无效或过长。');return value.trim();};
  function normalize(value){
    if(!value||value.kind!==KIND||value.version!==1)throw Error('这不是循序教练反馈。');
    const requestId=text(value.requestId,'提交标识',100),questionId=text(value.questionId,'题号',50);
    if(!/^[a-zA-Z0-9-]{12,100}$/.test(requestId)||!/^(code|qa)-\d{2}$/.test(questionId))throw Error('反馈的提交标识或题号无效。');
    if(!stamp(value.submittedAt)||!stamp(value.judgedAt))throw Error('反馈时间格式无效。');
    if(!Number.isInteger(value.score)||value.score<0||value.score>4||!VERDICTS.includes(value.verdict))throw Error('评分或判定无效。');
    if(!['ran','static','discussion'].includes(value.verification?.mode))throw Error('请明确是否实际运行代码或仅审阅。');
    if(questionId.startsWith('code-')&&value.verification.mode==='discussion'||questionId.startsWith('qa-')&&value.verification.mode!=='discussion')throw Error('验证方式与题目类型不匹配。');
    return {kind:KIND,version:1,requestId,questionId,submittedAt:value.submittedAt,judgedAt:value.judgedAt,score:value.score,verdict:value.verdict,feedback:text(value.feedback,'具体反馈',6000),nextStep:text(value.nextStep,'复习建议',2000),verification:{mode:value.verification.mode,detail:text(value.verification.detail,'验证说明',2000)}};
  }
  function encode(value){const bytes=new TextEncoder().encode(JSON.stringify(normalize(value)));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function parse(value){
    const raw=String(value).trim();
    if(raw.startsWith('{'))return normalize(JSON.parse(raw));
    const encoded=raw.includes('#coach-feedback=')?raw.split('#coach-feedback=')[1]:raw.startsWith('coach-feedback=')?raw.slice(15):raw;
    if(encoded.length>60000||!/^[a-zA-Z0-9_-]+$/.test(encoded))throw Error('反馈链接格式无效；请粘贴完整回填链接或反馈 JSON。');
    const bytes=Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    return normalize(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }
  function link(value){return 'https://taskii-lei.github.io/study-coach/#coach-feedback='+encode(value);}
  function makeRequest(submission){
    if(!submission.coachRequestId)submission.coachRequestId=crypto.randomUUID();
    return {requestId:submission.coachRequestId,questionId:submission.id,submittedAt:submission.at};
  }
  function inspect(state,input,catalog){
    const value=normalize(input),q=catalog.find(q=>q.id===value.questionId);
    if(!q||!['llm_code','llm_qa'].includes(q.track))throw Error('反馈题号不在 LLM 题库中。');
    const index=state.submissions.findIndex(s=>s.coachRequestId===value.requestId);
    if(index<0)throw Error('本浏览器找不到对应提交。请在原来作答的浏览器打开，或先导入该浏览器的学习备份。');
    const submission=state.submissions[index];
    if(submission.id!==value.questionId||submission.at!==value.submittedAt)throw Error('反馈与提交版本不匹配，未修改学习记录。');
    if(q.track==='llm_code'&&value.verification.mode==='discussion')throw Error('代码题必须说明实际运行还是静态审阅。');
    if(q.track==='llm_qa'&&value.verification.mode!=='discussion')throw Error('口述题应使用原理与边界审阅。');
    const newer=state.submissions.some((s,i)=>s.id===submission.id&&(s.at>submission.at||s.at===submission.at&&i>index));
    const submittedDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value.submittedAt));
    const prior=state.history.some(h=>h.id===submission.id&&h.date>submittedDay);
    return {value,q,submission,stale:newer||prior,duplicate:!!submission.coachFeedback};
  }
  function apply(state,input,catalog,day,core){
    const info=inspect(state,input,catalog),{value,q,submission}=info;
    if(info.duplicate)return {...info,applied:false};
    submission.coachFeedback=value;
    if(!info.stale){
      // Same-day self assessments or revisions must not advance the interval twice.
      const earlier=state.history.filter(h=>h.id===q.id&&h.date<day).sort((a,b)=>a.date.localeCompare(b.date)).pop();
      const old=state.progress[q.id],previous=old?.date<day?old:earlier;
      const stage=value.score>=3?Math.min((previous?.stage??-1)+1,4):0;
      const record={date:day,score:value.score,stage,due:core.addDays(day,core.INTERVALS[stage]),feedback:value.feedback+'\n下一步：'+value.nextStep,evidence:'教练回填 · '+value.requestId,source:'coach'};
      state.progress[q.id]=record;state.history.push({id:q.id,...record});
      for(const pool of [state.days,state.extraDays||{}])for(const [d,tasks] of Object.entries(pool))if(d<=day)for(const t of tasks)if(t.id===q.id)t.done=true;
    }
    return {...info,applied:true};
  }
  const api={KIND,normalize,encode,parse,link,makeRequest,inspect,apply};
  if(typeof module!=='undefined')module.exports=api;else root.CoachFeedback=api;
})(typeof window==='undefined'?globalThis:window);
