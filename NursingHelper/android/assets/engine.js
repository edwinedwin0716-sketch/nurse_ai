// 간호과정 생성기 (컴퓨터용 Templates.ps1과 같은 규칙)
(function (root) {
  'use strict';
  var T = root.TEMPLATES;

  function finalOf(word) {
    if (!word) return -1;
    var c = word.charCodeAt(word.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28;
    return -1;
  }
  function particle(word, withBatchim, without) {
    if (!word) return without;
    var f = finalOf(word);
    if (f === -1) return withBatchim;
    return f !== 0 ? withBatchim : without;
  }
  function ro(word) {
    if (!word) return '로';
    var f = finalOf(word);
    if (f === -1) return '으로';
    return (f === 0 || f === 8) ? '로' : '으로';
  }
  function formatDiagnosis(cause, problem, origin) {
    var text = cause + particle(cause, '과', '와') + ' 관련된 ' + problem;
    if (origin) text = origin + ro(origin) + ' 인한 ' + text;
    return text;
  }
  var PAST = [['제공한다.', '제공하였다.'], ['투여한다.', '투여하였다.'], ['교육한다.', '교육하였다.'], ['사정한다.', '사정하였다.'], ['측정한다.', '측정하였다.'], ['확인한다.', '확인하였다.'], ['관찰한다.', '관찰하였다.'], ['격려한다.', '격려하였다.'], ['취하게 한다.', '취하게 하였다.'], ['돕는다.', '도왔다.'], ['둔다.', '두었다.'], ['올린다.', '올렸다.'], ['줄인다.', '줄였다.'], ['만든다.', '만들었다.'], ['설명한다.', '설명하였다.'], ['지킨다.', '지켰다.'], ['흡인한다.', '흡인하였다.']];
  function toPast(sentence) {
    var s = sentence.trim();
    for (var i = 0; i < PAST.length; i++) {
      if (s.slice(-PAST[i][0].length) === PAST[i][0]) return s.slice(0, s.length - PAST[i][0].length) + PAST[i][1];
    }
    if (s.slice(-3) === '한다.') return s.slice(0, s.length - 3) + '하였다.';
    return s;
  }
  function splitLines(text) {
    return String(text || '').split(/\r\n|\n|;/).map(function (x) {
      return x.trim().replace(/^[-·•\s]+/, '').trim();
    }).filter(function (x) { return x; });
  }
  function rx(name) { return new RegExp(T[name].keywords, 'gi'); }
  function test(name, line) { return new RegExp(T[name].keywords, 'i').test(line); }
  function findDiagnoses(s, o, dx) {
    var all = s + '\n' + o + '\n' + dx, scores = [], order = 0;
    Object.keys(T).forEach(function (name) {
      var m = all.match(rx(name));
      if (m && m.length) scores.push({ name: name, score: m.length, i: order++ });
    });
    scores.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return scores.map(function (x) { return x.name; });
  }
  function getNrs(text) {
    var m = /NRS\s*[:：]?\s*(\d{1,2})/i.exec(text || '');
    return m ? parseInt(m[1], 10) : null;
  }
  function md(date) { return (date.getMonth() + 1) + '/' + date.getDate(); }
  function goals(t, nrs) {
    var g = nrs !== null ? Math.max(0, Math.min(2, nrs - 3)) : 2;
    return t.short.map(function (x) { return x.split('{nrsGoal}').join(String(g)); });
  }
  function quote(x) { return /^["“]/.test(x) ? x : '"' + x + '"'; }

  // 기본 형식 (사정 → 진단 → 계획 → 중재 → 평가)
  function basic(s, o, dx, choices, date) {
    var out = [], w = function (x) { out.push(x); }, d = md(date);
    w('■ 사정'); w(''); w('주관적 자료');
    var sl = splitLines(s); if (!sl.length) w('- "(대상자가 직접 한 말을 그대로 적으세요)"');
    sl.forEach(function (x) { w('- ' + quote(x)); });
    w(''); w('객관적 자료');
    var ol = splitLines(o); if (!ol.length) w('- (V/S, 검사 결과, 관찰 내용, 이미 투여된 약물을 적으세요)');
    ol.forEach(function (x) { w('- ' + x); });
    splitLines(dx).forEach(function (x) { w('- ' + (/^Dx/.test(x) ? x : 'Dx. ' + x)); });
    w(''); w('■ 진단'); w('');
    choices.forEach(function (c, i) { w('진단 ' + (i + 1) + ' : ' + formatDiagnosis(c.cause, c.name, c.origin)); });
    var nrs = getNrs(o);
    choices.forEach(function (c, n) {
      var t = T[c.name], title = formatDiagnosis(c.cause, c.name, c.origin);
      w(''); w('────────────────────────────'); w('진단 ' + (n + 1) + ' : ' + title); w('────────────────────────────'); w('');
      w('■ 계획'); w(''); w('장기목표'); w(t.long); w(''); w('단기목표');
      goals(t, nrs).forEach(function (g, i) { w((i + 1) + '. ' + g); });
      [['진단적 계획', 'diag'], ['치료적 계획', 'ther'], ['교육적 계획', 'edu']].forEach(function (sec) {
        w(''); w(sec[0]);
        t[sec[1]].forEach(function (p, i) { w((i + 1) + '. ' + p.plan); w(' 이론적 근거 : ' + p.why); });
      });
      w(''); w('■ 중재');
      [['진단적 중재', 'diag'], ['치료적 중재', 'ther'], ['교육적 중재', 'edu']].forEach(function (sec) {
        w(''); w(sec[0]);
        t[sec[1]].forEach(function (p, i) { w((i + 1) + '. ' + toPast(p.plan)); w(' ' + d + ' __:__ (수행한 내용과 대상자의 반응을 적으세요)'); });
      });
      w(''); w('■ 평가'); w(''); w('단기목표 평가');
      t.short.forEach(function (g, i) { w((i + 1) + '. 대상자는 __/__ (결과를 수치로 적으세요) 이므로 단기목표 ' + (i + 1) + '  달성 / 부분적 달성 / 달성 못함.'); });
      w(''); w('장기목표 평가'); w('대상자는 __/__ (퇴원 시 상태) 이므로 장기목표  달성 / 부분적 달성 / 달성 못함.');
      w(' ※ 부분적 달성하거나 달성하지 못한 목표는 수정하여 다시 중재한다.');
    });
    w(''); w('※ 자동으로 만든 틀입니다. 이론적 근거와 수치는 교재와 대상자 자료로 꼭 확인·수정하세요.');
    return out.join('\n') + '\n';
  }

  // B4 워크북 형식
  function sortByPriority(choices) {
    return choices.map(function (c, i) { return { c: c, p: T[c.name].priority, i: i }; })
      .sort(function (a, b) { return a.p - b.p || a.i - b.i; }).map(function (x) { return x.c; });
  }
  function workbookModel(s, o, dx, choices, date, autoSort) {
    if (autoSort) choices = sortByPriority(choices);
    var sl = splitLines(s).map(quote), ol = splitLines(o);
    var dxl = splitLines(dx).map(function (x) { return /^Dx/.test(x) ? x : 'Dx. ' + x; });
    var all = sl.concat(ol, dxl), nrs = getNrs(o);
    var diags = choices.map(function (c) {
      var t = T[c.name], plans = [];
      [['진단적', 'diag'], ['치료적', 'ther'], ['교육적', 'edu']].forEach(function (k) {
        t[k[1]].forEach(function (p) { plans.push({ kind: k[0], plan: p.plan, why: p.why, done: toPast(p.plan) }); });
      });
      return {
        name: c.name, en: t.en, domain: t.domain, cls: t.cls, page: t.page, problem: t.problem, reason: t.reason,
        statement: formatDiagnosis(c.cause, c.name, c.origin),
        cause: c.origin ? c.origin + ro(c.origin) + ' 인한 ' + c.cause : c.cause,
        cues: all.filter(function (l) { return test(c.name, l); }),
        long: t.long, short: goals(t, nrs), plans: plans, evalData: t.evalData
      };
    });
    var domains = [], dmap = {};
    diags.forEach(function (d) {
      if (!dmap[d.domain]) { dmap[d.domain] = []; domains.push(d.domain); }
      d.cues.forEach(function (q) { if (dmap[d.domain].indexOf(q) < 0) dmap[d.domain].push(q); });
    });
    var priority = '';
    if (diags.length) {
      priority = diags.map(function (d, i) { return (i + 1) + "순위 '" + d.name + "'" + particle(d.name, '은', '는') + ' ' + d.reason + '.'; }).join(' ') +
        ' 매슬로우의 욕구 단계와 ABC(기도·호흡·순환) 원칙, 실제적 진단을 위험 진단보다 먼저 다루는 원칙에 따라 정하였다.';
    }
    return { date: date, subjective: sl, objective: ol.concat(dxl), domains: domains, domainData: dmap, diags: diags, priority: priority };
  }
  function soapie(m) {
    if (!m.diags.length) return [];
    var d = m.diags[0], dd = md(m.date);
    var s = m.subjective.filter(function (x) { return d.cues.indexOf(x) >= 0; });
    if (!s.length) s = ['(이 진단과 관련된 대상자의 호소를 적으세요)'];
    var o = d.cues.filter(function (x) { return m.subjective.indexOf(x) < 0; });
    if (!o.length) o = m.objective;
    var ther = d.plans.filter(function (p) { return p.kind !== '진단적'; }).slice(0, 3).map(function (p) { return p.done; });
    return [
      { date: dd, time: '__:__', dx: d.name, tag: 'S', text: s.join(' ') },
      { date: '', time: '', dx: '', tag: 'O', text: o.join(', ') },
      { date: '', time: '', dx: '', tag: 'A', text: d.statement },
      { date: '', time: '', dx: '', tag: 'P', text: d.short[0] },
      { date: '', time: '', dx: '', tag: 'I', text: ther.join(' ') },
      { date: '', time: '__:__', dx: '', tag: 'E', text: '(중재 후 대상자 반응을 수치로 적으세요)' }
    ];
  }
  function workbookText(m) {
    var out = [], w = function (x) { out.push(x); }, d = md(m.date), i;
    w('■ 1. 간호사정'); w('');
    w('주관적 자료'); m.subjective.forEach(function (x, k) { w((k + 1) + '. ' + x); }); if (!m.subjective.length) w('1. "(대상자가 직접 한 말)"');
    w(''); w('객관적 자료'); m.objective.forEach(function (x, k) { w((k + 1) + '. ' + x); }); if (!m.objective.length) w('1. (V/S, 검사 결과, 관찰 내용, 투여된 약물)');
    w(''); w('자료조직(분류) · NANDA-I 분류체계 기준');
    m.domains.forEach(function (k) { var v = m.domainData[k]; w('▪ ' + k + ' 영역에 해당하는 자료: ' + (v.length ? v.join(', ') : '(해당 자료를 적으세요)')); });
    w(''); w('간호문제'); m.diags.forEach(function (x, k) { w((k + 1) + '. ' + x.problem); });
    w(''); w('■ 2. 간호진단');
    m.diags.forEach(function (x, n) {
      w(''); w('단서묶음 ' + (n + 1));
      x.cues.forEach(function (q, k) { w((k + 1) + '. ' + q); }); if (!x.cues.length) w('1. (이 진단의 근거가 되는 자료를 적으세요)');
      w('▪ 영역: ' + x.domain); w('▪ 과: ' + x.cls); w('▪ 페이지: 별책 부록 8, p.' + x.page);
      w('▪ 진단명: ' + x.name + ' (' + x.en + ')'); w('▪ 정의: (별책 부록 8, p.' + x.page + '의 정의를 옮겨 적으세요)');
      w('관련(위험) 요인: ' + x.cause); w('간호진단 진술: ' + x.statement);
    });
    w(''); w('■ 3. 간호계획'); w('');
    m.diags.forEach(function (x, n) { w((n + 1) + '순위: ' + x.statement); });
    w('우선순위의 근거: ' + m.priority);
    m.diags.forEach(function (x, n) {
      w(''); w('간호진단 ' + (n + 1) + ' : ' + x.statement);
      w('▪ 장기목표 : ' + x.long); w('▪ 단기목표 :'); x.short.forEach(function (g, k) { w('  ' + (k + 1) + ') ' + g); });
      w('간호중재 | 이론적 근거'); x.plans.forEach(function (p, k) { w((k + 1) + '. [' + p.kind + '] ' + p.plan); w('   → 이론적 근거 : ' + p.why); });
    });
    w(''); w('■ 4. 간호수행 및 평가');
    m.diags.forEach(function (x, n) {
      w(''); w('간호진단 ' + (n + 1) + ' : ' + x.statement);
      w('▪ 장기목표 : ' + x.long); x.short.forEach(function (g, k) { w('▪ 단기목표 ' + (k + 1) + ' : ' + g); });
      w('간호수행'); x.plans.forEach(function (p, k) { w((k + 1) + '. ' + d + ' __:__ ' + p.done + ' (대상자 반응: )'); });
      w('간호평가를 위한 자료수집: ' + x.evalData);
      w('간호평가 진술문:'); x.short.forEach(function (g, k) { w('  단기목표 ' + (k + 1) + ' : 대상자는 __/__ (결과 수치) 이므로 달성 / 부분적 달성 / 달성 못함.'); });
      w('  장기목표 : 대상자는 __/__ (퇴원 시 상태) 이므로 달성 / 부분적 달성 / 달성 못함.');
    });
    w(''); w('■ 5. 간호기록 (SOAPIE)');
    soapie(m).forEach(function (r) {
      var head = r.dx ? r.date + ' ' + r.time + ' [' + r.dx + ']' : (r.time ? '      ' + r.time : '      ');
      w(head + '  ' + r.tag + ' : ' + r.text);
    });
    w(''); w('※ 자동으로 만든 틀입니다. 정의는 별책 부록 8을, 이론적 근거와 수치는 교재와 대상자 자료로 꼭 확인·수정하세요.');
    return out.join('\n') + '\n';
  }
  function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function list(items, empty) {
    if (!items.length) return '<span class=hint>' + esc(empty) + '</span>';
    return items.map(function (x, i) { return (i + 1) + '. ' + esc(x) + '<br>'; }).join('');
  }
  // B4 가로 표 양식 (Word·한글·브라우저·PDF 인쇄)
  function workbookHtml(m) {
    var d = md(m.date), h = [];
    h.push('<html><head><meta charset="utf-8"><title>간호과정 워크북</title><style>@page{size:364mm 257mm;margin:14mm 16mm}@page Section1{size:364mm 257mm;mso-page-orientation:landscape;margin:14mm 16mm}div.Section1{page:Section1}' +
      "body{font-family:'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif;font-size:10pt;color:#1d1d1f}h1{font-size:15pt;color:#0a7f8c;border-bottom:2px solid #0a9fb0;padding-bottom:3pt;margin:14pt 0 8pt}" +
      'table{border-collapse:collapse;width:100%;margin-bottom:10pt}td,th{border:1px solid #9fd6dd;padding:5pt 7pt;vertical-align:top}th{background:#12a7b8;color:#fff;font-weight:bold;text-align:center}' +
      'td.k{background:#12a7b8;color:#fff;font-weight:bold;width:15%;text-align:center;vertical-align:middle}.hint,.blank{color:#e08600}.small{font-size:8.5pt;color:#6e6e73}.pb{page-break-before:always}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><div class=Section1>');
    h.push('<h1>1. 간호사정</h1><table>');
    h.push('<tr><td class=k>주관적 자료</td><td>' + list(m.subjective, '(대상자가 직접 한 말)') + '</td></tr>');
    h.push('<tr><td class=k>객관적 자료</td><td>' + list(m.objective, '(V/S, 검사 결과, 관찰 내용, 투여된 약물)') + '</td></tr>');
    var org = m.domains.map(function (k) { var v = m.domainData[k]; return '▪ <b>' + esc(k) + '</b> 영역에 해당하는 자료: ' + (v.length ? esc(v.join(', ')) : '<span class=hint>(해당 자료)</span>') + '<br>'; }).join('');
    h.push('<tr><td class=k>자료조직(분류)</td><td><span class=small>NANDA-I 간호진단 분류체계를 기틀로 조직</span><br>' + org + '</td></tr>');
    h.push('<tr><td class=k>간호문제</td><td>' + list(m.diags.map(function (x) { return x.problem; }), '') + '</td></tr></table>');
    h.push('<h1 class=pb>2. 간호진단</h1>');
    for (var k = 0; k < m.diags.length; k += 2) {
      var pair = m.diags.slice(k, k + 2);
      h.push('<table><tr><th style="width:15%"></th>' + pair.map(function (x, i) { return '<th>단서묶음 ' + (k + i + 1) + '</th>'; }).join('') + '</tr>');
      var row = function (label, cell) { h.push('<tr><td class=k>' + label + '</td>' + pair.map(function (x) { return '<td>' + cell(x) + '</td>'; }).join('') + '</tr>'); };
      row('단서묶음', function (x) { return list(x.cues, '(근거 자료)'); });
      row('영역찾기', function (x) { return '▪ 영역: ' + esc(x.domain) + '<br>▪ 과: ' + esc(x.cls) + '<br>▪ 페이지: 별책 부록 8, p.' + x.page; });
      row('간호진단명과 정의', function (x) { return '▪ 진단명: <b>' + esc(x.name) + '</b> (' + esc(x.en) + ')<br>▪ 정의: <span class=hint>(부록 8, p.' + x.page + '의 정의를 옮겨 적으세요)</span>'; });
      row('관련(위험) 요인', function (x) { return esc(x.cause); });
      row('간호진단 진술', function (x) { return '<b>' + esc(x.statement) + '</b>'; });
      h.push('</table>');
    }
    h.push('<h1 class=pb>3. 간호계획</h1><table><tr><th style="width:15%"></th>' + m.diags.map(function (x, i) { return '<th>' + (i + 1) + '순위</th>'; }).join('') + '</tr>');
    h.push('<tr><td class=k>간호진단</td>' + m.diags.map(function (x) { return '<td>' + esc(x.statement) + '</td>'; }).join('') + '</tr>');
    h.push('<tr><td class=k>우선순위의 근거</td><td colspan=' + Math.max(1, m.diags.length) + '>' + esc(m.priority) + '</td></tr></table>');
    m.diags.forEach(function (x, n) {
      var sg = x.short.map(function (g, i) { return (i + 1) + ') ' + esc(g) + '<br>'; }).join('');
      h.push('<table><tr><td class=k>간호진단 ' + (n + 1) + '</td><td colspan=2><b>' + esc(x.statement) + '</b></td></tr>');
      h.push('<tr><td class=k>간호목표<br>(기대되는 결과)</td><td colspan=2>▪ 장기목표 : ' + esc(x.long) + '<br>▪ 단기목표 :<br>' + sg + '</td></tr>');
      h.push('<tr><th></th><th style="width:45%">간호중재</th><th>이론적 근거</th></tr>');
      x.plans.forEach(function (p, i) { h.push('<tr><td class=k style="font-weight:normal">' + esc(p.kind) + '</td><td>' + (i + 1) + '. ' + esc(p.plan) + '</td><td>' + (i + 1) + '. ' + esc(p.why) + '</td></tr>'); });
      h.push('</table>');
    });
    h.push('<h1 class=pb>4. 간호수행 및 평가</h1>');
    m.diags.forEach(function (x, n) {
      var sg = x.short.map(function (g, i) { return (i + 1) + ') ' + esc(g) + '<br>'; }).join('');
      var done = x.plans.map(function (p, i) { return (i + 1) + '. <span class=blank>' + d + ' __:__</span> ' + esc(p.done) + ' <span class=blank>(대상자 반응: )</span><br>'; }).join('');
      var ev = x.short.map(function (g, i) { return '단기목표 ' + (i + 1) + ' : 대상자는 <span class=blank>__/__ (결과 수치)</span> 이므로 <span class=blank>달성 / 부분적 달성 / 달성 못함</span>.<br>'; }).join('') +
        '장기목표 : 대상자는 <span class=blank>__/__ (퇴원 시 상태)</span> 이므로 <span class=blank>달성 / 부분적 달성 / 달성 못함</span>.';
      h.push('<table><tr><td class=k>간호진단 ' + (n + 1) + '</td><td><b>' + esc(x.statement) + '</b></td></tr>');
      h.push('<tr><td class=k>간호목표<br>(기대되는 결과)</td><td>▪ 장기목표 : ' + esc(x.long) + '<br>▪ 단기목표 :<br>' + sg + '</td></tr>');
      h.push('<tr><td class=k>간호수행</td><td>' + done + '</td></tr><tr><td class=k>간호평가를 위한<br>자료수집</td><td>' + esc(x.evalData) + '</td></tr><tr><td class=k>간호평가 진술문</td><td>' + ev + '</td></tr></table>');
    });
    h.push('<h1 class=pb>5. 간호기록지 (SOAPIE)</h1><table><tr><th style="width:8%">날짜</th><th style="width:7%">시간</th><th style="width:15%">간호진단명</th><th style="width:6%">양식</th><th>간호기록</th><th style="width:8%">서명</th></tr>');
    soapie(m).forEach(function (r) { h.push('<tr><td>' + esc(r.date) + '</td><td class=blank>' + esc(r.time) + '</td><td>' + esc(r.dx) + '</td><td style="text-align:center"><b>' + r.tag + '</b></td><td>' + esc(r.text) + '</td><td></td></tr>'); });
    h.push('</table><p class=small>※ 자동으로 만든 틀입니다. 진단 정의는 별책 부록 8을, 이론적 근거와 수치는 교재와 대상자 자료로 꼭 확인·수정하세요.</p></div></body></html>');
    return h.join('');
  }
  function simpleHtml(text) {
    var body = String(text).split('\n').map(function (ln) {
      if (ln.indexOf('■') === 0) return '<h1>' + esc(ln) + '</h1>';
      if (!ln.trim()) return '<br>';
      return '<p>' + esc(ln) + '</p>';
    }).join('');
    return '<html><head><meta charset="utf-8"><style>@page{size:364mm 257mm;margin:14mm 16mm}@page Section1{size:364mm 257mm;mso-page-orientation:landscape;margin:14mm 16mm}div.Section1{page:Section1}' +
      "body{font-family:'Malgun Gothic','Noto Sans KR',sans-serif;font-size:10.5pt}h1{font-size:14pt;color:#0a7f8c;margin:12pt 0 4pt}p{margin:0 0 2pt}</style></head><body><div class=Section1>" + body + '</div></body></html>';
  }

  // 제출 양식 (사정 / 간호계획 및 수행 / 합리적 근거 / 간호평가)
  var VITAL = /(\bBP\b|혈압|\bP\s*\d|\bPR\b|맥박|\bR\s*\d|\bRR\b|호흡수|\bBT\b|체온|V\/S|SpO2|산소포화도)/i;
  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  function circled(n) { return n >= 1 && n <= 20 ? CIRCLED.charAt(n - 1) : '(' + n + ')'; }
  var DONE = [['돕는다.', '도움'], ['둔다.', '둠'], ['올린다.', '올림'], ['줄인다.', '줄임'], ['만든다.', '만듦'], ['지킨다.', '지킴'], ['피한다.', '피함']];
  function toDone(sentence) {
    var s = sentence.trim();
    for (var i = 0; i < DONE.length; i++) if (s.slice(-DONE[i][0].length) === DONE[i][0]) return s.slice(0, s.length - DONE[i][0].length) + DONE[i][1];
    if (s.slice(-3) === '한다.') return s.slice(0, s.length - 3) + '함';
    return s.replace(/\.+$/, '');
  }
  function reportSections(m) {
    return m.diags.map(function (d) {
      var s = m.subjective.filter(function (x) { return d.cues.indexOf(x) >= 0; }); if (!s.length) s = m.subjective.slice();
      var o = m.objective.filter(function (x) { return d.cues.indexOf(x) >= 0 || VITAL.test(x); }); if (!o.length) o = m.objective.slice();
      var groups = [], n = 0;
      [['진단적', '진단적 지시'], ['치료적', '치료적 지시'], ['교육적', '교육적 지시']].forEach(function (k) {
        var items = d.plans.filter(function (p) { return p.kind === k[0]; }).map(function (p) { n++; return { no: circled(n), plan: p.plan, why: p.why, done: toDone(p.plan) }; });
        if (items.length) groups.push({ title: k[1], items: items });
      });
      return { d: d, s: s, o: o, groups: groups };
    });
  }
  function reportText(m) {
    var out = [], w = function (x) { out.push(x); }, dd = md(m.date);
    reportSections(m).forEach(function (sec, k) {
      var d = sec.d;
      if (k > 0) w('');
      w('■ 간호진단 ' + (k + 1) + '  ' + d.statement);
      w(''); w('[사정(자료수집)]');
      w('주관적 자료 : ' + (sec.s.length ? sec.s.join(', ') : '"(대상자가 직접 한 말)"'));
      w('객관적 자료 : ' + (sec.o.length ? sec.o.join(', ') : '(V/S, 검사 결과, 관찰 내용)'));
      w(''); w('[간호계획 및 수행]');
      w('장기목표: ' + d.long);
      d.short.forEach(function (g, i) { w((i === 0 ? '단기목표: ' : '          ') + g); });
      w(''); w('– 계획 –');
      sec.groups.forEach(function (g) { w('[' + g.title + ']'); g.items.forEach(function (it) { w(it.no + it.plan); }); });
      w(''); w('– 수행 –');
      var i = 0;
      sec.groups.forEach(function (g) { g.items.forEach(function (it) { i++; w(i + '. ' + it.done); w('   - ' + dd + ' __:__ (수행 결과·대상자 반응을 적으세요)'); }); });
      w(''); w('[합리적 근거]');
      sec.groups.forEach(function (g) { g.items.forEach(function (it) { w(it.no + it.why); w('(참고문헌: 저자 외. (연도). 교재명 제_판 p.__ 출판사 — 확인 후 적으세요)'); }); });
      w(''); w('[간호평가]');
      w('장기목표: ' + d.long + ' (달성 / 부분 달성 / 미달성)');
      d.short.forEach(function (g, i) { w((i === 0 ? '단기목표: ' : '          ') + g + ' (달성 / 부분 달성 / 미달성)'); });
    });
    w(''); w('※ 자동으로 만든 틀입니다. 수행 결과와 참고문헌은 직접 채우고, 이론적 근거는 교재로 꼭 확인·수정하세요.');
    return out.join('\n') + '\n';
  }
  function reportHtml(m, cover) {
    var dd = md(m.date), h = [];
    h.push('<html><head><meta charset="utf-8"><title>간호과정</title><style>@page{size:210mm 297mm;margin:20mm 18mm}@page Section1{size:210mm 297mm;margin:20mm 18mm}div.Section1{page:Section1}' +
      "body{font-family:'맑은 고딕','Malgun Gothic','Noto Sans KR',sans-serif;font-size:10.5pt;color:#000;line-height:1.55}table{border-collapse:collapse;width:100%}td{border:1px solid #000;padding:4pt 6pt;vertical-align:top}" +
      'td.k{width:19%;text-align:center;vertical-align:middle}h2{font-size:12pt;margin:0 0 6pt}.cover{text-align:center;page-break-after:always}.cover .subj{font-size:14pt;text-align:left;margin-top:60pt}' +
      '.cover .title{font-size:24pt;margin:70pt 0 210pt}.cover .meta{font-size:13pt;line-height:2}.cover .school{font-size:14pt;margin-top:110pt}.blank{color:#c06000}.small{font-size:9pt;color:#555}.pb{page-break-before:always}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><div class=Section1>');
    if (cover) h.push('<div class=cover><div class=subj>' + esc(cover.subject) + '</div><div class=title>' + esc(cover.title) + '</div><div class=meta>제출일 : ' + esc(cover.date) + '<br>제출자 : ' + esc(cover.author) + '</div><div class=school>' + esc(cover.school) + '</div></div>');
    reportSections(m).forEach(function (sec, k) {
      var d = sec.d;
      h.push('<h2' + (k > 0 ? ' class=pb' : '') + '>간호진단</h2><table><tr><td colspan=2>간호진단 ' + (k + 1) + ' ' + esc(d.statement) + '</td></tr>');
      h.push('<tr><td class=k>사정(자료수집)</td><td>주관적 자료<br>: ' + (sec.s.length ? esc(sec.s.join(', ')) : '<span class=blank>"(대상자가 직접 한 말)"</span>') + '<br><br>객관적 자료<br>: ' + (sec.o.length ? esc(sec.o.join(', ')) : '<span class=blank>(V/S, 검사 결과, 관찰 내용)</span>') + '</td></tr>');
      var goal = '장기목표: ' + esc(d.long) + '<br>' + d.short.map(function (g, i) { return (i === 0 ? '단기목표: ' : '') + esc(g) + '<br>'; }).join('');
      var plan = sec.groups.map(function (g) { return '[' + esc(g.title) + ']<br>' + g.items.map(function (it) { return it.no + esc(it.plan) + '<br>'; }).join('') + '<br>'; }).join('');
      var i = 0, done = '';
      sec.groups.forEach(function (g) { g.items.forEach(function (it) { i++; done += i + '. ' + esc(it.done) + '<br><span class=blank>&nbsp;&nbsp;- ' + dd + ' __:__ (수행 결과·대상자 반응)</span><br>'; }); });
      h.push('<tr><td class=k>간호계획 및<br>수행</td><td>' + goal + '<br>– 계획 –<br>' + plan + '– 수행 –<br>' + done + '</td></tr>');
      var why = '';
      sec.groups.forEach(function (g) { g.items.forEach(function (it) { why += it.no + esc(it.why) + '<br><span class=blank>(참고문헌: 저자 외. (연도). 교재명 제_판 p.__ 출판사)</span><br>'; }); });
      h.push('<tr><td class=k>합리적 근거</td><td>' + why + '</td></tr>');
      var ev = '장기목표: ' + esc(d.long) + ' <span class=blank>(달성 / 부분 달성 / 미달성)</span><br>' + d.short.map(function (g, i) { return (i === 0 ? '단기목표: ' : '') + esc(g) + ' <span class=blank>(달성 / 부분 달성 / 미달성)</span><br>'; }).join('');
      h.push('<tr><td class=k>간호평가</td><td>' + ev + '</td></tr></table>');
    });
    h.push('<p class=small>※ 자동으로 만든 틀입니다. 수행 결과와 참고문헌은 직접 채우고, 이론적 근거는 교재로 꼭 확인·수정하세요.</p></div></body></html>');
    return h.join('');
  }

  root.Nursing = {
    formatDiagnosis: formatDiagnosis, toPast: toPast, splitLines: splitLines, findDiagnoses: findDiagnoses,
    basic: basic, workbookModel: workbookModel, workbookText: workbookText, workbookHtml: workbookHtml, simpleHtml: simpleHtml,
    reportText: reportText, reportHtml: reportHtml, toDone: toDone,
    sortByPriority: sortByPriority, particle: particle, ro: ro
  };
})(typeof window !== 'undefined' ? window : globalThis);
