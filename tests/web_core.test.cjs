const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = require('../web/core.js');
const catalog = JSON.parse(fs.readFileSync(new URL('../curriculum.json', 'file://' + __filename), 'utf8'));
test('catalog has 100 + 20 + 30 unique tasks', () => {
 assert.equal(catalog.length,150);assert.equal(new Set(catalog.map(q=>q.id)).size,150);
 assert.deepEqual(C.TRACKS.map(t=>catalog.filter(q=>q.track===t).length),[100,20,30]);
});
test('Chinese timezone and date arithmetic cross calendar boundaries',()=>{
 assert.equal(C.dayKey(new Date('2026-11-19T16:01:00Z')),'2026-11-20');
 assert.equal(C.addDays('2026-12-31',1),'2027-01-01');
});
test('daily is idempotent and unfinished work carries forward',()=>{
 const s=C.emptyState(),a=C.plan(s,catalog,'2026-11-19');
 assert.equal(a.length,3);assert.equal(C.plan(s,catalog,'2026-11-19'),a);
 const b=C.plan(s,catalog,'2026-11-20');assert.deepEqual(a.map(t=>t.id),b.map(t=>t.id));assert.ok(b.every(t=>t.carried));
 C.grade(s,'lc-1',3,'2026-11-20');assert.ok(a[0].done&&b[0].done);
});
test('spacing advances on success, resets on failure, and avoids duplicate grading',()=>{
 const s=C.emptyState();C.plan(s,catalog,'2026-11-19');
 assert.equal(C.grade(s,'lc-1',3,'2026-11-19').due,'2026-11-20');
 assert.throws(()=>C.grade(s,'lc-1',4,'2026-11-19'));
 assert.ok(C.plan(s,catalog,'2026-11-20')[0].review);
 assert.equal(C.grade(s,'lc-1',3,'2026-11-20').due,'2026-11-23');
 assert.equal(C.plan(s,catalog,'2026-11-21')[0].id,'lc-49');
 assert.equal(C.grade(s,'lc-1',1,'2026-11-23').due,'2026-11-24');
});
test('Python progress format imports and browser drafts roundtrip',()=>{
 const s=C.emptyState();C.plan(s,catalog,'2026-11-19');C.grade(s,'lc-1',3,'2026-11-19','tests passed');
 s.drafts['lc-1']={answer:'print(1)',reflection:'O(n)'};s.hints['lc-1']=2;s.focus['2026-11-19']=1200;
 assert.deepEqual(C.importState(JSON.parse(JSON.stringify(s)),catalog),s);
 const legacy={version:1,days:s.days,progress:s.progress,history:s.history};
 assert.equal(C.importState(legacy,catalog).progress['lc-1'].score,3);
});
test('import rejects invalid scores and dates, filters unknown question ids',()=>{
 const s=C.emptyState();s.progress['lc-1']={date:'2026-11-19',due:'2026-11-20',score:8,stage:0};
 assert.throws(()=>C.importState(s,catalog));s.progress['lc-1'].score=3;s.progress['lc-1'].date='2026-02-30';assert.throws(()=>C.importState(s,catalog));
 delete s.progress['lc-1'];s.progress['__proto_bad__']={};assert.deepEqual(C.importState(s,catalog).progress,{});
});
test('extra practice preserves daily tasks and drafts and never repeats an assigned question',()=>{
 const s=C.emptyState(),day='2026-11-19';const daily=C.plan(s,catalog,day);const original=structuredClone(daily);
 s.drafts['code-01']={answer:'my unfinished softmax',reflection:'keep me'};
 const a=C.nextPractice(s,catalog,day,'llm_code','code-01');
 const b=C.nextPractice(s,catalog,day,'llm_code',a.id);
 assert.equal(a.id,'code-02');assert.equal(b.id,'code-03');assert.ok(a.extra&&b.extra);
 assert.deepEqual(daily,original);assert.equal(s.drafts['code-01'].answer,'my unfinished softmax');
 assert.equal(s.extraDays[day].length,2);
});
test('extra practice prioritizes the oldest due review over a fresh question',()=>{
 const s=C.emptyState(),day='2026-11-19';C.plan(s,catalog,day);
 s.progress['code-03']={date:'2026-11-16',due:'2026-11-19',score:2,stage:0};
 s.progress['code-04']={date:'2026-11-15',due:'2026-11-18',score:1,stage:0};
 assert.equal(C.nextPractice(s,catalog,day,'llm_code','code-01').id,'code-04');
 const next=C.nextPractice(s,catalog,day,'llm_code','code-04');assert.equal(next.id,'code-03');assert.ok(next.review);
 assert.equal(C.nextPractice(s,catalog,day,'llm_code','code-03').id,'code-02');
});
test('extra practice skips submissions and assessments already made today',()=>{
 const s=C.emptyState(),day='2026-11-19';C.plan(s,catalog,day);
 s.submissions.push({id:'code-02',at:'2026-11-18T17:00:00Z',answer:'x'});
 s.progress['code-03']={date:day,due:'2026-11-20',score:2,stage:0};
 assert.equal(C.nextPractice(s,catalog,day,'llm_code','code-01').id,'code-04');
});
test('extra practice has a finite daily pool and never adds duplicates on exhaustion',()=>{
 const s=C.emptyState(),day='2026-11-19';C.plan(s,catalog,day);
 const picked=[];let q;
 while(q=C.nextPractice(s,catalog,day,'llm_code','code-01')){picked.push(q.id);assert.ok(picked.length<=19);}
 assert.equal(picked.length,19);assert.equal(new Set(picked).size,19);
 const before=structuredClone(s);assert.equal(C.nextPractice(s,catalog,day,'llm_code','code-01'),null);assert.deepEqual(s,before);
 assert.throws(()=>C.nextPractice(s,catalog,day,'invalid','code-01'));assert.deepEqual(s,before);
});
test('extra practice can review old topics early after all fresh topics are exhausted',()=>{
 const s=C.emptyState(),day='2026-11-19';C.plan(s,catalog,day);
 for(const q of catalog.filter(q=>q.track==='llm_code'))s.progress[q.id]={date:'2026-11-18',due:'2026-11-25',score:3,stage:1};
 const q=C.nextPractice(s,catalog,day,'llm_code','code-01');assert.equal(q.id,'code-02');assert.ok(q.early);assert.equal(q.review,false);
});
test('extra tasks retain their identity through backup restore and become done after assessment',()=>{
 const s=C.emptyState(),day='2026-11-19';C.plan(s,catalog,day);const task=C.nextPractice(s,catalog,day,'llm_qa','qa-01');
 const restored=C.importState(JSON.parse(JSON.stringify(s)),catalog);assert.deepEqual(restored.extraDays,s.extraDays);
 C.grade(restored,task.id,3,day,'independently explained');assert.ok(restored.extraDays[day][0].done);assert.equal(restored.progress[task.id].due,'2026-11-20');
 const merged=C.merge(s,restored);assert.equal(merged.extraDays[day].length,1);assert.ok(merged.extraDays[day][0].done);
 assert.ok(!C.importState({version:1,days:{},progress:{},history:[]},catalog).extraDays[day]);
});
test('unfinished optional extras do not turn into mandatory carry-over tasks tomorrow',()=>{
 const s=C.emptyState(),day='2026-11-19';C.plan(s,catalog,day);C.nextPractice(s,catalog,day,'llm_code','code-01');
 const next=C.plan(s,catalog,'2026-11-20');assert.equal(next.length,3);assert.ok(next.every(t=>!t.extra));assert.ok(!next.some(t=>t.id==='code-02'));
 assert.equal(s.extraDays[day][0].done,false);
});
test('a new due-review round starts from template without touching old code or submissions',()=>{
 const s=C.emptyState();s.progress['code-01']={date:'2026-11-19',due:'2026-11-20',score:2,stage:0};
 s.drafts['code-01']={answer:'old solution',reflection:'old explanation'};s.submissions=[{id:'code-01',at:'2026-11-19T12:00:00Z',answer:'old solution',reflection:'old explanation'}];s.hints['code-01']=3;
 C.plan(s,catalog,'2026-11-20');const d=C.getDraft(s,'code-01','2026-11-20','TEMPLATE');
 assert.equal(d.answer,'TEMPLATE');assert.equal(d.reflection,'');assert.equal(d.hintLevel,0);
 assert.equal(s.drafts['code-01'].answer,'old solution');assert.equal(s.submissions[0].answer,'old solution');
});
test('review drafts persist through rerenders and backup/reload, including hint usage',()=>{
 const s=C.emptyState();s.progress['qa-01']={date:'2026-11-19',due:'2026-11-20',score:1,stage:0};C.plan(s,catalog,'2026-11-20');
 const d=C.getDraft(s,'qa-01','2026-11-20','TEMPLATE');d.answer='my new explanation';d.reflection='new evidence';d.hintLevel=1;
 assert.equal(C.getDraft(s,'qa-01','2026-11-20','TEMPLATE'),d);
 const restored=C.importState(JSON.parse(JSON.stringify(s)),catalog);assert.equal(C.getDraft(restored,'qa-01','2026-11-20','TEMPLATE').answer,'my new explanation');
 assert.equal(C.getDraft(restored,'qa-01','2026-11-20','TEMPLATE').hintLevel,1);
});
test('unfinished review carries its round key and draft to the next day',()=>{
 const s=C.emptyState();s.progress['code-01']={date:'2026-11-19',due:'2026-11-20',score:2,stage:0};C.plan(s,catalog,'2026-11-20');
 const d=C.getDraft(s,'code-01','2026-11-20','TEMPLATE');d.answer='unfinished review';C.plan(s,catalog,'2026-11-21');
 assert.equal(C.getDraft(s,'code-01','2026-11-21','TEMPLATE'),d);
 C.grade(s,'code-01',3,'2026-11-21','done');assert.equal(C.getDraft(s,'code-01','2026-11-21','TEMPLATE').answer,'unfinished review');
});
test('the following scheduled review gets a new blank draft while the previous review remains archived',()=>{
 const s=C.emptyState();s.progress['code-01']={date:'2026-11-19',due:'2026-11-20',score:2,stage:0};C.plan(s,catalog,'2026-11-20');
 C.getDraft(s,'code-01','2026-11-20','TEMPLATE').answer='review one code';C.grade(s,'code-01',3,'2026-11-20','done');
 C.plan(s,catalog,'2026-11-23');const d=C.getDraft(s,'code-01','2026-11-23','TEMPLATE');
 assert.equal(d.answer,'TEMPLATE');assert.equal(d.hintLevel,0);assert.equal(s.reviewDrafts['code-01@2026-11-20'].answer,'review one code');
});
test('fresh or carried unfinished first attempts keep their original draft',()=>{
 const s=C.emptyState();C.plan(s,catalog,'2026-11-19');const d=C.getDraft(s,'lc-1','2026-11-19','TEMPLATE');d.answer='unfinished original';
 C.plan(s,catalog,'2026-11-20');assert.equal(C.getDraft(s,'lc-1','2026-11-20','TEMPLATE').answer,'unfinished original');
 assert.deepEqual(s.reviewDrafts,{});
});
test('an explicit early review starts clean and stays stable after same-day navigation',()=>{
 const s=C.emptyState();s.drafts['code-03']={answer:'old attention',reflection:''};
 s.progress['code-03']={date:'2026-11-19',due:'2026-11-25',score:3,stage:1};
 const d=C.getDraft(s,'code-03','2026-11-20','TEMPLATE',true);d.answer='review in progress';
 assert.equal(C.getDraft(s,'code-03','2026-11-20','TEMPLATE',true),d);assert.equal(s.drafts['code-03'].answer,'old attention');
});
test('completed review remains the same round after import, and snapshot hint levels survive',()=>{
 const s=C.emptyState();s.progress['code-01']={date:'2026-11-19',due:'2026-11-20',score:2,stage:0};C.plan(s,catalog,'2026-11-20');
 const d=C.getDraft(s,'code-01','2026-11-20','TEMPLATE');d.answer='completed new review';s.submissions.push({id:'code-01',at:'2026-11-20T01:00:00Z',answer:d.answer,reflection:'',hintLevel:0,startedOn:d.startedOn});
 C.grade(s,'code-01',3,'2026-11-20','done');const imported=C.importState(s,catalog);
 assert.equal(C.getDraft(imported,'code-01','2026-11-20','TEMPLATE').answer,'completed new review');assert.equal(imported.submissions[0].hintLevel,0);
});
