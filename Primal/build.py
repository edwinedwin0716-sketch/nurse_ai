#!/usr/bin/env python3
"""원시섬: web/index.html + web/three.min.js(3D 그리기, MIT)를 한 파일 HTML로 묶는다.

    python3 Primal/build.py      → dist/원시섬.html (웹앱·Windows·실험 서버), android/assets/index.html
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
TAG = '<script src="three.min.js"></script>'


def main():
    html = open(os.path.join(HERE, 'web', 'index.html'), encoding='utf-8').read()
    three = open(os.path.join(HERE, 'web', 'three.min.js'), encoding='utf-8').read()
    three = re.sub(r'^console\.warn\([^)]*\)', 'void 0', three, count=1)   # "build/three.min.js deprecated" 안내 지우기
    if TAG not in html or '</script' in three.lower():
        raise SystemExit('묶을 자리를 찾지 못했어요')
    out = html.replace(TAG, '<script>/* three.js r158 (MIT) — Primal/NOTICE.md */\n' + three + '\n</script>', 1)
    for p in (os.path.join(HERE, 'dist', '원시섬.html'), os.path.join(HERE, 'android', 'assets', 'index.html')):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(out)
        print(p, len(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
