// 화면 동작 (휴대폰용)
(function () {
  'use strict';
  var T = window.TEMPLATES, N = window.Nursing;
  var $ = function (id) { return document.getElementById(id); };
  var bridge = window.Android || null;
  var state = { order: Object.keys(T), checked: {}, suggested: [], causes: {}, open: null, model: null, text: '', before: null, editing: false, busy: false };

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2200); }
  function seg(id) { var on = document.querySelector('#' + id + ' .on'); return on ? on.getAttribute('data-v') : null; }
  function bindSeg(id, fn) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (fn) fn(b.getAttribute('data-v'));
      });
    });
  }
  function setSeg(id, v) { document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === v); }); }
  function go(page) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('on', p.id === page); });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-p') === page); });
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-p')); }); });

  // ---------- 자료 ----------
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function getDate() { var v = $('date').value; if (!v) return new Date(); var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  ['s', 'o', 'dx'].forEach(function (id) {
    var saved = store('draft_' + id); if (saved) $(id).value = saved;
    $(id).addEventListener('input', function () { store('draft_' + id, $(id).value); });
  });
  $('date').value = today();
  bindSeg('age');
  bindSeg('fmt', function () { if (state.text) build(false); });

  window.loadSample = function () {
    $('s').value = '배가 쥐어짜는 듯이 너무 아파요';
    $('o').value = 'Fever(+)\nNRS : 5/10점\n배를 움켜잡은 채 웅크리고 있는 모습 관찰됨\nChilling(+)\n데노간(+)\nWBC(20000)\nCRP(4.0)';
    $('dx').value = 'acute peritonitis';
    setSeg('age', 'adult');
    ['s', 'o', 'dx'].forEach(function (id) { store('draft_' + id, $(id).value); });
    toast('예시를 불러왔어요');
  };
  window.clearAll = function () {
    ['s', 'o', 'dx'].forEach(function (id) { $(id).value = ''; store('draft_' + id, ''); });
    state.checked = {}; state.suggested = []; state.causes = {}; state.order = Object.keys(T); state.text = ''; state.model = null;
    renderList(); renderDoc(); toast('지웠어요');
  };

  // ---------- 진단 ----------
  window.suggest = function (move) {
    var found = N.findDiagnoses($('s').value, $('o').value, $('dx').value);
    if (seg('age') === 'child') found = found.map(function (x) { return x === '성인 낙상의 위험' ? '아동 낙상의 위험' : x; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    else found = found.filter(function (x) { return x !== '아동 낙상의 위험'; });
    var top = found.slice(0, 3);
    state.suggested = top; state.checked = {};
    top.forEach(function (x) { state.checked[x] = true; });
    state.order = top.concat(Object.keys(T).filter(function (x) { return top.indexOf(x) < 0; }));
    state.open = top[0] || null;
    renderList();
    if (move) go('p-dx');
    toast(top.length ? '추천 진단: ' + top.join(', ') : '추천할 진단을 찾지 못했어요. 직접 체크하세요.');
  };
  function cause(name) { if (!state.causes[name]) state.causes[name] = { cause: T[name].cause, origin: '' }; return state.causes[name]; }
  function renderList() {
    var box = $('dxlist'); box.innerHTML = '';
    state.order.forEach(function (name, idx) {
      var t = T[name], on = !!state.checked[name];
      var row = document.createElement('div'); row.className = 'dx' + (on ? ' on' : '');
      row.innerHTML = '<div class="chk">' + (on ? '✓' : '') + '</div><div class="name"><b></b><small></small></div>' +
        (state.suggested.indexOf(name) >= 0 ? '<span class="badge">추천</span>' : '') +
        '<div class="order"><button data-d="-1">▲</button><button data-d="1">▼</button></div>';
      row.querySelector('b').textContent = name;
      row.querySelector('small').textContent = t.en + ' · ' + t.domain.replace(/ [A-Za-z/ ]+$/, '') + ' · p.' + t.page;
      row.querySelector('.chk').addEventListener('click', function (e) { e.stopPropagation(); state.checked[name] = !on; if (!on) state.open = name; renderList(); });
      row.querySelectorAll('.order button').forEach(function (b) {
        b.addEventListener('click', function (e) { e.stopPropagation(); move(name, +b.getAttribute('data-d')); });
      });
      row.addEventListener('click', function () { if (!on) state.checked[name] = true; state.open = state.open === name && on ? null : name; renderList(); });
      box.appendChild(row);
      if (state.open === name && state.checked[name]) {
        var c = cause(name), ed = document.createElement('div'); ed.className = 'cause';
        ed.innerHTML = '<label>원인 (관련 요인)</label><input class="c1"><label>원인의 원인 · 방식 2 (선택)</label><input class="c2" placeholder="예) 날음식 섭취"><div class="preview"></div>';
        var c1 = ed.querySelector('.c1'), c2 = ed.querySelector('.c2'), pv = ed.querySelector('.preview');
        c1.value = c.cause; c2.value = c.origin;
        var upd = function () { c.cause = c1.value.trim(); c.origin = c2.value.trim(); pv.textContent = '→ ' + N.formatDiagnosis(c.cause, name, c.origin); };
        c1.addEventListener('input', upd); c2.addEventListener('input', upd); upd();
        box.appendChild(ed);
      }
    });
  }
  function move(name, d) {
    var i = state.order.indexOf(name), j = i + d;
    if (j < 0 || j >= state.order.length) return;
    state.order.splice(i, 1); state.order.splice(j, 0, name); renderList();
  }
  window.autoSort = function () {
    var checked = state.order.filter(function (x) { return state.checked[x]; });
    var sorted = checked.sort(function (a, b) { return T[a].priority - T[b].priority; });
    state.order = sorted.concat(state.order.filter(function (x) { return !state.checked[x]; }));
    renderList(); toast('ABC → 생리적 → 안전 → 심리 → 교육 순서로 정렬했어요');
  };
  function chosen() { return state.order.filter(function (x) { return state.checked[x]; }).map(function (x) { var c = cause(x); return { name: x, cause: c.cause, origin: c.origin }; }); }

  // ---------- 결과 ----------
  window.build = function (moveTo) {
    var ch = chosen();
    if (!ch.length) { suggest(false); ch = chosen(); }
    if (!ch.length) { toast('간호진단을 하나 이상 체크하세요'); go('p-dx'); return; }
    var s = $('s').value, o = $('o').value, dx = $('dx').value, d = getDate();
    state.format = seg('fmt');
    if (state.format === 'report') { state.model = N.workbookModel(s, o, dx, ch, d, false); state.text = N.reportText(state.model); }
    else if (state.format === 'b4') { state.model = N.workbookModel(s, o, dx, ch, d, false); state.text = N.workbookText(state.model); }
    else { state.model = null; state.text = N.basic(s, o, dx, ch, d); }
    state.before = null; $('undo').style.display = 'none';
    if (state.editing) toggleEdit();
    renderDoc();
    if (moveTo) go('p-out');
  };
  function esc(x) { return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var SUB = /^(\[.+\]$|– (계획|수행) –$|진단 \d+ :|간호진단 \d+ :|\d순위:|단서묶음 \d|장기목표$|단기목표$|진단적 |치료적 |교육적 |주관적 자료|객관적 자료|자료조직|간호문제|간호수행$|간호중재|단기목표 평가|장기목표 평가|우선순위의 근거|관련\(위험\)|간호진단 진술|간호평가)/;
  function renderDoc() {
    var box = $('doc');
    if (!state.text) { box.innerHTML = '<div class="empty">자료를 넣고 ‘진단 추천 받기’ → ‘틀 만들기’를 누르세요.</div>'; return; }
    box.innerHTML = state.text.replace(/\n$/, '').split('\n').map(function (ln) {
      if (!ln.trim()) return '<div class="gap"></div>';
      if (/^─+$/.test(ln)) return '';
      var cls = '';
      if (ln.indexOf('■') === 0) cls = 'h';
      else if (/^(진단 \d+ :|간호진단 \d+ :)/.test(ln)) cls = 'dxh';
      else if (SUB.test(ln)) cls = 's';
      else if (/이론적 근거/.test(ln)) cls = 'why';
      var html = esc(ln).replace(/(__:__|__\/__|\([^()]*적으세요\)|\(대상자 반응: \)|달성 \/ 부분적 달성 \/ 달성 못함)/g, '<span class="blank">$1</span>');
      return '<div' + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</div>';
    }).join('');
  }
  window.toggleEdit = function () {
    state.editing = !state.editing;
    if (state.editing) { $('edit').value = state.text; $('edit').style.display = 'block'; $('doc').style.display = 'none'; $('editBtn').textContent = '완료'; }
    else {
      if ($('edit').value !== state.text) { state.text = $('edit').value; state.model = null; }
      $('edit').style.display = 'none'; $('doc').style.display = 'block'; $('editBtn').textContent = '편집'; renderDoc();
    }
  };
  function current() { if (state.editing) toggleEdit(); return state.text; }
  function html(cover) {
    if (state.model && state.format === 'report') return N.reportHtml(state.model, cover || null);
    return state.model ? N.workbookHtml(state.model) : N.simpleHtml(state.text);
  }
  // 제출 양식은 저장·인쇄 전에 표지 정보를 묻는다
  var coverNext = null;
  function withCover(next) {
    if (!(state.model && state.format === 'report')) { next(null); return; }
    var c = {}; try { c = JSON.parse(store('cover') || '{}'); } catch (e) {}
    $('cv1').value = c.subject || ''; $('cv2').value = c.title || ''; $('cv3').value = c.author || ''; $('cv4').value = c.school || '';
    coverNext = next; $('sheetBg').style.display = 'block'; setTimeout(function () { $('coverSheet').classList.add('open'); }, 10);
  }
  window.coverDone = function (use) {
    var c = { subject: $('cv1').value.trim(), title: $('cv2').value.trim(), author: $('cv3').value.trim(), school: $('cv4').value.trim() };
    store('cover', JSON.stringify(c)); closeSheets();
    var d = getDate(); c.date = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
    var next = coverNext; coverNext = null; if (next) next(use ? c : null);
  };
  window.closeSheets = function () { $('coverSheet').classList.remove('open'); closeSettings(); };
  function fileName(ext) { var d = getDate(); return '간호과정_' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + ext; }
  window.copyText = function () {
    var t = current(); if (!t) return;
    if (bridge) { bridge.copy(t); toast('복사했어요'); return; }
    navigator.clipboard.writeText(t).then(function () { toast('복사했어요'); });
  };
  window.shareText = function () { var t = current(); if (!t) return; if (bridge) bridge.share('간호과정', t); else if (navigator.share) navigator.share({ text: t }); };
  window.saveDoc = function () {
    if (!current()) return;
    withCover(function (cv) {
      var doc = '\ufeff' + html(cv);
      if (bridge) { toast(bridge.saveFile(fileName('.doc'), 'application/msword', doc)); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([doc], { type: 'application/msword' })); a.download = fileName('.doc'); a.click();
    });
  };
  window.printDoc = function () {
    if (!current()) return;
    withCover(function (cv) { var h = html(cv); if (bridge) bridge.print(fileName(''), h, state.format === 'b4'); else { var w = window.open(''); w.document.write(h); w.print(); } });
  };
  window.openUrl = function (u) { if (bridge) bridge.openUrl(u); else window.open(u); };

  // ---------- 제미나이 ----------
  window.openSettings = function () { $('key').value = store('gemini_key') || ''; $('model').value = store('gemini_model') || 'gemini-2.5-flash'; $('sheetBg').style.display = 'block'; setTimeout(function () { $('sheet').classList.add('open'); }, 10); };
  window.closeSettings = function () { $('sheet').classList.remove('open'); setTimeout(function () { $('sheetBg').style.display = 'none'; }, 250); };
  window.saveSettings = function () {
    var k = $('key').value.trim();
    store('gemini_key', k); store('gemini_model', $('model').value.trim() || 'gemini-2.5-flash');
    closeSettings();
    if (k) checkKey(k); else toast('저장했어요');
  };
  // 키가 실제로 동작하는지 확인
  function checkKey(k) {
    toast('키를 확인하는 중…');
    fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': k } })
      .then(function (r) { toast(r.status === 200 ? '✅ 키가 정상이에요. 이제 다듬기를 쓸 수 있어요' : '⚠️ 키가 올바르지 않아요. 다시 복사해 주세요'); })
      .catch(function () { toast('저장했어요 (인터넷 연결 시 확인돼요)'); });
  }
  // 키 발급: 발급 페이지를 열고, 돌아왔을 때 복사한 키를 찾아 사용할지 묻는다
  window.issueKey = function () {
    state.waitingKey = true;
    alert('Google AI Studio가 열려요.\n\n1. 구글 계정으로 로그인\n2. ‘Create API key(API 키 만들기)’ 누르기\n3. 만들어진 키 옆 ‘복사’ 누르기\n4. 이 앱으로 돌아오기\n\n돌아오면 복사한 키를 찾아서 넣어 드릴게요.');
    openUrl('https://aistudio.google.com/apikey');
  };
  window.onResumeApp = function () {
    if (!bridge || !bridge.clipboardKey) return;
    var found = bridge.clipboardKey();
    if (!found || found === store('gemini_key')) { if (state.waitingKey) { state.waitingKey = false; toast('복사한 키를 찾지 못했어요. 키 옆 ‘복사’를 누르고 돌아와 주세요'); } return; }
    if (!state.waitingKey && store('key_asked_' + found.slice(-6)) === '1') return;
    state.waitingKey = false; store('key_asked_' + found.slice(-6), '1');
    setTimeout(function () {
      if (confirm('복사한 제미나이 API 키를 찾았어요.\n(…' + found.slice(-6) + ')\n\n이 키를 앱에 저장해서 사용할까요?')) {
        store('gemini_key', found); if (!store('gemini_model')) store('gemini_model', 'gemini-2.5-flash');
        if ($('sheet').classList.contains('open')) $('key').value = found;
        checkKey(found);
      }
    }, 300);
  };
  function prompt(draft) {
    return '너는 한국 간호학과 교수다. 아래 [간호과정 초안]을 [대상자 자료]에 맞게 다듬어라.\n\n[대상자 자료]\n주관적 자료: ' + $('s').value + '\n객관적 자료: ' + $('o').value + '\n의학적 진단: ' + $('dx').value +
      '\n\n[반드시 지킬 규칙]\n1. 초안의 구조와 제목(■로 시작하는 제목, 장기목표, 단기목표, 단서묶음, 간호중재, 간호수행, 간호평가 등)과 순서를 그대로 유지한다.\n' +
      '2. 주관적 자료는 대상자가 직접 한 말만 큰따옴표로 적고, 객관적 자료는 관찰·검사·이미 투여된 약물만 적는다. (+)는 증상 있음/양성, (-)는 없음/음성이다.\n' +
      "3. 간호진단은 '(원인)과 관련된 (진단명)' 또는 '(원인)으로 인한 (원인/증상)과 관련된 (진단명)' 형식을 지키고, 진단명은 NANDA-I 2024-2026 용어를 쓴다.\n" +
      "4. 단기목표는 '대상자는 ~할 것이다' 형식으로 달성기간과 객관적인 수치를 반드시 포함한다.\n" +
      "5. 계획은 '~한다.', 중재·수행은 '~하였다.'로 쓰고, 이론적 근거는 전공 교재 수준의 사실로 1~2문장 쓴다. 대상자 자료에 맞게 구체화한다.\n" +
      "6. 자료에 없는 수치·시간·대상자 반응은 절대 지어내지 않는다. '__:__', '__/__', '(… 적으세요)' 같은 빈칸은 그대로 남긴다.\n" +
      '7. 확실하지 않은 의학 정보는 쓰지 않는다. 마크다운(**, #, 표)은 쓰지 말고 일반 텍스트로만 출력한다. 설명이나 인사말 없이 다듬은 문서만 출력한다.\n\n[간호과정 초안]\n' + draft;
  }
  window.polish = function () {
    if (state.busy) return;
    var key = store('gemini_key');
    if (!key) { openSettings(); toast('먼저 제미나이 API 키를 넣어 주세요'); return; }
    if (!current()) { build(false); if (!state.text) return; }
    if (store('privacy_ok') !== '1') {
      if (!confirm('입력한 자료와 초안이 Google 제미나이로 전송돼요.\n환자 이름, 등록번호, 생년월일 같은 개인정보는 넣지 마세요.\n\n계속할까요?')) return;
      store('privacy_ok', '1');
    }
    var model = store('gemini_model') || 'gemini-2.5-flash', btn = $('polish'), started = Date.now();
    state.busy = true; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>다듬는 중…';
    fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt(state.text) }] }], generationConfig: { temperature: 0.3 } })
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    }).then(function (res) {
      if (res.status !== 200) throw { status: res.status };
      var parts = (((res.body.candidates || [])[0] || {}).content || {}).parts || [];
      var text = parts.map(function (p) { return p.text || ''; }).join('').replace(/^```[a-z]*\s*$/gm, '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();
      if (!text) throw { status: 0, msg: '빈 응답' };
      state.before = state.text; state.text = text + '\n'; state.model = null;
      $('undo').style.display = ''; renderDoc();
      toast('다듬었어요 (' + Math.round((Date.now() - started) / 1000) + '초) · 교재로 꼭 확인하세요');
    }).catch(function (e) {
      var s = e && e.status, msg = {
        400: 'API 키나 요청이 올바르지 않아요. 설정에서 키를 확인하세요.',
        403: '이 키로는 제미나이를 쓸 수 없어요 (삭제됐거나 권한 없음).',
        404: "모델 '" + model + "'을 찾을 수 없어요. 설정에서 모델 이름을 바꿔 보세요.",
        429: '무료 사용량을 다 썼어요. 1분 뒤 다시 시도하세요.'
      }[s] || '제미나이 연결에 실패했어요. 인터넷 연결을 확인하세요.';
      alert(msg);
    }).then(function () { state.busy = false; btn.disabled = false; btn.textContent = '✨ 제미나이로 다듬기'; });
  };
  window.undo = function () { if (state.before) { state.text = state.before; state.before = null; $('undo').style.display = 'none'; renderDoc(); toast('되돌렸어요'); } };

  renderList();
  // 안드로이드 뒤로가기: 결과 → 진단 → 자료
  window.onBack = function () {
    if ($('sheet').classList.contains('open') || $('coverSheet').classList.contains('open')) { closeSheets(); return true; }
    var on = document.querySelector('.page.on').id;
    if (on === 'p-out') { go('p-dx'); return true; }
    if (on === 'p-dx') { go('p-data'); return true; }
    return false;
  };
})();
