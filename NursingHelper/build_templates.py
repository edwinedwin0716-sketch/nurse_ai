#!/usr/bin/env python3
"""추가 진단(data/extra.json)을 PC용 Templates.ps1과 휴대폰·웹용 templates-extra.js에 똑같이 넣는다.

    python3 NursingHelper/build_templates.py
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'data', 'extra.json')
PS = os.path.join(HERE, 'src', 'Templates.ps1')
JS = os.path.join(HERE, 'android', 'assets', 'templates-extra.js')
BEGIN = '# >>> 추가 진단'
END = '# <<< 추가 진단'
FIELDS = ['en', 'domain', 'cls', 'page', 'problem', 'priority', 'reason', 'evalData', 'keywords', 'cause', 'long', 'short', 'diag', 'ther', 'edu']


def check(name, t):
    miss = [f for f in FIELDS if f not in t]
    if miss: sys.exit('%s: 빠진 항목 %s' % (name, miss))
    if len(t['short']) != 2 or not 2 <= len(t['diag']) <= 4 or not 3 <= len(t['ther']) <= 6 or not 1 <= len(t['edu']) <= 3:
        sys.exit('%s: 목표·계획 개수가 이상해요' % name)
    if not isinstance(t['priority'], int) or not 1 <= t['priority'] <= 7: sys.exit('%s: priority' % name)
    re.compile(t['keywords'], re.I)
    if '{' in json.dumps(t['short'], ensure_ascii=False): sys.exit('%s: 목표에 {자리표시}가 남았어요' % name)


def q(s):  # PowerShell 작은따옴표 문자열
    return "'" + str(s).replace("'", "''") + "'"


def items(lst):
    return '@(\n' + ',\n'.join("        @{plan=%s;why=%s}" % (q(x['plan']), q(x['why'])) for x in lst) + ')'


def ps_entry(name, t):
    page = str(t['page']) if t['page'] else '$null'
    return ("$script:Templates[%s] = @{\n" % q(name) +
            "    en = %s\n    domain = %s\n    cls = %s\n    page = %s\n    problem = %s\n    priority = %d\n" % (q(t['en']), q(t['domain']), q(t['cls']), page, q(t['problem']), t['priority']) +
            "    reason = %s\n    evalData = %s\n    keywords = %s\n    cause = %s\n    long = %s\n" % (q(t['reason']), q(t['evalData']), q(t['keywords']), q(t['cause']), q(t['long'])) +
            "    short = @(%s)\n" % ','.join(q(x) for x in t['short']) +
            "    diag = %s\n    ther = %s\n    edu = %s\n}\n" % (items(t['diag']), items(t['ther']), items(t['edu'])))


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    for n, t in data.items(): check(n, t)
    ps = open(PS, encoding='utf-8').read()
    a, b = ps.index(BEGIN), ps.index(END)
    head = ps[:a] + ps[a:ps.index('\n', a) + 1]
    ps = head + ''.join(ps_entry(n, t) for n, t in data.items()) + ps[b:]
    open(PS, 'w', encoding='utf-8').write(ps)
    clean = {n: {f: t[f] for f in FIELDS} for n, t in data.items()}
    open(JS, 'w', encoding='utf-8').write('// 자동 생성: NursingHelper/data/extra.json → build_templates.py (직접 고치지 마세요)\n'
                                         'Object.assign(window.TEMPLATES, ' + json.dumps(clean, ensure_ascii=False, indent=1) + ');\n')
    print('%d개 진단을 넣었어요' % len(data))


if __name__ == '__main__':
    main()
