// 간호 공부방: 개념·술기 읽기 + 문제로 점검. 내용은 content/*.json → build.py → window.TOPICS
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var TOPICS = (window.TOPICS || []).slice();
  var BY = {}; TOPICS.forEach(function (t) { BY[t.id] = t; });
  // 과목마다 은은한 네온 색 (목록 왼쪽 줄 · 아이콘 테두리 · 요약 카드)
  var SUBJECTS = [['기본간호학', '🩺', '#4de1ff'], ['기본간호술기', '🧤', '#4dffb0'], ['성인간호학', '🫀', '#ff5c8a'], ['아동간호학', '🧸', '#ffd24d'], ['모성간호학', '🤰', '#ff7ad9'], ['정신간호학', '🧠', '#a98bff'], ['지역사회간호학', '🏘️', '#8cff5a'], ['간호관리학', '📋', '#ff9f4d']];
  var EMOJI = {}, COLOR = {}; SUBJECTS.forEach(function (s) { EMOJI[s[0]] = s[1]; COLOR[s[0]] = s[2]; });
  var ISSUE = 'https://github.com/edwinedwin0716-sketch/nurse_ai/issues/new';

  // ---------- 저장 ----------
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem('ns_' + k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem('ns_' + k, JSON.stringify(v)); } catch (e) { } }
  var stars = load('star', []), wrong = load('wrong', {}), recent = load('recent', []), seen = load('seen', {});

  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2200); }
  function qid(t, i) { return t.id + '#' + i; }
  function allQ() { var a = []; TOPICS.forEach(function (t) { (t.quiz || []).forEach(function (q, i) { a.push({ t: t, i: i, q: q }); }); }); return a; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function issueUrl(title, body) { return ISSUE + '?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body); }

  // ---------- 화면 이동 ----------
  var stack = [];
  window.go = function (id, mode) {   // mode: true = 뒤로 가기 기록에 넣기, 'back' = 뒤로 가는 중, 없음 = 처음부터
    var cur = document.querySelector('.view.on');
    if (mode === true) { if (cur && cur.id !== id) stack.push(cur.id); } else if (mode !== 'back') stack = [];
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('on', v.id === id); });
    window.scrollTo(0, 0);
    if (id === 'v-home') renderHome();
  };
  window.back = function () { var p = stack.pop(); if (p) go(p, 'back'); else go('v-home'); return true; };
  // 안드로이드 뒤로 가기
  window.onBack = function () { if ($('v-home').classList.contains('on')) return false; if ($('v-quiz').classList.contains('on')) { quitQuiz(); return true; } if ($('v-emr').classList.contains('on')) { leaveEmr(); return true; } back(); return true; };

  function bindSeg(id, fn) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) {
      b.addEventListener('click', function () { document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x === b); }); if (fn) fn(b.getAttribute('data-v')); });
    });
  }
  function segVal(id) { return document.querySelector('#' + id + ' .on').getAttribute('data-v'); }
  function setSeg(id, v) { document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === v); }); }

  // ---------- 홈 ----------
  function topicRow(t) {
    var n = (t.quiz || []).length;
    return '<button class="row" style="--c:' + (COLOR[t.subject] || '#5ab8ff') + '" data-id="' + esc(t.id) + '"><span class="em">' + (EMOJI[t.subject] || '📘') + '</span><span class="info"><b>' + esc(t.title) + '</b><small>' +
      esc(t.subject) + (n ? ' · 문제 ' + n : '') + (t.en ? ' · ' + esc(t.en) : '') + '</small></span>' +
      '<span class="pill ' + (t.kind === '술기' ? 'skill' : 'concept') + '">' + esc(t.kind) + '</span>' + (seen[t.id] ? '<span class="pill done">읽음</span>' : '') + '<span class="chev">›</span></button>';
  }
  function bindRows(box) { box.querySelectorAll('.row[data-id]').forEach(function (r) { r.onclick = function () { openTopic(r.getAttribute('data-id')); }; }); }

  function renderHome() {
    var qs = allQ().length, w = Object.keys(wrong).filter(function (k) { return BY[k.split('#')[0]]; }).length;
    $('qCount').textContent = '문제 ' + qs + '개'; $('wCount').textContent = w ? w + '문제 다시 풀기' : '아직 없어요';
    $('sCount').textContent = stars.length ? stars.length + '개 주제' : '☆를 눌러 모아요'; $('tCount').textContent = TOPICS.length + '개 주제';
    var rec = recent.filter(function (id) { return BY[id]; }).slice(0, 3);
    $('recentBox').innerHTML = rec.length ? '<div class="section">최근 본 주제</div><div class="card">' + rec.map(function (id) { return topicRow(BY[id]); }).join('') + '</div>' : '';
    bindRows($('recentBox'));
    var h = '';
    SUBJECTS.forEach(function (s) {
      var list = TOPICS.filter(function (t) { return t.subject === s[0]; });
      if (!list.length) return;
      var c = list.filter(function (t) { return t.kind === '개념'; }).length;
      h += '<button class="row" style="--c:' + s[2] + '" data-s="' + esc(s[0]) + '"><span class="em">' + s[1] + '</span><span class="info"><b>' + esc(s[0]) + '</b><small>' +
        (c ? '개념 ' + c : '') + (c && list.length - c ? ' · ' : '') + (list.length - c ? '술기 ' + (list.length - c) : '') + '</small></span><span class="chev">›</span></button>';
    });
    $('subjects').innerHTML = h || '<div class="empty">아직 내용이 없어요</div>';
    $('subjects').querySelectorAll('.row').forEach(function (r) { r.onclick = function () { openList(r.getAttribute('data-s')); }; });
  }

  // 찾기: 제목·영문·태그·설명 전체
  function hay(t) {
    return [t.title, t.en, t.subject, (t.tags || []).join(' '), t.summary, (t.sections || []).map(function (s) { return s.h + ' ' + (s.text || '') + ' ' + (s.items || []).join(' '); }).join(' '),
      (t.steps || []).map(function (s) { return s.do; }).join(' '), (t.nursing || []).join(' ')].join(' ').toLowerCase();
  }
  $('q').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase();
    $('homeMain').style.display = q ? 'none' : '';
    if (!q) { $('results').innerHTML = ''; return; }
    var words = q.split(/\s+/);
    var hits = TOPICS.map(function (t) {
      var title = (t.title + ' ' + t.en + ' ' + (t.tags || []).join(' ')).toLowerCase(), all = hay(t), score = 0;
      for (var i = 0; i < words.length; i++) { if (title.indexOf(words[i]) >= 0) score += 3; else if (all.indexOf(words[i]) >= 0) score += 1; else return null; }
      return { t: t, s: score };
    }).filter(Boolean).sort(function (a, b) { return b.s - a.s; });
    $('results').innerHTML = '<div class="section">찾은 주제 ' + hits.length + '개</div><div class="card">' + (hits.length ? hits.map(function (h) { return topicRow(h.t); }).join('') :
      '<div class="empty">아직 없는 내용이에요.<br><a target="_blank" rel="noopener" href="' + esc(issueUrl('[간호 공부방] 추가 요청: ' + this.value.trim(), '이 내용을 넣어 주세요: ' + this.value.trim())) + '">이 내용 넣어 달라고 요청하기</a></div>') + '</div>';
    bindRows($('results'));
  });

  // ---------- 목록 ----------
  var listSubj = '';
  window.openList = function (s) { listSubj = s; setSeg('kind', ''); renderList(); go('v-list', true); };
  function renderList() {
    var k = segVal('kind');
    $('listTitle').textContent = listSubj === '★' ? '⭐ 즐겨찾기' : listSubj ? (EMOJI[listSubj] || '') + ' ' + listSubj : '📚 전체 주제';
    var list = TOPICS.filter(function (t) { return (listSubj === '★' ? stars.indexOf(t.id) >= 0 : !listSubj || t.subject === listSubj) && (!k || t.kind === k); });
    $('list').innerHTML = list.length ? list.map(topicRow).join('') : '<div class="empty">' + (listSubj === '★' ? '주제 화면 오른쪽 위 ☆를 누르면 여기에 모여요' : '해당하는 주제가 없어요') + '</div>';
    bindRows($('list'));
  }
  bindSeg('kind', renderList);

  // ---------- 주제 ----------
  var cur = null, hideKey = false;
  window.openTopic = function (id) {
    cur = BY[id]; if (!cur) return;
    seen[id] = Date.now(); save('seen', seen);
    recent = [id].concat(recent.filter(function (x) { return x !== id; })).slice(0, 10); save('recent', recent);
    $('v-topic').style.setProperty('--c', COLOR[cur.subject] || '#5ab8ff');
    $('tTitle').textContent = cur.title; $('tEn').textContent = cur.en || '';
    $('tTags').innerHTML = '<span class="pill ' + (cur.kind === '술기' ? 'skill' : 'concept') + '">' + esc(cur.kind) + '</span><span class="tag">' + esc(cur.subject) + '</span>' + (cur.tags || []).map(function (x) { return '<span class="tag">#' + esc(x) + '</span>'; }).join('');
    $('tSummary').textContent = cur.summary || '';
    var hasSteps = (cur.steps || []).length > 0;
    document.querySelector('#ttab [data-v="steps"]').style.display = hasSteps ? '' : 'none';
    document.querySelector('#ttab [data-v="quiz"]').textContent = '문제 ' + (cur.quiz || []).length;
    setSeg('ttab', 'learn'); hideKey = false; renderTopic();
    $('star').textContent = stars.indexOf(id) >= 0 ? '★' : '☆'; $('star').classList.toggle('on', stars.indexOf(id) >= 0);
    $('tReport').href = issueUrl('[간호 공부방] ' + cur.title + ' 내용 수정·추가', '주제: ' + cur.title + ' (' + cur.id + ')\n\n어디가 틀렸나요? / 무엇을 더 넣을까요?\n\n근거(교재 이름·쪽수): ');
    go('v-topic', true);
  };
  window.toggleStar = function () {
    var i = stars.indexOf(cur.id);
    if (i >= 0) stars.splice(i, 1); else stars.unshift(cur.id);
    save('star', stars); $('star').textContent = i >= 0 ? '☆' : '★'; $('star').classList.toggle('on', i < 0);
    toast(i >= 0 ? '즐겨찾기에서 뺐어요' : '즐겨찾기에 넣었어요');
  };
  function list(items) { return '<ul>' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
  function renderTopic() {
    var tab = segVal('ttab'), t = cur, h = '';
    if (tab === 'learn') {
      if ((t.numbers || []).length) h += '<div class="block"><h3>📌 꼭 외울 값</h3><div class="nums">' + t.numbers.map(function (n) { return '<div>' + esc(n.label) + '</div><div>' + esc(n.value) + '</div>'; }).join('') + '</div></div>';
      (t.sections || []).forEach(function (s) { h += '<div class="block"><h3>' + esc(s.h) + '</h3>' + (s.text ? '<p>' + esc(s.text) + '</p>' : '') + (s.items ? list(s.items) : '') + '</div>'; });
      if ((t.nursing || []).length) h += '<div class="block"><h3>🩺 간호중재</h3>' + list(t.nursing) + '</div>';
      if ((t.steps || []).length) h += '<button class="big ghost" onclick="showTab(\'steps\')">🧤 술기 순서 보기 (' + t.steps.length + '단계)</button>';
      if ((t.cautions || []).length) h += '<div class="block warn"><h3>⚠️ 주의할 점</h3>' + list(t.cautions) + '</div>';
      if ((t.videos || []).length) h += '<div class="block"><h3>🎬 관련 영상 찾아보기</h3>' + t.videos.map(function (v) {
        return '<a class="vid" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=' + encodeURIComponent(v.query) + '"><span class="yt">▶</span><span>' + esc(v.label) + '<small>유튜브에서 "' + esc(v.query) + '" 검색</small></span></a>';
      }).join('') + '</div>';
      if ((t.quiz || []).length) h += '<button class="big" onclick="startTopicQuiz()">📝 이 주제 문제 풀기 (' + t.quiz.length + ')</button>';
    } else if (tab === 'steps') {
      h += '<div class="block"><div class="legend"><span class="dot"></span> 주황 번호 = 핵심 단계 (실습 평가에서 특히 중요)</div>' +
        '<button class="big ghost" style="margin-top:10px" onclick="toggleHide()">' + (hideKey ? '🙈 가린 단계 모두 보기' : '✍️ 핵심 단계 가리고 외워 보기') + '</button></div>';
      h += '<div class="block"><ol class="steps">' + t.steps.map(function (s) {
        return '<li class="' + (s.key ? 'key' : '') + '">' + (hideKey && s.key ? '<button class="do hidden" data-t="' + esc(s.do) + '">❓ 무엇을 할까요? 눌러서 확인</button>' : '<span class="do">' + esc(s.do) + '</span>') + (s.why ? '<span class="why">→ ' + esc(s.why) + '</span>' : '') + '</li>';
      }).join('') + '</ol></div>';
      if ((t.cautions || []).length) h += '<div class="block warn"><h3>⚠️ 주의할 점</h3>' + list(t.cautions) + '</div>';
    } else {
      h += '<div class="block"><p>' + (t.quiz || []).length + '문제 · 국가고시 형식 5지선다예요. 틀린 문제는 오답 노트에 모여요.</p></div><button class="big" onclick="startTopicQuiz()">시작하기</button>';
    }
    $('tBody').innerHTML = h;
    $('tBody').querySelectorAll('.do.hidden').forEach(function (d) { d.onclick = function () { var x = document.createElement('span'); x.className = 'do shown'; x.textContent = d.getAttribute('data-t'); d.parentNode.replaceChild(x, d); }; });
  }
  bindSeg('ttab', renderTopic);
  window.showTab = function (v) { setSeg('ttab', v); renderTopic(); window.scrollTo(0, $('ttab').offsetTop - 10); };
  window.toggleHide = function () { hideKey = !hideKey; renderTopic(); };

  // ---------- 문제 ----------
  var Q = null;  // {items, pos, right, wrongs, picked}
  function startQuiz(items, title) {
    if (!items.length) { toast('풀 문제가 없어요'); return; }
    Q = { items: items, pos: 0, right: 0, wrongs: [], title: title };
    go('v-quiz', true); showQ();
  }
  function showQ() {
    var it = Q.items[Q.pos], q = it.q;
    $('qPos').textContent = (Q.pos + 1) + ' / ' + Q.items.length; $('qRight').textContent = '맞힘 ' + Q.right;
    $('qMeter').style.width = (Q.pos / Q.items.length * 100) + '%';
    $('qTopic').textContent = it.t.subject + ' · ' + it.t.title;
    $('qText').textContent = q.q;
    $('qOpts').innerHTML = q.options.map(function (o, i) { return '<button class="opt" data-i="' + i + '"><span class="n">' + '①②③④⑤⑥'.charAt(i) + '</span><span>' + esc(o) + '</span></button>'; }).join('');
    $('qExplain').className = 'explain'; $('qNext').style.display = 'none';
    $('qOpts').querySelectorAll('.opt').forEach(function (b) { b.onclick = function () { pick(+b.getAttribute('data-i')); }; });
  }
  function pick(i) {
    var it = Q.items[Q.pos], q = it.q, ok = i === q.answer, k = qid(it.t, it.i);
    $('qOpts').querySelectorAll('.opt').forEach(function (b, j) { b.disabled = true; if (j === q.answer) b.classList.add('right'); else if (j === i) b.classList.add('wrong'); });
    if (ok) { Q.right++; delete wrong[k]; } else { Q.wrongs.push(it); wrong[k] = Date.now(); }
    save('wrong', wrong);
    $('qExplain').innerHTML = (ok ? '<b class="ok">⭕ 정답이에요</b>' : '<b class="no">❌ 정답은 ' + '①②③④⑤⑥'.charAt(q.answer) + '</b>') + '<p style="margin:6px 0 0">' + esc(q.explain || '') + '</p>' +
      '<p style="margin:8px 0 0"><a href="#" onclick="openTopic(\'' + it.t.id + '\');return false">📖 ' + esc(it.t.title) + ' 다시 읽기</a></p>';
    $('qExplain').className = 'explain on'; $('qRight').textContent = '맞힘 ' + Q.right;
    $('qNext').textContent = Q.pos + 1 < Q.items.length ? '다음 문제' : '결과 보기'; $('qNext').style.display = 'block';
    $('qNext').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  window.nextQ = function () { if (++Q.pos < Q.items.length) { showQ(); window.scrollTo(0, 0); } else done(); };
  function done() {
    var n = Q.items.length, pct = Math.round(Q.right / n * 100);
    $('dScore').innerHTML = pct + '점<small>' + n + '문제 중 ' + Q.right + '문제 맞힘' + (pct >= 80 ? ' 🎉' : pct >= 60 ? ' 👍' : ' · 다시 읽고 도전해요') + '</small>';
    var tops = {}; Q.wrongs.forEach(function (w) { tops[w.t.id] = (tops[w.t.id] || 0) + 1; });
    var ids = Object.keys(tops);
    $('dList').innerHTML = ids.length ? '<div class="section">다시 읽어 보면 좋은 주제</div><div class="card">' + ids.map(function (id) { return topicRow(BY[id]); }).join('') + '</div>' : '';
    bindRows($('dList'));
    $('dRetry').style.display = Q.wrongs.length ? 'block' : 'none';
    go('v-done');
  }
  window.quitQuiz = function () { if (Q && Q.pos > 0 && !confirm('그만할까요? 지금까지 푼 결과는 오답 노트에 남아요.')) return; back(); };
  window.retryWrong = function () { startQuiz(shuffle(Q.wrongs.slice()), '틀린 문제'); };
  window.startTopicQuiz = function () { startQuiz(shuffle((cur.quiz || []).map(function (q, i) { return { t: cur, i: i, q: q }; })), cur.title); };
  window.startWrong = function () {
    var items = allQ().filter(function (x) { return wrong[qid(x.t, x.i)]; });
    if (!items.length) { toast('틀린 문제가 아직 없어요. 문제를 풀어 보세요!'); return; }
    startQuiz(shuffle(items), '오답 노트');
  };
  var setupSel = {};
  window.openQuizSetup = function () {
    var subs = SUBJECTS.filter(function (s) { return TOPICS.some(function (t) { return t.subject === s[0] && (t.quiz || []).length; }); });
    if (!Object.keys(setupSel).length) subs.forEach(function (s) { setupSel[s[0]] = true; });
    $('setupSubj').innerHTML = subs.map(function (s) { return '<button class="chip' + (setupSel[s[0]] ? ' on' : '') + '" style="--c:' + s[2] + '" data-s="' + esc(s[0]) + '">' + s[1] + ' ' + esc(s[0]) + '</button>'; }).join('');
    $('setupSubj').querySelectorAll('.chip').forEach(function (c) { c.onclick = function () { var s = c.getAttribute('data-s'); setupSel[s] = !setupSel[s]; c.classList.toggle('on', setupSel[s]); }; });
    go('v-setup', true);
  };
  bindSeg('setupN');
  window.startFromSetup = function () {
    var n = +segVal('setupN'), items = shuffle(allQ().filter(function (x) { return setupSel[x.t.subject]; }));
    if (!items.length) { toast('과목을 하나 이상 골라 주세요'); return; }
    startQuiz(n ? items.slice(0, n) : items, '문제 풀기');
  };

  $('askAdd').href = issueUrl('[간호 공부방] 추가 요청: ', '넣어 주면 좋겠는 내용 (과목 · 주제):\n\n틀린 내용이면 어디인지와 근거(교재 이름·쪽수):\n');
  window.NS = { esc: esc, toast: toast, BY: BY, COLOR: COLOR, EMOJI: EMOJI, topicRow: topicRow, bindRows: bindRows, load: load, save: save };
  renderHome();
})();
