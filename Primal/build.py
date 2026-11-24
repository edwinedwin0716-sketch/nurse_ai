#!/usr/bin/env python3
"""원시섬 0.3: web/index.html + three.min.js(3D 그리기, MIT) + textures.js(절차적 PBR) + assets.js(STL 모형) + models.js + game.js 를 한 파일 HTML로 묶는다.

    python3 Primal/build.py      → dist/원시섬.html (웹앱·Windows·실험 서버), android/assets/index.html,
                                   Primal-Local-0.3.zip (실험 서버 꾸러미)
"""
import os, re, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
TAG = '<script src="three.min.js"></script>'
SCRIPTS = ('textures.js', 'assets.js', 'models.js', 'game.js')
VERSION = '0.3'


def main():
    html = open(os.path.join(HERE, 'web', 'index.html'), encoding='utf-8').read()
    three = open(os.path.join(HERE, 'web', 'three.min.js'), encoding='utf-8').read()
    three = re.sub(r'^console\.warn\([^)]*\)', 'void 0', three, count=1)   # "build/three.min.js deprecated" 안내 지우기
    if TAG not in html or '</script' in three.lower():
        raise SystemExit('묶을 자리를 찾지 못했어요')
    out = html.replace(TAG, '<script>/* three.js r158 (MIT) — Primal/NOTICE.md */\n' + three + '\n</script>', 1)
    for f in SCRIPTS:
        tag = '<script src="%s"></script>' % f
        js = open(os.path.join(HERE, 'web', f), encoding='utf-8').read()
        if tag not in out or '</script' in js.lower():
            raise SystemExit(f + ' 을 묶지 못했어요')
        out = out.replace(tag, '<script>\n' + js + '\n</script>', 1)
    for p in (os.path.join(HERE, 'dist', '원시섬.html'), os.path.join(HERE, 'android', 'assets', 'index.html')):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(out)
        print(p, len(out) // 1024, 'KB')

    # 실험 서버 꾸러미 (같은 폴더에서 서버 켜기.bat → 브라우저)
    zp = os.path.join(HERE, 'Primal-Local-%s.zip' % VERSION)
    root = '원시섬-실험서버/'
    files = [(os.path.join(HERE, 'dist', '원시섬.html'), '원시섬.html'),
             (os.path.join(HERE, 'server', 'server.js'), 'server.js'),
             (os.path.join(HERE, 'server', '사용법.txt'), '사용법.txt'),
             (os.path.join(HERE, 'server', '서버 켜기.bat'), '서버 켜기.bat'),
             (os.path.join(HERE, 'NOTICE.md'), 'NOTICE.md')]
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo(root), '')
        for src, name in files:
            z.write(src, root + name)
    print(zp, os.path.getsize(zp) // 1024, 'KB')


if __name__ == '__main__':
    main()
