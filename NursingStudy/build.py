#!/usr/bin/env python3
"""간호 공부방: content/*.json(주제 하나 = 파일 하나)을 검사하고 web/을 한 파일 HTML로 묶는다.

    python3 NursingStudy/build.py      → dist/간호공부방.html (PC·Windows), android/assets/index.html
"""
import glob, json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, 'web')
SUBJECTS = ['기본간호학', '기본간호술기', '성인간호학', '아동간호학', '모성간호학', '정신간호학', '지역사회간호학', '간호관리학']
NEED = ['id', 'subject', 'kind', 'title', 'summary', 'sections', 'quiz']


def check(f, t):
    name = os.path.basename(f)[:-5]
    bad = lambda m: sys.exit('%s: %s' % (name, m))
    for k in NEED:
        if k not in t: bad('빠진 항목 ' + k)
    if t['id'] != name: bad('id와 파일 이름이 달라요')
    if t['subject'] not in SUBJECTS: bad('과목 이름 ' + t['subject'])
    if t['kind'] not in ('개념', '술기'): bad('kind는 개념/술기')
    if t['kind'] == '술기' and not t.get('steps'): bad('술기에는 steps가 필요해요')
    for i, q in enumerate(t['quiz']):
        if not (2 <= len(q.get('options', [])) <= 6) or not isinstance(q.get('answer'), int) or not 0 <= q['answer'] < len(q['options']):
            bad('문제 %d의 보기·정답 번호' % (i + 1))
        if not q.get('explain'): bad('문제 %d 해설이 없어요' % (i + 1))
    for v in t.get('videos', []):
        if 'http' in json.dumps(v): bad('영상은 주소 대신 검색어(query)로')


TIME = re.compile(r'^D-?\d+ ([01]\d|2[0-3]):[0-5]\d$')


def check_case(f, c, topic_ids):
    name = os.path.basename(f)[:-5]
    bad = lambda m: sys.exit('사례 %s: %s' % (name, m))
    for k in ('id', 'title', 'patient', 'stages', 'vitals', 'debrief'):
        if k not in c: bad('빠진 항목 ' + k)
    if c['id'] != name: bad('id와 파일 이름이 달라요')
    for key in ('stages', 'vitals', 'orders', 'labs', 'docs', 'notes', 'io'):
        for x in c.get(key, []):
            if not TIME.match(x.get('time', '')): bad('%s 시간 형식 %r' % (key, x.get('time')))
    for s in c['stages']:
        for q in s.get('ask', []):
            if not isinstance(q.get('answer'), int) or not 0 <= q['answer'] < len(q.get('options', [])): bad('질문 정답 번호: ' + q.get('q', '')[:30])
    for r in c.get('related', []):
        if r not in topic_ids: bad('related에 없는 주제 ' + r)
    if 'http' in json.dumps(c): bad('주소(http)는 넣지 않아요')


def main():
    topics = []
    for f in sorted(glob.glob(os.path.join(WEB, 'content', '*.json'))):
        t = json.load(open(f, encoding='utf-8')); check(f, t)
        t.pop('check', None)  # 사람이 볼 확인 목록은 앱에 넣지 않는다
        topics.append(t)
    order = {s: i for i, s in enumerate(SUBJECTS)}
    topics.sort(key=lambda t: (order[t['subject']], t['kind'] != '개념', t['title']))
    cases = []
    for f in sorted(glob.glob(os.path.join(WEB, 'content', 'cases', '*.json'))):
        c = json.load(open(f, encoding='utf-8')); check_case(f, c, {t['id'] for t in topics})
        c.pop('check', None); cases.append(c)
    data = 'window.CASES = ' + json.dumps(cases, ensure_ascii=False, separators=(',', ':')) + ';\nwindow.TOPICS = ' + json.dumps(topics, ensure_ascii=False, separators=(',', ':')) + ';'
    app = open(os.path.join(WEB, 'app.js'), encoding='utf-8').read()
    emr = open(os.path.join(WEB, 'emr.js'), encoding='utf-8').read()
    tags = ['<script>\n' + js.replace('</script', '<\\/script') + '\n</script>' for js in (data, app, emr)]
    html = open(os.path.join(WEB, 'index.html'), encoding='utf-8').read().replace('<!--SCRIPTS-->', '\n'.join(tags))
    os.makedirs(os.path.join(HERE, 'dist'), exist_ok=True)
    out = os.path.join(HERE, 'dist', '간호공부방.html')
    open(out, 'w', encoding='utf-8').write(html)
    assets = os.path.join(HERE, 'android', 'assets'); os.makedirs(assets, exist_ok=True)
    shutil.copy(out, os.path.join(assets, 'index.html'))
    print('주제 %d개 · 문제 %d개 · 가상 환자 %d명 → %s' % (len(topics), sum(len(t['quiz']) for t in topics), len(cases), out))


if __name__ == '__main__':
    main()
