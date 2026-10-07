// 플래시카드 학습 화면 (PC 브라우저 · 안드로이드 앱 공용)
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var bridge = window.Android || null;
  var DAY = 86400000, STEPS = [0, 1, 3, 7, 14, 30]; // 상자별 다음 복습까지 (일)

  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  window.go = function (id) { document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('on', v.id === id); }); window.scrollTo(0, 0); if (id === 'v-home') renderDecks(); };
  function bindSeg(id, fn) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) {
      b.addEventListener('click', function () { document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x === b); }); if (fn) fn(b.getAttribute('data-v')); });
    });
  }
  function segVal(id) { return document.querySelector('#' + id + ' .on').getAttribute('data-v'); }
  function setSeg(id, v) { document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === v); }); }

  // ---------- 저장 (IndexedDB · 안 되면 메모리) ----------
  var mem = {}, dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok) {
      try {
        var req = indexedDB.open('flashcards', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('decks', { keyPath: 'id' }); };
        req.onsuccess = function () { ok(req.result); };
        req.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      if (!d) { var r = fn(null); return r && r.result !== undefined ? r.result : r; }
      return new Promise(function (ok, bad) {
        var t = d.transaction('decks', mode), out = fn(t.objectStore('decks'));
        t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = function () { bad(t.error); };
      });
    });
  }
  function allDecks() { return tx('readonly', function (st) { if (!st) return { result: Object.keys(mem).map(function (k) { return mem[k]; }) }; return st.getAll(); }); }
  function getDeck(id) { return tx('readonly', function (st) { if (!st) return { result: mem[id] }; return st.get(id); }); }
  function putDeck(d) { return tx('readwrite', function (st) { if (!st) { mem[d.id] = d; return null; } st.put(d); return null; }); }
  function delDeck(id) { return tx('readwrite', function (st) { if (!st) { delete mem[id]; return null; } st.delete(id); return null; }); }

  // ---------- 목록 ----------
  function stats(d) {
    var now = Date.now(), learned = 0, due = 0;
    d.cards.forEach(function (c) { var p = d.progress[c.id]; if (p && p.box >= 2) learned++; if (!p || p.due <= now) due++; });
    return { learned: learned, due: due, pct: d.cards.length ? Math.round(learned / d.cards.length * 100) : 0 };
  }
  function ring(p) {
    var r = 19, c = 2 * Math.PI * r;
    return '<svg class=ring viewBox="0 0 46 46"><circle cx=23 cy=23 r=' + r + ' fill=none stroke="var(--fill)" stroke-width=5 /><circle cx=23 cy=23 r=' + r + ' fill=none stroke="var(--green)" stroke-width=5 stroke-linecap=round stroke-dasharray="' + (c * p / 100) + ' ' + c + '" transform="rotate(-90 23 23)" /><text x=23 y=27 text-anchor=middle font-size=11 font-weight=700 fill="currentColor">' + p + '%</text></svg>';
  }
  function renderDecks() {
    allDecks().then(function (list) {
      list = (list || []).sort(function (a, b) { return (b.used || b.created) - (a.used || a.created); });
      var box = $('decks');
      if (!list.length) { box.innerHTML = '<div class=empty>아직 카드 묶음이 없어요.<br>위의 ‘파일로 카드 만들기’를 눌러 시작하세요.</div>'; return; }
      box.innerHTML = '';
      list.forEach(function (d) {
        var st = stats(d), row = document.createElement('div'); row.className = 'deck';
        row.innerHTML = ring(st.pct) + '<div class=info><b></b><small>카드 ' + d.cards.length + '장 · 오늘 ' + st.due + '장</small></div><button class=go>학습</button><button class=more aria-label="더 보기">⋯</button>';
        row.querySelector('b').textContent = d.title;
        row.querySelector('.go').onclick = function () { startStudy(d.id, 'due'); };
        row.querySelector('.more').onclick = function () { openMenu(d); };
        box.appendChild(row);
      });
    });
  }

  // ---------- 만들기 ----------
  var picked = null;
  function pick(f) { if (!f) return; picked = f; $('fileLabel').textContent = f.name; $('title').value = f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' '); $('make').disabled = false; }
  $('file').addEventListener('change', function (e) { pick(e.target.files[0]); });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { pick(e.dataTransfer.files[0]); });
  bindSeg('qn');
  $('make').addEventListener('click', async function () {
    if (!picked) return;
    $('make').disabled = true; $('warn').style.display = 'none'; $('progress').style.display = 'block'; $('pbar').style.width = '0'; $('ptext').textContent = '파일 여는 중…';
    try {
      var doc = await Extract.file(picked, function (p, n) { $('pbar').style.width = Math.round(p / n * 100) + '%'; $('ptext').textContent = p + ' / ' + n + '쪽 읽는 중… (형광펜·강조·필기 찾는 중)'; });
      if (doc.textless) throw new Error('이 PDF에는 글자 정보가 없어요(스캔·사진 PDF). 글자를 선택할 수 있는 PDF나 원본 PPT·한글 파일로 올려 주세요.');
      $('ptext').textContent = '카드 만드는 중…';
      var nq = +segVal('qn'), m = Study.build(doc, { questions: nq || 1, title: $('title').value.trim() || doc.title });
      if (!nq) { m.questions = []; m.cards = m.cards.filter(function (c) { return c.type !== '문제'; }); }
      if (!m.cards.length) throw new Error('카드로 만들 강조 내용을 찾지 못했어요. 형광펜·색 글씨가 있는 파일인지 확인해 주세요.');
      var deck = { id: 'd' + Date.now().toString(36), title: m.title, created: Date.now(), cards: m.cards, progress: {}, html: Study.html(m), prompt: Study.prompt(m) };
      await putDeck(deck);
      toast('카드 ' + deck.cards.length + '장을 만들었어요' + (m.lowEmphasis ? ' (강조가 적어 수치 문장 위주)' : ''));
      picked = null; $('fileLabel').textContent = '파일 올리기'; $('title').value = '';
      startStudy(deck.id, 'due');
    } catch (e) { $('warn').textContent = (e && e.message) || String(e); $('warn').style.display = 'block'; }
    $('progress').style.display = 'none'; $('make').disabled = !picked;
  });

  // ---------- 학습 ----------
  var S = null;
  function topicOf(c) { return c.topic || (c.path && c.path[0]) || '기타'; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function buildQueue() {
    var now = Date.now(), d = S.deck;
    var list = d.cards.filter(function (c) { return S.topic === '전체' || topicOf(c) === S.topic; });
    if (S.mode === 'wrong') list = list.filter(function (c) { var p = d.progress[c.id]; return p && p.seen && (p.wrong > 0 || p.box <= 1); });
    else if (S.mode === 'due') list = list.filter(function (c) { var p = d.progress[c.id]; return !p || p.due <= now; })
      .sort(function (a, b) { var pa = d.progress[a.id], pb = d.progress[b.id]; return (pa ? pa.box : -1) - (pb ? pb.box : -1); });
    else list = shuffle(list.slice());
    S.queue = list.slice(); S.total = list.length; S.cleared = 0;
  }
  window.startStudy = function (id, mode) {
    getDeck(id).then(function (d) {
      if (!d) return;
      d.used = Date.now(); putDeck(d);
      S = { deck: d, topic: '전체', mode: mode || 'due', counts: { 1: 0, 2: 0, 3: 0 } };
      setSeg('mode', S.mode);
      var topics = ['전체'];
      d.cards.forEach(function (c) { var t = topicOf(c); if (topics.indexOf(t) < 0) topics.push(t); });
      $('topics').innerHTML = '';
      topics.forEach(function (t) {
        var b = document.createElement('button'); b.className = 'chip' + (t === '전체' ? ' on' : ''); b.textContent = t;
        b.onclick = function () { S.topic = t; document.querySelectorAll('#topics .chip').forEach(function (x) { x.classList.toggle('on', x === b); }); buildQueue(); show(); };
        $('topics').appendChild(b);
      });
      buildQueue(); go('v-study'); show();
    });
  };
  bindSeg('mode', function (v) { if (!S) return; S.mode = v; buildQueue(); show(); });

  function blankHtml(t) { return esc(t).replace('［ ? ］', '<span class=blank>?</span>'); }
  function fullHtml(c) {
    var s = esc(c.back || '');
    if (c.answer && c.type !== '문제') { var a = esc(c.answer), i = s.indexOf(a); if (i >= 0) s = s.slice(0, i) + (c.hl ? '<mark><b>' + a + '</b></mark>' : '<b>' + a + '</b>') + s.slice(i + a.length); }
    return s;
  }
  function show() {
    $('flip').classList.remove('flipped'); S.flipped = false;
    ['b1', 'b2', 'b3'].forEach(function (b) { $(b).disabled = true; });
    $('meter').style.width = (S.total ? Math.round(S.cleared / S.total * 100) : 100) + '%';
    if (!S.queue.length) {
      if (!S.total) {
        $('count').textContent = '0장';
        $('front').innerHTML = '<div class=empty style="margin:auto">' + (S.mode === 'wrong' ? '틀린 카드가 없어요 👍' : S.mode === 'due' ? '오늘 복습할 카드를 다 끝냈어요 🎉<br>‘전체 섞기’로 더 볼 수 있어요.' : '카드가 없어요') + '</div>';
        $('backface').innerHTML = ''; return;
      }
      finish(); return;
    }
    var c = S.queue[0];
    $('count').textContent = Math.min(S.total, S.cleared + 1) + ' / ' + S.total;
    var crumb = (c.path || []).slice(-2).join(' › ') + (c.page ? ' · p.' + c.page : '');
    var f = '<span class=badge>' + esc(c.type) + '</span><div class=crumb>' + esc(crumb) + '</div>';
    if (c.options) {
      var ox = c.options.length === 2 && c.options[0] === 'O';
      f += '<div class="qtext small">' + esc(c.front) + '</div><div class=opts>' + c.options.map(function (o, k) {
        return '<button class="opt' + (c.marks && c.marks[k] ? ' inked' : '') + '" data-k=' + k + '>' + (ox ? '' : '①②③④⑤'.charAt(k) + ' ') + esc(o) + '</button>';
      }).join('') + '</div><p class=hint>' + esc(c.prompt) + '</p>';
    } else if (c.type === '용어') {
      f += '<div class=qtext><span style="color:var(--brand)">' + esc(c.front) + '</span><div class=hint style="margin-top:12px">' + esc(c.prompt) + '</div></div><p class=hint>누르면 정답</p>';
    } else {
      f += '<div class="qtext' + (c.front.length > 70 ? ' small' : '') + '">' + blankHtml(c.front) + '</div><p class=hint>' + esc(c.prompt) + ' · 누르면 정답</p>';
    }
    $('front').innerHTML = f;
    $('backface').innerHTML = '<span class=badge>정답</span><div class=crumb>' + esc(crumb) + '</div>' + (c.answer ? '<div class=ans>' + esc(c.answer) + '</div>' : '') + '<div class=full>' + fullHtml(c) + '</div><p class=hint style="margin-top:auto;padding-top:14px">얼마나 알았나요? 아래에서 골라 주세요</p>';
    $('front').querySelectorAll('.opt').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (c.answerIndex === undefined) { reveal(); return; }
        var k = +b.getAttribute('data-k');
        $('front').querySelectorAll('.opt').forEach(function (x, j) { if (j === c.answerIndex) x.classList.add('right'); else if (j === k) x.classList.add('wrong'); });
        setTimeout(reveal, 650);
      };
    });
  }
  function reveal() { if (!S || S.flipped || !S.queue.length) return; $('flip').classList.add('flipped'); S.flipped = true; ['b1', 'b2', 'b3'].forEach(function (b) { $(b).disabled = false; }); }
  $('stage').addEventListener('click', function () { if (!S) return; if (!S.flipped) reveal(); else { $('flip').classList.toggle('flipped'); } });
  window.rate = function (v) {
    if (!S || !S.flipped || !S.queue.length) return;
    var c = S.queue.shift(), now = Date.now(), p = S.deck.progress[c.id] || { box: 0, wrong: 0 };
    p.seen = now; S.counts[v]++;
    if (v === 1) { p.box = 1; p.wrong = (p.wrong || 0) + 1; p.due = now; S.queue.splice(Math.min(S.queue.length, 3), 0, c); }        // 곧 다시
    else if (v === 2) { p.box = Math.max(1, p.box || 0); p.due = now + 10 * 60000; S.queue.push(c); }                               // 맨 뒤로
    else { p.box = Math.min(5, (p.box || 0) === 0 ? 2 : p.box + 1); p.due = now + STEPS[p.box] * DAY; if (p.wrong && p.box >= 2) p.wrong--; S.cleared++; } // 다음 복습일
    S.deck.progress[c.id] = p;
    putDeck(S.deck);
    show();
  };
  function finish() {
    $('s1').textContent = S.counts[1]; $('s2').textContent = S.counts[2]; $('s3').textContent = S.counts[3];
    var st = stats(S.deck);
    $('doneText').textContent = S.deck.title + ' · 외운 카드 ' + st.learned + ' / ' + S.deck.cards.length + '장 (' + st.pct + '%)';
    go('v-done');
  }
  window.restart = function (mode) { if (S) startStudy(S.deck.id, mode); };
  window.endStudy = function () { S = null; go('v-home'); };

  // 스와이프 (왼쪽 = 모름, 오른쪽 = 알아요) · 키보드
  var sx = null, sy = null;
  $('stage').addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('stage').addEventListener('touchend', function (e) {
    if (sx === null || !S) return;
    var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); if (!S.flipped) reveal(); else rate(dx < 0 ? 1 : 3); }
  });
  document.addEventListener('keydown', function (e) {
    if (!$('v-study').classList.contains('on') || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); reveal(); }
    else if (e.key === '1' || e.key === '2' || e.key === '3') rate(+e.key);
  });

  // ---------- 메뉴 (학습지 저장 · 인쇄 · AI · 삭제) ----------
  var menuDeck = null;
  function openMenu(d) { menuDeck = d; $('menuTitle').textContent = d.title; $('sheetBg').style.display = 'block'; setTimeout(function () { $('sheet').classList.add('open'); }, 10); }
  window.closeMenu = function () { $('sheet').classList.remove('open'); setTimeout(function () { $('sheetBg').style.display = 'none'; }, 250); };
  function fileName(t, ext) { return t.replace(/[\\/:*?"<>|]+/g, ' ') + '_학습지' + ext; }
  async function download(name, mime, content) {
    if (bridge) { toast(bridge.saveFile(name, mime, content)); return; }
    // 파일로 연 페이지에서는 브라우저가 다운로드 이름을 무시하므로 '다른 이름으로 저장' 창을 쓴다 (크롬·엣지)
    if (window.showSaveFilePicker) {
      try {
        var ext = name.slice(name.lastIndexOf('.'));
        var h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Word 문서', accept: { [mime]: [ext] } }] });
        var w = await h.createWritable(); await w.write(new Blob([content], { type: mime })); await w.close(); toast('저장했어요: ' + h.name); return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function legacyCopy(t) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); }
  function copyText(t) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { legacyCopy(t); }); legacyCopy(t); return Promise.resolve(); }
  window.menuAct = function (act) {
    var d = menuDeck; closeMenu(); if (!d) return;
    if (act === 'study') startStudy(d.id, 'due');
    else if (act === 'doc') download(fileName(d.title, '.doc'), 'application/msword', '﻿' + d.html);
    else if (act === 'print') {
      if (bridge) bridge.print(fileName(d.title, ''), d.html, false);
      else { var w = window.open('', '_blank'); w.document.write(d.html); w.document.close(); setTimeout(function () { w.print(); }, 400); }
    } else if (act === 'ai') {
      if (!confirm('정리한 내용이 ChatGPT 앱으로 전송돼요. 개인정보(환자 정보 등)가 없는지 확인해 주세요.\n\n요청문을 복사하고 ChatGPT를 열까요? 붙여넣고 보내면 사례기반 문제를 만들어 줘요.')) return;
      if (bridge && bridge.openAi) bridge.openAi('com.openai.chatgpt', d.prompt, 'https://chatgpt.com/');
      else copyText(d.prompt).then(function () { toast('복사했어요. ChatGPT 입력창에 Ctrl+V로 붙여넣으세요'); window.open('https://chatgpt.com/', '_blank'); });
    } else if (act === 'reset') { if (confirm('‘' + d.title + '’의 학습 진도를 처음부터 다시 시작할까요?')) { d.progress = {}; putDeck(d).then(renderDecks); toast('진도를 초기화했어요'); } }
    else if (act === 'delete') { if (confirm('‘' + d.title + '’ 카드 묶음을 삭제할까요?')) delDeck(d.id).then(function () { renderDecks(); toast('삭제했어요'); }); }
  };

  // ---------- 안드로이드: 공유받은 파일, 뒤로 가기 ----------
  window.onShared = function () {
    if (!bridge || !bridge.sharedInfo) return;
    var info = bridge.sharedInfo(); if (!info) return;
    var cut = info.lastIndexOf('|'), name = info.slice(0, cut), size = +info.slice(cut + 1), parts = [], step = 3 * 512 * 1024;
    for (var off = 0; off < size; off += step) { var b = atob(bridge.sharedChunk(off, step)), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); parts.push(u); }
    bridge.sharedDone();
    go('v-make'); pick(new File(parts, name));
    toast('공유받은 파일: ' + name + ' · ‘카드 만들기’를 누르세요');
  };
  window.onBack = function () {
    if ($('sheet').classList.contains('open')) { closeMenu(); return true; }
    if (!$('v-home').classList.contains('on')) { S = null; go('v-home'); return true; }
    return false;
  };
  renderDecks();
  if (bridge) setTimeout(window.onShared, 300);
})();
