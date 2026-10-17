// node build/package.js — macOS용 MySpace.app 만들기 (Apple 실리콘 · 인텔)
'use strict';
const { packager } = require('@electron/packager');
(async () => {
  const out = await packager({
    dir: '.', out: 'dist', overwrite: true, platform: 'darwin', arch: ['arm64', 'x64'],
    name: 'MySpace', executableName: 'MySpace', appBundleId: 'kr.nurseai.myspace', appCategoryType: 'public.app-category.productivity',
    icon: 'build/icon.icns', appVersion: require('../package.json').version, appCopyright: 'MySpace',
    ignore: [/^\/dist/, /^\/test/, /^\/build/, /^\/README/, /\.md$/],
    extendInfo: { LSUIElement: false, NSHumanReadableCopyright: 'MySpace 런처', CFBundleDevelopmentRegion: 'ko' },
    prune: true, asar: true
  });
  console.log(out.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
