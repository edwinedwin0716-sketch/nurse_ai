// 파일 상자 열기·만들기: HWPX는 ZIP, HWP는 마이크로소프트 복합 파일(CFB) 안에 들어 있다.
'use strict';

const Zip = (() => {
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    CRC[n] = c >>> 0;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const utf8 = new TextEncoder(), dec = new TextDecoder('utf-8');

  // 이름 → Uint8Array
  function read(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP 파일이 아니에요');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + csize);
      if (!name.endsWith('/')) out[name] = method === 0 ? raw.slice() : pako.inflateRaw(raw);
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }

  // [{name, data(Uint8Array|string), store}] → Uint8Array. mimetype처럼 store=true면 압축하지 않는다.
  function write(entries) {
    const parts = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const e of entries) {
      const data = typeof e.data === 'string' ? utf8.encode(e.data) : e.data;
      const name = utf8.encode(e.name);
      const comp = e.store ? data : pako.deflateRaw(data);
      const method = e.store ? 0 : 8, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, method, true); h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true);
      h.setUint32(14, crc, true); h.setUint32(18, comp.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, comp);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, method, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true);
      c.setUint32(16, crc, true); c.setUint32(20, comp.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + comp.length;
    }
    let csize = 0;
    for (const c of central) csize += c.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return concat(parts.concat(central, [new Uint8Array(end.buffer)]));
  }

  function concat(list) {
    let n = 0;
    for (const a of list) n += a.length;
    const out = new Uint8Array(n);
    let p = 0;
    for (const a of list) { out.set(a, p); p += a.length; }
    return out;
  }

  return { read, write, crc32, concat };
})();

// 복합 파일(Compound File Binary) 읽기: 경로('BodyText/Section0') → Uint8Array
const Cfb = (() => {
  const FREE = 0xFFFFFFFF, END = 0xFFFFFFFE;
  function read(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, true) !== 0xE011CFD0 || dv.getUint32(4, true) !== 0xE11AB1A1) throw new Error('HWP 5.0 파일이 아니에요');
    const secSize = 1 << dv.getUint16(30, true), miniSize = 1 << dv.getUint16(32, true);
    const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true);
    const miniCutoff = dv.getUint32(56, true), miniFatStart = dv.getUint32(60, true);
    let difatNext = dv.getUint32(68, true);
    const sectorOff = s => (s + 1) * secSize;
    const fatSectors = [];
    for (let i = 0; i < 109 && fatSectors.length < nFat; i++) fatSectors.push(dv.getUint32(76 + i * 4, true));
    let guard = 0;
    while (difatNext !== END && difatNext !== FREE && fatSectors.length < nFat && guard++ < 10000) {
      const o = sectorOff(difatNext), per = secSize / 4 - 1;
      for (let i = 0; i < per && fatSectors.length < nFat; i++) fatSectors.push(dv.getUint32(o + i * 4, true));
      difatNext = dv.getUint32(o + per * 4, true);
    }
    const fat = new Uint32Array(fatSectors.length * secSize / 4);
    fatSectors.forEach((s, i) => {
      const o = sectorOff(s);
      for (let j = 0; j < secSize / 4; j++) fat[i * secSize / 4 + j] = o + j * 4 + 4 <= bytes.length ? dv.getUint32(o + j * 4, true) : END;
    });
    function chain(start, table) {
      const out = [];
      let s = start;
      while (s !== END && s !== FREE && s < table.length && out.length <= table.length) { out.push(s); s = table[s]; }
      return out;
    }
    function bigStream(start, size) {
      const secs = chain(start, fat), out = new Uint8Array(secs.length * secSize);
      secs.forEach((s, i) => out.set(bytes.subarray(sectorOff(s), sectorOff(s) + secSize), i * secSize));
      return size == null ? out : out.subarray(0, size);
    }
    const dirBytes = bigStream(dirStart);
    const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
    const entries = [];
    for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
      const nlen = ddv.getUint16(o + 64, true);
      let name = '';
      for (let i = 0; i < Math.max(0, nlen / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(o + i * 2, true));
      entries.push({
        name, type: dirBytes[o + 66], left: ddv.getUint32(o + 68, true), right: ddv.getUint32(o + 72, true),
        child: ddv.getUint32(o + 76, true), start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true),
      });
    }
    const root = entries[0];
    const ministream = bigStream(root.start, root.size);
    const minifat = (() => {
      const raw = miniFatStart === END ? new Uint8Array(0) : bigStream(miniFatStart);
      const m = new Uint32Array(raw.length / 4);
      const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      for (let i = 0; i < m.length; i++) m[i] = v.getUint32(i * 4, true);
      return m;
    })();
    function streamOf(e) {
      if (e.size < miniCutoff) {
        const secs = chain(e.start, minifat), out = new Uint8Array(secs.length * miniSize);
        secs.forEach((s, i) => out.set(ministream.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize));
        return out.subarray(0, e.size);
      }
      return bigStream(e.start, e.size);
    }
    const files = {};
    const seen = new Set();
    function walk(id, prefix) {
      if (id === FREE || id >= entries.length || seen.has(id)) return;
      seen.add(id);
      const e = entries[id];
      walk(e.left, prefix);
      walk(e.right, prefix);
      const path = prefix + e.name;
      if (e.type === 2) files[path] = streamOf(e);
      else if (e.type === 1) walk(e.child, path + '/');
    }
    walk(root.child, '');
    return files;
  }
  return { read };
})();
