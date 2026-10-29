#!/usr/bin/env python3
"""간호과정 도우미의 '한글(.hwpx)로 저장'에 쓰는 파일을 HWP 편집기에서 가져온다.

    python3 NursingHelper/build_hwpx.py
      → android/assets/hwpx-*.js  (휴대폰·웹: HWP 편집기의 HWPX 저장 코드 그대로)
"""
import os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
EDITOR = os.path.join(os.path.dirname(HERE), 'HwpEditor', 'web')
ASSETS = os.path.join(HERE, 'android', 'assets')
FILES = {'vendor/pako.min.js': 'hwpx-pako.js', 'container.js': 'hwpx-container.js', 'template.js': 'hwpx-template.js',
         'model.js': 'hwpx-model.js', 'hwpx.js': 'hwpx-writer.js'}


def main():
    for src, dst in FILES.items():
        shutil.copyfile(os.path.join(EDITOR, src), os.path.join(ASSETS, dst))
    print('ok')


if __name__ == '__main__':
    main()
