// 가상 EMR 실습: 가상 환자의 V/S·처방·검사·기록지·간호기록을 시간 순서(stage)대로 보여 주고, 중간중간 판단 질문을 한다.
// 환자 말(talk)은 기기 음성(TTS)으로 읽고 자막으로 보여 준다. 내용은 content/cases/*.json → build.py → window.CASES
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var NS = window.NS, esc = NS.esc, CASES = window.CASES || [], BYC = {};
  CASES.forEach(function (c) { BYC[c.id] = c; });

  // ---------- 시간 ----------
  function mins(t) { var m = /^D(-?\d+) (\d\d):(\d\d)$/.exec(t || ''); return m ? (+m[1]) * 1440 + (+m[2]) * 60 + (+m[3]) : 0; }
  function dayName(d) { return d === 0 ? '당일' : d < 0 ? (-d) + '일 전' : d + '일 후'; }
  function label(t) { var m = /^D(-?\d+) (\d\d:\d\d)$/.exec(t || ''); return m ? 'D' + m[1] + '(' + dayName(+m[1]) + ') ' + m[2] : t; }
  function short(t) { var m = /^D(-?\d+) (\d\d:\d\d)$/.exec(t || ''); return m ? 'D' + m[1] + ' ' + m[2] : t; }
  function byTime(a, b) { return mins(a.time) - mins(b.time); }

  // ---------- 그림 환자 ----------
  function avatar(p, who) {
    var female = /여/.test(p.sex || ''), old = (p.age || 0) >= 60, kid = (p.age || 0) < 13;
    var hair = old ? '#c9ccd8' : '#2b2338', skin = '#f2c9a8';
    var hairShape = female ? '<path d="M14 34 Q14 10 32 10 Q50 10 50 34 L50 46 Q46 30 32 28 Q18 30 14 46 Z" fill="' + hair + '"/>' :
      '<path d="M16 30 Q16 11 32 11 Q48 11 48 30 Q44 20 32 20 Q20 20 16 30 Z" fill="' + hair + '"/>';
    if (who === '의사') { skin = '#efc39f'; hair = '#3a2f2a'; }
    var s = kid ? 0.9 : 1;
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="none"/>' +
      '<path d="M10 64 Q12 48 32 47 Q52 48 54 64 Z" fill="' + (who === '의사' ? '#e8eefc' : '#4f7bd9') + '"/>' +
      '<path d="M24 50 L32 58 L40 50" fill="none" stroke="' + (who === '의사' ? '#7aa7ff' : '#9fc0ff') + '" stroke-width="2"/>' +
      '<g transform="translate(32 30) scale(' + s + ') translate(-32 -30)"><circle cx="32" cy="30" r="16" fill="' + skin + '"/>' + hairShape +
      (old ? '<path d="M22 36 q3 2 6 0 M36 36 q3 2 6 0" stroke="#d9a789" stroke-width="1" fill="none"/>' : '') +
      '<circle cx="26" cy="31" r="1.8" fill="#2a2030"/><circle cx="38" cy="31" r="1.8" fill="#2a2030"/>' +
      '<ellipse class="mouth" cx="32" cy="39" rx="3.6" ry="1.8" fill="#b4505c" style="transform-box:fill-box;transform-origin:center"/></g></svg>';
  }

  // ---------- 소리 (TTS) + 자막 ----------
  var sound = NS.load('sound', true), speakTimer = null, speakId = 0;
  function voiceFor(who, p) {
    var female = /여/.test(p.sex || ''), old = (p.age || 0) >= 60;
    if (who === '환자') return { pitch: female ? 1.15 : 0.78, rate: old ? 0.86 : 0.98 };
    if (who === '보호자') return { pitch: female ? 0.85 : 1.15, rate: 0.98 };
    if (who === '의사') return { pitch: 0.9, rate: 1.02 };
    return { pitch: 1.2, rate: 1.02 };
  }
  function koVoice() {
    if (!window.speechSynthesis) return null;
    var vs = speechSynthesis.getVoices().filter(function (v) { return /^ko/i.test(v.lang); });
    return vs[0] || null;
  }
  function stopSpeak() {
    speakId++; clearTimeout(speakTimer);
    try { if (window.Android && Android.stopSpeak) Android.stopSpeak(); else if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { }
    document.querySelectorAll('.bub.speaking').forEach(function (b) { b.classList.remove('speaking'); });
    var av = $('ptAv'); if (av) av.classList.remove('talking');
  }
  function speakLines(lines, p) {
    stopSpeak();
    if (!sound || !lines.length) return;
    var id = speakId, i = 0, bubs = document.querySelectorAll('#emrStage .bub');
    function mark(k, on) { if (bubs[k]) bubs[k].classList.toggle('speaking', on); if (lines[k] && lines[k].who === '환자') $('ptAv').classList.toggle('talking', on); }
    function next() {
      if (id !== speakId || i >= lines.length) return;
      var L = lines[i], v = voiceFor(L.who, p), k = i++;
      mark(k, true);
      var done = function () { if (id !== speakId) return; mark(k, false); speakTimer = setTimeout(next, 350); };
      if (window.Android && Android.speak) {           // 안드로이드 앱: 기기 음성 엔진
        Android.speak(L.text, v.pitch, v.rate);
        speakTimer = setTimeout(done, 600 + L.text.length * 150 / v.rate);
      } else if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
        var u = new SpeechSynthesisUtterance(L.text); u.lang = 'ko-KR'; u.pitch = v.pitch; u.rate = v.rate;
        var kv = koVoice(); if (kv) u.voice = kv;
        u.onend = done; u.onerror = done; speechSynthesis.speak(u);
      } else { speakTimer = setTimeout(done, 600 + L.text.length * 120); }
    }
    next();
  }
  if (window.speechSynthesis) try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () { }; } catch (e) { }
  window.toggleSound = function () {
    sound = !sound; NS.save('sound', sound); paintSound();
    if (!sound) stopSpeak(); else replay();
  };
  function paintSound() { $('sndBtn').textContent = sound ? '🔊 소리 켜짐' : '🔇 자막만'; $('sndBtn').classList.toggle('on', sound); }

  // ---------- 목록 ----------
  window.openCases = function () {
    stopSpeak();
    var done = NS.load('cases_done', {});
    $('caseList').innerHTML = CASES.length ? CASES.map(function (c) {
      var p = c.patient || {};
      return '<button class="ccard" data-c="' + esc(c.id) + '"><span class="av">' + avatar(p, '환자') + '</span><span class="info"><b>' + esc(c.title) + '</b>' +
        '<small>' + esc(p.sex || '') + ' ' + esc(p.age || '') + '세 · ' + esc(p.dx || '') + '</small><small>' + esc(c.subject || '') + ' · ' + esc(c.level || '') + ' · 장면 ' + c.stages.length + '개' +
        (done[c.id] != null ? ' · ✅ ' + done[c.id] + '점' : '') + '</small></span><span class="chev">›</span></button>';
    }).join('') : '<div class="empty">아직 사례가 없어요</div>';
    $('caseList').querySelectorAll('.ccard').forEach(function (b) { b.onclick = function () { openCase(b.getAttribute('data-c')); }; });
    if ($('v-cases').classList.contains('on')) return;
    if (!$('v-home').classList.contains('on')) go('v-home');   // 뒤로 가기 = 처음 화면
    go('v-cases', true);
  };
  if ($('cCount') && CASES.length) $('cCount').textContent = '가상 환자 ' + CASES.length + '명 · V/S·처방·기록을 시간 순서로 보며 판단해요';

  // ---------- 환자 화면 ----------
  var C = null, si = 0, tab = 'sum', answers = {};
  function openCase(id) {
    C = BYC[id]; if (!C) return;
    ['vitals', 'orders', 'labs', 'docs', 'notes', 'io'].forEach(function (k) { (C[k] = C[k] || []).sort(byTime); });
    si = 0; tab = 'sum'; answers = {};
    var p = C.patient;
    $('ptAv').innerHTML = avatar(p, '환자');
    $('ptInfo').innerHTML = '<b>' + esc(p.name) + '</b> · ' + esc(p.sex) + '/' + esc(p.age) + '세 · ' + esc(p.ward || '') + ' ' + esc(p.room || '') +
      '<br>' + esc(p.dx || '') + (p.op ? ' · ' + esc(p.op) : '') + (p.height ? ' · ' + esc(p.height) + 'cm/' + esc(p.weight) + 'kg' : '') +
      '<br><span class="allergy">⚠ 알레르기: ' + esc(p.allergy || '없음') + '</span>';
    paintSound(); go('v-emr', true); renderEmr(true);
  }
  window.leaveEmr = function () { stopSpeak(); openCases(); };
  function now() { return mins(C.stages[si].time); }
  function prevT() { return si ? mins(C.stages[si - 1].time) : -1e9; }
  function upto(list) { var n = now(); return list.filter(function (x) { return mins(x.time) <= n; }); }
  function isNew(x) { return si > 0 && mins(x.time) > prevT(); }

  function renderEmr(speak) {
    var st = C.stages[si];
    $('emrNow').textContent = '🕒 ' + label(st.time);
    $('emrDots').innerHTML = C.stages.map(function (_, k) { return '<i class="' + (k <= si ? 'on' : '') + '"></i>'; }).join('');
    var talk = st.talk || [];
    $('emrStage').innerHTML = '<h3>' + (si + 1) + '. ' + esc(st.title) + '</h3><p>' + esc(st.brief || '') + '</p>' +
      (talk.length ? '<div class="talk">' + talk.map(function (L) {
        return '<div class="bub' + (L.who === '환자' ? ' patient' : '') + '"><span class="who">' + ({ 환자: '🛏️', 보호자: '🧑', 의사: '🧑‍⚕️', 간호사: '👩‍⚕️' }[L.who] || '💬') + '<br>' + esc(L.who) + '</span><span class="say">' + esc(L.text) + '</span></div>';
      }).join('') + '</div><div class="sndrow"><button class="mini" onclick="replayTalk()">🔁 다시 듣기</button></div>' : '');
    renderAsk(); renderTabs(); renderBody();
    $('emrPrev').disabled = si === 0;
    $('emrNext').textContent = si + 1 < C.stages.length ? '다음 시간으로 ▶ ' + short(C.stages[si + 1].time) : '마무리 보기 ▶';
    lockNext();
    if (speak) speakLines(talk, C.patient);
  }
  function replay() { if (C && $('v-emr').classList.contains('on')) speakLines(C.stages[si].talk || [], C.patient); }
  window.replayTalk = function () { if (!sound) { sound = true; NS.save('sound', true); paintSound(); } replay(); };

  // 판단 질문: 답해야 다음으로 넘어간다
  function renderAsk() {
    var asks = C.stages[si].ask || [];
    $('emrAsk').innerHTML = asks.map(function (q, k) {
      var key = si + '-' + k, a = answers[key];
      return '<div class="ask" data-k="' + key + '"><div class="h">🤔 판단해 보세요 · ' + short(C.stages[si].time) + '</div><div class="q">' + esc(q.q) + '</div>' +
        q.options.map(function (o, i) {
          var cls = a == null ? '' : i === q.answer ? ' right' : i === a ? ' wrong' : '';
          return '<button class="opt' + cls + '" data-i="' + i + '"' + (a == null ? '' : ' disabled') + '><span class="n">' + '①②③④⑤⑥'.charAt(i) + '</span><span>' + esc(o) + '</span></button>';
        }).join('') +
        '<div class="explain' + (a == null ? '' : ' on') + '">' + (a == null ? '' : (a === q.answer ? '<b class="ok">⭕ 맞았어요</b>' : '<b class="no">❌ 정답은 ' + '①②③④⑤⑥'.charAt(q.answer) + '</b>') + '<p style="margin:6px 0 0">' + esc(q.explain || '') + '</p>') + '</div></div>';
    }).join('');
    $('emrAsk').querySelectorAll('.ask').forEach(function (box) {
      box.querySelectorAll('.opt').forEach(function (b) {
        b.onclick = function () { answers[box.getAttribute('data-k')] = +b.getAttribute('data-i'); renderAsk(); lockNext(); };
      });
    });
  }
  function lockNext() {
    var asks = C.stages[si].ask || [], left = asks.filter(function (_, k) { return answers[si + '-' + k] == null; }).length;
    $('emrNext').disabled = left > 0;
    if (left) $('emrNext').textContent = '위 질문에 먼저 답해 주세요 (' + left + ')';
    else $('emrNext').textContent = si + 1 < C.stages.length ? '다음 시간으로 ▶ ' + short(C.stages[si + 1].time) : '마무리 보기 ▶';
  }
  window.emrMove = function (d) {
    if (d > 0 && si + 1 >= C.stages.length) return debrief();
    si = Math.max(0, Math.min(C.stages.length - 1, si + d));
    renderEmr(d > 0); window.scrollTo(0, 0);
  };

  // ---------- EMR 탭 ----------
  var TABS = [['sum', '요약'], ['vs', 'V/S'], ['ord', '처방'], ['lab', '검사'], ['doc', '기록지'], ['note', '간호기록'], ['io', 'I/O']];
  var KEY = { vs: 'vitals', ord: 'orders', lab: 'labs', doc: 'docs', note: 'notes', io: 'io' };
  function renderTabs() {
    $('etabs').innerHTML = TABS.map(function (t) {
      var n = KEY[t[0]] ? upto(C[KEY[t[0]]]).filter(isNew).length : 0;
      return '<button data-t="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + (n ? '<span class="nb">' + n + '</span>' : '') + '</button>';
    }).join('');
    $('etabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { tab = b.getAttribute('data-t'); renderTabs(); renderBody(); }; });
  }
  function newTag(x) { return isNew(x) ? '<span class="newtag">NEW</span>' : ''; }

  // 정상 범위를 벗어나면 색으로 표시 (성인 기준, 교과서 일반값)
  var AB = {
    sbp: function (v) { return v >= 160 ? 'hi' : v < 90 ? 'lo' : ''; }, dbp: function (v) { return v >= 100 ? 'hi' : v < 60 ? 'lo' : ''; },
    hr: function (v) { return v > 100 ? 'hi' : v < 60 ? 'lo' : ''; }, rr: function (v) { return v > 24 ? 'hi' : v < 12 ? 'lo' : ''; },
    bt: function (v) { return v >= 37.8 ? 'hi' : v < 36 ? 'lo' : ''; }, spo2: function (v) { return v < 94 ? 'lo' : ''; }, pain: function (v) { return v >= 7 ? 'hi' : ''; }
  };
  function chart(vs) {
    if (vs.length < 2) return '';
    var W = 520, H = 300, L = 40, R = 12, T = 14, B = 34, lo = 0, hi = 200;
    var x = function (i) { return L + (W - L - R) * i / (vs.length - 1); }, y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var line = function (k, color, dash) {
      var pts = vs.map(function (v, i) { return v[k] == null ? null : x(i).toFixed(1) + ',' + y(v[k]).toFixed(1); }).filter(Boolean).join(' ');
      return '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"' + (dash ? ' stroke-dasharray="6 5"' : '') + ' style="filter:drop-shadow(0 0 4px ' + color + ')"/>' +
        vs.map(function (v, i) { return v[k] == null ? '' : '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v[k]).toFixed(1) + '" r="3.6" fill="' + color + '"/>'; }).join('');
    };
    var grid = [30, 60, 90, 120, 150, 180].map(function (g) { return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="rgba(160,180,255,.13)"/><text x="' + (L - 6) + '" y="' + (y(g) + 4) + '" fill="#9aa7cc" font-size="14" text-anchor="end">' + g + '</text>'; }).join('');
    var xs = vs.map(function (v, i) { return (vs.length <= 5 || i % Math.ceil(vs.length / 5) === 0 || i === vs.length - 1) ? '<text x="' + x(i) + '" y="' + (H - 8) + '" fill="#9aa7cc" font-size="13" text-anchor="middle">' + esc(short(v.time).slice(-5)) + '</text>' : ''; }).join('');
    return '<div class="block"><h3>📈 V/S 흐름</h3><svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + grid + line('sbp', '#ff5c8a') + line('dbp', '#ff5c8a', 1) + line('hr', '#4de1ff') + line('rr', '#ffd24d') + xs + '</svg>' +
      '<div class="legendr"><span><i style="background:#ff5c8a"></i>수축기·이완기(점선) 혈압</span><span><i style="background:#4de1ff"></i>맥박</span><span><i style="background:#ffd24d"></i>호흡</span></div></div>';
  }
  function cell(k, v) { if (v == null || v === '') return '<td>–</td>'; var c = AB[k] ? AB[k](+v) : ''; return '<td class="' + c + '">' + esc(v) + '</td>'; }
  function renderBody() {
    var h = '';
    if (tab === 'sum') {
      var p = C.patient, vs = upto(C.vitals), last = vs[vs.length - 1];
      h += '<div class="block"><h3>🧾 입원 정보</h3><div class="nums">' +
        [['진단', p.dx], ['수술·시술', p.op], ['입원', p.admit ? label(p.admit) : ''], ['주치의', p.doctor], ['과거력', (p.history || []).join(', ')], ['심폐소생술', p.code]].filter(function (r) { return r[1]; })
          .map(function (r) { return '<div>' + esc(r[0]) + '</div><div>' + esc(r[1]) + '</div>'; }).join('') + '</div></div>';
      if (C.background) h += '<div class="block"><h3>📋 입원 경위</h3><p>' + esc(C.background) + '</p></div>';
      if (last) h += '<div class="block"><h3>🩺 최근 V/S · ' + esc(short(last.time)) + '</h3><div class="nums">' +
        [['혈압', last.sbp + '/' + last.dbp + ' mmHg', AB.sbp(last.sbp) || AB.dbp(last.dbp)], ['맥박', last.hr + ' 회/분', AB.hr(last.hr)], ['호흡', last.rr + ' 회/분', AB.rr(last.rr)], ['체온', last.bt + ' ℃', AB.bt(last.bt)], ['SpO₂', last.spo2 + ' %', AB.spo2(last.spo2)], ['통증', last.pain != null ? last.pain + ' /10' : '', AB.pain(last.pain)], ['의식', last.loc, '']]
          .filter(function (r) { return r[1] && !/undefined/.test(r[1]); }).map(function (r) { return '<div>' + r[0] + '</div><div class="' + (r[2] ? 'ab-' + r[2][0] : '') + '">' + esc(r[1]) + '</div>'; }).join('') + '</div>' + (last.note ? '<p style="margin-top:8px;color:var(--sub);font-size:14px">' + esc(last.note) + '</p>' : '') + '</div>';
      if ((C.goals || []).length) h += '<div class="block"><h3>🎯 학습 목표</h3><ul>' + C.goals.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>';
    } else if (tab === 'vs') {
      var v = upto(C.vitals);
      h += chart(v);
      h += '<div class="block"><h3>V/S 기록 (새 기록이 아래)</h3><div class="tscroll"><table class="etable"><tr><th>시간</th><th>혈압</th><th>맥박</th><th>호흡</th><th>체온</th><th>SpO₂</th><th>통증</th><th>의식</th></tr>' +
        v.map(function (r) {
          var bp = AB.sbp(r.sbp) || AB.dbp(r.dbp);
          return '<tr class="' + (isNew(r) ? 'new' : '') + '"><th>' + esc(short(r.time)) + '</th><td class="' + bp + '">' + esc(r.sbp) + '/' + esc(r.dbp) + '</td>' + cell('hr', r.hr) + cell('rr', r.rr) + cell('bt', r.bt) + cell('spo2', r.spo2) + cell('pain', r.pain) + '<td>' + esc(r.loc || '') + '</td></tr>' +
            (r.note ? '<tr class="' + (isNew(r) ? 'new' : '') + '"><td colspan="8" style="text-align:left;white-space:normal;color:var(--sub);font-size:13px">↳ ' + esc(r.note) + '</td></tr>' : '');
        }).join('') + '</table></div><p class="fake" style="text-align:left">빨강 = 높음 · 파랑 = 낮음 (성인 일반 기준)</p></div>';
    } else if (tab === 'ord') {
      var o = upto(C.orders).slice().reverse();
      h += '<div class="block"><h3>💊 처방 (최근 순)</h3>' + (o.length ? o.map(function (r) {
        return '<div class="ord"><div class="t">' + esc(short(r.time)) + ' · ' + esc(r.type || '') + (r.by ? ' · ' + esc(r.by) : '') + '</div><b>' + esc(r.text) + '</b><span class="st ' + esc(r.status || '') + '">' + esc(r.status || '') + '</span>' + newTag(r) + '</div>';
      }).join('') : '<div class="empty">아직 처방이 없어요</div>') + '<p class="fake">교육용 가상 처방 · 실제 처방 기준이 아니에요</p></div>';
    } else if (tab === 'lab') {
      var labs = upto(C.labs), times = [], names = [];
      labs.forEach(function (r) { if (times.indexOf(r.time) < 0) times.push(r.time); if (names.indexOf(r.name) < 0) names.push(r.name); });
      h += '<div class="block"><h3>🧪 검사 결과</h3>' + (labs.length ? '<div class="tscroll"><table class="etable"><tr><th>항목 (참고치)</th>' + times.map(function (t) { return '<th style="position:static">' + esc(short(t)) + '</th>'; }).join('') + '</tr>' +
        names.map(function (n) {
          var any = labs.filter(function (r) { return r.name === n; })[0];
          return '<tr><th style="text-align:left">' + esc(n) + '<br><small style="font-weight:400">' + esc(any.ref || '') + ' ' + esc(any.unit || '') + '</small></th>' + times.map(function (t) {
            var r = labs.filter(function (x) { return x.name === n && x.time === t; })[0];
            if (!r) return '<td>–</td>';
            var f = (r.flag || '').toUpperCase(), c = /H/.test(f) ? 'hi' : /L/.test(f) ? 'lo' : '';
            return '<td class="' + c + '"' + (isNew(r) ? ' style="background:rgba(77,225,255,.08)"' : '') + '>' + esc(r.value) + (f ? ' ' + esc(f) : '') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</table></div>' : '<div class="empty">아직 검사 결과가 없어요</div>') + '</div>';
    } else if (tab === 'doc') {
      var d = upto(C.docs).slice().reverse();
      h += d.length ? d.map(function (r, i) {
        return '<details class="doc"' + (i === 0 ? ' open' : '') + '><summary><span>📄</span><span style="flex:1"><span class="k">' + esc(short(r.time)) + ' · ' + esc(r.kind || '') + '</span><br><b>' + esc(r.title || r.kind) + '</b></span>' + newTag(r) + '</summary><pre>' + esc(r.body || '') + '</pre></details>';
      }).join('') : '<div class="block"><div class="empty">아직 기록지가 없어요</div></div>';
    } else if (tab === 'note') {
      var n = upto(C.notes).slice().reverse();
      h += '<div class="block"><h3>📝 간호기록 (최근 순)</h3>' + (n.length ? '<div class="tl">' + n.map(function (r) {
        return '<div class="n"><span class="t">' + esc(label(r.time)) + '</span>' + newTag(r) + '<p>' + esc(r.text) + '</p>' + (r.by ? '<small>' + esc(r.by) + '</small>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="empty">아직 간호기록이 없어요</div>') + '</div>';
    } else if (tab === 'io') {
      var io = upto(C.io), ti = 0, to = 0;
      h += '<div class="block"><h3>💧 섭취량 · 배설량</h3>' + (io.length ? '<div class="tscroll"><table class="etable"><tr><th>시간</th><th>섭취</th><th>배설</th><th>누적 균형</th></tr>' + io.map(function (r) {
        var i = (r.in || []).reduce(function (a, x) { return a + (+x.ml || 0); }, 0), o = (r.out || []).reduce(function (a, x) { return a + (+x.ml || 0); }, 0);
        ti += i; to += o;
        return '<tr class="' + (isNew(r) ? 'new' : '') + '"><th>' + esc(short(r.time)) + '</th><td style="text-align:left;white-space:normal">' + (r.in || []).map(function (x) { return esc(x.name) + ' ' + x.ml; }).join('<br>') + '</td>' +
          '<td style="text-align:left;white-space:normal">' + (r.out || []).map(function (x) { return esc(x.name) + ' ' + x.ml; }).join('<br>') + '</td><td>' + (ti - to > 0 ? '+' : '') + (ti - to) + '</td></tr>';
      }).join('') + '</table></div><p style="margin-top:8px">합계: 섭취 <b>' + ti + ' mL</b> · 배설 <b>' + to + ' mL</b></p>' : '<div class="empty">아직 기록이 없어요</div>') + '</div>';
    }
    $('emrBody').innerHTML = h;
  }

  // ---------- 마무리 ----------
  function debrief() {
    stopSpeak();
    var total = 0, right = 0;
    C.stages.forEach(function (st, s) { (st.ask || []).forEach(function (q, k) { total++; if (answers[s + '-' + k] === q.answer) right++; }); });
    var score = total ? Math.round(right / total * 100) : 100, done = NS.load('cases_done', {});
    done[C.id] = score; NS.save('cases_done', done);
    var d = C.debrief || {};
    $('dbTitle').textContent = '🏁 ' + C.title;
    var h = '<div class="score">' + score + '점<small>판단 질문 ' + total + '개 중 ' + right + '개 맞힘</small></div>';
    if (d.summary) h += '<div class="block"><h3>📋 무슨 일이 있었나요</h3><p>' + esc(d.summary) + '</p></div>';
    if ((d.signs || []).length) h += '<div class="block warn"><h3>🚨 놓치면 안 되는 징후</h3><ul>' + d.signs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    if ((d.points || []).length) h += '<div class="block"><h3>💡 배울 점</h3><ul>' + d.points.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    var rel = (C.related || []).filter(function (id) { return NS.BY[id]; });
    if (rel.length) h += '<div class="section">더 공부하기</div><div class="card" id="dbRel">' + rel.map(function (id) { return NS.topicRow(NS.BY[id]); }).join('') + '</div>';
    $('dbBody').innerHTML = h;
    if (rel.length) NS.bindRows($('dbRel'));
    go('v-debrief', true);
  }
})();
