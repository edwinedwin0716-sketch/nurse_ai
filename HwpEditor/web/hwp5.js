// HWP 5.0(.hwp) 읽기 → 문서 모델(model.js 설명 참고).
// 기록(record) 구조는 HWP 5.0 공개 문서 형식을 따른다.
'use strict';

const Hwp5 = (() => {
  const T = { DOC_PROPS: 16, ID_MAPPINGS: 17, BIN_DATA: 18, FACE_NAME: 19, BORDER_FILL: 20, CHAR_SHAPE: 21, PARA_SHAPE: 25, STYLE: 26,
    PARA_HEADER: 66, PARA_TEXT: 67, PARA_CHAR_SHAPE: 68, CTRL_HEADER: 71, LIST_HEADER: 72, PAGE_DEF: 73,
    SHAPE_COMPONENT: 76, TABLE: 77, PICTURE: 85, EQEDIT: 88 };
  const ALIGN = ['justify', 'left', 'right', 'center', 'distribute', 'distribute'];
  const LS = ['PERCENT', 'FIXED', 'BETWEEN_LINES', 'AT_LEAST'];

  class R {
    constructor(b) { this.b = b; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); this.p = 0; }
    get left() { return this.b.length - this.p; }
    u8() { return this.p + 1 <= this.b.length ? this.b[this.p++] : (this.p++, 0); }
    i8() { const v = this.u8(); return v > 127 ? v - 256 : v; }
    u16() { const v = this.p + 2 <= this.b.length ? this.dv.getUint16(this.p, true) : 0; this.p += 2; return v; }
    i16() { const v = this.p + 2 <= this.b.length ? this.dv.getInt16(this.p, true) : 0; this.p += 2; return v; }
    u32() { const v = this.p + 4 <= this.b.length ? this.dv.getUint32(this.p, true) : 0; this.p += 4; return v; }
    i32() { const v = this.p + 4 <= this.b.length ? this.dv.getInt32(this.p, true) : 0; this.p += 4; return v; }
    wstr() { const n = this.u16(); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u16()); return s; }
  }

  // 기록 나열 → 나무(부모-자식) 구조
  function records(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const list = [];
    let p = 0;
    while (p + 4 <= bytes.length) {
      const h = dv.getUint32(p, true);
      let size = h >>> 20;
      p += 4;
      if (size === 0xFFF) { size = dv.getUint32(p, true); p += 4; }
      list.push({ tag: h & 0x3FF, level: (h >>> 10) & 0x3FF, data: bytes.subarray(p, p + size), children: [] });
      p += size;
    }
    const roots = [], stack = [];
    for (const r of list) {
      while (stack.length && stack[stack.length - 1].level >= r.level) stack.pop();
      (stack.length ? stack[stack.length - 1].children : roots).push(r);
      stack.push(r);
    }
    return roots;
  }

  const color = c => {
    if (c == null || c === 0xFFFFFFFF || (c >>> 24) !== 0 && (c >>> 24) !== 0xFF) return null;
    const r = c & 0xFF, g = (c >> 8) & 0xFF, b = (c >> 16) & 0xFF;
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  };
  const ctrlId = v => String.fromCharCode((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);

  function docInfo(roots) {
    const info = { fonts: [], charShapes: [], paraShapes: [], borderFills: [null], bins: [], styles: [], counts: [] };
    const flat = [];
    const walk = list => { for (const r of list) { flat.push(r); walk(r.children); } };
    walk(roots);
    for (const r of flat) {
      const c = new R(r.data);
      switch (r.tag) {
        case T.ID_MAPPINGS:
          for (let i = 0; i < r.data.length / 4; i++) info.counts.push(c.i32());
          break;
        case T.FACE_NAME: { c.u8(); info.fonts.push(c.wstr()); break; }
        case T.BIN_DATA: {
          const flags = c.u16();
          const kind = flags & 0xF;
          if (kind === 0) { c.wstr(); c.wstr(); info.bins.push({ kind }); }
          else { const id = c.u16(); const ext = kind === 1 ? c.wstr() : ''; info.bins.push({ kind, id, ext: ext.toLowerCase(), compress: (flags >> 4) & 3 }); }
          break;
        }
        case T.BORDER_FILL: {
          const props = c.u16();
          const lines = [];
          for (let i = 0; i < 5; i++) lines.push({ type: c.u8(), width: c.u8(), color: color(c.u32()) });
          const fillType = c.u32();
          let bg = null;
          if (fillType & 1) { bg = color(c.u32()); }
          info.borderFills.push({ props, left: lines[0], right: lines[1], top: lines[2], bottom: lines[3], bg });
          break;
        }
        case T.CHAR_SHAPE: {
          const faces = []; for (let i = 0; i < 7; i++) faces.push(c.u16());
          const ratio = []; for (let i = 0; i < 7; i++) ratio.push(c.u8());
          const spacing = []; for (let i = 0; i < 7; i++) spacing.push(c.i8());
          for (let i = 0; i < 14; i++) c.u8();
          const height = c.i32(), props = c.u32();
          c.i8(); c.i8();
          const text = c.u32(); c.u32(); const shade = c.u32();
          info.charShapes.push({ faces, ratio: ratio[0], spacing: spacing[0], height, props, text: color(text), shade: color(shade) });
          break;
        }
        case T.PARA_SHAPE: {
          const p1 = c.u32(), left = c.i32(), right = c.i32(), indent = c.i32(), prev = c.i32(), next = c.i32(), lsOld = c.i32();
          c.u16(); c.u16(); c.u16(); for (let i = 0; i < 4; i++) c.i16();
          let p3 = null, ls = lsOld;
          if (c.left >= 12) { c.u32(); p3 = c.u32(); ls = c.u32(); }
          const half = v => (v >> 1);            // 두 배로 저장, 0번 비트는 단위
          const lsType = LS[p3 != null ? p3 & 0x1F : p1 & 3] || 'PERCENT';
          info.paraShapes.push({
            align: ALIGN[(p1 >> 2) & 7] || 'justify', left: half(left), right: half(right), indent: half(indent),
            before: half(prev), after: half(next), lsType, ls: lsType === 'PERCENT' ? ls : half(ls),
            heading: (p1 >> 23) & 3, level: (p1 >> 25) & 7,
          });
          break;
        }
        case T.STYLE: {
          const name = c.wstr(); c.wstr(); c.u8(); c.u8(); c.u16(); const para = c.u16(), chr = c.u16();
          info.styles.push({ name, para, chr });
          break;
        }
      }
    }
    // FACE_NAME은 언어별(한글, 영문, ...)로 이어져 나온다. 한글 글꼴 목록만 쓴다.
    const nHangul = info.counts[1] || info.fonts.length;
    info.hangulFonts = info.fonts.slice(0, nHangul);
    return info;
  }

  function charStyle(info, id) {
    const s = info.charShapes[id];
    if (!s) return {};
    const p = s.props;
    const cs = {
      font: info.hangulFonts[s.faces[0]] || null, size: s.height / 100,
      bold: !!(p & 2), italic: !!(p & 1), underline: ((p >> 2) & 3) === 1 || ((p >> 2) & 3) === 3,
      strike: ((p >> 18) & 7) !== 0 || ((p >> 2) & 3) === 2,
      sup: !!(p & (1 << 15)), sub: !!(p & (1 << 16)), color: s.text, bg: s.shade, spacing: s.spacing, ratio: s.ratio,
    };
    return cs;
  }

  function paraStyle(info, id, styleId) {
    const s = info.paraShapes[id] || {};
    const st = info.styles[styleId];
    return { align: s.align, left: s.left || 0, right: s.right || 0, indent: s.indent || 0, before: s.before || 0, after: s.after || 0,
      lsType: s.lsType || 'PERCENT', ls: s.ls || 160, style: st ? st.name : '', outline: s.heading === 1 ? s.level + 1 : 0,
      list: s.heading === 2 ? 'number' : s.heading === 3 ? 'bullet' : undefined };
  }

  // 문단 기록 하나 → 모델 문단
  function paragraph(ctx, rec) {
    const c = new R(rec.data);
    c.u32(); c.u32();
    const paraShape = c.u16(), styleId = c.u8(), brk = c.u8();
    let units = null, shapes = [[0, 0]];
    const ctrls = [];
    for (const ch of rec.children) {
      if (ch.tag === T.PARA_TEXT) units = new Uint16Array(ch.data.buffer.slice(ch.data.byteOffset, ch.data.byteOffset + (ch.data.length & ~1)));
      else if (ch.tag === T.PARA_CHAR_SHAPE) {
        const r = new R(ch.data); shapes = [];
        while (r.left >= 8) shapes.push([r.u32(), r.u32()]);
      } else if (ch.tag === T.CTRL_HEADER) ctrls.push(ch);
    }
    const para = Object.assign({ t: 'p', runs: [] }, paraStyle(ctx.info, paraShape, styleId));
    if (brk & 4) para.pageBreak = true;
    if (!units) return para;
    let si = 0, buf = '', bufCs = null, link = null, ci = 0;
    const csAt = pos => { while (si + 1 < shapes.length && shapes[si + 1][0] <= pos) si++; return shapes[si][1]; };
    const flush = () => {
      if (buf) { const run = { t: 'text', text: buf, cs: charStyle(ctx.info, bufCs) }; if (link) run.href = link; para.runs.push(run); }
      buf = '';
    };
    for (let i = 0; i < units.length;) {
      const u = units[i], csId = csAt(i);
      if (u >= 32) {
        if (csId !== bufCs) { flush(); bufCs = csId; }
        buf += String.fromCharCode(u); i++;
        continue;
      }
      if ([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31].includes(u)) {
        if (u === 10) { flush(); para.runs.push({ t: 'br' }); }
        else if (u === 30 || u === 31) { if (csId !== bufCs) { flush(); bufCs = csId; } buf += u === 30 ? ' ' : ' '; }
        else if (u === 24) { if (csId !== bufCs) { flush(); bufCs = csId; } buf += '-'; }
        i++;
        continue;
      }
      flush();
      if (u === 9) para.runs.push({ t: 'tab' });
      else if (u === 4) link = null;
      else if (![5, 6, 7, 8, 19, 20].includes(u)) {
        const ctrl = ctrls[ci++];
        if (ctrl) {
          const r = control(ctx, ctrl, para, charStyle(ctx.info, csId));
          if (r && r.href !== undefined) link = r.href;
          else if (r) para.runs.push(r);
        }
      }
      i += 8;
    }
    flush();
    return para;
  }

  function paragraphs(ctx, list) {
    const out = [];
    for (const r of list) if (r.tag === T.PARA_HEADER) out.push(paragraph(ctx, r));
    return out;
  }

  // LIST_HEADER 다음에 오는 문단들을 묶는다
  function lists(children) {
    const out = [];
    let cur = null;
    for (const r of children) {
      if (r.tag === T.LIST_HEADER) { cur = { head: r, paras: [] }; out.push(cur); }
      else if (r.tag === T.PARA_HEADER && cur) cur.paras.push(r);
    }
    return out;
  }

  function control(ctx, rec, para, cs) {
    const c = new R(rec.data);
    const id = ctrlId(c.u32());
    switch (id) {
      case 'secd': {
        for (const ch of rec.children) if (ch.tag === T.PAGE_DEF && !ctx.doc.pageSet) {
          const r = new R(ch.data);
          const pg = { w: r.u32(), h: r.u32(), ml: r.u32(), mr: r.u32(), mt: r.u32(), mb: r.u32(), mh: r.u32(), mf: r.u32(), gutter: r.u32() };
          const props = r.u32();
          if (props & 1) { const w = pg.w; pg.w = pg.h; pg.h = w; pg.landscape = true; }
          ctx.doc.page = pg; ctx.doc.pageSet = true;
        }
        return null;
      }
      case 'tbl ': return table(ctx, rec);
      case 'gso ': return shape(ctx, rec);
      case 'head': case 'foot': {
        const props = c.u32();
        const which = props & 3; // 0 양쪽, 1 짝수, 2 홀수
        const l = lists(rec.children)[0];
        if (l && (which === 0 || !ctx.doc[id === 'head' ? 'header' : 'footer'])) ctx.doc[id === 'head' ? 'header' : 'footer'] = paragraphs(ctx, l.paras);
        return null;
      }
      case 'fn  ': case 'en  ': {
        const l = lists(rec.children)[0];
        return { t: 'note', end: id === 'en  ', blocks: l ? paragraphs(ctx, l.paras) : [] };
      }
      case 'pgnp': { const props = c.u32(); const pos = (props >> 8) & 0xF; ctx.doc.pageNum = PAGE_POS[pos] || 'BOTTOM_CENTER'; return null; }
      case '%hlk': {
        c.u32(); c.u8();
        const cmd = c.wstr();
        return { href: cmd.split(';')[0].replace(/\\:/g, ':') };
      }
      case 'atno': {
        const props = c.u32();
        if ((props & 0xF) === 0) return { t: 'pagenum', cs };
        return null;
      }
      case 'eqed': {
        for (const ch of rec.children) if (ch.tag === T.EQEDIT) {
          const r = new R(ch.data); r.u32();
          return { t: 'eq', script: r.wstr(), cs };
        }
        return null;
      }
    }
    return null;
  }
  const PAGE_POS = [null, 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT', 'OUTSIDE_TOP', 'OUTSIDE_BOTTOM', 'INSIDE_TOP', 'INSIDE_BOTTOM'];

  function table(ctx, rec) {
    const tbl = { t: 'table', cells: [], rows: 0, cols: 0 };
    const common = new R(rec.data); common.u32(); common.u32(); common.i32(); common.i32();
    tbl.w = common.u32();
    for (const ch of rec.children) if (ch.tag === T.TABLE) {
      const r = new R(ch.data); r.u32(); tbl.rows = r.u16(); tbl.cols = r.u16();
    }
    // 표 기록(TABLE) 앞의 목록은 캡션이다
    const ti = rec.children.findIndex(ch => ch.tag === T.TABLE);
    const caption = lists(rec.children.slice(0, Math.max(0, ti)))[0];
    if (caption) tbl.caption = paragraphs(ctx, caption.paras);
    for (const l of lists(rec.children.slice(ti + 1))) {
      const r = new R(l.head.data);
      r.u16(); const lp = r.u32(); r.u16();
      const cell = { c: r.u16(), r: r.u16(), cs: r.u16() || 1, rs: r.u16() || 1, w: r.u32(), h: r.u32() };
      r.i16(); r.i16(); r.i16(); r.i16();
      const bf = ctx.info.borderFills[r.u16()];
      cell.valign = ['top', 'middle', 'bottom'][(lp >> 21) & 3] || 'middle';
      if (bf) { cell.bg = bf.bg; cell.border = borders(bf); }
      cell.blocks = paragraphs(ctx, l.paras);
      tbl.cells.push(cell);
    }
    return tbl;
  }

  const LINE = ['solid', 'solid', 'dashed', 'dotted', 'dashed', 'dashed', 'dashed', 'double', 'double', 'double', 'double', 'solid', 'solid'];
  const WIDTH_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
  function borders(bf) {
    const one = l => !l || l.type === 0 ? 'none' : `${WIDTH_MM[l.width] || 0.12}mm ${LINE[l.type] || 'solid'} ${l.color || '#000'}`;
    return { l: one(bf.left), r: one(bf.right), t: one(bf.top), b: one(bf.bottom) };
  }

  function findAll(rec, tag, out = []) {
    for (const ch of rec.children) { if (ch.tag === tag) out.push(ch); findAll(ch, tag, out); }
    return out;
  }

  function shape(ctx, rec) {
    const c = new R(rec.data); c.u32(); c.u32(); c.i32(); c.i32();
    const w = c.u32(), h = c.u32();
    const pic = findAll(rec, T.PICTURE)[0];
    if (pic) {
      const r = new R(pic.data); r.p = 71;
      const binId = r.u16();
      const bin = ctx.info.bins[binId - 1];
      if (bin && bin.kind === 1) {
        const ext = bin.ext || 'png';
        const name = 'BIN' + bin.id.toString(16).toUpperCase().padStart(4, '0') + '.' + ext;
        let data = ctx.files['BinData/' + name];
        if (data) {
          if ((bin.compress === 0 && ctx.compressed) || bin.compress === 1) { try { data = pako.inflateRaw(data); } catch (e) { } }
          const key = 'img' + (Object.keys(ctx.doc.bins).length + 1);
          ctx.doc.bins[key] = { data, ext };
          return { t: 'img', bin: key, w, h };
        }
      }
      return null;
    }
    // 글상자: 도형 안의 문단
    const comp = rec.children.find(x => x.tag === T.SHAPE_COMPONENT);
    if (comp) {
      const l = lists(comp.children)[0];
      if (l) return { t: 'box', w, h, blocks: paragraphs(ctx, l.paras) };
    }
    return null;
  }

  function read(bytes) {
    const files = Cfb.read(bytes);
    const fh = files.FileHeader;
    if (!fh) throw new Error('HWP 5.0 문서가 아니에요');
    const sig = new TextDecoder('latin1').decode(fh.subarray(0, 17));
    if (sig !== 'HWP Document File') throw new Error('HWP 5.0 문서가 아니에요');
    const flags = new DataView(fh.buffer, fh.byteOffset).getUint32(36, true);
    if (flags & 2) throw new Error('암호가 걸린 문서는 열 수 없어요');
    if (flags & 4) throw new Error('배포용 문서(복사·편집 막힘)는 열 수 없어요');
    const compressed = !!(flags & 1);
    const unz = b => compressed ? pako.inflateRaw(b) : b;
    const info = docInfo(records(unz(files.DocInfo)));
    const doc = Model.empty();
    doc.blocks = [];
    const ctx = { info, doc, files, compressed };
    for (let i = 0; files['BodyText/Section' + i]; i++) {
      const roots = records(unz(files['BodyText/Section' + i]));
      const paras = paragraphs(ctx, roots);
      if (i > 0 && paras.length) paras[0].pageBreak = true;
      doc.blocks.push(...paras);
    }
    if (!doc.blocks.length) doc.blocks.push(Model.para());
    delete doc.pageSet;
    return doc;
  }

  return { read, records, ctrlId };
})();
