#!/usr/bin/env python3
"""Create a private, client-side return link for an actual coach assessment.

No API calls, code execution, or progress changes are performed by this helper.
"""
import argparse
import base64
import datetime as dt
import json
import re
import sys
from pathlib import Path

BASE = 'https://taskii-lei.github.io/study-coach/#coach-feedback='


def normalize(value):
    if not isinstance(value, dict) or value.get('kind') != 'xunxu-coach-feedback' or value.get('version') != 1:
        raise ValueError('需要 version=1 的 xunxu-coach-feedback 记录')

    def text(key, limit):
        item = value.get(key)
        if not isinstance(item, str) or not item.strip() or len(item.encode('utf-16-le')) // 2 > limit:
            raise ValueError(f'{key} 无效或过长')
        return item.strip()

    request_id, question_id = text('requestId', 100), text('questionId', 50)
    if not re.fullmatch(r'[a-zA-Z0-9-]{12,100}', request_id) or not re.fullmatch(r'(code|qa)-\d{2}', question_id):
        raise ValueError('提交标识或题号无效')
    for key in ('submittedAt', 'judgedAt'):
        stamp = value.get(key, '')
        if not isinstance(stamp, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z', stamp):
            raise ValueError(f'{key} 需要 UTC ISO 时间')
        dt.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
    score = value.get('score')
    if type(score) is not int or not 0 <= score <= 4 or value.get('verdict') not in ('correct', 'partial', 'incorrect'):
        raise ValueError('评分或判定无效')
    verification = value.get('verification')
    if not isinstance(verification, dict) or verification.get('mode') not in ('ran', 'static', 'discussion'):
        raise ValueError('verification.mode 需要 ran / static / discussion')
    if not isinstance(verification.get('detail'), str) or not verification['detail'].strip() or len(verification['detail'].encode('utf-16-le')) // 2 > 2000:
        raise ValueError('需要具体的验证说明')
    if question_id.startswith('code-') and verification['mode'] == 'discussion' or question_id.startswith('qa-') and verification['mode'] != 'discussion':
        raise ValueError('验证方式与题目类型不匹配')
    return dict(kind='xunxu-coach-feedback', version=1, requestId=request_id,
                questionId=question_id, submittedAt=value['submittedAt'], judgedAt=value['judgedAt'],
                score=score, verdict=value['verdict'], feedback=text('feedback', 6000),
                nextStep=text('nextStep', 2000),
                verification=dict(mode=verification['mode'], detail=verification['detail'].strip()))


def build_link(value):
    payload = json.dumps(normalize(value), ensure_ascii=False, separators=(',', ':')).encode()
    return BASE + base64.urlsafe_b64encode(payload).decode().rstrip('=')


def main():
    parser = argparse.ArgumentParser(description='将教练对实际提交的批改生成网页回填链接')
    commands = parser.add_subparsers(dest='command', required=True)
    build = commands.add_parser('build', help='从反馈 JSON 生成链接（协议见 COACH_FEEDBACK.md）')
    build.add_argument('--input', required=True, help='反馈 JSON 路径；- 表示标准输入')
    args = parser.parse_args()
    try:
        raw = sys.stdin.read(60001) if args.input == '-' else Path(args.input).read_text()
        if len(raw) > 60000:
            raise ValueError('反馈文件过大')
        print(build_link(json.loads(raw)))
    except (ValueError, OSError) as error:
        parser.exit(2, f'未生成链接：{error}\n')


if __name__ == '__main__':
    main()
