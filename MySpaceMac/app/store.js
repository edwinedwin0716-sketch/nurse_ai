// 등록 목록 저장과 자동 추가 (macOS 기준, 테스트를 위해 경로는 밖에서 받는다)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATEGORIES = ['즐겨찾기', 'AI', '메신저', '업무', '게임', '문서', '도구'];
const WEBSITES = [['ChatGPT', 'https://chatgpt.com/'], ['Gemini', 'https://gemini.google.com/'], ['Higgsfield', 'https://higgsfield.ai/']];
const PATTERNS = [
  ['AI', /^(ChatGPT|Claude|Gemini|Copilot|Microsoft Copilot|Perplexity|Codex)$/i],
  ['메신저', /^(KakaoTalk|카카오톡|Discord( Canary| PTB)?|Slack|Telegram( Desktop)?|WhatsApp|LINE|Signal|Microsoft Teams.*|Messages|메시지|Zoom\.us|zoom\.us|Messenger|WeChat)$/i],
  ['업무', /^(Microsoft (Word|Excel|PowerPoint|Outlook|OneNote)|Pages|Numbers|Keynote|Hancom Office.*|한컴오피스.*|한글|Hwp.*|Notion|GoodNotes.*|Notability|Obsidian|Evernote|Adobe Acrobat.*|PDF Expert|Microsoft OneDrive|Google Drive)$/i],
  ['게임', /^(Steam|League of Legends|Riot Client|Battle\.net|Minecraft.*|Epic Games Launcher|Overwatch.*|Hearthstone|Civilization.*|GeForce NOW)$/i]
];
const TOOLS = /^(Safari|Google Chrome|Firefox|Arc|Microsoft Edge|Whale|Notes|메모|Calendar|캘린더|Reminders|미리 알림|Photos|사진|Preview|미리보기|System Settings|시스템 설정|Calculator|계산기|Finder|App Store|Music|음악|Visual Studio Code|Terminal|터미널)$/i;
const DOC_EXT = /\.(pdf|docx?|hwpx?|txt|pptx?|xlsx?|csv|md|rtf|pages|numbers|key|png|jpe?g|gif|heic|webp|mp4|mov|mp3|m4a|zip)$/i;
const SKIP = /^(\.|~\$|Icon\r?$)|\.(download|crdownload|part|tmp)$/i;
const PROTECTED = '학기중 학습 폴더';

function id() { return crypto.randomBytes(8).toString('hex'); }
function displayName(p) { const b = path.basename(p); return /\.app$/i.test(b) ? b.slice(0, -4) : b.replace(/\.[^.]+$/, '') || b; }

function category(p) {
  if (/^https?:/i.test(p)) return /chatgpt|claude|gemini|copilot|perplexity|higgsfield/i.test(p) ? 'AI' : '도구';
  if (/^steam:/i.test(p)) return '게임';
  const name = displayName(p);
  if (/\.app$/i.test(p)) {
    for (const [cat, re] of PATTERNS) if (re.test(name)) return cat;
    return '도구';
  }
  if (/ChatGPT|Claude|Gemini|Copilot|Higgsfield/i.test(name)) return 'AI';
  return '문서';
}

