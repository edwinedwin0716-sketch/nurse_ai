#!/usr/bin/env python3
"""간호과정 도우미의 '한글(.hwpx)로 저장'에 쓰는 파일을 HWP 편집기에서 가져온다.

    python3 NursingHelper/build_hwpx.py
      → android/assets/hwpx-*.js  (휴대폰·웹: HWP 편집기의 HWPX 저장 코드 그대로)
      → src/HwpxTemplate.cs       (Windows: 빈 HWPX 뼈대를 C# 문자열로)
"""
import json, os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
EDITOR = os.path.join(os.path.dirname(HERE), 'HwpEditor', 'web')
ASSETS = os.path.join(HERE, 'android', 'assets')
FILES = {'vendor/pako.min.js': 'hwpx-pako.js', 'container.js': 'hwpx-container.js', 'template.js': 'hwpx-template.js',
         'model.js': 'hwpx-model.js', 'hwpx.js': 'hwpx-writer.js'}


def main():
    for src, dst in FILES.items():
        shutil.copyfile(os.path.join(EDITOR, src), os.path.join(ASSETS, dst))
    # template.js 의 JSON 부분을 C# 상수로
    js = open(os.path.join(EDITOR, 'template.js'), encoding='utf-8').read()
    t = json.loads(re.search(r'const HwpxTemplate = (\{.*\});', js, re.S).group(1))
    lit = lambda s: '@"' + s.replace('"', '""') + '"'
    cs = ['// 자동 생성: python3 NursingHelper/build_hwpx.py (HwpEditor/web/template.js 에서). 직접 고치지 마세요.',
          '// HWPX 뼈대: python-hwpx(Apache-2.0)의 Skeleton.hwpx. HwpEditor/NOTICE.md 참고.',
          'static class HwpxTemplate {']
    for k in ('header', 'secOpen', 'secPr', 'version', 'settings', 'container', 'manifest'):
        cs.append('    public const string %s = %s;' % (k[0].upper() + k[1:], lit(t[k])))
    cs.append('}')
    open(os.path.join(HERE, 'src', 'HwpxTemplate.cs'), 'w', encoding='utf-8').write('\n'.join(cs) + '\n')
    print('ok')


if __name__ == '__main__':
    main()
