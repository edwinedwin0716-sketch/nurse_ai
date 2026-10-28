// 화면: 메뉴 탭·도구 상자·서식 막대·대화 상자·단축키·파일 열기와 저장
'use strict';

(() => {
  const $ = s => document.querySelector(s);
  const el = Ed.el, st = Ed.st;
  const Native = window.Android || null;              // 안드로이드 앱 안이면 Java 다리
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const narrow = () => window.innerWidth <= 700;
  const VERSION = '1.2.2';
  const app = { name: '새 문서.hwpx', writable: false, kind: 'new' };
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('hwped.' + k); localStorage.setItem('hwped.' + k, v); } catch (e) { return null; } };

  // ---------- 알림 ----------
  let toastT = 0;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }
  st.onError = toast;

  // ---------- 명령 ----------
  const FONTS = ['함초롬바탕', '함초롬돋움', '바탕', '돋움', '굴림', '궁서', '맑은 고딕', '나눔고딕', '나눔명조', '휴먼명조', '한컴 윤고딕 230', 'HY헤드라인M', 'Arial', 'Times New Roman', 'Courier New'];
  const SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72];
  let foreColor = '#e00000', hiliteColor = '#ffef00';
  const inTable = () => !!Ed.curCell();
  const editGuard = fn => (...a) => { if (st.readOnly) { toast('보기 모드예요. 위의 [편집]을 누르면 고칠 수 있어요'); return; } return fn(...a); };

  const C = {};
  function cmd(name, label, icon, keys, run, opts) { C[name] = Object.assign({ name, label, icon, keys: keys || '', run }, opts || {}); }
  const E = (name, label, icon, keys, run, opts) => cmd(name, label, icon, keys, editGuard(run), opts);

  // 파일
  cmd('newDoc', '새 문서', 'new', 'Alt+N', () => confirmLeave(() => { openModel(Model.empty(), '새 문서.hwpx', 'new'); setReadOnly(false); }));
  cmd('open', '불러오기', 'open', 'Alt+O', () => confirmLeave(openPicker));
  cmd('save', '저장하기', 'save', 'Alt+S', () => save(false));
  cmd('saveAs', '다른 이름으로 저장하기', 'saveas', 'Alt+V', () => save(true));
  cmd('exportPdf', 'PDF로 저장하기', 'pdf', '', () => print(true));
  cmd('exportHtml', '웹 문서(HTML)로 저장', 'html', '', exportHtml);
  cmd('exportTxt', '텍스트(TXT)로 저장', 'txt', '', exportTxt);
  cmd('share', '보내기(공유)', 'share', '', shareDoc);
  cmd('print', '인쇄', 'print', 'Alt+P', () => print(false));
  cmd('docInfo', '문서 정보', 'info', 'Ctrl+Q,I', docInfo);
  cmd('closeDoc', '문서 닫기', 'close', 'Ctrl+F4', () => confirmLeave(() => { openModel(Model.empty(), '새 문서.hwpx', 'new'); showWelcome(true); }));
  cmd('exitApp', '끝', 'close', 'Alt+X', () => confirmLeave(() => { if (Native && Native.exit) Native.exit(); else window.close(); }));
  // 편집
  E('undo', '되돌리기', 'undo', 'Ctrl+Z', () => { if (!Ed.hist.undo()) toast('더 되돌릴 게 없어요'); });
  E('redo', '다시 실행', 'redo', 'Ctrl+Shift+Z', () => { if (!Ed.hist.redo()) toast('다시 실행할 게 없어요'); });
  E('cut', '오려 두기', 'cut', 'Ctrl+X', () => { Ed.ensureSel(); Ed.act(() => document.execCommand('cut')); });
  cmd('copy', '복사하기', 'copy', 'Ctrl+C', () => { Ed.ensureSel(); document.execCommand('copy'); toast('복사했어요'); });
  E('paste', '붙이기', 'paste', 'Ctrl+V', pasteFromClipboard);
  E('pastePlain', '골라 붙이기(글자만)', 'paste', 'Ctrl+Alt+V', () => pasteFromClipboard(true));
  cmd('selectAll', '모두 선택', 'selall', 'Ctrl+A', () => { el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  cmd('find', '찾기', 'find', 'Ctrl+F', () => findDialog(false));
  E('replace', '찾아 바꾸기', 'replace', 'Ctrl+H', () => findDialog(true));
  cmd('findNext', '다시 찾기', 'find', 'Ctrl+L', () => { if (!lastFind.q) return findDialog(false); if (!Ed.find(lastFind.q, lastFind)) toast('찾는 글자가 없어요'); });
  cmd('goto', '찾아가기', 'goto', 'Alt+G', gotoDialog);
  E('painter', '모양 복사', 'painter', 'Alt+C', () => toast(Ed.painter() === 'copy' ? '모양을 기억했어요. 블록을 잡고 다시 Alt+C' : '모양을 붙였어요'));
  E('clearFormat', '보통 모양(글자 모양 지우기)', 'clear', 'Alt+Shift+C', () => Ed.inline('removeFormat'));
  E('deleteLine', '한 줄(문단) 지우기', 'clear', 'Ctrl+Y', () => { const p = Ed.curPara(); if (p) Ed.act(() => { const n = p.nextElementSibling || p.previousElementSibling; if (el.children.length > 1 || p.parentNode !== el) { p.remove(); if (n) Ed.caretInto(n); } else p.innerHTML = '<br>'; }); });
  // 보기
  cmd('zoomIn', '확대', 'zoomin', 'Ctrl++', () => Ed.setZoom(st.zoom + 0.1));
  cmd('zoomOut', '축소', 'zoomout', 'Ctrl+-', () => Ed.setZoom(st.zoom - 0.1));
  cmd('zoom100', '100%', 'fitp', 'Ctrl+0', () => Ed.setZoom(1));
  cmd('fitWidth', '폭 맞춤', 'fitw', '', Ed.fitWidth);
  cmd('fitPage', '쪽 맞춤', 'fitp', '', Ed.fitPage);
  cmd('pageGrid', '쪽 모아보기', 'columns', '', () => {
    if (st.grid) { Ed.fitWidth(); return; }
    if (!st.pageView) { st.pageView = true; }
    if (st.pages < 2) { toast('쪽이 하나뿐이에요'); return; }
    const g = Ed.geo(), cols = Math.min(st.pages, narrow() ? 2 : 3);
    Ed.setZoom((Ed.view.clientWidth - 8) / (cols * (g.W + 18) + 36));
  }, { on: () => !!st.grid });
  cmd('pageView', '쪽 윤곽', 'outline', 'Ctrl+G,L', () => { st.pageView = !st.pageView; Ed.layout(); toast(st.pageView ? '쪽 윤곽을 켰어요' : '쪽 윤곽을 껐어요(이어서 보기)'); }, { on: () => st.pageView });
  cmd('showMarks', '문단 부호', 'marks', 'Ctrl+G,T', () => document.body.classList.toggle('show-marks'), { on: () => document.body.classList.contains('show-marks') });
  cmd('showCodes', '조판 부호', 'codes', 'Ctrl+G,C', () => document.body.classList.toggle('show-codes'), { on: () => document.body.classList.contains('show-codes') });
  cmd('showGuide', '본문 경계선', 'margin', '', () => document.body.classList.toggle('show-guide'), { on: () => document.body.classList.contains('show-guide') });
  cmd('theme', '어두운 화면', 'dark', '', toggleTheme);
  cmd('toggleEdit', '편집 / 보기', 'edit', '', () => setReadOnly(!st.readOnly));
  cmd('alwaysEdit', '받은 문서 바로 편집', 'edit', '', () => { pref('directEdit', '1'); setReadOnly(false); toast('다음부터 문서를 열면 바로 편집 모드로 열려요 (보기 → 편집/보기로 바꿀 수 있어요)', 4000); });
  // 입력
  E('table', '표', 'table', 'Ctrl+N,T', tableDialog);
  E('image', '그림', 'image', 'Ctrl+N,I', () => { Ed.saveSel(); $('#imgIn').click(); });
  E('symbol', '문자표', 'symbol', 'Ctrl+F10', symbolDialog);
  E('link', '하이퍼링크', 'link', 'Ctrl+K,H', linkDialog);
  E('footnote', '각주', 'note', 'Ctrl+N,N', () => noteDialog(null));
  E('equation', '수식', 'eq', 'Ctrl+N,M', () => eqDialog(null));
  E('date', '날짜·시간', 'date', 'Ctrl+K,D', dateDialog);
  E('textbox', '글상자', 'box', 'Ctrl+N,B', () => { const d = document.createElement('div'); d.className = 'box'; d.style.width = '200pt'; d.innerHTML = '<p><br></p>'; Ed.insertBlock(d); });
  E('pageBreak', '쪽 나누기', 'pagebreak', 'Ctrl+Enter', () => Ed.pageBreak());
  // 서식
  E('charShape', '글자 모양', 'charshape', 'Alt+L', charDialog);
  E('paraShape', '문단 모양', 'parashape', 'Alt+T', paraDialog);
  E('styles', '스타일', 'style', 'F6', styleDialog);
  E('bold', '진하게', 'bold', 'Ctrl+B', () => Ed.inline('bold'), { on: () => q('bold') });
  E('italic', '기울임', 'italic', 'Ctrl+I', () => Ed.inline('italic'), { on: () => q('italic') });
  E('underline', '밑줄', 'underline', 'Ctrl+U', () => Ed.inline('underline'), { on: () => q('underline') });
  E('strike', '취소선', 'strike', 'Alt+Shift+D', () => Ed.inline('strikeThrough'), { on: () => q('strikeThrough') });
  E('sup', '위 첨자', 'sup', 'Alt+Shift+P', () => Ed.inline('superscript'), { on: () => q('superscript') });
  E('sub', '아래 첨자', 'sub', 'Alt+Shift+S', () => Ed.inline('subscript'), { on: () => q('subscript') });
  E('sizeUp', '글자 크게', 'sizeup', 'Alt+Shift+E', () => Ed.sizeBy(1));
  E('sizeDown', '글자 작게', 'sizedown', 'Alt+Shift+R', () => Ed.sizeBy(-1));
  E('spaceWide', '자간 넓게', 'charshape', 'Alt+Shift+W', () => Ed.spacingBy(1));
  E('spaceNarrow', '자간 좁게', 'charshape', 'Alt+Shift+N', () => Ed.spacingBy(-1));
  E('foreColor', '글자 색', 'color', '', () => Ed.inline('foreColor', foreColor));
  E('pickFore', '글자 색 고르기', 'color', '', () => colorPop('fore'));
  E('hilite', '형광펜', 'shade', '', () => Ed.inline('hiliteColor', hiliteColor));
  E('pickHilite', '형광펜 색 고르기', 'shade', '', () => colorPop('hilite'));
  E('alignJustify', '양쪽 정렬', 'justify', 'Ctrl+Shift+M', () => Ed.align('justify'), { on: () => curAlign() === 'justify' });
  E('alignLeft', '왼쪽 정렬', 'left', 'Ctrl+Shift+L', () => Ed.align('left'), { on: () => curAlign() === 'left' });
  E('alignCenter', '가운데 정렬', 'center', 'Ctrl+Shift+C', () => Ed.align('center'), { on: () => curAlign() === 'center' });
  E('alignRight', '오른쪽 정렬', 'right', 'Ctrl+Shift+R', () => Ed.align('right'), { on: () => curAlign() === 'right' });
  E('alignDistribute', '배분 정렬', 'distribute', 'Ctrl+Shift+T', () => Ed.align('distribute'), { on: () => curAlign() === 'distribute' });
  E('numbers', '문단 번호', 'numbers', '', () => Ed.toggleList('number'));
  E('bullets', '글머리표', 'bullets', '', () => Ed.toggleList('bullet'));
  E('indent', '왼쪽 여백 늘리기', 'indent', 'Ctrl+Alt+F6', () => Ed.indentBy(1000));
  E('outdent', '왼쪽 여백 줄이기', 'outdent', 'Ctrl+Alt+F5', () => Ed.indentBy(-1000));
  E('lsWide', '줄 간격 넓게', 'lsup', 'Alt+Shift+Z', () => Ed.lineSpacingBy(10));
  E('lsNarrow', '줄 간격 좁게', 'lsup', 'Alt+Shift+A', () => Ed.lineSpacingBy(-10));
  // 쪽
  E('paper', '편집 용지', 'paper', 'F7', paperDialog);
  E('portrait', '세로', 'portrait', '', () => setOrientation(false));
  E('landscape', '가로', 'landscape', '', () => setOrientation(true));
  E('header', '머리말·꼬리말', 'header', 'Ctrl+N,H', hfDialog);
  E('pageNum', '쪽 번호 매기기', 'pagenum', 'Ctrl+N,P', pageNumDialog);
  // 표
  E('cellBlock', '셀 블록', 'cellblock', 'F5', () => { const td = Ed.curCell(); if (!td) return toast('표 안에 커서를 두세요'); Ed.cellBlock(td); toast('셀 블록: 방향키로 넓히고 M 합치기 · S 나누기 · L 테두리/배경'); });
  E('rowAbove', '위에 줄 추가', 'rowabove', '', () => needCell(() => Ed.insertRow(false)));
  E('rowBelow', '아래에 줄 추가', 'rowbelow', 'Alt+Insert', () => needCell(() => Ed.insertRow(true)));
  E('colLeft', '왼쪽에 칸 추가', 'colleft', '', () => needCell(() => Ed.insertCol(false)));
  E('colRight', '오른쪽에 칸 추가', 'colright', '', () => needCell(() => Ed.insertCol(true)));
  E('delRow', '줄 지우기', 'delrow', 'Alt+Delete', () => needCell(() => Ed.deleteRow()));
  E('delCol', '칸 지우기', 'delcol', '', () => needCell(() => Ed.deleteCol()));
  E('merge', '셀 합치기', 'merge', 'M (셀 블록)', () => needCell(() => { if (!Ed.merge()) toast('합칠 셀을 셀 블록(F5)으로 고르세요'); }));
  E('split', '셀 나누기', 'split', 'S (셀 블록)', () => needCell(splitDialog));
  E('cellBorder', '셀 테두리·배경', 'border', 'L (셀 블록)', () => needCell(cellDialog));
  E('cellSize', '셀 크기', 'cellsize', '', () => needCell(cellSizeDialog));
  E('deleteTable', '표 지우기', 'deltable', '', () => needCell(() => Ed.deleteTable()));
  // 검토·도구
  cmd('spell', '맞춤법 밑줄', 'spell', 'F8', () => { const on = el.spellcheck = !el.spellcheck; toast(on ? '틀린 글자에 빨간 밑줄을 보여요(기기 맞춤법 검사)' : '맞춤법 밑줄을 껐어요'); el.blur(); el.focus(); }, { on: () => el.spellcheck });
  cmd('wordCount', '글자 수', 'count', '', docInfo);
  cmd('keys', '단축키 목록', 'keys', 'F1', keysDialog);
  cmd('about', '이 앱에 대해', 'help', '', aboutDialog);
  cmd('support', '후원하기', 'heart', '', () => openUrl('https://qr.kakaopay.com/Ej8Yr8VXm'));

  const q = c => { try { return document.queryCommandState(c); } catch (e) { return false; } };
  const curAlign = () => { const p = Ed.curPara(); return p ? Ed.paraShape(p).align : 'justify'; };
  const needCell = fn => { if (!inTable()) { toast('표 안에 커서를 두세요'); return; } fn(); };
  function run(name) {
    const c = C[name];
    if (!c) return;
    closePop();
    try { c.run(); } catch (e) { console.error(e); toast('하지 못했어요: ' + e.message); }
    setTimeout(refresh, 0);
  }

  // ---------- 메뉴 탭과 도구 상자 ----------
  const MENUS = [
    { id: 'file', label: '파일', groups: [['newDoc', 'open'], ['save', 'saveAs', 'share'], ['exportPdf', 'exportHtml', 'exportTxt'], ['print', 'docInfo'], ['closeDoc']] },
    { id: 'edit', label: '편집', groups: [['undo', 'redo'], ['cut', 'copy', 'paste', 'pastePlain'], ['selectAll', 'painter', 'clearFormat'], ['find', 'replace', 'goto']] },
    { id: 'view', label: '보기', groups: [['toggleEdit'], ['zoomIn', 'zoomOut', 'zoom100', 'fitWidth', 'fitPage', 'pageGrid'], ['pageView', 'showMarks', 'showCodes', 'showGuide'], ['theme']] },
    { id: 'insert', label: '입력', groups: [['table', 'image', 'textbox'], ['symbol', 'equation', 'date'], ['link', 'footnote'], ['pageBreak']] },
    { id: 'format', label: '서식', groups: [['charShape', 'paraShape', 'styles'], ['bold', 'italic', 'underline', 'strike', 'sup', 'sub'], ['sizeUp', 'sizeDown', 'spaceWide', 'spaceNarrow'], ['numbers', 'bullets', 'outdent', 'indent', 'lsWide', 'lsNarrow'], ['painter', 'clearFormat']] },
    { id: 'page', label: '쪽', groups: [['paper', 'portrait', 'landscape'], ['header', 'pageNum'], ['pageBreak']] },
    { id: 'table', label: '표', ctx: true, groups: [['cellBlock'], ['rowAbove', 'rowBelow', 'colLeft', 'colRight'], ['delRow', 'delCol'], ['merge', 'split'], ['cellBorder', 'cellSize'], ['deleteTable']] },
    { id: 'review', label: '검토', groups: [['spell', 'wordCount'], ['find', 'replace']] },
    { id: 'tools', label: '도구', groups: [['keys', 'about', 'support']] },
  ];
  let curMenu = 'format';
  function drawMenus() {
    const showTable = inTable();
    $('#menus').innerHTML = MENUS.filter(m => !m.ctx || showTable).map(m =>
      `<button class="menu${m.id === curMenu ? ' on' : ''}${m.ctx ? ' ctx' : ''}" data-menu="${m.id}">${m.label}${m.ctx ? ' ⋯' : ''}</button>`).join('');
    if (!showTable && curMenu === 'table') { curMenu = 'format'; return drawMenus(); }
    drawRibbon();
  }
  function drawRibbon() {
    const m = MENUS.find(x => x.id === curMenu);
    $('#ribbon').innerHTML = m.groups.map(g => '<div class="rgroup">' + g.map(n => {
      const c = C[n];
      return `<button class="rbtn${c.on && c.on() ? ' on' : ''}" data-cmd="${n}" title="${c.label}${c.keys ? ' (' + c.keys + ')' : ''}">${Icons(c.icon)}<span>${c.label}</span></button>`;
    }).join('') + '</div>').join('');
  }
  function menuList(m, x, y) {
    const items = m.groups.map(g => g.map(n => { const c = C[n]; return `<button data-cmd="${n}">${c.label}${c.keys ? `<kbd>${c.keys}</kbd>` : ''}</button>`; }).join('')).join('<hr>');
    showPop(items, x, y);
  }
  $('#menus').addEventListener('click', e => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    const m = MENUS.find(x => x.id === b.dataset.menu);
    if (curMenu === m.id) { const r = b.getBoundingClientRect(); menuList(m, r.left, r.bottom); return; }    // 한 번 더 누르면 전체 메뉴
    curMenu = m.id; drawMenus();
  });

  // ---------- 펼침 메뉴 ----------
  let pop = null;
  function showPop(html, x, y) {
    closePop();
    pop = document.createElement('div');
    pop.className = 'pop'; pop.innerHTML = html;
    document.body.appendChild(pop);
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px';
    pop.style.top = Math.max(4, Math.min(y, innerHeight - h - 4)) + 'px';
    return pop;
  }
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  document.addEventListener('mousedown', e => { if (pop && !pop.contains(e.target)) closePop(); }, true);
  document.addEventListener('touchstart', e => { if (pop && !pop.contains(e.target)) closePop(); }, { capture: true, passive: true });

  // 버튼 누르기: 문서 선택을 잃지 않게 mousedown 기본 동작을 막는다
  document.addEventListener('mousedown', e => {
    const b = e.target.closest('[data-cmd]');
    if (b && !b.closest('.dlg') && !b.closest('#welcome')) e.preventDefault();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cmd]');
    if (b && !b.closest('.dlg')) { Ed.saveSel(); run(b.dataset.cmd); return; }
    const a = e.target.closest('a[data-ext]');
    if (a) { e.preventDefault(); openUrl(a.href); }
  });

  // ---------- 서식 막대 ----------
  $('#styleSel').innerHTML = Model.STYLES.map((s, i) => `<option value="${s}">${s}${i < 9 ? '' : ''}</option>`).join('');
  $('#fontSel').innerHTML = FONTS.map(f => `<option>${f}</option>`).join('') + '<option value="__other">다른 글꼴…</option>';
  $('#lsSel').innerHTML = [100, 130, 160, 180, 200, 250, 300].map(v => `<option value="${v}">${v}%</option>`).join('');
  for (const b of document.querySelectorAll('#fmtbar .fbtn[data-cmd], #titlebar .qbtn[data-cmd]')) {
    const c = C[b.dataset.cmd];
    if (c && !b.classList.contains('drop') && !/^(sizeUp|sizeDown)$/.test(c.name)) b.insertAdjacentHTML('afterbegin', Icons(c.icon));
  }
  $('#modeBtn').insertAdjacentHTML('beforeend', '<span id="modeLbl"></span>');
  document.querySelectorAll('[data-icon]').forEach(s => { s.innerHTML = Icons(s.dataset.icon); });
  $('#logo').innerHTML = Icons('logo');
  for (const id of ['#styleSel', '#fontSel', '#lsSel', '#sizeIn']) $(id).addEventListener('focus', () => Ed.saveSel());
  $('#styleSel').addEventListener('change', e => { Ed.restoreSel(); Ed.setStyle(e.target.value); el.focus(); });
  $('#fontSel').addEventListener('change', e => {
    let f = e.target.value;
    if (f === '__other') { f = prompt('글꼴 이름을 적어 주세요 (기기에 있는 글꼴만 보여요)'); if (!f) return refresh(); }
    Ed.restoreSel(); Ed.applyCss({ fontFamily: Model.fontCss(f) }); el.focus();
  });
  $('#lsSel').addEventListener('change', e => { Ed.restoreSel(); Ed.lineSpacing(+e.target.value); el.focus(); });
  $('#sizeIn').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const v = parseFloat(e.target.value); if (v > 0 && v < 1000) { Ed.restoreSel(); Ed.applyCss({ fontSize: v + 'pt' }); } el.focus(); }
    if (e.key === 'Escape') { el.focus(); refresh(); }
  });
  $('#sizeIn').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0 && v < 1000 && document.activeElement !== el) { Ed.restoreSel(); Ed.applyCss({ fontSize: v + 'pt' }); } });

  const PALETTE = ['#000000', '#444444', '#888888', '#cccccc', '#ffffff', '#e00000', '#ff6a00', '#ffcc00', '#2e9e44', '#0066cc', '#1b2f9e', '#7b2fbf', '#c71585', '#8b4513', '#ffef00', '#a6f28f', '#9fe3ff', '#ffc2e0', '#ffd8a8', '#e5e5ff'];
  function colorPop(which) {
    const b = document.querySelector(`[data-cmd="${which === 'fore' ? 'pickFore' : 'pickHilite'}"]`).getBoundingClientRect();
    const p = showPop(`<div style="display:grid;grid-template-columns:repeat(5,30px);gap:4px;padding:4px">${PALETTE.map(c => `<button data-color="${c}" style="width:30px;height:30px;padding:0;border:1px solid #9995;border-radius:4px;background:${c}"></button>`).join('')}</div>` +
      (which === 'hilite' ? '<hr><button data-color="none">형광펜 지우기</button>' : '') + '<hr><button data-color="pick">다른 색…</button>', b.left - 120, b.bottom);
    p.addEventListener('click', e => {
      const c = e.target.closest('[data-color]'); if (!c) return;
      let v = c.dataset.color;
      const apply = v => {
        if (which === 'fore') { foreColor = v; $('#fcSw').style.background = v; Ed.restoreSel(); Ed.inline('foreColor', v); }
        else if (v === 'none') { Ed.restoreSel(); Ed.inline('hiliteColor', 'transparent'); }
        else { hiliteColor = v; $('#hcSw').style.background = v; Ed.restoreSel(); Ed.inline('hiliteColor', v); }
        closePop(); refresh();
      };
      if (v === 'pick') { const i = document.createElement('input'); i.type = 'color'; i.value = which === 'fore' ? foreColor : hiliteColor; i.onchange = () => apply(i.value); i.click(); return; }
      apply(v);
    });
  }

  // ---------- 상태 갱신 ----------
  let refreshT = 0;
  function refresh() {
    cancelAnimationFrame(refreshT);
    refreshT = requestAnimationFrame(() => {
      const cs = Ed.caretStyle();
      if (cs) {
        if (document.activeElement !== $('#sizeIn')) $('#sizeIn').value = cs.size;
        const fs = $('#fontSel');
        if (document.activeElement !== fs) {
          if (![...fs.options].some(o => o.value === cs.font)) fs.insertAdjacentHTML('afterbegin', `<option>${Model.esc(cs.font)}</option>`);
          fs.value = cs.font;
        }
      }
      const p = Ed.curPara();
      if (p && document.activeElement !== $('#styleSel')) {
        const ps = Ed.paraShape(p);
        $('#styleSel').value = Model.STYLES.includes(ps.style) ? ps.style : '바탕글';
        const ls = $('#lsSel');
        if (document.activeElement !== ls) {
          if (ps.lsType === 'PERCENT' && ![...ls.options].some(o => +o.value === ps.ls)) ls.insertAdjacentHTML('beforeend', `<option value="${ps.ls}">${ps.ls}%</option>`);
          ls.value = ps.lsType === 'PERCENT' ? ps.ls : '';
        }
      }
      for (const b of document.querySelectorAll('#fmtbar [data-cmd], #ribbon [data-cmd]')) { const c = C[b.dataset.cmd]; if (c && c.on) b.classList.toggle('on', !!c.on()); }
      const t = inTable();
      if (t !== !!document.querySelector('[data-menu="table"]')) { if (t && !narrow()) curMenu = 'table'; drawMenus(); }
      status();
    });
  }
  function status() {
    $('#stPage').textContent = st.grid ? `쪽 모아보기 · ${st.pages}쪽` : `${Ed.caretPage()}/${st.pages}쪽`;
    $('#zoomPct').textContent = Math.round(st.zoom * 100) + '%';
    $('#zoomRange').value = Math.round(st.zoom * 100);
    $('#insMode').textContent = st.overwrite ? '수정' : '삽입';
    const td = Ed.curCell();
    if (td) { const g = Ed.gridOf(td.closest('table')).cells.get(td); $('#stPos').textContent = `표 ${String.fromCharCode(65 + (g.c % 26))}${g.r + 1}`; }
    else $('#stPos').textContent = '';
  }
  function title() {
    $('#title').innerHTML = `${Model.esc(app.name)} <small>${st.dirty ? '[수정됨]' : ''}${st.readOnly ? ' · 보기' : ''}</small>`;
    document.title = (st.dirty ? '* ' : '') + app.name + ' - HWP 편집기';
    $('#modeLbl').textContent = st.readOnly ? '편집' : '보기';
    $('#modeBtn').classList.toggle('on', st.readOnly);
    $('#modeBtn').title = st.readOnly ? '고치기 시작 (편집 모드)' : '읽기만 하기 (보기 모드)';
  }
  st.onChange = () => { title(); scheduleDraft(); };
  st.onLayout = status;
  // 커서가 문단 밖(문서 바로 아래)에 있으면 가까운 문단 안으로
  function fixCaret() {
    const r = Ed.range();
    if (!r || !r.collapsed || r.startContainer !== el || st.readOnly) return;
    const kids = el.children;
    let b = kids[Math.min(r.startOffset, kids.length - 1)] || null;
    if (b && r.startOffset >= kids.length) b = kids[kids.length - 1];
    if (!b || b.tagName !== 'P') {
      const p = document.createElement('p'); p.innerHTML = '<br>';
      if (b && r.startOffset < kids.length) el.insertBefore(p, b); else el.appendChild(p);
      b = p;
    }
    Ed.caretInto(b, r.startOffset >= kids.length);
  }
  document.addEventListener('selectionchange', () => { fixCaret(); if (Ed.range()) { Ed.saveSel(); if (!st.cellDrag) maybeCellBlockFromSelection(); } refresh(); });

  function setReadOnly(ro) {
    st.readOnly = ro;
    el.contentEditable = ro ? 'false' : 'true';
    el.dataset.ro = ro ? '1' : '';
    document.body.classList.toggle('ro', ro);
    const was = document.body.classList.contains('hlines');
    document.body.classList.toggle('hlines', ro);          // 보기 모드: 한글이 정한 줄 바꿈 그대로
    if (was !== ro) Ed.layout();
    if (ro) el.blur();
    title();
  }

  // ---------- 입력 처리 ----------
  el.addEventListener('input', () => {
    // 고친 문단은 한글이 정해 둔 줄 바꿈을 버린다(글이 바뀌어 맞지 않으니까)
    const cp = Ed.curPara();
    if (cp && cp.querySelector('.hlb,.hll')) { cp.querySelectorAll('.hlb').forEach(x => x.remove()); cp.querySelectorAll('.hll').forEach(x => x.replaceWith(...x.childNodes)); }
    Ed.hist.later(); Ed.paginateSoon(); if (!st.dirty) { st.dirty = true; title(); } scheduleDraft(); });
  el.addEventListener('beforeinput', e => {
    if (st.readOnly) { e.preventDefault(); return; }
    // 수정(덮어쓰기) 모드
    if (st.overwrite && e.inputType === 'insertText' && e.data) {
      const s = getSelection();
      if (s.isCollapsed) { for (let i = 0; i < e.data.length; i++) s.modify('extend', 'forward', 'character'); if (/\n/.test(s.toString())) s.collapseToStart(); }
    }
  });
  el.addEventListener('keydown', e => {
    if (e.isComposing) return;
    // 비어 있는 번호 문단에서 Enter → 번호 끄기
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      const p = Ed.curPara();
      if (p && p.dataset.list && !p.textContent.replace(/​/g, '').trim()) { e.preventDefault(); Ed.toggleList(p.dataset.list); return; }
      if (p && p.dataset.pb) { /* 새 문단엔 쪽 나누기를 넘기지 않는다 */ setTimeout(() => { const np = Ed.curPara(); if (np && np !== p) delete np.dataset.pb; }, 0); }
    }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && inTable()) { e.preventDefault(); Ed.cellNav(e.shiftKey); return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !st.readOnly) { e.preventDefault(); Ed.insertText('\t'); }
  });
  // 붙이기: 서식은 남기되 위험한 것은 걷어 낸다
  el.addEventListener('paste', e => {
    if (st.readOnly) { e.preventDefault(); return; }
    const dt = e.clipboardData;
    if (!dt) return;
    const files = [...dt.files].filter(f => /^image\//.test(f.type));
    if (files.length) { e.preventDefault(); files.forEach(f => f.arrayBuffer().then(b => Ed.insertImage(new Uint8Array(b), f.type.split('/')[1]))); return; }
    const html = dt.getData('text/html');
    e.preventDefault();
    if (html && !pastePlainNext) Ed.insertHtml(sanitize(html));
    else Ed.insertText(dt.getData('text/plain'));
    pastePlainNext = false;
  });
  let pastePlainNext = false;
  function sanitize(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const KEEP = /^(P|BR|B|STRONG|I|EM|U|S|STRIKE|DEL|SUB|SUP|SPAN|A|TABLE|TBODY|THEAD|TR|TD|TH|IMG|UL|OL|LI|FONT|DIV|H[1-6])$/;
    const CSS = ['fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'color', 'backgroundColor', 'textAlign', 'fontFamily'];
    const walk = n => {
      for (const c of [...n.children]) {
        if (!KEEP.test(c.tagName)) { if (/^(SCRIPT|STYLE|META|LINK|IFRAME|OBJECT|NOSCRIPT|TITLE)$/.test(c.tagName)) c.remove(); else { walk(c); c.replaceWith(...c.childNodes); } continue; }
        const keep = {};
        for (const k of CSS) if (c.style[k]) keep[k] = c.style[k];
        for (const a of [...c.attributes]) if (!/^(href|colspan|rowspan|src)$/.test(a.name)) c.removeAttribute(a.name);
        Object.assign(c.style, keep);
        if (c.tagName === 'A' && !/^(https?:|mailto:)/i.test(c.getAttribute('href') || '')) c.removeAttribute('href');
        if (c.tagName === 'IMG') {
          const src = c.getAttribute('src') || '';
          const m = /^data:image\/(\w+);base64,(.+)$/.exec(src);
          if (m) { const key = Ed.addBin(Uint8Array.from(atob(m[2]), x => x.charCodeAt(0)), m[1]); c.src = Ed.binUrl(key); c.dataset.bin = key; c.style.maxWidth = '100%'; }
          else { c.replaceWith(document.createTextNode('')); continue; }       // 인터넷 그림은 저장할 수 없어 뺀다
        }
        if (/^(TABLE)$/.test(c.tagName)) c.className = 'tb';
        if (/^H[1-6]$/.test(c.tagName)) { const p = d.createElement('p'); p.innerHTML = c.innerHTML; p.style.fontWeight = 'bold'; p.style.fontSize = ({ H1: 20, H2: 16, H3: 14 }[c.tagName] || 12) + 'pt'; c.replaceWith(p); walk(p); continue; }
        if (c.tagName === 'DIV') { const p = d.createElement('p'); p.innerHTML = c.innerHTML; Object.assign(p.style, keep); c.replaceWith(p); walk(p); continue; }
        walk(c);
      }
    };
    walk(d.body);
    return d.body.innerHTML;
  }
  async function pasteFromClipboard(plain) {
    Ed.ensureSel();
    let t = '';
    try {
      if (Native && Native.clipText) t = Native.clipText();
      else if (navigator.clipboard && navigator.clipboard.readText) t = await navigator.clipboard.readText();
    } catch (e) { }
    if (!t) { pastePlainNext = !!plain; toast('Ctrl+V 또는 길게 눌러 [붙여넣기]를 써 주세요'); return; }
    Ed.restoreSel(); Ed.insertText(t);
  }
  $('#imgIn').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    Ed.restoreSel();
    Ed.insertImage(new Uint8Array(await f.arrayBuffer()), (f.name.split('.').pop() || f.type.split('/')[1] || 'png'));
  });

  // 표 안 끌기 선택 → 셀 블록
  function maybeCellBlockFromSelection() {
    const r = Ed.range(); if (!r) return;
    const a = Ed.cellOf(r.startContainer), b = Ed.cellOf(r.endContainer);
    if (a && b && a !== b && a.closest('table') === b.closest('table')) Ed.cellBlock(a, b);
    else if (st.cellSel && !st.keepBlock) Ed.clearCellBlock();
  }

  // 각주·수식·그림 누르기
  el.addEventListener('click', e => {
    const fn = e.target.closest('.fn'); if (fn) { noteDialog(fn); return; }
    const eq = e.target.closest('.eq'); if (eq) { eqDialog(eq); return; }
    el.querySelectorAll('img.picked').forEach(i => i.classList.remove('picked'));
    const img = e.target.closest('img');
    if (img) { img.classList.add('picked'); const r = document.createRange(); r.selectNode(img); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    const a = e.target.closest('a[href]');
    if (a && (st.readOnly || e.ctrlKey)) { e.preventDefault(); openUrl(a.href); }
  });
  el.addEventListener('dblclick', e => { const img = e.target.closest('img'); if (img) imageDialog(img); });

  // 오른쪽 클릭(마우스·덱스)
  let lastPointer = 'mouse';
  document.addEventListener('pointerdown', e => { lastPointer = e.pointerType; }, true);
  el.addEventListener('contextmenu', e => {
    if (lastPointer !== 'mouse') return;
    e.preventDefault();
    Ed.saveSel();
    const items = ['cut', 'copy', 'paste', 'pastePlain', '-', 'charShape', 'paraShape', 'styles', '-', 'link', 'footnote'];
    if (inTable()) items.push('-', 'cellBlock', 'rowAbove', 'rowBelow', 'colLeft', 'colRight', 'delRow', 'delCol', 'merge', 'split', 'cellBorder', 'cellSize');
    if (e.target.closest('img')) items.push('-', 'imageProps');
    if (e.target.closest('img')) C.imageProps = { label: '그림 크기', keys: '', run: () => imageDialog(e.target.closest('img')) };
    showPop(items.map(n => n === '-' ? '<hr>' : `<button data-cmd="${n}">${C[n].label}${C[n].keys ? `<kbd>${C[n].keys}</kbd>` : ''}</button>`).join(''), e.clientX, e.clientY);
  });

  // ---------- 단축키 (한글 2022 기준) ----------
  let chord = null, chordT = 0;
  const CHORDS = {
    'Ctrl+N': { T: 'table', I: 'image', N: 'footnote', M: 'equation', H: 'header', P: 'pageNum', B: 'textbox', E: 'footnote' },
    'Ctrl+K': { H: 'link', D: 'date' },
    'Ctrl+Q': { I: 'docInfo', F: 'find', A: 'replace' },
    'Ctrl+G': { L: 'pageView', P: 'pageView', T: 'showMarks', C: 'showCodes' },
  };
  function keyName(e) {
    let k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (e.code && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);          // 한글 자판이어도 영문 글쇠로
    if (e.code && /^Digit\d$/.test(e.code)) k = e.code.slice(5);
    return k;
  }
  const KEYS = {};
  for (const n in C) for (const k of (C[n].keys || '').split(/\s*\/\s*/)) if (k && !/[,(]/.test(k)) KEYS[k] = n;
  Object.assign(KEYS, { 'Ctrl+S': 'save', 'Ctrl+O': 'open', 'Ctrl+P': 'print', 'Ctrl+Y': 'deleteLine', 'Ctrl+F2': 'replace', 'Ctrl+Q,A': 'replace',
    'Alt+Shift+B': 'bold', 'Alt+Shift+I': 'italic', 'Alt+Shift+U': 'underline', 'Ctrl+]': 'sizeUp', 'Ctrl+[': 'sizeDown', 'Ctrl+=': 'zoomIn', 'Ctrl+Shift++': 'zoomIn', 'Ctrl+Shift+=': 'zoomIn' });
  document.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if ($('#dlgBack').classList.contains('open')) {
      if (e.key === 'Escape') { e.preventDefault(); closeDlg(); }
      return;
    }
    if (e.key === 'Escape') { closePop(); if (st.cellSel) { Ed.clearCellBlock(); e.preventDefault(); } return; }
    const k = keyName(e);
    const mods = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '');
    // 두 번 누르는 단축키(Ctrl+N, T 처럼)
    if (chord) {
      const table = CHORDS[chord];
      const name = table[k];
      chord = null; $('#chord').style.display = 'none';
      if (name && !/^(Control|Alt|Shift|Meta)$/.test(e.key)) { e.preventDefault(); run(name); return; }
      if (/^(Control|Alt|Shift|Meta)$/.test(e.key)) { return; }
    }
    if (CHORDS[mods + k] && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      chord = mods + k;
      $('#chord').textContent = chord + ', …'; $('#chord').style.display = 'block';
      clearTimeout(chordT); chordT = setTimeout(() => { chord = null; $('#chord').style.display = 'none'; }, 2500);
      return;
    }
    // 셀 블록 안에서
    if (st.cellSel && !e.ctrlKey && !e.altKey) {
      const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (map[e.key]) { e.preventDefault(); Ed.moveCellBlock(...map[e.key]); return; }
      if (k === 'M') { e.preventDefault(); run('merge'); return; }
      if (k === 'S') { e.preventDefault(); run('split'); return; }
      if (k === 'L') { e.preventDefault(); run('cellBorder'); return; }
      if (k === 'H') { e.preventDefault(); run('cellSize'); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); Ed.cellStyle(td => { td.innerHTML = '<p><br></p>'; }); return; }
      if (e.key === 'F5') { e.preventDefault(); return; }
    }
    if (e.key === 'Insert' && !mods) { e.preventDefault(); run('toggleOverwrite'); return; }
    if (e.key === 'Enter' && mods === 'Ctrl+') {
      e.preventDefault();
      if (inTable()) run('rowBelow'); else run('pageBreak');
      return;
    }
    const combo = mods + (k === ' ' ? 'Space' : k === '+' ? '+' : k);
    let name = KEYS[combo];
    if (!name && /^Ctrl\+\d$/.test(combo) && !e.altKey) {
      const i = +k;                               // Ctrl+1 바탕글, Ctrl+2 본문, Ctrl+3~9 개요 1~7
      if (i >= 1 && i <= 9) { e.preventDefault(); if (!st.readOnly) { Ed.setStyle(Model.STYLES[i - 1]); refresh(); } return; }
    }
    if (name) {
      // 편집 상자 안에서는 글자 단축키를 그대로 둔다
      const t = e.target;
      if ((t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && /^Ctrl\+[ACVXZY]$|^Ctrl\+Shift\+Z$/.test(combo)) return;
      e.preventDefault();
      run(name);
    }
  });
  C.toggleOverwrite = { label: '삽입/수정', keys: 'Insert', run: () => { st.overwrite = !st.overwrite; toast(st.overwrite ? '수정 모드: 쓰는 글자가 뒤 글자를 덮어요' : '삽입 모드'); } };
  C.zoomMenu = { label: '확대', run: () => { const r = $('#zoomPct').getBoundingClientRect(); const p = showPop([50, 75, 100, 125, 150, 200].map(z => `<button data-z="${z}">${z}%</button>`).join('') + '<hr><button data-cmd="fitWidth">폭 맞춤</button><button data-cmd="fitPage">쪽 맞춤</button><button data-cmd="pageGrid">쪽 모아보기</button>', r.left - 60, r.top - 260); p.addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (b) { Ed.setZoom(b.dataset.z / 100); closePop(); } }); } };
  $('#zoomRange').addEventListener('input', e => Ed.setZoom(e.target.value / 100));

  // 확대·축소: Ctrl+휠, 두 손가락
  Ed.view.addEventListener('scroll', () => { if (st.readOnly && !st.grid) { cancelAnimationFrame(refreshT); refreshT = requestAnimationFrame(status); } }, { passive: true });
  Ed.view.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); Ed.setZoom(st.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
  let pinch = null;
  Ed.view.addEventListener('touchstart', e => { if (e.touches.length === 2) { const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: st.zoom }; } }, { passive: true });
  Ed.view.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const [a, b] = e.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    Ed.setZoom(pinch.z * d / pinch.d);
  }, { passive: false });
  Ed.view.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { passive: true });

  // ---------- 대화 상자 ----------
  let dlgOk = null;
  function dialog(titleText, body, opts) {
    opts = opts || {};
    Ed.saveSel();
    const back = $('#dlgBack');
    back.innerHTML = `<div class="dlg" role="dialog" aria-label="${titleText}"><header>${titleText}<button class="qbtn x" data-close>${Icons('close')}</button></header><div class="body">${body}</div>` +
      `<footer>${(opts.buttons || []).map(b => `<button data-b="${b[0]}">${b[1]}</button>`).join('')}${opts.ok === false ? '' : `<button class="primary" data-ok>${opts.okLabel || '설정'}</button>`}<button data-close>${opts.ok === false ? '닫기' : '취소'}</button></footer></div>`;
    back.classList.add('open');
    dlgOk = opts.onOk || null;
    const d = back.querySelector('.dlg');
    d.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) closeDlg();
      else if (e.target.closest('[data-ok]')) { if (!dlgOk || dlgOk(d) !== false) closeDlg(true); }
      else { const b = e.target.closest('[data-b]'); if (b && opts.onButton) opts.onButton(b.dataset.b, d); }
    });
    d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && !opts.noEnter) { e.preventDefault(); d.querySelector('[data-ok]') && d.querySelector('[data-ok]').click(); } });
    const first = d.querySelector('input:not([type=checkbox]):not([type=color]),select,textarea');
    if (first && !narrow()) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
    if (opts.onOpen) opts.onOpen(d);
    return d;
  }
  function closeDlg(ok) {
    $('#dlgBack').classList.remove('open');
    $('#dlgBack').innerHTML = '';
    if (!st.readOnly) { if (ok && Ed.range()) el.focus({ preventScroll: true }); else Ed.restoreSel(); }
    refresh();
    return ok;
  }
  const v = (d, sel) => d.querySelector(sel).value;
  const fld = (label, html) => `<label class="fld"><span>${label}</span>${html}</label>`;
  const num = (id, val, step, extra) => `<input id="${id}" type="number" step="${step || 1}" value="${val}" ${extra || ''}>`;
  const ptVal = hu => Math.round(hu) / 100;

  function charDialog() {
    const cs = Ed.caretStyle() || Model.BASE;
    dialog('글자 모양', `
      <fieldset><legend>기본</legend><div class="grid2">
        ${fld('글꼴', `<input id="cFont" list="cFonts" value="${Model.esc(cs.font)}"><datalist id="cFonts">${FONTS.map(f => `<option value="${f}">`).join('')}</datalist>`)}
        ${fld('크기(pt)', num('cSize', cs.size, 0.5, 'min="1" max="4096"'))}
        ${fld('자간(%)', num('cSpace', cs.spacing || 0, 1, 'min="-50" max="50"'))}
        ${fld('장평(%)', num('cRatio', cs.ratio || 100, 1, 'min="50" max="200"'))}
        ${fld('글자 색', `<input id="cColor" type="color" value="${cs.color || '#000000'}">`)}
        ${fld('음영 색', `<input id="cBg" type="color" value="${cs.bg || '#ffffff'}">`)}
      </div></fieldset>
      <fieldset><legend>속성</legend>
        <label class="chk"><input type="checkbox" id="cB" ${cs.bold ? 'checked' : ''}>진하게</label>
        <label class="chk"><input type="checkbox" id="cI" ${cs.italic ? 'checked' : ''}>기울임</label>
        <label class="chk"><input type="checkbox" id="cU" ${cs.underline ? 'checked' : ''}>밑줄</label>
        <label class="chk"><input type="checkbox" id="cS" ${cs.strike ? 'checked' : ''}>취소선</label>
        <label class="chk"><input type="checkbox" id="cSup" ${cs.sup ? 'checked' : ''}>위 첨자</label>
        <label class="chk"><input type="checkbox" id="cSub" ${cs.sub ? 'checked' : ''}>아래 첨자</label>
        <label class="chk"><input type="checkbox" id="cNoBg" ${cs.bg ? '' : 'checked'}>음영 없음</label>
      </fieldset>
      <div class="preview" id="cPrev">한글 Hangul 123 가나다라</div>
      <p style="font-size:11.5px;color:var(--sub);margin:6px 0 0">장평은 저장할 때만 반영돼요(화면에선 그대로 보여요).</p>`, {
      onOpen: d => {
        const upd = () => {
          const p = d.querySelector('#cPrev');
          p.style.fontFamily = Model.fontCss(v(d, '#cFont')); p.style.fontSize = Math.min(40, +v(d, '#cSize') || 10) + 'pt';
          p.style.letterSpacing = (+v(d, '#cSpace') || 0) / 100 + 'em'; p.style.color = v(d, '#cColor');
          p.style.fontWeight = d.querySelector('#cB').checked ? 'bold' : 'normal'; p.style.fontStyle = d.querySelector('#cI').checked ? 'italic' : 'normal';
          p.style.textDecoration = [d.querySelector('#cU').checked && 'underline', d.querySelector('#cS').checked && 'line-through'].filter(Boolean).join(' ') || 'none';
          p.style.background = d.querySelector('#cNoBg').checked ? '#fff' : v(d, '#cBg');
        };
        d.addEventListener('input', upd); d.addEventListener('change', upd); upd();
        d.querySelector('#cBg').addEventListener('input', () => { d.querySelector('#cNoBg').checked = false; upd(); });
      },
      onOk: d => {
        Ed.restoreSel();
        Ed.setCharShape({ font: v(d, '#cFont') || '함초롬바탕', size: +v(d, '#cSize') || 10, spacing: +v(d, '#cSpace') || 0, ratio: +v(d, '#cRatio') || 100,
          color: v(d, '#cColor'), bg: d.querySelector('#cNoBg').checked ? '' : v(d, '#cBg'),
          bold: d.querySelector('#cB').checked, italic: d.querySelector('#cI').checked, underline: d.querySelector('#cU').checked, strike: d.querySelector('#cS').checked,
          sup: d.querySelector('#cSup').checked, sub: d.querySelector('#cSub').checked });
      },
    });
  }

  function paraDialog() {
    const p = Ed.paraShape();
    const first = p.indent > 0 ? 'in' : p.indent < 0 ? 'out' : 'none';
    const lsUnit = p.lsType === 'PERCENT' ? '%' : 'pt';
    dialog('문단 모양', `
      <fieldset><legend>정렬 방식</legend>
        ${[['justify', '양쪽'], ['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽'], ['distribute', '배분']].map(([k, l]) => `<label class="chk"><input type="radio" name="pa" value="${k}" ${p.align === k ? 'checked' : ''}>${l}</label>`).join('')}
      </fieldset>
      <fieldset><legend>여백 · 첫 줄</legend><div class="grid2">
        ${fld('왼쪽(pt)', num('pL', ptVal(p.left), 0.5))}
        ${fld('오른쪽(pt)', num('pR', ptVal(p.right), 0.5))}
        ${fld('첫 줄', `<select id="pFirst"><option value="none">보통</option><option value="in">들여쓰기</option><option value="out">내어쓰기</option></select>`)}
        ${fld('첫 줄 값(pt)', num('pInd', ptVal(Math.abs(p.indent)) || 10, 0.5, 'min="0"'))}
      </div></fieldset>
      <fieldset><legend>간격</legend><div class="grid2">
        ${fld('줄 간격 종류', `<select id="pLsT"><option value="PERCENT">글자에 따라(%)</option><option value="FIXED">고정 값(pt)</option><option value="BETWEEN_LINES">여백만 지정(pt)</option><option value="AT_LEAST">최소(pt)</option></select>`)}
        ${fld(`줄 간격 값(<span id="pLsU">${lsUnit}</span>)`, num('pLs', p.lsType === 'PERCENT' ? p.ls : ptVal(p.ls), 1, 'min="0"'))}
        ${fld('문단 위(pt)', num('pB', ptVal(p.before), 0.5, 'min="0"'))}
        ${fld('문단 아래(pt)', num('pA', ptVal(p.after), 0.5, 'min="0"'))}
      </div></fieldset>`, {
      onOpen: d => {
        d.querySelector('#pFirst').value = first; d.querySelector('#pLsT').value = p.lsType;
        d.querySelector('#pLsT').addEventListener('change', e => { const pc = e.target.value === 'PERCENT'; d.querySelector('#pLsU').textContent = pc ? '%' : 'pt'; d.querySelector('#pLs').value = pc ? 160 : 16; });
      },
      onOk: d => {
        const f = v(d, '#pFirst'), ind = Math.round((+v(d, '#pInd') || 0) * 100);
        const lsT = v(d, '#pLsT');
        Ed.restoreSel();
        Ed.setParaShape({ align: (d.querySelector('[name=pa]:checked') || {}).value || 'justify', left: Math.round(+v(d, '#pL') * 100), right: Math.round(+v(d, '#pR') * 100),
          indent: f === 'in' ? ind : f === 'out' ? -ind : 0, lsType: lsT, ls: lsT === 'PERCENT' ? +v(d, '#pLs') : Math.round(+v(d, '#pLs') * 100),
          before: Math.round(+v(d, '#pB') * 100), after: Math.round(+v(d, '#pA') * 100) });
      },
    });
  }

  function styleDialog() {
    const cur = Ed.paraShape().style;
    dialog('스타일', `<div style="display:flex;flex-direction:column;gap:4px">${Model.STYLES.map((s, i) => `<label class="chk" style="padding:6px;border:1px solid var(--line);border-radius:6px"><input type="radio" name="sty" value="${s}" ${s === cur ? 'checked' : ''}>${s}<span style="margin-left:auto;color:var(--sub);font-size:12px">Ctrl+${i + 1}</span></label>`).join('')}</div>
      <p style="font-size:12px;color:var(--sub)">개요 스타일은 1. 가. 1) 가) (1) (가) ① 번호가 저절로 붙어요.</p>`, {
      okLabel: '적용', onOk: d => { const s = d.querySelector('[name=sty]:checked'); if (s) { Ed.restoreSel(); Ed.setStyle(s.value); } },
    });
  }

  const PAPERS = { A4: [210, 297], A3: [297, 420], A5: [148, 210], B4: [257, 364], B5: [182, 257], 'Letter': [215.9, 279.4], 'Legal': [215.9, 355.6] };
  const mm = hu => Math.round(hu / 7200 * 25.4 * 10) / 10, huMm = m => Math.round(m / 25.4 * 7200);
  function paperDialog() {
    const p = st.doc.page;
    const land = p.w > p.h;
    const pw = mm(Math.min(p.w, p.h)), ph = mm(Math.max(p.w, p.h));
    const name = Object.keys(PAPERS).find(k => Math.abs(PAPERS[k][0] - pw) < 1 && Math.abs(PAPERS[k][1] - ph) < 1) || 'custom';
    dialog('편집 용지', `
      <fieldset><legend>용지 종류</legend><div class="grid2">
        ${fld('종류', `<select id="ppK">${Object.keys(PAPERS).map(k => `<option value="${k}">${k} (${PAPERS[k][0]}×${PAPERS[k][1]}mm)</option>`).join('')}<option value="custom">사용자 정의</option></select>`)}
        ${fld('방향', '<select id="ppO"><option value="0">세로</option><option value="1">가로</option></select>')}
        ${fld('폭(mm)', num('ppW', pw, 0.1))}
        ${fld('길이(mm)', num('ppH', ph, 0.1))}
      </div></fieldset>
      <fieldset><legend>용지 여백(mm)</legend><div class="grid2">
        ${fld('위쪽', num('mT', mm(p.mt), 0.1))}${fld('머리말', num('mH', mm(p.mh), 0.1))}
        ${fld('왼쪽', num('mL', mm(p.ml), 0.1))}${fld('오른쪽', num('mR', mm(p.mr), 0.1))}
        ${fld('꼬리말', num('mF', mm(p.mf), 0.1))}${fld('아래쪽', num('mB', mm(p.mb), 0.1))}
        ${fld('제본', num('mG', mm(p.gutter || 0), 0.1))}
      </div></fieldset>`, {
      onOpen: d => {
        d.querySelector('#ppK').value = name; d.querySelector('#ppO').value = land ? '1' : '0';
        d.querySelector('#ppK').addEventListener('change', e => { const s = PAPERS[e.target.value]; if (s) { d.querySelector('#ppW').value = s[0]; d.querySelector('#ppH').value = s[1]; } });
      },
      onOk: d => {
        const w = huMm(+v(d, '#ppW')), h = huMm(+v(d, '#ppH')), l = v(d, '#ppO') === '1';
        const np = { w: l ? Math.max(w, h) : Math.min(w, h), h: l ? Math.min(w, h) : Math.max(w, h), landscape: l,
          mt: huMm(+v(d, '#mT')), mh: huMm(+v(d, '#mH')), ml: huMm(+v(d, '#mL')), mr: huMm(+v(d, '#mR')), mf: huMm(+v(d, '#mF')), mb: huMm(+v(d, '#mB')), gutter: huMm(+v(d, '#mG')) };
        if (np.w - np.ml - np.mr - np.gutter < 2000 || np.h - np.mt - np.mb - np.mh - np.mf < 2000) { toast('여백이 너무 커요'); return false; }
        Ed.act(() => { st.doc.page = np; });
        Ed.layout();
      },
    });
  }
  function setOrientation(l) {
    const p = st.doc.page;
    if ((p.w > p.h) === l) return;
    Ed.act(() => { st.doc.page = Object.assign({}, p, { w: p.h, h: p.w, landscape: l }); });
    Ed.layout();
  }

  function hfDialog() {
    const txt = b => (b || []).map(p => p.runs.map(r => r.t === 'text' ? r.text : r.t === 'pagenum' ? '[쪽]' : r.t === 'tab' ? '\t' : '').join('')).join('\n');
    const al = b => (b && b[0] && b[0].align) || 'center';
    dialog('머리말 · 꼬리말', `
      <fieldset><legend>머리말 (쪽 맨 위)</legend>${fld('내용', `<textarea id="hT">${Model.esc(txt(st.doc.header))}</textarea>`)}
        ${fld('정렬', `<select id="hA"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select>`)}</fieldset>
      <fieldset><legend>꼬리말 (쪽 맨 아래)</legend>${fld('내용', `<textarea id="fT">${Model.esc(txt(st.doc.footer))}</textarea>`)}
        ${fld('정렬', `<select id="fA"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select>`)}</fieldset>
      <p style="font-size:12px;color:var(--sub);margin:0">[쪽] 이라고 쓰면 그 자리에 쪽 번호가 들어가요. 비우면 지워져요.</p>`, {
      noEnter: true,
      onOpen: d => { d.querySelector('#hA').value = al(st.doc.header); d.querySelector('#fA').value = al(st.doc.footer); },
      onOk: d => {
        const mk = (t, a) => t.trim() ? t.split('\n').map(line => {
          const p = Model.para(); p.align = a;
          line.split(/(\[쪽\])/).forEach(part => { if (part === '[쪽]') p.runs.push({ t: 'pagenum' }); else if (part) p.runs.push({ t: 'text', text: part, cs: Object.assign({}, Model.BASE, { size: 9 }) }); });
          return p;
        }) : [];
        Ed.act(() => { st.doc.header = mk(v(d, '#hT'), v(d, '#hA')); st.doc.footer = mk(v(d, '#fT'), v(d, '#fA')); });
        Ed.layout();
      },
    });
  }
  function pageNumDialog() {
    const POS = [['', '없음'], ['BOTTOM_CENTER', '아래 가운데'], ['BOTTOM_RIGHT', '아래 오른쪽'], ['BOTTOM_LEFT', '아래 왼쪽'], ['TOP_CENTER', '위 가운데'], ['TOP_RIGHT', '위 오른쪽'], ['TOP_LEFT', '위 왼쪽'], ['OUTSIDE_BOTTOM', '아래 바깥쪽'], ['OUTSIDE_TOP', '위 바깥쪽']];
    dialog('쪽 번호 매기기', `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${POS.map(([k, l]) => `<label class="chk" style="padding:8px;border:1px solid var(--line);border-radius:6px"><input type="radio" name="pn" value="${k}" ${(st.doc.pageNum || '') === k ? 'checked' : ''}>${l}</label>`).join('')}</div><p style="font-size:12px;color:var(--sub)">번호 모양: - 1 -</p>`, {
      onOk: d => { const x = d.querySelector('[name=pn]:checked'); Ed.act(() => { st.doc.pageNum = x && x.value ? x.value : null; }); Ed.layout(); },
    });
  }

  function tableDialog() {
    dialog('표 만들기', `<div class="tblpick" id="tPick">${Array.from({ length: 80 }, (_, i) => `<i data-r="${Math.floor(i / 10) + 1}" data-c="${i % 10 + 1}"></i>`).join('')}</div>
      <div class="grid2">${fld('줄 개수', num('tR', 3, 1, 'min="1" max="500"'))}${fld('칸 개수', num('tC', 3, 1, 'min="1" max="62"'))}</div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="tHead">첫 줄을 제목 칸으로(배경색)</label>`, {
      okLabel: '만들기',
      onOpen: d => {
        const pick = d.querySelector('#tPick');
        const mark = (r, c) => pick.querySelectorAll('i').forEach(i => i.classList.toggle('on', +i.dataset.r <= r && +i.dataset.c <= c));
        pick.addEventListener('mouseover', e => { const i = e.target.closest('i'); if (i) { mark(+i.dataset.r, +i.dataset.c); d.querySelector('#tR').value = i.dataset.r; d.querySelector('#tC').value = i.dataset.c; } });
        pick.addEventListener('click', e => { const i = e.target.closest('i'); if (i) { d.querySelector('#tR').value = i.dataset.r; d.querySelector('#tC').value = i.dataset.c; mark(+i.dataset.r, +i.dataset.c); } });
        mark(3, 3);
      },
      onOk: d => { Ed.restoreSel(); Ed.makeTable(Math.max(1, Math.min(500, +v(d, '#tR') || 1)), Math.max(1, Math.min(62, +v(d, '#tC') || 1)), { head: d.querySelector('#tHead').checked }); },
    });
  }
  function splitDialog() {
    const td = Ed.curCell();
    if (td && (td.rowSpan > 1 || td.colSpan > 1)) { Ed.split(1, 1); toast('합친 셀을 다시 나눴어요'); return; }
    dialog('셀 나누기', `<div class="grid2">${fld('줄 개수', num('sR', 1, 1, 'min="1" max="50"'))}${fld('칸 개수', num('sC', 2, 1, 'min="1" max="30"'))}</div>`, {
      onOk: d => { Ed.restoreSel(); Ed.split(Math.max(1, +v(d, '#sR') || 1), Math.max(1, +v(d, '#sC') || 1)); },
    });
  }
  function cellDialog() {
    const td = Ed.selectedCells()[0];
    const bg = td ? Model.hex(td.style.backgroundColor) : null;
    dialog('셀 테두리 · 배경', `
      <fieldset><legend>테두리</legend><div class="grid2">
        ${fld('종류', '<select id="bT"><option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option><option value="double">이중 실선</option><option value="none">없음</option></select>')}
        ${fld('굵기', `<select id="bW">${['0.1', '0.12', '0.15', '0.2', '0.25', '0.3', '0.4', '0.5', '0.7', '1.0', '1.5', '2.0'].map(w => `<option value="${w}" ${w === '0.12' ? 'selected' : ''}>${w} mm</option>`).join('')}</select>`)}
        ${fld('색', '<input type="color" id="bC" value="#000000">')}
        ${fld('어디에', '<select id="bWhere"><option value="all">모두</option><option value="outer">바깥쪽만</option><option value="keep">바꾸지 않음</option></select>')}
      </div></fieldset>
      <fieldset><legend>배경</legend>
        <label class="chk"><input type="checkbox" id="bgOn" ${bg ? 'checked' : ''}>배경 색 칠하기</label>
        <input type="color" id="bgC" value="${bg || '#e8eef7'}">
      </fieldset>`, {
      onOk: d => {
        const where = v(d, '#bWhere');
        const line = v(d, '#bT') === 'none' ? 'none' : `${v(d, '#bW')}mm ${v(d, '#bT')} ${v(d, '#bC')}`;
        const cells = Ed.selectedCells();
        const table = cells[0] && cells[0].closest('table');
        const g = table && Ed.gridOf(table);
        const rect = st.cellSel || (g && (() => { const i = g.cells.get(cells[0]); return { r1: i.r, c1: i.c, r2: i.r + i.rs - 1, c2: i.c + i.cs - 1 }; })());
        Ed.cellStyle(td => {
          if (where !== 'keep') {
            const i = g.cells.get(td);
            const outer = { t: i.r === rect.r1, b: i.r + i.rs - 1 === rect.r2, l: i.c === rect.c1, r: i.c + i.cs - 1 === rect.c2 };
            for (const [k, side] of [['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']]) if (where === 'all' || outer[k]) td.style['border' + side] = line;
          }
          td.style.backgroundColor = d.querySelector('#bgOn').checked ? v(d, '#bgC') : '';
        });
      },
    });
  }
  function cellSizeDialog() {
    const td = Ed.curCell();
    dialog('셀 크기', `<div class="grid2">${fld('칸 너비(mm)', num('csW', Math.round(td.offsetWidth * 25.4 / 96 * 10) / 10, 0.5))}${fld('줄 높이(mm)', num('csH', Math.round(td.offsetHeight * 25.4 / 96 * 10) / 10, 0.5))}</div>
      <p style="font-size:12px;color:var(--sub)">줄 높이는 글이 많으면 저절로 늘어나요.</p>`, {
      onOk: d => {
        const table = td.closest('table'), g = Ed.gridOf(table), me = g.cells.get(td);
        const w = +v(d, '#csW') * 72 / 25.4, h = +v(d, '#csH') * 72 / 25.4;
        Ed.act(() => {
          for (const [cell, i] of g.cells) {
            if (i.c === me.c && i.cs === 1 && w > 0) cell.style.width = w.toFixed(2) + 'pt';
            if (i.r === me.r && i.rs === 1 && h > 0) cell.style.height = h.toFixed(2) + 'pt';
          }
          Ed.fixTableWidth(table);
        });
      },
    });
  }
  function imageDialog(img) {
    const ar0 = /([\d.]+)\s*\/\s*([\d.]+)/.exec(img.style.aspectRatio || '');
    const w0 = Model.ptOf(img.style.width) || img.width * 0.75, h0 = Model.ptOf(img.style.height) || (ar0 ? w0 * ar0[2] / ar0[1] : img.height * 0.75);
    const toMm = p => Math.round(p * 25.4 / 72 * 10) / 10;
    dialog('그림 크기', `<div class="grid2">${fld('너비(mm)', num('iW', toMm(w0), 0.5))}${fld('높이(mm)', num('iH', toMm(h0), 0.5))}</div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="iKeep" checked>비율 유지</label>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button type="button" data-b="50">50%</button><button type="button" data-b="100">원래 크기</button><button type="button" data-b="fit">본문 폭</button><button type="button" data-b="del">그림 지우기</button></div>`, {
      onOpen: d => {
        const ratio = h0 / w0;
        d.querySelector('#iW').addEventListener('input', e => { if (d.querySelector('#iKeep').checked) d.querySelector('#iH').value = Math.round(e.target.value * ratio * 10) / 10; });
        d.querySelector('#iH').addEventListener('input', e => { if (d.querySelector('#iKeep').checked) d.querySelector('#iW').value = Math.round(e.target.value / ratio * 10) / 10; });
        d.addEventListener('click', e => {
          const b = e.target.closest('[data-b]'); if (!b) return;
          if (b.dataset.b === 'del') { Ed.act(() => img.remove()); closeDlg(); return; }
          let w = b.dataset.b === '50' ? w0 / 2 : b.dataset.b === '100' ? img.naturalWidth * 0.75 : Ed.geo().bodyW * 0.75;
          d.querySelector('#iW').value = toMm(w); d.querySelector('#iH').value = toMm(w * ratio);
        });
      },
      onOk: d => { const w = +v(d, '#iW') * 72 / 25.4, h = +v(d, '#iH') * 72 / 25.4; if (w > 0 && h > 0) Ed.act(() => { img.style.width = w.toFixed(1) + 'pt'; img.style.height = 'auto'; img.style.aspectRatio = `${Math.round(w * 100)}/${Math.round(h * 100)}`; }); },
    });
  }

  const SYMBOLS = {
    '자주 쓰는': '※☆★○●◎◇◆□■△▲▽▼→←↑↓↔⇒⇔·…‥〃“”‘’「」『』【】〈〉《》§¶†‡',
    '숫자·원': '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻⑴⑵⑶⑷⑸ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ',
    '수학': '±×÷≠≤≥≒≡∞∴∵∝√∫∬∮∑∏∂∇∈∋⊂⊃⊆⊇∪∩∧∨¬⇒⇔∀∃°′″℃℉‰½⅓¼¾²³¹⁰',
    '단위': '㎎㎏㎍㎖㎗㎕ℓ㎜㎝㎞㎟㎠㎡㎢㏄㎤㎥㎦㎐㎑㎒㎉㎾㎽㎸㎳㏈㏊㏏㎈㎮㎯㎭㎙㎚㎛㎕µ',
    '그리스': 'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
    '도형·기타': '♠♤♣♧♥♡♦◈▣◐◑▒▤▥▨▧▦▩♨☏☎☜☞♩♪♬✓✔✗✘☑☐▶◀▷◁♂♀',
  };
  let symRecent = [];
  try { symRecent = JSON.parse(localStorage.getItem('hwped.sym') || '[]'); } catch (e) { }
  function symbolDialog() {
    const tabs = Object.keys(SYMBOLS);
    let cur = symRecent.length ? '최근' : tabs[0];
    const grid = () => [...(cur === '최근' ? symRecent.join('') : SYMBOLS[cur])].map(c => `<button data-s="${c}">${c}</button>`).join('');
    dialog('문자표', `<div class="tabs">${['최근', ...tabs].map(t => `<button data-t="${t}" class="${t === cur ? 'on' : ''}">${t}</button>`).join('')}</div><div class="symgrid">${grid()}</div>`, {
      ok: false,
      onOpen: d => d.addEventListener('click', e => {
        const t = e.target.closest('[data-t]');
        if (t) { cur = t.dataset.t; d.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b === t)); d.querySelector('.symgrid').innerHTML = grid(); return; }
        const s = e.target.closest('[data-s]');
        if (s) {
          Ed.restoreSel(); Ed.insertText(s.dataset.s); Ed.saveSel();
          symRecent = [s.dataset.s, ...symRecent.filter(x => x !== s.dataset.s)].slice(0, 30);
          try { localStorage.setItem('hwped.sym', JSON.stringify(symRecent)); } catch (e) { }
          toast(s.dataset.s + ' 넣었어요', 900);
        }
      }),
    });
  }
  function linkDialog() {
    const r = Ed.range() || null;
    const a = r && (r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer).closest('a');
    const text = r ? r.toString() : '';
    dialog('하이퍼링크', `${fld('주소', `<input id="lU" value="${Model.esc(a ? a.getAttribute('href') : 'https://')}" inputmode="url">`)}${!a && !text ? fld('보일 글자', '<input id="lT">') : ''}`, {
      buttons: a ? [['del', '연결 지우기']] : [],
      onButton: (b) => { if (b === 'del') { Ed.restoreSel(); Ed.act(() => a.replaceWith(...a.childNodes)); closeDlg(); } },
      onOk: d => {
        const u = v(d, '#lU').trim();
        if (!/^(https?:\/\/|mailto:)/i.test(u)) { toast('주소는 https:// 로 시작해야 해요'); return false; }
        Ed.restoreSel();
        if (a) Ed.act(() => a.setAttribute('href', u));
        else if (text) Ed.inline('createLink', u);
        else { const t = (d.querySelector('#lT') && v(d, '#lT')) || u; Ed.insertHtml(`<a href="${Model.esc(u)}">${Model.esc(t)}</a>&#8203;`); }
      },
    });
  }
  function noteDialog(fn) {
    dialog(fn ? '각주 고치기' : '각주 넣기', fld('각주 내용', `<textarea id="nT">${fn ? Model.esc(fn.dataset.note || '') : ''}</textarea>`) + '<p style="font-size:12px;color:var(--sub)">각주는 화면에서 문서 끝에 모아 보여요. 저장하면 한글에서 쪽 아래에 나와요.</p>', {
      noEnter: true,
      buttons: fn ? [['del', '각주 지우기']] : [],
      onButton: b => { if (b === 'del' && !st.readOnly) { Ed.act(() => fn.remove()); closeDlg(); } },
      onOk: d => {
        if (st.readOnly) return;
        const t = v(d, '#nT');
        if (fn) Ed.act(() => { fn.dataset.note = t; });
        else { Ed.restoreSel(); Ed.insertHtml(`<sup class="fn" contenteditable="false" data-note="${Model.esc(t)}"></sup>&#8203;`); }
      },
    });
  }
  function eqDialog(eq) {
    dialog('수식', fld('수식 (한글 수식 문법, 예: a over b, x^2, sqrt {x})', `<textarea id="eT">${eq ? Model.esc(eq.dataset.script || '') : ''}</textarea>`) + '<div class="preview" id="eP" style="font-size:14pt"></div><p style="font-size:12px;color:var(--sub)">예: a over b (분수) · sqrt{x} (루트) · x^2 · H_2 O · alpha · LEFT( x RIGHT) · times · le</p>', {
      noEnter: true,
      buttons: eq ? [['del', '수식 지우기']] : [],
      onOpen: d => { const up = () => { d.querySelector('#eP').innerHTML = `<span class="eq">${Model.eqHtml(v(d, '#eT'))}</span>`; }; d.querySelector('#eT').addEventListener('input', up); up(); },
      onButton: b => { if (b === 'del' && !st.readOnly) { Ed.act(() => eq.remove()); closeDlg(); } },
      onOk: d => {
        if (st.readOnly) return;
        const t = v(d, '#eT').trim(); if (!t) return false;
        if (eq) Ed.act(() => { eq.dataset.script = t; eq.innerHTML = Model.eqHtml(t); });
        else { Ed.restoreSel(); Ed.insertHtml(`<span class="eq" contenteditable="false" data-script="${Model.esc(t)}">${Model.eqHtml(t)}</span>&#8203;`); }
      },
    });
  }
  function dateDialog() {
    const d0 = new Date();
    const pad = n => String(n).padStart(2, '0');
    const W = '일월화수목금토'[d0.getDay()];
    const forms = [`${d0.getFullYear()}년 ${d0.getMonth() + 1}월 ${d0.getDate()}일`, `${d0.getFullYear()}년 ${d0.getMonth() + 1}월 ${d0.getDate()}일 ${W}요일`,
      `${d0.getFullYear()}. ${d0.getMonth() + 1}. ${d0.getDate()}.`, `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`,
      `${d0.getHours() < 12 ? '오전' : '오후'} ${(d0.getHours() % 12) || 12}:${pad(d0.getMinutes())}`, `${pad(d0.getHours())}:${pad(d0.getMinutes())}`];
    dialog('날짜 · 시간 넣기', forms.map((f, i) => `<label class="chk" style="display:flex;padding:7px;border:1px solid var(--line);border-radius:6px;margin-bottom:4px"><input type="radio" name="df" value="${i}" ${i ? '' : 'checked'}>${f}</label>`).join(''), {
      okLabel: '넣기', onOk: d => { const x = d.querySelector('[name=df]:checked'); Ed.restoreSel(); Ed.insertText(forms[x ? +x.value : 0]); },
    });
  }
  let lastFind = { q: '' };
  function findDialog(withReplace) {
    const r = Ed.range();
    const q0 = r && !r.collapsed && r.toString().length < 80 ? r.toString() : lastFind.q;
    dialog(withReplace ? '찾아 바꾸기' : '찾기', `${fld('찾을 내용', `<input id="fQ" value="${Model.esc(q0 || '')}">`)}${withReplace ? fld('바꿀 내용', `<input id="fW" value="${Model.esc(lastFind.w || '')}">`) : ''}
      <div style="margin-top:8px"><label class="chk"><input type="checkbox" id="fCase" ${lastFind.matchCase ? 'checked' : ''}>대소문자 구별</label><label class="chk"><input type="checkbox" id="fBack">위로 찾기</label></div><div id="fMsg" style="margin-top:6px;color:var(--sub);font-size:12px"></div>`, {
      okLabel: '다음 찾기',
      buttons: withReplace ? [['one', '바꾸기'], ['all', '모두 바꾸기']] : [],
      onOk: d => {
        lastFind = { q: v(d, '#fQ'), w: withReplace ? v(d, '#fW') : lastFind.w, matchCase: d.querySelector('#fCase').checked, back: d.querySelector('#fBack').checked };
        d.querySelector('#fMsg').textContent = Ed.find(lastFind.q, lastFind) ? '찾았어요. 다음은 Ctrl+L' : '찾는 글자가 없어요';
        return false;
      },
      onButton: (b, d) => {
        if (st.readOnly) { toast('보기 모드예요'); return; }
        lastFind = { q: v(d, '#fQ'), w: v(d, '#fW'), matchCase: d.querySelector('#fCase').checked };
        if (b === 'one') d.querySelector('#fMsg').textContent = Ed.replaceOne(lastFind.q, lastFind.w, lastFind) ? '바꾸고 다음을 찾았어요' : '더 없어요';
        else { const n = Ed.replaceAll(lastFind.q, lastFind.w, lastFind); d.querySelector('#fMsg').textContent = `${n}개를 바꿨어요`; }
      },
    });
  }
  function gotoDialog() {
    dialog('찾아가기', fld(`쪽 번호 (1~${st.pages})`, num('gP', Ed.caretPage(), 1, `min="1" max="${st.pages}"`)), { okLabel: '가기', onOk: d => { Ed.gotoPage(+v(d, '#gP') || 1); return true; } });
  }
  function docInfo() {
    const s = Ed.stats();
    dialog('문서 정보', `<table class="keys">
      <tr><td>파일 이름</td><td>${Model.esc(app.name)}</td></tr><tr><td>쪽 수</td><td>${s.pages}</td></tr>
      <tr><td>글자 (공백 포함)</td><td>${s.chars.toLocaleString()}</td></tr><tr><td>글자 (공백 빼고)</td><td>${s.noSpace.toLocaleString()}</td></tr>
      <tr><td>낱말</td><td>${s.words.toLocaleString()}</td></tr><tr><td>문단</td><td>${s.paras}</td></tr><tr><td>표 · 그림 · 각주</td><td>${s.tables} · ${s.images} · ${s.notes}</td></tr>
      <tr><td>용지</td><td>${mm(st.doc.page.w)} × ${mm(st.doc.page.h)} mm</td></tr></table>`, { ok: false });
  }
  function keysDialog() {
    const groups = [['파일', ['newDoc', 'open', 'save', 'saveAs', 'print', 'docInfo', 'closeDoc', 'exitApp']], ['편집', ['undo', 'redo', 'cut', 'copy', 'paste', 'pastePlain', 'selectAll', 'find', 'replace', 'findNext', 'goto', 'painter', 'clearFormat', 'deleteLine', 'toggleOverwrite']],
      ['보기', ['zoomIn', 'zoomOut', 'zoom100', 'pageView', 'showMarks', 'showCodes']], ['입력', ['table', 'image', 'textbox', 'symbol', 'equation', 'link', 'footnote', 'date', 'pageBreak']],
      ['서식', ['charShape', 'paraShape', 'styles', 'bold', 'italic', 'underline', 'strike', 'sup', 'sub', 'sizeUp', 'sizeDown', 'spaceWide', 'spaceNarrow', 'alignJustify', 'alignLeft', 'alignCenter', 'alignRight', 'alignDistribute', 'indent', 'outdent', 'lsWide', 'lsNarrow']],
      ['쪽', ['paper', 'header', 'pageNum']], ['표', ['cellBlock', 'merge', 'split', 'cellBorder', 'rowBelow', 'delRow']], ['검토·도구', ['spell', 'keys']]];
    const extra = { '스타일': [['바탕글 / 본문 / 개요 1~7', 'Ctrl+1 / 2 / 3~9']], '표': [['다음 칸 / 앞 칸', 'Tab / Shift+Tab'], ['표 안에서 줄 추가', 'Ctrl+Enter'], ['셀 블록에서 범위 넓히기', '방향키']], '입력': [['줄 나누기(문단 안)', 'Shift+Enter']] };
    let h = '<table class="keys">';
    for (const [g, list] of groups) {
      h += `<tr class="h"><td colspan="2">${g}</td></tr>`;
      for (const n of list) if (C[n] && C[n].keys) h += `<tr><td>${C[n].label}</td><td>${C[n].keys}</td></tr>`;
      for (const [l, k] of extra[g] || []) h += `<tr><td>${l}</td><td>${k}</td></tr>`;
      if (g === '서식') for (const [l, k] of extra['스타일']) h += `<tr><td>${l}</td><td>${k}</td></tr>`;
    }
    h += '</table><p style="font-size:12px;color:var(--sub)">키보드(덱스·블루투스 키보드)에서 한글 2022와 같은 단축키를 써요. Ctrl+N, T 처럼 쉼표가 있으면 Ctrl+N을 누른 뒤 T를 눌러요. PC 브라우저에선 Ctrl+N 같은 몇몇 키를 브라우저가 먼저 가져갈 수 있어요.</p>';
    dialog('단축키 목록', h, { ok: false });
  }
  function aboutDialog() {
    dialog('HWP 편집기', `<p>한글 문서(.hwp · .hwpx)를 열어 보고 고치는 무료 앱이에요. 파일은 인터넷으로 보내지 않고 기기 안에서만 열어요.</p>
      <ul style="padding-left:18px;font-size:12.5px;line-height:1.6">
        <li>저장은 <b>.hwpx</b>(한글 2014 이상에서 열림)로 해요. .hwp로 연 문서도 .hwpx로 저장돼요.</li>
        <li>암호·배포용 문서, 차트·그리기 개체 일부, 다단, 쪽 테두리는 아직 못 다뤄요(글자는 남아요).</li>
        <li>화면 배치는 한글 2022와 비슷하게 맞췄고, 단축키는 같게 했어요. 그림(아이콘)은 새로 그렸어요.</li>
        <li>"한글", "한컴"은 한글과컴퓨터의 상표예요. 이 앱은 한글과컴퓨터가 만든 앱이 아니에요.</li>
        <li>사용한 공개 프로그램: pako(MIT·Zlib), python-hwpx 뼈대 파일(Apache-2.0).</li>
      </ul>
      <p style="font-size:12px;color:var(--sub)">버전 ${VERSION}</p>
      <p><a href="https://qr.kakaopay.com/Ej8Yr8VXm" data-ext>☕ 가난한 간호학생에게 커피 한 잔(1,000원) 후원하기</a></p>`, { ok: false });
  }

  // ---------- 파일 ----------
  function openPicker() {
    if (Native && Native.openDoc) { Native.openDoc(); return; }
    $('#fileIn').click();
  }
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    openBytes(new Uint8Array(await f.arrayBuffer()), f.name, false);
  });
  function sniff(bytes, name) {
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return 'hwp';
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) return 'hwpx';
    if (/\.html?$/i.test(name)) return 'html';
    if (/\.hwp$/i.test(name) && new TextDecoder('latin1').decode(bytes.subarray(0, 16)).startsWith('HWP Document')) return 'hwp3';
    // 글자 파일이 아니면(그림·PDF 등) 열지 않는다
    const head = bytes.subarray(0, 4096);
    let zeros = 0;
    for (const b of head) if (b === 0) zeros++;
    if (zeros > 4 || /\.(pdf|docx?|pptx?|xlsx?|jpe?g|png|gif|zip|mp4|apk)$/i.test(name)) return 'other';
    return 'txt';
  }
  function openBytes(bytes, name, writable, uri) {
    let doc;
    try {
      const kind = sniff(bytes, name);
      if (kind === 'hwp') doc = Hwp5.read(bytes);
      else if (kind === 'hwpx') doc = Hwpx.read(bytes);
      else if (kind === 'hwp3') throw new Error('아주 옛날 한글(97 이전) 문서는 열 수 없어요');
      else if (kind === 'other') throw new Error('한글 문서(.hwp · .hwpx)가 아니라서 열 수 없어요');
      else if (kind === 'html') {
        doc = Model.empty();
        const tmp = document.createElement('div'); tmp.style.cssText = 'position:absolute;left:-9999px;width:600px';
        tmp.innerHTML = sanitize(new TextDecoder().decode(bytes));
        document.body.appendChild(tmp); doc.blocks = Model.fromDom(tmp, doc); tmp.remove();
      } else {
        doc = Model.empty();
        let text = new TextDecoder('utf-8').decode(bytes);
        if (/�/.test(text)) { try { text = new TextDecoder('euc-kr').decode(bytes); } catch (e) { } }
        doc.blocks = text.replace(/\r\n?/g, '\n').split('\n').map(t => Model.para(t));
      }
      app.kind = kind;
    } catch (e) {
      console.error(e);
      dialog('문서를 열지 못했어요', `<p>${Model.esc(/열 수 없어요|아니에요/.test(e.message) ? e.message : '문서를 읽다가 문제가 생겼어요: ' + e.message)}</p><p style="font-size:12px;color:var(--sub)">${Model.esc(name)} · ${(bytes.length / 1048576).toFixed(1)}MB · 버전 ${VERSION}</p>`, { ok: false });
      return false;
    }
    const outName = name;
    openModel(doc, outName, app.kind);
    app.writable = !!writable && app.kind === 'hwpx';
    app.uri = uri || null;
    if (narrow()) Ed.fitWidth();
    setReadOnly(narrow() && pref('directEdit') !== '1');      // 휴대폰은 먼저 보기 모드(뷰어)로
    if (app.kind === 'hwp') toast('.hwp 문서예요. 저장하면 같은 이름의 .hwpx로 저장돼요', 3500);
    addRecent(name, uri);
    return true;
  }
  function openModel(doc, name, kind) {
    app.name = name; app.kind = kind; app.writable = false; app.uri = null;
    Ed.load(doc);
    showWelcome(false);
    if (narrow()) Ed.fitWidth();
    title(); drawMenus(); refresh();
    clearDraft();
  }
  const hwpxName = () => app.name.replace(/\.(hwp|hwpx|txt|html?)$/i, '') + '.hwpx';
  function bytesOut() {
    const doc = Ed.toModel();
    if (doc.blocks.lost) toast(`차트 같은 개체 ${doc.blocks.lost}개는 이 앱에서 저장하지 못해 빠져요`, 4000);
    return Hwpx.write(doc, { title: app.name.replace(/\.[^.]+$/, '') });
  }
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  function save(asNew) {
    let bytes;
    try { bytes = bytesOut(); } catch (e) { console.error(e); toast('저장 파일을 만들지 못했어요: ' + e.message, 4000); return; }
    const name = hwpxName();
    if (Native && Native.saveDoc) {
      Native.saveDoc(name, b64(bytes), !!(asNew || !app.writable));
      return;
    }
    download(bytes, name, 'application/hwp+zip');
    markSaved(name);
  }
  function markSaved(name) {
    app.name = name; app.kind = 'hwpx';
    st.dirty = false; title(); clearDraft();
    toast('저장했어요: ' + name);
  }
  // 안드로이드에서 저장이 끝나면 부른다
  window.HwpNative = {
    onSaved(ok, name, msg, writable) { if (ok) { app.writable = !!writable; markSaved(name || hwpxName()); } else if (msg) toast(msg, 3500); },
    onExported(ok, msg) { toast(msg || (ok ? '저장했어요' : '저장하지 못했어요'), 3000); },
    // 고른 파일을 조각(base64)으로 받아 연다
    onOpened(name, size, writable, uri) {
      // 조각마다 따로 base64를 풀어 이어 붙인다 (큰 파일도 깨지지 않게)
      try {
        if (size > 3 * 1024 * 1024) toast('큰 문서를 여는 중이에요…', 8000);
        const bytes = new Uint8Array(size);
        const step = 3 * 256 * 1024;
        let got = 0;
        for (let off = 0; off < size; off += step) {
          const bin = atob(Native.chunk(off, step));
          for (let i = 0; i < bin.length; i++) bytes[off + i] = bin.charCodeAt(i);
          got += bin.length;
          if (!bin.length) break;
        }
        Native.chunkDone();
        if (size > 0 && !got) return;                    // 같은 파일을 두 번 받은 경우
        setTimeout(() => { if ($('#toast').textContent.startsWith('큰 문서')) $('#toast').classList.remove('show'); openBytes(got === size ? bytes : bytes.subarray(0, got), name, writable, uri); }, 0);
      } catch (e) {
        console.error(e);
        dialog('파일을 받지 못했어요', `<p>${Model.esc(e.message)}</p><p style="font-size:12px;color:var(--sub)">${Model.esc(name)} · 버전 ${VERSION}</p>`, { ok: false });
      }
    },
    onBack() {
      if ($('#dlgBack').classList.contains('open')) { closeDlg(); return true; }
      if (pop) { closePop(); return true; }
      if (st.cellSel) { Ed.clearCellBlock(); return true; }
      if (!st.readOnly && narrow() && !$('#welcome').classList.contains('open')) { setReadOnly(true); return true; }
      if (st.dirty) { confirmLeave(() => { st.dirty = false; Native.exit(); }); return true; }
      return false;
    },
  };
  function download(bytes, name, mime) {
    const blob = new Blob([bytes], { type: mime });
    if (isIOS && navigator.canShare && navigator.share) {
      const file = new File([blob], name, { type: mime });
      if (navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(() => { }); return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function exportFile(bytes, name, mime) {
    if (Native && Native.exportFile) { Native.exportFile(name, mime, b64(bytes)); return; }
    download(bytes, name, mime);
  }
  function exportTxt() {
    const text = Model.blocksText(Ed.toModel().blocks);
    exportFile(new TextEncoder().encode(text), app.name.replace(/\.[^.]+$/, '') + '.txt', 'text/plain');
  }
  function printHtml(forFile) {
    const p = st.doc.page;
    const mmv = hu => (hu / 7200 * 25.4).toFixed(1) + 'mm';
    const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n')
      .split('\n').filter(l => /#doc|@counter-style|counter/.test(l) && !/caret/.test(l)).join('\n');
    const txt = b => Model.blocksText(b || []).replace(/\n/g, ' ').replace(/"/g, '\\"');
    const hT = txt(st.doc.header), fT = txt(st.doc.footer);
    const pn = st.doc.pageNum;
    const pnBox = pn ? (/TOP/.test(pn) ? '@top-' : '@bottom-') + (/LEFT/.test(pn) ? 'left' : /RIGHT/.test(pn) ? 'right' : 'center') : '';
    let html = cleanForExport(forFile);
    const notes = [...el.querySelectorAll('.fn')].map((f, i) => `<p style="margin:0">${i + 1}) ${Model.esc(f.dataset.note || '')}</p>`).join('');
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${Model.esc(app.name)}</title><style>
      @page { size: ${mmv(p.w)} ${mmv(p.h)}; margin: ${mmv(p.mt + p.mh)} ${mmv(p.mr)} ${mmv(p.mb + p.mf)} ${mmv(p.ml + (p.gutter || 0))};
        ${hT ? `@top-center { content: "${hT}"; font: 9pt serif; }` : ''} ${fT ? `@bottom-center { content: "${fT}"; font: 9pt serif; }` : ''}
        ${pn ? `${pnBox} { content: "- " counter(page) " -"; font: 10pt serif; }` : ''} }
      html, body { margin: 0; background: #fff; }
      ${css}
      #doc { position: static !important; width: auto !important; }
      #doc [data-pb] { break-before: page; }
      #doc table.tb { break-inside: auto; } #doc tr { break-inside: avoid; }
      .notes { margin-top: 12pt; border-top: 0.5pt solid #000; padding-top: 3pt; font: 9pt/1.5 serif; width: 50%; }
      </style></head><body><div id="doc">${html}</div>${notes ? `<div class="notes">${notes}</div>` : ''}</body></html>`;
  }
  // 그림 주소(blob:)는 다른 창에서 못 쓰니 data: 로 바꾼다
  function cleanForExport() {
    const div = document.createElement('div');
    div.innerHTML = Ed.cleanHtml();
    for (const img of div.querySelectorAll('img[data-bin]')) {
      const b = st.doc.bins[img.dataset.bin];
      if (b) img.src = `data:${{ jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' }[b.ext] || 'image/png'};base64,${b64(b.data)}`;
    }
    div.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    return div.innerHTML;
  }
  function exportHtml() {
    exportFile(new TextEncoder().encode(printHtml(true)), app.name.replace(/\.[^.]+$/, '') + '.html', 'text/html');
  }
  function print(pdf) {
    const html = printHtml();
    if (Native && Native.print) { Native.print(app.name.replace(/\.[^.]+$/, ''), html, st.doc.page.w > st.doc.page.h); if (pdf) toast('인쇄 화면에서 프린터를 [PDF로 저장]으로 고르세요', 4000); return; }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 300);
    if (pdf) toast('인쇄 창에서 대상을 [PDF로 저장]으로 고르세요', 4000);
  }
  function shareDoc() {
    let bytes;
    try { bytes = bytesOut(); } catch (e) { toast('파일을 만들지 못했어요'); return; }
    const name = hwpxName();
    if (Native && Native.share) { Native.share(name, 'application/hwp+zip', b64(bytes)); return; }
    const file = new File([bytes], name, { type: 'application/hwp+zip' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: name }).catch(() => { });
    else { download(bytes, name, 'application/hwp+zip'); toast('이 기기에선 공유 대신 내려받기로 저장했어요'); }
  }
  function openUrl(u) { if (Native && Native.openUrl) Native.openUrl(u); else window.open(u, '_blank', 'noopener'); }

  function confirmLeave(go) {
    if (!st.dirty) { go(); return; }
    dialog('저장하지 않은 내용', '<p>고친 내용을 아직 저장하지 않았어요.</p>', {
      ok: false, buttons: [['save', '저장하기'], ['drop', '저장 안 함']],
      onButton: b => { closeDlg(); if (b === 'save') { save(false); } else { st.dirty = false; clearDraft(); go(); } },
    });
  }

  // ---------- 최근 문서·자동 저장(복구용) ----------
  function recentList() { try { return JSON.parse(localStorage.getItem('hwped.recent') || '[]'); } catch (e) { return []; } }
  function addRecent(name, uri) {
    if (!uri) return;
    const list = [{ name, uri }, ...recentList().filter(x => x.uri !== uri)].slice(0, 8);
    try { localStorage.setItem('hwped.recent', JSON.stringify(list)); } catch (e) { }
  }
  let draftT = 0;
  function scheduleDraft() { clearTimeout(draftT); draftT = setTimeout(saveDraft, 4000); }
  function saveDraft() {
    if (!st.dirty) return;
    try {
      const bins = {};
      let total = 0;
      for (const k in st.doc.bins) { total += st.doc.bins[k].data.length; if (total < 2500000) bins[k] = { ext: st.doc.bins[k].ext, b64: b64(st.doc.bins[k].data) }; }
      localStorage.setItem('hwped.draft', JSON.stringify({ name: app.name, html: Ed.cleanHtml(), page: st.doc.page, header: st.doc.header, footer: st.doc.footer, pageNum: st.doc.pageNum, bins, time: Date.now() }));
    } catch (e) { try { localStorage.removeItem('hwped.draft'); } catch (x) { } }
  }
  function clearDraft() { clearTimeout(draftT); try { localStorage.removeItem('hwped.draft'); } catch (e) { } }
  function restoreDraft() {
    let d;
    try { d = JSON.parse(localStorage.getItem('hwped.draft') || 'null'); } catch (e) { }
    if (!d) return;
    const doc = Model.empty();
    Object.assign(doc, { page: d.page, header: d.header || [], footer: d.footer || [], pageNum: d.pageNum || null, bins: {} });
    for (const k in d.bins || {}) doc.bins[k] = { ext: d.bins[k].ext, data: Uint8Array.from(atob(d.bins[k].b64), c => c.charCodeAt(0)) };
    doc.blocks = [];
    openModel(doc, d.name, 'draft');
    el.innerHTML = d.html;
    el.querySelectorAll('img[data-bin]').forEach(i => { i.src = Ed.binUrl(i.dataset.bin); });
    Ed.hist.reset(); st.dirty = true; Ed.layout(); title();
    setReadOnly(false);
    toast('저장 안 된 문서를 되살렸어요');
  }
  function showWelcome(on) {
    $('#welcome').classList.toggle('open', on);
    if (!on) return;
    let h = '';
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem('hwped.draft') || 'null'); } catch (e) { }
    if (draft) h += `<button data-draft>⟲ 저장 안 된 문서 되살리기 — ${Model.esc(draft.name)}</button>`;
    const rec = Native && Native.openRecent ? recentList() : [];
    if (rec.length) h += '<div style="color:var(--sub);font-size:12px;margin:6px 0 2px">최근 문서</div>' + rec.map(r => `<button data-uri="${Model.esc(r.uri)}">📄 ${Model.esc(r.name)}</button>`).join('');
    $('#recent').innerHTML = h;
  }
  $('#recent').addEventListener('click', e => {
    if (e.target.closest('[data-draft]')) { restoreDraft(); return; }
    const b = e.target.closest('[data-uri]');
    if (b && Native && Native.openRecent && !Native.openRecent(b.dataset.uri)) toast('파일을 찾을 수 없어요(옮겼거나 지웠어요)');
  });
  window.addEventListener('beforeunload', e => { if (st.dirty && !Native) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });

  function toggleTheme() {
    const r = document.documentElement;
    const dark = r.dataset.theme === 'dark' || (!r.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    r.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('hwped.theme', r.dataset.theme); } catch (e) { }
  }
  try { const t = localStorage.getItem('hwped.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { }

  // ---------- 시작 ----------
  document.execCommand('defaultParagraphSeparator', false, 'p');
  el.contentEditable = 'true';
  openModel(Model.empty(), '새 문서.hwpx', 'new');
  setReadOnly(false);
  showWelcome(true);
  $('#ver').textContent = '버전 ' + VERSION;
  // 글꼴을 다 받으면 줄이 바뀌니 쪽을 다시 나눈다
  if (document.fonts) { document.fonts.ready.then(() => Ed.layout()); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => Ed.paginateSoon()); }
  window.addEventListener('resize', () => { if (narrow() && st.zoom > 1.2) Ed.fitWidth(); status(); });
  // 다른 앱에서 연 파일
  if (Native && Native.pendingFile) setTimeout(() => Native.pendingFile(), 50);
  window.Hwped = { run, openBytes, app, C, bytesOut };
})();
