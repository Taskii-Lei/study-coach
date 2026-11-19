#!/usr/bin/env python3
"""Persistent learning queue; tutoring and assessment happen in the Codex chat."""
import argparse
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
INTERVALS = [1, 3, 7, 14, 30]
TRACKS = [('leetcode', 'Hot 100', 30), ('llm_code', 'LLM 手写', 20), ('llm_qa', 'LLM 面试', 10)]


def today():
    return datetime.now(ZoneInfo('Asia/Shanghai')).date()


def read_json(path, default=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def save(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def plan(state, curriculum, day):
    """Idempotent daily plan, at most one task per track; carry unfinished work."""
    key = day.isoformat()
    if key in state['days']:
        return state['days'][key]
    tasks = []
    for track, _, _ in TRACKS:
        pending = next((t for d, p in sorted(state['days'].items()) if d < key
                        for t in p if t['track'] == track and not t['done']), None)
        if pending:
            # One live assignment across dates; complete it through any displayed date.
            tasks.append(dict(pending, carried=True))
            continue
        candidates = [q for q in curriculum if q['track'] == track]
        due = [q for q in candidates if q['id'] in state['progress']
               and state['progress'][q['id']]['due'] <= key]
        due.sort(key=lambda q: (state['progress'][q['id']]['due'], state['progress'][q['id']]['score']))
        fresh = [q for q in candidates if q['id'] not in state['progress']]
        chosen = (due or fresh)
        if chosen:
            q = chosen[0]
            tasks.append({'id': q['id'], 'track': track, 'done': False,
                          'review': bool(due), 'carried': False})
    state['days'][key] = tasks
    return tasks


def assess(state, curriculum, qid, score, feedback, day, evidence):
    ids = {q['id'] for q in curriculum}
    if qid not in ids:
        raise ValueError('未知题号：' + qid)
    pending = [t for d, p in state['days'].items() if d <= day.isoformat()
               for t in p if t['id'] == qid and not t['done']]
    if not pending:
        raise ValueError('该题没有待完成的任务；请勿重复记录同一次提交。')
    previous = state['progress'].get(qid, {})
    stage = min(previous.get('stage', -1) + 1, len(INTERVALS) - 1) if score >= 3 else 0
    due = day + timedelta(days=INTERVALS[stage])
    record = {'date': day.isoformat(), 'score': score, 'feedback': feedback,
              'evidence': evidence, 'stage': stage, 'due': due.isoformat()}
    state['progress'][qid] = record
    state['history'].append(dict(record, id=qid))
    for t in pending:
        t['done'] = True


def render(tasks, curriculum):
    lookup = {q['id']: q for q in curriculum}
    lines = []
    for track, name, minutes in TRACKS:
        for task in tasks:
            if task['track'] != track:
                continue
            q = lookup[task['id']]
            status = '已反馈' if task['done'] else ('续做' if task['carried'] else '复习' if task['review'] else '新题')
            lines += [f"### {name} · {minutes} 分钟 · {status}",
                      f"{q['id']} {q['title']}", q['prompt']]
            if q.get('url'):
                lines.append(q['url'])
            lines.append('')
    return '\n'.join(lines) or '当前没有到期任务。'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, default=ROOT / 'progress.json')
    parser.add_argument('--date', type=date.fromisoformat, default=None)
    subs = parser.add_subparsers(dest='command', required=True)
    subs.add_parser('daily')
    subs.add_parser('check')
    subs.add_parser('status')
    review = subs.add_parser('grade')
    review.add_argument('id')
    review.add_argument('score', type=int, choices=range(5))
    review.add_argument('--feedback', required=True)
    review.add_argument('--evidence', required=True, help='提交文件路径或本聊天作答的简要定位')
    args = parser.parse_args()
    day = args.date or today()
    curriculum = read_json(ROOT / 'curriculum.json')
    state = read_json(args.state, {'version': 1, 'days': {}, 'progress': {}, 'history': []})
    if args.command == 'daily':
        tasks = plan(state, curriculum, day)
        save(args.state, state)
        print(render(tasks, curriculum))
    elif args.command == 'check':
        tasks = state['days'].get(day.isoformat())
        if tasks is None:
            print('今天尚未布置任务；先执行 daily。')
        else:
            print(render(tasks, curriculum))
    elif args.command == 'grade':
        try:
            assess(state, curriculum, args.id, args.score, args.feedback, day, args.evidence)
        except ValueError as exc:
            parser.error(str(exc))
        save(args.state, state)
        print(f"已记录；下次复习：{state['progress'][args.id]['due']}")
    else:
        for track, name, _ in TRACKS:
            ids = {q['id'] for q in curriculum if q['track'] == track}
            attempted = [p for qid, p in state['progress'].items() if qid in ids]
            mastered = sum(p['score'] >= 3 and p['stage'] >= 2 for p in attempted)
            due = sum(p['due'] <= day.isoformat() for p in attempted)
            print(f'{name}：已练 {len(attempted)}/{len(ids)}，连续复习通过 {mastered}，到期 {due}')


if __name__ == '__main__':
    main()
