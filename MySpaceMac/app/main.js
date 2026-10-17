// MySpace 런처 (macOS) — Electron 메인 프로세스
'use strict';
const { app, BrowserWindow, ipcMain, Menu, Tray, shell, screen, globalShortcut, nativeImage, dialog, net, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');

const isMac = process.platform === 'darwin';
const ROWS = { small: 2, medium: 3, large: 4 };
const SHORTCUTS = ['Alt+Space', 'CommandOrControl+Shift+Space', 'Control+Alt+Space', 'CommandOrControl+Shift+M'];
let win = null, tray = null, store = null, timer = null, quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

function iconDir() { const d = path.join(app.getPath('userData'), 'icons'); fs.mkdirSync(d, { recursive: true }); return d; }

// 화면 아래 가운데 (Dock 위)
function dock() {
  if (!win) return;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const w = Math.min(1100, area.width - 32), h = Math.min(138 + 112 * (ROWS[store.data.size] || 3), area.height - 32);
  win.setBounds({ x: Math.round(area.x + (area.width - w) / 2), y: Math.round(area.y + area.height - h - 12), width: w, height: h });
}
function showWindow() { if (!win) return; dock(); win.show(); win.focus(); win.webContents.send('focus-search'); }
function toggleWindow() { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWindow(); }

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 474, show: false, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    transparent: true, backgroundColor: '#00000000', hasShadow: true, roundedCorners: true,
    vibrancy: isMac ? 'under-window' : undefined, visualEffectState: 'active',
    alwaysOnTop: store.data.alwaysOnTop, title: 'MySpace',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setOpacity((store.data.opacity || 100) / 100);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.once('ready-to-show', () => { dock(); win.show(); });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function registerShortcut() {
  globalShortcut.unregisterAll();
  let ok = false;
  try { ok = globalShortcut.register(store.data.shortcut, toggleWindow); } catch (e) { ok = false; }
  return ok;
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'ui', 'trayTemplate.png'));
  if (isMac) img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('MySpace');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '열기', click: showWindow },
    { label: '숨기기', click: () => win && win.hide() },
    { type: 'separator' },
    { label: 'MySpace 종료', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', toggleWindow);
}

// 아이콘: 앱·파일은 macOS가 주는 큰 아이콘, 웹사이트는 로고를 내려받아 저장
async function iconFor(p) {
  if (/^steam:/i.test(p)) return null;
  if (/^https?:/i.test(p)) {
    let host = ''; try { host = new URL(p).hostname.toLowerCase(); } catch (e) { return null; }
    const file = path.join(iconDir(), host + '.png');
    if (fs.existsSync(file) && fs.statSync(file).size > 100) return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    try {
      const res = await net.fetch('https://www.google.com/s2/favicons?sz=128&domain_url=' + encodeURIComponent(p));
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer()), img = nativeImage.createFromBuffer(buf);
      if (img.isEmpty() || img.getSize().width < 32) return null;
      fs.writeFileSync(file, img.toPNG());
      return img.toDataURL();
    } catch (e) { return null; }
  }
  try {
    if (isMac) { const t = await nativeImage.createThumbnailFromPath(p, { width: 128, height: 128 }); if (!t.isEmpty()) return t.toDataURL(); }
  } catch (e) { }
  try { const i = await app.getFileIcon(p, { size: 'large' }); if (!i.isEmpty()) return i.toDataURL(); } catch (e) { }
  return null;
}

function state() { return { data: store.data, platform: process.platform, shortcuts: SHORTCUTS, shortcutOk: store.shortcutOk, darkSystem: nativeTheme.shouldUseDarkColors }; }
function changed() { store.save(); if (win) win.webContents.send('state', state()); }

