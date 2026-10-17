#!/usr/bin/env python3
"""Bundle the web app into one HTML file (PC: double-click to open) and the Android assets."""
import os, shutil
here = os.path.dirname(os.path.abspath(__file__))
web = os.path.join(here, 'web')
order = ['vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/jszip.min.js', 'cmaps.js', 'extract.js', 'study.js', 'app.js']
tags = []
for f in order:
    js = open(os.path.join(web, f), encoding='utf-8').read().replace('</script', '<\\/script')
    tags.append('<script>\n' + js + '\n</script>')
html = open(os.path.join(web, 'index.html'), encoding='utf-8').read().replace('<!--SCRIPTS-->', '\n'.join(tags))
os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
out = os.path.join(here, 'dist', '플래시카드.html')
open(out, 'w', encoding='utf-8').write(html)
assets = os.path.join(here, 'android', 'assets')
os.makedirs(assets, exist_ok=True)
shutil.copy(out, os.path.join(assets, 'index.html'))
print(out, os.path.getsize(out))
