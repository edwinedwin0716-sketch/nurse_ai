// HWPX(.hwpx, 개방형 OWPML) 읽기·저장
'use strict';

const Hwpx = (() => {
  const dec = new TextDecoder('utf-8');
  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const desc = (el, name) => el ? [...el.getElementsByTagNameNS('*', name)] : [];
  const num = (el, a, d = 0) => { const v = el && el.getAttribute(a); return v == null || v === '' ? d : +v; };
  const col = v => !v || v === 'none' || !/^#[0-9a-f]{6}/i.test(v) ? null : v.slice(0, 7).toLowerCase();
  const ALIGN = { JUSTIFY: 'justify', LEFT: 'left', RIGHT: 'right', CENTER: 'center', DISTRIBUTE: 'distribute', DISTRIBUTE_SPACE: 'distribute' };
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');

  // ---------- 읽기 ----------
  function readHeader(xml) {
    const h = { fonts: {}, chars: {}, paras: {}, fills: {}, styles: {} };
    if (!xml) return h;
    const d = parse(xml);
    for (const ff of desc(d, 'fontface')) if (ff.getAttribute('lang') === 'HANGUL') for (const f of kids(ff, 'font')) h.fonts[f.getAttribute('id')] = f.getAttribute('face');
    for (const c of desc(d, 'charPr')) {
      const ul = kid(c, 'underline'), so = kid(c, 'strikeout');
      h.chars[c.getAttribute('id')] = {
        font: h.fonts[(kid(c, 'fontRef') || c).getAttribute('hangul')] || null, size: num(c, 'height', 1000) / 100,
        bold: !!kid(c, 'bold'), italic: !!kid(c, 'italic'),
        underline: !!ul && !/NONE|CENTER/.test(ul.getAttribute('type')) ,
        strike: (!!so && !/NONE/.test(so.getAttribute('shape') || 'NONE')) || (!!ul && ul.getAttribute('type') === 'CENTER'),
        sup: !!kid(c, 'supscript'), sub: !!kid(c, 'subscript'), color: col(c.getAttribute('textColor')), bg: col(c.getAttribute('shadeColor')),
        spacing: num(kid(c, 'spacing'), 'hangul', 0), ratio: num(kid(c, 'ratio'), 'hangul', 100),
      };
    }
    for (const p of desc(d, 'paraPr')) {
      const sw = kid(p, 'switch');
      let block = p, halve = true;
      if (sw) { const cs = kid(sw, 'case'); if (cs) { block = cs; halve = false; } else block = kid(sw, 'default') || p; }
      const m = kid(block, 'margin'), ls = kid(block, 'lineSpacing');
      const v = n => {
        const e = kid(m, n); if (!e) return 0;
        let x = num(e, 'value');
        if (halve) x = x / 2;
        return e.getAttribute('unit') === 'CHAR' ? x * 1000 : x;
      };
      const head = kid(p, 'heading');
      const lsType = ls ? ls.getAttribute('type') : 'PERCENT';
      let lsv = ls ? num(ls, 'value', 160) : 160;
      if (lsType !== 'PERCENT' && halve) lsv /= 2;
      h.paras[p.getAttribute('id')] = {
        align: ALIGN[(kid(p, 'align') || p).getAttribute('horizontal')] || 'justify',
        indent: v('intent'), left: v('left'), right: v('right'), before: v('prev'), after: v('next'), lsType, ls: lsv,
        outline: head && head.getAttribute('type') === 'OUTLINE' ? num(head, 'level') + 1 : 0,
        list: head && head.getAttribute('type') === 'NUMBER' ? 'number' : head && head.getAttribute('type') === 'BULLET' ? 'bullet' : undefined,
      };
    }
    const LINE = { SOLID: 'solid', DASH: 'dashed', DOT: 'dotted', DASH_DOT: 'dashed', DASH_DOT_DOT: 'dashed', LONG_DASH: 'dashed', DOUBLE_SLIM: 'double', SLIM_THICK: 'double', THICK_SLIM: 'double', SLIM_THICK_SLIM: 'double', CIRCLE: 'dotted' };
    for (const b of desc(d, 'borderFill')) {
      const side = n => { const e = kid(b, n); if (!e || e.getAttribute('type') === 'NONE') return 'none'; return `${(e.getAttribute('width') || '0.12 mm').replace(' ', '')} ${LINE[e.getAttribute('type')] || 'solid'} ${col(e.getAttribute('color')) || '#000'}`; };
      const wb = desc(b, 'winBrush')[0];
      h.fills[b.getAttribute('id')] = { border: { l: side('leftBorder'), r: side('rightBorder'), t: side('topBorder'), b: side('bottomBorder') }, bg: wb ? col(wb.getAttribute('faceColor')) : null };
    }
    for (const s of desc(d, 'style')) h.styles[s.getAttribute('id')] = s.getAttribute('name');
    return h;
  }

  function read(bytes) {
    const files = Zip.read(bytes);
    const doc = Model.empty();
    doc.blocks = [];
    let hpf = null;
    for (const k in files) if (/\.hpf$/i.test(k)) hpf = k;
    const manifest = {};
    let spine = [];
    if (hpf) {
      const d = parse(dec.decode(files[hpf]));
      for (const it of desc(d, 'item')) manifest[it.getAttribute('id')] = it.getAttribute('href');
      spine = desc(d, 'itemref').map(r => manifest[r.getAttribute('idref')]).filter(h => h && /section/i.test(h));
    }
    if (!spine.length) spine = Object.keys(files).filter(k => /^Contents\/section\d+\.xml$/i.test(k)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
    const headerPath = Object.keys(files).find(k => /^Contents\/header\.xml$/i.test(k));
    const ctx = { doc, files, manifest, head: readHeader(headerPath ? dec.decode(files[headerPath]) : ''), binMap: {}, pageSet: false };
    spine.forEach((path, i) => {
      const f = files[path] || files[path.replace(/^\//, '')];
      if (!f) return;
      const sec = parse(dec.decode(f)).documentElement;
      const paras = blocks(ctx, sec);
      if (i > 0 && paras.length) paras[0].pageBreak = true;
      doc.blocks.push(...paras);
    });
    if (!doc.blocks.length) doc.blocks.push(Model.para());
    return doc;
  }

  function blocks(ctx, parent) {
    const out = [];
    for (const el of parent.children) {
      if (el.localName === 'p') out.push(paragraph(ctx, el));
      else if (el.localName === 'subList') out.push(...blocks(ctx, el));
    }
    return out;
  }

  function paragraph(ctx, el) {
    const ps = ctx.head.paras[el.getAttribute('paraPrIDRef')] || {};
    const p = Object.assign(Model.para(), ps);
    p.style = ctx.head.styles[el.getAttribute('styleIDRef')] || '바탕글';
    if (el.getAttribute('pageBreak') === '1') p.pageBreak = true;
    const st = { href: null, mark: null };
    for (const run of el.children) {
      if (run.localName === 'run') runItems(ctx, p, run, ctx.head.chars[run.getAttribute('charPrIDRef')] || Object.assign({}, Model.BASE), st);
      else if (run.localName === 'switch') { const dflt = kid(run, 'default'); if (dflt) for (const r of kids(dflt, 'run')) runItems(ctx, p, r, ctx.head.chars[r.getAttribute('charPrIDRef')] || {}, st); }
    }
    return p;
  }

  function runItems(ctx, p, run, cs0, st) {
    const cs = () => st.mark ? Object.assign({}, cs0, { bg: st.mark }) : cs0;
    const pushText = text => {
      if (!text) return;
      const r = { t: 'text', text, cs: cs() };
      if (st.href) r.href = st.href;
      p.runs.push(r);
    };
    for (const n of run.children) {
      switch (n.localName) {
        case 't':
          for (const c of n.childNodes) {
            if (c.nodeType === 3) pushText(c.nodeValue);
            else if (c.nodeType === 1) {
              const ln = c.localName;
              if (ln === 'tab') p.runs.push({ t: 'tab' });
              else if (ln === 'lineBreak') p.runs.push({ t: 'br' });
              else if (ln === 'nbSpace') pushText(' ');
              else if (ln === 'fwSpace') pushText('　');
              else if (ln === 'hyphen') pushText('-');
              else if (ln === 'markpenBegin') st.mark = col(c.getAttribute('color')) || '#ffff00';
              else if (ln === 'markpenEnd') st.mark = null;
              else if (c.textContent) pushText(c.textContent);
            }
          }
          break;
        case 'secPr': {
          if (ctx.pageSet) break;
          const pp = kid(n, 'pagePr'), m = kid(pp, 'margin');
          if (pp) {
            const pg = { w: num(pp, 'width', 59528), h: num(pp, 'height', 84188), ml: num(m, 'left', 8504), mr: num(m, 'right', 8504),
              mt: num(m, 'top', 5668), mb: num(m, 'bottom', 4252), mh: num(m, 'header', 4252), mf: num(m, 'footer', 4252), gutter: num(m, 'gutter') };
            if (pp.getAttribute('landscape') === 'NARROWLY') { pg.landscape = true; if (pg.w < pg.h) { const w = pg.w; pg.w = pg.h; pg.h = w; } }
            ctx.doc.page = pg; ctx.pageSet = true;
          }
          break;
        }
        case 'ctrl':
          for (const c of n.children) control(ctx, p, c, cs(), st);
          break;
        case 'tbl': p.runs.push(table(ctx, n)); break;
        case 'pic': { const im = picture(ctx, n); if (im) p.runs.push(im); break; }
        case 'container': for (const pic of desc(n, 'pic')) { const im = picture(ctx, pic); if (im) p.runs.push(im); } break;
        case 'equation': { const s = kid(n, 'script'); p.runs.push({ t: 'eq', script: s ? s.textContent : '', cs: cs() }); break; }
        case 'rect': case 'ellipse': case 'polygon': case 'curve': case 'arc': {
          const dt = kid(n, 'drawText');
          if (dt) { const sz = kid(n, 'sz') || kid(n, 'curSz'); p.runs.push({ t: 'box', w: num(sz, 'width', 20000), h: num(sz, 'height', 5000), blocks: blocks(ctx, kid(dt, 'subList') || dt) }); }
          break;
        }
        case 'switch': { const d = kid(n, 'default'); if (d) runItems(ctx, p, d, cs0, st); break; }
      }
    }
  }

  function control(ctx, p, c, cs, st) {
    switch (c.localName) {
      case 'header': case 'footer': {
        const key = c.localName;
        const type = c.getAttribute('applyPageType') || 'BOTH';
        if (type === 'BOTH' || !ctx.doc[key].length) ctx.doc[key] = blocks(ctx, kid(c, 'subList') || c);
        break;
      }
      case 'footNote': case 'endNote': p.runs.push({ t: 'note', end: c.localName === 'endNote', blocks: blocks(ctx, kid(c, 'subList') || c).map(b => { b.runs = b.runs.filter(r => r.t !== 'pagenum'); return b; }) }); break;
      case 'fieldBegin':
        if (c.getAttribute('type') === 'HYPERLINK') {
          let href = '';
          for (const sp of desc(c, 'stringParam')) if (sp.getAttribute('name') === 'Path') href = sp.textContent;
          if (!href) for (const sp of desc(c, 'stringParam')) if (sp.getAttribute('name') === 'Command') href = sp.textContent.split(';')[0].replace(/\\:/g, ':');
          st.href = href || null;
        }
        break;
      case 'fieldEnd': st.href = null; break;
      case 'pageNum': ctx.doc.pageNum = c.getAttribute('pos') || 'BOTTOM_CENTER'; break;
      case 'autoNum': if (c.getAttribute('numType') === 'PAGE') p.runs.push({ t: 'pagenum', cs }); break;
    }
  }

  function table(ctx, el) {
    const t = { t: 'table', rows: num(el, 'rowCnt'), cols: num(el, 'colCnt'), cells: [], w: num(kid(el, 'sz'), 'width') };
    for (const tr of kids(el, 'tr')) for (const tc of kids(tr, 'tc')) {
      const a = kid(tc, 'cellAddr'), sp = kid(tc, 'cellSpan'), sz = kid(tc, 'cellSz'), sl = kid(tc, 'subList');
      const fill = ctx.head.fills[tc.getAttribute('borderFillIDRef')];
      t.cells.push({ r: num(a, 'rowAddr'), c: num(a, 'colAddr'), rs: num(sp, 'rowSpan', 1), cs: num(sp, 'colSpan', 1), w: num(sz, 'width'), h: num(sz, 'height'),
        valign: { TOP: 'top', BOTTOM: 'bottom' }[sl && sl.getAttribute('vertAlign')] || 'middle',
        bg: fill ? fill.bg : null, border: fill ? fill.border : null, blocks: sl ? blocks(ctx, sl) : [] });
    }
    return t;
  }

  function picture(ctx, el) {
    const img = desc(el, 'img')[0];
    if (!img) return null;
    const ref = img.getAttribute('binaryItemIDRef');
    if (!ctx.binMap[ref]) {
      let path = ctx.manifest[ref];
      if (!path) path = Object.keys(ctx.files).find(k => k.startsWith('BinData/' + ref + '.'));
      const data = path && (ctx.files[path] || ctx.files[path.replace(/^\//, '')]);
      if (!data) return null;
      const key = 'img' + (Object.keys(ctx.doc.bins).length + 1);
      ctx.doc.bins[key] = { data, ext: (path.split('.').pop() || 'png').toLowerCase() };
      ctx.binMap[ref] = key;
    }
    const sz = kid(el, 'curSz') || kid(el, 'sz');
    return { t: 'img', bin: ctx.binMap[ref], w: num(sz, 'width', 10000), h: num(sz, 'height', 10000) };
  }

  // ---------- 저장 ----------
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MM = ['0.1', '0.12', '0.15', '0.2', '0.25', '0.3', '0.4', '0.5', '0.6', '0.7', '1.0', '1.5', '2.0', '3.0', '4.0', '5.0'];
  const LANGS = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
  const all = v => LANGS.map(l => `${l}="${v}"`).join(' ');
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
  const STYLE_ID = { '바탕글': 0, '본문': 1, '개요 1': 2, '개요 2': 3, '개요 3': 4, '개요 4': 5, '개요 5': 6, '개요 6': 7, '개요 7': 8 };

  function write(doc, meta) {
    meta = meta || {};
    const T = HwpxTemplate;
    let header = T.header;
    const fonts = ['함초롬돋움', '함초롬바탕'];
    const fontId = f => { f = f || '함초롬바탕'; let i = fonts.indexOf(f); if (i < 0) { fonts.push(f); i = fonts.length - 1; } return i; };
    const charPrs = [], charKey = new Map();
    const CHAR0 = 7;
    const charId = cs => {
      cs = cs || Model.BASE;
      const k = JSON.stringify([cs.font || '함초롬바탕', cs.size || 10, !!cs.bold, !!cs.italic, !!cs.underline, !!cs.strike, !!cs.sup, !!cs.sub, cs.color || '#000000', cs.bg || '', cs.spacing || 0, cs.ratio || 100]);
      if (charKey.has(k)) return charKey.get(k);
      const id = CHAR0 + charPrs.length;
      const f = fontId(cs.font);
      const sp = Math.max(-50, Math.min(50, Math.round(cs.spacing || 0))), ra = Math.max(50, Math.min(200, Math.round(cs.ratio || 100)));
      charPrs.push(`<hh:charPr id="${id}" height="${Math.round((cs.size || 10) * 100)}" textColor="${cs.color || '#000000'}" shadeColor="${cs.bg || 'none'}" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
        `<hh:fontRef ${all(f)}/><hh:ratio ${all(ra)}/><hh:spacing ${all(sp)}/><hh:relSz ${all(100)}/><hh:offset ${all(0)}/>` +
        (cs.italic ? '<hh:italic/>' : '') + (cs.bold ? '<hh:bold/>' : '') +
        `<hh:underline type="${cs.underline ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="#000000"/><hh:strikeout shape="${cs.strike ? 'SOLID' : 'NONE'}" color="#000000"/>` +
        '<hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>' +
        (cs.sup ? '<hh:supscript/>' : cs.sub ? '<hh:subscript/>' : '') + '</hh:charPr>');
      charKey.set(k, id);
      return id;
    };
    const paraPrs = [], paraKey = new Map();
    const PARA0 = 20;
    const AL = { justify: 'JUSTIFY', left: 'LEFT', right: 'RIGHT', center: 'CENTER', distribute: 'DISTRIBUTE' };
    const paraId = p => {
      const k = JSON.stringify([p.align, p.left, p.right, p.indent, p.before, p.after, p.lsType, p.ls, p.outline || 0, p.list || '']);
      if (paraKey.has(k)) return paraKey.get(k);
      const id = PARA0 + paraPrs.length;
      const r = v => Math.round(v || 0);
      const margin = d => `<hh:margin><hc:intent value="${r(p.indent) * d}" unit="HWPUNIT"/><hc:left value="${r(p.left) * d}" unit="HWPUNIT"/><hc:right value="${r(p.right) * d}" unit="HWPUNIT"/><hc:prev value="${r(p.before) * d}" unit="HWPUNIT"/><hc:next value="${r(p.after) * d}" unit="HWPUNIT"/></hh:margin>` +
        `<hh:lineSpacing type="${p.lsType || 'PERCENT'}" value="${(p.lsType || 'PERCENT') === 'PERCENT' ? r(p.ls || 160) : r(p.ls) * d}" unit="HWPUNIT"/>`;
      const head = p.outline ? `<hh:heading type="OUTLINE" idRef="0" level="${p.outline - 1}"/>`
        : p.list === 'number' ? '<hh:heading type="NUMBER" idRef="1" level="0"/>'
        : p.list === 'bullet' ? '<hh:heading type="BULLET" idRef="1" level="0"/>' : '<hh:heading type="NONE" idRef="0" level="0"/>';
      paraPrs.push(`<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR">` +
        `<hh:align horizontal="${AL[p.align] || 'JUSTIFY'}" vertical="BASELINE"/>${head}` +
        '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
        '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
        `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin(1)}</hp:case><hp:default>${margin(2)}</hp:default></hp:switch>` +
        '<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>');
      paraKey.set(k, id);
      return id;
    };
    const fills = [], fillKey = new Map();
    const FILL0 = 3;
    const LT = { solid: 'SOLID', dashed: 'DASH', dotted: 'DOT', double: 'DOUBLE_SLIM' };
    const side = css => {
      if (css === undefined || css === null) return { type: 'SOLID', w: '0.12', c: '#000000' };
      if (!css || /none|hidden/.test(css)) return { type: 'NONE', w: '0.1', c: '#000000' };
      const m = /([\d.]+)(mm|px|pt)?/.exec(css);
      let mm = m ? parseFloat(m[1]) : 0.12;
      if (m && m[2] === 'px') mm = mm * 25.4 / 96; else if (m && m[2] === 'pt') mm = mm * 25.4 / 72;
      if (mm <= 0) return { type: 'NONE', w: '0.1', c: '#000000' };
      const w = MM.reduce((a, b) => Math.abs(b - mm) < Math.abs(a - mm) ? b : a);
      const st = (/(solid|dashed|dotted|double)/.exec(css) || [, 'solid'])[1];
      const c = (/#[0-9a-f]{6}/i.exec(css) || [Model.hex((/rgba?\([^)]*\)/.exec(css) || [''])[0]) || '#000000'])[0];
      return { type: LT[st], w, c };
    };
    const fillId = cell => {
      const b = cell.border || {};
      const s = cell.border ? [side(b.l), side(b.r), side(b.t), side(b.b)] : [side(), side(), side(), side()];
      const k = JSON.stringify([s, cell.bg || '']);
      if (fillKey.has(k)) return fillKey.get(k);
      const id = FILL0 + fills.length;
      const ln = (n, v) => `<hh:${n} type="${v.type}" width="${v.w} mm" color="${v.c}"/>`;
      fills.push(`<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
        ln('leftBorder', s[0]) + ln('rightBorder', s[1]) + ln('topBorder', s[2]) + ln('bottomBorder', s[3]) + '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>' +
        (cell.bg ? `<hc:fillBrush><hc:winBrush faceColor="${cell.bg}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : '') + '</hh:borderFill>');
      fillKey.set(k, id);
      return id;
    };
    const tableFill = fillId({ border: null });   // 표 바깥 테두리 기본

    // 그림
    const binItems = [];
    const binOf = key => {
      let it = binItems.find(b => b.key === key);
      if (!it) {
        const b = doc.bins[key];
        const ext = (b.ext || 'png').replace('jpeg', 'jpg');
        it = { key, id: 'BIN' + String(binItems.length + 1).padStart(4, '0'), ext, data: b.data };
        binItems.push(it);
      }
      return it.id;
    };

    let pid = 1, oid = 1000;
    const nid = () => String(1000000 + (oid++));
    const subList = (blocks, va, extra) => `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${va || 'TOP'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="${extra && extra.w || 0}" textHeight="${extra && extra.h || 0}" hasTextRef="0" hasNumRef="0">${blocks.map(b => paraXml(b)).join('')}</hp:subList>`;
    let noteNo = 0;

    function runXml(r, cs) {
      switch (r.t) {
        case 'tab': return '<hp:t><hp:tab width="4000" leader="0" type="1"/></hp:t>';
        case 'br': return '<hp:t><hp:lineBreak/></hp:t>';
        case 'img': {
          if (!doc.bins[r.bin]) return '';
          const id = binOf(r.bin), w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h)), o = nid();
          return `<hp:pic textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" reverse="0" id="${o}" zOrder="0" numberingType="PICTURE" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${o}">` +
            `<hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/>` +
            `<hp:rotationInfo angle="0" centerX="${w >> 1}" centerY="${h >> 1}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>` +
            `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/>` +
            `<hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/><hc:img binaryItemIDRef="${id}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/>` +
            `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
            '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>그림입니다.</hp:shapeComment></hp:pic>';
        }
        case 'note': {
          noteNo++;
          const inner = (r.blocks.length ? r.blocks : [Model.para()]).map((b, i) => {
            const runs = i === 0 ? [{ t: 'fnnum', n: noteNo }].concat(b.runs) : b.runs;
            return paraXml(Object.assign({}, b, { runs }));
          }).join('');
          return `<hp:ctrl><hp:${r.end ? 'endNote' : 'footNote'} number="${noteNo}" suffixChar="41" instId="${nid()}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList></hp:${r.end ? 'endNote' : 'footNote'}></hp:ctrl>`;
        }
        case 'fnnum': return `<hp:ctrl><hp:autoNum num="${r.n}" numType="FOOTNOTE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/></hp:autoNum></hp:ctrl>`;
        case 'pagenum': return '<hp:ctrl><hp:autoNum num="1" numType="PAGE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/></hp:autoNum></hp:ctrl>';
        case 'eq': {
          const w = Math.max(1000, (r.script || '').length * 550), o = nid();
          return `<hp:equation id="${o}" zOrder="0" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseLine="66" textColor="#000000" baseUnit="${Math.round(((cs && cs.size) || 10) * 100)}" lineMode="CHAR" font="HYhwpEQ">` +
            `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="1500" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
            `<hp:outMargin left="56" right="56" top="0" bottom="0"/><hp:shapeComment>수식입니다.</hp:shapeComment><hp:script>${x(r.script || '')}</hp:script></hp:equation>`;
        }
        case 'table': return tableXml(r);
        case 'box': return tableXml({ rows: 1, cols: 1, w: r.w, cells: [{ r: 0, c: 0, rs: 1, cs: 1, w: r.w, h: r.h, blocks: r.blocks }] });
      }
      return '';
    }

    function tableXml(t) {
      const o = nid();
      const rows = [];
      for (const c of t.cells) (rows[c.r] = rows[c.r] || []).push(c);
      const nRows = Math.max(1, rows.length), nCols = Math.max(1, t.cols || 1);
      const width = Math.round(t.w || t.cells.filter(c => c.r === 0).reduce((s, c) => s + (c.w || 0), 0) || 42520);
      let height = 0;
      for (let r = 0; r < nRows; r++) height += Math.max(...(rows[r] || [{ h: 282 }]).filter(c => c.rs === 1).map(c => c.h || 282), 282);
      let h = `<hp:tbl id="${o}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${nRows}" colCnt="${nCols}" cellSpacing="0" borderFillIDRef="${tableFill}" noAdjust="0">` +
        `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>` +
        '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
        '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>';
      for (let r = 0; r < nRows; r++) {
        h += '<hp:tr>';
        for (const c of (rows[r] || []).sort((a, b) => a.c - b.c)) {
          const va = { top: 'TOP', bottom: 'BOTTOM' }[c.valign] || 'CENTER';
          h += `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${fillId(c)}">` +
            subList(c.blocks && c.blocks.length ? c.blocks : [Model.para()], va) +
            `<hp:cellAddr colAddr="${c.c}" rowAddr="${c.r}"/><hp:cellSpan colSpan="${c.cs || 1}" rowSpan="${c.rs || 1}"/><hp:cellSz width="${Math.round(c.w || width / nCols)}" height="${Math.round(c.h || 282)}"/>` +
            '<hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>';
        }
        h += '</hp:tr>';
      }
      return h + '</hp:tbl>';
    }

    function paraXml(p, lead) {
      const ppr = paraId(p);
      const sid = p.outline ? 1 + p.outline : (STYLE_ID[p.style] || 0);
      let h = `<hp:p id="${pid++}" paraPrIDRef="${ppr}" styleIDRef="${sid > 8 ? 0 : sid}" pageBreak="${p.pageBreak ? 1 : 0}" columnBreak="0" merged="0">`;
      if (lead) h += lead;
      let link = null, linkId = 0;
      const runs = p.runs.slice();
      if (!runs.some(r => r.t !== 'fnnum')) runs.push({ t: 'text', text: '', cs: Model.BASE });
      let cur = null, buf = '';
      const close = () => { if (cur !== null) { h += buf + '</hp:run>'; cur = null; buf = ''; } };
      for (const r of runs) {
        const href = r.t === 'text' ? r.href || null : null;
        if (href !== link) {
          close();
          if (link) h += `<hp:run charPrIDRef="0"><hp:ctrl><hp:fieldEnd beginIDRef="${linkId}" fieldid="${linkId}"/></hp:ctrl></hp:run>`;
          link = href;
          if (link) {
            linkId = nid();
            const cmd = link.replace(/:/g, '\\:') + ';1;0;0;';
            h += `<hp:run charPrIDRef="0"><hp:ctrl><hp:fieldBegin id="${linkId}" type="HYPERLINK" name="" editable="0" dirty="0" zorder="-1" fieldid="${linkId}"><hp:parameters cnt="6" name="">` +
              `<hp:integerParam name="Prop">0</hp:integerParam><hp:stringParam name="Command">${x(cmd)}</hp:stringParam><hp:stringParam name="Path">${x(link)}</hp:stringParam>` +
              '<hp:stringParam name="Category">HWPHYPERLINK_TYPE_URL</hp:stringParam><hp:stringParam name="TargetType">HWPHYPERLINK_TARGET_BOOKMARK</hp:stringParam><hp:stringParam name="DocOpenType">HWPHYPERLINK_JUMP_CURRENTTAB</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl></hp:run>';
          }
        }
        const cs = r.cs || (r.t === 'fnnum' ? Model.BASE : null);
        const id = charId(cs || lastCs);
        if (cs) lastCs = cs;
        if (cur !== id) { close(); h += `<hp:run charPrIDRef="${id}">`; cur = id; }
        buf += r.t === 'text' ? `<hp:t>${x(r.text)}</hp:t>` : runXml(r, cs || lastCs);
      }
      close();
      if (link) h += `<hp:run charPrIDRef="0"><hp:ctrl><hp:fieldEnd beginIDRef="${linkId}" fieldid="${linkId}"/></hp:ctrl></hp:run>`;
      return h + '</hp:p>';
    }
    let lastCs = Model.BASE;

    // 구역 정의(용지)와 머리말·꼬리말은 첫 문단 맨 앞에
    const pg = doc.page || Model.A4;
    const land = !!pg.landscape || pg.w > pg.h;
    const pw = land ? Math.min(pg.w, pg.h) : pg.w, ph = land ? Math.max(pg.w, pg.h) : pg.h;
    const secPr = T.secPr.replace(/<hp:pagePr[^>]*>(<hp:margin[^>]*\/>)<\/hp:pagePr>/,
      `<hp:pagePr landscape="${land ? 'NARROWLY' : 'WIDELY'}" width="${Math.round(pw)}" height="${Math.round(ph)}" gutterType="LEFT_ONLY"><hp:margin header="${Math.round(pg.mh)}" footer="${Math.round(pg.mf)}" gutter="${Math.round(pg.gutter || 0)}" left="${Math.round(pg.ml)}" right="${Math.round(pg.mr)}" top="${Math.round(pg.mt)}" bottom="${Math.round(pg.mb)}"/></hp:pagePr>`);
    const bodyW = Math.round((land ? ph : pw) - pg.ml - pg.mr);
    let lead = `<hp:run charPrIDRef="0">${secPr}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`;
    const hasBlocks = b => b && b.length && b.some(p => p.runs && p.runs.length);
    if (hasBlocks(doc.header)) lead += `<hp:ctrl><hp:header id="${nid()}" applyPageType="BOTH">${subList(doc.header, 'TOP', { w: bodyW, h: Math.round(pg.mh) })}</hp:header></hp:ctrl>`;
    if (hasBlocks(doc.footer)) lead += `<hp:ctrl><hp:footer id="${nid()}" applyPageType="BOTH">${subList(doc.footer, 'BOTTOM', { w: bodyW, h: Math.round(pg.mf) })}</hp:footer></hp:ctrl>`;
    if (doc.pageNum) lead += `<hp:ctrl><hp:pageNum pos="${doc.pageNum}" formatType="DIGIT" sideChar="-"/></hp:ctrl>`;
    lead += '</hp:run>';

    const body = doc.blocks.map((b, i) => paraXml(b.t === 'table' ? Object.assign(Model.para(), { runs: [b] }) : b, i === 0 ? lead : '')).join('');
    const section = T.secOpen + body + '</hs:sec>';

    // 머리 정보(header.xml) 고치기
    header = header.replace(/<hh:fontface lang="([A-Z]+)" fontCnt="\d+">([\s\S]*?)<\/hh:fontface>/g, (m, lang, inner) => {
      let add = '';
      for (let i = 2; i < fonts.length; i++) add += `<hh:font id="${i}" face="${x(fonts[i])}" type="TTF" isEmbedded="0"/>`;
      return `<hh:fontface lang="${lang}" fontCnt="${fonts.length}">${inner}${add}</hh:fontface>`;
    });
    header = header.replace(/<hh:borderFills itemCnt="(\d+)">([\s\S]*?)<\/hh:borderFills>/, (m, n, inner) => `<hh:borderFills itemCnt="${+n + fills.length}">${inner}${fills.join('')}</hh:borderFills>`);
    header = header.replace(/<hh:charProperties itemCnt="(\d+)">([\s\S]*?)<\/hh:charProperties>/, (m, n, inner) => `<hh:charProperties itemCnt="${+n + charPrs.length}">${inner}${charPrs.join('')}</hh:charProperties>`);
    if (!/<hh:bullets/.test(header)) header = header.replace('</hh:numberings>', '</hh:numberings><hh:bullets itemCnt="1"><hh:bullet id="1" char="●" useImage="0"><hh:paraHead level="0" align="LEFT" useInstWidth="0" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0"/></hh:bullet></hh:bullets>');
    header = header.replace(/<hh:paraProperties itemCnt="(\d+)">([\s\S]*?)<\/hh:paraProperties>/, (m, n, inner) => `<hh:paraProperties itemCnt="${+n + paraPrs.length}">${inner}${paraPrs.join('')}</hh:paraProperties>`);

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
    const hpf = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
      `<opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>${x(meta.title || '')}</opf:title><opf:language>ko</opf:language>` +
      '<opf:meta name="creator" content="text"></opf:meta><opf:meta name="subject" content="text"/><opf:meta name="description" content="text"/>' +
      `<opf:meta name="lastsaveby" content="text"></opf:meta><opf:meta name="CreatedDate" content="text">${now}</opf:meta><opf:meta name="ModifiedDate" content="text">${now}</opf:meta>` +
      '<opf:meta name="keyword" content="text"/></opf:metadata><opf:manifest>' +
      '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/>' +
      binItems.map(b => `<opf:item id="${b.id}" href="BinData/${b.id}.${b.ext}" media-type="${MIME[b.ext] || 'image/png'}" isEmbeded="1"/>`).join('') +
      '</opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>';
    const rdf = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>';
    const preview = Model.blocksText(doc.blocks.filter(b => b.t === 'p')).slice(0, 1000);
    return Zip.write([
      { name: 'mimetype', data: 'application/hwp+zip', store: true },
      { name: 'version.xml', data: T.version },
      { name: 'Contents/header.xml', data: header },
      { name: 'Contents/section0.xml', data: section },
      { name: 'Preview/PrvText.txt', data: preview },
      { name: 'settings.xml', data: T.settings },
      { name: 'META-INF/container.rdf', data: rdf },
      { name: 'Contents/content.hpf', data: hpf },
      { name: 'META-INF/container.xml', data: T.container },
      { name: 'META-INF/manifest.xml', data: T.manifest },
      ...binItems.map(b => ({ name: `BinData/${b.id}.${b.ext}`, data: b.data, store: true })),
    ]);
  }

  return { read, write };
})();
