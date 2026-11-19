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
