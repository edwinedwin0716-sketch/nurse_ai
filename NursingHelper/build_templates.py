#!/usr/bin/env python3
"""추가 진단(data/extra.json)과 질환별 추가 간호(variants.json)를 검사해 templates-extra.js에 넣는다.
(Windows판도 1.7.1부터 같은 화면(HTML)을 쓴다)

    python3 NursingHelper/build_templates.py
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'data', 'extra.json')
VAR = os.path.join(HERE, 'data', 'variants.json')  # 질환별 추가 간호: {진단명: [{label, when, diag, ther, edu}]}
JS = os.path.join(HERE, 'android', 'assets', 'templates-extra.js')
FIELDS = ['en', 'domain', 'cls', 'page', 'problem', 'priority', 'reason', 'evalData', 'keywords', 'cause', 'long', 'short', 'diag', 'ther', 'edu']


def check(name, t):
    miss = [f for f in FIELDS if f not in t]
    if miss: sys.exit('%s: 빠진 항목 %s' % (name, miss))
    if len(t['short']) != 2 or not 2 <= len(t['diag']) <= 4 or not 3 <= len(t['ther']) <= 6 or not 1 <= len(t['edu']) <= 3:
        sys.exit('%s: 목표·계획 개수가 이상해요' % name)
    if not isinstance(t['priority'], int) or not 1 <= t['priority'] <= 7: sys.exit('%s: priority' % name)
    re.compile(t['keywords'], re.I)
    if '{' in json.dumps(t['short'], ensure_ascii=False): sys.exit('%s: 목표에 {자리표시}가 남았어요' % name)


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    for n, t in data.items(): check(n, t)
    variants = json.load(open(VAR, encoding='utf-8')) if os.path.exists(VAR) else {}
    for n, vs in variants.items():
        for v in vs:
            re.compile(v['when'], re.I)
            for k in ('diag', 'ther', 'edu'):
                for x in v.get(k, []):
                    if not x.get('plan') or not x.get('why'): sys.exit('%s/%s: 빈 항목' % (n, v['label']))
    clean = {n: {f: t[f] for f in FIELDS} for n, t in data.items()}
    js = ('// 자동 생성: NursingHelper/data/extra.json · variants.json → build_templates.py (직접 고치지 마세요)\n'
          'Object.assign(window.TEMPLATES, ' + json.dumps(clean, ensure_ascii=False, indent=1) + ');\n'
          'window.VARIANTS = ' + json.dumps(variants, ensure_ascii=False, indent=1) + ';\n'
          'Object.keys(window.VARIANTS).forEach(function (n) { window.TEMPLATES[n].keywords += "|" + window.VARIANTS[n].map(function (v) { return v.when; }).join("|"); });\n')
    open(JS, 'w', encoding='utf-8').write(js)
    print('%d개 진단, 질환별 추가 간호 %d개를 넣었어요' % (len(data), sum(len(v) for v in variants.values())))


if __name__ == '__main__':
    main()
