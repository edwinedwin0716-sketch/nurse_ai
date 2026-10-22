#!/usr/bin/env python3
"""깃허브 페이지(docs/)를 만든다: 다운로드 모음 페이지 + 아이폰·Mac용 웹앱(간호과정 도우미, 간호 공부방, 플래시카드).

    python3 StudyHelper/build.py        # 플래시카드 한 파일 묶기 (먼저)
    python3 tools/build_pages.py        # docs/ 다시 만들기
    python3 tools/build_pages.py --artifact out.html   # 그림을 안에 넣은 한 파일짜리 다운로드 페이지
"""
import base64, hashlib, os, shutil, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
PAGES = 'https://edwinedwin0716-sketch.github.io/nurse_ai/'
IMGS = {'nurse': 'nurse.jpg', 'flash': 'flash.jpg', 'myspace': 'myspace.jpg', 'spot': 'spot.jpg', 'matjip': 'matjip.png', 'study': 'study.jpg'}

APPS = {
    'nursing': dict(name='간호과정 도우미', short='간호과정', color='#F2F2F7', status='default',
                    icon='NursingHelper/android/res/mipmap-xxxhdpi/ic_launcher.png',
                    files=['NursingHelper/android/assets/index.html', 'NursingHelper/android/assets/app.js',
                           'NursingHelper/android/assets/engine.js', 'NursingHelper/android/assets/templates.js', 'NursingHelper/android/assets/templates-extra.js'],
                    desc='자료를 넣으면 간호진단을 추천하고 간호과정의 큰 틀을 만들어 줘요.'),
    'study': dict(name='간호 공부방', short='간호공부방', color='#0B1430', status='black-translucent',
                  icon='NursingStudy/android/res/mipmap-xxxhdpi/ic_launcher.png',
                  files=['NursingStudy/dist/간호공부방.html'],
                  desc='간호학 개념·술기를 공부하고 문제로 스스로 점검해요.'),
    'flashcards': dict(name='플래시카드', short='플래시카드', color='#F2F2F7', status='default',
                       icon='StudyHelper/android/res/mipmap-xxxhdpi/ic_launcher.png',
                       files=['StudyHelper/dist/플래시카드.html'],
                       desc='필기 · 형광펜 친 부분으로 플래시카드와 문제를 만들어 외워요.'),
}

SW = """// 한 번 열면 인터넷 없이도 열리게 저장해 두고, 인터넷이 되면 뒤에서 새 버전으로 바꾼다.
const CACHE = '%(cache)s';
const FILES = %(files)s;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit || c.match('./index.html'));
    return hit || net;
  })));
});
"""

HEAD = """<meta name="theme-color" content="%(color)s">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="%(status)s">
<meta name="apple-mobile-web-app-title" content="%(short)s">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
"""
REG = """<script>if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});</script>
"""


def read(p):
    return open(os.path.join(ROOT, p), encoding='utf-8').read()


def icons(src, out, bg):
    im = Image.open(os.path.join(ROOT, src)).convert('RGBA')
    for s in (192, 512):
        im.resize((s, s), Image.LANCZOS).save(os.path.join(out, 'icon-%d.png' % s))
    flat = Image.new('RGBA', im.size, bg); flat.alpha_composite(im)
    flat.convert('RGB').resize((180, 180), Image.LANCZOS).save(os.path.join(out, 'apple-touch-icon.png'))


def build_app(key, a):
    out = os.path.join(DOCS, key)
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    names = []
    for f in a['files']:
        name = 'index.html' if f.endswith('.html') else os.path.basename(f)
        text = read(f)
        if name == 'index.html':
            text = text.replace('</title>', '</title>\n' + HEAD % a, 1)
            text = (REG + '</body>').join(text.rsplit('</body>', 1))  # 마지막 </body> (스크립트 문자열 속 </body>는 건드리지 않는다)
        open(os.path.join(out, name), 'w', encoding='utf-8').write(text)
        names.append(name)
    icons(a['icon'], out, a['color'])
    open(os.path.join(out, 'manifest.webmanifest'), 'w', encoding='utf-8').write(
        '{\n  "name": "%s",\n  "short_name": "%s",\n  "description": "%s",\n  "lang": "ko",\n  "start_url": "./",\n  "scope": "./",\n'
        '  "display": "standalone",\n  "background_color": "%s",\n  "theme_color": "%s",\n  "icons": [\n'
        '    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },\n'
        '    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }\n  ]\n}\n'
        % (a['name'], a['short'], a['desc'], a['color'], a['color']))
    files = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'] + ['./' + n for n in names if n != 'index.html']
    h = hashlib.sha1(''.join(read(f) for f in a['files']).encode()).hexdigest()[:10]
    open(os.path.join(out, 'sw.js'), 'w', encoding='utf-8').write(SW % {'cache': key + '-' + h, 'files': repr(files).replace("'", '"')})


def download_page(web, img):
    body = read('tools/download_page.html').replace('{{WEB}}', web)
    for k, v in img.items():
        body = body.replace('{{IMG_%s}}' % k, v)
    return body


def main():
    if '--artifact' in sys.argv:
        out = sys.argv[sys.argv.index('--artifact') + 1]
        img = {}
        for k, f in IMGS.items():
            mime = 'image/png' if f.endswith('.png') else 'image/jpeg'
            img[k] = 'data:%s;base64,%s' % (mime, base64.b64encode(open(os.path.join(ROOT, 'tools/img', f), 'rb').read()).decode())
        open(out, 'w', encoding='utf-8').write(download_page(PAGES, img))
        print(out); return
    os.makedirs(DOCS, exist_ok=True)
    for k, a in APPS.items():
        build_app(k, a)
    shutil.rmtree(os.path.join(DOCS, 'img'), ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, 'tools/img'), os.path.join(DOCS, 'img'))
    page = download_page('./', {k: 'img/' + f for k, f in IMGS.items()})
    open(os.path.join(DOCS, 'index.html'), 'w', encoding='utf-8').write(
        '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<link rel="icon" type="image/png" href="nursing/icon-192.png">\n' + page + '\n</html>\n')  # 템플릿 앞부분(title·style)은 head, 나머지는 body로 들어간다
    open(os.path.join(DOCS, '.nojekyll'), 'w').close()
    print('docs/ ready')


if __name__ == '__main__':
    main()
