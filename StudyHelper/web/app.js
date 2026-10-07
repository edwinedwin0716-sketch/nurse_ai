// 학습 정리 도우미 화면 (PC 브라우저 · 안드로이드 앱 공용)
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var bridge = window.Android || null;
  var state = { file: null, model: null, html: '' };

  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  document.querySelectorAll('#qn button').forEach(function (b) {
    b.addEventListener('click', function () { document.querySelectorAll('#qn button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
  });
  function questionCount() { return +document.querySelector('#qn .on').getAttribute('data-v'); }

  function pick(f) {
    if (!f) return;
    state.file = f;
    $('fileLabel').textContent = f.name;
    if (!$('title').value) $('title').value = f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
    $('go').disabled = false;
  }
  $('file').addEventListener('change', function (e) { pick(e.target.files[0]); });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { pick(e.dataTransfer.files[0]); });

  // 안드로이드: 다른 앱에서 '공유'로 받은 파일 읽기
  window.onShared = function () {
    if (!bridge || !bridge.sharedInfo) return;
    var info = bridge.sharedInfo(); if (!info) return;
    var cut = info.lastIndexOf('|'), name = info.slice(0, cut), size = +info.slice(cut + 1), parts = [], step = 3 * 512 * 1024;
    for (var off = 0; off < size; off += step) {
      var b = atob(bridge.sharedChunk(off, step)), u = new Uint8Array(b.length);
      for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      parts.push(u);
    }
    bridge.sharedDone();
    var f = new File(parts, name); $('title').value = ''; pick(f);
    toast('공유받은 파일: ' + name + ' · ‘정리 시작’을 누르세요');
  };
  function progress(p, n) {
    $('bar').style.width = Math.round(p / n * 100) + '%';
    $('ptext').textContent = p + ' / ' + n + '쪽 읽는 중… (형광펜·강조·필기 찾는 중)';
  }
  $('go').addEventListener('click', async function () {
    if (!state.file) return;
    $('go').disabled = true; $('warn').style.display = 'none'; $('result').style.display = 'none';
    $('progress').style.display = 'block'; $('bar').style.width = '0'; $('ptext').textContent = '파일 여는 중…';
    try {
      var doc = await Extract.file(state.file, progress);
      if (doc.textless) throw new Error('이 PDF에는 글자 정보가 없어요(스캔·사진 PDF). 글자를 선택할 수 있는 PDF나 원본 PPT·한글 파일로 올려 주세요.');
      $('ptext').textContent = '요점정리와 문제 만드는 중…';
      var m = Study.build(doc, { questions: questionCount(), title: $('title').value.trim() || doc.title });
      state.model = m; state.html = Study.html(m);
      var hl = 0, em = 0, ink = 0;
      doc.units.forEach(function (u) { if (u.type !== 'para') return; var prev = ''; u.flags.forEach(function (f) { var k = f && f.hl ? 'h' : f && (f.col || f.bold) ? 'e' : ''; if (k && k !== prev) { if (k === 'h') hl++; else em++; } prev = k; }); if (u.ink) ink++; });
      $('chips').innerHTML = '<span class=chip>형광펜 <b>' + hl + '</b>곳</span><span class=chip>강조 글씨 <b>' + em + '</b>곳</span><span class=chip>필기 <b>' + ink + '</b>곳</span><span class=chip>요점 <b>' + m.outline.filter(function (o) { return o.kind === 'points'; }).reduce(function (a, o) { return a + o.items.length; }, 0) + '</b>문장</span><span class=chip>문제 <b>' + m.questions.length + '</b>개</span>' + (m.marked.length ? '<span class=chip>표시한 문항 <b>' + m.marked.length + '</b>개</span>' : '');
      $('frame').srcdoc = state.html;
      $('result').style.display = 'block';
      if (m.lowEmphasis) { $('warn').textContent = '형광펜이나 강조 표시를 거의 찾지 못해서, 수치가 들어간 문장 위주로 정리했어요.'; $('warn').style.display = 'block'; }
      $('result').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      $('warn').textContent = (e && e.message) || String(e); $('warn').style.display = 'block';
    }
    $('progress').style.display = 'none'; $('go').disabled = false;
  });

  function fileName(ext) { return ($('title').value.trim() || '학습정리').replace(/[\\/:*?"<>|]+/g, ' ') + '_요점정리' + ext; }
  async function download(name, mime, content) {
    if (bridge) { toast(bridge.saveFile(name, mime, content)); return; }
    // 파일로 연 페이지에서는 브라우저가 다운로드 이름을 무시하므로 '다른 이름으로 저장' 창을 쓴다 (크롬·엣지)
    if (window.showSaveFilePicker) {
      try {
        var ext = name.slice(name.lastIndexOf('.'));
        var h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext === '.doc' ? 'Word 문서' : '웹 페이지', accept: { [mime]: [ext] } }] });
        var w = await h.createWritable(); await w.write(new Blob([content], { type: mime })); await w.close();
        toast('저장했어요: ' + h.name); return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast('저장했어요: ' + name);
  }
  window.saveDoc = function () { if (state.html) download(fileName('.doc'), 'application/msword', '﻿' + state.html); };
  window.saveHtml = function () { if (state.html) download(fileName('.html'), 'text/html', '﻿' + state.html); };
  window.printDoc = function () {
    if (!state.html) return;
    if (bridge) { bridge.print(fileName(''), state.html, false); return; }
    $('frame').contentWindow.focus(); $('frame').contentWindow.print();
  };

  // ChatGPT·Claude 앱으로 보내기 (구독 그대로, API 키 필요 없음)
  var AI = { chatgpt: { name: 'ChatGPT', pkg: 'com.openai.chatgpt', web: 'https://chatgpt.com/' }, claude: { name: 'Claude', pkg: 'com.anthropic.claude', web: 'https://claude.ai/new' } };
  window.sendAi = function (which) {
    if (!state.model) return;
    var ai = AI[which], text = Study.prompt(state.model);
    if (!confirm('정리한 내용이 ' + ai.name + ' 앱으로 전송돼요. 개인정보(환자 정보 등)가 없는지 확인해 주세요.\n\n요청문을 복사하고 ' + ai.name + '을 열까요? 입력창에 붙여넣고 보내면 사례기반 문제와 정답표를 만들어 줘요.')) return;
    if (bridge && bridge.openAi) { bridge.openAi(ai.pkg, text, ai.web); return; }
    var done = function () { toast('복사했어요. ' + ai.name + ' 입력창에 Ctrl+V로 붙여넣으세요'); window.open(ai.web, '_blank'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  };
  function fallbackCopy(t) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); }
  if (bridge) setTimeout(window.onShared, 300);
})();
