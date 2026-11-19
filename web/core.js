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
  function emptyState() { return {version: 2, days: {}, progress: {}, history: [], drafts: {}, submissions: [], hints: {}, focus: {}, leetcode: {username:'',roundStart:'',accepted:{}}}; }
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
    for (const [d,tasks] of Object.entries(state.days)) if (d <= day) for (const t of tasks) if (t.id === id) t.done = true;
    return record;
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
      result.days[d] = tasks.filter(t => known.has(t.id) && !seen.has(t.id) && seen.add(t.id)).map(t => ({id:t.id, track:known.get(t.id).track, done:!!t.done, review:!!t.review, carried:!!t.carried}));
    }
    result.history = input.history.filter(h => known.has(h.id)).map(h => ({id:h.id,...record(h)}));
    for (const [id,d] of Object.entries(input.drafts || {})) if (known.has(id)) result.drafts[id] = {answer:String(d.answer || '').slice(0,300000), reflection:String(d.reflection || '').slice(0,10000)};
    result.submissions = (Array.isArray(input.submissions) ? input.submissions : []).filter(s => known.has(s.id) && typeof s.at === 'string').map(s => {
      const row={id:s.id,at:s.at,answer:String(s.answer || '').slice(0,300000),reflection:String(s.reflection || '').slice(0,10000)};
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
    const out = {...a, days:{...a.days}, progress:{...a.progress}, drafts:{...a.drafts,...b.drafts}, hints:{...a.hints,...b.hints}, focus:{...a.focus}};
    for (const [id,p] of Object.entries(b.progress)) if (!out.progress[id] || p.date >= out.progress[id].date) out.progress[id] = p;
    for (const [day,tasks] of Object.entries(b.days)) if (!out.days[day]) out.days[day] = tasks;
    out.days = Object.fromEntries(Object.entries(out.days).map(([d,tasks]) => [d,tasks.map(t => ({...t,done:t.done || !!(out.progress[t.id] && out.progress[t.id].date >= d)}))]));
    for (const [d,n] of Object.entries(b.focus)) out.focus[d] = Math.max(n,out.focus[d] || 0);
    const unique = (xs,key) => [...new Map(xs.map(x => [key(x),x])).values()];
    out.history = unique([...a.history,...b.history],h=>`${h.id}:${h.date}:${h.evidence}:${h.score}`);
    out.submissions = unique([...a.submissions,...b.submissions],s=>`${s.id}:${s.at}`);
    return out;
  }
  const api = {TRACKS,INTERVALS,dayKey,addDays,emptyState,plan,grade,importState,merge};
  if (typeof module !== 'undefined') module.exports = api; else root.CoachCore = api;
})(typeof window === 'undefined' ? globalThis : window);
