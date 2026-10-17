// 강조된 내용으로 학습 자료(요점정리 · 핵심 수치 · 지식확인 문제 · 정답표)를 만든다. 인터넷·API 사용 없음.
(function (root) {
  'use strict';
  var CIRCLE = ['①', '②', '③', '④', '⑤'];
  var UNIT = /(\d+(?:[.,]\d+)?\s*(?:~\s*\d+(?:\.\d+)?\s*)?(?:mg\/dL|mmHg|mEq\/L|g\/dL|mL|ml|cc|kg|mg|g|L|%|주|일|시간|분|초|회|개월|세|배|℃|도|단위|IU|cm|mm|bpm))/;

  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffle(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var TRIM = /^[\s,.·:;()\[\]"'“”‘’\-–]+|[\s,.·:;\[\]"'“”‘’\-–]+$/g;

  // 문단 → 문장 (강조 정보 유지)
  function sentences(u) {
    var out = [], start = 0, t = u.text;
    for (var i = 0; i < t.length; i++) {
      var end = i === t.length - 1 || ((t[i] === '.' || t[i] === '?' || t[i] === '!') && t[i + 1] === ' ');
      if (end) {
        var s = t.slice(start, i + 1).trim();
        if (s.length > 3) {
          var off = t.indexOf(s, start);
          var fl = u.flags.slice(off, off + s.length);
          out.push({ text: s, flags: fl, ink: fl.some(function (f) { return f && f.ink; }), page: u.page, order: (u.order || 0) * 1000 + out.length });
        }
        start = i + 1;
      }
    }
    return out;
  }
  // 강조된 구간(형광펜·색·굵게)
  function spans(s) {
    var out = [], i = 0, f = s.flags;
    while (i < s.text.length) {
      var e = f[i] || {};
      if (e.hl || e.col || e.bold) {
        var j = i, hl = false;
        while (j < s.text.length && f[j] && (f[j].hl || f[j].col || f[j].bold)) { if (f[j].hl) hl = true; j++; }
        var raw = s.text.slice(i, j), t = raw.replace(TRIM, '');
        if (t.length >= 2) out.push({ text: t, start: i + raw.indexOf(t), hl: hl });
        i = j;
      } else i++;
    }
    return out;
  }
  function termLike(t) { return t.length >= 2 && t.length <= 30 && !/(다|요|함|음)\.?$/.test(t) && (t.match(/ /g) || []).length <= 4; }
  function score(s, sp) {
    var hl = s.flags.some(function (f) { return f && f.hl; });
    return (hl ? 3 : 0) + (s.ink ? 2 : 0) + Math.min(3, sp.length) + (UNIT.test(s.text) ? 1 : 0);
  }

  // ---------- 원본 구조 읽기 ----------
  function analyse(doc) {
    var blocks = [], qs = [], h = { 1: '', 2: '', 3: '' }, curQ = null, emphChars = 0, allChars = 0;
    doc.units.forEach(function (u) {
      if (u.type === 'heading') {
        h[u.level] = u.text; for (var l = u.level + 1; l <= 3; l++) h[l] = '';
        blocks.push({ kind: 'h' + u.level, text: u.text, page: u.page }); curQ = null; return;
      }
      allChars += u.text.length; u.flags.forEach(function (f) { if (f && (f.hl || f.col || f.bold)) emphChars++; });
      var stem = /^\s*(\d+)\s*[.)]\s*(.+\?)\s*$/.exec(u.text);
      if (stem) { curQ = { no: +stem[1], stem: stem[2], options: [], marked: u.ink, page: u.page, section: h[2] || h[1] }; qs.push(curQ); return; }
      var opt = /^\s*([①②③④⑤])\s*(.*)$/.exec(u.text);
      if (opt && curQ) { curQ.options.push({ mark: opt[1], text: opt[2], ink: u.ink }); if (u.ink) curQ.marked = true; return; }
      curQ = null;
      blocks.push({ kind: 'para', unit: u, section: [h[1], h[2], h[3]] });
    });
    return { blocks: blocks, questions: qs, emphasis: allChars ? emphChars / allChars : 0 };
  }

  // ---------- 학습 자료 만들기 ----------
  // 제목 비교용: 공백·기호·'(계속)' 등을 지운다 → "1. 고혈압"과 "1.고혈압 (계속)"을 같은 제목으로 본다
  function headKey(t) { return t.replace(/\((계속|이어서|cont\.?|continued)\)/gi, '').replace(/[\s.·:,\-–()［］\[\]]/g, '').toLowerCase(); }

  function build(doc, opt) {
    opt = opt || {};
    var nQ = opt.questions || 20, r = rng(hash(doc.title + doc.units.length));
    var a = analyse(doc), lowEmphasis = a.emphasis < 0.01;
    var numbers = [], cand = [], allSpans = [];
    // 제목 나무: 같은 부모 아래 같은 제목이 다시 나오면 새로 만들지 않고 처음 것에 합친다
    var root = { level: 0, text: '', children: [], items: [], callout: [], page: 1 }, stack = [root];
    var node = root;
    function crumb(n) { var out = []; for (var x = n; x && x.level; x = x.parent) out.unshift(x.text); return out; }
    function topic(n) { var t2 = '', t1 = ''; for (var x = n; x && x.level; x = x.parent) { if (x.level === 2) t2 = x.text; if (x.level === 1) t1 = x.text; } return t2 || t1 || '기타'; }
    a.blocks.forEach(function (b, bi) {
      if (b.kind === 'para') b.unit.order = bi;
      if (b.kind !== 'para') {
        var lv = +b.kind.charAt(1);
        while (stack.length > 1 && stack[stack.length - 1].level >= lv) stack.pop();
        var parent = stack[stack.length - 1], key = headKey(b.text), same = null;
        parent.children.forEach(function (c) { if (c.key === key && c.level === lv) same = c; });
        if (!same) { same = { level: lv, text: b.text, key: key, children: [], items: [], callout: [], page: b.page, parent: parent }; parent.children.push(same); }
        stack.push(same); node = same;
        return;
      }
      var path = crumb(node), sectionTitle = path.length ? path[path.length - 1] : '';
      sentences(b.unit).forEach(function (s) {
        var sp = spans(s), sc = score(s, sp);
        var keep = lowEmphasis ? (UNIT.test(s.text) || s.ink) : sc >= 2;
        sp.forEach(function (x) { allSpans.push({ text: x.text, section: sectionTitle, numeric: /\d/.test(x.text) }); });
        if (!keep) return;
        s.path = path; s.topic = topic(node);
        if (node.items.length < 14) node.items.push({ s: s, spans: sp });
        var numSpans = sp.filter(function (x) { return /\d/.test(x.text); }).map(function (x) { return x.text; });
        if (!numSpans.length && UNIT.test(s.text) && (lowEmphasis || sc >= 3)) numSpans = s.text.split(/,\s*|(?:이며|이고|하고|하며)\s/).filter(function (c) { return UNIT.test(c); }).map(function (c) { return c.trim(); }).slice(0, 2);
        numSpans.forEach(function (n) { if (node.callout.indexOf(n) < 0) { node.callout.push(n); numbers.push({ section: sectionTitle, text: n, page: s.page }); } });
        sp.forEach(function (x) { if (termLike(x.text) && x.text.length < s.text.length * 0.7) cand.push({ s: s, span: x, section: sectionTitle, score: sc + (x.hl ? 2 : 0) }); });
      });
    });
    // 나무 → 순서대로 펼친 목록 (내용 없는 제목은 뺀다)
    var outline = [];
    function has(n) { return n.items.length > 0 || n.children.some(has); }
    function walk(n) {
      if (n.level) { if (!has(n)) return; outline.push({ kind: 'h' + Math.min(3, n.level), text: n.text, page: n.page }); }
      if (n.items.length) outline.push({ kind: 'points', items: n.items, callout: n.callout });
      n.children.forEach(walk);
    }
    walk(root);
    var questions = makeQuestions(cand, allSpans, nQ, r);
    var h1s = outline.filter(function (o) { return o.kind === 'h1'; }).map(function (o) { return o.text; });
    var m = { title: opt.title || doc.title, subtitle: h1s.slice(0, 4), outline: outline, numbers: numbers, questions: questions, marked: a.questions.filter(function (q) { return q.marked; }), sourceQuestions: a.questions.length, lowEmphasis: lowEmphasis };
    m.cards = makeCards(m, root, allSpans, r);
    return m;
  }

  // ---------- 플래시카드 ----------
  function cardId(t) { return hash(t).toString(36); }
  function makeCards(m, root, pool, r) {
    var cards = [], seen = {};
    function add(c) { var id = cardId(c.type + c.front); if (seen[id]) return; seen[id] = 1; c.id = id; cards.push(c); }
    function visit(n) {
      var path = [], tp = '';
      for (var x = n; x && x.level; x = x.parent) { path.unshift(x.text); if (x.level === 2) tp = x.text; else if (x.level === 1 && !tp) tp = x.text; }
      tp = tp || '기타';
      n.items.forEach(function (it) {
        var s = it.s, sp = it.spans.filter(function (x) { return termLike(x.text) && x.text.length < s.text.length * 0.7; });
        // 용어 카드: "A는/은/이란 ~" 처럼 강조된 용어로 시작하는 문장
        var def = /^(.{2,24}?)(?:은|는|이란|란|이라 함은|:)\s+(.{6,})$/.exec(s.text);
        if (def && it.spans.some(function (x) { return x.start === 0 || s.text.indexOf(x.text) === 0; }) && termLike(def[1].replace(TRIM, ''))) {
          add({ type: '용어', path: path, topic: tp, page: s.page, front: def[1].replace(TRIM, ''), prompt: '무엇인가요?', back: s.text, answer: def[1].replace(TRIM, '') });
        }
        // 빈칸 카드: 형광펜 우선, 수치는 '수치' 카드
        sp.sort(function (x, y) { return (y.hl - x.hl) || (y.text.length - x.text.length); });
        sp.slice(0, 2).forEach(function (x) {
          var blank = s.text.slice(0, x.start) + '［ ? ］' + s.text.slice(x.start + x.text.length);
          add({ type: /\d/.test(x.text) ? '수치' : '빈칸', path: path, topic: tp, page: s.page, front: blank, prompt: '빈칸에 들어갈 말은?', back: s.text, answer: x.text, hl: x.hl, ink: s.ink });
        });
        if (!sp.length && (s.ink || UNIT.test(s.text))) add({ type: '요점', path: path, topic: tp, page: s.page, front: (path[path.length - 1] || '핵심 내용') + ' — 기억나는 내용은?', prompt: '떠올린 뒤 뒤집어 보세요', back: s.text, answer: '' });
      });
      n.children.forEach(visit);
    }
    visit(root);
    m.questions.forEach(function (q) {
      add({ type: '문제', path: q.path || [], topic: q.topic || '기타', page: q.page, front: q.stem + '\n' + q.quote, options: q.type === 'mcq' ? q.options : ['O', 'X'], prompt: '정답을 골라 보세요', answerIndex: q.type === 'mcq' ? q.answer : (q.answer === 'O' ? 0 : 1), answer: q.type === 'mcq' ? CIRCLE[q.answer] + ' ' + q.answerText : q.answer + ' · ' + q.answerText, back: q.source });
    });
    m.marked.forEach(function (q) {
      add({ type: '표시한 문항', path: q.section ? [q.section] : [], topic: '표시한 문항', page: q.page, front: q.no + '. ' + q.stem, options: q.options.map(function (o) { return o.text; }), marks: q.options.map(function (o) { return o.ink; }), prompt: '원본에서 펜으로 표시한 문항이에요', answer: '', back: '정답은 교재·정답표로 확인하세요. ✎ 표시는 원본에 체크·동그라미가 있던 보기예요.' });
    });
    return cards;
  }

  // 숫자 바꾸기 (오답 보기 · 틀린 OX 문장용)
  function numberVariants(text, r) {
    var NUM = /(^|[^A-Za-z0-9.])(\d+(?:\.\d+)?)(?![A-Za-z]*\d)/g, nums = [], m0;
    while ((m0 = NUM.exec(text))) nums.push(m0[2]);
    var out = [];
    if (!nums.length) return out;
    var factors = [0.5, 0.75, 1.25, 1.5, 2], deltas = [-10, -5, -2, -1, 1, 2, 5, 10];
    for (var tries = 0; tries < 40 && out.length < 8; tries++) {
      var idx = Math.floor(r() * nums.length), n = nums[idx], v = parseFloat(n), dec = (n.split('.')[1] || '').length, nv;
      if (r() < 0.5) nv = v * factors[Math.floor(r() * factors.length)]; else nv = v + deltas[Math.floor(r() * deltas.length)] * (v >= 50 ? 2 : v >= 10 ? 1 : 0.5);
      if (nv <= 0) continue;
      nv = dec ? nv.toFixed(dec) : String(Math.round(nv >= 20 ? Math.round(nv / 5) * 5 : nv));
      if (nv === n) continue;
      var k = -1, rep = text.replace(/(^|[^A-Za-z0-9.])(\d+(?:\.\d+)?)(?![A-Za-z]*\d)/g, function (m, pre, num) { k++; return k === idx ? pre + nv : m; });
      // 범위(24~28)는 앞이 뒤보다 작아야 한다
      var badRange = false; rep.replace(/(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)/g, function (m, x, y) { if (parseFloat(x) >= parseFloat(y)) badRange = true; return m; });
      if (!badRange && rep !== text && out.indexOf(rep) < 0) out.push(rep);
    }
    return out;
  }
  function distractors(ans, section, pool, sentence, r) {
    if (/\d/.test(ans.text)) return numberVariants(ans.text, r).slice(0, 4);
    var seen = {}, list = [];
    seen[ans.text] = 1;
    pool.forEach(function (p) {
      if (p.numeric || seen[p.text] || !termLike(p.text)) return;
      if (sentence.indexOf(p.text) >= 0 || p.text.indexOf(ans.text) >= 0 || ans.text.indexOf(p.text) >= 0) return;
      seen[p.text] = 1;
      var w = (p.section === section ? 3 : 0) + (Math.abs(p.text.length - ans.text.length) <= 4 ? 2 : 0) + r();
      list.push({ t: p.text, w: w });
    });
    list.sort(function (x, y) { return y.w - x.w; });
    return list.slice(0, 4).map(function (x) { return x.t; });
  }
  function makeQuestions(cand, pool, n, r) {
    cand.sort(function (x, y) { return y.score - x.score || x.s.page - y.s.page; });
    var used = {}, usedSent = {}, picked = [];
    cand.forEach(function (c) {
      if (picked.length >= n || used[c.span.text] || (usedSent[c.s.text] || 0) >= 1) return;
      used[c.span.text] = 1; usedSent[c.s.text] = (usedSent[c.s.text] || 0) + 1; picked.push(c);
    });
    // 원래 순서(페이지·문단)대로 문제를 배치
    picked.sort(function (x, y) { return x.s.order - y.s.order; });
    var out = [];
    picked.forEach(function (c, i) {
      var s = c.s.text, ans = c.span, ds = distractors(ans, c.section, pool, s, r);
      var blank = s.slice(0, ans.start) + '(          )' + s.slice(ans.start + ans.text.length);
      if (ds.length >= 4 && i % 4 !== 3) {
        var opts = shuffle([ans.text].concat(ds), r);
        out.push({ type: 'mcq', path: c.s.path, topic: c.s.topic, section: c.section, page: c.s.page, stem: '다음 설명의 빈칸에 들어갈 내용으로 옳은 것은?', quote: blank, options: opts, answer: opts.indexOf(ans.text), answerText: ans.text, source: s });
      } else {
        var wrong = ds[0] && r() < 0.55, stmt = wrong ? s.slice(0, ans.start) + ds[0] + s.slice(ans.start + ans.text.length) : s;
        out.push({ type: 'ox', path: c.s.path, topic: c.s.topic, section: c.section, page: c.s.page, stem: '다음 설명이 옳으면 O, 틀리면 X를 고르시오.', quote: stmt, answer: wrong ? 'X' : 'O', answerText: wrong ? ans.text + ' (틀린 부분: ' + ds[0] + ')' : '옳은 설명', source: s });
      }
    });
    return out;
  }

  // ---------- 화면·문서 (A4 세로, 학습 자료 형식) ----------
  function sentenceHtml(it) {
    var s = it.s, html = '', i = 0;
    var marks = it.spans.slice().sort(function (x, y) { return x.start - y.start; });
    marks.forEach(function (m) {
      if (m.start < i) return;
      html += esc(s.text.slice(i, m.start));
      html += m.hl ? '<mark><b>' + esc(m.text) + '</b></mark>' : '<b>' + esc(m.text) + '</b>';
      i = m.start + m.text.length;
    });
    html += esc(s.text.slice(i));
    return (s.ink ? '<span class=pen title="필기한 부분">✎</span>' : '') + html;
  }
  var CSS = "@page{size:210mm 297mm;margin:16mm 16mm 18mm}" +
    "body{font-family:'Noto Sans KR','Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif;color:#222;font-size:10.5pt;line-height:1.85;margin:0}" +
    ".wrap{max-width:760px;margin:0 auto;padding:0 6px}" +
    ".cover{text-align:center;padding:180px 0 120px;page-break-after:always}.cover h1{color:#7b1f3c;font-size:26pt;line-height:1.4;margin:0}" +
    ".cover .sub{color:#444;font-size:12pt;margin-top:22px;line-height:1.8}.cover .toc{color:#444;font-size:11.5pt;margin-top:48px}" +
    ".bar{background:#7b1f3c;color:#fff;font-weight:800;font-size:15pt;padding:9px 16px;border-radius:5px;margin:26px 0 12px}" +
    ".sec{background:#f5e1e8;color:#7b1f3c;font-weight:800;font-size:13.5pt;padding:8px 16px;margin:18px 0 8px}" +
    "h3{color:#7b1f3c;font-size:12pt;margin:16px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #e7c3cf}" +
    "p.pt{margin:0 0 6px;text-align:justify}b{color:#7b1f3c}mark{background:#fff3a0;padding:0 1px}" +
    ".pen{color:#d62b2b;font-weight:700;margin-right:4px}" +
    ".callout{background:#fdf6d9;border-left:4px solid #e0a800;padding:9px 14px;margin:8px 0 12px;font-size:10pt}" +
    ".q{margin:12px 0 4px;font-weight:700}.quote{background:#f7f7f9;border-radius:6px;padding:7px 12px;margin:4px 0 6px;font-weight:400}.bl{display:inline-block;min-width:88px;border-bottom:1.5px solid #7b1f3c;margin:0 3px;height:1.1em;vertical-align:-2px}.opt{margin-left:14px}" +
    "table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #e7c3cf;padding:8px 10px;vertical-align:top;font-size:10pt}" +
    "th{background:#f5e1e8;color:#7b1f3c;text-align:left}td.c{text-align:center;color:#7b1f3c;font-weight:700;width:52px}" +
    ".ans{color:#7b1f3c;font-weight:700}.src{color:#555}.small{color:#888;font-size:9pt}.pb{page-break-before:always}" +
    "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}";

  function html(m, opt) {
    opt = opt || {};
    var o = [], qi = 0;
    o.push('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(m.title) + '</title><style>' + CSS + '</style></head><body><div class=wrap>');
    var parts = ['요점정리', '핵심 수치', '지식확인 문제', '정답표'];
    if (m.marked.length) parts.push('표시한 문항');
    o.push('<div class=cover><h1>' + esc(m.title) + '</h1>' + (m.subtitle.length ? '<div class=sub>' + m.subtitle.map(esc).join('<br>') + '</div>' : '') + '<div class=toc>' + parts.join(' · ') + '</div></div>');
    // 요점정리
    m.outline.forEach(function (b) {
      if (b.kind === 'h1') o.push('<div class=bar>' + esc(b.text) + '</div>');
      else if (b.kind === 'h2') o.push('<div class=sec>' + esc(b.text) + '</div>');
      else if (b.kind === 'h3') o.push('<h3>' + esc(b.text) + '</h3>');
      else if (b.kind === 'points') {
        b.items.forEach(function (it) { o.push('<p class=pt>' + sentenceHtml(it) + '</p>'); });
        if (b.callout.length) o.push('<div class=callout>' + b.callout.map(esc).join(' &nbsp;·&nbsp; ') + '</div>');
      }
    });
    // 핵심 수치 모아보기
    if (m.numbers.length) {
      o.push('<div class="bar pb">핵심 수치</div><table><tr><th style="width:34%">항목</th><th>수치</th></tr>');
      var bySec = {}, order = [];
      m.numbers.forEach(function (n) { if (!bySec[n.section]) { bySec[n.section] = []; order.push(n.section); } bySec[n.section].push(n.text); });
      order.forEach(function (k) { o.push('<tr><td><b>' + esc(k || '-') + '</b></td><td>' + bySec[k].map(esc).join('<br>') + '</td></tr>'); });
      o.push('</table>');
    }
    // 지식확인 문제 (단원별 유형)
    if (m.questions.length) {
      o.push('<div class="bar pb">지식확인 문제</div>');
      var type = 0, last = null;
      m.questions.forEach(function (q) {
        if (q.section !== last) { type++; last = q.section; o.push('<div class=sec>유형 ' + type + '. ' + esc(q.section || '본문') + ' <span class=small>(p.' + q.page + ')</span></div>'); }
        qi++;
        o.push('<div class=q>' + qi + '. ' + esc(q.stem) + '</div><div class=quote>' + esc(q.quote).replace('(          )', '<span class=bl></span>') + '</div>');
        if (q.type === 'mcq') q.options.forEach(function (x, k) { o.push('<div class=opt>' + CIRCLE[k] + ' ' + esc(x) + '</div>'); });
        else o.push('<div class=opt>① O &nbsp;&nbsp; ② X</div>');
      });
      // 정답표
      o.push('<div class="bar pb">정답표</div><table><tr><th style="width:52px">번호</th><th style="width:52px">정답</th><th>해설</th></tr>');
      m.questions.forEach(function (q, k) {
        var a = q.type === 'mcq' ? CIRCLE[q.answer] : q.answer;
        o.push('<tr><td class=c>' + (k + 1) + '</td><td class=c>' + a + '</td><td><div class=ans>' + esc(q.answerText) + '</div><div class=src>' + esc(q.source) + ' <span class=small>(p.' + q.page + ')</span></div></td></tr>');
      });
      o.push('</table>');
    }
    // 내가 표시한 문항 (원본 문제 중 펜으로 체크·동그라미·X 한 것)
    if (m.marked.length) {
      o.push('<div class="bar pb">표시한 문항 다시 보기</div><p class=small>원본에서 펜으로 체크·동그라미·X 표시를 한 문항이에요. ✎ 는 표시가 있던 보기예요.</p>');
      m.marked.forEach(function (q) {
        o.push('<div class=q>' + q.no + '. ' + esc(q.stem) + ' <span class=small>(p.' + q.page + (q.section ? ' · ' + esc(q.section) : '') + ')</span></div>');
        q.options.forEach(function (x) { o.push('<div class=opt>' + (x.ink ? '<span class=pen>✎</span>' : '') + x.mark + ' ' + esc(x.text) + '</div>'); });
      });
    }
    o.push('<p class=small style="margin-top:28px">※ 형광펜·강조 글씨·필기를 바탕으로 자동으로 만든 자료예요. 문제와 해설은 교재로 꼭 확인하세요.</p></div></body></html>');
    return o.join('');
  }
  // ChatGPT·Claude 앱에 붙여넣을 요청문 (사례기반 문제·요약 보완)
  function prompt(m) {
    var pts = [];
    m.outline.forEach(function (b) {
      if (b.kind === 'h1' || b.kind === 'h2' || b.kind === 'h3') pts.push((b.kind === 'h1' ? '# ' : b.kind === 'h2' ? '## ' : '### ') + b.text);
      else if (b.kind === 'points') b.items.forEach(function (it) { pts.push('- ' + it.s.text); });
    });
    return '너는 간호학과 교수다. 아래는 내가 형광펜·필기로 표시한 학습 내용이다. 이 내용만 근거로 다음을 한국어로 만들어 줘.\n' +
      '1. 요점정리: 단원별로 핵심 문장을 간결하게 다시 정리 (핵심 수치는 따로 모아서)\n' +
      '2. 사례기반 문제: 간호사 국가고시 형식의 5지선다 사례 문제 ' + Math.max(5, Math.round(m.questions.length / 3)) + '개 (대상자 사례 제시 → 질문 → ①~⑤)\n' +
      '3. 정답표: 번호 | 정답 | 해설 (해설은 1~2문장)\n' +
      '규칙: 아래 내용에 없는 사실은 지어내지 말 것. 마크다운 표 대신 줄글로 쓸 것.\n\n[학습 내용]\n' + pts.join('\n');
  }

  root.Study = { build: build, html: html, prompt: prompt, analyse: analyse, sentences: sentences, spans: spans, headKey: headKey };
})(typeof window !== 'undefined' ? window : globalThis);
