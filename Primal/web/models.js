// 원시섬 0.3 모형: STL 에셋(assets.js)에 재질(textures.js)을 입히고, 코드로 만든 공룡·사람·나무를 더한다.
(function () {
  'use strict';
  const T = THREE, X = window.TEXTURES;

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

  // ---------- STL 에셋 (assets.js · convert.py 가 만든다) ----------
  function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  const _part = {}, _obj = {}, _inst = {}, _legGeo = {};

  // 16비트 위치 + 색인 → BufferGeometry (UV 는 법선이 가장 크게 보는 축으로 투영 · STL 에는 UV 가 없다)
  function decodePart(p, uvScale) {
    const q = new Uint16Array(b64(p.v)), n = q.length / 3;
    const pos = new Float32Array(q.length);
    const sp = [p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++)
      pos[i * 3 + a] = p.lo[a] + (sp[a] > 1e-9 ? q[i * 3 + a] / 65535 * sp[a] : 0);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(new T.BufferAttribute(p.b ? new Uint32Array(b64(p.i)) : new Uint16Array(b64(p.i)), 1));
    g.computeVertexNormals();
    const nor = g.attributes.normal, uv = new Float32Array(n * 2), s = uvScale === undefined ? .5 : uvScale;
    for (let i = 0; i < n; i++) {
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let u, v;
      if (ny >= nx && ny >= nz) { u = x; v = z; }
      else if (nx >= nz) { u = z; v = y; }
      else { u = x; v = y; }
      uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
    }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }

  function partGeo(k, p) {
    if (!_part[k]) _part[k] = decodePart(p, X.uv(p.m));
    return _part[k];
  }

  // 재질별 Meshes 로 된 Group. opts: {scale:[x,y,z], material, noShadow}
  function assetObject(name, opts) {
    const A = window.ASSETS && window.ASSETS[name];
    if (!A) return null;
    opts = opts || {};
    const g = new T.Group();
    for (let i = 0; i < A.parts.length; i++) {
      const p = A.parts[i];
      const m = new T.Mesh(partGeo(name + '#' + i, p), opts.material || X.material(p.m));
      m.castShadow = !opts.noShadow; m.receiveShadow = true;
      g.add(m);
    }
    const sc = opts.scale || [1, 1, 1];
    g.scale.set(sc[0], sc[1], sc[2]);
    g.userData.size = assetSize(name);
    return g;
  }
  function assetSize(name) {
    const A = window.ASSETS && window.ASSETS[name];
    if (!A) return [1, 1, 1];
    const b = A.bb;
    return [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
  }
  function assetGeo(name) {   // 예전 이름: 재질 없는 한 덩어리(그림자·미리보기용)
    if (!_obj[name]) {
      const A = window.ASSETS && window.ASSETS[name];
      if (!A) return null;
      const parts = A.parts.map((p, i) => [partGeo(name + '#' + i, p), 0xffffff]);
      _obj[name] = merge(parts);
    }
    return _obj[name];
  }

  // ---------- 자연물: 재질 계열별로 합쳐 InstancedMesh 로 많이 놓는다 ----------
  const FAMILY_OF = { bark: 'bark', rachis: 'leaf', leaf: 'leaf', stem: 'leaf', coconut: 'coconut', basalt: 'basalt', stone: 'stone' };
  function colorOf(m) { const p = X.profile(m); return new T.Color(p[1]).offsetHSL(0, -.08, .1); }
  function instanceParts(name) {
    if (_inst[name]) return _inst[name];
    const A = window.ASSETS && window.ASSETS[name];
    if (!A) return null;
    const bucket = {};
    A.parts.forEach((p, i) => {
      const fam = FAMILY_OF[p.m] || p.m;
      (bucket[fam] = bucket[fam] || []).push([partGeo(name + '#' + i, p), colorOf(p.m)]);
    });
    const out = [];
    for (const fam in bucket) {
      const g = merge(bucket[fam]);
      out.push({ family: fam, geo: g });
    }
    _inst[name] = out;
    return out;
  }

  // ---------- 공룡 ----------
  // species: 이름·색조(stl 모형에 곱한다)·줄무늬, 그리고 모형이 없을 때 그릴 몸(등뼈 선·머리·다리)
  const SPECIES = {
    grazer: {
      spine: [[0, .95, -2.4], [0, 1.05, -1.3], [0, 1.15, -.2], [0, 1.3, .6], [0, 1.65, 1.05], [0, 1.95, 1.25]],
      r: [[0, .04], [.25, .2], [.5, .42], [.68, .34], [.85, .17], [1, .14]],
      head: [.17, .2, .34, 0, 2.02, 1.45], crest: true, legs: { biped: true, hip: [.24, 1.1, -.15], h: 1.05, r: .14 }, arms: [.2, 1.35, .55],
      base: 0x8f9c5c, back: 0x5f6b3a, belly: 0xd3cfa0
    },
    claw: {
      spine: [[0, 1.05, -2.6], [0, 1.15, -1.4], [0, 1.25, -.2], [0, 1.4, .55], [0, 1.75, .95], [0, 1.9, 1.1]],
      r: [[0, .03], [.3, .16], [.52, .33], [.7, .27], [.86, .13], [1, .11]],
      head: [.15, .2, .44, 0, 1.97, 1.42], jaw: true, legs: { biped: true, hip: [.2, 1.18, -.1], h: 1.15, r: .12 }, arms: [.17, 1.4, .5],
      base: 0xa96a3f, back: 0x5a3a22, belly: 0xe0c69a, stripes: 7
    },
    longneck: {
      spine: [[0, 2.4, -9], [0, 3.4, -6], [0, 4.2, -3], [0, 4.5, 0], [0, 4.8, 2.4], [0, 6.6, 3.9], [0, 9.2, 4.9], [0, 11.2, 5.4]],
      r: [[0, .1], [.15, .65], [.3, 1.6], [.45, 2.0], [.58, 1.7], [.68, .75], [.85, .5], [1, .4]],
      head: [.55, .5, 1.05, 0, 11.4, 6.0], legs: { biped: false, hip: [.95, 3.9, -2.4], sh: [.95, 4.1, 2.2], h: 3.9, r: .62 },
      base: 0x8e8f86, back: 0x5c5e57, belly: 0xbab7a6, stlTint: 0xdedfd6
    },
    horn: {
      spine: [[0, 1.3, -4.2], [0, 1.7, -2.6], [0, 2.1, -1], [0, 2.2, .6], [0, 1.95, 1.9]],
      r: [[0, .07], [.25, .55], [.5, 1.05], [.75, 1.0], [1, .7]],
      head: [.62, .6, .95, 0, 1.85, 2.6], frill: true, horns: true, legs: { biped: false, hip: [.62, 1.6, -1.6], sh: [.6, 1.5, 1.1], h: 1.5, r: .3 },
      base: 0x7a6a4a, back: 0x4f4430, belly: 0xc2b48c, stlTint: 0xb8a686
    },
    rex: {
      spine: [[0, 2.4, -6.5], [0, 2.6, -3], [0, 2.9, 0], [0, 3.1, 2.5], [0, 3.3, 3.8]], r: [[0, .05], [.4, .5], [.62, .95], [.85, .6], [1, .45]],
      head: [.5, .55, 1, 0, 3.4, 4.2], jaw: true, legs: { biped: true, hip: [.6, 2.0, 0], h: 2.0, r: .35 },
      base: 0x6b5a3f, back: 0x3e3324, belly: 0xb8a37c, stripes: 3, stlTint: 0xb09a76
    },
    plate: {
      spine: [[0, 1.2, -4.3], [0, 1.5, -2.5], [0, 1.9, -.5], [0, 1.7, 1.8], [0, 1.2, 3.3]], r: [[0, .06], [.3, .55], [.55, .95], [.8, .55], [1, .3]],
      head: [.3, .3, .5, 0, 1.15, 3.5], legs: { biped: false, hip: [.5, 1.2, -1.4], sh: [.5, 1.0, 1.4], h: 1.1, r: .25 },
      base: 0x6f7a4a, back: 0x8a5a3a, belly: 0xc8c08f, stlTint: 0x9aa277
    },
    // --- 0.3 에서 새로 들어온 STL 공룡·고생물 (그릴 몸 대신 STL 을 쓴다) ---
    ptera: { stlTint: 0xc9cfc6, stripes: 0, wing: true },
    mammoth: { stlTint: 0xa08a6c, stripes: 0, fur: true },
    para: { stlTint: 0xa8b58c, stripes: 4 },
    anky: { stlTint: 0xb0a280, stripes: 0 },
    raptor: { stlTint: 0xc2a882, stripes: 8 },
    dimetro: { stlTint: 0xa3927a, stripes: 0 },
    spino: { stlTint: 0xa89078, stripes: 3 },
    smilo: { stlTint: 0xb89a7e, stripes: 0 }
  };
  // 몸빛을 받는 부품 (부리·발톱·뼈는 그대로 둔다)
  const SKINNY = { hide: 1, skin: 1, fur: 1, feather: 1, ear: 1, trunk: 1, wing: 1, fin: 1, crest: 1, nose: 1, spine: 1, fringe: 1, plate: 1 };

  function dinoShade(sp) {
    const base = new T.Color(sp.base || 0x8f8f86), back = new T.Color(sp.back || 0x5f5f57), belly = new T.Color(sp.belly || 0xc9c2a8);
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

  // STL 공룡: 부품을 한 덩어리로 합치고(그리기 1회) 색을 꼭짓점에 담는다 — 다리는 따로
  function stlDino(kind) {
    if (_legGeo[kind]) return _legGeo[kind];
    const A = window.ASSETS[kind], sp = SPECIES[kind] || {};
    const tint = new T.Color(sp.stlTint || 0xffffff);
    function bake(parts) {
      const pos = [], nor = [], uv = [], col = [], c = new T.Color();
      for (const p of parts) {
        const g = partGeo(p.key, p.data);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        const base = SKINNY[p.data.m] ? new T.Color(sp.stlTint || 0xaaaa99).lerp(new T.Color(colorOf(p.data.m)), .3)
                                      : new T.Color(colorOf(p.data.m));
        const idx = g.index ? g.index.array : null;        // 색인 순서대로 펼쳐야 삼각형이 맞는다
        const count = idx ? idx.length : P.count;
        for (let t = 0; t < count; t++) {
          const i = idx ? idx[t] : t;
          pos.push(P.getX(i), P.getY(i), P.getZ(i));
          nor.push(N.getX(i), N.getY(i), N.getZ(i));
          uv.push(U.getX(i), U.getY(i));
          col.push(base.r, base.g, base.b);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g.computeBoundingSphere();
      return g;
    }
    // 배는 밝게, 등은 어둡게 + 줄무늬 (합친 뒤 법선을 보고 한 번 더 손본다)
    function rebalance(g) {
      const p = g.attributes.position, n = g.attributes.normal, cl = g.attributes.color;
      const stripes = sp.stripes || 0, c = new T.Color();
      for (let i = 0; i < p.count; i++) {
        const ny = n.getY(i), z = p.getZ(i), y = p.getY(i);
        c.setRGB(cl.getX(i), cl.getY(i), cl.getZ(i));
        if (ny > .35) c.multiplyScalar(1 - Math.min(.3, (ny - .35) * .5));
        if (ny < -.25) c.lerp(new T.Color(1, 1, .86), Math.min(.45, (-ny - .25) * .9));
        if (stripes && ny > -.05 && Math.sin(z * stripes + .5) > .5) c.multiplyScalar(.78);
        c.offsetHSL(0, 0, Math.sin(y * 2.3 + z * 1.7) * .015);
        cl.setXYZ(i, c.r, c.g, c.b);
      }
      cl.needsUpdate = true;
      return g;
    }
    const bodyParts = A.parts.map((p, i) => ({ key: kind + '#' + i, data: p }));
    const out = { body: rebalance(bake(bodyParts)), legs: [], pivots: [] };
    (A.legs || []).forEach((lg, li) => {
      const parts = lg.parts.map((p, i) => ({ key: kind + '@' + li + '#' + i, data: p }));
      const base = bake(parts), g = base.clone();
      out.legs.push(rebalance(g));
      out.pivots.push(lg.pivot);
    });
    _legGeo[kind] = out;
    return out;
  }

  function makeDino(kind) {
    const sp = SPECIES[kind];
    if (window.ASSETS && window.ASSETS[kind]) {
      const d = stlDino(kind), g = new T.Group(), skinMat = X.familyMaterial('hide');
      const body = new T.Mesh(d.body, kind === 'raptor' || kind === 'ptera' ? X.familyMaterial('feather') : (kind === 'mammoth' || kind === 'smilo' ? X.familyMaterial('fur') : skinMat));
      body.castShadow = true; g.add(body);
      const legs = d.legs.map((geo, i) => {
        const pv = d.pivots[i], grp = new T.Group();
        grp.position.set(pv[0], pv[1], pv[2]);
        const m = new T.Mesh(geo, kind === 'mammoth' || kind === 'smilo' ? X.familyMaterial('fur') : skinMat);
        m.castShadow = true; grp.add(m); g.add(grp); return grp;
      });
      // 다리 순서 [왼뒤, 왼앞, 오른뒤, 오른앞]: 게임에서 0·3, 1·2가 같이 움직여 대각선 걸음이 된다
      g.userData = { legs, kind, size: assetSize(kind) };
      return g;
    }
    if (!sp) return null;
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
    [-1, 1].forEach(s => parts.push([ell(.05, .05, .05, s * H[0] * .75, H[4] + H[1] * .35, H[5] + H[2] * .3, 6), 0x15120e]));
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
      [new T.CylinderGeometry(.25, .22, .14, 12).translate(0, .9, 0), 0x5b4a35],
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
  function animHuman(h, speed, t, swing) {
    const p = h.userData, k = Math.sin(t * 9) * Math.min(1, speed / 4) * .75;
    p.ll.rotation.x = k; p.rl.rotation.x = -k; p.la.rotation.x = -k * .8;
    p.ra.rotation.x = swing > 0 ? -2.3 * Math.sin(swing * Math.PI) : k * .8;
  }
  function setTool(h, item) {
    const t = h.userData.tool; while (t.children.length) t.remove(t.children[0]);
    const wood = 0x7a5636, stone = 0x8f8c84;
    let geo = null;
    if (item === 'axe') geo = merge([[new T.CylinderGeometry(.03, .035, .75, 6).translate(0, .15, 0), wood], [new T.BoxGeometry(.06, .16, .26).translate(0, .45, .1), stone]]);
    if (item === 'axe2') geo = merge([[new T.CylinderGeometry(.03, .035, .78, 6).translate(0, .15, 0), wood], [new T.BoxGeometry(.07, .19, .3).translate(0, .47, .1), 0x707078], [new T.ConeGeometry(.04, .22, 5).rotateZ(-Math.PI / 2).translate(-.11, .47, .1), 0xe6dcc0]]);
    if (item === 'spear') geo = merge([[new T.CylinderGeometry(.025, .03, 1.7, 6).translate(0, .3, 0), wood], [new T.ConeGeometry(.05, .3, 6).translate(0, 1.3, 0), stone]]);
    if (item === 'spear2') geo = merge([[new T.CylinderGeometry(.025, .03, 1.8, 6).translate(0, .3, 0), wood], [new T.ConeGeometry(.06, .42, 6).translate(0, 1.42, 0), 0xe6dcc0], [new T.CylinderGeometry(.035, .035, .1, 6).translate(0, 1.16, 0), 0x6b4a2e]]);
    if (item === 'torch') geo = merge([[new T.CylinderGeometry(.03, .035, .6, 6), wood], [ell(.09, .14, .09, 0, .38, 0, 8), 0xffa035]]);
    if (geo) { const m = new T.Mesh(geo, mat.v); m.rotation.x = Math.PI / 2; m.castShadow = true; t.add(m); }
  }

  // ---------- 나무·바위·풀 (코드로 만드는 것) ----------
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
      pos.push(ox - w, 0, oz, ox + w, 0, oz, ox, tip, oz + .05, ox + w, 0, oz, ox - w, 0, oz, ox, tip, oz + .05);
      for (let q = 0; q < 2; q++) col.push(c1.r, c1.g, c1.b, c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);   // 위에서 비추는 빛처럼 고르게
    return g;
  }

  // ---------- 건물 (STL 이 없을 때 쓰는 코드 모형) ----------
  const WOOD = 0x7b5a3c, WOOD2 = 0x6a4b31, THATCH = 0xb59a5e, CLOTH = 0xc8b48a, HIDE = 0x9a7350, STONE = 0x8a857a;
  function logLine(ax, az, bx, bz, y, r, parts, color) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const g = new T.CylinderGeometry(r, r, L, 7).rotateZ(Math.PI / 2).rotateY(-Math.atan2(dz, dx)).translate((ax + bx) / 2, y, (az + bz) / 2);
    parts.push([g, color || WOOD]);
  }
  function fenceGeo(len) {
    const parts = [], n = Math.max(2, Math.round(len / 1.5) + 1);
    for (let i = 0; i < n; i++) { const x = -len / 2 + len * i / (n - 1); parts.push([new T.CylinderGeometry(.09, .11, 1.7, 6).translate(x, .85, 0), WOOD2]); parts.push([new T.ConeGeometry(.1, .25, 6).translate(x, 1.82, 0), WOOD2]); }
    logLine(-len / 2, 0, len / 2, 0, .55, .06, parts); logLine(-len / 2, 0, len / 2, 0, 1.2, .06, parts);
    return merge(parts, (x, y, z, nx, ny, nz, c) => c.offsetHSL(0, 0, Math.sin(x * 7) * .03));
  }
  function cabinGeo(w, d) {
    const parts = [], H = 2.6, r = .17, door = 1.4;
    for (let y = r; y < H; y += r * 2) {
      logLine(-w / 2 - .3, -d / 2, w / 2 + .3, -d / 2, y, r, parts);
      logLine(-w / 2, -d / 2 - .3, -w / 2, d / 2 + .3, y, r, parts); logLine(w / 2, -d / 2 - .3, w / 2, d / 2 + .3, y, r, parts);
      if (y > 2.1) logLine(-w / 2 - .3, d / 2, w / 2 + .3, d / 2, y, r, parts);
      else { logLine(-w / 2 - .3, d / 2, -door / 2, d / 2, y, r, parts); logLine(door / 2, d / 2, w / 2 + .3, d / 2, y, r, parts); }
    }
    const ridge = H + w * .38;
    const gable = new T.BufferGeometry(); gable.setAttribute('position', new T.Float32BufferAttribute([-w / 2, H, 0, w / 2, H, 0, 0, ridge, 0], 3)); gable.computeVertexNormals();
    parts.push([gable.clone().translate(0, 0, -d / 2), WOOD2]); parts.push([gable.clone().rotateY(Math.PI).translate(0, 0, d / 2), WOOD2]);
    const slope = Math.hypot(w / 2 + .6, ridge - H + .3), ang = Math.atan2(ridge - H + .3, w / 2 + .6);
    [-1, 1].forEach(s => parts.push([new T.BoxGeometry(slope, .22, d + 1.2).rotateZ(-s * ang).translate(s * (w / 4 + .3), (H + ridge) / 2 - .05, 0), THATCH]));
    parts.push([new T.CylinderGeometry(.14, .14, d + 1.4, 7).rotateX(Math.PI / 2).translate(0, ridge + .1, 0), WOOD2]);
    return merge(parts, (x, y, z, nx, ny, nz, c) => c.offsetHSL(0, 0, Math.sin(y * 11 + x * .7) * .025));
  }
  function kilnGeo() {
    const parts = [[new T.SphereGeometry(1.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x9a7d62], [new T.CylinderGeometry(.25, .3, 1.3, 10).translate(.4, 1.6, -.3), 0x8a6e55],
      [new T.BoxGeometry(.6, .55, .3).translate(0, .28, 1.2), 0x2a1d14]];
    return merge(parts, (x, y, z, nx, ny, nz, c) => { if (Math.sin(y * 9) > .7) c.multiplyScalar(.85); });
  }
  function tentGeo() {
    const parts = [[new T.CylinderGeometry(.02, 2.0, 2.3, 4, 1, true).rotateY(Math.PI / 4).scale(1, 1, 1.3).translate(0, 1.15, 0), CLOTH]];
    [[1.4, 0, 1.4], [-1.4, 0, 1.4], [1.4, 0, -1.4], [-1.4, 0, -1.4]].forEach(([x, , z]) => logLine(x * .2, z * .2, x * 1.02, z * 1.3, 1.5, .04, parts));
    const g = merge(parts); g.computeVertexNormals(); return g;
  }
  function rackGeo() {
    const parts = [];
    [[-1, 0], [1, 0]].forEach(([x]) => { parts.push([new T.CylinderGeometry(.05, .06, 1.8, 6).rotateZ(.15 * x).translate(x * 1.05, .9, -.4), WOOD2]); parts.push([new T.CylinderGeometry(.05, .06, 1.8, 6).rotateZ(.15 * x).translate(x * 1.05, .9, .4), WOOD2]); });
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

  window.MODELS = {
    assetObject, assetGeo, assetSize, instanceParts, decodePart,
    merge, tube, profile, ell, mat, SPECIES, makeDino, makeHuman, setTool, animHuman,
    pineGeo, leafyGeo, rockGeo, bushGeo, grassBlade,
    fenceGeo, cabinGeo, kilnGeo, tentGeo, rackGeo, fireGeo, fieldGeo, seatGeo, noiseDisplace
  };
})();
