// 문서 모델: HWP·HWPX를 읽으면 이 모양이 되고, 편집 화면(HTML)과 서로 바꾼다.
//   doc = { page, header:[문단], footer:[문단], pageNum:'BOTTOM_CENTER'|null, blocks:[문단|표], bins:{key:{data,ext}} }
//   문단 = { t:'p', align, left, right, indent, before, after(HWPUNIT, 1pt=100), lsType, ls, style, outline, pageBreak, runs:[...] }
//   글자 덩이 = {t:'text', text, cs, href} | {t:'tab'} | {t:'br'} | {t:'img', bin, w, h} | {t:'table', ...} | {t:'note', blocks}
//              | {t:'eq', script} | {t:'pagenum'} | {t:'box', w, h, blocks}
//   cs(글자 모양) = { font, size(pt), bold, italic, underline, strike, sup, sub, color, bg, spacing(%), ratio(%) }
'use strict';

const Model = (() => {
  const BASE = { font: '함초롬바탕', size: 10, color: '#000000' };
  const A4 = { w: 59528, h: 84188, ml: 8504, mr: 8504, mt: 5668, mb: 4252, mh: 4252, mf: 4252, gutter: 0 };
  const STYLES = ['바탕글', '본문', '개요 1', '개요 2', '개요 3', '개요 4', '개요 5', '개요 6', '개요 7'];
  const FALLBACK = {
    '함초롬바탕': '"함초롬바탕","HCR Batang","Noto Serif KR","Noto Serif CJK KR",serif',
    '함초롬돋움': '"함초롬돋움","HCR Dotum","Noto Sans KR","Noto Sans CJK KR",sans-serif',
    '바탕': '"바탕",Batang,"Noto Serif KR",serif', '바탕체': '"바탕체",BatangChe,"Noto Serif KR",serif',
    '굴림': '"굴림",Gulim,"Noto Sans KR",sans-serif', '돋움': '"돋움",Dotum,"Noto Sans KR",sans-serif',
    '맑은 고딕': '"맑은 고딕","Malgun Gothic","Noto Sans KR",sans-serif', '궁서': '"궁서",Gungsuh,serif',
  };
  const fontCss = f => FALLBACK[f] || `"${String(f).replace(/"/g, '')}",${/명조|바탕|궁서|serif/i.test(f) ? 'serif' : 'sans-serif'}`;

  const empty = () => ({ page: Object.assign({}, A4), header: [], footer: [], pageNum: null, blocks: [para()], bins: {} });
  function para(text) {
    return { t: 'p', align: 'justify', left: 0, right: 0, indent: 0, before: 0, after: 0, lsType: 'PERCENT', ls: 160, style: '바탕글',
      runs: text ? [{ t: 'text', text, cs: Object.assign({}, BASE) }] : [] };
  }

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pt = hu => +(hu / 100).toFixed(2) + 'pt';

  // ---------- 모델 → HTML ----------
  function csCss(cs, base) {
    base = base || BASE;
    const s = [];
    if (cs.font && cs.font !== base.font) s.push('font-family:' + fontCss(cs.font).replace(/"/g, "'"));
    if (cs.size && Math.abs(cs.size - (base.size || 10)) > 0.01) s.push('font-size:' + cs.size + 'pt');
    if (cs.bold) s.push('font-weight:bold');
    if (cs.italic) s.push('font-style:italic');
    const deco = [cs.underline && 'underline', cs.strike && 'line-through'].filter(Boolean);
    if (deco.length) s.push('text-decoration:' + deco.join(' '));
    if (cs.color && cs.color.toLowerCase() !== '#000000') s.push('color:' + cs.color);
    if (cs.bg && cs.bg.toLowerCase() !== '#ffffff') s.push('background-color:' + cs.bg);
    if (cs.spacing) s.push('letter-spacing:' + (cs.spacing / 100) + 'em');
    return s.join(';');
  }

  function paraCss(p) {
    const s = [];
    if (p.align && p.align !== 'justify') s.push('text-align:' + (p.align === 'distribute' ? 'justify;text-align-last:justify' : p.align));
    const hang = p.indent < 0 ? -p.indent : 0;
    if (p.left || hang) s.push('padding-left:' + pt((p.left || 0) + hang));
    if (p.right) s.push('padding-right:' + pt(p.right));
    if (p.indent) s.push('text-indent:' + pt(p.indent));
    if (p.before) s.push('padding-top:' + pt(p.before));
    if (p.after) s.push('padding-bottom:' + pt(p.after));
    if (p.lsType === 'PERCENT' && p.ls && p.ls !== 160) s.push('line-height:' + (p.ls / 100));
    else if (p.lsType === 'FIXED' || p.lsType === 'AT_LEAST') s.push('line-height:' + pt(p.ls));
    else if (p.lsType === 'BETWEEN_LINES') s.push('line-height:calc(1.2em + ' + pt(p.ls) + ')');
    return s.join(';');
  }

  function runsHtml(runs, ctx) {
    let h = '', link = null;
    for (const r of runs) {
      if (r.t !== 'text' && link) { h += '</a>'; link = null; }
      switch (r.t) {
        case 'text': {
          if ((r.href || null) !== link) { if (link) h += '</a>'; link = r.href || null; if (link) h += `<a href="${esc(link)}">`; }
          let t = esc(r.text);
          const css = csCss(r.cs || {});
          const ratio = r.cs && r.cs.ratio && r.cs.ratio !== 100 ? ` data-ratio="${r.cs.ratio}"` : '';
          if (css || ratio) t = `<span style="${css}"${ratio}>${t}</span>`;
          if (r.cs && r.cs.sup) t = `<sup>${t}</sup>`;
          if (r.cs && r.cs.sub) t = `<sub>${t}</sub>`;
          h += t;
          break;
        }
        case 'tab': h += '\t'; break;
        case 'br': h += '<br>'; break;
        case 'img': {
          const b = ctx.doc.bins[r.bin];
          const url = b ? ctx.url(r.bin, b) : '';
          h += `<img src="${url}" data-bin="${r.bin}" style="width:${pt(r.w)};height:${pt(r.h)}" alt="">`;
          break;
        }
        case 'note': h += `<sup class="fn" contenteditable="false" data-note="${esc(blocksText(r.blocks))}"></sup>`; break;
        case 'eq': h += `<span class="eq" contenteditable="false" data-script="${esc(r.script)}">${esc(r.script)}</span>`; break;
        case 'pagenum': h += '<span class="pgn" contenteditable="false">#</span>'; break;
      }
    }
    if (link) h += '</a>';
    return h;
  }

  function paraHtml(p, ctx) {
    const attrs = [];
    const css = paraCss(p);
    // 빈 문단은 문단 끝 글자 모양으로 높이를 잡는다
    const first = p.runs.find(r => r.t === 'text');
    let extra = '';
    if (first && first.cs) {
      if (first.cs.size && first.cs.size !== 10) extra += ';font-size:' + first.cs.size + 'pt';
    }
    if (css || extra) attrs.push(`style="${(css + extra).replace(/^;/, '')}"`);
    if (p.style && p.style !== '바탕글') attrs.push(`data-style="${esc(p.style)}"`);
    if (p.outline) attrs.push(`data-outline="${p.outline}"`);
    if (p.list) attrs.push(`data-list="${p.list}"`);
    if (p.pageBreak) attrs.push('data-pb="1"');
    const inner = runsHtml(p.runs.filter(r => r.t !== 'table' && r.t !== 'box'), ctx);
    return `<p${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner || '<br>'}</p>`;
  }

  // 문단 안에 표·글상자가 있으면 HTML에서는 문단 밖 블록으로 꺼낸다
  function blocksHtml(blocks, ctx) {
    let h = '';
    for (const b of blocks) {
      if (b.t === 'table') { h += tableHtml(b, ctx); continue; }
      const objs = b.runs.filter(r => r.t === 'table' || r.t === 'box');
      if (!objs.length) { h += paraHtml(b, ctx); continue; }
      const rest = b.runs.filter(r => r.t !== 'table' && r.t !== 'box');
      const hasText = rest.some(r => r.t !== 'text' || r.text.trim());
      let first = true;
      for (const o of objs) {
        let html = o.t === 'table' ? tableHtml(o, ctx) : `<div class="box" style="width:${pt(o.w)}">${blocksHtml(o.blocks, ctx)}</div>`;
        if (o.caption && o.caption.length) html += blocksHtml(o.caption, ctx);
        if (first && b.pageBreak) h += html.replace(/^<(table|div)/, '<$1 data-pb="1"');
        else h += html;
        first = false;
      }
      if (hasText) h += paraHtml(Object.assign({}, b, { runs: rest, pageBreak: false }), ctx);
    }
    return h;
  }

  function tableHtml(t, ctx) {
    const rows = [];
    for (const c of t.cells) (rows[c.r] = rows[c.r] || []).push(c);
    let h = `<table class="tb"${t.w ? ` style="width:${pt(t.w)}"` : ''}><tbody>`;
    const nRows = Math.max(t.rows || 0, rows.length);
    for (let r = 0; r < nRows; r++) {
      h += '<tr>';
      for (const c of (rows[r] || []).sort((a, b) => a.c - b.c)) {
        const s = [];
        if (c.w) s.push('width:' + pt(c.w));
        if (c.h) s.push('height:' + pt(c.h));
        if (c.bg && c.bg.toLowerCase() !== '#ffffff') s.push('background-color:' + c.bg);
        if (c.valign && c.valign !== 'middle') s.push('vertical-align:' + c.valign);
        if (c.border) s.push(`border-left:${c.border.l};border-right:${c.border.r};border-top:${c.border.t};border-bottom:${c.border.b}`);
        h += `<td${c.cs > 1 ? ` colspan="${c.cs}"` : ''}${c.rs > 1 ? ` rowspan="${c.rs}"` : ''} style="${s.join(';')}">${blocksHtml(c.blocks.length ? c.blocks : [para()], ctx)}</td>`;
      }
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }

  function blocksText(blocks) {
    return (blocks || []).map(b => b.t === 'p' ? b.runs.map(r => r.t === 'text' ? r.text : r.t === 'tab' ? '\t' : r.t === 'br' ? '\n' : '').join('') : '').join('\n');
  }

  // ---------- HTML(편집 화면) → 모델 ----------
  const hex = c => {
    const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || '');
    if (!m || (m[4] !== undefined && +m[4] === 0)) return null;
    return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
  };
  const ptOf = v => { const n = parseFloat(v); if (!n) return 0; return /pt$/.test(v) ? n : /mm$/.test(v) ? n * 72 / 25.4 : n * 0.75; };
  const huOf = v => Math.round(ptOf(v) * 100);
  const firstFont = f => (f || '').split(',')[0].trim().replace(/^["']|["']$/g, '');

  function csOf(el, stop, cache) {
    if (cache.has(el)) return cache.get(el);
    const st = getComputedStyle(el);
    const cs = { font: firstFont(st.fontFamily) || BASE.font, size: Math.round(parseFloat(st.fontSize) * 0.75 * 10) / 10,
      bold: (parseInt(st.fontWeight, 10) || 400) >= 600, italic: st.fontStyle === 'italic', color: hex(st.color) || '#000000' };
    const ls = parseFloat(st.letterSpacing);
    if (ls) cs.spacing = Math.round(ls / parseFloat(st.fontSize) * 100);
    for (let e = el; e && e !== stop; e = e.parentElement) {
      const tag = e.tagName;
      const d = e.style.textDecorationLine || e.style.textDecoration || '';
      if (tag === 'U' || /underline/.test(d)) cs.underline = true;
      if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(d)) cs.strike = true;
      if (tag === 'SUP' || e.style.verticalAlign === 'super') cs.sup = true;
      if (tag === 'SUB' || e.style.verticalAlign === 'sub') cs.sub = true;
      if (tag === 'A') cs.underline = true;
      if (!cs.bg) { const bg = hex(e.style.backgroundColor) || (tag === 'MARK' ? '#ffff00' : null); if (bg) cs.bg = bg; }
      if (!cs.ratio && e.dataset && e.dataset.ratio) cs.ratio = +e.dataset.ratio;
    }
    if (cs.sup || cs.sub) cs.size = Math.round(cs.size / 0.83 * 10) / 10;   // 위·아래 첨자는 작게 보이기만 한다
    cache.set(el, cs);
    return cs;
  }

  function paraOf(el) {
    const s = el.style;
    const p = para();
    const al = s.textAlign;
    p.align = s.textAlignLast === 'justify' ? 'distribute' : al === 'start' ? 'left' : ['left', 'right', 'center', 'justify'].includes(al) ? al : 'justify';
    p.indent = huOf(s.textIndent);
    const pl = huOf(s.paddingLeft) + huOf(s.marginLeft);
    p.left = pl - (p.indent < 0 ? -p.indent : 0);
    p.right = huOf(s.paddingRight);
    p.before = huOf(s.paddingTop);
    p.after = huOf(s.paddingBottom);
    const lh = s.lineHeight;
    if (/^[\d.]+$/.test(lh)) { p.lsType = 'PERCENT'; p.ls = Math.round(parseFloat(lh) * 100); }
    else if (/calc/.test(lh)) { p.lsType = 'BETWEEN_LINES'; p.ls = huOf((/([\d.]+pt)\)/.exec(lh) || [])[1] || '0'); }
    else if (/pt|px/.test(lh)) { p.lsType = 'FIXED'; p.ls = huOf(lh); }
    p.style = el.dataset.style || '바탕글';
    if (el.dataset.outline) p.outline = +el.dataset.outline;
    if (el.dataset.list) p.list = el.dataset.list;
    if (el.dataset.pb) p.pageBreak = true;
    return p;
  }

  function runsOf(el, p, ctx) {
    const cache = ctx.cache;
    const walk = (node, href) => {
      for (let n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          const text = n.nodeValue.replace(/​/g, '');
          if (!text) continue;
          const cs = csOf(n.parentElement, el.parentElement, cache);
          text.split(/(\t|\n)/).forEach(part => {
            if (part === '\t') p.runs.push({ t: 'tab' });
            else if (part === '\n') p.runs.push({ t: 'br' });
            else if (part) {
              const last = p.runs[p.runs.length - 1];
              if (last && last.t === 'text' && last.href === href && JSON.stringify(last.cs) === JSON.stringify(cs)) last.text += part;
              else p.runs.push(href ? { t: 'text', text: part, cs, href } : { t: 'text', text: part, cs });
            }
          });
          continue;
        }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (tag === 'BR') { if (n.nextSibling || n.previousSibling) p.runs.push({ t: 'br' }); }
        else if (tag === 'IMG') {
          const key = n.dataset.bin;
          if (key && ctx.doc.bins[key]) p.runs.push({ t: 'img', bin: key, w: huOf(n.style.width) || Math.round(n.width * 75), h: huOf(n.style.height) || Math.round(n.height * 75) });
        }
        else if (n.classList.contains('fn')) p.runs.push({ t: 'note', blocks: (n.dataset.note || '').split('\n').map(t => para(t)) });
        else if (n.classList.contains('eq')) p.runs.push({ t: 'eq', script: n.dataset.script || n.textContent, cs: csOf(n, el.parentElement, cache) });
        else if (n.classList.contains('pgn')) p.runs.push({ t: 'pagenum' });
        else if (tag === 'TABLE') p.runs.push(tableOf(n, ctx));
        else if (tag === 'A') walk(n, n.getAttribute('href') || href);
        else walk(n, href);
      }
    };
    walk(el, null);
    return p;
  }

  function tableOf(tb, ctx) {
    const t = { t: 'table', cells: [], rows: 0, cols: 0, w: Math.round(tb.offsetWidth * 75) || huOf(tb.style.width) };
    const taken = [];
    let r = 0;
    for (const tr of tb.rows) {
      let c = 0;
      taken[r] = taken[r] || [];
      for (const td of tr.cells) {
        while (taken[r][c]) c++;
        const cs = td.colSpan || 1, rs = td.rowSpan || 1;
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) (taken[r + i] = taken[r + i] || [])[c + j] = true;
        const st = td.style;
        const b = side => st['border' + side] || '';
        t.cells.push({ r, c, rs, cs, w: Math.round(td.offsetWidth * 75) || huOf(st.width), h: Math.round(td.offsetHeight * 75) || huOf(st.height),
          bg: hex(st.backgroundColor), valign: st.verticalAlign || 'middle',
          border: (st.borderLeft || st.borderTop) ? { l: b('Left'), r: b('Right'), t: b('Top'), b: b('Bottom') } : null,
          blocks: blocksOf(td, ctx) });
        c += cs;
      }
      r++;
    }
    t.rows = taken.length;
    t.cols = Math.max(...taken.map(x => x.length));
    // 칸 너비 합이 표 너비와 맞게
    return t;
  }

  const BLOCK = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER)$/;
  function blocksOf(root, ctx) {
    const out = [];
    let loose = null;
    const flushLoose = () => { if (loose) { out.push(runsOf(loose, para(), ctx)); loose = null; } };
    for (let n = root.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.tagName === 'TABLE') {
        flushLoose();
        const p = para(); p.runs.push(tableOf(n, ctx));
        if (n.dataset.pb) p.pageBreak = true;
        out.push(p);
      } else if (n.nodeType === 1 && n.classList.contains('box')) {
        // 글상자는 칸 하나짜리 표로 저장한다
        flushLoose();
        const p = para();
        p.runs.push({ t: 'table', rows: 1, cols: 1, w: Math.round(n.offsetWidth * 75), cells: [{ r: 0, c: 0, rs: 1, cs: 1, w: Math.round(n.offsetWidth * 75), h: Math.round(n.offsetHeight * 75), blocks: blocksOf(n, ctx) }] });
        out.push(p);
      } else if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) {
        flushLoose();
        let i = 1;
        for (const li of n.children) {
          const p = runsOf(li, paraOf(li), ctx);
          p.runs.unshift({ t: 'text', text: n.tagName === 'UL' ? '• ' : (i++) + '. ', cs: Object.assign({}, BASE) });
          out.push(p);
        }
      } else if (n.nodeType === 1 && BLOCK.test(n.tagName)) {
        flushLoose();
        if ([...n.children].some(c => BLOCK.test(c.tagName) || c.tagName === 'TABLE' || c.tagName === 'UL' || c.tagName === 'OL')) out.push(...blocksOf(n, ctx));
        else out.push(runsOf(n, paraOf(n), ctx));
      } else if (n.nodeType === 1 && (/^(STYLE|SCRIPT|META)$/.test(n.tagName) || n.classList.contains('pgap'))) {
        continue;
      } else {
        if (!loose) loose = document.createElement('span');
        // 문단 밖 글자는 임시로 모아 한 문단으로
        if (n.nodeType === 3 && !n.nodeValue.trim() && !loose.childNodes.length) continue;
        loose.appendChild(n.cloneNode(true));
        if (!loose.parentElement) { loose.style.display = 'none'; root.appendChild(loose); loose._tmp = true; }
      }
    }
    if (loose) { const l = loose; flushLoose(); if (l._tmp) l.remove(); }
    return out.length ? out : [para()];
  }

  function fromDom(root, doc) {
    const ctx = { doc, cache: new Map() };
    return blocksOf(root, ctx);
  }

  function toHtml(blocks, doc, url) { return blocksHtml(blocks, { doc, url }); }

  return { BASE, A4, STYLES, empty, para, toHtml, fromDom, blocksText, csCss, paraCss, fontCss, esc, hex, huOf, ptOf };
})();
