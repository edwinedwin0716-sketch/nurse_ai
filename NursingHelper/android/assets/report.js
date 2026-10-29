// 제출 양식(학교 간호과정 보고서) 모양: 표지 + 진단마다 '▪간호과정' 표(사정 / 간호계획 및 수행 / 합리적 근거 / 간호평가).
// 같은 모양을 한글(.hwpx)·Word(.doc)·인쇄로 낸다. Windows판(src/HwpxReport.cs)과 같은 규칙을 지킨다.
(function (root) {
  var N = root.Nursing;
  var FONT = '맑은 고딕', BLANK = '#c06000';
  var mm = function (x) { return Math.round(x * 7200 / 25.4); };       // mm → HWPUNIT
  var PAD = [141, 141, 141, 141];                                      // 칸 안쪽 여백 0.5mm
  var LINE = '0.12mm solid #000000';
  var BORDER = { l: LINE, r: LINE, t: LINE, b: LINE };

  function R(text, o) {
    o = o || {};
    return { t: 'text', text: text, cs: { font: FONT, size: o.size || 9, bold: !!o.bold, color: o.color || '#000000' } };
  }
  function P(runs, o) {
    o = o || {};
    var p = { t: 'p', align: o.align || 'justify', left: 0, right: 0, indent: 0, before: 0, after: 0, lsType: 'PERCENT', ls: o.ls || 160, style: '바탕글', runs: runs };
    if (o.pageBreak) p.pageBreak = true;
    return p;
  }
  var T = function (text, o) { return P([R(text, o)], o); };            // 글자 한 덩이 문단
  var B = function (text) { return T(text, { bold: true }); };          // 굵은 소제목
  var GAP = function () { return P([R('')]); };
  var HINT = function (text, o) { return P([R(text, { color: BLANK, size: (o && o.size) || 9 })], o); };
  function cell(r, c, w, blocks, o) {
    o = o || {};
    return { r: r, c: c, rs: 1, cs: o.cs || 1, w: mm(w), h: mm(o.h || 6), pad: PAD, border: BORDER, bg: o.bg || null, valign: o.valign || 'middle', blocks: blocks.length ? blocks : [GAP()] };
  }
  function table(rows, cols, w, cells, place) {
    return P([{ t: 'table', rows: rows, cols: cols, w: mm(w), pad: PAD, cells: cells, place: place || null }]);
  }

  function cover(c) {
    var out = [];
    out.push(T(c.subject || '', { size: 16, bold: true, align: 'left' }));
    for (var i = 0; i < 3; i++) out.push(GAP());
    out.push(T(c.title || '', { size: 20, bold: true, align: 'center' }));
    for (i = 0; i < 5; i++) out.push(GAP());
    var rows = [['실습장소', c.place], ['제 출 일', c.date], ['담당교수', c.professor], ['학 번', c.studentNo], ['성 명', c.author]];
    var cells = [];
    rows.forEach(function (row, r) {
      cells.push(cell(r, 0, 40, [T(row[0], { size: 12, align: 'center' })], { h: 10 }));
      cells.push(cell(r, 1, 79, [T(row[1] || '', { size: 12, align: 'center' })], { h: 10 }));
    });
    out.push(table(5, 2, 119, cells, { align: 'center', wrap: 'block', x: 0 }));
    for (i = 0; i < 5; i++) out.push(GAP());
    out.push(T(c.school || '', { size: 22, bold: true, align: 'center' }));
    return out;
  }

  // 진단 하나 = 제목 한 줄 + 5줄 표
  function section(sec, k, md) {
    var d = sec.d, label = function (t) { return [T(t, { align: 'center' })]; };
    var page = d.page ? 'p.' + d.page : 'p.____';
    var head = [P([R('간호진단 ' + k + ' '), R(d.statement, { bold: true })]),
      P([R('(' + d.name + ' : ', { size: 6 }), R('정의는 별책 부록 8, ' + page + '에서 옮겨 적으세요', { size: 6, color: BLANK }), R(')', { size: 6 })])];
    var assess = [B('주관적 자료')];
    if (sec.s.length) sec.s.forEach(function (x) { assess.push(T(x)); }); else assess.push(HINT('"(대상자가 직접 한 말)"'));
    assess.push(GAP(), B('객관적 자료'));
    if (sec.o.length) sec.o.forEach(function (x) { assess.push(T(x)); }); else assess.push(HINT('(V/S, 검사 결과, 관찰 내용)'));

    var plan = [B('목표'), B('단기목표')];
    d.short.forEach(function (g, i) { plan.push(T((i + 1) + '. ' + g)); });
    plan.push(B('장기목표'), T(d.long), GAP(), B('계획'));
    sec.groups.forEach(function (g) { plan.push(B('(' + g.kind + ')')); g.items.forEach(function (it) { plan.push(T(it.no + ' ' + it.plan)); }); });
    plan.push(GAP(), B('수행'));
    sec.groups.forEach(function (g) {
      plan.push(B('(' + g.kind + ')'));
      g.items.forEach(function (it) { plan.push(T(it.no + ' ' + it.done)); plan.push(HINT('→ ' + md + ' __:__ (수행 결과·대상자 반응을 적으세요)')); });
    });

    var why = [];
    sec.groups.forEach(function (g) {
      why.push(B('(' + g.kind + ')'));
      g.items.forEach(function (it) { why.push(T(it.no + ' ' + it.why)); why.push(HINT('(참고문헌: 저자 외. (연도). 교재명 제_판. 출판사. p.__)', { align: 'left' })); });
    });

    var ev = [B('단기목표')];
    d.short.forEach(function (g, i) { ev.push(T((i + 1) + '. ' + g)); ev.push(HINT('→ 대상자는 __ (결과를 수치로 적으세요) (달성 / 부분 달성 / 미달성)')); });
    ev.push(B('장기목표'), T(d.long), HINT('→ 대상자는 __ (퇴원 시 상태를 적으세요) (달성 / 부분 달성 / 미달성)'));

    var cells = [cell(0, 0, 150, head, { cs: 2, bg: '#cccccc' }),
      cell(1, 0, 30, label('사정(자료수집)')), cell(1, 1, 120, assess),
      cell(2, 0, 30, label('간호계획 및 수행')), cell(2, 1, 120, plan),
      cell(3, 0, 30, label('합리적 근거')), cell(3, 1, 120, why),
      cell(4, 0, 30, label('간호평가')), cell(4, 1, 120, ev)];
    return [T('▪간호과정', { size: 12, bold: true, align: 'left' }), table(5, 2, 150, cells)];
  }

  // 결과 모델 → HWP 편집기 문서 모델 (A4, 왼·오른쪽 30mm, 위 20mm, 아래 15mm, 쪽 번호 아래 가운데)
  function reportDoc(m, cv) {
    var doc = Model.empty();
    doc.page = { w: 59528, h: 84188, ml: mm(30), mr: mm(30), mt: mm(20), mb: mm(15), mh: mm(15), mf: mm(15), gutter: 0 };
    doc.pageNum = 'BOTTOM_CENTER';
    doc.blocks = cv ? cover(cv) : [];
    N.reportSections(m).forEach(function (sec, i) {
      var part = section({ d: sec.d, s: sec.s, o: sec.o, groups: sec.groups.map(function (g) { return { kind: g.title.replace(' 지시', ''), items: g.items }; }) }, i + 1, N.md(m.date));
      if (doc.blocks.length) part[0].pageBreak = true;
      doc.blocks = doc.blocks.concat(part);
    });
    if (!doc.blocks.length) doc.blocks.push(Model.para());
    return doc;
  }
  // 고친 글(모델 없음)은 줄마다 문단으로
  function textDoc(text) {
    var doc = Model.empty();
    doc.blocks = String(text || '').replace(/\n$/, '').split('\n').map(function (ln) {
      return /^■/.test(ln) ? T(ln, { size: 12, bold: true }) : T(ln, { size: 10 });
    });
    return doc;
  }

  function hwpx(m, cv, text) { return Hwpx.write(m ? reportDoc(m, cv) : textDoc(text), { title: (cv && cv.title) || '간호과정' }); }

  // Word(.doc)·인쇄용 HTML: 한글 파일과 같은 문서 모델을 그린다
  function html(m, cv) {
    var doc = reportDoc(m, cv);
    var body = Model.toHtml(doc.blocks, doc, function () { return ''; })
      .replace(/<(p|table)([^>]*?) data-pb="1"/g, '<br clear=all style="page-break-before:always"><$1$2');
    return '<html><head><meta charset="utf-8"><title>간호과정</title><style>@page{size:210mm 297mm;margin:20mm 30mm 15mm}@page Section1{size:210mm 297mm;margin:20mm 30mm 15mm}div.Section1{page:Section1}' +
      "body{font-family:'맑은 고딕','Malgun Gothic','Noto Sans KR',sans-serif;font-size:9pt;color:#000;line-height:1.6}p{margin:0}" +
      'table.tb{border-collapse:collapse;table-layout:fixed}table.tb td{vertical-align:middle}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><div class=Section1>' + body + '</div></body></html>';
  }

  N.reportDoc = reportDoc;
  N.reportHwpx = hwpx;
  N.reportHtml = html;
})(typeof window !== 'undefined' ? window : globalThis);
