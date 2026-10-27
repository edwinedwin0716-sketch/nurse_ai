#!/usr/bin/env python3
"""HWP 편집기: web/ 을 한 파일 HTML로 묶는다.

    python3 HwpEditor/build.py   → dist/HWP편집기.html (PC·Windows·웹앱), android/assets/index.html
"""
import os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, 'web')


def read(name):
    return open(os.path.join(WEB, name), encoding='utf-8').read()


def bundle():
    html = read('index.html')
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + read('style.css') + '</style>')

    def script(m):
        code = read(m.group(1)).replace('</script', '<\\/script')
        return '<script>\n' + code + '\n</script>'
    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    return html


def main():
    html = bundle()
    os.makedirs(os.path.join(HERE, 'dist'), exist_ok=True)
    os.makedirs(os.path.join(HERE, 'android', 'assets'), exist_ok=True)
    open(os.path.join(HERE, 'android', 'assets', 'index.html'), 'w', encoding='utf-8').write(html)
    # PC·웹용엔 글꼴 파일이 없으니 글꼴 규칙을 빼서 없는 파일을 찾지 않게 한다
    web = re.sub(r'@font-face \{ font-family: HwpSerif;[^}]*\}\n', '', html)
    open(os.path.join(HERE, 'dist', 'HWP편집기.html'), 'w', encoding='utf-8').write(web)
    # 안드로이드는 명조 글꼴이 없는 기기가 많아 나눔명조(OFL)를 앱에 넣는다
    fonts = os.path.join(HERE, 'android', 'assets', 'fonts')
    shutil.rmtree(fonts, ignore_errors=True)
    shutil.copytree(os.path.join(HERE, 'fonts'), fonts)
    print('ok', len(html) // 1024, 'KB')


if __name__ == '__main__':
    main()
