// node test/discovery.test.js — 자동 추가 규칙 확인 (가짜 홈 폴더 사용)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { Store, category } = require('../app/store');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myspace-'));
const home = path.join(root, 'home'), apps = path.join(root, 'Applications'), data = path.join(root, 'data');
const mk = (p, dir) => { fs.mkdirSync(path.dirname(p), { recursive: true }); dir ? fs.mkdirSync(p, { recursive: true }) : fs.writeFileSync(p, 'x'); };
for (const d of ['Documents', 'Downloads', 'Desktop']) mk(path.join(home, d), true);
mk(path.join(home, 'Desktop', '학기중 학습 폴더'), true);
mk(path.join(home, 'Desktop', '예전 파일.pdf'));
for (const a of ['KakaoTalk.app', 'ChatGPT.app', 'Safari.app', 'Steam.app', 'Chess.app']) mk(path.join(apps, a), true);
mk(path.join(apps, 'Microsoft Office', 'Microsoft Word.app'), true);
const steam = path.join(home, 'Library', 'Application Support', 'Steam', 'steamapps');
mk(path.join(steam, 'common', 'Hades'), true);
fs.writeFileSync(path.join(steam, 'appmanifest_1145360.acf'), '"appid" "1145360" "name" "Hades" "installdir" "Hades" "StateFlags" "4"');

let s = new Store({ home, dataDir: data, appDirs: [apps] });
assert.ok(s.fresh); s.firstRun();
const names = s.data.items.map((i) => i.name + ':' + i.category);
assert.ok(names.includes('KakaoTalk:메신저') && names.includes('ChatGPT:AI') && names.includes('Microsoft Word:업무') && names.includes('Steam:게임') && names.includes('Safari:도구'), names.join(', '));
assert.ok(!names.some((n) => n.startsWith('Chess')), 'unknown apps are not added on first run');
assert.ok(!names.some((n) => n.startsWith('예전 파일')), 'existing desktop files are not imported');
assert.ok(names.includes('Hades:게임'), 'steam game');
assert.ok(names.includes('학기중 학습 폴더:즐겨찾기'), 'protected folder link');
assert.ok(s.data.items.find((i) => i.name === 'KakaoTalk').pinned, 'messenger pinned');

mk(path.join(home, 'Downloads', '실습일지.hwp')); mk(path.join(home, 'Downloads', 'a.crdownload')); mk(path.join(home, 'Desktop', '학기중 학습 폴더', '1주차.pdf'));
mk(path.join(apps, 'Discord.app'), true);
assert.strictEqual(s.sync(), 2, 'new file + new app');
const added = s.data.items.slice(-2).map((i) => i.name + ':' + i.category).sort();
assert.deepStrictEqual(added, ['Discord:메신저', '실습일지:문서']);
assert.strictEqual(s.sync(), 0, 'no duplicates');

const kakao = s.data.items.find((i) => i.name === 'KakaoTalk');
s.remove(kakao.id); s.save();
s = new Store({ home, dataDir: data, appDirs: [apps] });
assert.ok(!s.fresh && !s.has(kakao.path) && s.data.ignored.includes(kakao.path), 'removed item remembered');
s.data.knownFiles = s.data.knownFiles.filter((p) => p !== kakao.path); s.sync();
assert.ok(!s.has(kakao.path), 'removed item is not re-added');
assert.strictEqual(category('https://chatgpt.com/'), 'AI');
assert.strictEqual(category('/x/보고서.pdf'), '문서');
fs.rmSync(root, { recursive: true, force: true });
console.log('MySpace store tests passed');