function setupIpc() {
  ipcMain.handle('state', () => state());
  ipcMain.handle('icon', (e, p) => iconFor(p));
  ipcMain.handle('open', async (e, p) => {
    if (/^(https?|steam):/i.test(p)) { await shell.openExternal(p); return ''; }
    if (!fs.existsSync(p)) return '파일을 찾을 수 없어요. 옮겨졌거나 지워졌을 수 있어요.';
    return shell.openPath(p);
  });
  ipcMain.handle('reveal', (e, p) => { if (fs.existsSync(p)) shell.showItemInFolder(p); });
  ipcMain.handle('add-paths', (e, paths, active) => { let n = 0; for (const p of paths) if (store.add(p, { active })) n++; changed(); return n; });
  ipcMain.handle('add-url', (e, name, url, active) => { if (!/^https?:\/\//i.test(url)) url = 'https://' + url; const it = store.add(url, { name: name || undefined, active }); changed(); return !!it; });
  ipcMain.handle('pick', async (e, kind, active) => {
    const r = await dialog.showOpenDialog(win, { properties: kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'], defaultPath: kind === 'app' ? '/Applications' : app.getPath('home') });
    if (r.canceled) return 0;
    let n = 0; for (const p of r.filePaths) if (store.add(p, { active })) n++; changed(); return n;
  });
  ipcMain.handle('update', (e, itemId, patch) => { store.update(itemId, patch); changed(); });
  ipcMain.handle('remove', (e, itemId) => { store.remove(itemId); changed(); });
  ipcMain.handle('add-category', (e, name) => { if (name && name !== '전체' && !store.data.categories.includes(name)) store.data.categories.push(name); changed(); });
  ipcMain.handle('set', (e, patch) => {
    Object.assign(store.data, patch);
    if ('opacity' in patch && win) win.setOpacity(Math.max(30, Math.min(100, patch.opacity)) / 100);
    if ('alwaysOnTop' in patch && win) win.setAlwaysOnTop(!!patch.alwaysOnTop, 'floating');
    if ('size' in patch) dock();
    if ('shortcut' in patch) store.shortcutOk = registerShortcut();
    if ('showDock' in patch && isMac) { if (patch.showDock) app.dock.show(); else app.dock.hide(); }
    if ('openAtLogin' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin, openAsHidden: true });
    changed();
  });
  ipcMain.handle('hide', () => win && win.hide());
  ipcMain.handle('quit', () => { quitting = true; app.quit(); });
  ipcMain.handle('sync', () => { const n = store.sync(); if (n) changed(); return n; });
  // 타일 우클릭 메뉴 (macOS 기본 메뉴)
  ipcMain.handle('tile-menu', (e, item) => new Promise((resolve) => {
    const cats = store.data.categories.map((c) => ({ label: c, type: 'radio', checked: item.category === c, click: () => resolve({ act: 'move', category: c }) }));
    const local = !/^(https?|steam):/i.test(item.path);
    Menu.buildFromTemplate([
      { label: '열기', click: () => resolve({ act: 'open' }) },
      ...(local ? [{ label: 'Finder에서 보기', click: () => resolve({ act: 'reveal' }) }] : []),
      { type: 'separator' },
      { label: item.pinned ? '즐겨찾기 해제' : '즐겨찾기에 고정', click: () => resolve({ act: 'pin' }) },
      { label: '이름 변경…', click: () => resolve({ act: 'rename' }) },
      { label: '카테고리 이동', submenu: cats },
      { type: 'separator' },
      { label: '목록에서 제거', click: () => resolve({ act: 'remove' }) }
    ]).popup({ window: win, callback: () => resolve(null) });
  }));
  ipcMain.handle('menu', (e, which) => new Promise((resolve) => {
    const d = store.data;
    const tpl = which === 'add' ? [
      { label: '앱 추가…', click: () => resolve('app') },
      { label: '파일 추가…', click: () => resolve('file') },
      { label: '폴더 추가…', click: () => resolve('folder') },
      { label: '웹사이트 추가…', click: () => resolve('url') },
      { type: 'separator' },
      { label: '카테고리 추가…', click: () => resolve('category') }
    ] : [
      { label: '자동 추가', type: 'checkbox', checked: d.autoEnabled, click: () => resolve('auto') },
      { label: '항상 위', type: 'checkbox', checked: d.alwaysOnTop, click: () => resolve('top') },
      { label: '로그인 시 자동 실행', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: () => resolve('login') },
      ...(isMac ? [{ label: 'Dock에 아이콘 표시', type: 'checkbox', checked: d.showDock !== false, click: () => resolve('dock') }] : []),
      { label: '창 크기', submenu: [['small', '작게 (2줄)'], ['medium', '보통 (3줄)'], ['large', '크게 (4줄)']].map(([v, l]) => ({ label: l, type: 'radio', checked: d.size === v, click: () => resolve('size:' + v) })) },
      { label: '투명도', submenu: [100, 90, 80, 70, 60, 50].map((v) => ({ label: v + '%', type: 'radio', checked: d.opacity === v, click: () => resolve('opacity:' + v) })) },
      { label: '열기/숨기기 단축키', submenu: SHORTCUTS.map((s) => ({ label: s.replace('CommandOrControl', isMac ? '⌘' : 'Ctrl').replace('Alt', isMac ? '⌥' : 'Alt').replace('Control', isMac ? '⌃' : 'Ctrl').replace('Shift', isMac ? '⇧' : 'Shift').replace(/\+/g, isMac ? '' : '+'), type: 'radio', checked: d.shortcut === s, click: () => resolve('shortcut:' + s) })) },
      { type: 'separator' },
      { label: '숨기기', click: () => resolve('hide') },
      { label: 'MySpace 종료', click: () => resolve('quit') }
    ];
    Menu.buildFromTemplate(tpl).popup({ window: win, callback: () => resolve(null) });
  }));
}

app.whenReady().then(() => {
  store = new Store({ home: app.getPath('home'), dataDir: app.getPath('userData') });
  if (store.fresh) store.firstRun();
  if (isMac && store.data.showDock === false) app.dock.hide();
  if (isMac) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'MySpace', submenu: [{ role: 'about', label: 'MySpace에 관하여' }, { type: 'separator' }, { role: 'hide', label: 'MySpace 가리기' }, { type: 'separator' }, { label: 'MySpace 종료', accelerator: 'Cmd+Q', click: () => { quitting = true; app.quit(); } }] },
      { label: '편집', submenu: [{ role: 'undo', label: '실행 취소' }, { role: 'redo', label: '실행 복귀' }, { type: 'separator' }, { role: 'cut', label: '오려두기' }, { role: 'copy', label: '복사하기' }, { role: 'paste', label: '붙여넣기' }, { role: 'selectAll', label: '전체 선택' }] },
      { label: '윈도우', submenu: [{ label: '닫기', accelerator: 'Cmd+W', click: () => win && win.hide() }] }
    ]));
  }
  setupIpc();
  createWindow();
  createTray();
  store.shortcutOk = registerShortcut();
  nativeTheme.on('updated', () => { if (win) win.webContents.send('state', state()); });
  // 개발용: MYSPACE_SCREENSHOT=파일.png 로 실행하면 화면을 찍고 종료 (UI 확인용)
  if (process.env.MYSPACE_SCREENSHOT) win.webContents.once('did-finish-load', () => setTimeout(async () => { fs.writeFileSync(process.env.MYSPACE_SCREENSHOT, (await win.webContents.capturePage()).toPNG()); quitting = true; app.quit(); }, 2500));
  timer = setInterval(() => { try { if (store.sync() && win) win.webContents.send('state', state()); } catch (e) { } }, 15000);
});
app.on('activate', () => showWindow());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); clearInterval(timer); });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
