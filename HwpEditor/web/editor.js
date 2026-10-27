// 편집기 핵심: 쪽 화면, 쪽 나누기 계산, 되돌리기, 글자·문단 모양, 넣기, 표 편집, 찾기
'use strict';

const Ed = (() => {
  const el = document.getElementById('doc');
  const masksEl = document.getElementById('masks'), gridEl = document.getElementById('grid');
  const stage = document.getElementById('stage'), sizer = document.getElementById('sizer'), sheetsEl = document.getElementById('sheets'), view = document.getElementById('view');
  const PX = 75;          // 1px = 75 HWPUNIT (96dpi)
  const GAP = 18, PAD = 18;
  const st = {
    doc: Model.empty(), zoom: 1, pageView: true, overwrite: false, readOnly: false, dirty: false,
    pages: 1, urls: {}, cellSel: null, painter: null, onChange: null, onLayout: null,
  };

  // ---------- 그림 주소 ----------
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', wmf: 'image/wmf', emf: 'image/emf' };
  function binUrl(key) {
    if (st.urls[key]) return st.urls[key];
    const b = st.doc.bins[key];
    if (!b) return '';
    st.urls[key] = URL.createObjectURL(new Blob([b.data], { type: MIME[b.ext] || 'application/octet-stream' }));
    return st.urls[key];
  }
  function addBin(data, ext) {
    let n = Object.keys(st.doc.bins).length + 1;
    while (st.doc.bins['img' + n]) n++;
    const key = 'img' + n;
    st.doc.bins[key] = { data, ext: (ext || 'png').toLowerCase().replace('jpeg', 'jpg') };
    return key;
  }

  // ---------- 불러오기·내보내기 ----------
  function load(doc) {
    for (const k in st.urls) URL.revokeObjectURL(st.urls[k]);
    st.urls = {};
    st.doc = doc;
    el.innerHTML = Model.toHtml(doc.blocks, doc, binUrl);
    delete doc.blocks;
    st.cellSel = null;
    hist.reset();
    st.dirty = false;
    layout();
    placeCaret(el.querySelector('p') || el, 0);
    view.scrollTop = 0;
  }
  function toModel() {
    clearPagination();
    const blocks = Model.fromDom(el, st.doc);
    paginateSoon();
    return Object.assign({}, st.doc, { blocks });
  }
  function cleanHtml() {
    const c = el.cloneNode(true);
    c.querySelectorAll('.pgap').forEach(e => e.remove());
    c.querySelectorAll('[data-push]').forEach(e => { e.style.marginTop = ''; e.removeAttribute('data-push'); if (!e.getAttribute('style')) e.removeAttribute('style'); });
    c.querySelectorAll('.cellsel').forEach(e => e.classList.remove('cellsel'));
    c.querySelectorAll('.picked').forEach(e => e.classList.remove('picked'));
    c.normalize();
    return c.innerHTML;
  }

  // ---------- 화면 배치: 쪽, 머리말·꼬리말, 쪽 번호 ----------
  const geo = () => {
    const p = st.doc.page;
    const W = p.w / PX, H = p.h / PX;
    return { W, H, left: (p.ml + (p.gutter || 0)) / PX, top: (p.mt + p.mh) / PX, bodyW: (p.w - p.ml - p.mr - (p.gutter || 0)) / PX,
      bodyH: Math.max(40, (p.h - p.mt - p.mh - p.mb - p.mf) / PX), stride: H + GAP };
  };

  function clearPagination() {
    el.querySelectorAll('.pgap').forEach(s => { const p = s.parentNode; s.remove(); if (p && p.tagName === 'P') p.normalize(); });
    el.querySelectorAll('[data-push]').forEach(e => { e.style.marginTop = ''; e.removeAttribute('data-push'); if (!e.getAttribute('style')) e.removeAttribute('style'); });
  }

  // 문단 p 안에서 아래 끝이 y(쪽 나누기 전 문서 좌표)를 넘는 첫 줄의 시작 글자
  function lineOver(p, y, docTop, scale) {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const pos = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest('.fn,.eq,.pgn')) continue;
      for (let i = 0; i < n.length; i++) pos.push([n, i]);
    }
    if (!pos.length) return null;
    const r = document.createRange();
    const box = ([n, i]) => {
      r.setStart(n, i); r.setEnd(n, i + 1);
      const rects = r.getClientRects();
      const rc = rects[rects.length - 1] || r.getBoundingClientRect();
      return { top: (rc.top - docTop) / scale, bottom: (rc.bottom - docTop) / scale };
    };
    let lo = 0, hi = pos.length - 1;
    if (box(pos[hi]).bottom <= y) return null;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (box(pos[mid]).bottom > y) hi = mid; else lo = mid + 1;
    }
    // 그 줄의 첫 글자까지 거슬러 올라간다
    const lineTop = box(pos[lo]).top;
    while (lo > 0 && Math.abs(box(pos[lo - 1]).top - lineTop) < 1) lo--;
    if (lo === 0) return null;
    return { node: pos[lo][0], offset: pos[lo][1], top: lineTop };
  }

  let pagTimer = 0;
  function paginateSoon() { clearTimeout(pagTimer); pagTimer = setTimeout(layout, 120); }

  // 쪽 나누기: 문서 위에서부터 쪽 끝을 넘는 첫 문단을 찾아 다음 쪽으로 넘기기를 되풀이한다.
  // 표 안(칸 안)의 문단도 똑같이 줄 단위로 넘긴다. 넘긴 자리는 .pgap(저장되지 않는 빈칸)으로 채운다.
  function paginate(g, reserve) {
    const scale = st.zoom;
    const stuck = new Set();
    const spacer = (before, h) => {
      const d = document.createElement('div');
      d.className = 'pgap'; d.contentEditable = 'false';
      d.style.height = Math.ceil(h + 0.5) + 'px';
      before.parentNode.insertBefore(d, before);
    };
    const tries = new Map(), pbDone = new Set();
    // 가운데·아래 맞춤 칸에서 글이 칸보다 짧아 떠 있으면 나누지 않는다 (밀수록 같이 내려가 끝이 없다)
    const floating = node => {
      const td = node.closest('td,th');
      if (!td || !el.contains(td)) return false;
      const va = getComputedStyle(td).verticalAlign;
      if (va === 'top' || va === 'baseline') return false;
      const kids = [...td.children].filter(k => !k.classList.contains('pgap'));
      if (!kids.length) return false;
      const used = kids[kids.length - 1].getBoundingClientRect().bottom - kids[0].getBoundingClientRect().top;
      const cs = getComputedStyle(td);
      const room = td.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return room - used > 2 * scale;
    };
    const t0 = performance.now();
    for (let iter = 0; iter < 3000; iter++) {
      if (performance.now() - t0 > 6000) break;           // 아주 큰 문서에서 멈추지 않게
      const dt = el.getBoundingClientRect().top;
      let best = null;
      const pageOf = y => Math.max(0, Math.floor((y + 2) / g.stride));
      const endOf = pg => pg * g.stride + g.bodyH - ((reserve && reserve[pg]) || 0);
      const rg = document.createRange();
      const consider = (node, kind) => {
        if (stuck.has(node)) return;
        const r = node.getBoundingClientRect();
        if (!r.height && !r.width) return;
        const top = (r.top - dt) / scale, bottom = (r.bottom - dt) / scale;
        if (best && top >= best.top) return;
        const page = pageOf(top), start = page * g.stride, end = endOf(page);
        if (kind === 'pb') { if (top > start + 2) best = { node, kind, top, page }; return; }
        if (top <= end - 0.5 && bottom <= end + 1) return;          // 한 쪽 안에 다 들어 있다
        // 줄마다 본다: 이미 나눠 둔 문단은 여러 쪽에 걸쳐 있어도 괜찮다
        const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let first = null, line = null;
        for (let t = w.nextNode(); t && !line; t = w.nextNode()) {
          if (!t.length) continue;
          rg.selectNodeContents(t);
          for (const rc of rg.getClientRects()) {
            if (!rc.height) continue;
            const lt = (rc.top - dt) / scale, lb = (rc.bottom - dt) / scale;
            if (first === null) first = lt;
            const pg = pageOf(lt), e = endOf(pg);
            if (lt > e - 0.5 || lb > e + 1) { line = { lt, pg }; break; }
          }
        }
        if (first === null) {                                       // 글자 없는 문단(그림만 등)
          if (!best || top < best.top) best = { node, kind, top, page, whole: true, bottom };
          return;
        }
        if (!line) return;
        if (best && line.lt >= best.top) return;
        best = { node, kind, top: line.lt, page: line.pg, whole: line.lt <= first + 2, pTop: top, bottom };
      };
      for (const k of el.querySelectorAll(':scope > [data-pb]')) if (k !== el.firstElementChild && !pbDone.has(k)) consider(k, 'pb');
      for (const p of el.querySelectorAll('p')) consider(p, 'p');
      if (!best) break;
      const { node, kind, top, page } = best;
      const next = (page + 1) * g.stride;
      const n = (tries.get(node) || 0) + 1;
      tries.set(node, n);
      if (n > 30) { stuck.add(node); continue; }
      if (kind === 'pb') { spacer(node, next - top); pbDone.add(node); continue; }
      if (floating(node)) {
        // 가운데 맞춤 칸: 앞에 두 배 높이를 넣으면 글이 다음 쪽 맨 위로 온다 (한 번만)
        if (getComputedStyle(node.closest('td,th')).verticalAlign === 'middle' && n === 1) spacer(node, 2 * (next - top));
        else stuck.add(node);
        continue;
      }
      if (best.whole) {
        // 첫 줄부터 넘치면 문단째 다음 쪽으로 (이미 쪽 맨 위면 그대로 둔다)
        const pTop = best.pTop !== undefined ? best.pTop : top;
        const pg = pageOf(pTop);
        if (pTop > pg * g.stride + 2) spacer(node, (pg + 1) * g.stride - pTop);
        else stuck.add(node);
        continue;
      }
      // 줄 단위로 나누기: 넘치는 줄 앞에 빈칸을 끼운다
      const ls = lineOver(node, endOf(page), dt, scale);
      if (ls && ls.top < next) {
        const rest = ls.offset > 0 ? ls.node.splitText(ls.offset) : ls.node;
        const gap = document.createElement('span');
        gap.className = 'pgap'; gap.contentEditable = 'false';
        gap.style.cssText = `display:block;height:${Math.max(1, Math.ceil(next - ls.top + 0.5))}px;text-indent:0`;
        rest.parentNode.insertBefore(gap, rest);
      } else stuck.add(node);
    }
  }

  function groupNotes(g, fns) {
    const dt = el.getBoundingClientRect().top, out = {};
    fns.forEach((f, i) => {
      const pg = Math.max(0, Math.floor(((f.getBoundingClientRect().top - dt) / st.zoom + 2) / g.stride));
      (out[pg] = out[pg] || []).push({ n: i + 1, text: f.dataset.note || '' });
    });
    return out;
  }
  const notesHtml = list => list.map(x => `<p>${x.n}) ${Model.esc(x.text)}</p>`).join('');
  function noteHeights(g, groups) {
    const probe = document.createElement('div');
    probe.className = 'fnotes';
    probe.style.cssText = `position:absolute;visibility:hidden;width:${g.bodyW}px;left:0;top:0`;
    masksEl.appendChild(probe);
    const out = {};
    for (const k in groups) { probe.innerHTML = notesHtml(groups[k]); out[k] = probe.offsetHeight + 6; }
    probe.remove();
    return out;
  }

  // 문서에 정해 둔 문단 번호 모양대로 번호 글자를 붙인다 (한글처럼 같은 번호 모양은 문서 끝까지 이어진다)
  function renumber() {
    const nb = st.doc.numbering;
    if (!nb || !nb.defs) return;
    const counters = {};
    for (const p of el.querySelectorAll('p[data-numid], p[data-outline]')) {
      let id, lv;
      if (p.dataset.numid) { id = p.dataset.numid; lv = +p.dataset.numlv || 0; }
      else { id = nb.outline; lv = (+p.dataset.outline || 1) - 1; }
      const def = nb.defs[id];
      if (!def) { if (p.dataset.label) delete p.dataset.label; continue; }
      const c = counters[id] = counters[id] || [];
      c[lv] = c[lv] === undefined ? ((def.levels[lv] && def.levels[lv].start) || 1) : c[lv] + 1;
      for (let k = lv + 1; k < 10; k++) c[k] = undefined;
      const label = Model.numLabel(def, lv, c);
      if (p.dataset.label !== label) p.dataset.label = label;
    }
  }

  function layout() {
    clearTimeout(pagTimer);
    renumber();
    const g = geo();
    Object.assign(el.style, { left: (PAD + g.left) + 'px', top: (PAD + g.top) + 'px', width: g.bodyW + 'px' });
    const sel = saveSelOffsets();
    clearPagination();
    const kids = [...el.children];
    let pages = 1;
    if (st.pageView) {
      paginate(g, null);
      // 각주: 쪽마다 아래에 둘 자리를 비워 두고 다시 나눈다
      st.noteGroups = null;
      const fns = [...el.querySelectorAll('.fn:not([data-end])')];
      if (fns.length) {
        let groups = groupNotes(g, fns), reserve = noteHeights(g, groups);
        clearPagination();
        paginate(g, reserve);
        groups = groupNotes(g, fns);
        const again = noteHeights(g, groups);
        for (const k in again) reserve[k] = Math.max(reserve[k] || 0, again[k]);
        st.noteGroups = groups; st.noteReserve = reserve;
      }
      const bottom = el.offsetHeight;
      pages = Math.max(pages, Math.floor(Math.max(0, bottom - 1) / g.stride) + 1);
    }
    restoreSelOffsets(sel);
    const contentH = el.offsetHeight;
    const notes = [...el.querySelectorAll(st.pageView ? '.fn[data-end]' : '.fn')];      // 쪽 윤곽에선 미주만 끝에
    const notesH = notes.length ? 20 + notes.length * 18 : 0;
    if (!st.pageView) pages = 1;
    const totalH = st.pageView ? pages * g.stride - GAP : Math.max(g.H, g.top + contentH + notesH + st.doc.page.mb / PX + 40);
    if (st.pageView && notes.length) {
      const last = Math.floor((contentH + notesH) / g.stride) + 1;
      pages = Math.max(pages, last);
    }
    st.pages = pages;
    drawSheets(g, pages, st.pageView ? null : totalH, notes);
    let w = g.W + PAD * 2, h = (st.pageView ? pages * g.stride - GAP : totalH) + PAD * 2;
    const cols = gridCols(g);
    st.grid = cols >= 2;
    el.style.visibility = st.grid ? 'hidden' : '';
    sheetsEl.style.display = masksEl.style.display = st.grid ? 'none' : '';
    if (st.grid) {
      drawGrid(g, pages, cols);
      const rows = Math.ceil(pages / cols);
      w = cols * (g.W + GAP) - GAP + PAD * 2; h = rows * (g.H + GAP) - GAP + PAD * 2;
    } else if (gridEl.firstChild) { gridEl.innerHTML = ''; if (gridObs) gridObs.disconnect(); }
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    stage.style.transform = `scale(${st.zoom})`;
    sizer.style.width = w * st.zoom + 'px'; sizer.style.height = h * st.zoom + 'px';
    if (st.onLayout) st.onLayout();
  }

  const toRoman = n => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n - 1] || String(n);
  function hfHtml(blocks, pageNo) {
    if (!blocks || !blocks.length) return '';
    return Model.toHtml(blocks, st.doc, binUrl).replace(/<span class="pgn"[^>]*>#<\/span>/g, String(pageNo));
  }

  function drawSheets(g, n, contHeight, notes) {
    const p = st.doc.page;
    let h = '', m = '';
    const hdr = st.doc.header, ftr = st.doc.footer;
    const bodyBottom = g.top + g.bodyH;                     // 쪽 위에서 본문 끝까지
    for (let i = 0; i < n; i++) {
      const top = PAD + i * g.stride, H = contHeight || g.H;
      h += `<div class="sheet" style="top:${top}px;left:${PAD}px;width:${g.W}px;height:${H}px">` +
        `<div class="guide" style="left:${g.left}px;top:${g.top}px;width:${g.bodyW}px;height:${contHeight ? H - g.top - (p.mb + p.mf) / PX : g.bodyH}px"></div></div>`;
      // 본문 위·아래 여백과 쪽 사이 틈은 글 위에 덮는다 (쪽을 넘는 표 테두리 등이 비치지 않게)
      let hf = '';
      if (hdr && hdr.length) hf += `<div class="hf" style="left:${g.left}px;top:${p.mt / PX}px;width:${g.bodyW}px;height:${p.mh / PX}px">${hfHtml(hdr, i + 1)}</div>`;
      let ff = '';
      if (ftr && ftr.length) ff += `<div class="hf" style="left:${g.left}px;bottom:${p.mb / PX}px;width:${g.bodyW}px;height:${p.mf / PX}px;display:flex;flex-direction:column;justify-content:flex-end">${hfHtml(ftr, i + 1)}</div>`;
      if (st.doc.pageNum) {
        const pos = st.doc.pageNum;
        let align = /LEFT/.test(pos) ? 'left' : /RIGHT/.test(pos) ? 'right' : 'center';
        if (/OUTSIDE/.test(pos)) align = (i % 2 === 0) ? 'right' : 'left';
        if (/INSIDE/.test(pos)) align = (i % 2 === 0) ? 'left' : 'right';
        const style = align === 'center' ? `left:${g.left}px;width:${g.bodyW}px;text-align:center` : align === 'left' ? `left:${g.left}px` : `right:${p.mr / PX}px`;
        const num = `<div class="pgno" style="${style};${/TOP/.test(pos) ? `top:${p.mt / PX}px` : `bottom:${(p.mb + p.mf / 2) / PX}px`}">- ${i + 1} -</div>`;
        if (/TOP/.test(pos)) hf += num; else ff += num;
      }
      if (contHeight) { h = h.replace(/<\/div>$/, hf + ff + '</div>'); continue; }
      m += `<div class="mask mtop" style="top:${top}px;left:${PAD}px;width:${g.W}px;height:${g.top}px">${hf}</div>`;
      m += `<div class="mask mbot" style="top:${top + bodyBottom}px;left:${PAD}px;width:${g.W}px;height:${g.H - bodyBottom}px">${ff}</div>`;
      if (i < n - 1) m += `<div class="mask gapm" style="top:${top + g.H}px;left:0;width:100%;height:${GAP}px"></div>`;
      const fg = st.noteGroups && st.noteGroups[i];
      if (fg) { const rh = st.noteReserve[i]; m += `<div class="mask fnotes" data-page="${i}" style="top:${top + bodyBottom - rh}px;left:${PAD + g.left}px;width:${g.bodyW}px;height:${rh}px">${notesHtml(fg)}</div>`; }
    }
    if (notes.length) {
      // 각주·미주는 문서 끝에 모아서 보여 준다
      const y = PAD + g.top + el.offsetHeight + 12;
      h += `<div class="sheet-notes" style="position:absolute;left:${PAD + g.left}px;top:${y}px;width:${g.bodyW * 0.5}px;font:9pt/1.5 '함초롬바탕',serif;color:#000;border-top:0.5pt solid #000;padding-top:3pt">` +
        notes.map((f, i) => `<p style="margin:0">${st.pageView ? toRoman(i + 1) : i + 1}) ${Model.esc(f.dataset.note || '')}</p>`).join('') + '</div>';
    }
    sheetsEl.innerHTML = h;
    masksEl.innerHTML = m;
  }

  // 쪽 모아보기: 화면을 줄여 두 쪽 이상이 옆으로 들어가면 쪽을 바둑판처럼 늘어놓는다
  function gridCols(g) {
    if (!st.pageView || st.pages < 2) return 1;
    const room = view.clientWidth / st.zoom - PAD * 2 + GAP;
    return Math.max(1, Math.min(st.pages, Math.floor(room / (g.W + GAP))));
  }
  let gridObs = null;
  function drawGrid(g, n, cols) {
    if (gridObs) gridObs.disconnect();
    const p = st.doc.page;
    let h = '';
    for (let i = 0; i < n; i++) {
      const x = PAD + (i % cols) * (g.W + GAP), y = PAD + Math.floor(i / cols) * (g.H + GAP);
      h += `<div class="sheet" data-page="${i + 1}" style="top:${y}px;left:${x}px;width:${g.W}px;height:${g.H}px"><div class="pcard" style="width:${g.W}px;height:${g.H}px"></div></div>`;
    }
    gridEl.innerHTML = h;
    gridEl.className = 'pagegrid';
    // 보이는 쪽만 내용을 채운다 (쪽이 많아도 가볍게)
    const fill = card => {
      if (card.dataset.filled) return;
      card.dataset.filled = '1';
      const i = +card.parentNode.dataset.page - 1;
      const c = el.cloneNode(true);
      c.removeAttribute('contenteditable'); c.style.visibility = 'visible';
      c.style.left = g.left + 'px'; c.style.top = (g.top - i * g.stride) + 'px';
      c.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
      const top = `<div class="mask" style="top:0;left:0;width:${g.W}px;height:${g.top}px"></div>`;
      const bot = `<div class="mask" style="top:${g.top + g.bodyH}px;left:0;width:${g.W}px;height:${g.H - g.top - g.bodyH}px"></div>`;
      card.appendChild(c);
      card.insertAdjacentHTML('beforeend', top + bot);
      const mt = masksEl.querySelectorAll('.mtop')[i], mb = masksEl.querySelectorAll('.mbot')[i];
      if (mt) card.lastElementChild.previousElementSibling.innerHTML = mt.innerHTML;
      if (mb) card.lastElementChild.innerHTML = mb.innerHTML;
      const fn = masksEl.querySelector(`.fnotes[data-page="${i}"]`);
      if (fn) { const d = fn.cloneNode(true); d.style.top = (parseFloat(fn.style.top) - PAD - i * g.stride) + 'px'; d.style.left = g.left + 'px'; card.appendChild(d); }
    };
    gridObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) fill(e.target); }), { root: view, rootMargin: '400px' }) : null;
    gridEl.querySelectorAll('.pcard').forEach(c => gridObs ? gridObs.observe(c) : fill(c));
  }
  gridEl.addEventListener('click', e => {
    const sh = e.target.closest('.sheet'); if (!sh) return;
    const n = +sh.dataset.page;
    fitWidth();
    if (st.grid) setZoom(Math.max(st.zoom, 0.5), false);
    gotoPage(n);
  });

  function setZoom(z, keepCenter) {
    z = Math.max(0.1, Math.min(3, z));
    const g0 = geo(), old = st.zoom;
    const wasCols = st.grid ? gridCols(g0) : 1;
    st.zoom = z;
    const nowCols = gridCols(g0);
    if (nowCols !== wasCols && (nowCols >= 2 || wasCols >= 2)) { layout(); return; }
    const cx = view.scrollLeft + view.clientWidth / 2, cy = view.scrollTop + view.clientHeight / 2;
    const ratio = z / old;
    const g = geo();
    stage.style.transform = `scale(${z})`;
    const w = parseFloat(stage.style.width) || g.W + PAD * 2, h = parseFloat(stage.style.height) || g.H + PAD * 2;
    sizer.style.width = w * z + 'px'; sizer.style.height = h * z + 'px';
    if (keepCenter !== false) { view.scrollLeft = cx * ratio - view.clientWidth / 2; view.scrollTop = cy * ratio - view.clientHeight / 2; }
    if (st.onLayout) st.onLayout();
  }
  const fitWidth = () => setZoom((view.clientWidth - 6) / (geo().W + PAD * 2), false);
  const fitPage = () => { const g = geo(); setZoom(Math.min((view.clientWidth - 6) / (g.W + PAD * 2), (view.clientHeight - 6) / (g.H + PAD * 2)), false); };

  // ---------- 선택 영역 ----------
  const sel = () => window.getSelection();
  const inDoc = n => n && (n === el || el.contains(n));
  function range() {
    const s = sel();
    if (!s.rangeCount) return null;
    const r = s.getRangeAt(0);
    return inDoc(r.commonAncestorContainer) ? r : null;
  }
  let saved = null;
  function saveSel() { const r = range(); if (r) saved = r.cloneRange(); }
  function restoreSel() {
    if (!saved) return false;
    el.focus({ preventScroll: true });
    const s = sel(); s.removeAllRanges(); s.addRange(saved);
    return true;
  }
  function ensureSel() {
    if (range()) return true;
    if (restoreSel() && range()) return true;
    el.focus({ preventScroll: true });
    placeCaret(el.querySelector('p') || el, 0);
    return !!range();
  }
  function placeCaret(node, offset) {
    const r = document.createRange();
    try { r.setStart(node, offset); } catch (e) { r.selectNodeContents(node); r.collapse(true); }
    r.collapse(true);
    const s = sel(); s.removeAllRanges(); s.addRange(r);
  }
  function caretInto(block, atEnd) {
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n, last = null, first = null;
    while ((n = w.nextNode())) { if (!first) first = n; last = n; }
    if (atEnd && last) placeCaret(last, last.length);
    else if (first) placeCaret(first, 0);
    else placeCaret(block, 0);
  }
  // 글자 위치(텍스트 노드 기준)로 선택 저장 — 쪽 나누기·되돌리기 뒤에도 같은 곳
  function textPos(node, offset) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, count = 0;
    if (node.nodeType !== 3) {
      // 요소 안 offset번째 자식 앞
      const child = node.childNodes[offset];
      const marker = child || null;
      while ((n = w.nextNode())) {
        if (marker && (marker === n || (marker.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) || marker.contains(n))) break;
        if (!marker && !node.contains(n) && (node.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
        count += n.length;
      }
      return { count, blockHint: !child };
    }
    while ((n = w.nextNode())) { if (n === node) return { count: count + offset }; count += n.length; }
    return { count };
  }
  function nodeAt(count) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, last = null;
    while ((n = w.nextNode())) { if (count <= n.length) return [n, count]; count -= n.length; last = n; }
    return last ? [last, last.length] : [el, 0];
  }
  function saveSelOffsets() {
    const r = range();
    if (!r) return null;
    return { a: textPos(r.startContainer, r.startOffset), b: r.collapsed ? null : textPos(r.endContainer, r.endOffset), node: r.startContainer, off: r.startOffset };
  }
  function restoreSelOffsets(s) {
    if (!s || document.activeElement !== el) return;
    if (s.node && el.contains(s.node) && s.node.nodeType !== 3) { try { placeCaret(s.node, s.off); return; } catch (e) { } }
    const [n1, o1] = nodeAt(s.a.count);
    const r = document.createRange();
    r.setStart(n1, o1);
    if (s.b) { const [n2, o2] = nodeAt(s.b.count); r.setEnd(n2, o2); } else r.collapse(true);
    const x = sel(); x.removeAllRanges(); x.addRange(r);
  }

  // ---------- 되돌리기 ----------
  const hist = {
    stack: [], idx: -1, timer: 0,
    reset() { this.stack = []; this.idx = -1; this.push(); },
    snap() { return { html: cleanHtml(), meta: JSON.stringify({ page: st.doc.page, header: st.doc.header, footer: st.doc.footer, pageNum: st.doc.pageNum }), sel: saveSelOffsets() }; },
    push() {
      clearTimeout(this.timer);
      const s = this.snap();
      const top = this.stack[this.idx];
      if (top && top.html === s.html && top.meta === s.meta) { top.sel = s.sel; return false; }
      this.stack.length = this.idx + 1;
      this.stack.push(s);
      if (this.stack.length > 150) this.stack.shift();
      this.idx = this.stack.length - 1;
      if (this.idx > 0) { st.dirty = true; if (st.onChange) st.onChange(); }
      return true;
    },
    later() { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 500); },
    apply(s) {
      el.innerHTML = s.html;
      const m = JSON.parse(s.meta);
      Object.assign(st.doc, m);
      st.cellSel = null;
      layout();
      el.focus({ preventScroll: true });
      if (s.sel) restoreSelOffsets(s.sel);
      st.dirty = true;
      if (st.onChange) st.onChange();
    },
    undo() { this.push(); if (this.idx <= 0) return false; this.idx--; this.apply(this.stack[this.idx]); return true; },
    redo() { if (this.idx >= this.stack.length - 1) return false; this.idx++; this.apply(this.stack[this.idx]); return true; },
  };
  // 명령 하나를 한 번에 되돌릴 수 있게 묶는다
  function act(fn) {
    if (st.readOnly) return;
    hist.push();
    const r = fn();
    hist.push();
    paginateSoon();
    return r;
  }

  // ---------- 글자 모양 ----------
  const MARK = 'x-hwped-mark';
  function exec(cmd, val) {
    ensureSel();
    document.execCommand('styleWithCSS', false, true);
    return document.execCommand(cmd, false, val);
  }
  function inline(cmd, val) { return act(() => exec(cmd, val)); }

  // 선택한 글자에 CSS를 입힌다 (선택이 없으면 다음에 칠 글자에)
  function applyCss(styles) {
    return act(() => {
      ensureSel();
      const r = range();
      if (!r) return;
      if (r.collapsed) {
        const span = document.createElement('span');
        Object.assign(span.style, styles);
        span.textContent = '​';
        r.insertNode(span);
        placeCaret(span.firstChild, 1);
        return;
      }
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontName', false, MARK);
      document.execCommand('styleWithCSS', false, true);
      const made = [];
      for (const f of el.querySelectorAll(`font[face="${MARK}"]`)) {
        const span = document.createElement('span');
        Object.assign(span.style, styles);
        f.querySelectorAll('[style]').forEach(e => { for (const k in styles) e.style[k] = ''; });
        f.querySelectorAll(`font[face="${MARK}"]`).forEach(x => x.removeAttribute('face'));
        while (f.firstChild) span.appendChild(f.firstChild);
        f.replaceWith(span);
        made.push(span);
      }
      // 크롬이 span의 font-family로 바꿔 넣은 경우
      for (const s of el.querySelectorAll('span[style*="' + MARK + '"]')) {
        s.style.fontFamily = '';
        Object.assign(s.style, styles);
        made.push(s);
      }
      if (made.length) {
        const nr = document.createRange();
        nr.setStartBefore(made[0]); nr.setEndAfter(made[made.length - 1]);
        const s = sel(); s.removeAllRanges(); s.addRange(nr);
      }
    });
  }

  // 선택한 글자 하나하나의 현재 모양을 바탕으로 바꾼다 (글자 크게/작게, 자간)
  function mapSelected(fn) {
    return act(() => {
      ensureSel();
      const r = range();
      if (!r) return;
      if (r.collapsed) {
        const host = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
        const span = document.createElement('span');
        Object.assign(span.style, fn(getComputedStyle(host)));
        span.textContent = '​';
        r.insertNode(span);
        placeCaret(span.firstChild, 1);
        return;
      }
      const nodes = [];
      const w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) if (r.intersectsNode(n) && n.length) nodes.push(n);
      let first = null, last = null;
      nodes.forEach(n => {
        let t = n;
        if (t === r.endContainer && r.endOffset < t.length) t.splitText(r.endOffset);
        if (t === r.startContainer && r.startOffset > 0) t = t.splitText(r.startOffset);
        if (!t.length || t.parentElement.closest('.fn,.eq,.pgn,.pgap')) return;
        const span = document.createElement('span');
        Object.assign(span.style, fn(getComputedStyle(t.parentElement)));
        t.parentNode.insertBefore(span, t);
        span.appendChild(t);
        if (!first) first = span;
        last = span;
      });
      if (first) { const nr = document.createRange(); nr.setStartBefore(first); nr.setEndAfter(last); const s = sel(); s.removeAllRanges(); s.addRange(nr); }
    });
  }
  const sizeBy = d => mapSelected(cs => ({ fontSize: Math.max(1, Math.round((parseFloat(cs.fontSize) * 0.75 + d) * 10) / 10) + 'pt' }));
  const spacingBy = d => mapSelected(cs => {
    const fs = parseFloat(cs.fontSize), cur = (parseFloat(cs.letterSpacing) || 0) / fs * 100;
    return { letterSpacing: Math.max(-50, Math.min(50, Math.round(cur + d))) / 100 + 'em' };
  });

  // 현재 글자 모양 읽기 (서식 막대·대화 상자)
  function caretStyle() {
    const r = range() || saved;
    let n = r ? r.startContainer : el.querySelector('p');
    if (!n) return null;
    if (n.nodeType === 3) n = n.parentElement;
    else if (r && n.childNodes[r.startOffset] && n.childNodes[r.startOffset].nodeType === 1) n = n.childNodes[r.startOffset];
    if (!inDoc(n)) return null;
    const cs = Model.fromDom ? csAt(n) : null;
    return cs;
  }
  function csAt(n) {
    const c = getComputedStyle(n);
    const out = { font: c.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: Math.round(parseFloat(c.fontSize) * 0.75 * 10) / 10,
      bold: parseInt(c.fontWeight, 10) >= 600, italic: c.fontStyle === 'italic', color: Model.hex(c.color) || '#000000',
      spacing: Math.round((parseFloat(c.letterSpacing) || 0) / parseFloat(c.fontSize) * 100) };
    for (let e = n; e && e !== el; e = e.parentElement) {
      const d = e.style.textDecorationLine || e.style.textDecoration || '';
      if (e.tagName === 'U' || /underline/.test(d)) out.underline = true;
      if (/^(S|STRIKE|DEL)$/.test(e.tagName) || /line-through/.test(d)) out.strike = true;
      if (e.tagName === 'SUP') out.sup = true;
      if (e.tagName === 'SUB') out.sub = true;
      if (!out.bg) { const b = Model.hex(e.style.backgroundColor); if (b) out.bg = b; }
      if (!out.ratio && e.dataset && e.dataset.ratio) out.ratio = +e.dataset.ratio;
    }
    if (out.sup || out.sub) out.size = Math.round(out.size / 0.83 * 10) / 10;
    out.spacing = Math.round(out.spacing - ((out.ratio || 100) - 100) * Model.RATIO_K);
    return out;
  }

  // 글자 모양 대화 상자 결과를 한꺼번에 적용
  function setCharShape(cs) {
    act(() => {
      ensureSel();
      const r = range();
      if (!r) return;
      const css = { fontFamily: Model.fontCss(cs.font), fontSize: cs.size + 'pt', fontWeight: cs.bold ? 'bold' : 'normal', fontStyle: cs.italic ? 'italic' : 'normal',
        color: cs.color, letterSpacing: +Model.spacingEm(cs.spacing, cs.ratio).toFixed(4) + 'em', textDecoration: [cs.underline && 'underline', cs.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
        backgroundColor: cs.bg || '' };
      hist.push();
      applyCssNoHist(css, cs.ratio);
      // 위·아래 첨자
      const cur = caretStyle() || {};
      document.execCommand('styleWithCSS', false, true);
      if (!!cs.sup !== !!cur.sup) document.execCommand('superscript');
      if (!!cs.sub !== !!cur.sub) document.execCommand('subscript');
    });
  }
  function applyCssNoHist(styles, ratio) {
    const r = range();
    if (!r) return;
    if (r.collapsed) {
      const span = document.createElement('span');
      Object.assign(span.style, styles);
      if (ratio && ratio !== 100) span.dataset.ratio = ratio;
      span.textContent = '​';
      r.insertNode(span);
      placeCaret(span.firstChild, 1);
      return;
    }
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontName', false, MARK);
    document.execCommand('styleWithCSS', false, true);
    const made = [];
    for (const f of el.querySelectorAll(`font[face="${MARK}"]`)) {
      const span = document.createElement('span');
      Object.assign(span.style, styles);
      if (ratio && ratio !== 100) span.dataset.ratio = ratio;
      f.querySelectorAll('[style]').forEach(e => { for (const k in styles) e.style[k] = ''; });
      f.querySelectorAll('u,s,strike,b,i,strong,em').forEach(e => { e.replaceWith(...e.childNodes); });
      f.querySelectorAll('[data-ratio]').forEach(e => e.removeAttribute('data-ratio'));
      if (ratio === 100) span.dataset.ratio = '100';
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
      made.push(span);
    }
    for (const s of el.querySelectorAll('span[style*="' + MARK + '"]')) { Object.assign(s.style, styles); made.push(s); }
    if (made.length) { const nr = document.createRange(); nr.setStartBefore(made[0]); nr.setEndAfter(made[made.length - 1]); const s = sel(); s.removeAllRanges(); s.addRange(nr); }
  }

  // ---------- 문단 ----------
  function paras() {
    ensureSel();
    const r = range();
    if (!r) return [];
    let ps = [...el.querySelectorAll('p')].filter(p => r.intersectsNode(p));
    if (st.cellSel) ps = selectedCells().flatMap(td => [...td.querySelectorAll('p')]);
    if (!ps.length) {
      document.execCommand('formatBlock', false, 'p');
      const n = range() && range().startContainer;
      const p = n && (n.nodeType === 3 ? n.parentElement : n).closest('p');
      if (p) ps = [p];
    }
    return ps;
  }
  function paraOf(n) { if (!n) return null; if (n.nodeType === 3) n = n.parentElement; return n.closest ? n.closest('p') : null; }
  function curPara() { const r = range() || saved; return r ? paraOf(r.startContainer) : null; }
  function paraShape(p) {
    p = p || curPara();
    if (!p) return Model.para();
    return Model.fromDom ? paraFromEl(p) : null;
  }
  function paraFromEl(p) {
    const s = p.style;
    const hu = Model.huOf;
    const o = { align: s.textAlignLast === 'justify' ? 'distribute' : (['left', 'right', 'center'].includes(s.textAlign) ? s.textAlign : 'justify'), indent: hu(s.textIndent) };
    o.left = hu(s.paddingLeft) - (o.indent < 0 ? -o.indent : 0);
    o.right = hu(s.paddingRight); o.before = hu(s.paddingTop); o.after = hu(s.paddingBottom);
    const lh = s.lineHeight;
    if (/^[\d.]+$/.test(lh)) { o.lsType = 'PERCENT'; o.ls = Math.round(parseFloat(lh) * 100); }
    else if (/calc/.test(lh)) { o.lsType = 'BETWEEN_LINES'; o.ls = hu((/([\d.]+pt)\)/.exec(lh) || [])[1] || '0'); }
    else if (/pt|px/.test(lh)) { o.lsType = 'FIXED'; o.ls = hu(lh); }
    else { o.lsType = 'PERCENT'; o.ls = 160; }
    o.style = p.dataset.style || '바탕글';
    o.outline = +(p.dataset.outline || 0);
    o.list = p.dataset.list || '';
    const bg = Model.hex(s.backgroundColor), bd = ['Left', 'Right', 'Top', 'Bottom'].map(k => s['border' + k] || 'none');
    if (bg || bd.some(x => x && x !== 'none')) o.box = { bg, border: { l: bd[0], r: bd[1], t: bd[2], b: bd[3] } };
    return o;
  }
  function setParaCss(p, o) {
    const css = Model.paraCss(o);
    const keep = p.style.fontSize;
    p.removeAttribute('style');
    if (css) p.setAttribute('style', css);
    if (keep) p.style.fontSize = keep;
    if (!p.getAttribute('style')) p.removeAttribute('style');
  }
  function setParaShape(changes) {
    act(() => {
      for (const p of paras()) setParaCss(p, Object.assign(paraFromEl(p), changes));
    });
  }
  function align(a) { setParaShape({ align: a }); }
  function setStyle(name) {
    act(() => {
      for (const p of paras()) {
        const o = paraFromEl(p);
        o.style = name;
        o.indent = 0;
        const m = /^개요 (\d)$/.exec(name);
        o.left = name === '본문' ? 1500 : m ? 1000 * +m[1] : 0;
        if (m) { p.dataset.outline = m[1]; } else delete p.dataset.outline;
        if (name === '바탕글') delete p.dataset.style; else p.dataset.style = name;
        setParaCss(p, o);
      }
    });
  }
  function toggleList(kind) {
    act(() => {
      const ps = paras();
      const on = ps.every(p => p.dataset.list === kind);
      for (const p of ps) {
        const o = paraFromEl(p);
        if (on) { delete p.dataset.list; delete p.dataset.numid; delete p.dataset.numlv; delete p.dataset.label; delete p.dataset.bullet; o.indent = 0; }
        else { p.dataset.list = kind; o.indent = -2000; }
        setParaCss(p, o);
      }
    });
  }
  function indentBy(d) {
    act(() => { for (const p of paras()) { const o = paraFromEl(p); o.left = Math.max(0, o.left + d); setParaCss(p, o); } });
  }
  function lineSpacing(pct) { setParaShape({ lsType: 'PERCENT', ls: pct }); }
  function lineSpacingBy(d) {
    act(() => { for (const p of paras()) { const o = paraFromEl(p); if (o.lsType !== 'PERCENT') { o.lsType = 'PERCENT'; o.ls = 160; } o.ls = Math.max(50, Math.min(500, o.ls + d)); setParaCss(p, o); } });
  }

  // 모양 복사 (Alt+C): 처음엔 커서 자리 모양을 기억, 블록이 있으면 붙인다
  function painter() {
    const r = range();
    if (r && !r.collapsed && st.painter) {
      const pc = st.painter;
      setCharShape(pc.cs);
      setParaShape(Object.assign({}, pc.para, { style: undefined, outline: undefined, list: undefined }));
      return 'apply';
    }
    st.painter = { cs: caretStyle(), para: paraShape() };
    return 'copy';
  }

  // ---------- 넣기 ----------
  function insertHtml(html) { return act(() => { ensureSel(); document.execCommand('insertHTML', false, html); }); }
  function insertText(t) { return act(() => { ensureSel(); document.execCommand('insertText', false, t); }); }
  function topBlock(n) {
    if (!n) return null;
    if (n.nodeType === 3) n = n.parentNode;
    while (n && n !== el && !(n.parentNode === el || (n.parentNode && n.parentNode.tagName === 'TD') || (n.parentNode && n.parentNode.classList && n.parentNode.classList.contains('box')))) n = n.parentNode;
    return n === el ? null : n;
  }
  // 표·글상자처럼 문단 밖에 놓는 것: 커서 문단 뒤에 넣고 빈 문단이면 그 자리를 쓴다
  function insertBlock(node) {
    return act(() => {
      ensureSel();
      const r = range();
      const b = topBlock(r && r.startContainer);
      const after = document.createElement('p'); after.innerHTML = '<br>';
      if (!b) { el.appendChild(node); el.appendChild(after); }
      else {
        const empty = b.tagName === 'P' && !b.textContent.replace(/​/g, '').trim() && !b.querySelector('img,.fn,.eq');
        b.parentNode.insertBefore(node, b.nextSibling);
        if (!node.nextElementSibling || node.nextElementSibling.tagName !== 'P') node.parentNode.insertBefore(after, node.nextSibling);
        if (empty) b.remove();
      }
      const first = node.querySelector('td p, p') || node;
      caretInto(first);
    });
  }
  function makeTable(rows, cols, opts) {
    opts = opts || {};
    const g = geo();
    const W = Math.floor(g.bodyW * 0.75 * 100) / 100;         // pt
    const t = document.createElement('table');
    t.className = 'tb';
    t.style.width = W + 'pt';
    let h = '<tbody>';
    for (let r = 0; r < rows; r++) {
      h += '<tr>';
      for (let c = 0; c < cols; c++) h += `<td style="width:${(W / cols).toFixed(2)}pt${opts.head && r === 0 ? ';background-color:#e8eef7' : ''}"><p><br></p></td>`;
      h += '</tr>';
    }
    t.innerHTML = h + '</tbody>';
    return insertBlock(t);
  }
  function insertImage(data, ext) {
    const key = addBin(data, ext);
    const url = binUrl(key);
    const img = new Image();
    img.onload = () => {
      const g = geo();
      let w = img.naturalWidth * 0.75, hgt = img.naturalHeight * 0.75;          // px → pt
      const maxW = g.bodyW * 0.75;
      if (w > maxW) { hgt = hgt * maxW / w; w = maxW; }
      insertHtml(`<img src="${url}" data-bin="${key}" style="width:${w.toFixed(1)}pt;height:${hgt.toFixed(1)}pt" alt="">`);
    };
    img.onerror = () => { delete st.doc.bins[key]; if (st.onError) st.onError('그림을 읽을 수 없어요'); };
    img.src = url;
  }
  function pageBreak() {
    act(() => {
      ensureSel();
      const r = range();
      const p = paraOf(r && r.startContainer);
      if (p && p.closest('td')) return;
      document.execCommand('insertParagraph');
      const np = curPara();
      if (np) np.dataset.pb = '1';
    });
  }

  // ---------- 표 ----------
  function cellOf(n) { if (!n) return null; if (n.nodeType === 3) n = n.parentElement; const td = n.closest && n.closest('td,th'); return td && inDoc(td) ? td : null; }
  function curCell() { const r = range() || saved; return r ? cellOf(r.startContainer) : null; }
  function gridOf(table) {
    const cells = new Map(), rows = [];
    [...table.rows].forEach((tr, r) => {
      rows[r] = rows[r] || [];
      let c = 0;
      for (const td of tr.cells) {
        while (rows[r][c]) c++;
        const info = { td, r, c, rs: td.rowSpan || 1, cs: td.colSpan || 1 };
        cells.set(td, info);
        for (let i = 0; i < info.rs; i++) for (let j = 0; j < info.cs; j++) (rows[r + i] = rows[r + i] || [])[c + j] = info;
        c += info.cs;
      }
    });
    const nCols = Math.max(0, ...rows.map(x => x.length));
    return { cells, rows, nRows: table.rows.length, nCols };
  }
  function newCell(widthFrom) {
    const td = document.createElement('td');
    if (widthFrom && widthFrom.style.width && (widthFrom.colSpan || 1) === 1) td.style.width = widthFrom.style.width;
    td.innerHTML = '<p><br></p>';
    return td;
  }
  function insertCellAt(tr, g, col, td) {
    const after = [...tr.cells].find(x => g.cells.get(x).c > col);
    tr.insertBefore(td, after || null);
  }
  function insertRow(below) {
    const td = curCell(); if (!td) return;
    act(() => {
      const table = td.closest('table'), g = gridOf(table), me = g.cells.get(td);
      const at = below ? me.r + me.rs : me.r;          // 새 줄 번호
      const tr = document.createElement('tr');
      const seen = new Set();
      for (let c = 0; c < g.nCols; c++) {
        const above = g.rows[at - 1] && g.rows[at - 1][c], cur = g.rows[at] && g.rows[at][c];
        const span = cur && above && cur === above ? cur : null;      // 넣는 자리를 가로지르는 합친 칸
        if (span) { if (!seen.has(span)) { span.td.rowSpan = span.rs + 1; seen.add(span); } continue; }
        const ref = (g.rows[below ? at - 1 : at] || [])[c];
        const n = newCell(ref && ref.td);
        if (ref && ref.cs > 1 && ref.c === c) { n.colSpan = ref.cs; c += ref.cs - 1; }
        tr.appendChild(n);
      }
      const ref = table.rows[at];
      (ref ? ref.parentNode : table.tBodies[0] || table).insertBefore(tr, ref || null);
      caretInto(tr.cells[0] || td);
    });
  }
  function insertCol(right) {
    const td = curCell(); if (!td) return;
    act(() => {
      const table = td.closest('table'), g = gridOf(table), me = g.cells.get(td);
      const at = right ? me.c + me.cs : me.c;
      const seen = new Set();
      [...table.rows].forEach((tr, r) => {
        const left = g.rows[r][at - 1], cur = g.rows[r][at];
        if (left && cur && left === cur) { if (!seen.has(cur)) { cur.td.colSpan = cur.cs + 1; seen.add(cur); } return; }
        if (cur && cur.r !== r) return;            // 위에서 내려온 합친 칸이 덮은 줄
        if (!cur && left && left.r !== r) return;
        const n = newCell((cur || left) && (cur || left).td);
        if (cur && cur.rs > 1) n.rowSpan = cur.rs;
        else if (!cur && left && left.rs > 1) n.rowSpan = left.rs;
        insertCellAt(tr, g, at - 1, n);
      });
      fixTableWidth(table);
    });
  }
  function deleteRow() {
    const td = curCell(); if (!td) return;
    act(() => {
      const table = td.closest('table'), g = gridOf(table), me = g.cells.get(td);
      const rows = selRect(table, me);
      for (let r = rows.r2; r >= rows.r1; r--) {
        const gg = gridOf(table);
        if (table.rows.length <= 1) { removeTable(table); return; }
        const tr = table.rows[r];
        const seen = new Set();
        for (let c = 0; c < gg.nCols; c++) {
          const info = gg.rows[r][c];
          if (!info || seen.has(info)) continue;
          seen.add(info);
          if (info.r < r) info.td.rowSpan = info.rs - 1;
          else if (info.rs > 1) {
            const n = info.td;                 // 아래 줄로 옮긴다
            n.rowSpan = info.rs - 1;
            insertCellAt(table.rows[r + 1], gg, info.c - 1, n);
          }
        }
        tr.remove();
      }
      const first = table.querySelector('td'); if (first) caretInto(first);
    });
  }
  function deleteCol() {
    const td = curCell(); if (!td) return;
    act(() => {
      const table = td.closest('table'), g = gridOf(table), me = g.cells.get(td);
      const rect = selRect(table, me);
      for (let c = rect.c2; c >= rect.c1; c--) {
        const gg = gridOf(table);
        if (gg.nCols <= 1) { removeTable(table); return; }
        const seen = new Set();
        for (let r = 0; r < gg.nRows; r++) {
          const info = gg.rows[r][c];
          if (!info || seen.has(info)) continue;
          seen.add(info);
          if (info.cs > 1) info.td.colSpan = info.cs - 1; else info.td.remove();
        }
      }
      [...table.rows].forEach(tr => { if (!tr.cells.length) tr.remove(); });
      fixTableWidth(table);
      const first = table.querySelector('td'); if (first) caretInto(first);
    });
  }
  function fixTableWidth(table) {
    // 표 너비 = 첫 줄 칸 너비 합
    let w = 0;
    const g = gridOf(table);
    const counted = new Set();
    for (let c = 0; c < g.nCols; c++) {
      const info = g.rows[0] && g.rows[0][c];
      if (!info || counted.has(info)) continue;
      counted.add(info);
      w += Model.ptOf(info.td.style.width) || info.td.offsetWidth * 0.75;
    }
    if (w) table.style.width = w.toFixed(2) + 'pt';
  }
  function removeTable(table) {
    const p = document.createElement('p'); p.innerHTML = '<br>';
    table.replaceWith(p);
    caretInto(p);
  }
  function deleteTable() { const td = curCell(); if (!td) return; act(() => removeTable(td.closest('table'))); }

  // 셀 블록(F5): 표 안 직사각형 선택
  function selRect(table, me) {
    if (st.cellSel && st.cellSel.table === table) return st.cellSel;
    return { table, r1: me.r, c1: me.c, r2: me.r + me.rs - 1, c2: me.c + me.cs - 1 };
  }
  function selectedCells() {
    if (!st.cellSel) { const td = curCell(); return td ? [td] : []; }
    const { table, r1, c1, r2, c2 } = st.cellSel;
    if (!el.contains(table)) { st.cellSel = null; return []; }
    const g = gridOf(table), out = new Set();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const i = g.rows[r] && g.rows[r][c]; if (i) out.add(i.td); }
    return [...out];
  }
  function cellBlock(fromTd, toTd) {
    clearCellBlock();
    const table = fromTd.closest('table');
    if (!toTd || toTd.closest('table') !== table) toTd = fromTd;
    const g = gridOf(table), a = g.cells.get(fromTd), b = g.cells.get(toTd);
    let r1 = Math.min(a.r, b.r), c1 = Math.min(a.c, b.c), r2 = Math.max(a.r + a.rs - 1, b.r + b.rs - 1), c2 = Math.max(a.c + a.cs - 1, b.c + b.cs - 1);
    // 합친 칸이 걸치면 넓힌다
    for (let changed = true; changed;) {
      changed = false;
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        const i = g.rows[r] && g.rows[r][c]; if (!i) continue;
        if (i.r < r1) { r1 = i.r; changed = true; } if (i.c < c1) { c1 = i.c; changed = true; }
        if (i.r + i.rs - 1 > r2) { r2 = i.r + i.rs - 1; changed = true; } if (i.c + i.cs - 1 > c2) { c2 = i.c + i.cs - 1; changed = true; }
      }
    }
    st.cellSel = { table, r1, c1, r2, c2, anchor: fromTd };
    selectedCells().forEach(td => td.classList.add('cellsel'));
  }
  function moveCellBlock(dr, dc) {
    if (!st.cellSel) return;
    const { table, anchor } = st.cellSel;
    const g = gridOf(table);
    // 끝 칸을 옮긴다
    const endR = st.cellSel.r2 === g.cells.get(anchor).r ? st.cellSel.r1 : st.cellSel.r2;
    const endC = st.cellSel.c2 === g.cells.get(anchor).c ? st.cellSel.c1 : st.cellSel.c2;
    const r = Math.max(0, Math.min(g.nRows - 1, (dr ? (dr > 0 ? st.cellSel.r2 + 1 : st.cellSel.r1 - 1) : endR)));
    const c = Math.max(0, Math.min(g.nCols - 1, (dc ? (dc > 0 ? st.cellSel.c2 + 1 : st.cellSel.c1 - 1) : endC)));
    const target = g.rows[r] && g.rows[r][c];
    if (target) cellBlock(anchor, target.td);
  }
  function clearCellBlock() {
    el.querySelectorAll('.cellsel').forEach(e => e.classList.remove('cellsel'));
    st.cellSel = null;
  }
  function merge() {
    if (!st.cellSel) { const td = curCell(); if (td) cellBlock(td); }
    if (!st.cellSel) return false;
    const { table, r1, c1, r2, c2 } = st.cellSel;
    if (r1 === r2 && c1 === c2) return false;
    act(() => {
      const g = gridOf(table);
      const keep = g.rows[r1][c1].td;
      let w = 0;
      for (let c = c1; c <= c2; c++) { const i = g.rows[r1][c]; if (i && i.c === c) w += Model.ptOf(i.td.style.width) || i.td.offsetWidth * 0.75; }
      for (const td of selectedCells()) {
        if (td === keep) continue;
        const hasText = td.textContent.replace(/​/g, '').trim() || td.querySelector('img,table');
        if (hasText) [...td.childNodes].forEach(n => keep.appendChild(n));
        td.remove();
      }
      keep.colSpan = c2 - c1 + 1; keep.rowSpan = r2 - r1 + 1;
      if (w) keep.style.width = w.toFixed(2) + 'pt';
      [...table.rows].forEach(tr => { if (!tr.cells.length) { tr.remove(); } });
      clearCellBlock();
      caretInto(keep);
    });
    return true;
  }
  // 셀 나누기: rows × cols 로. 합친 칸이면 먼저 풀어 준다
  function split(nr, nc) {
    const td = curCell(); if (!td) return;
    act(() => {
      const table = td.closest('table');
      let g = gridOf(table), me = g.cells.get(td);
      if (me.rs > 1 || me.cs > 1) {
        const cw = (Model.ptOf(td.style.width) || td.offsetWidth * 0.75) / me.cs;
        for (let r = me.r; r < me.r + me.rs; r++) {
          for (let c = me.c; c < me.c + me.cs; c++) {
            if (r === me.r && c === me.c) continue;
            const n = newCell(); n.style.width = cw.toFixed(2) + 'pt';
            insertCellAt(table.rows[r], g, c - 1, n);
            g = gridOf(table);
          }
        }
        td.rowSpan = 1; td.colSpan = 1; td.style.width = cw.toFixed(2) + 'pt';
        clearCellBlock();
        return;
      }
      // 칸 나누기
      if (nc > 1) {
        const w = (Model.ptOf(td.style.width) || td.offsetWidth * 0.75) / nc;
        const seen = new Set();
        for (let r = 0; r < g.nRows; r++) {
          const i = g.rows[r][me.c];
          if (!i || i.td === td || seen.has(i)) continue;
          seen.add(i); i.td.colSpan = i.cs + nc - 1;
        }
        td.style.width = w.toFixed(2) + 'pt';
        for (let k = 1; k < nc; k++) { const n = newCell(td); n.rowSpan = td.rowSpan; td.parentNode.insertBefore(n, td.nextSibling); }
        g = gridOf(table); me = g.cells.get(td);
      }
      if (nr > 1) {
        const tr = td.parentNode;
        const mine = [td];
        for (let k = 1; k < nc; k++) mine.push(mine[k - 1].nextElementSibling);
        const seen = new Set();
        for (let c = 0; c < g.nCols; c++) {
          const i = g.rows[me.r][c];
          if (!i || mine.includes(i.td) || seen.has(i)) continue;
          seen.add(i); i.td.rowSpan = i.rs + nr - 1;
        }
        let ref = tr;
        for (let k = 1; k < nr; k++) {
          const ntr = document.createElement('tr');
          mine.forEach(m => ntr.appendChild(newCell(m)));
          ref.parentNode.insertBefore(ntr, ref.nextSibling);
          ref = ntr;
        }
        // 다른 줄의 칸 위치는 rowspan이 맞춰 주므로 새 줄엔 내 칸만 들어간다
      }
    });
  }
  function cellStyle(fn) { act(() => { for (const td of selectedCells()) fn(td); }); }
  function cellNav(back) {
    const td = curCell(); if (!td) return false;
    const table = td.closest('table');
    const all = [...table.querySelectorAll('td,th')].filter(x => x.closest('table') === table);
    const i = all.indexOf(td);
    const next = all[i + (back ? -1 : 1)];
    if (next) { const r = document.createRange(); r.selectNodeContents(next); const s = sel(); s.removeAllRanges(); s.addRange(r); return true; }
    if (!back) { insertRow(true); return true; }
    return true;
  }

  // ---------- 찾기·바꾸기 ----------
  function textMap() {
    const nodes = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let s = '';
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement.closest('.pgap')) continue;
      nodes.push({ n, at: s.length });
      s += n.nodeValue;
    }
    return { s, nodes };
  }
  function posToNode(map, i) {
    let lo = 0, hi = map.nodes.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (map.nodes[m].at <= i) lo = m; else hi = m - 1; }
    const x = map.nodes[lo];
    return [x.n, Math.min(i - x.at, x.n.length)];
  }
  function find(q, opts) {
    opts = opts || {};
    if (!q) return false;
    const map = textMap();
    const hay = opts.matchCase ? map.s : map.s.toLowerCase(), needle = opts.matchCase ? q : q.toLowerCase();
    const r = range() || saved;
    const fromStart = r ? textPos(r.startContainer, r.startOffset).count : 0;
    const fromEnd = r ? textPos(r.endContainer, r.endOffset).count : 0;
    let i = -1;
    if (opts.back) { const k = fromStart - needle.length; if (k >= 0) i = hay.lastIndexOf(needle, k); }
    else i = hay.indexOf(needle, fromEnd);
    if (i < 0) i = opts.back ? hay.lastIndexOf(needle) : hay.indexOf(needle);       // 끝에서 처음으로 이어서
    if (i < 0) return false;
    const [a, ao] = posToNode(map, i), [b, bo] = posToNode(map, i + q.length);
    const nr = document.createRange(); nr.setStart(a, ao); nr.setEnd(b, bo);
    el.focus({ preventScroll: true });
    const s = sel(); s.removeAllRanges(); s.addRange(nr);
    saved = nr.cloneRange();
    scrollToRange(nr);
    return true;
  }
  function replaceOne(q, w, opts) {
    const r = range() || saved;
    const cur = r ? r.toString() : '';
    if (r && !r.collapsed && (opts.matchCase ? cur === q : cur.toLowerCase() === q.toLowerCase())) {
      act(() => { restoreSel(); document.execCommand('insertText', false, w); });
    }
    return find(q, opts);
  }
  function replaceAll(q, w, opts) {
    if (!q) return 0;
    let n = 0;
    act(() => {
      const map = textMap();
      const hay = opts.matchCase ? map.s : map.s.toLowerCase(), needle = opts.matchCase ? q : q.toLowerCase();
      const hits = [];
      for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) hits.push(i);
      for (let k = hits.length - 1; k >= 0; k--) {
        const [a, ao] = posToNode(map, hits[k]), [b, bo] = posToNode(map, hits[k] + q.length);
        const r = document.createRange(); r.setStart(a, ao); r.setEnd(b, bo);
        r.deleteContents();
        if (w) r.insertNode(document.createTextNode(w));
        n++;
      }
      el.normalize();
    });
    return n;
  }
  function scrollToRange(r) {
    const rc = r.getBoundingClientRect(), vr = view.getBoundingClientRect();
    if (rc.top < vr.top + 40 || rc.bottom > vr.bottom - 40) view.scrollTop += rc.top - vr.top - vr.height / 3;
    if (rc.left < vr.left || rc.right > vr.right) view.scrollLeft += rc.left - vr.left - vr.width / 3;
  }
  function gotoPage(n) {
    const g = geo();
    n = Math.max(1, Math.min(st.pages, n));
    view.scrollTop = (PAD + (n - 1) * g.stride) * st.zoom - 8;
    // 그 쪽 첫 블록에 커서
    const y = (n - 1) * g.stride;
    const b = [...el.children].find(k => k.offsetTop + k.offsetHeight > y);
    if (b) { el.focus({ preventScroll: true }); caretInto(b.tagName === 'TABLE' ? b.querySelector('td') : b); }
  }
  function caretPage() {
    const r = range();
    if (!r || st.readOnly) {
      // 커서가 없으면(보기 모드) 화면 가운데 보이는 쪽
      const y = (view.scrollTop + view.clientHeight / 3) / st.zoom - PAD;
      return Math.max(1, Math.min(st.pages, Math.floor(y / geo().stride) + 1));
    }
    let rc = r.getBoundingClientRect();
    if (!rc.height) { const n = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer; rc = n.getBoundingClientRect(); }
    const y = (rc.top - stage.getBoundingClientRect().top) / st.zoom - PAD;
    return Math.max(1, Math.min(st.pages, Math.floor(y / geo().stride) + 1));
  }

  // ---------- 통계 ----------
  function stats() {
    const text = el.innerText.replace(/​/g, '');
    return {
      chars: text.replace(/\n/g, '').length, noSpace: text.replace(/\s/g, '').length,
      words: (text.match(/\S+/g) || []).length, paras: el.querySelectorAll('p').length,
      tables: el.querySelectorAll('table').length, images: el.querySelectorAll('img').length, pages: st.pages,
      notes: el.querySelectorAll('.fn').length,
    };
  }

  return {
    st, el, view, geo, load, toModel, cleanHtml, layout, paginateSoon, setZoom, fitWidth, fitPage, binUrl, addBin,
    range, saveSel, restoreSel, ensureSel, placeCaret, caretInto, hist, act,
    exec, inline, applyCss, sizeBy, spacingBy, caretStyle, setCharShape, csAt,
    paras, curPara, paraShape, setParaShape, align, setStyle, toggleList, indentBy, lineSpacing, lineSpacingBy, painter,
    insertHtml, insertText, insertBlock, makeTable, insertImage, pageBreak,
    curCell, cellOf, gridOf, insertRow, insertCol, deleteRow, deleteCol, deleteTable, cellBlock, moveCellBlock, clearCellBlock, merge, split,
    selectedCells, cellStyle, cellNav, fixTableWidth,
    find, replaceOne, replaceAll, gotoPage, caretPage, stats, scrollToRange,
  };
})();