class Store {
  constructor(opts) {
    this.home = opts.home;
    this.file = path.join(opts.dataDir, 'items.json');
    this.appDirs = opts.appDirs || ['/Applications', '/System/Applications', path.join(this.home, 'Applications')];
    this.data = { categories: CATEGORIES.slice(), items: [], ignored: [], knownFiles: [], autoEnabled: true, opacity: 100, theme: 'system', size: 'medium', shortcut: 'Alt+Space', alwaysOnTop: false, showDock: true };
    fs.mkdirSync(opts.dataDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      try { Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
      catch (e) { fs.copyFileSync(this.file, this.file + '.broken'); }
      this.fresh = false;
    } else { this.fresh = true; }
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }
  get protectedDir() { return path.join(this.home, 'Desktop', PROTECTED); }

  has(p) { return this.data.items.some((i) => i.path === p); }
  add(p, opts = {}) {
    if (!p || this.has(p)) return null;
    const isUrl = /^(https?|steam):/i.test(p);
    if (!isUrl && !fs.existsSync(p)) return null;
    if (opts.auto && this.data.ignored.includes(p)) return null;
    if (opts.auto && (p === this.protectedDir || p.startsWith(this.protectedDir + path.sep))) return null;
    if (!opts.auto) this.data.ignored = this.data.ignored.filter((x) => x !== p);
    const cat = opts.category || (opts.auto ? category(p) : (opts.active && opts.active !== '전체' ? opts.active : category(p)));
    const item = { id: id(), name: opts.name || displayName(p), path: p, category: cat, pinned: !!opts.pinned };
    this.data.items.push(item);
    return item;
  }
  remove(itemId) {
    const it = this.data.items.find((i) => i.id === itemId);
    if (!it) return;
    this.data.items = this.data.items.filter((i) => i.id !== itemId);
    if (!this.data.ignored.includes(it.path)) this.data.ignored.push(it.path);
  }
  update(itemId, patch) {
    const it = this.data.items.find((i) => i.id === itemId);
    if (it) Object.assign(it, patch);
    return it;
  }

  listApps() {
    const out = [];
    for (const dir of this.appDirs) {
      let names = [];
      try { names = fs.readdirSync(dir); } catch (e) { continue; }
      for (const n of names) {
        if (/\.app$/i.test(n)) out.push(path.join(dir, n));
        else if (!n.startsWith('.')) { // 한 단계 아래 폴더 (예: /Applications/Microsoft Office/…)
          try { if (fs.statSync(path.join(dir, n)).isDirectory()) for (const m of fs.readdirSync(path.join(dir, n))) if (/\.app$/i.test(m)) out.push(path.join(dir, n, m)); } catch (e) { }
        }
      }
    }
    return out;
  }
  listFiles() {
    const out = [];
    for (const d of ['Desktop', 'Downloads']) {
      const dir = path.join(this.home, d);
      let names = [];
      try { names = fs.readdirSync(dir); } catch (e) { continue; }
      for (const n of names) if (!SKIP.test(n)) out.push(path.join(dir, n));
    }
    return out;
  }

  // 첫 실행: 웹사이트 · 기본 폴더 · 아는 앱(AI·메신저·업무·게임·자주 쓰는 도구)만 등록하고, 나머지는 '이미 있던 파일'로 기억
  firstRun() {
    for (const [name, url] of WEBSITES) this.add(url, { name, category: 'AI', pinned: true, auto: true });
    for (const d of ['Documents', 'Downloads', 'Desktop']) this.add(path.join(this.home, d), { category: '즐겨찾기', pinned: true });
    if (fs.existsSync(this.protectedDir)) this.add(this.protectedDir, { category: '즐겨찾기', pinned: true });
    for (const app of this.listApps()) {
      const name = displayName(app), cat = category(app);
      if (cat !== '도구' || TOOLS.test(name)) this.add(app, { auto: true, pinned: cat === 'AI' || cat === '메신저' });
    }
    this.data.knownFiles = this.listFiles().concat(this.listApps());
    this.syncSteam();
    this.save();
  }
  // 실행 중 15초마다: 새로 생긴 앱·파일만 추가
  sync() {
    if (!this.data.autoEnabled) return 0;
    const before = this.data.items.length, known = new Set(this.data.knownFiles);
    let changed = false;
    for (const p of this.listApps().concat(this.listFiles())) {
      if (known.has(p)) continue;
      known.add(p); this.data.knownFiles.push(p); changed = true;
      this.add(p, { auto: true });
    }
    const steam = this.syncSteam();
    const added = this.data.items.length - before;
    if (changed || added || steam) this.save();
    return added;
  }
  syncSteam(root) {
    const apps = path.join(root || path.join(this.home, 'Library', 'Application Support', 'Steam'), 'steamapps');
    let names = [];
    try { names = fs.readdirSync(apps).filter((n) => /^appmanifest_\d+\.acf$/.test(n)); } catch (e) { return 0; }
    let added = 0;
    for (const n of names) {
      let t = '';
      try { t = fs.readFileSync(path.join(apps, n), 'utf8'); } catch (e) { continue; }
      const appid = (/"appid"\s+"(\d+)"/.exec(t) || [])[1], name = (/"name"\s+"([^"]+)"/.exec(t) || [])[1];
      const dir = (/"installdir"\s+"([^"]+)"/.exec(t) || [])[1], state = +((/"StateFlags"\s+"(\d+)"/.exec(t) || [])[1] || 0);
      if (!appid || !dir || !(state & 4) || !fs.existsSync(path.join(apps, 'common', dir))) continue;
      const uri = 'steam://rungameid/' + appid;
      if (this.data.ignored.includes(uri) || this.data.items.some((i) => i.path === uri || i.name === name)) continue;
      this.data.items.push({ id: id(), name, path: uri, category: '게임', pinned: false }); added++;
    }
    return added;
  }
}

module.exports = { Store, category, displayName, CATEGORIES };
