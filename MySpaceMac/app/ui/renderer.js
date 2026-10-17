// MySpace 화면
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const TINTS = ['#007aff', '#34c759', '#af52de', '#ff9500', '#ff2d55', '#5ac8fa', '#5856d6'];
  let S = null, active = '즐겨찾기', iconCache = {}, mac = true;

  function tint(s) { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; }
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }
  function ask(title, a, b) {
    return new Promise((resolve) => {
      $('mTitle').textContent = title;
      const m1 = $('m1'), m2 = $('m2');
      m1.placeholder = a.ph || ''; m1.value = a.value || '';
      m2.style.display = b ? '' : 'none'; if (b) { m2.placeholder = b.ph || ''; m2.value = b.value || ''; }
      $('modal').classList.add('on'); setTimeout(() => m1.focus(), 30);
      const done = (ok) => { $('modal').classList.remove('on'); $('mOk').onclick = $('mCancel').onclick = null; document.onkeydown = null; resolve(ok ? [m1.value.trim(), m2.value.trim()] : null); };
      $('mOk').onclick = () => done(true); $('mCancel').onclick = () => done(false);
      document.onkeydown = (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); };
    });
  }

  function theme() {
    const t = S.data.theme === 'system' ? (S.darkSystem ? 'dark' : 'light') : S.data.theme;
    document.documentElement.dataset.theme = t;
    $('theme').textContent = t === 'dark' ? '☀︎' : '☾';
  }
  function shortcutLabel(s) {
    if (!mac) return s.replace('CommandOrControl', 'Ctrl');
    return s.replace('CommandOrControl', '⌘').replace('Control', '⌃').replace('Alt', '⌥').replace('Shift', '⇧').replace(/\+/g, '');
  }
  function renderTabs() {
    const tabs = $('tabs'); tabs.innerHTML = '';
    ['전체'].concat(S.data.categories).forEach((c) => {
      const b = document.createElement('button'); b.textContent = c; b.className = c === active ? 'on' : '';
      b.onclick = () => { active = c; renderTabs(); renderTiles(); };
      tabs.appendChild(b);
    });
  }
  function visible() {
    const q = $('q').value.trim().toLowerCase();
    return S.data.items.filter((i) => (active === '전체' || i.category === active || (active === '즐겨찾기' && i.pinned)) && (!q || i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q)));
  }
  async function loadIcon(item, box) {
    let src = iconCache[item.path];
    if (src === undefined) { src = await window.my.icon(item.path); iconCache[item.path] = src; }
    if (!src) return;
    box.className = 'ic ' + (/\.app$/i.test(item.path) ? 'app' : 'img');
    box.textContent = ''; const img = new Image(); img.src = src; img.alt = ''; box.appendChild(img);
  }
  async function launch(item) { const err = await window.my.open(item.path); if (err) toast(err); }
  function renderTiles() {
    const list = visible(), main = $('tiles'); main.innerHTML = '';
    if (!list.length) {
      const e = document.createElement('div'); e.className = 'empty';
      e.textContent = $('q').value ? `'${$('q').value}'에 대한 결과가 없어요.` : 'Finder에서 앱·파일·폴더를 여기로 끌어 놓거나, 오른쪽 위 ＋ 버튼으로 추가하세요.';
      main.appendChild(e);
    }
    list.forEach((item) => {
      const t = document.createElement('div'); t.className = 'tile'; t.title = item.name + '\n' + item.path;
      const ic = document.createElement('div'); ic.className = 'ic letter'; ic.style.background = `linear-gradient(180deg, ${tint(item.name)}cc, ${tint(item.name)})`; ic.textContent = (item.name || '?').charAt(0).toUpperCase();
      const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = item.name;
      t.append(ic, nm);
      if (item.pinned && active !== '즐겨찾기') { const p = document.createElement('span'); p.className = 'pinmark'; p.textContent = '★'; t.appendChild(p); }
      t.onclick = () => launch(item);
      t.oncontextmenu = async (e) => {
        e.preventDefault();
        const r = await window.my.tileMenu(item); if (!r) return;
        if (r.act === 'open') launch(item);
        else if (r.act === 'reveal') window.my.reveal(item.path);
        else if (r.act === 'pin') window.my.update(item.id, { pinned: !item.pinned });
        else if (r.act === 'move') window.my.update(item.id, { category: r.category });
        else if (r.act === 'remove') window.my.remove(item.id);
        else if (r.act === 'rename') { const v = await ask('표시 이름', { value: item.name }); if (v && v[0]) window.my.update(item.id, { name: v[0] }); }
      };
      main.appendChild(t);
      loadIcon(item, ic);
    });
    const sc = S.shortcutOk ? `   ·   ${shortcutLabel(S.data.shortcut)}로 열기/숨기기` : '';
    $('status').textContent = `${list.length}개 항목   ·   자동 추가 ${S.data.autoEnabled ? '켜짐' : '꺼짐'}   ·   투명도 ${S.data.opacity}%${sc}   ·   우클릭으로 정리`;
  }
  function renderAll() {
    mac = S.platform === 'darwin';
    theme();
    const o = $('opacity'); o.value = S.data.opacity; o.style.setProperty('--v', ((S.data.opacity - 30) / 70 * 100) + '%'); $('pct').textContent = S.data.opacity + '%';
    $('pin').classList.toggle('on', !!S.data.alwaysOnTop);
    renderTabs(); renderTiles();
  }

  // 헤더
  $('close').onclick = () => window.my.quit();
  $('min').onclick = () => window.my.hide();
  $('pin').onclick = () => window.my.set({ alwaysOnTop: !S.data.alwaysOnTop });
  $('theme').onclick = () => window.my.set({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' });
  $('q').oninput = renderTiles;
  $('q').onkeydown = (e) => { if (e.key === 'Enter') { const v = visible(); if (v[0]) launch(v[0]); } };
  let opTimer = null;
  $('opacity').oninput = (e) => {
    const v = +e.target.value; S.data.opacity = v; e.target.style.setProperty('--v', ((v - 30) / 70 * 100) + '%'); $('pct').textContent = v + '%';
    clearTimeout(opTimer); opTimer = setTimeout(() => window.my.set({ opacity: v }), 30);
  };
  window.addEventListener('wheel', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault(); const v = Math.max(30, Math.min(100, S.data.opacity + (e.deltaY < 0 ? 5 : -5))); window.my.set({ opacity: v });
  }, { passive: false });
  $('add').onclick = async () => {
    const r = await window.my.menu('add'); if (!r) return;
    if (r === 'url') { const v = await ask('웹사이트 추가', { ph: '이름 (예: 학교 포털)' }, { ph: '주소 (예: portal.ac.kr)' }); if (v && v[1]) { if (!await window.my.addUrl(v[0], v[1], active)) toast('이미 있거나 추가할 수 없어요'); } }
    else if (r === 'category') { const v = await ask('새 카테고리 이름', { ph: '예: 실습' }); if (v && v[0]) window.my.addCategory(v[0]); }
    else { const n = await window.my.pick(r, active); if (n) toast(n + '개를 추가했어요'); }
  };
  $('more').onclick = async () => {
    const r = await window.my.menu('more'); if (!r) return;
    const d = S.data;
    if (r === 'auto') window.my.set({ autoEnabled: !d.autoEnabled });
    else if (r === 'top') window.my.set({ alwaysOnTop: !d.alwaysOnTop });
    else if (r === 'login') window.my.set({ openAtLogin: !d.openAtLogin });
    else if (r === 'dock') window.my.set({ showDock: d.showDock === false });
    else if (r === 'hide') window.my.hide();
    else if (r === 'quit') window.my.quit();
    else { const [k, v] = r.split(/:(.+)/); if (k === 'size') window.my.set({ size: v }); else if (k === 'opacity') window.my.set({ opacity: +v }); else if (k === 'shortcut') window.my.set({ shortcut: v }); }
  };

  // Finder에서 끌어 놓기
  const shell = $('shell');
  ['dragenter', 'dragover'].forEach((ev) => shell.addEventListener(ev, (e) => { e.preventDefault(); shell.classList.add('drop'); }));
  ['dragleave', 'drop'].forEach((ev) => shell.addEventListener(ev, (e) => { e.preventDefault(); shell.classList.remove('drop'); }));
  shell.addEventListener('drop', async (e) => {
    const paths = Array.from(e.dataTransfer.files).map((f) => window.my.pathOf(f)).filter(Boolean);
    if (paths.length) { const n = await window.my.addPaths(paths, active); toast(n ? n + '개를 추가했어요' : '이미 등록된 항목이에요'); }
  });

  // 키보드: ⌘F 검색, Esc 검색 지우기/숨기기
  document.addEventListener('keydown', (e) => {
    if ($('modal').classList.contains('on')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('q').focus(); $('q').select(); }
    else if (e.key === 'Escape') { if ($('q').value) { $('q').value = ''; renderTiles(); } else window.my.hide(); }
  });

  window.my.onState((s) => { S = s; renderAll(); });
  window.my.onFocusSearch(() => { $('q').focus(); $('q').select(); });
  window.my.state().then((s) => { S = s; renderAll(); });
})();
