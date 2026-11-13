#!/usr/bin/env python3
"""등불 원정대: web/index.html + web/peerjs.min.js(온라인 연결용, MIT)를 한 파일 HTML로 묶는다.

    python3 Lantern/build.py      → dist/등불원정대.html (PC·Windows·웹앱), android/assets/index.html
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TAG = '<script src="peerjs.min.js"></script>'


def main():
    html = open(os.path.join(HERE, 'web', 'index.html'), encoding='utf-8').read()
    peer = open(os.path.join(HERE, 'web', 'peerjs.min.js'), encoding='utf-8').read()
    peer = peer.replace('//# sourceMappingURL=peerjs.min.js.map', '').strip()
    if TAG not in html or '</script' in peer.lower():
        raise SystemExit('묶을 자리를 찾지 못했어요')
    out = html.replace(TAG, '<script>/* PeerJS 1.5.4 (MIT) — Lantern/NOTICE.md */\n' + peer + '\n</script>', 1)
    for p in (os.path.join(HERE, 'dist', '등불원정대.html'), os.path.join(HERE, 'android', 'assets', 'index.html')):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(out)
        print(p, len(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
