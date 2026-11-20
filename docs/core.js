(function (root) {
  'use strict';
  const TRACKS = ['leetcode', 'llm_code', 'llm_qa'];
  const INTERVALS = [1, 3, 7, 14, 30];
  function dayKey(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
    const part = type => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function addDays(day, count) {
    const d = new Date(`${day}T12:00:00+08:00`);
    d.setUTCDate(d.getUTCDate() + count);
    return dayKey(d);
  }
  function emptyState() { return {version: 2, days: {}, extraDays: {}, progress: {}, history: [], drafts: {}, reviewDrafts: {}, submissions: [], hints: {}, focus: {}, leetcode: {username:'',roundStart:'',accepted:{}}}; }
  function plan(state, catalog, day) {
    if (state.days[day]) return state.days[day];
    const tasks = [];
    for (const track of TRACKS) {
      const pending = Object.keys(state.days).sort().filter(d => d < day).flatMap(d => state.days[d]).find(t => t.track === track && !t.done);
      if (pending) { tasks.push({...pending, carried: true}); continue; }
      const candidates = catalog.filter(q => q.track === track);
      const due = candidates.filter(q => state.progress[q.id]?.due <= day).sort((a,b) => state.progress[a.id].due.localeCompare(state.progress[b.id].due) || state.progress[a.id].score - state.progress[b.id].score);
      const fresh = candidates.filter(q => !state.progress[q.id]);
      const q = (due.length ? due : fresh)[0];
      if (q) tasks.push({id: q.id, track, done: false, review: due.length > 0, carried: false});
    }
    state.days[day] = tasks;
    return tasks;
  }
  function grade(state, id, score, day, feedback = '') {
    if (!Number.isInteger(score) || score < 0 || score > 4) throw Error('评分需要在 0–4 之间。');
    if (state.progress[id]?.date === day) throw Error('这道题今天已经记录；可以继续修改作答，下一次到期时再记录复习。');
    const stage = score >= 3 ? Math.min((state.progress[id]?.stage ?? -1) + 1, 4) : 0;
    const record = {date: day, score, stage, due: addDays(day, INTERVALS[stage]), feedback, evidence: '网页自评', source: 'self'};
    state.progress[id] = record;
    state.history.push({id, ...record});
    for (const pool of [state.days,state.extraDays || {}]) for (const [d,tasks] of Object.entries(pool)) if (d <= day) for (const t of tasks) if (t.id === id) t.done = true;
    return record;
  }
  function nextPractice(state, catalog, day, track, currentId) {
    if (!TRACKS.includes(track)) throw Error('请选择有效的学习路线。');
    const used = new Set([currentId, ...(state.days[day] || []).map(t=>t.id), ...(state.extraDays?.[day] || []).map(t=>t.id)]);
    for (const [id,p] of Object.entries(state.progress)) if (p.date === day) used.add(id);
    for (const s of state.submissions) {const at=new Date(s.at);if(!Number.isNaN(at.getTime()) && dayKey(at)===day)used.add(s.id);}
    const candidates = catalog.filter(q=>q.track===track && !used.has(q.id));
    const due = candidates.filter(q=>state.progress[q.id]?.due<=day).sort((a,b)=>state.progress[a.id].due.localeCompare(state.progress[b.id].due) || state.progress[a.id].score-state.progress[b.id].score);
    const attempted = new Set(state.submissions.map(s=>s.id));
    const fresh = candidates.filter(q=>!state.progress[q.id] && !attempted.has(q.id) && !state.leetcode?.accepted[q.id]);
    const previous = candidates.slice().sort((a,b)=>(state.progress[a.id]?.date || '').localeCompare(state.progress[b.id]?.date || ''));
    const q = (due.length ? due : fresh.length ? fresh : previous)[0];
    if (!q) return null;
    const task = {id:q.id,track,done:false,review:due.length>0,carried:false,extra:true,early:!due.length && !fresh.length};
    state.extraDays ||= {};
    (state.extraDays[day] ||= []).push(task);
    return task;
  }
  function getDraft(state, id, day, template, forceReview = false) {
    state.reviewDrafts ||= {};
    const pools = [state.days, state.extraDays || {}];
    const task = pools.flatMap(pool=>pool[day] || []).find(t=>t.id===id);
    const todayKey = id+'@'+day;
    let key = task?.reviewKey;
    if (!key && (task?.review || task?.early)) {
      const pending = pools.flatMap(pool=>Object.entries(pool).filter(([d])=>d<=day).flatMap(([d,list])=>list.filter(t=>t.id===id && !t.done && (t.review || t.early)).map(t=>({day:d,task:t})))).sort((a,b)=>a.day.localeCompare(b.day));
      key = pending.find(p=>p.task.reviewKey)?.task.reviewKey || id+'@'+(pending[0]?.day || day);
      for (const p of pending) p.task.reviewKey=key;
      task.reviewKey=key;
    }
    if (!key && state.reviewDrafts[todayKey]) key=todayKey;
    if (!key && (forceReview || (!task && state.progress[id]?.date<day))) key=todayKey;
    if (key) {
      if (!state.reviewDrafts[key]) state.reviewDrafts[key]={id,startedOn:key.slice(id.length+1),answer:template,reflection:'',hintLevel:0};
      return state.reviewDrafts[key];
    }
    if (!state.drafts[id]) state.drafts[id]={answer:template,reflection:''};
    return state.drafts[id];
  }
  function validDate(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d; }
  function importState(input, catalog) {
    if (!input || ![1,2].includes(input.version) || !input.days || !input.progress || !Array.isArray(input.history)) throw Error('这不是有效的学习备份；需要 version、days、progress、history。');
    const result = emptyState(), known = new Map(catalog.map(q => [q.id,q]));
    const record = p => {
      if (!p || !validDate(p.date) || !validDate(p.due) || !Number.isInteger(p.score) || p.score < 0 || p.score > 4 || !Number.isInteger(p.stage) || p.stage < 0 || p.stage > 4) throw Error('备份中的评分或日期无效。');
      return {date:p.date, due:p.due, score:p.score, stage:p.stage, feedback:String(p.feedback || '').slice(0,10000), evidence:String(p.evidence || '').slice(0,1000), source:p.source === 'self' ? 'self' : 'coach'};
    };
    for (const [id,p] of Object.entries(input.progress)) if (known.has(id)) result.progress[id] = record(p);
    for (const [d,tasks] of Object.entries(input.days)) {
      if (!validDate(d) || !Array.isArray(tasks)) throw Error('备份中的每日清单无效。');
      const seen = new Set();
      result.days[d] = tasks.filter(t => known.has(t.id) && !seen.has(t.id) && seen.add(t.id)).map(t => ({id:t.id, track:known.get(t.id).track, done:!!t.done, review:!!t.review, carried:!!t.carried,...(typeof t.reviewKey==='string' && t.reviewKey.startsWith(t.id+'@') && validDate(t.reviewKey.slice(t.id.length+1)) ? {reviewKey:t.reviewKey} : {})}));
    }
    for (const [d,tasks] of Object.entries(input.extraDays || {})) {
      if (!validDate(d) || !Array.isArray(tasks)) throw Error('备份中的加练清单无效。');
      const seen = new Set((result.days[d] || []).map(t=>t.id));
      result.extraDays[d] = tasks.filter(t=>known.has(t.id) && !seen.has(t.id) && seen.add(t.id)).map(t=>({id:t.id,track:known.get(t.id).track,done:!!t.done,review:!!t.review,carried:false,extra:true,early:!!t.early,...(typeof t.reviewKey==='string' && t.reviewKey.startsWith(t.id+'@') && validDate(t.reviewKey.slice(t.id.length+1)) ? {reviewKey:t.reviewKey} : {})}));
    }
    result.history = input.history.filter(h => known.has(h.id)).map(h => ({id:h.id,...record(h)}));
    for (const [id,d] of Object.entries(input.drafts || {})) if (known.has(id)) result.drafts[id] = {answer:String(d.answer || '').slice(0,300000), reflection:String(d.reflection || '').slice(0,10000)};
    for (const [key,d] of Object.entries(input.reviewDrafts || {})) if (d && known.has(d.id) && validDate(d.startedOn) && key===d.id+'@'+d.startedOn) result.reviewDrafts[key]={id:d.id,startedOn:d.startedOn,answer:String(d.answer || '').slice(0,300000),reflection:String(d.reflection || '').slice(0,10000),hintLevel:Number.isInteger(d.hintLevel) && d.hintLevel>=0 && d.hintLevel<=3 ? d.hintLevel : 0};
    result.submissions = (Array.isArray(input.submissions) ? input.submissions : []).filter(s => known.has(s.id) && typeof s.at === 'string').map(s => {
      const row={id:s.id,at:s.at,answer:String(s.answer || '').slice(0,300000),reflection:String(s.reflection || '').slice(0,10000)};
      if(Number.isInteger(s.hintLevel)&&s.hintLevel>=0&&s.hintLevel<=3)row.hintLevel=s.hintLevel;
      if(validDate(s.startedOn))row.startedOn=s.startedOn;
      if(s.result){
        const r=s.result,states=['pending','accepted','wrong_answer','memory_limit','output_limit','time_limit','runtime_error','compile_error','internal_error','connection_error','cancelled'];
        if(r.provider!=='leetcode'||!states.includes(r.status))throw Error('备份中的力扣结果无效。');
        row.result={provider:'leetcode',status:r.status};
        for(const field of ['submissionId','questionId','runtime','memory','input','expected','actual','error','errorCode','phase','officialMessage','receivedAt'])if(r[field]!=null)row.result[field]=String(r[field]).slice(0,8000);
        if(r.submissionUrl&&/^https:\/\/leetcode\.cn\/submissions\/detail\/\d+\/$/.test(r.submissionUrl))row.result.submissionUrl=r.submissionUrl;
        for(const field of ['passed','total'])if(Number.isFinite(r[field])&&r[field]>=0)row.result[field]=r[field];
      }
      return row;
    });
    if(input.leetcode){
      result.leetcode.username=String(input.leetcode.username||'').slice(0,100);
      result.leetcode.roundStart=validDate(input.leetcode.roundStart)?input.leetcode.roundStart:'';
      for(const [id,r] of Object.entries(input.leetcode.accepted||{}))if(known.has(id)&&r&&/^\d+$/.test(String(r.submissionId))&&Number.isFinite(r.submitTime)&&r.submitTime>0)result.leetcode.accepted[id]={submissionId:String(r.submissionId),submitTime:r.submitTime};
    }
    for (const [id,n] of Object.entries(input.hints || {})) if (known.has(id) && Number.isInteger(n) && n >= 0 && n <= 3) result.hints[id] = n;
    for (const [d,n] of Object.entries(input.focus || {})) if (validDate(d) && Number.isFinite(n) && n >= 0) result.focus[d] = Math.min(n,86400000);
    return result;
  }
  function merge(a,b) {
    const out = {...a, days:{...a.days}, extraDays:{...a.extraDays}, progress:{...a.progress}, drafts:{...a.drafts,...b.drafts}, reviewDrafts:{...a.reviewDrafts,...b.reviewDrafts}, hints:{...a.hints,...b.hints}, focus:{...a.focus}};
    for (const [id,p] of Object.entries(b.progress)) if (!out.progress[id] || p.date >= out.progress[id].date) out.progress[id] = p;
    for (const [day,tasks] of Object.entries(b.days)) if (!out.days[day]) out.days[day] = tasks;
    for (const [d,tasks] of Object.entries(b.extraDays || {})) {
      const merged = new Map((out.extraDays[d] || []).map(t=>[t.id,{...t}]));
      for (const t of tasks) merged.set(t.id,{...t,done:t.done || !!merged.get(t.id)?.done});
      out.extraDays[d] = [...merged.values()];
    }
    out.days = Object.fromEntries(Object.entries(out.days).map(([d,tasks]) => [d,tasks.map(t => ({...t,done:t.done || !!(out.progress[t.id] && out.progress[t.id].date >= d)}))]));
    for (const [d,n] of Object.entries(b.focus)) out.focus[d] = Math.max(n,out.focus[d] || 0);
    const unique = (xs,key) => [...new Map(xs.map(x => [key(x),x])).values()];
    out.history = unique([...a.history,...b.history],h=>`${h.id}:${h.date}:${h.evidence}:${h.score}`);
    out.submissions = unique([...a.submissions,...b.submissions],s=>`${s.id}:${s.at}`);
    return out;
  }
  const api = {TRACKS,INTERVALS,dayKey,addDays,emptyState,plan,nextPractice,getDraft,grade,importState,merge};
  if (typeof module !== 'undefined') module.exports = api; else root.CoachCore = api;
})(typeof window === 'undefined' ? globalThis : window);
