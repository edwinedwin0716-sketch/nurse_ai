// 파일에서 글자와 강조(형광펜·색 글씨·굵은 글씨·펜 필기)를 뽑는다. 인터넷·API 사용 없음.
// 결과: { title, units: [{type:'heading', level, text, page} | {type:'para', page, text, flags:[{hl,col,bold}], ink}] }
(function (root) {
  'use strict';

  // ---------- 공통 ----------
  function isHangul(c) { return c >= '가' && c <= '힣'; }
  function headingLike(t) {
    return t.length <= 60 && /^(제?\s*\d+\s*(장|절)|\d+(-\d+)*\.\s|[IVX]+\.\s|유형\s*\d+|[가-하]\.\s|\[[^\]]+\]$|■|▶)/.test(t);
  }
  function para(page, runs, ink) {
    var text = '', flags = [];
    runs.forEach(function (r) {
      for (var i = 0; i < r.text.length; i++) { text += r.text[i]; flags.push({ hl: !!r.hl, col: !!r.col, bold: !!r.bold, ink: !!ink }); }
    });
    return { type: 'para', page: page, text: text, flags: flags, ink: !!ink };
  }

  // ---------- PDF ----------
  // 노랑·초록·분홍 등 밝고 채도 높은 색 = 형광펜
  function isHighlighter(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx > 200 && mn > 90 && mx - mn > 55 && (r + g + b) / 3 > 165;
  }
  // 밝은 빨강·파랑 펜 (인쇄된 진한 자주색 글씨와 구분)
  function isPen(r, g, b) {
    return (r > 185 && g < 120 && b < 120) || (b > 170 && r < 90 && g < 140 && b - r > 90);
  }
  function inkColor(r, g, b) { // 글자 색: 어둡거나 진한 색
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = (r + g + b) / 3;
    if (lum > 170) return 0;              // 바탕
    return mx - mn > 55 ? 2 : 1;          // 2 = 색 글씨, 1 = 검정·회색
  }

  async function pdf(data, onProgress) {
    var lib = root.pdfjsLib;
    var doc = await lib.getDocument({ data: data, cMapPacked: true, CMapReaderFactory: root.EmbeddedCMapFactory, useSystemFonts: true, isEvalSupported: false }).promise;
    var units = [], sizes = [], pages = [];
    // 스캔·사진 PDF(글자 정보 없음)는 앞쪽 몇 장만 보고 바로 알려 준다
    var anyText = false;
    for (var t0 = 1; t0 <= Math.min(5, doc.numPages) && !anyText; t0++) { var c0 = await (await doc.getPage(t0)).getTextContent(); anyText = c0.items.some(function (it) { return it.str && it.str.trim(); }); }
    if (!anyText) return { title: '', units: [], pages: doc.numPages, textless: true };
    for (var p = 1; p <= doc.numPages; p++) {
      if (onProgress) onProgress(p, doc.numPages);
      var page = await doc.getPage(p);
      var scale = 1.5, vp = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, annotationMode: lib.AnnotationMode ? lib.AnnotationMode.ENABLE : 1 }).promise;
      var img = ctx.getImageData(0, 0, canvas.width, canvas.height).data, W = canvas.width, H = canvas.height;
      var tc = await page.getTextContent();
      var annots = [];
      try { annots = (await page.getAnnotations()).filter(function (a) { return /Highlight|Underline|Squiggly/.test(a.subtype) && a.quadPoints; }); } catch (e) { }

      // 글자 조각 → 화면 좌표
      var items = [];
      tc.items.forEach(function (it) {
        if (!it.str) return;
        var t = lib.Util.transform(vp.transform, it.transform);
        var h = Math.hypot(t[2], t[3]) || 10, w = it.width * scale;
        if (w <= 0) w = h * 0.5 * it.str.length;
        var bold = false;
        try { var f = page.commonObjs.get(it.fontName); bold = /bold|black|heavy|semibold|extrab/i.test((f && (f.name || f.loadedName)) || ''); } catch (e) { }
        items.push({ str: it.str, x: t[4], y: t[5], w: w, h: h, bold: bold, eol: it.hasEOL });
      });
      // 펜 자국 위치 (행별 개수)
      var penRows = new Int32Array(H);
      for (var y = 0; y < H; y += 1) for (var x = 0; x < W; x += 2) { var k = (y * W + x) * 4; if (isPen(img[k], img[k + 1], img[k + 2])) penRows[y]++; }

      // 글자마다 형광펜/색 글씨 판정 (글자 칸 안의 픽셀을 본다)
      items.forEach(function (it) {
        it.flags = [];
        var n = it.str.length, cw = it.w / n;
        for (var i = 0; i < n; i++) {
          var x0 = Math.max(0, Math.floor(it.x + i * cw)), x1 = Math.min(W - 1, Math.ceil(it.x + (i + 1) * cw));
          var y0 = Math.max(0, Math.floor(it.y - it.h * 0.95)), y1 = Math.min(H - 1, Math.ceil(it.y + it.h * 0.2));
          var hl = 0, tot = 0, colored = 0, dark = 0;
          for (var yy = y0; yy <= y1; yy += 2) for (var xx = x0; xx <= x1; xx += 2) {
            var q = (yy * W + xx) * 4, r = img[q], g = img[q + 1], b = img[q + 2]; tot++;
            if (isHighlighter(r, g, b)) hl++;
            var c = inkColor(r, g, b); if (c === 2 && !isPen(r, g, b)) colored++; if (c) dark++;
          }
          var cx = it.x + (i + 0.5) * cw, cy = it.y - it.h * 0.4, inAnnot = false;
          annots.forEach(function (a) { // 형광펜 주석(quadPoints)
            for (var j = 0; j + 7 < a.quadPoints.length; j += 8) {
              var pts = [lib.Util.applyTransform([a.quadPoints[j], a.quadPoints[j + 1]], vp.transform), lib.Util.applyTransform([a.quadPoints[j + 6], a.quadPoints[j + 7]], vp.transform)];
              if (cx >= Math.min(pts[0][0], pts[1][0]) && cx <= Math.max(pts[0][0], pts[1][0]) && cy >= Math.min(pts[0][1], pts[1][1]) && cy <= Math.max(pts[0][1], pts[1][1])) inAnnot = true;
            }
          });
          it.flags.push({ hl: inAnnot || (tot > 0 && hl / tot > 0.18), col: dark > 2 && colored / dark > 0.4, bold: it.bold });
        }
      });

      // 줄 만들기 (기준선이 비슷한 조각끼리)
      items.sort(function (a, b) { return Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.5 ? a.x - b.x : a.y - b.y; });
      var lines = [];
      items.forEach(function (it) {
        var L = lines[lines.length - 1];
        if (L && Math.abs(L.y - it.y) < Math.min(L.h, it.h) * 0.5) {
          var gap = it.x - L.right;
          if (gap > it.h * 0.22 && !/\s$/.test(L.text) && !/^\s/.test(it.str)) { L.text += ' '; L.flags.push({ hl: false, col: false, bold: false }); }
          L.text += it.str; L.flags = L.flags.concat(it.flags); L.right = Math.max(L.right, it.x + it.w); L.h = Math.max(L.h, it.h);
        } else lines.push({ y: it.y, x: it.x, h: it.h, right: it.x + it.w, text: it.str, flags: it.flags.slice(), endSpace: false });
      });
      lines.forEach(function (L) {
        var a = Math.max(0, Math.floor(L.y - L.h * 1.3)), b = Math.min(H - 1, Math.ceil(L.y + L.h * 0.7)), cnt = 0;
        for (var y2 = a; y2 <= b; y2++) cnt += penRows[y2];
        L.ink = cnt > 18;
        if (L.ink) L.flags = L.flags.map(function (f) { return { hl: f.hl, col: f.col, bold: f.bold, ink: true }; });
        L.endSpace = /\s$/.test(L.text);
        sizes.push(L.h);
      });
      pages.push({ p: p, lines: lines, right: Math.max.apply(null, lines.map(function (l) { return l.right; }).concat([0])) });
      page.cleanup();
    }
    var sorted = sizes.slice().sort(function (a, b) { return a - b; }), body = sorted[Math.floor(sorted.length / 2)] || 12;
    var bigs = sizes.filter(function (s) { return s > body * 1.18; }).sort(function (a, b) { return b - a; });
    pages.forEach(function (pg) {
      var cur = null;
      pg.lines.forEach(function (L, i) {
        var t = L.text.trim(); if (!t) return;
        var big = L.h > body * 1.18, emph = L.flags.filter(function (f) { return f.col || f.bold; }).length > t.length * 0.6;
        if (((big && t.length <= 60) || (headingLike(t) && (emph || big))) && !/[①②③④⑤]/.test(t) && !/\?\s*$/.test(t)) {
          var level = big ? (L.h >= (bigs[0] || 0) * 0.97 ? 1 : 2) : 3;
          if (/^\d+-\d+/.test(t)) level = 3; else if (/^\d+\.\s/.test(t) && !big) level = 2;
          if (/^(제\s*)?\d+\s*(장|절|단원|강)(\s|$)/.test(t)) level = 1;
          units.push({ type: 'heading', level: level, text: t, page: pg.p }); cur = null; return;
        }
        var prev = pg.lines[i - 1];
        var newPara = !cur || !prev || (L.y - prev.y) > Math.max(L.h, prev.h) * 2.1 || /^[①②③④⑤]/.test(t) || /^\d+\.\s/.test(t) || Math.abs(L.x - prev.x) > L.h * 1.5 && L.x > prev.x;
        if (newPara) { cur = { type: 'para', page: pg.p, text: '', flags: [], ink: false }; units.push(cur); }
        else {
          var last = cur.text.slice(-1), first = L.text.charAt(0);
          if (!(isHangul(last) && isHangul(first) && !prev.endSpace)) { cur.text += ' '; cur.flags.push({ hl: false, col: false, bold: false }); }
        }
        cur.text += L.text; cur.flags = cur.flags.concat(L.flags); cur.ink = cur.ink || L.ink;
      });
    });
    var info = {}; try { info = (await doc.getMetadata()).info || {}; } catch (e) { }
    return { title: info.Title || '', units: tidy(units), pages: doc.numPages, textless: sizes.length === 0 };
  }
  function tidy(units) {
    return units.map(function (u) {
      if (u.type !== 'para') return u;
      var t = u.text.replace(/\s+/g, ' '); // 공백 정리 (flags 길이 맞추기)
      if (t === u.text) return u;
      var text = '', flags = [], prevSpace = false;
      for (var i = 0; i < u.text.length; i++) {
        var c = /\s/.test(u.text[i]) ? ' ' : u.text[i];
        if (c === ' ' && (prevSpace || !text)) continue;
        text += c; flags.push(u.flags[i]); prevSpace = c === ' ';
      }
      return { type: 'para', page: u.page, text: text.trim(), flags: flags.slice(0, text.trim().length), ink: u.ink };
    }).filter(function (u) { return u.text && u.text.trim(); });
  }

  // ---------- Word (.docx) ----------
  function attr(el, name) { if (!el) return null; for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (a.localName === name || a.name === name) return a.value; } return null; }
  function kids(el, name) { var out = []; if (!el) return out; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) out.push(c); return out; }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function all(el, name) { return Array.prototype.filter.call(el.getElementsByTagName('*'), function (e) { return e.localName === name; }); }
  function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function coloredHex(v) { if (!v || v === 'auto') return false; v = v.replace('#', '').toLowerCase(); if (!/^[0-9a-f]{6}$/.test(v)) return false; var r = parseInt(v.substr(0, 2), 16), g = parseInt(v.substr(2, 2), 16), b = parseInt(v.substr(4, 2), 16); return Math.max(r, g, b) - Math.min(r, g, b) > 55; }

  async function docx(data) {
    var zip = await root.JSZip.loadAsync(data), d = xml(await zip.file('word/document.xml').async('string'));
    var units = [];
    all(d, 'p').forEach(function (p) {
      var ppr = kid(p, 'pPr'), style = attr(kid(ppr, 'pStyle'), 'val') || '', outline = attr(kid(ppr, 'outlineLvl'), 'val');
      var runs = [];
      all(p, 'r').forEach(function (r) {
        var rpr = kid(r, 'rPr'), text = all(r, 't').map(function (t) { return t.textContent; }).join('') + (kid(r, 'tab') ? ' ' : '');
        if (!text) return;
        var hl = !!kid(rpr, 'highlight') && attr(kid(rpr, 'highlight'), 'val') !== 'none';
        var shd = attr(kid(rpr, 'shd'), 'fill'); if (shd && coloredHex(shd)) hl = true;
        var b = kid(rpr, 'b'), u = kid(rpr, 'u');
        runs.push({ text: text, hl: hl, col: coloredHex(attr(kid(rpr, 'color'), 'val')), bold: (b && attr(b, 'val') !== '0' && attr(b, 'val') !== 'false') || (u && attr(u, 'val') !== 'none') });
      });
      var text = runs.map(function (r) { return r.text; }).join('').trim(); if (!text) return;
      var m = /heading\s*(\d)|제목\s*(\d)/i.exec(style), level = m ? +(m[1] || m[2]) : (outline != null ? +outline + 1 : 0);
      if (/^title$/i.test(style)) level = 1;
      if (level) units.push({ type: 'heading', level: Math.min(level, 3), text: text, page: 1 }); else units.push(para(1, runs, false));
    });
    return { title: '', units: tidy(units) };
  }

  // ---------- PowerPoint (.pptx) ----------
  async function pptx(data) {
    var zip = await root.JSZip.loadAsync(data);
    var names = Object.keys(zip.files).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
      .sort(function (a, b) { return +a.match(/\d+/)[0] - +b.match(/\d+/)[0]; });
    var units = [];
    for (var s = 0; s < names.length; s++) {
      var d = xml(await zip.file(names[s]).async('string'));
      all(d, 'sp').forEach(function (sp) {
        var ph = all(sp, 'ph')[0], type = attr(ph, 'type') || '', isTitle = /title/i.test(type);
        all(sp, 'p').forEach(function (p) {
          var runs = [];
          kids(p, 'r').concat(kids(p, 'fld')).forEach(function (r) {
            var rpr = kid(r, 'rPr'), t = kid(r, 't'); if (!t || !t.textContent) return;
            var fill = kid(rpr, 'solidFill'), clr = fill && kid(fill, 'srgbClr');
            runs.push({ text: t.textContent, hl: !!kid(rpr, 'highlight'), col: coloredHex(attr(clr, 'val')), bold: attr(rpr, 'b') === '1' || (attr(rpr, 'u') && attr(rpr, 'u') !== 'none') });
          });
          var text = runs.map(function (r) { return r.text; }).join('').trim(); if (!text) return;
          if (isTitle) units.push({ type: 'heading', level: 2, text: text, page: s + 1 }); else units.push(para(s + 1, runs, false));
        });
      });
    }
    return { title: '', units: tidy(units), pages: names.length };
  }

  // ---------- 한글 (.hwpx) ----------
  async function hwpx(data) {
    var zip = await root.JSZip.loadAsync(data), chars = {};
    var head = zip.file('Contents/header.xml');
    if (head) all(xml(await head.async('string')), 'charPr').forEach(function (c) {
      chars[attr(c, 'id')] = { bold: !!kid(c, 'bold') || !!kid(c, 'underline') && attr(kid(c, 'underline'), 'type') !== 'NONE', col: coloredHex(attr(c, 'textColor')), hl: coloredHex(attr(c, 'shadeColor')) && attr(c, 'shadeColor') !== 'none' };
    });
    var sections = Object.keys(zip.files).filter(function (n) { return /^Contents\/section\d+\.xml$/.test(n); }).sort();
    var units = [];
    for (var s = 0; s < sections.length; s++) {
      var d = xml(await zip.file(sections[s]).async('string'));
      all(d, 'p').forEach(function (p) {
        var runs = [], marking = false;
        kids(p, 'run').forEach(function (r) {
          var cp = chars[attr(r, 'charPrIDRef')] || {};
          for (var c = r.firstElementChild; c; c = c.nextElementSibling) {
            if (c.localName !== 't') continue;
            for (var n = c.firstChild; n; n = n.nextSibling) {
              if (n.nodeType === 3) runs.push({ text: n.nodeValue, hl: marking || cp.hl, col: cp.col, bold: cp.bold });
              else if (n.localName === 'markpenBegin') marking = true;
              else if (n.localName === 'markpenEnd') marking = false;
              else if (n.localName === 'tab') runs.push({ text: ' ' });
            }
          }
        });
        var text = runs.map(function (r) { return r.text; }).join('').trim(); if (!text) return;
        var allEmph = runs.every(function (r) { return r.bold || r.col || !r.text.trim(); });
        if (headingLike(text) && allEmph) units.push({ type: 'heading', level: /^\d+-\d+/.test(text) ? 3 : 2, text: text, page: 1 });
        else units.push(para(1, runs, false));
      });
    }
    return { title: '', units: tidy(units) };
  }

  async function file(f, onProgress) {
    var name = f.name || '', ext = name.split('.').pop().toLowerCase(), data = await f.arrayBuffer();
    var out;
    if (ext === 'pdf') out = await pdf(new Uint8Array(data), onProgress);
    else if (ext === 'docx') out = await docx(data);
    else if (ext === 'pptx') out = await pptx(data);
    else if (ext === 'hwpx') out = await hwpx(data);
    else if (ext === 'hwp') throw new Error('HWP(옛 한글 형식)는 바로 읽을 수 없어요. 한글에서 [다른 이름으로 저장 → HWPX] 또는 PDF로 저장해서 올려 주세요.');
    else if (ext === 'ppt' || ext === 'doc') throw new Error('옛 형식(.' + ext + ')이에요. PowerPoint/Word에서 .' + ext + 'x 또는 PDF로 저장해서 올려 주세요.');
    else throw new Error('PDF, PPTX, DOCX, HWPX 파일을 올려 주세요.');
    out.fileName = name.replace(/\.[^.]+$/, '');
    if (!out.title) out.title = out.fileName;
    return out;
  }

  root.Extract = { file: file, pdf: pdf, docx: docx, pptx: pptx, hwpx: hwpx };
})(typeof window !== 'undefined' ? window : globalThis);
