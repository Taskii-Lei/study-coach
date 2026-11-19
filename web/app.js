(() => {
'use strict';
const C = window.CoachCore, catalog = window.CURRICULUM, byId = new Map(catalog.map(q => [q.id,q]));
const $ = id => document.getElementById(id), KEY = 'xunxu-study-coach-v2';
const titles = {today:'今日学习',bank:'全部题库',review:'复习计划',progress:'学习记录',settings:'学习设置'};
const trackNames = {leetcode:'LeetCode Hot 100',llm_code:'LLM 手写算法',llm_qa:'LLM 面试复习'};
const durations = {leetcode:30,llm_code:20,llm_qa:10};
const trackColors = {leetcode:'purple',llm_code:'teal',llm_qa:'amber'};
let state=C.emptyState(), day=C.dayKey(), selected, tab='problem', currentView='today', toastTimeout, timerEnd=0, remaining=30*60000, timerLast=0, lastTickSave=0, saveFailed=false;
try { const raw=localStorage.getItem(KEY); if(raw) state=C.importState(JSON.parse(raw),catalog); } catch(e) { saveFailed=true; setTimeout(()=>showDialog('存档需要检查','<p>浏览器中的存档无法读取，暂未覆盖原记录。请先使用浏览器备份原数据，再清理或导入有效备份。</p>'),300); }
let tasks=C.plan(state,catalog,day);
selected=tasks.find(t=>!t.done)?.id || tasks[0]?.id || catalog[0].id;
function persist(){
  if(saveFailed){$('save-status').textContent='存档未写入 · 请先备份';return false;}
  try{localStorage.setItem(KEY,JSON.stringify(state));$('save-status').textContent='已保存在此浏览器';return true;}catch(e){$('save-status').textContent='保存失败 · 请导出备份';toast('浏览器存储不可用或已满，请立即导出备份。');return false;}
}
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message){clearTimeout(toastTimeout);$('toast').textContent=message;$('toast').classList.add('show');toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function showDialog(title,content){$('dialog-title').textContent=title;$('dialog-content').innerHTML=content;$('info-dialog').showModal();}
function empty(message){return `<div class="empty"><span>✧</span>${escape(message)}</div>`;}
function qstatus(q){const p=state.progress[q.id];return !p?'尚未练习':p.due<=day?'待复习':p.source==='self'?'已自评':'已反馈';}
function draft(q){
  if(!state.drafts[q.id]) state.drafts[q.id]={answer:starter(q),reflection:''};
  return state.drafts[q.id];
}
function starter(q){
  if(q.id==='lc-1')return 'class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        # 先写下你的思路\n        pass\n';
  if(q.id==='code-01')return 'import math\n\ndef stable_softmax(logits: list[float]) -> list[float]:\n    # 实现数值稳定的 softmax\n    pass\n';
  if(q.track==='llm_qa')return '我的理解：\n\n原理与假设：\n\n例子或边界：\n';
  return '# 思路：\n\n# 在这里开始你的 Python 实现\n';
}
function renderStats(){
  tasks=state.days[day] || [];
  const done=tasks.filter(t=>t.done).length, percent=tasks.length?Math.round(done/tasks.length*100):0;
  $('completed').textContent=done;$('total-tasks').textContent=tasks.length;$('ring-percent').textContent=percent+'%';
  $('progress-ring').style.background=`conic-gradient(#9a86e7 ${percent}%, #f1edf9 0)`;
  $('today-count').textContent=tasks.filter(t=>!t.done).length;
  $('completion-message').textContent=done===tasks.length && done?'今日目标完成，记得休息':done?'每一个小步，都算数':'从第一道题开始就很好';
  const due=Object.values(state.progress).filter(p=>p.due<=day).length;
  $('practiced').textContent=Object.keys(state.progress).length;$('review-count').textContent=due;
  $('review-summary').textContent=due?`${due} 道题到了复习时间`:'完成后，会自动安排间隔复习';
  const date=new Date(day+'T12:00:00+08:00');
  document.querySelector('.eyebrow').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(date)+' · 你的每日进步计划';
  $('task-date').textContent=day.slice(5).replace('-',' / ');
}
function renderTasks(){
  $('task-list').innerHTML=tasks.length?tasks.map(t=>{const q=byId.get(t.id);return `<button class="task-card ${t.id===selected?'selected':''}" data-question="${q.id}"><div class="task-card-top"><i class="dot ${trackColors[q.track]}"></i> ${trackNames[q.track]}</div><h4>${q.track==='leetcode'?q.id.slice(3)+'. ':''}${escape(q.title)}</h4><p>${escape(q.topic || (q.track==='llm_code'?'实现 · 验证 · 解释':'原理 · 取舍 · 追问'))}</p><div class="task-card-bottom"><span class="pill ${t.done?'green':t.review?'purple-pill':'neutral'}">${t.done?'已记录':t.carried?'继续完成':t.review?'到期复习':'待开始'}</span><span>${durations[q.track]} 分钟</span></div></button>`}).join(''):empty('今天没有到期任务，可以去题库自由练习。');
}
function renderQuestion(){
  const q=byId.get(selected),p=state.progress[q.id],d=draft(q);
  $('workspace-topic').innerHTML=`<i class="dot ${trackColors[q.track]}"></i> <span>${trackNames[q.track]}</span>`;
  $('question-title').textContent=(q.track==='leetcode'?q.id.slice(3)+'. ':'')+q.title;
  $('question-difficulty').textContent=qstatus(q);$('question-difficulty').className='pill '+(p?'green':'purple-pill');
  $('question-tags').innerHTML=`<span>${escape(q.topic || 'LLM 核心基础')}</span><span>${q.track==='llm_qa'?'口述复习':'Python'}</span><span>建议 ${durations[q.track]} 分钟</span>`;
  let description=`<p>${escape(q.prompt)}</p>`;
  if(q.id==='lc-1')description='<p>给定整数数组 <code>nums</code> 和目标值 <code>target</code>，找出两个不同位置的数，使它们的和等于目标值，返回这两个位置的下标。</p><p>可假设每个输入恰好有一个有效答案；同一个位置不能使用两次，答案下标的顺序不限。</p>';
  if(q.url)description+=`<p><a href="${escape(q.url)}" target="_blank" rel="noopener noreferrer">在力扣查看原题与完整约束</a></p>`;
  $('question-description').innerHTML=description;
  const examples={
    'lc-1':['示例 · 先手动走一遍','输入：nums = [2, 7, 11, 15], target = 9\n输出：[0, 1]\n说明：nums[0] + nums[1] = 9'],
    'code-01':['验证清单','大数：[1000, 1001, 1002]\n边界：单元素、重复值、空列表\n检查：概率之和接近 1，且不溢出'],
    'qa-01':['回答路线','明确假设 → 推导点积方差\n→ 讨论 softmax 分布与梯度 → 说明限制']
  };
  $('question-examples').innerHTML=examples[q.id]?`<div class="example"><b>${escape(examples[q.id][0])}</b><pre>${escape(examples[q.id][1])}</pre></div>`:'';
  $('acceptance-text').textContent=q.track==='llm_qa'?'用自己的话解释原理，交代假设和适用边界，并准备回答一个追问。':'提交代码、思路与复杂度分析；设计至少两个有区分力的测试，并说明是否实际运行。';
  $('answer-editor').value=d.answer;$('reflection').value=d.reflection;
  $('editor-language').textContent=q.track==='llm_qa'?'Markdown · 口述笔记':'Python 3';
  $('mentor-intro').textContent=q.track==='llm_qa'?'先用两三句话讲清核心机制，再补推导和适用边界。不必一开始就背标准答案。':'先试着用自己的话复述问题。你现在有什么思路？';
  $('grade-score').value=p?.date===day?String(p.score):'';
  $('complete-task').disabled=p?.date===day;
  $('complete-task').textContent=p?.date===day?`已记录 · ${p.due} 复习`:'记录自评与复习';
  $('hint-output').classList.add('hidden');
  updateLines();renderSubmissions();setTab(tab);renderTasks();
}
function renderSubmissions(){
  const rows=state.submissions.filter(s=>s.id===selected).slice().reverse();
  $('submission-count').textContent=rows.length;
  $('history-actions').classList.toggle('hidden',!rows.length);
  submissionStatus();
  $('submission-history').innerHTML=rows.length?rows.map(s=>`<article class="history-item"><h4>已提交 · 待教练批改</h4><small>${escape(formatTime(s.at))}</small><pre>${escape(s.answer)}</pre><p>${escape(s.reflection)}</p></article>`).join(''):empty('还没有提交。先试着写下你的思路。');
  const h=state.history.filter(h=>h.id===selected).slice().reverse();
  if(h.length)$('submission-history').innerHTML+=h.map(r=>`<article class="history-item"><h4>${r.source==='self'?'自评记录':'教练反馈'} · ${r.score} / 4</h4><small>${r.date} · 下次复习 ${r.due}</small><p>${escape(r.feedback)}</p></article>`).join('');
}
function empty(message){return `<div class="empty"><span>✧</span>${escape(message)}</div>`;}
function formatTime(at){const d=new Date(at);return Number.isNaN(d.getTime())?at:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);}
function setTab(next){tab=next;document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===next);b.setAttribute('aria-selected',String(b.dataset.tab===next));});['problem','answer','history'].forEach(t=>$(t+'-tab').classList.toggle('hidden',t!==next));}
function switchQuestion(id){if(!byId.has(id))return;stopTimer();selected=id;remaining=durations[byId.get(id).track]*60000;renderClock();renderQuestion();showView('today');}
function showView(view){if(!titles[view])view='today';const hero={today:['把今天的一小步，走扎实。','一道算法，一段手写，一次理解。今天也和教练一起进步。'],bank:['从一个问题，练到一种能力。','150 道题，三条学习路线。按知识点或进度，找到下一道。'],review:['隔一段时间，再想明白一次。','复习不是重看答案，而是重新独立解决问题。'],progress:['你走过的每一步，都有迹可循。','记录理解，也记录卡住的地方。把进步留给时间。'],settings:['让计划，适合你的生活。','按自己的节奏学习，也为认真思考留下空间。']};$('heading').textContent=hero[view][0];$('subheading').textContent=hero[view][1];currentView=view;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('hidden',el.id!==view+'-view'));document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('view-title').textContent=titles[view];if(view==='bank')renderBank();if(view==='review')renderReview();if(view==='progress')renderProgress();history.replaceState(null,'','#'+view);}
function row(q,meta,action='练习'){return `<div class="bank-row"><i class="dot ${trackColors[q.track]}"></i><div><h3>${q.track==='leetcode'?q.id.slice(3)+'. ':''}${escape(q.title)}</h3><p>${trackNames[q.track]} · ${escape(q.topic || 'LLM 核心基础')}</p></div><span>${escape(meta)}</span><button class="button secondary" data-question="${q.id}">${action}</button></div>`;}
function renderBank(){
  const search=$('search').value.trim().toLowerCase(),track=$('track-filter').value,status=$('status-filter').value;
  const qs=CURRICULUM.filter(q=>(track==='all'||q.track===track)&&`${q.id} ${q.title} ${q.topic||''}`.toLowerCase().includes(search)).filter(q=>{const p=state.progress[q.id];return status==='all'||status==='new'&&!p||status==='due'&&p?.due<=day||status==='practiced'&&!!p;});
  $('bank-results').innerHTML=`<div class="bank-result-count">找到 ${qs.length} 道题 · 自由练习不会增加今日必做任务</div>`+(qs.length?qs.map(q=>row(q,state.progress[q.id]?`${state.progress[q.id].score}/4 · ${state.progress[q.id].due} 复习`:'尚未练习')).join(''):empty('没有匹配的题目，换个关键词试试。'));
}
function renderReview(){const qs=CURRICULUM.filter(q=>state.progress[q.id]).sort((a,b)=>state.progress[a.id].due.localeCompare(state.progress[b.id].due));$('review-list').innerHTML=qs.length?qs.map(q=>row(q,`${state.progress[q.id].due} · ${state.progress[q.id].due<=day?'已到期':'待复习'}`,'再练一次')).join(''):empty('还没有复习任务。完成一次作答并记录理解程度，就会生成复习计划。');}
function renderProgress(){
  $('track-progress').innerHTML=Object.keys(trackNames).map(t=>{const total=CURRICULUM.filter(q=>q.track===t).length,count=CURRICULUM.filter(q=>q.track===t&&state.progress[q.id]).length;return `<div><h3>${trackNames[t]}</h3><strong>${count}</strong><small> / ${total} 题</small><p class="fine-print">已练习 ${Math.round(count/total*100)}%</p></div>`;}).join('');
  const h=state.history.slice().reverse();$('activity-list').innerHTML=h.length?h.map(r=>`<article class="history-item"><h4>${escape(byId.get(r.id)?.title)} · ${r.score} / 4</h4><small>${r.date} · ${r.source==='self'?'自评':'教练反馈'} · 下次复习 ${r.due}</small><p>${escape(r.feedback || '已记录本次理解程度。')}</p></article>`).join(''):empty('你的学习轨迹会出现在这里。今天，就从第一道题开始。');
}
function updateLines(){$('line-numbers').textContent=Array.from({length:$('answer-editor').value.split('\n').length},(_,i)=>i+1).join('\n');}
function saveDraft(){state.drafts[selected]={answer:$('answer-editor').value,reflection:$('reflection').value};const saved=persist();submissionStatus();return saved;}
const topicHints={
  哈希:['先想想：遍历时，哪些信息需要快速查到？','用一个可哈希的表示记录已经见过的信息，避免反复扫描。','检查键冲突、重复值和查询/插入顺序；解释额外空间。'],
  双指针:['能否利用位置或排序后的单调性，减少重复比较？','明确左右指针移动的条件，并用不变量说明为什么没有漏解。','用重复值、空区间、最短输入和极端数值检查边界。'],
  滑动窗口:['把连续片段看作一个窗口，哪些状态可以增量更新？','明确扩张和收缩条件；注意窗口「有效」与「最优」的区别。','检查重复元素、完全无解和答案出现在末尾的情况。'],
  前缀和:['连续区间的和，能否用两个累计量之差表达？','将目标区间条件改写为对先前前缀状态的查询。','检查空前缀、负数、零和重复前缀值。'],
  链表:['先画出节点连接关系，区分节点身份和值。','操作连接前保留后继节点；考虑哨兵节点是否能简化头部边界。','用空链表、单节点、重复值与环等适用边界检查连接是否丢失。'],
  二叉树:['思考一个节点需要从孩子那里得到什么信息。','明确递归函数返回值、空节点含义，以及每个节点怎样更新结果。','检查单节点、偏斜树和含负值的情况；区分路径能否向父节点延伸。'],
  回溯:['先确定每一步的选择集合和路径状态。','按「做选择—递归—撤销选择」组织搜索，明确终止与剪枝条件。','检查重复选择、解的去重，以及撤销状态是否完整。'],
  二分:['先找一个在有序范围上变化的判定条件。','明确搜索区间是闭区间还是半开区间，再决定 mid 和边界更新。','测试目标在两端、完全不存在、单元素和大量重复值。'],
  动态规划:['先用一句话定义状态，而不是急着写递推式。','列出当前状态由哪些更小子问题转移而来，再确定初值与顺序。','检查状态是否包含足够信息、初始化是否正确，以及能否压缩空间。'],
  多维动态规划:['尝试用两个前缀长度或两个位置定义子问题。','把二维表画出来，分别考虑当前元素匹配与不匹配时的转移。','检查空前缀行列、下标偏移和结果所在位置。'],
  图论:['先确定节点、边和需要维护的访问状态。','根据问题选择遍历、拓扑关系或状态传播；明确何时标记已访问。','检查多个连通分量、环、孤立节点和重复边。'],
  栈:['后来的元素会让哪些先前状态失效或得到答案？','明确栈保存的是索引还是值，以及弹出元素的条件。','检查相等元素、单调序列和最后仍留在栈中的元素。'],
  堆:['是否只需要维护候选集合中最小或最大的那一部分？','明确堆顶代表什么，什么时候加入、弹出或重平衡。','检查 k 的边界、相同值和数据不足的情况；解释每次操作的成本。'],
  贪心:['尝试提出一个局部选择，再找反例检验。','说明当前选择为什么不会损害后续的最优解，可以尝试交换论证。','检查最小输入、无法到达的情况和局部最优不成立的反例。']
};
const specificHints={
 'lc-1':['对于当前的数 x，你还需要另一个数满足什么等式？','在遍历时记录之前见过的值及其下标；先查询，再记录当前值。','用 [3,3]、target=6 检查重复值；确保没有用同一个位置两次。'],
 'code-01':['Softmax 对所有 logits 同时加上或减去一个常数，结果会改变吗？','考虑先减去输入的最大值，再计算指数和归一化；说明等价性。','检查大 logits 不溢出、输出非负且和接近 1；记得处理空列表。'],
 'qa-01':['假设各维独立、均值为零、方差为一，先看单个乘积项的方差。','点积是 d_k 个乘积项的和。求出方差后，再看除以 sqrt(d_k) 会怎样。','解释分数尺度增大时 softmax 为什么可能更尖锐；不要笼统地说所有梯度必然都消失。']
};
function hints(q){return specificHints[q.id] || topicHints[q.topic] || (q.track==='llm_code'?['先写清输入、输出和每个张量的 shape，用最小样例手算。','先完成不带优化的正确版本，再逐项加入题目要求；避免一次实现所有分支。','对照题目约定检查数值稳定性、mask、极端输入和参考输出；说明实际运行了哪些验证。']:q.track==='llm_qa'?['先解释这个机制解决什么问题，再给出核心流程。','把回答拆成定义、假设、推导或例子、代价与取舍。','检查是否混淆训练与推理、理论结论与实现变体；为每个核心结论补一个理由。']:['先用最直接的方法解题，找出重复计算或可以复用的信息。','定义需要维护的状态和每一步的不变量，用一个小例子走完整个过程。','检查最小输入、重复元素和极端值，解释时间与额外空间复杂度。']);}
function showHint(level){const q=byId.get(selected);state.hints[q.id]=Math.max(state.hints[q.id]||0,level);persist();$('hint-output').textContent=hints(q)[level-1];$('hint-output').classList.remove('hidden');}
function showDialog(title,html){$('dialog-title').textContent=title;$('dialog-content').innerHTML=html;$('info-dialog').showModal();}
function renderClock(){const s=Math.ceil(remaining/1000);$('timer-clock').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');$('timer-toggle').textContent=timerEnd?'Ⅱ':'▷';$('timer-toggle').setAttribute('aria-label',timerEnd?'暂停专注计时':'开始专注计时');}
function tick(){if(!timerEnd)return;const now=Date.now(),elapsed=Math.max(0,Math.min(now-timerLast,remaining));state.focus[day]=(state.focus[day]||0)+elapsed;remaining=Math.max(0,timerEnd-now);timerLast=now;if(now-lastTickSave>15000){persist();lastTickSave=now;}if(!remaining){timerEnd=0;persist();toast('这一段专注结束了，休息一下，再记录你的收获。');}renderClock();}
function stopTimer(){tick();timerEnd=0;persist();renderClock();}
function exportData(){saveDraft();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`xunxu-backup-${day}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('学习备份已导出。');}
async function importData(file){
  if(!file)return;
  try{
    if(file.size>10000000)throw Error('文件超过 10 MB，请检查是否选中了正确备份。');
    const incoming=C.importState(JSON.parse(await file.text()),CURRICULUM);
    if(!confirm('将合并这份备份：同一题保留日期较新的反馈；相同日期采用导入反馈。建议先导出当前备份。继续吗？'))return;
    for(const [id,p] of Object.entries(incoming.progress))if(!state.progress[id]||p.date>=state.progress[id].date)state.progress[id]=p;
    for(const [d,t] of Object.entries(incoming.days))if(!state.days[d])state.days[d]=t;
    Object.assign(state.drafts,incoming.drafts);
    const seen=new Set(state.history.map(h=>`${h.id}|${h.date}|${h.score}|${h.feedback}`));
    for(const h of incoming.history){const k=`${h.id}|${h.date}|${h.score}|${h.feedback}`;if(!seen.has(k)){state.history.push(h);seen.add(k);}}
    const submitted=new Set(state.submissions.map(s=>s.id+'|'+s.at));for(const s of incoming.submissions)if(!submitted.has(s.id+'|'+s.at)){state.submissions.push(s);submitted.add(s.id+'|'+s.at);}
    for(const [id,n] of Object.entries(incoming.hints))state.hints[id]=Math.max(state.hints[id]||0,n);
    for(const [d,n] of Object.entries(incoming.focus))state.focus[d]=Math.max(state.focus[d]||0,n);
    for(const [d,tasks] of Object.entries(state.days))for(const t of tasks)if(state.progress[t.id]?.date>=d)t.done=true;
    saveFailed=false;persist();tasks=C.plan(state,CURRICULUM,day);renderStatsAndQuestion();showView(currentView);toast('记录已合并；本页已刷新。');
  }catch(e){toast('导入失败：'+e.message);}finally{$('import-file').value='';}
}
function renderStatsAndQuestion(){renderStats();renderQuestion();}
function submissionStatus(message,kind='success'){
  const el=$('submission-status'),rows=state.submissions.filter(s=>s.id===selected),latest=rows[rows.length-1],d=state.drafts[selected];
  if(!message&&latest){const changed=d&&(latest.answer!==d.answer||latest.reflection!==d.reflection);message=changed?'草稿已修改，尚未提交这个版本。':`最近一次提交已保存（${formatTime(latest.at)}）。可在提交记录中查看并复制给教练。`;kind=changed?'pending':'success';}
  el.textContent=message||'';el.className='submission-status '+(message?kind:'hidden');
}
function submit(){
  if(!saveDraft()){submissionStatus('提交失败：浏览器未能写入存档。答案仍在编辑器中，请导出备份后重试。','error');return;}
  const d=state.drafts[selected];
  if(!d.answer.trim()){submissionStatus('还没有可提交的答案，请先写下代码或思路。','error');$('answer-editor').focus();return;}
  const rows=state.submissions.filter(s=>s.id===selected),previous=rows[rows.length-1];
  if(previous&&previous.answer===d.answer&&previous.reflection===d.reflection){renderSubmissions();setTab('history');submissionStatus('这份答案已经提交，下面是已保存的记录。');return;}
  const record={id:selected,at:new Date().toISOString(),...d};
  state.submissions.push(record);
  if(!persist()){state.submissions.pop();submissionStatus('提交失败：存储空间不足或浏览器禁止保存。请导出备份，答案仍在编辑器中。','error');return;}
  renderSubmissions();setTab('history');submissionStatus('提交成功，已保存本次答案。复制给教练可获得批改；右侧可记录自评并安排复习。');
  toast('答案已提交，已打开提交记录。');
}
async function copyAnswer(snapshot){
  const savedAnswer=snapshot&&typeof snapshot.answer==='string';if(!savedAnswer)saveDraft();const q=byId.get(selected),d=savedAnswer?snapshot:state.drafts[selected];
  if(!d.answer.trim()){toast('请先写一些代码或思路。');return;}
  const text=`请按循序学习教练的方式批改我的作答。先指出关键问题，必要时给分级提示；没有运行代码请明确说明。结束时给出0–4分及复习建议。\n\n题号：${q.id}\n题目：${q.title}\n要求：${q.prompt}\n已查看提示级别：${state.hints[q.id]||0}\n\n作答：\n${d.answer}\n\n思路与验证：\n${d.reflection || '尚未填写'}\n\n如需同步网页反馈，请提供包含本题记录的 coach.py progress.json，或按网页自评量表说明评分。`;
  try{await navigator.clipboard.writeText(text);toast('已复制。粘贴到当前 Codex 聊天即可批改。');}catch(e){showDialog('复制给教练','<p>浏览器无法自动复制，请选中下方内容复制。</p><textarea id="copy-fallback" class="reflection" style="height:260px" readonly></textarea>');$('copy-fallback').value=text;$('copy-fallback').select();}
}
function complete(){
  saveDraft();if(!state.drafts[selected]?.answer.trim()){toast('请先在「我的作答」中完成本次尝试。');setTab('answer');return;}
  const value=$('grade-score').value;if(value===''){toast('先选择本次理解程度；它会决定复习间隔。');return;}
  try{const feedback=state.drafts[selected].reflection || '网页自评；未由 AI 批改。';const record=C.grade(state,selected,Number(value),day,feedback);persist();renderStatsAndQuestion();toast(`已记录自评，下次复习：${record.due}`);}catch(e){toast(e.message);}
}
function rollover(){const next=C.dayKey();if(next===day)return;stopTimer();day=next;tasks=C.plan(state,CURRICULUM,day);persist();renderStatsAndQuestion();showView(currentView);toast('新的一天开始了，学习清单已更新。');}
document.addEventListener('click',e=>{
 const view=e.target.closest('[data-view]');if(view){showView(view.dataset.view);return;}
 const question=e.target.closest('[data-question]');if(question){switchQuestion(question.dataset.question);return;}
 const hint=e.target.closest('[data-hint]');if(hint){showHintWithOrder(Number(hint.dataset.hint));return;}
 const t=e.target.closest('[data-tab]');if(t)setTab(t.dataset.tab);
});
function showHintWithOrder(level){const previous=state.hints[selected]||0;if(level>previous+1){toast('先看上一级提示，给自己留一点思考空间。');showHintWithOrder(previous+1);return;}showHint(level);}
$('start-answer').onclick=()=>{setTab('answer');$('answer-editor').focus();};
$('answer-editor').addEventListener('input',()=>{updateLines();saveDraft();});$('reflection').addEventListener('input',saveDraft);
$('answer-editor').addEventListener('scroll',()=>{$('line-numbers').scrollTop=$('answer-editor').scrollTop;});
function editorKeydown(e){
  if(e.isComposing)return;
  if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();submit();return;}
  if(e.target!==$('answer-editor')||e.altKey||e.metaKey||e.ctrlKey)return;
  const el=e.target,change=window.CoachEditor.edit(el.value,el.selectionStart,el.selectionEnd,e.key,e.shiftKey,byId.get(selected).track!=='llm_qa');
  if(!change)return;
  e.preventDefault();el.setRangeText(change.text,change.from,change.to,'end');el.setSelectionRange(change.start,change.end);updateLines();saveDraft();
}
$('answer-editor').addEventListener('keydown',editorKeydown);
$('reflection').addEventListener('keydown',editorKeydown);
$('history-edit').onclick=()=>{setTab('answer');$('answer-editor').focus();};
$('history-copy').onclick=()=>{const rows=state.submissions.filter(s=>s.id===selected);copyAnswer(rows[rows.length-1]);};
$('submit-answer').onclick=submit;$('copy-answer').onclick=copyAnswer;$('complete-task').onclick=complete;
$('timer-toggle').onclick=()=>{if(timerEnd){stopTimer();return;}if(remaining<=0)remaining=durations[byId.get(selected).track]*60000;timerLast=Date.now();timerEnd=timerLast+remaining;lastTickSave=timerLast;renderClock();toast('专注计时已开始，先试着独立想一想。');};
$('search').addEventListener('input',renderBank);$('track-filter').onchange=renderBank;$('status-filter').onchange=renderBank;
$('export-progress').onclick=exportData;$('export-settings').onclick=exportData;$('import-button').onclick=()=>$('import-file').click();$('import-file').onchange=e=>importData(e.target.files[0]);
$('help-button').onclick=()=>showDialog('欢迎来到循序','<p>这里是你的算法与 LLM 学习工作台。</p><ul><li>每天三项任务：Hot 100、LLM 手写、面试复习。</li><li>作答会自动保存；卡住时逐级打开提示。</li><li>记录自评后，会安排间隔复习。</li><li>深度批改：点击「复制给教练」，粘贴到 Codex 聊天。</li></ul><p>数据仅保存在当前浏览器，请定期导出备份。09:00 / 21:00 提醒仍由 Codex 自动化提供，网页本身不会在关闭后推送通知。</p>');
$('schedule-button').onclick=()=>showDialog('每天 60 分钟，按时开始','<p>北京时间 09:00 出题，21:00 检查。提醒由 Codex 自动化提供；修改时间可在当前聊天告诉教练。</p><ul><li>Hot 100：30 分钟</li><li>LLM 手写：20 分钟</li><li>LLM 面试：10 分钟</li></ul><p>未完成任务顺延；到期复习优先。网页与 Codex 的进度可通过设置中的 JSON 导入、导出交换。</p>');
$('info-dialog').querySelectorAll('.dialog-close,.dialog-dismiss').forEach(b=>b.onclick=()=>$('info-dialog').close());
$('info-dialog').addEventListener('click',e=>{if(e.target===$('info-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
window.addEventListener('beforeunload',()=>{stopTimer();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')rollover();});
setInterval(()=>{tick();rollover();},1000);
remaining=durations[byId.get(selected).track]*60000;
renderStatsAndQuestion();renderClock();showView(location.hash.slice(1)||'today');persist();
})();
