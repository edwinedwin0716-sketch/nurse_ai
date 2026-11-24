// 원시섬 0.3: 절차적 PBR 텍스처 — 그림 파일 없이 캔버스로 알베도·노멀·러프니스를 만든다.
// three.js r158 · window.TEXTURES 로 쓴다 (모듈 아님). 무거운 계산은 한 장씩 미뤄서 한다(pump).
(function () {
  'use strict';
  const T = THREE;

  // ---------- 품질 ----------
  const SIZE_OF = { high: 192, mid: 128, low: 96 };
  let LEVEL = 'high', SIZE = 256;
  let wantNormal = true, wantRough = true, aniso = 8;

  // ---------- 잡음 ----------
  function hash2(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 1442695040;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
  }
  function valueNoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, oct, seed) {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * valueNoise(x * f, y * f, seed + i * 17); f *= 2.03; amp *= 0.5; }
    return s;
  }
  function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
  function noiseFill(ctx, size, fn) {
    const img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, rgb = fn(x / size, y / size, x, y);
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  function grain(ctx, size, amount, seed) {
    const img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const p = i >> 2, n = (hash2(p % size, (p / size) | 0, seed) - 0.5) * amount;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }

  // 알베도를 높이 지도로 보고 노멀 맵을 만든다 (가장자리는 반대쪽에서 감아 온다)
  function normalFrom(src, strength) {
    const size = src.width, s = src.getContext('2d').getImageData(0, 0, size, size).data;
    const out = canvas(size), ctx = out.getContext('2d'), img = ctx.createImageData(size, size);
    const H = (x, y) => {
      const xi = ((x % size) + size) % size, yi = ((y % size) + size) % size, i = (yi * size + xi) << 2;
      return (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) / 255;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1), i = (y * size + x) << 2;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }
  // 밝기에서 거칠기를 만든다: 밝은 곳은 매끈, 어두운 틈은 거칠다
  function roughFrom(src, base) {
    const size = src.width, s = src.getContext('2d').getImageData(0, 0, size, size).data;
    const out = canvas(size), ctx = out.getContext('2d'), img = ctx.createImageData(size, size);
    for (let i = 0; i < s.length; i += 4) {
      const lum = (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) / 255;
      const r = Math.max(0, Math.min(1, base + (0.55 - lum) * 0.5)) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = r; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  // 알베도를 밝은 '결' 그림으로 바꾼다 — 실제 색은 재질 색(또는 꼭짓점 색)이 정하고, 이 그림은 무늬만 더한다.
  // (어두운 색을 두 번 곱해 구조물이 새까매지는 것을 막는다)
  function brighten(cv, mean, contrast) {
    const size = cv.width, ctx = cv.getContext('2d'), img = ctx.getImageData(0, 0, size, size), d = img.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255;
    const avg = sum / (d.length / 4) || .5;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255;
      const nl = Math.max(.07, Math.min(1.15, mean + (lum - avg) * contrast));
      const k = nl / Math.max(lum, .04);
      d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function tex(cv, srgb) {
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = aniso;
    t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
    return t;
  }

  // ---------- 재질별 그림 ----------
  function tWood(dark, rows, seed) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    ctx.fillStyle = dark; ctx.fillRect(0, 0, S, S);
    rows = rows || 6;
    const h = S / rows;
    for (let r = 0; r < rows; r++) {
      const sh = 0.82 + 0.3 * hash2(r, 3, 11 + seed);
      ctx.fillStyle = 'rgba(' + ((120 * sh) | 0) + ',' + ((84 * sh) | 0) + ',' + ((48 * sh) | 0) + ',0.55)';
      ctx.fillRect(0, r * h, S, h - 2);
      for (let g = 0; g < 22; g++) {
        const yy = r * h + hash2(g, r, 5) * h;
        ctx.strokeStyle = 'rgba(60,38,20,' + (0.06 + 0.12 * hash2(g, r, 9)) + ')';
        ctx.lineWidth = 0.6 + hash2(g, r, 2) * 1.8;
        ctx.beginPath();
        for (let x = 0; x <= S; x += S / 16) {
          const wob = Math.sin((x / S) * 6.28 * (1 + hash2(g, r, 6)) + g) * (1.2 + 1.6 * hash2(g, r, 7));
          x === 0 ? ctx.moveTo(x, yy + wob) : ctx.lineTo(x, yy + wob);
        }
        ctx.stroke();
      }
      if (hash2(r, 1, 4) > 0.55) {
        const kx = hash2(r, 2, 8) * S, ky = r * h + h * 0.5;
        const grd = ctx.createRadialGradient(kx, ky, 1, kx, ky, h * 0.42);
        grd.addColorStop(0, 'rgba(40,24,12,0.85)'); grd.addColorStop(1, 'rgba(40,24,12,0)');
        ctx.fillStyle = grd; ctx.beginPath();
        ctx.ellipse(kx, ky, h * 0.42, h * 0.26, 0, 0, 6.3); ctx.fill();
      }
      ctx.fillStyle = 'rgba(30,20,10,0.35)'; ctx.fillRect(0, r * h + h - 3, S, 3);
    }
    grain(ctx, S, 26, 3 + seed);
    return c;
  }
  function tStone(base, seed, cracks) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    noiseFill(ctx, S, (u, v) => {
      const n = fbm(u * 9, v * 9, 3, 21 + seed) * 0.6 + fbm(u * 30, v * 30, 2, 55 + seed) * 0.4;
      const k = 0.72 + n * 0.55;
      return [base[0] * k, base[1] * k, base[2] * k];
    });
    for (let i = 0; i < 70; i++) {
      const x = hash2(i, 1, 3) * S, y = hash2(i, 2, 4) * S, r = 2 + hash2(i, 3, 5) * 14;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    }
    if (cracks) for (let i = 0; i < cracks; i++) {
      let x = hash2(i, 7, 6) * S, y = hash2(i, 8, 9) * S;
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.8 + hash2(i, 9, 2);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (hash2(i, k, 3) - .5) * S * .22; y += (hash2(i, k, 4) - .5) * S * .22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    grain(ctx, S, 30, 7 + seed);
    return c;
  }
  function tHide(base, seed) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    noiseFill(ctx, S, (u, v) => {
      const k = 0.78 + fbm(u * 14, v * 14, 4, 31 + seed) * 0.42;
      return [base[0] * k, base[1] * k, base[2] * k];
    });
    for (let i = 0; i < 100; i++) {
      const x = hash2(i, 7, 9) * S, y = hash2(i, 8, 10) * S, len = 8 + hash2(i, 9, 11) * S * .2, ang = hash2(i, 10, 12) * 6.28;
      ctx.strokeStyle = 'rgba(0,0,0,' + (0.05 + hash2(i, 11, 13) * 0.12) + ')';
      ctx.lineWidth = 0.7 + hash2(i, 12, 14) * 1.4;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(ang) * len * .5, y + Math.sin(ang) * len * .5 + 4, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
    for (let i = 0; i < 600; i++) {
      const x = hash2(i, 21, 3) * S, y = hash2(i, 22, 4) * S, r = 1 + hash2(i, 23, 5) * 2.4;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.02 + hash2(i, 24, 6) * 0.05) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    }
    grain(ctx, S, 16, 17 + seed);
    return c;
  }
  function tHair(base, n, len, seed) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    ctx.fillStyle = 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < n; i++) {
      const x = hash2(i, 1, 2 + seed) * S, y = hash2(i, 2, 3) * S;
      const L = len * (0.4 + hash2(i, 3, 4) * 1.6), ang = Math.PI * .5 + (hash2(i, 4, 5) - .5) * 0.8;
      const k = 0.55 + hash2(i, 5, 6) * 0.8;
      ctx.strokeStyle = 'rgba(' + ((base[0] * k) | 0) + ',' + ((base[1] * k) | 0) + ',' + ((base[2] * k) | 0) + ',0.55)';
      ctx.lineWidth = 0.8 + hash2(i, 6, 7) * 1.7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * L * .35, y + Math.sin(ang) * L); ctx.stroke();
    }
    grain(ctx, S, 22, 9 + seed);
    return c;
  }
  function tLeaf(base) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    noiseFill(ctx, S, (u, v) => {
      const k = 0.72 + fbm(u * 12, v * 12, 4, 41) * 0.6;
      return [base[0] * k, base[1] * k, base[2] * k * 0.9];
    });
    for (let i = 0; i < 34; i++) {
      const x = hash2(i, 1, 2) * S;
      ctx.strokeStyle = 'rgba(210,225,170,0.13)'; ctx.lineWidth = 1 + hash2(i, 3, 4) * 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + S * .12, S * .33, x - S * .12, S * .66, x, S); ctx.stroke();
    }
    grain(ctx, S, 18, 19);
    return c;
  }
  function tCloth(base, seed) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    ctx.fillStyle = 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    ctx.fillRect(0, 0, S, S);
    const step = Math.max(3, S >> 6);
    for (let i = 0; i < S; i += step) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(i, 0, step / 2, S);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, i, S, step / 2);
    }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = 'rgba(120,90,60,0.06)';
      ctx.beginPath(); ctx.arc(hash2(i, 1, 3) * S, hash2(i, 2, 4) * S, 5 + hash2(i, 3, 5) * S * .05, 0, 6.3); ctx.fill();
    }
    grain(ctx, S, 16, 25 + seed);
    return c;
  }
  function tRope(base) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    ctx.fillStyle = 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    ctx.fillRect(0, 0, S, S);
    ctx.lineWidth = Math.max(3, S / 28);
    for (let i = -S; i < S * 2; i += S / 10) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S * .7, S); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(i + S / 40, 0); ctx.lineTo(i + S * .72, S); ctx.stroke();
    }
    grain(ctx, S, 30, 23);
    return c;
  }
  function tMetal(base) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    ctx.fillStyle = 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 600; i++) {
      const y = hash2(i, 1, 3) * S, k = 0.7 + hash2(i, 2, 4) * 0.6;
      ctx.strokeStyle = 'rgba(' + ((base[0] * k) | 0) + ',' + ((base[1] * k) | 0) + ',' + ((base[2] * k) | 0) + ',0.35)';
      ctx.lineWidth = 0.5 + hash2(i, 3, 5) * 1.2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (hash2(i, 4, 6) - .5) * 3); ctx.stroke();
    }
    grain(ctx, S, 18, 21);
    return c;
  }
  function tThatch(base) {
    const c = canvas(SIZE), ctx = c.getContext('2d'), S = SIZE;
    ctx.fillStyle = 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 800; i++) {
      const x = hash2(i, 1, 3) * S, y = hash2(i, 2, 4) * S, L = S * .06 + hash2(i, 3, 5) * S * .22;
      const ang = Math.PI * .5 + (hash2(i, 4, 6) - .5) * 0.5, k = 0.6 + hash2(i, 5, 7) * 0.75;
      ctx.strokeStyle = 'rgba(' + ((base[0] * k) | 0) + ',' + ((base[1] * k) | 0) + ',' + ((base[2] * k) | 0) + ',0.7)';
      ctx.lineWidth = 1 + hash2(i, 6, 8) * 2.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * L * .25, y + Math.sin(ang) * L); ctx.stroke();
    }
    grain(ctx, S, 24, 13);
    return c;
  }

  // 재질 이름 → 그림 (없으면 돌)
  const PAINT = {
    wood: () => tWood('#5a3c21', 6, 0),
    plank: () => tWood('#6b4626', 4, 2),
    log: () => tWood('#4b3320', 3, 4),
    bark: () => tWood('#3d2a1a', 9, 6),
    stone: () => tStone([148, 141, 128], 0, 3),
    mortar: () => tStone([126, 116, 104], 2, 5),
    basalt: () => tStone([86, 90, 94], 4, 2),
    clay: () => tStone([176, 118, 84], 6, 1),
    hide: () => tHide([124, 127, 82], 0),
    skin: () => tHide([140, 120, 92], 2),
    leather: () => tHide([107, 74, 46], 4),
    ear: () => tHide([109, 83, 52], 6),
    trunk: () => tHide([107, 81, 54], 8),
    wing: () => tHide([106, 83, 64], 10),
    fin: () => tHide([138, 90, 58], 12),
    crest: () => tHide([169, 80, 44], 14),
    nose: () => tHide([75, 59, 47], 16),
    fur: () => tHair([107, 83, 60], 1500, SIZE / 16, 0),
    fringe: () => tHair([93, 72, 51], 1800, SIZE / 14, 2),
    feather: () => tHair([90, 100, 104], 700, SIZE / 20, 4),
    thatch: () => tThatch([187, 154, 88]),
    thatchfloor: () => tThatch([168, 138, 78]),
    leaf: () => tLeaf([78, 122, 56]),
    stem: () => tLeaf([95, 122, 58]),
    rachis: () => tLeaf([109, 122, 60]),
    cloth: () => tCloth([214, 200, 172], 0),
    sail: () => tCloth([214, 198, 162], 2),
    rope: () => tRope([190, 168, 116]),
    net: () => tRope([156, 133, 88]),
    basket: () => tRope([169, 140, 86]),
    metal: () => tMetal([120, 122, 128]),
    fish: () => tStone([157, 172, 180], 8, 0),
    fishfin: () => tHide([125, 138, 146], 18),
    bone: () => tStone([226, 214, 184], 10, 0),
    shell: () => tStone([232, 222, 206], 12, 0),
    plate: () => tStone([141, 123, 83], 14, 2),
    spike: () => tStone([214, 200, 168], 16, 0),
    spine: () => tStone([95, 77, 52], 18, 1),
    beak: () => tStone([202, 187, 152], 20, 0),
    claw: () => tStone([46, 41, 33], 22, 0),
    hoof: () => tStone([42, 35, 28], 24, 0),
    coconut: () => tWood('#4a3222', 8, 10),
    coal: () => tStone([29, 26, 23], 26, 3)
  };

  // 재질 이름 → [그림, 색, 거칠기, 금속성, uv(1m당 반복), 발광]
  const PROFILE = {
    wood: ['wood', 0x8a6136, .82, 0, .55], plank: ['plank', 0x9c7345, .76, 0, .5], log: ['log', 0x7b5432, .84, 0, .42],
    bark: ['bark', 0x5b4128, .9, 0, .5], rachis: ['rachis', 0x6d7a3c, .8, 0, .9],
    stone: ['stone', 0x9a9488, .9, 0, .42], basalt: ['basalt', 0x4b4f52, .84, 0, .55], mortar: ['mortar', 0x8d8377, .94, 0, .6],
    clay: ['clay', 0xa9623e, .8, 0, .6], thatch: ['thatch', 0xbb9a58, .95, 0, .5], thatchfloor: ['thatchfloor', 0xa88a4e, .96, 0, .8],
    leather: ['leather', 0x6b4a2e, .78, 0, .55], hide: ['hide', 0x7c7f52, .8, 0, .4], skin: ['skin', 0x8b7a56, .78, 0, .4],
    ear: ['ear', 0x6d5334, .86, 0, .5], trunk: ['trunk', 0x6b5136, .84, 0, .45], fringe: ['fringe', 0x5d4833, .95, 0, .6],
    fur: ['fur', 0x6b533c, .94, 0, .45], feather: ['feather', 0x5a6468, .86, 0, .5], wing: ['wing', 0x6a5340, .74, 0, .35],
    crest: ['crest', 0xa9502c, .72, 0, .5], beak: ['beak', 0xcabb98, .55, 0, .9], claw: ['claw', 0x2e2921, .5, 0, 1.2],
    hoof: ['hoof', 0x2a231c, .6, 0, 1.2], bone: ['bone', 0xded2b4, .6, 0, .7], plate: ['plate', 0x8d7b53, .72, 0, .6],
    spike: ['spike', 0xd6c8a8, .5, 0, .9], spine: ['spine', 0x5f4d34, .8, 0, .7], metal: ['metal', 0x71737a, .35, .9, .6],
    ember: [null, 0x3a1408, .7, 0, .8, 0xff5a18], coal: ['coal', 0x1d1a17, .92, 0, 1], water: [null, 0x2f6a78, .06, .1, 1],
    rope: ['rope', 0xb59a6a, .95, 0, 1.1], net: ['net', 0x9c8558, .95, 0, 1.6], basket: ['basket', 0xa98c56, .94, 0, 1],
    leaf: ['leaf', 0x4e7a38, .7, 0, .8], stem: ['stem', 0x5f7a3a, .75, 0, .9], sail: ['sail', 0xd6c6a2, .88, 0, .45],
    cloth: ['cloth', 0xd6c6a2, .88, 0, .6], fin: ['fin', 0x8a5a3a, .7, 0, .4], fish: ['fish', 0x9dacb4, .36, .55, 1.2],
    fishfin: ['fishfin', 0x7d8a92, .6, 0, 1.2], coconut: ['coconut', 0x4a3222, .85, 0, .9], shell: ['shell', 0xe6dccb, .45, 0, 1.2]
  };
  const DOUBLE = { wing: 1, leaf: 1, sail: 1, fin: 1, feather: 1, net: 1, fishfin: 1, rachis: 1, stem: 1, cloth: 1 };

  // ---------- 한 장씩 미뤄서 만드는 큐 ----------
  const surf = {};            // surfaceKey -> {map, normalMap, roughnessMap}
  const mats = {};            // materialKey -> material (구조물)
  const fams = {};            // materialKey -> material (흰 바탕 · 꼭짓점 색)
  const queue = [];           // 아직 그림이 없는 surfaceKey
  const waiting = {};         // surfaceKey -> [material...]
  let built = 0, started = performance.now();

  function need(key) {
    if (surf[key]) return surf[key];
    if (queue.indexOf(key) < 0) queue.push(key);
    return null;
  }
  function makeSurface(key) {
    const paint = PAINT[key] || PAINT.stone;
    const albedo = paint();
    const keyMat = Object.keys(PROFILE).find(k => PROFILE[k][0] === key) || 'stone';
    const baseRough = PROFILE[keyMat][2];
    const normalSrc = wantNormal ? normalFrom(albedo, 2.6) : null;   // 요철은 원래 그림에서 뽑는다
    const roughSrc = wantRough ? roughFrom(albedo, baseRough) : null;
    brighten(albedo, .96, .3);
    const out = { map: tex(albedo, true) };
    if (normalSrc) out.normalMap = tex(normalSrc, false);
    if (roughSrc) out.roughnessMap = tex(roughSrc, false);
    surf[key] = out;
    built++;
    const list = waiting[key];
    if (list) for (const m of list) apply(m, key, out);
    return out;
  }
  function apply(m, key, out) {
    m.map = out.map;
    if (m.normalMap !== undefined) { m.normalMap = out.normalMap || null; m.normalScale = new T.Vector2(.85, .85); }
    if (m.roughnessMap !== undefined) m.roughnessMap = out.roughnessMap || null;
    m.needsUpdate = true;
  }

  function makeMaterial(key, vcol) {
    const p = PROFILE[key] || PROFILE.stone;
    const col = vcol ? new T.Color(0xffffff) : new T.Color(p[1]).offsetHSL(0, -.1, .12);
    let m;
    if (key === 'water') {
      m = new T.MeshPhysicalMaterial({ color: p[1], roughness: p[2], metalness: 0, transmission: .75, thickness: .6, ior: 1.33, clearcoat: 1, clearcoatRoughness: .05, transparent: true, opacity: .92 });
    } else if (key === 'ember') {
      m = new T.MeshStandardMaterial({ color: p[1], roughness: p[2], metalness: 0, emissive: new T.Color(p[5] || 0xff5a18), emissiveIntensity: 2.6 });
    } else if (!wantNormal && !wantRough) {
      m = new T.MeshLambertMaterial({ color: col });      // 낮음: 그림만
      m.normalMap = undefined; m.roughnessMap = undefined;
    } else {
      m = new T.MeshStandardMaterial({ color: col, roughness: p[2], metalness: p[3] || 0 });
      if (!wantNormal) m.normalMap = undefined;
      if (!wantRough) m.roughnessMap = undefined;
      if (key === 'metal') m.envMapIntensity = 1.35;
    }
    if (DOUBLE[key]) m.side = T.DoubleSide;
    m.vertexColors = !!vcol;    // 공룡·자연물은 꼭짓점 색으로 재질 위에 색을 더한다
    if (vcol) m.flatShading = false;
    if (p[0]) { const s = need(p[0]); if (s) apply(m, p[0], s); else (waiting[p[0]] = waiting[p[0]] || []).push(m); }
    return m;
  }

  // ---------- 땅 ----------
  let groundTex = null, groundNormal = null, groundRough = null, groundDone = false;
  const groundWait = [];
  function makeGround() {
    const S = SIZE, c = canvas(S), ctx = c.getContext('2d');
    // 모래·흙·풀·자갈을 노이즈로 섞은 회색 디테일 (땅 색은 꼭짓점 색이 정한다)
    noiseFill(ctx, S, (u, v) => {
      const n1 = fbm(u * 5, v * 5, 4, 201), n2 = fbm(u * 14, v * 14, 3, 211), n3 = fbm(u * 34, v * 34, 2, 221);
      const grass = Math.max(0, (n2 - .42) * 3.4), grav = Math.max(0, (n3 - .62) * 4.0);
      const sand = Math.max(0, 1 - Math.abs(n1 - .28) * 5) * .9;
      const dirt = Math.max(.06, 1 - sand - grass - grav);
      const tot = sand + dirt + grass + grav + 1e-5;
      const k = 0.78 + (n1 * .16 + n2 * .1) / tot;      // 밝기만 조금 흔든다
      const g = (k * 255);
      return [g * (0.96 + (1 - grass) * .04), g, g * (0.94 + grav * .06)];
    });
    for (let i = 0; i < 900; i++) {
      const x = hash2(i, 3, 151) * S, y = hash2(i, 4, 152) * S, h = S * .02 + hash2(i, 5, 153) * S * .04;
      ctx.strokeStyle = 'rgba(190,200,160,' + (0.10 + hash2(i, 6, 154) * 0.16) + ')';
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (hash2(i, 7, 155) - .5) * 3, y - h); ctx.stroke();
    }
    const gn = wantNormal ? normalFrom(c, 1.8) : null;
    const gr = wantRough ? roughFrom(c, .93) : null;
    brighten(c, .95, .3);
    groundTex = tex(c, true);
    groundTex.repeat.set(64, 64);
    if (gn) { groundNormal = tex(gn, false); groundNormal.repeat.set(64, 64); }
    if (gr) { groundRough = tex(gr, false); groundRough.repeat.set(64, 64); }
    groundDone = true;
    for (const m of groundWait) {
      m.map = groundTex; if (m.normalMap !== undefined) m.normalMap = groundNormal;
      if (m.roughnessMap !== undefined) m.roughnessMap = groundRough;
      m.needsUpdate = true;
    }
  }
  function terrainMaterial() {
    const m = wantNormal
      ? new T.MeshStandardMaterial({ color: 0xffffff, roughness: .95, metalness: 0, vertexColors: true })
      : new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    m.normalMap = undefined; if (wantRough) m.roughnessMap = undefined;
    if (groundDone) { m.map = groundTex; if (m.normalMap !== undefined) m.normalMap = groundNormal; if (m.roughnessMap !== undefined) m.roughnessMap = groundRough; }
    else groundWait.push(m);
    return m;
  }

  // ---------- 밖으로 ----------
  window.TEXTURES = {
    init(level) {
      LEVEL = level === 'mid' || level === 'low' ? level : 'high';
      SIZE = SIZE_OF[LEVEL];
      wantNormal = LEVEL !== 'low';
      wantRough = LEVEL === 'high';
      aniso = LEVEL === 'high' ? 8 : 4;
    },
    level() { return LEVEL; },
    // 구조물용: 재질 이름 그대로 (면마다 평평한 shading 으로 목재·석재 결을 살린다)
    material(key) {
      if (!mats[key]) { mats[key] = makeMaterial(key, false); if (mats[key].flatShading !== undefined) mats[key].flatShading = true; }
      return mats[key];
    },
    // 공룡·자연물용: 흰 바탕 + 꼭짓점 색 (한 재질로 여러 색을 낸다)
    familyMaterial(key) { return fams[key] || (fams[key] = makeMaterial(key, true)); },
    profile(key) { return PROFILE[key] || PROFILE.stone; },
    uv(key) { return (PROFILE[key] || PROFILE.stone)[4]; },
    terrainMaterial,
    // 한 프레임에 한 장씩: 큐에 남은 그림을 만든다
    pump() {
      if (!queue.length && !groundDone) { makeGround(); return 1; }
      if (!queue.length) return 0;
      makeSurface(queue.shift());
      return 1;
    },
    pending() { return queue.length + (groundDone ? 0 : 1); },
    stats() { return { level: LEVEL, size: SIZE, surfaces: built, ms: Math.round(performance.now() - started) }; }
  };
})();
