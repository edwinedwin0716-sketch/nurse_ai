#!/usr/bin/env python3
"""간호과정 도우미 휴대폰·웹 화면(android/assets)을 한 파일 HTML로 묶는다. Windows판이 이 파일을 Edge 앱 창으로 연다.

    python3 NursingHelper/build_web.py   → dist/간호과정도우미.html
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'android', 'assets')


def main():
    html = open(os.path.join(ASSETS, 'index.html'), encoding='utf-8').read()

    def script(m):
        code = open(os.path.join(ASSETS, m.group(1)), encoding='utf-8').read().replace('</script', '<\\/script')
        return '<script>\n' + code + '\n</script>'
    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    os.makedirs(os.path.join(HERE, 'dist'), exist_ok=True)
    open(os.path.join(HERE, 'dist', '간호과정도우미.html'), 'w', encoding='utf-8').write(html)
    print('ok', len(html) // 1024, 'KB')


if __name__ == '__main__':
    main()
