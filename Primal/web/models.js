// 원시섬 모형 만들기: 외부 파일 없이 코드로 공룡·사람·나무·건물을 만든다 (모두 이 저장소에서 새로 만든 모양).
(function () {
  'use strict';
  const T = THREE;

  // 여러 조각을 한 덩어리로 (그리기 횟수 줄이기). parts: [[geometry, color]], shade(x,y,z,nx,ny,nz,c) 로 꼭짓점 색 조절
  function merge(parts, shade) {
    const pos = [], nor = [], col = [], c = new T.Color();
    for (const [g0, color] of parts) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      if (!g.attributes.normal) g.computeVertexNormals();
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
        c.set(color); if (shade) shade(x, y, z, nx, ny, nz, c);
        pos.push(x, y, z); nor.push(nx, ny, nz); col.push(c.r, c.g, c.b);
      }
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  // 굵기가 변하는 관 (등뼈·목·꼬리·다리를 매끈하게)
  function tube(points, radius, segs, radial) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(p[0], p[1], p[2])));
    segs = segs || 40; radial = radial || 10;
    const fr = curve.computeFrenetFrames(segs, false), pos = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, P = curve.getPointAt(t), N = fr.normals[i], B = fr.binormals[i], r = radius(t);
      for (let j = 0; j <= radial; j++) {
        const v = j / radial * Math.PI * 2, cs = Math.cos(v), sn = Math.sin(v);
        pos.push(P.x + r * (cs * N.x + sn * B.x), P.y + r * (cs * N.y + sn * B.y), P.z + r * (cs * N.z + sn * B.z));
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // [[t, r], ...] 를 부드럽게 이은 굵기
  function profile(keys) {
    return t => {
      for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i], k = (t - a[0]) / (b[0] - a[0] || 1), s = k * k * (3 - 2 * k);
        return a[1] + (b[1] - a[1]) * s;
      }
      return keys[keys.length - 1][1];
    };
  }
  function ell(rx, ry, rz, x, y, z, seg) { return new T.SphereGeometry(1, seg || 14, seg ? Math.ceil(seg * .7) : 10).scale(rx, ry, rz).translate(x, y, z); }
  const mat = { v: new T.MeshLambertMaterial({ vertexColors: true }), vf: new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }) };


  // ---------- 사용자 STL 모형 (assets.js) ----------
  const _cache = {};
  function b64(s){ const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function decode(m, shade){
    const q = new Uint16Array(b64(m.v)), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++){ const a = i % 3; pos[i] = m.lo[a] + q[i] / 65535 * (m.hi[a] - m.lo[a]); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(new T.BufferAttribute(m.b ? new Uint32Array(b64(m.i)) : new Uint16Array(b64(m.i)), 1));
    g.computeVertexNormals();
    if (shade){
      const n = g.attributes.normal, col = new Float32Array(pos.length), c = new T.Color();
      for (let i = 0; i < pos.length / 3; i++){ c.set(0xffffff); shade(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], n.getX(i), n.getY(i), n.getZ(i), c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new T.BufferAttribute(col, 3));
    }
    g.computeBoundingSphere(); return g;
  }
  function hashv(x, y, z){ const h = Math.sin(x * 12.99 + y * 78.23 + z * 37.71) * 43758.5; return h - Math.floor(h); }
  const SHADE = {
    fence: (x, y, z, nx, ny, nz, c) => { c.set(0x7a5a3b); c.offsetHSL(0, 0, (hashv(Math.round(x * 2), 0, 0) - .5) * .08 + ny * .03); },
    kiln: (x, y, z, nx, ny, nz, c) => { c.set(0x8c8579); c.lerp(new T.Color(0x9b7a5a), hashv(Math.round(x * 2.2), Math.round(y * 2.2), Math.round(z * 2.2)) * .5); c.offsetHSL(0, 0, (hashv(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3)) - .5) * .14); if (y < .25) c.multiplyScalar(.8); },
    tower: (x, y, z, nx, ny, nz, c) => { if (y > 5.3 && ny > .2) c.set(0xa08654); else c.set(0x76573a); c.offsetHSL(0, 0, (hashv(Math.round(x * 4), Math.round(y * 2), Math.round(z * 4)) - .5) * .08); },
    well: (x, y, z, nx, ny, nz, c) => { if (y < 1.05) { c.set(0x8e887c); c.offsetHSL(0, 0, (hashv(Math.round(x * 2.5), Math.round(y * 3), Math.round(z * 2.5)) - .5) * .16); } else if (y > 2.2 && ny > .3) c.set(0x8a6a45); else c.set(0x6f5136); },
    firering: (x, y, z, nx, ny, nz, c) => { const r = Math.hypot(x, z); if (r < .45) c.set(0x3a2a1c); else { c.set(0x8a857a); c.offsetHSL(0, 0, (hashv(Math.round(x * 4), 0, Math.round(z * 4)) - .5) * .15); } },
    tent: (x, y, z, nx, ny, nz, c) => { const r = Math.hypot(x, z); c.set(r < 1.9 - y * .5 + .12 && y < 3 ? 0xb89a6a : 0x6a4b31); c.offsetHSL(0, 0, Math.sin(Math.atan2(z, x) * 9) * .03); },
    shelter: (x, y, z, nx, ny, nz, c) => { if (y > 2.75 && ny > .3) { c.set(0x9c8150); c.offsetHSL(0, 0, (hashv(Math.round(x * 3), 0, Math.round(z * 3)) - .5) * .08); } else { c.set(0x7b5a3c); c.offsetHSL(0, 0, Math.sin(y * 9) * .03 + (hashv(0, Math.round(y * 3), 0) - .5) * .05); } }
  };
  function assetGeo(name){
    if (!window.ASSETS || !ASSETS[name]) return null;
    if (!_cache[name]) _cache[name] = decode(ASSETS[name].mesh, SHADE[name]);
    return _cache[name];
  }
  // ---------- 공룡 ----------
  // 종류마다: 등뼈 선(꼬리 끝 → 머리 밑), 굵기, 머리, 다리, 색
  const SPECIES = {
    grazer: {   // 풀뜯개: 두 발로 걷는 작은 초식 공룡, 볏이 있다
      spine: [[0, .95, -2.4], [0, 1.05, -1.3], [0, 1.15, -.2], [0, 1.3, .6], [0, 1.65, 1.05], [0, 1.95, 1.25]],
      r: [[0, .04], [.25, .2], [.5, .42], [.68, .34], [.85, .17], [1, .14]],
      head: [.17, .2, .34, 0, 2.02, 1.45], crest: true, legs: { biped: true, hip: [.24, 1.1, -.15], h: 1.05, r: .14 }, arms: [.2, 1.35, .55],
      base: 0x8f9c5c, back: 0x5f6b3a, belly: 0xd3cfa0
    },
    claw: {     // 발톱이: 빠른 육식 공룡, 줄무늬
      spine: [[0, 1.05, -2.6], [0, 1.15, -1.4], [0, 1.25, -.2], [0, 1.4, .55], [0, 1.75, .95], [0, 1.9, 1.1]],
      r: [[0, .03], [.3, .16], [.52, .33], [.7, .27], [.86, .13], [1, .11]],
      head: [.15, .2, .44, 0, 1.97, 1.42], jaw: true, legs: { biped: true, hip: [.2, 1.18, -.1], h: 1.15, r: .12 }, arms: [.17, 1.4, .5],
      base: 0xa96a3f, back: 0x5a3a22, belly: 0xe0c69a, stripes: 7
    },
    longneck: { // 목긴이: 큰 목긴 초식 공룡 (온순, 때리면 반격)
      spine: [[0, 2.4, -9], [0, 3.4, -6], [0, 4.2, -3], [0, 4.5, 0], [0, 4.8, 2.4], [0, 6.6, 3.9], [0, 9.2, 4.9], [0, 11.2, 5.4]],
      r: [[0, .1], [.15, .65], [.3, 1.6], [.45, 2.0], [.58, 1.7], [.68, .75], [.85, .5], [1, .4]],
      head: [.55, .5, 1.05, 0, 11.4, 6.0], legs: { biped: false, hip: [.95, 3.9, -2.4], sh: [.95, 4.1, 2.2], h: 3.9, r: .62 },
      base: 0x8e8f86, back: 0x5c5e57, belly: 0xbab7a6
    },
    rex: {      // 큰이빨: 두 발로 걷는 거대한 육식 공룡 (모형은 assets.js, 아래는 모형이 없을 때만)
      spine: [[0, 2.4, -6.5], [0, 2.6, -3], [0, 2.9, 0], [0, 3.1, 2.5], [0, 3.3, 3.8]], r: [[0, .05], [.4, .5], [.62, .95], [.85, .6], [1, .45]],
      head: [.5, .55, 1, 0, 3.4, 4.2], jaw: true, legs: { biped: true, hip: [.6, 2.0, 0], h: 2.0, r: .35 },
      base: 0x6b5a3f, back: 0x3e3324, belly: 0xb8a37c, stripes: 3
    },
    plate: {    // 판등이: 등에 큰 판, 꼬리에 가시 (건드리면 꼬리로 친다)
      spine: [[0, 1.2, -4.3], [0, 1.5, -2.5], [0, 1.9, -.5], [0, 1.7, 1.8], [0, 1.2, 3.3]], r: [[0, .06], [.3, .55], [.55, .95], [.8, .55], [1, .3]],
      head: [.3, .3, .5, 0, 1.15, 3.5], legs: { biped: false, hip: [.5, 1.2, -1.4], sh: [.5, 1.0, 1.4], h: 1.1, r: .25 },
      base: 0x6f7a4a, back: 0x8a5a3a, belly: 0xc8c08f
    },
    horn: {     // 뿔방패: 머리에 넓은 방패와 뿔 세 개 (건드리면 돌진)
      spine: [[0, 1.3, -4.2], [0, 1.7, -2.6], [0, 2.1, -1], [0, 2.2, .6], [0, 1.95, 1.9]],
      r: [[0, .07], [.25, .55], [.5, 1.05], [.75, 1.0], [1, .7]],
      head: [.62, .6, .95, 0, 1.85, 2.6], frill: true, horns: true, legs: { biped: false, hip: [.62, 1.6, -1.6], sh: [.6, 1.5, 1.1], h: 1.5, r: .3 },
      base: 0x7a6a4a, back: 0x4f4430, belly: 0xc2b48c
    }
  };
  function dinoShade(sp) {
    const base = new T.Color(sp.base), back = new T.Color(sp.back), belly = new T.Color(sp.belly);
    return (x, y, z, nx, ny, nz, c) => {
      c.copy(base);
      if (ny > .25) c.lerp(back, Math.min(1, (ny - .25) * 1.6));
      if (ny < -.2) c.lerp(belly, Math.min(1, (-ny - .2) * 1.8));
      if (sp.stripes && ny > -.1 && Math.sin(z * sp.stripes) > .55) c.multiplyScalar(.55);
      c.offsetHSL(0, 0, (Math.sin(x * 13.1 + z * 7.7 + y * 5.3) * .02));
    };
  }
  function legGeo(h, r, biped) {
    // 엉덩이(0,0,0)에서 아래로: 허벅지 → 무릎 → 정강이 → 발
    const knee = biped ? [0, -h * .45, .18] : [0, -h * .5, .05];
    const ankle = biped ? [0, -h * .85, -.12] : [0, -h * .95, 0];
    const g = tube([[0, Math.min(.4, r * 1.5), 0], [0, .02, 0], knee, ankle, [0, -h, biped ? .05 : 0]], profile([[0, r * 1.5], [.25, r * 1.3], [.55, r * .85], [1, r * .65]]), 16, 9);
    const foot = ell(r * 1.0, r * .35, r * (biped ? 1.6 : 1.0), 0, -h + r * .25, biped ? .15 : .05, 8);
    return [g, foot];
  }
  function makeDino(kind) {
    const sp = SPECIES[kind];
    if (window.ASSETS && ASSETS[kind] && ASSETS[kind].legs){
      const A = ASSETS[kind], sh = dinoShade(sp), g = new T.Group();
      if (!_cache[kind]) _cache[kind] = { body: decode(A.mesh, sh), legs: A.legs.map(l => decode(l.mesh, sh)) };
      const body = new T.Mesh(_cache[kind].body, mat.v); body.castShadow = true; g.add(body);
      const legs = A.legs.map((l, i) => { const p = new T.Group(); p.position.set(l.pivot[0], l.pivot[1], l.pivot[2]); const m = new T.Mesh(_cache[kind].legs[i], mat.v); m.castShadow = true; p.add(m); g.add(p); return p; });
      // 다리 순서 [왼뒤, 왼앞, 오른뒤, 오른앞]: 게임에서 0·3, 1·2가 같이 움직여 대각선 걸음이 된다
      g.userData = { legs, kind }; return g;
    }
    const parts = [], col = sp.base;
    parts.push([tube(sp.spine, profile(sp.r), 48, 12), col]);
    const H = sp.head; parts.push([ell(H[0], H[1], H[2], H[3], H[4], H[5], 14), col]);
    if (sp.jaw) parts.push([ell(H[0] * .8, H[1] * .45, H[2] * .9, 0, H[4] - H[1] * .5, H[5] + .02, 10), sp.belly]);
    if (sp.crest) parts.push([tube([[0, H[4] + .1, H[5] - .05], [0, H[4] + .32, H[5] - .3], [0, H[4] + .38, H[5] - .55]], profile([[0, .07], [1, .03]]), 10, 6), sp.back]);
    if (sp.frill) { const f = new T.CylinderGeometry(1.25, 1.25, .12, 18, 1, false, -Math.PI * .5, Math.PI).rotateX(Math.PI / 2).rotateX(-.45).translate(0, H[4] + .45, H[5] - .55); parts.push([f, sp.back]); }
    if (sp.horns) {
      [[-.38, .55, -.2], [.38, .55, -.2]].forEach(([x, y, z]) => parts.push([new T.ConeGeometry(.12, 1.1, 8).rotateX(Math.PI / 2 - .35).translate(x, H[4] + y, H[5] + z + .45), 0xe6dcc0]));
      parts.push([new T.ConeGeometry(.1, .5, 8).rotateX(Math.PI / 2 - .5).translate(0, H[4] + .15, H[5] + .85), 0xe6dcc0]);
    }
    [-1, 1].forEach(s => parts.push([ell(.05, .05, .05, s * H[0] * .75, H[4] + H[1] * .35, H[5] + H[2] * .3, 6), 0x15120e]));  // 눈
    const g = new T.Group();
    const body = new T.Mesh(merge(parts, dinoShade(sp)), mat.v); body.castShadow = true; g.add(body);
    const legs = [], L = sp.legs, lg = legGeo(L.h, L.r, L.biped);
    const legMesh = new T.Mesh(merge([[lg[0], sp.base], [lg[1], sp.back]], dinoShade(sp)), mat.v);
    const hips = L.biped ? [[-L.hip[0], L.hip[1], L.hip[2]], [L.hip[0], L.hip[1], L.hip[2]]]
      : [[-L.hip[0], L.hip[1], L.hip[2]], [L.hip[0], L.hip[1], L.hip[2]], [-L.sh[0], L.sh[1], L.sh[2]], [L.sh[0], L.sh[1], L.sh[2]]];
    hips.forEach((h, i) => {
      const p = new T.Group(); p.position.set(h[0], h[1], h[2]);
      const m = legMesh.clone(); m.castShadow = true;
      if (!L.biped && i >= 2) { const sc = sp.legs.sh[1] / L.h; m.scale.y = sc; }
      p.add(m); g.add(p); legs.push(p);
    });
    if (sp.arms) [-1, 1].forEach(s => { const a = new T.Mesh(merge([[tube([[0, 0, 0], [0, -.18, .12], [0, -.3, .05]], profile([[0, .06], [1, .035]]), 8, 6), sp.base]]), mat.v); a.position.set(s * sp.arms[0], sp.arms[1], sp.arms[2]); g.add(a); });
    g.userData = { legs, kind };
    return g;
  }

  // ---------- 사람 ----------
  function makeHuman(shirt, hair) {
    const g = new T.Group(), skin = 0xe2b18c;
    const torso = new T.Mesh(merge([
      [new T.CapsuleGeometry(.24, .42, 6, 12).scale(1, 1, .72).translate(0, 1.2, 0), shirt],
      [new T.CylinderGeometry(.25, .22, .14, 12).translate(0, .9, 0), 0x5b4a35],          // 허리띠
      [new T.CylinderGeometry(.07, .08, .12, 8).translate(0, 1.58, 0), skin],
      [ell(.15, .18, .16, 0, 1.78, 0, 14), skin],
      [ell(.165, .11, .17, 0, 1.88, -.015, 12), hair || 0x3a2a1e],
      [ell(.025, .025, .02, -.055, 1.8, .145, 6), 0x1a1410], [ell(.025, .025, .02, .055, 1.8, .145, 6), 0x1a1410]
    ]), mat.v);
    torso.castShadow = true; g.add(torso);
    const P = {};
    const armG = merge([[new T.CapsuleGeometry(.065, .5, 4, 8).translate(0, -.3, 0), shirt], [ell(.07, .08, .07, 0, -.62, 0, 8), skin]]);
    const legG = merge([[new T.CapsuleGeometry(.09, .62, 4, 8).translate(0, -.4, 0), 0x4e4434], [ell(.09, .06, .15, 0, -.83, .04, 8), 0x3b2c1f]]);
    [['la', -.3, 1.45, armG], ['ra', .3, 1.45, armG], ['ll', -.12, .88, legG], ['rl', .12, .88, legG]].forEach(([k, x, y, geo]) => {
      const p = new T.Group(); p.position.set(x, y, 0); const m = new T.Mesh(geo, mat.v); m.castShadow = true; p.add(m); g.add(p); P[k] = p;
    });
    const tool = new T.Group(); tool.position.set(0, -.62, .05); P.ra.add(tool); P.tool = tool;
    g.userData = P; return g;
  }
  function setTool(h, item) {
    const t = h.userData.tool; while (t.children.length) t.remove(t.children[0]);
    const wood = 0x7a5636, stone = 0x8f8c84;
    let geo = null;
    if (item === 'axe') geo = merge([[new T.CylinderGeometry(.03, .035, .75, 6).translate(0, .15, 0), wood], [new T.BoxGeometry(.06, .16, .26).translate(0, .45, .1), stone]]);
    if (item === 'spear') geo = merge([[new T.CylinderGeometry(.025, .03, 1.7, 6).translate(0, .3, 0), wood], [new T.ConeGeometry(.05, .3, 6).translate(0, 1.3, 0), stone]]);
    if (item === 'torch') geo = merge([[new T.CylinderGeometry(.03, .035, .6, 6), wood], [ell(.09, .14, .09, 0, .38, 0, 8), 0xffa035]]);
    if (geo) { const m = new T.Mesh(geo, mat.v); m.rotation.x = Math.PI / 2; m.castShadow = true; t.add(m); }
  }
  function animHuman(h, speed, t, swing) {
    const p = h.userData, k = Math.sin(t * 9) * Math.min(1, speed / 4) * .75;
    p.ll.rotation.x = k; p.rl.rotation.x = -k; p.la.rotation.x = -k * .8;
    p.ra.rotation.x = swing > 0 ? -2.3 * Math.sin(swing * Math.PI) : k * .8;
  }

  // ---------- 나무·바위·풀 ----------
  function noiseDisplace(g, amt, seed) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 2) * Math.sin(y * 2.3 + seed * 3);
      const k = 1 + n * amt; p.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals(); return g;
  }
  function pineGeo() {
    const parts = [[new T.CylinderGeometry(.16, .3, 3.2, 7).translate(0, 1.6, 0), 0x5e4230]];
    [[2.2, 1.9, 2.6], [3.6, 1.55, 2.3], [4.9, 1.15, 2.0], [6.0, .75, 1.6]].forEach(([y, r, h], i) => parts.push([noiseDisplace(new T.ConeGeometry(r, h, 9, 2).translate(0, y, 0), .07, i), i % 2 ? 0x2f5a35 : 0x285030]));
    return merge(parts, (x, y, z, nx, ny, nz, c) => { if (y > 1.5) c.offsetHSL(0, 0, ny * .05 + (y - 3) * .012); });
  }
  function leafyGeo() {
    const parts = [[tube([[0, 0, 0], [.1, 1.6, 0], [-.1, 2.6, .1]], profile([[0, .3], [1, .16]]), 10, 7), 0x6a4a32]];
    [[0, 3.6, 0, 1.6], [1.1, 3.1, .3, 1.15], [-1, 3.2, -.2, 1.2], [.2, 4.4, -.6, 1.1], [-.3, 3.0, 1.0, 1.0]].forEach(([x, y, z, r], i) =>
      parts.push([noiseDisplace(new T.IcosahedronGeometry(r, 1).translate(0, 0, 0), .12, i + 5).translate(x, y, z), 0x4a7a35]));
    return merge(parts, (x, y, z, nx, ny, nz, c) => { if (y > 2.4) c.offsetHSL(.01, 0, ny * .07); });
  }
  function rockGeo(seed) {
    return merge([[noiseDisplace(new T.IcosahedronGeometry(1, 1), .18, seed).scale(1.2, .75, 1).translate(0, .4, 0), 0x8c8a82]],
      (x, y, z, nx, ny, nz, c) => { if (ny > .6) c.lerp(new T.Color(0x6f7a52), .35); c.offsetHSL(0, 0, Math.sin(x * 5 + z * 3) * .03); });
  }
  function bushGeo() {
    const parts = [];
    [[0, .45, 0, .6], [.4, .35, .2, .45], [-.35, .38, -.1, .5]].forEach(([x, y, z, r], i) => parts.push([noiseDisplace(new T.IcosahedronGeometry(r, 1), .12, i).translate(x, y, z), 0x3d6b30]));
    [[.35, .7, .35], [-.3, .65, .4], [.1, .85, -.3], [-.45, .5, -.25]].forEach(([x, y, z]) => parts.push([ell(.07, .07, .07, x, y, z, 6), 0xc42c3a]));
    return merge(parts);
  }
  function grassBlade() {
    // 풀잎 3장 묶음 (아래 = 짙은 초록, 위 = 밝은 초록)
    const pos = [], col = [], c1 = new T.Color(0x3e6a2c), c2 = new T.Color(0x8fae58);
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI, ox = Math.cos(a) * .12, oz = Math.sin(a) * .12, w = .05;
      const tip = .55 + k * .08;
      pos.push(ox - w, 0, oz, ox + w, 0, oz, ox, tip, oz + .05, ox + w, 0, oz, ox - w, 0, oz, ox, tip, oz + .05);   // 앞·뒤 두 장 (뒤에서 봐도 밝게)
      for (let q = 0; q < 2; q++) col.push(c1.r, c1.g, c1.b, c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);   // 위에서 비추는 빛처럼 고르게
    return g;
  }

  // ---------- 건물 (원시 캠프) ----------
  const WOOD = 0x7b5a3c, WOOD2 = 0x6a4b31, THATCH = 0xb59a5e, CLOTH = 0xc8b48a, HIDE = 0x9a7350, STONE = 0x8a857a;
  function logLine(ax, az, bx, bz, y, r, parts, color) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const g = new T.CylinderGeometry(r, r, L, 7).rotateZ(Math.PI / 2).rotateY(-Math.atan2(dz, dx)).translate((ax + bx) / 2, y, (az + bz) / 2);
    parts.push([g, color || WOOD]);
  }
  // 울타리 한 칸: 길이 len (x 방향), 말뚝 + 가로대
  function fenceGeo(len) {
    const parts = [], n = Math.max(2, Math.round(len / 1.5) + 1);
    for (let i = 0; i < n; i++) { const x = -len / 2 + len * i / (n - 1); parts.push([new T.CylinderGeometry(.09, .11, 1.7, 6).translate(x, .85, 0), WOOD2]); parts.push([new T.ConeGeometry(.1, .25, 6).translate(x, 1.82, 0), WOOD2]); }
    logLine(-len / 2, 0, len / 2, 0, .55, .06, parts); logLine(-len / 2, 0, len / 2, 0, 1.2, .06, parts);
    return merge(parts, (x, y, z, nx, ny, nz, c) => c.offsetHSL(0, 0, Math.sin(x * 7) * .03));
  }
  // 통나무 오두막: w × d, 앞쪽(+z) 가운데에 문
  function cabinGeo(w, d) {
    const parts = [], H = 2.6, r = .17, door = 1.4;
    for (let y = r; y < H; y += r * 2) {
      logLine(-w / 2 - .3, -d / 2, w / 2 + .3, -d / 2, y, r, parts);                         // 뒤
      logLine(-w / 2, -d / 2 - .3, -w / 2, d / 2 + .3, y, r, parts); logLine(w / 2, -d / 2 - .3, w / 2, d / 2 + .3, y, r, parts);  // 옆
      if (y > 2.1) logLine(-w / 2 - .3, d / 2, w / 2 + .3, d / 2, y, r, parts);                // 문 위
      else { logLine(-w / 2 - .3, d / 2, -door / 2, d / 2, y, r, parts); logLine(door / 2, d / 2, w / 2 + .3, d / 2, y, r, parts); }
    }
    // 박공 벽 + 초가 지붕
    const ridge = H + w * .38;
    const gable = new T.BufferGeometry(); gable.setAttribute('position', new T.Float32BufferAttribute([-w / 2, H, 0, w / 2, H, 0, 0, ridge, 0], 3)); gable.computeVertexNormals();
    parts.push([gable.clone().translate(0, 0, -d / 2), WOOD2]); parts.push([gable.clone().rotateY(Math.PI).translate(0, 0, d / 2), WOOD2]);
    const slope = Math.hypot(w / 2 + .6, ridge - H + .3), ang = Math.atan2(ridge - H + .3, w / 2 + .6);
    [-1, 1].forEach(s => parts.push([new T.BoxGeometry(slope, .22, d + 1.2).rotateZ(-s * ang).translate(s * (w / 4 + .3), (H + ridge) / 2 - .05, 0), THATCH]));
    logLine(0, -d / 2 - .7, 0, d / 2 + .7, ridge + .1, .14, [], 0); parts.push([new T.CylinderGeometry(.14, .14, d + 1.4, 7).rotateX(Math.PI / 2).translate(0, ridge + .1, 0), WOOD2]);
    return merge(parts, (x, y, z, nx, ny, nz, c) => c.offsetHSL(0, 0, Math.sin(y * 11 + x * .7) * .025));
  }
  function kilnGeo() {
    const parts = [[new T.SphereGeometry(1.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x9a7d62], [new T.CylinderGeometry(.25, .3, 1.3, 10).translate(.4, 1.6, -.3), 0x8a6e55],
      [new T.BoxGeometry(.6, .55, .3).translate(0, .28, 1.2), 0x2a1d14]];
    return merge(parts, (x, y, z, nx, ny, nz, c) => { if (Math.sin(y * 9) > .7) c.multiplyScalar(.85); });
  }
  function tentGeo() {
    const parts = [[new T.CylinderGeometry(.02, 2.0, 2.3, 4, 1, true).rotateY(Math.PI / 4).scale(1, 1, 1.3).translate(0, 1.15, 0), CLOTH]];
    [[1.4, 0, 1.4], [-1.4, 0, 1.4], [1.4, 0, -1.4], [-1.4, 0, -1.4]].forEach(([x, , z]) => logLine(x * .2, z * .2, x * 1.02, z * 1.3, 1.2 + .3, .04, parts));
    const g = merge(parts); g.computeVertexNormals(); return g;
  }
  function rackGeo() {
    const parts = [];
    [[-1, 0], [1, 0]].forEach(([x]) => { logLine(x, -.5, x, .0, .0, 0, []); parts.push([new T.CylinderGeometry(.05, .06, 1.8, 6).rotateZ(.15 * x).translate(x * 1.05, .9, -.4), WOOD2]); parts.push([new T.CylinderGeometry(.05, .06, 1.8, 6).rotateZ(.15 * x).translate(x * 1.05, .9, .4), WOOD2]); });
    logLine(-1.2, 0, 1.2, 0, 1.75, .05, parts);
    [-.6, 0, .6].forEach(x => parts.push([new T.PlaneGeometry(.5, .8).translate(x, 1.35, 0), HIDE]));
    return merge(parts);
  }
  function fireGeo() {
    const parts = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; parts.push([noiseDisplace(new T.IcosahedronGeometry(.2, 0), .2, i).translate(Math.cos(a) * .6, .12, Math.sin(a) * .6), STONE]); }
    logLine(-.4, -.2, .4, .2, .15, .07, parts); logLine(-.3, .3, .3, -.3, .2, .07, parts);
    return merge(parts);
  }
  function fieldGeo(w, d) {
    const parts = [[new T.BoxGeometry(w, .1, d).translate(0, .03, 0), 0x5a4330]];
    for (let r = 0; r < Math.floor(d / 1.2); r++) for (let i = 0; i < Math.floor(w / .7); i++) {
      const x = -w / 2 + .35 + i * .7, z = -d / 2 + .6 + r * 1.2;
      parts.push([new T.ConeGeometry(.15, .5, 5).translate(x, .3, z), 0x6e9a3e]);
    }
    return merge(parts);
  }
  function seatGeo() { return merge([[new T.CylinderGeometry(.25, .25, 1.6, 8).rotateZ(Math.PI / 2).translate(0, .25, 0), WOOD]]); }

  window.MODELS = { assetGeo, merge, tube, profile, ell, mat, SPECIES, makeDino, makeHuman, setTool, animHuman, pineGeo, leafyGeo, rockGeo, bushGeo, grassBlade,
    fenceGeo, cabinGeo, kilnGeo, tentGeo, rackGeo, fireGeo, fieldGeo, seatGeo, noiseDisplace };
})();
