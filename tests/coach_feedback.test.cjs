const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../web/coach-feedback.js'),C=require('../web/core.js');
const catalog=JSON.parse(fs.readFileSync(new URL('../curriculum.json','file://'+__filename),'utf8'));
const base={kind:F.KIND,version:1,requestId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',questionId:'code-01',submittedAt:'2026-11-20T01:00:00.000Z',judgedAt:'2026-11-20T02:00:00.000Z',score:2,verdict:'partial',feedback:'主体正确；还需要解释边界。\n请独立复写。',nextStep:'明天不用提示重新实现。',verification:{mode:'ran',detail:'已运行大数、单元素、重复值和空列表用例。'}};
function setup(value=base){const s=C.emptyState();C.plan(s,catalog,'2026-11-20');s.submissions.push({id:value.questionId,at:value.submittedAt,answer:'latest code',reflection:'tests',hintLevel:3,coachRequestId:value.requestId});return s;}
test('Chinese feedback roundtrips through link and raw JSON without putting code in the URL',()=>{
 assert.deepEqual(F.parse(F.link(base)),base);assert.deepEqual(F.parse(JSON.stringify(base)),base);
 assert.ok(!F.link(base).includes('?'));assert.ok(!F.link(base).includes('latest code'));
 assert.throws(()=>F.parse('not a feedback link'));assert.throws(()=>F.parse('x'.repeat(60001)));
});
test('strict schema rejects invalid scores, dates, verdicts and unverifiable code claims',()=>{
 for(const patch of [{score:5},{score:true},{verdict:'accepted'},{submittedAt:'2026-02-30T01:00:00Z'},{questionId:'lc-1'},{verification:{mode:'discussion',detail:'not executed'}},{feedback:''}])assert.throws(()=>F.normalize({...base,...patch}));
 assert.throws(()=>F.normalize({...base,questionId:'qa-01'}));
});
test('unknown or mismatched submission cannot mutate any progress',()=>{
 const s=setup(),before=structuredClone(s);
 for(const patch of [{requestId:'unknown-aaaa-bbbb'},{questionId:'code-02'},{submittedAt:'2026-11-20T01:00:01Z'}])assert.throws(()=>F.apply(s,{...base,...patch},catalog,'2026-11-20',C));
 assert.deepEqual(s,before);
});
test('actual feedback stores the judgment and schedules a retry, exactly once',()=>{
 const s=setup(),r=F.apply(s,base,catalog,'2026-11-20',C);
 assert.ok(r.applied&&!r.stale);assert.equal(s.submissions[0].coachFeedback.verdict,'partial');
 assert.equal(s.progress['code-01'].source,'coach');assert.equal(s.progress['code-01'].due,'2026-11-21');assert.ok(s.days['2026-11-20'][1].done);
 const before=structuredClone(s);assert.equal(F.apply(s,base,catalog,'2026-11-20',C).applied,false);assert.deepEqual(s,before);
});
test('same-day self grade is retained in history but does not advance spacing twice',()=>{
 const s=setup();C.grade(s,'code-01',3,'2026-11-19');C.grade(s,'code-01',3,'2026-11-20');
 F.apply(s,{...base,score:3,verdict:'correct'},catalog,'2026-11-20',C);
 assert.equal(s.history.length,3);assert.equal(s.history[1].source,'self');
 assert.equal(s.progress['code-01'].stage,1);assert.equal(s.progress['code-01'].due,'2026-11-23');
});
test('feedback on an older snapshot stays in its history without completing a newer attempt',()=>{
 const s=setup();s.submissions.push({id:'code-01',at:'2026-11-20T03:00:00Z',answer:'revision',reflection:'',coachRequestId:'ffffaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'});
 const r=F.apply(s,{...base,score:3,verdict:'correct'},catalog,'2026-11-20',C);
 assert.ok(r.stale);assert.equal(s.progress['code-01'],undefined);assert.equal(s.days['2026-11-20'][1].done,false);
 assert.ok(s.submissions[0].coachFeedback);assert.ok(!s.submissions[1].coachFeedback);
});
test('later review records protect current spacing from a delayed older feedback',()=>{
 const s=setup();C.grade(s,'code-01',3,'2026-11-21');const before=structuredClone(s.progress);
 assert.ok(F.apply(s,base,catalog,'2026-11-22',C).stale);assert.deepEqual(s.progress,before);
});
test('staleness compares Chinese dates across the UTC boundary',()=>{
 const value={...base,submittedAt:'2026-11-19T17:00:00Z'},s=setup(value);C.grade(s,'code-01',3,'2026-11-20');
 assert.ok(!F.apply(s,value,catalog,'2026-11-20',C).stale);assert.equal(s.progress['code-01'].source,'coach');
});
test('QA judgments use discussion and share the same version-aware feedback flow',()=>{
 const value={...base,questionId:'qa-01',verification:{mode:'discussion',detail:'核对点积方差、标准差、softmax 与假设。'}},s=setup(value);
 F.apply(s,value,catalog,'2026-11-20',C);assert.equal(s.progress['qa-01'].score,2);assert.ok(s.days['2026-11-20'][2].done);
});
test('backups and merges retain exact feedback, request IDs and hint use',()=>{
 const original=setup(),s=structuredClone(original);F.apply(s,base,catalog,'2026-11-20',C);
 const restored=C.importState(JSON.parse(JSON.stringify(s)),catalog);assert.deepEqual(restored,s);
 assert.deepEqual(C.merge(s,original).submissions[0].coachFeedback,base);
 assert.deepEqual(C.merge(original,s).submissions[0].coachFeedback,base);
 const invalid=structuredClone(s);invalid.submissions[0].coachFeedback.requestId='ffffaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';assert.throws(()=>C.importState(invalid,catalog));
});
