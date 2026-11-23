// 원시섬 0.2: 배그식 3인칭 섬 생존. 모형은 models.js, 3D 그리기는 three.js.
(function(){
'use strict';
const $ = id => document.getElementById(id);
const M = window.MODELS, T = THREE;
const MOBILE = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if (MOBILE) document.body.classList.add('mobile');
// 그래픽 품질 (높음·보통·낮음): 휴대폰은 보통부터
const QL = (function(){ try { return localStorage.getItem('primal_q'); } catch (e) { return null; } })() || (MOBILE ? 'mid' : 'high');
const Q = { high: { pr: 1.75, sh: 2048, grass: 14000, gr: 38, fog: 240, land: 260, sea: 120 }, mid: { pr: 1.25, sh: 1024, grass: 5000, gr: 26, fog: 170, land: 170, sea: 50 }, low: { pr: 1, sh: 0, grass: 1800, gr: 18, fog: 140, land: 120, sea: 30 } }[QL] || null;

// ---------- 지형 ----------
function hash(x, z){ let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, z){
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z){ let s = 0, a = 1, f = 1; for (let i = 0; i < 4; i++){ s += a * vnoise(x * f, z * f); a *= .5; f *= 2; } return s / 1.875; }
const R = 190;  // 섬 반지름
function rawHeight(x, z){
  const d = Math.sqrt(x * x + z * z) / R, isl = 1 - d * d;
  const hills = fbm(x * .016 + 7, z * .016 + 3);
  const peak = Math.max(0, 1 - Math.hypot(x - 80, z + 70) / 60) ** 2 * 30;      // 북동쪽 바위산
  const ridge = Math.max(0, 1 - Math.hypot(x + 90, z + 20) / 45) ** 2 * 14;      // 서쪽 언덕
  return isl * 10 + (hills - .45) * 16 * Math.max(0, isl) + peak + ridge - 1.6;
}
// 시작 캠프 (울타리 30m × 50m) 자리는 평평하게
const CAMP = { x: 10, z: 40, w: 30, d: 50 };
CAMP.h = Math.max(3, rawHeight(CAMP.x, CAMP.z));
function campMask(x, z){
  const dx = Math.max(0, Math.abs(x - CAMP.x) - CAMP.w / 2 - 2), dz = Math.max(0, Math.abs(z - CAMP.z) - CAMP.d / 2 - 2);
  const d = Math.hypot(dx, dz); const k = Math.max(0, 1 - d / 14); return k * k * (3 - 2 * k);
}
function heightAt(x, z){ const h = rawHeight(x, z), m = campMask(x, z); return h + (CAMP.h - h) * m; }

// ---------- 장면 ----------
const renderer = new T.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = Q.sh > 0; renderer.shadowMap.type = QL === 'high' ? T.PCFSoftShadowMap : T.PCFShadowMap;
document.body.prepend(renderer.domElement);
const scene = new T.Scene();
scene.fog = new T.Fog(0xb8c8c0, 50, Q.fog);
const camera = new T.PerspectiveCamera(60, innerWidth / innerHeight, .1, 900);
const hemi = new T.HemisphereLight(0xdfeaf2, 0x5a5636, .75); scene.add(hemi);
const sun = new T.DirectionalLight(0xfff0d8, 1.6); sun.castShadow = true;
const SH = Q.sh || 512; sun.shadow.mapSize.set(SH, SH);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
scene.add(sun, sun.target);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const TIME = { value: 0 };

// 하늘 (위·지평선 색이 시간에 따라 바뀌고 해가 보인다)
const skyU = { top: { value: new T.Color(0x5d8fc0) }, hor: { value: new T.Color(0xcfe0e0) }, sunDir: { value: new T.Vector3(0, 1, 0) }, sunCol: { value: new T.Color(0xfff2c8) } };
scene.add(new T.Mesh(new T.SphereGeometry(800, 32, 16), new T.ShaderMaterial({
  side: T.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top,hor,sunDir,sunCol; varying vec3 vD; void main(){ float h = max(vD.y,0.); vec3 c = mix(hor, top, pow(h,.55)); if(vD.y<0.) c = hor*.9; float s = max(dot(normalize(vD), sunDir),0.); c += sunCol * (pow(s,900.)*2. + pow(s,12.)*.25); gl_FragColor = vec4(c,1.); }'
})));

// 땅: 높이 + 색 + 자잘한 무늬 그림
function detailTex(){
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++){
    const n = .78 + .22 * (vnoise(x * .09, y * .09) * .55 + vnoise(x * .37, y * .37) * .3 + hash(x, y) * .15), i = (y * 256 + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = n * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(90, 90); t.colorSpace = T.SRGBColorSpace; return t;
}
(function(){
  const S = 520, N = Q.land;
  const g = new T.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = [], c = new T.Color(), sand = new T.Color(0xd6c495), grass = new T.Color(0x6d8f45), grass2 = new T.Color(0x8a9a4e), dirt = new T.Color(0x8a6e4c), rock = new T.Color(0x8b877c);
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z); p.setY(i, h);
    const slope = Math.abs(heightAt(x + 1, z) - h) + Math.abs(heightAt(x, z + 1) - h);
    c.copy(grass).lerp(grass2, fbm(x * .05, z * .05));
    if (h < 1.0) c.copy(sand).lerp(grass, Math.max(0, (h - .4) / .6));
    if (slope > 1.1 || h > 18) c.lerp(rock, Math.min(1, Math.max(slope - 1.1, (h - 18) / 4) * .9 + .1));
    const cm = campMask(x, z); if (cm > .6) c.lerp(dirt, (cm - .6) * 1.6 * (.55 + .45 * fbm(x * .3, z * .3)));
    c.offsetHSL(0, 0, (hash(x * .3, z * .3) - .5) * .04);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const ground = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, map: detailTex() })); ground.receiveShadow = true; scene.add(ground);
})();

// 물: 잔물결
const water = (function(){
  const g = new T.PlaneGeometry(1400, 1400, Q.sea, Q.sea); g.rotateX(-Math.PI / 2);
  const m = new T.MeshPhongMaterial({ color: 0x3f7f8c, transparent: true, opacity: .86, shininess: 80, specular: 0x8ab4c0 });
  m.onBeforeCompile = sh => { sh.uniforms.uT = TIME; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(position.x*.15+uT*1.3)*.12 + cos(position.z*.12+uT*1.1)*.1;'); };
  const w = new T.Mesh(g, m); w.position.y = -.25; scene.add(w); return w;
})();

// ---------- 채집할 것 ----------
const KIND = {
  pine:  { hp: 30, r: .55, give: 'wood', name: '나무', verb: '베기', big: true },
  leafy: { hp: 30, r: .55, give: 'wood', name: '나무', verb: '베기', big: true },
  rock:  { hp: 40, r: 1.1, give: 'stone', name: '바위', verb: '깨기', big: true },
  bush:  { hp: 1, r: .5, give: [['berry', 2], ['fiber', 2]], name: '열매 덤불', verb: '따기' },
  stick: { hp: 1, r: .2, give: [['wood', 1]], name: '나뭇가지', verb: '줍기' },
  pebble:{ hp: 1, r: .2, give: [['stone', 1]], name: '돌멩이', verb: '줍기' }
};
function rnd(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const NODES = [];
const _m = new T.Matrix4(), _q = new T.Quaternion(), _v = new T.Vector3(), _s = new T.Vector3(), _y = new T.Vector3(0, 1, 0);
function inCamp(x, z, pad){ return Math.abs(x - CAMP.x) < CAMP.w / 2 + (pad || 0) && Math.abs(z - CAMP.z) < CAMP.d / 2 + (pad || 0); }
(function(){
  const r = rnd(4242), want = { pine: 230, leafy: 150, rock: 110, bush: 130, stick: 110, pebble: 110 };
  for (const t in want){
    let n = 0, guard = 0;
    while (n < want[t] && guard++ < 30000){
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * .93, x = Math.cos(a) * d, z = Math.sin(a) * d, h = heightAt(x, z);
      if (h < 1 || inCamp(x, z, t === 'stick' || t === 'pebble' ? -2 : 6)) continue;
      const forest = fbm(x * .025 + 11, z * .025);
      if (t === 'pine' && (h > 20 || forest < .45)) continue;
      if (t === 'leafy' && (h > 12 || forest < .4 || forest > .62)) continue;
      if (t === 'rock' && h < 4 && r() < .6) continue;
      NODES.push({ type: t, x, z, y: h, hp: KIND[t].hp, s: .8 + r() * .55, rot: r() * 6.28, var: Math.floor(r() * 3) });
      n++;
    }
  }
  // 캠프 안에도 주울 것 조금
  const r2 = rnd(77);
  for (let i = 0; i < 14; i++){ const t = i % 2 ? 'stick' : 'pebble'; NODES.push({ type: t, x: CAMP.x + (r2() - .5) * 24, z: CAMP.z + (r2() - .5) * 36, y: CAMP.h, hp: 1, s: 1, rot: r2() * 6, var: 0 }); }
})();
const INST = {};
(function(){
  const geos = { pine: M.pineGeo(), leafy: M.leafyGeo(), rock: M.rockGeo(1.7), bush: M.bushGeo(),
    stick: M.merge([[new T.CylinderGeometry(.045, .05, 1.1, 5).rotateZ(Math.PI / 2).translate(0, .06, 0), 0x7a5636]]),
    pebble: M.merge([[M.noiseDisplace(new T.IcosahedronGeometry(.2, 0), .2, 3).translate(0, .12, 0), 0x9a978f]]) };
  for (const t in geos){
    const list = NODES.filter(n => n.type === t);
    const im = new T.InstancedMesh(geos[t], t === 'rock' || t === 'pebble' ? M.mat.vf : M.mat.v, list.length);
    im.castShadow = t !== 'stick' && t !== 'pebble'; im.receiveShadow = t === 'rock';
    scene.add(im); INST[t] = im;
    const c = new T.Color();
    list.forEach((n, i) => { n.idx = i; setNode(n, true); c.setHSL(0, 0, .85 + hash(n.x, n.z) * .3); im.setColorAt(i, c); });
  }
})();
function setNode(n, show){
  _q.setFromAxisAngle(_y, n.rot); _s.setScalar(show ? n.s : 0); if (show && n.type === 'rock') _s.set(n.s * (1 + n.var * .3), n.s, n.s * (1.2 - n.var * .15));
  _m.compose(_v.set(n.x, n.y - (n.type === 'rock' ? .2 : 0), n.z), _q, _s);
  INST[n.type].setMatrixAt(n.idx, _m); INST[n.type].instanceMatrix.needsUpdate = true;
}

// ---------- 충돌 (원·선분, 8m 칸으로 나눠 찾기) ----------
const GRID = new Map(), CELL = 8;
function cellKey(x, z){ return (Math.floor(x / CELL) & 0xffff) * 65536 + (Math.floor(z / CELL) & 0xffff); }
function addCol(c){
  const x0 = Math.min(c.ax, c.bx) - c.r, x1 = Math.max(c.ax, c.bx) + c.r, z0 = Math.min(c.az, c.bz) - c.r, z1 = Math.max(c.az, c.bz) + c.r;
  for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++){
    const k = (x & 0xffff) * 65536 + (z & 0xffff); if (!GRID.has(k)) GRID.set(k, []); GRID.get(k).push(c);
  }
  return c;
}
function circleCol(x, z, r, owner){ return addCol({ ax: x, az: z, bx: x, bz: z, r, owner }); }
function segCol(ax, az, bx, bz, r, owner){ return addCol({ ax, az, bx, bz, r, owner }); }
NODES.forEach(n => { if (KIND[n.type].big) n.col = circleCol(n.x, n.z, KIND[n.type].r * n.s, n); });
function collide(x, z, rad){
  for (let pass = 0; pass < 2; pass++){
    const list = GRID.get(cellKey(x, z)); if (!list) break;
    // 주변 칸도
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++){
      const l = GRID.get(cellKey(x + dx * CELL, z + dz * CELL)); if (!l) continue;
      for (const c of l){
        if (seen.has(c) || c.off || (c.owner && c.owner.dead)) continue; seen.add(c);
        const vx = c.bx - c.ax, vz = c.bz - c.az, L2 = vx * vx + vz * vz;
        let t = L2 ? ((x - c.ax) * vx + (z - c.az) * vz) / L2 : 0; t = Math.max(0, Math.min(1, t));
        const px = c.ax + vx * t, pz = c.az + vz * t, ex = x - px, ez = z - pz, d = Math.hypot(ex, ez), rr = c.r + rad;
        if (d < rr){ if (d < 1e-4){ x += rr; } else { x = px + ex / d * rr; z = pz + ez / d * rr; } }
      }
    }
  }
  return [x, z];
}

// ---------- 건물 (캠프 + 직접 짓기) ----------
const BUILD = {
  fence: { name: '울타리', e: '🪵', need: { wood: 4 }, desc: '4m 울타리 한 칸. 공룡이 못 넘어와요.', geo: () => M.fenceGeo(4) },
  cabin: { name: '오두막', e: '🛖', need: { wood: 30, stone: 10, fiber: 10 }, desc: '통나무 오두막. 쓰러지면 여기서 깨어나고, 안에서는 체력이 빨리 차요.', geo: () => M.cabinGeo(6, 5) },
  kiln:  { name: '가마', e: '🏺', need: { stone: 15, wood: 5 }, desc: '곁에서 ✋: 고기를 한 번에 세 개씩 구워요.', geo: () => M.kilnGeo() },
  rack:  { name: '건조대', e: '🦴', need: { wood: 6, fiber: 4 }, desc: '곁에서 ✋: 생고기를 육포로 말려요 (배고픔 +25, 날고기 탈 없음).', geo: () => M.rackGeo() },
  fire:  { name: '모닥불', e: '🏕️', need: { wood: 5, stone: 3 }, desc: '곁에서 ✋: 고기 굽기. 곁에 있으면 체력이 천천히 차요.', geo: () => M.fireGeo() },
  tent:  { name: '천막', e: '⛺', need: { wood: 8, hide: 3, fiber: 4 }, desc: '쓰러지면 여기서 깨어나요.', geo: () => M.tentGeo() },
  well:  { name: '우물', e: '🪣', need: { stone: 20, wood: 6 }, desc: '곁에서 ✋: 물 마시기 (기력이 다 차고 체력 +5).', geo: () => M.kilnGeo() },
  tower: { name: '망루', e: '🗼', need: { wood: 24, fiber: 8 }, desc: '높은 곳에서 멀리 봐요. 꼭대기에 서 있으면 공룡이 못 올라와요.', geo: () => M.fenceGeo(3) }
};
const buildMat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
const GEO_CACHE = {};
// 사용자 STL 모형이 있으면 그것을 쓴다 (울타리 4.4m · 움막 7m×5.8m · 가마)
const ASSET_OF = { fence: 'fence', cabin: 'shelter', kiln: 'kiln', tower: 'tower', well: 'well', fire: 'firering', tent: 'tent' };
function assetFor(s){ const a = ASSET_OF[s.type] && M.assetGeo(ASSET_OF[s.type]); if (!a) return null;
  if (s.type === 'fence') return { g: a, sc: [(s.len || 4) / 4.4, 1, 1] };
  if (s.type === 'cabin'){ const sx = (s.w || 6) / 7.04, sz = (s.d || 5) / 5.8; return { g: a, sc: [sx, Math.min(sx, sz) * 1.02, sz] }; }
  return { g: a, sc: [1, 1, 1] }; }
function bgeo(s){ const A = assetFor(s); if (A) return A.g; const k = s.type + (s.w || '') + 'x' + (s.d || '') + (s.len || ''); if (!GEO_CACHE[k]) GEO_CACHE[k] = s.type === 'cabin' && s.w ? M.cabinGeo(s.w, s.d) : s.type === 'fence' && s.len ? M.fenceGeo(s.len) : s.type === 'field' ? M.fieldGeo(s.w, s.d) : s.type === 'seat' ? M.seatGeo() : BUILD[s.type].geo(); return GEO_CACHE[k]; }
const STRUCTS = [], TOWER_H = 3.85;   // {type,x,z,rot,...,mesh,cols,fixed}
function rotP(s, lx, lz){ const c = Math.cos(s.rot || 0), n = Math.sin(s.rot || 0); return [s.x + lx * c + lz * n, s.z - lx * n + lz * c]; }
function placeStruct(s){
  const g = new T.Group(); s.y = heightAt(s.x, s.z);
  const mesh = new T.Mesh(bgeo(s), buildMat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  const A = assetFor(s); if (A) mesh.scale.set(A.sc[0], A.sc[1], A.sc[2]);
  if (s.type === 'fire'){
    const f = new T.Mesh(new T.ConeGeometry(.32, .9, 7), new T.MeshBasicMaterial({ color: 0xffa035 })); f.position.y = .5; g.add(f); g.userData.flame = f;
    const l = new T.PointLight(0xff9a3d, 1.6, 18, 1.6); l.position.y = 1.3; g.add(l);
  }
  if (s.type === 'kiln'){ const f = new T.PointLight(0xff7a2a, .8, 6, 2); f.position.set(0, 1, 0); g.add(f); }
  g.position.set(s.x, s.y, s.z); g.rotation.y = s.rot || 0; scene.add(g); s.mesh = g;
  // 부딪힘
  const C = s.cols = [];
  const seg = (ax, az, bx, bz, r) => { const a = rotP(s, ax, az), b = rotP(s, bx, bz); C.push(segCol(a[0], a[1], b[0], b[1], r)); };
  if (s.type === 'fence'){ const L = (s.len || 4) / 2; seg(-L, 0, L, 0, .22); }
  if (s.type === 'cabin'){ const w = (s.w || 6) / 2, d = (s.d || 5) / 2; seg(-w, -d, w, -d, .3); seg(-w, -d, -w, d, .3); seg(w, -d, w, d, .3); seg(-w, d, -.8, d, .3); seg(.8, d, w, d, .3); }
  if (s.type === 'kiln') C.push(circleCol(s.x, s.z, M.assetGeo('kiln') ? 1.85 : 1.35));
  if (s.type === 'tent') C.push(circleCol(s.x, s.z, 1.4));
  if (s.type === 'well') C.push(circleCol(s.x, s.z, 1.5));
  if (s.type === 'tower'){ [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(([a, b]) => { const q = rotP(s, a, b); C.push(circleCol(q[0], q[1], .25)); }); }
  if (s.type === 'rack') seg(-1.1, 0, 1.1, 0, .25);
  if (s.type === 'fire') C.push(circleCol(s.x, s.z, .55));
  STRUCTS.push(s); return s;
}
// 시작 캠프 (버려진 캠프): 울타리 30m × 50m, 앞쪽에 5m 문
(function(){
  const X = CAMP.x, Z = CAMP.z, W = CAMP.w / 2, D = CAMP.d / 2, add = o => placeStruct(Object.assign({ fixed: true }, o));
  for (let x = -W; x < W - .1; x += 5) add({ type: 'fence', len: 5, x: X + x + 2.5, z: Z - D, rot: 0 });            // 뒤
  for (let z = -D; z < D - .1; z += 5){ add({ type: 'fence', len: 5, x: X - W, z: Z + z + 2.5, rot: Math.PI / 2 }); add({ type: 'fence', len: 5, x: X + W, z: Z + z + 2.5, rot: Math.PI / 2 }); }
  for (let x = -W; x < W - .1; x += 5){ if (Math.abs(x + 2.5) < 3) continue; add({ type: 'fence', len: 5, x: X + x + 2.5, z: Z + D, rot: 0 }); }  // 앞 (가운데 문)
  add({ type: 'cabin', w: 12, d: 8, x: X - 2, z: Z - D + 8, rot: 0 });
  add({ type: 'kiln', x: X + 9, z: Z - D + 7, rot: -.4 });
  add({ type: 'fire', x: X, z: Z + 2, rot: 0 });
  [[-3, 2], [3, 2.4], [0, 5]].forEach(([dx, dz], i) => add({ type: 'seat', x: X + dx, z: Z + dz, rot: i * 1.1 }));
  [[-9, 6], [-9, 11]].forEach(([dx, dz]) => add({ type: 'tent', x: X + dx, z: Z + dz, rot: .3 }));
  add({ type: 'well', x: X + 5, z: Z - 4, rot: 0 });
  add({ type: 'tower', x: X + W - 3, z: Z + D - 3, rot: 0 }); add({ type: 'tower', x: X - W + 3, z: Z - D + 3, rot: 0 });
  [[9, 4], [9, 8], [9, 12]].forEach(([dx, dz]) => add({ type: 'rack', x: X + dx, z: Z + dz, rot: Math.PI / 2 }));
  add({ type: 'field', w: 12, d: 9, x: X - 1, z: Z + 15, rot: 0 });
})();

// ---------- 풀 (내 주변에만, 바람에 흔들림) ----------
const GRASS_N = Q.grass, GRASS_R = Q.gr;
const grass = new T.InstancedMesh(M.grassBlade(), (function(){
  const m = new T.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = sh => { sh.uniforms.uT = TIME; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp = instanceMatrix * vec4(0.,0.,0.,1.);\nfloat sw = sin(uT*1.8 + wp.x*.35 + wp.z*.27) * .18 + sin(uT*3.1 + wp.x*.9) * .05;\ntransformed.x += sw * position.y; transformed.z += sw * .6 * position.y;'); };
  return m;
})(), GRASS_N);
grass.frustumCulled = false; scene.add(grass);
let grassAt = { x: 1e9, z: 1e9 };
function placeGrass(cx, cz){
  const r = rnd(Math.floor(cx / 6) * 7919 + Math.floor(cz / 6) * 104729 + 13);
  let n = 0;
  for (let i = 0; i < GRASS_N * 3 && n < GRASS_N; i++){
    const a = r() * 6.283, d = Math.sqrt(r()) * GRASS_R, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, h = heightAt(x, z);
    if (h < .9 || h > 17 || (inCamp(x, z, -1) && campMask(x, z) > .9 && hash(x, z) < .8)) continue;
    if (fbm(x * .08, z * .08) < .38) continue;
    _q.setFromAxisAngle(_y, r() * 6.28); _s.setScalar(.7 + r() * .7);
    _m.compose(_v.set(x, h - .03, z), _q, _s); grass.setMatrixAt(n++, _m);
  }
  grass.count = n; grass.instanceMatrix.needsUpdate = true; grassAt = { x: cx, z: cz };
}

// ---------- 공룡 ----------
const DINO = {
  grazer:   { name: '풀뜯개', hp: 30, speed: 2.6, run: 7.6, mood: 'shy', dmg: 0, reach: 1.2, rad: .6, drop: [['meat', 2], ['hide', 1]], n: 26, scale: 1 },
  claw:     { name: '발톱이', hp: 45, speed: 3.2, run: 8.4, mood: 'angry', dmg: 9, reach: 1.6, rad: .55, drop: [['meat', 2], ['hide', 2], ['tooth', 1]], n: 11, scale: 1 },
  longneck: { name: '목긴이', hp: 260, speed: 1.6, run: 3.8, mood: 'calm', dmg: 24, reach: 4.2, rad: 2.4, drop: [['meat', 10], ['hide', 6]], n: 6, scale: .85 },
  rex:      { name: '큰이빨', hp: 320, speed: 2.4, run: 7.8, mood: 'angry', dmg: 30, reach: 2.6, rad: 1.6, drop: [['meat', 12], ['hide', 6], ['tooth', 3]], n: 3, scale: 1, sense: 1.6 },
  plate:    { name: '판등이', hp: 160, speed: 1.6, run: 4.2, mood: 'guard', dmg: 20, reach: 2.4, rad: 1.3, drop: [['meat', 7], ['hide', 4], ['plate', 1]], n: 7, scale: 1 },
  horn:     { name: '뿔방패', hp: 140, speed: 1.9, run: 6.6, mood: 'guard', dmg: 18, reach: 3.0, rad: 1.4, drop: [['meat', 6], ['hide', 4], ['horn', 1]], n: 8, scale: 1 }
};
const DINOS = [];
function spawnDino(kind, x, z){
  const m = M.makeDino(kind); m.scale.setScalar(DINO[kind].scale); scene.add(m);
  const d = { kind, m, x, z, ry: Math.random() * 6.28, hp: DINO[kind].hp, state: 'wander', t: 0, cd: 0, hurt: 0, phase: Math.random() * 9 };
  DINOS.push(d); return d;
}
(function(){
  const r = rnd(99);
  for (const k in DINO) for (let i = 0; i < DINO[k].n; i++){
    let x, z, g = 0;
    do { const a = r() * 6.28, dd = 40 + Math.sqrt(r()) * (R * .85 - 40); x = Math.cos(a) * dd; z = Math.sin(a) * dd; } while ((heightAt(x, z) < 1.5 || inCamp(x, z, 20)) && g++ < 80);
    spawnDino(k, x, z);
  }
})();

// ---------- 아이템·만들기 ----------
const ITEM = {
  wood: ['🪵', '나무'], stone: ['🪨', '돌'], fiber: ['🌿', '풀줄기'], berry: ['🍒', '열매'], meat: ['🥩', '생고기'], cooked: ['🍖', '구운 고기'], jerky: ['🥓', '육포'],
  hide: ['🟫', '가죽'], tooth: ['🦷', '이빨'], horn: ['🦏', '뿔'], plate: ['🛡️', '등판'], axe: ['🪓', '돌도끼'], spear: ['🔱', '돌창'], torch: ['🔥', '횃불'], bandage: ['🩹', '붕대']
};
const FOOD = { cooked: 35, jerky: 25, berry: 10, meat: 12 };
const RECIPES = [
  { out: 'axe', need: { wood: 3, stone: 2 }, desc: '나무·바위를 빨리 캐요. 들고 치면 공격도 세져요.' },
  { out: 'spear', need: { wood: 3, stone: 2, fiber: 2 }, desc: '멀리서 세게 찔러요. 사냥용.' },
  { out: 'torch', need: { wood: 2, fiber: 1 }, desc: '들고 있으면 밤에 주변이 밝아요.' },
  { out: 'bandage', need: { fiber: 4 }, desc: '쓰면 체력 30 회복.' }
];
const HOT = ['hand', 'axe', 'spear', 'torch', 'bandage'];
const DMG = { hand: 4, axe: 11, spear: 20, torch: 6, bandage: 4 };
const REACH = { hand: 2.0, axe: 2.4, spear: 3.4, torch: 2.3, bandage: 2.0 };

// ---------- 상태 ----------
const START = { x: CAMP.x, z: CAMP.z + 6 };
const S = { x: START.x, z: START.z, y: CAMP.h, vy: 0, ry: Math.PI, hp: 100, food: 100, sta: 100, inv: {}, equip: 'hand', day: 1, time: .3, placed: [], spawn: null, savedAt: 0, name: '' };
const player = M.makeHuman(0x456b8f, 0x3a2a1e); scene.add(player);
const torchLight = new T.PointLight(0xffa64d, 0, 15, 1.6); scene.add(torchLight);
function has(need){ for (const k in need) if ((S.inv[k] || 0) < need[k]) return false; return true; }
function add(k, n){ S.inv[k] = (S.inv[k] || 0) + n; if (S.inv[k] <= 0) delete S.inv[k]; }
function toast(t){ const d = document.createElement('div'); d.textContent = t; $('toast').appendChild(d); setTimeout(() => d.remove(), 2600); while ($('toast').children.length > 4) $('toast').firstChild.remove(); }
function near(type, dist){ return STRUCTS.find(s => s.type === type && Math.hypot(s.x - S.x, s.z - S.z) < dist); }

// ---------- 입력 ----------
const key = {};
let yaw = Math.PI, pitch = -.16, locked = false, swing = 0, swingCd = 0, running = false, aiming = false, playing = false, dead = false;
const input = { mx: 0, mz: 0 };
addEventListener('keydown', e => {
  if (!playing) return; key[e.code] = true;
  if (e.code === 'Tab'){ e.preventDefault(); toggleBag(); }
  if (e.code === 'KeyE') BM.on ? BM.confirm() : useAction();
  if (e.code === 'KeyR' && BM.on) BM.rotate();
  if (e.code === 'Escape' && BM.on) BM.cancel();
  if (/^Digit[1-5]$/.test(e.code)) pick(HOT[+e.code.slice(5) - 1]);
});
addEventListener('keyup', e => { key[e.code] = false; });
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('mousedown', e => {
  if (!playing || MOBILE) return;
  if (!locked){ renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock(); return; }
  if (e.button === 2){ aiming = true; return; }
  if (e.button === 0){ if (BM.on) BM.confirm(); else attack(); }
});
addEventListener('mouseup', e => { if (e.button === 2) aiming = false; });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; });
addEventListener('mousemove', e => { if (!locked) return; const k = aiming ? .55 : 1; yaw -= e.movementX * .0026 * k; pitch = Math.max(-1.1, Math.min(.55, pitch - e.movementY * .0022 * k)); });
const touches = {};
renderer.domElement.addEventListener('touchstart', e => {
  for (const t of e.changedTouches){
    if (t.clientX < innerWidth * .45 && !Object.values(touches).some(v => v.kind === 'stick')){
      touches[t.identifier] = { kind: 'stick', x0: t.clientX, y0: t.clientY };
      const st = $('stick'); st.style.display = 'block'; st.style.left = (t.clientX - 60) + 'px'; st.style.top = (t.clientY - 60) + 'px'; $('lefttip').style.display = 'none';
    } else touches[t.identifier] = { kind: 'look', x: t.clientX, y: t.clientY };
  }
  e.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('touchmove', e => {
  for (const t of e.changedTouches){
    const o = touches[t.identifier]; if (!o) continue;
    if (o.kind === 'stick'){
      let dx = t.clientX - o.x0, dy = t.clientY - o.y0; const L = Math.hypot(dx, dy), Mx = 50;
      if (L > Mx){ dx *= Mx / L; dy *= Mx / L; }
      $('knob').style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; input.mx = dx / Mx; input.mz = dy / Mx;
    } else { const k = aiming ? .5 : 1; yaw -= (t.clientX - o.x) * .006 * k; pitch = Math.max(-1.1, Math.min(.55, pitch - (t.clientY - o.y) * .005 * k)); o.x = t.clientX; o.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
function endTouch(e){ for (const t of e.changedTouches){ const o = touches[t.identifier]; if (!o) continue; if (o.kind === 'stick'){ input.mx = input.mz = 0; $('stick').style.display = 'none'; $('knob').style.transform = ''; } delete touches[t.identifier]; } }
renderer.domElement.addEventListener('touchend', endTouch); renderer.domElement.addEventListener('touchcancel', endTouch);
function tap(id, fn){ const el = $(id); if (!el) return; el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false }); el.addEventListener('click', fn); }
let jumpQ = false;
tap('tJump', () => { jumpQ = true; });
tap('tAtk', () => BM.on ? BM.confirm() : attack());
tap('tUse', () => BM.on ? BM.rotate() : useAction());
tap('tRun', () => { running = !running; $('tRun').classList.toggle('on', running); });
tap('tAim', () => { aiming = !aiming; $('tAim').classList.toggle('on', aiming); });
tap('bmOk', () => BM.confirm()); tap('bmRot', () => BM.rotate()); tap('bmNo', () => BM.cancel());

// ---------- 행동 ----------
function forward(){ return { x: Math.sin(S.ry), z: Math.cos(S.ry) }; }
function nearestNode(maxD, filter){ let best = null, bd = maxD; for (const n of NODES){ if (n.dead || (filter && !filter(n))) continue; const dx = n.x - S.x, dz = n.z - S.z; if (Math.abs(dx) > maxD + 3 || Math.abs(dz) > maxD + 3) continue; const d = Math.hypot(dx, dz) - KIND[n.type].r * n.s; if (d < bd){ bd = d; best = n; } } return best; }
function nearestDino(maxD){
  let best = null, bd = maxD; const f = forward();
  for (const d of DINOS){ if (d.dead) continue; const dx = d.x - S.x, dz = d.z - S.z, dist = Math.hypot(dx, dz) - DINO[d.kind].rad; if (dist < bd && (dx * f.x + dz * f.z) > -.3){ bd = dist; best = d; } }
  return best;
}
function attack(){
  if (!playing || swingCd > 0 || dead) return;
  if (S.equip === 'bandage'){ useBandage(); return; }
  if (S.sta < 5){ toast('기력이 없어요. 잠깐 쉬세요'); return; }
  swing = .001; swingCd = .55; S.sta -= 6;
  if (aiming) S.ry = yaw + Math.PI;   // 조준 중이면 화면 방향으로 친다
  setTimeout(() => {
    const reach = REACH[S.equip], d = nearestDino(reach);
    if (d){ hitDino(d, DMG[S.equip]); return; }
    const n = nearestNode(reach, n => KIND[n.type].big);
    if (n){ n.hp -= S.equip === 'axe' ? 12 : 4; add(KIND[n.type].give, 1); n.shake = .25; if (n.hp <= 0) killNode(n, true); }
  }, 160);
}
function killNode(n, give){
  if (give && !KIND[n.type].big) KIND[n.type].give.forEach(([k, c]) => add(k, c));
  if (give && KIND[n.type].big) add(KIND[n.type].give, 2);
  n.dead = true; n.until = performance.now() + 180000; setNode(n, false);
  if (KIND[n.type].big) toast(KIND[n.type].name + '을(를) 다 캤어요');
}
function useAction(){
  if (!playing || dead) return;
  const kiln = near('kiln', 3.2), fire = near('fire', 3), rack = near('rack', 2.8), well = near('well', 3);
  const tw = S.climb || near('tower', 2.8);
  if (tw){ if (S.climb){ S.climb = null; S.x = tw.x + 2.4; S.z = tw.z; toast('🪜 내려왔어요'); } else { S.climb = tw; S.x = tw.x; S.z = tw.z; S.y = tw.y + TOWER_H; toast('🗼 망루에 올라왔어요. 공룡이 못 올라와요'); } return; }
  if (well && (S.sta < 95 || S.hp < 100)){ S.sta = 100; S.hp = Math.min(100, S.hp + 5); toast('💧 시원한 물을 마셨어요 (기력 가득, 체력 +5)'); return; }
  if (kiln && S.inv.meat){ const n = Math.min(3, S.inv.meat); add('meat', -n); add('cooked', n); toast('🏺 가마에서 고기 ' + n + '개를 구웠어요'); return; }
  if (fire && S.inv.meat){ add('meat', -1); add('cooked', 1); toast('🍖 고기를 구웠어요'); return; }
  if (rack && S.inv.meat){ add('meat', -1); add('jerky', 1); toast('🥓 육포를 만들었어요'); return; }
  const n = nearestNode(1.8, n => !KIND[n.type].big);
  if (n){ killNode(n, true); KIND[n.type].give.forEach(([k, c]) => toast('+' + c + ' ' + ITEM[k][1])); return; }
  if (S.equip === 'bandage'){ useBandage(); return; }
  if (S.food < 95){ const k = ['cooked', 'jerky', 'berry'].find(k => S.inv[k]); if (k){ eat(k); return; } }
}
function eat(k){
  if (!S.inv[k]) return; add(k, -1); S.food = Math.min(100, S.food + FOOD[k]);
  if (k === 'meat' && Math.random() < .35){ S.hp -= 8; toast('🤢 날고기라 배가 아파요'); } else toast('냠! 배고픔 +' + FOOD[k]);
  if ($('bag').classList.contains('on')) renderBag();
}
function useBandage(){ if (!S.inv.bandage) return; add('bandage', -1); S.hp = Math.min(100, S.hp + 30); toast('🩹 체력 +30'); if (!S.inv.bandage) pick('hand'); renderHot(); }
function pick(k){
  if (k !== 'hand' && !S.inv[k]){ toast(ITEM[k][1] + '이(가) 없어요. 가방에서 만들어요'); return; }
  S.equip = k; M.setTool(player, k); renderHot();
  $('tAtk').innerHTML = (k === 'hand' ? '✊' : ITEM[k][0]) + '<small>' + (k === 'bandage' ? '쓰기' : '치기') + '</small>';
}
function hitDino(d, dmg){
  const D = DINO[d.kind]; d.hp -= dmg; d.hurt = .3;
  if (D.mood === 'shy'){ d.state = 'flee'; d.t = 6; } else { d.state = 'chase'; d.t = D.mood === 'angry' ? 12 : 7; }
  if (d.hp <= 0){
    d.dead = true; d.respawn = performance.now() + 150000; d.m.rotation.z = Math.PI / 2;
    D.drop.forEach(([k, c]) => add(k, c)); toast(D.name + ' 사냥 성공! ' + D.drop.map(([k, c]) => ITEM[k][0] + c).join(' '));
    setTimeout(() => { d.m.visible = false; }, 5000);
  }
}

// ---------- 짓기 ----------
const BM = {
  on: false, type: null, rot: 0, ghost: null, ok: false,
  start(type){
    if (!has(BUILD[type].need)){ toast('재료가 모자라요'); return; }
    this.on = true; this.type = type; this.rot = S.ry;
    const g = new T.Mesh(bgeo({ type, len: 4, w: 6, d: 5 }), new T.MeshLambertMaterial({ color: 0x7bd88f, transparent: true, opacity: .55, depthWrite: false }));
    const A0 = assetFor({ type, len: 4, w: 6, d: 5 }); if (A0) g.scale.set(A0.sc[0], A0.sc[1], A0.sc[2]);
    this.ghost = g; scene.add(g); document.body.classList.add('building'); toggleBag(false);
    toast(MOBILE ? '✓ 놓기 · ⟳ 돌리기 · ✕ 그만' : '클릭/E 놓기 · R 돌리기 · Esc 그만');
  },
  where(){ const f = forward(), d = this.type === 'cabin' ? 6 : this.type === 'fence' ? 3 : 2.6; return { x: S.x + f.x * d, z: S.z + f.z * d }; },
  update(){
    if (!this.on) return;
    const p = this.where(), h = heightAt(p.x, p.z); this.ghost.position.set(p.x, h, p.z); this.ghost.rotation.y = this.rot;
    const flat = Math.abs(heightAt(p.x + 1.5, p.z) - h) + Math.abs(heightAt(p.x, p.z + 1.5) - h) < (this.type === 'cabin' ? 1.2 : 2);
    const r = this.type === 'cabin' ? 4 : 1.2;
    const blocked = h < .8 || NODES.some(n => !n.dead && KIND[n.type].big && Math.hypot(n.x - p.x, n.z - p.z) < r + .6) || STRUCTS.some(s => s.type !== 'field' && s.type !== 'seat' && Math.hypot(s.x - p.x, s.z - p.z) < r + (s.type === 'cabin' ? 4 : .8) && !(this.type === 'fence' && s.type === 'fence'));
    this.ok = flat && !blocked; this.ghost.material.color.setHex(this.ok ? 0x7bd88f : 0xff6b6b);
  },
  rotate(){ this.rot += Math.PI / 4; },
  confirm(){
    if (!this.on) return; if (!this.ok){ toast('여기에는 지을 수 없어요 (나무·건물과 겹치거나 비탈)'); return; }
    const b = BUILD[this.type]; if (!has(b.need)){ toast('재료가 모자라요'); this.cancel(); return; }
    for (const k in b.need) add(k, -b.need[k]);
    const p = this.where(), s = { type: this.type, x: +p.x.toFixed(2), z: +p.z.toFixed(2), rot: +this.rot.toFixed(3) };
    if (this.type === 'cabin'){ s.w = 6; s.d = 5; } if (this.type === 'fence') s.len = 4;
    S.placed.push(s); placeStruct(Object.assign({}, s));
    if (this.type === 'tent' || this.type === 'cabin') S.spawn = { x: s.x, z: s.z };
    toast(b.e + ' ' + b.name + '을(를) 지었어요'); saveLocal();
    if (this.type === 'fence' && has(b.need)) return;   // 울타리는 이어서 놓기
    this.cancel();
  },
  cancel(){ if (this.ghost) scene.remove(this.ghost); this.ghost = null; this.on = false; document.body.classList.remove('building'); }
};

// ---------- 가방 ----------
function toggleBag(force){ const b = $('bag'); const on = force == null ? !b.classList.contains('on') : force; b.classList.toggle('on', on); if (on){ renderBag(); if (document.exitPointerLock) document.exitPointerLock(); } }
$('bagBtn').onclick = () => toggleBag(); $('bagClose').onclick = () => toggleBag(false);
let bagTab = 'make';
function renderBag(){
  const inv = Object.keys(S.inv).filter(k => S.inv[k] > 0 && ITEM[k]);
  let h = '<div class="btabs">' + [['make', '🔨 만들기'], ['build', '🏗️ 짓기'], ['eat', '🍖 먹기']].map(([k, t]) => '<button data-tab="' + k + '" class="' + (bagTab === k ? 'on' : '') + '">' + t + '</button>').join('') + '</div>';
  h += '<div class="inv">' + (inv.length ? inv.map(k => '<div class="it"><b>' + ITEM[k][0] + '</b>' + ITEM[k][1] + ' ' + S.inv[k] + '</div>').join('') : '<div class="it" style="grid-column:1/-1">아직 없어요. 나뭇가지·돌멩이부터 주워 보세요</div>') + '</div>';
  const needTxt = need => Object.keys(need).map(k => ITEM[k][1] + ' ' + need[k] + ((S.inv[k] || 0) >= need[k] ? '' : ' ✗')).join(' · ');
  if (bagTab === 'make') h += RECIPES.map((r, i) => '<div class="recipe"><span class="e">' + ITEM[r.out][0] + '</span><span class="t"><b>' + ITEM[r.out][1] + '</b><small>' + needTxt(r.need) + '<br>' + r.desc + '</small></span><button data-make="' + i + '"' + (has(r.need) ? '' : ' disabled') + '>만들기</button></div>').join('');
  if (bagTab === 'build') h += Object.keys(BUILD).map(k => { const b = BUILD[k]; return '<div class="recipe"><span class="e">' + b.e + '</span><span class="t"><b>' + b.name + '</b><small>' + needTxt(b.need) + '<br>' + b.desc + '</small></span><button data-build="' + k + '"' + (has(b.need) ? '' : ' disabled') + '>짓기</button></div>'; }).join('');
  if (bagTab === 'eat') h += ['cooked', 'jerky', 'berry', 'meat'].map(k => '<div class="recipe"><span class="e">' + ITEM[k][0] + '</span><span class="t"><b>' + ITEM[k][1] + '</b><small>배고픔 +' + FOOD[k] + (k === 'meat' ? ' · 배탈 날 수 있어요 (모닥불·가마에서 구워요)' : '') + '</small></span><button data-eat="' + k + '"' + (S.inv[k] ? '' : ' disabled') + '>먹기 (' + (S.inv[k] || 0) + ')</button></div>').join('');
  $('bagBody').innerHTML = h;
  $('bagBody').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { bagTab = b.dataset.tab; renderBag(); });
  $('bagBody').querySelectorAll('[data-eat]').forEach(b => b.onclick = () => eat(b.dataset.eat));
  $('bagBody').querySelectorAll('[data-make]').forEach(b => b.onclick = () => craft(RECIPES[+b.dataset.make]));
  $('bagBody').querySelectorAll('[data-build]').forEach(b => b.onclick = () => BM.start(b.dataset.build));
}
function craft(r){
  if (!has(r.need)) return; for (const k in r.need) add(k, -r.need[k]); add(r.out, 1);
  toast(ITEM[r.out][0] + ' ' + ITEM[r.out][1] + ' 완성!'); if (r.out !== 'bandage') pick(r.out); renderBag(); renderHot(); saveLocal();
}
function renderHot(){
  $('hotbar').innerHTML = HOT.map((k, i) => {
    const n = k === 'hand' ? '' : (S.inv[k] || 0);
    return '<button class="slot' + (S.equip === k ? ' on' : '') + '" data-k="' + k + '"' + (k !== 'hand' && !n ? ' style="opacity:.4"' : '') + '><span class="k">' + (i + 1) + '</span>' + (k === 'hand' ? '✊' : ITEM[k][0]) + '<small>' + (k === 'hand' ? '맨손' : ITEM[k][1] + (k === 'bandage' ? ' ' + n : '')) + '</small></button>';
  }).join('');
  $('hotbar').querySelectorAll('.slot').forEach(b => b.onclick = () => pick(b.dataset.k));
}
let promptText = '';
function showPrompt(){
  let t = ''; const U = MOBILE ? '✋' : 'E';
  if (BM.on) t = BUILD[BM.type].e + ' ' + BUILD[BM.type].name + (BM.ok ? ' 놓을 수 있어요' : ' — 여기는 안 돼요');
  else {
    const well = near('well', 3), kiln = near('kiln', 3.2), fire = near('fire', 3), rack = near('rack', 2.8), n = nearestNode(1.8, n => !KIND[n.type].big), big = nearestNode(REACH[S.equip], n => KIND[n.type].big);
    if (S.climb) t = U + ': 망루에서 내려가기';
    else if (near('tower', 2.8)) t = U + ': 망루에 올라가기';
    else if (well && (S.sta < 95 || S.hp < 100)) t = U + ': 우물 물 마시기';
    else if (kiln && S.inv.meat) t = U + ': 가마에서 고기 굽기 (' + S.inv.meat + ')';
    else if (fire && S.inv.meat) t = U + ': 고기 굽기 (' + S.inv.meat + ')';
    else if (rack && S.inv.meat) t = U + ': 육포 말리기 (' + S.inv.meat + ')';
    else if (n) t = U + ': ' + KIND[n.type].name + ' ' + KIND[n.type].verb;
    else if (big) t = (MOBILE ? '치기' : '클릭') + ': ' + KIND[big.type].name + ' ' + KIND[big.type].verb + (S.equip === 'axe' ? '' : ' (돌도끼가 있으면 빨라요)');
  }
  if (t !== promptText){ promptText = t; $('prompt').textContent = t; $('prompt').style.display = t ? 'block' : 'none'; }
}

// ---------- 저장 ----------
function snapshot(){ return { v: 2, savedAt: Date.now(), x: S.x, z: S.z, hp: S.hp, food: S.food, inv: S.inv, equip: S.equip, day: S.day, time: S.time, placed: S.placed, spawn: S.spawn }; }
function apply(d){
  if (!d || !(d.v === 1 || d.v === 2)) return;
  if (d.v === 1){ toast('🌴 새 섬(0.2)이 열렸어요. 가진 재료는 그대로 가져와요'); d = { v: 2, x: START.x, z: START.z, hp: d.hp, food: d.food, inv: d.inv, equip: d.equip, day: d.day, time: d.time, placed: [], spawn: null, savedAt: d.savedAt }; }
  Object.assign(S, { x: d.x, z: d.z, hp: d.hp, food: d.food, inv: d.inv || {}, day: d.day || 1, time: d.time || .3, spawn: d.spawn || null, savedAt: d.savedAt || 0 });
  for (let i = STRUCTS.length - 1; i >= 0; i--) if (!STRUCTS[i].fixed){ scene.remove(STRUCTS[i].mesh); STRUCTS[i].cols.forEach(c => c.off = true); STRUCTS.splice(i, 1); }
  S.placed = (d.placed || []).filter(p => BUILD[p.type]); S.placed.forEach(p => placeStruct(Object.assign({}, p)));
  S.y = heightAt(S.x, S.z);
  pick(d.equip && (d.equip === 'hand' || S.inv[d.equip]) ? d.equip : 'hand');
}
function saveLocal(){ try { const s = snapshot(); S.savedAt = s.savedAt; localStorage.setItem('primal_save', JSON.stringify(s)); } catch (e) {} if (NET.user) NET.saveCloud(); }
function loadLocal(){ try { return JSON.parse(localStorage.getItem('primal_save')); } catch (e) { return null; } }

// 서버(Firebase): 구글 로그인 · 저장 · 같은 섬 친구 보이기
const NET = {
  user: null, db: null, others: {}, lastSend: 0, ready: false,
  async init(){
    if (!window.FIREBASE_CONFIG) return false;
    if (this.ready) return true;
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    for (const f of ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js'])
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = base + f; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    firebase.initializeApp(window.FIREBASE_CONFIG);
    this.db = firebase.database(); this.ready = true;
    firebase.auth().onAuthStateChanged(u => this.onUser(u));
    return true;
  },
  async login(){
    if (LOCAL.on){ LOCAL.login(); return; }
    if (window.Android){ toast('안드로이드 앱 안에서는 구글 로그인이 막혀 있어요. 크롬에서 웹 버전을 열어 로그인하세요'); return; }
    try {
      if (!(await this.init())){ toast('아직 서버가 연결되지 않았어요 (이 기기에만 저장돼요)'); return; }
      const p = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithPopup(p);
    } catch (e) { toast('로그인하지 못했어요: ' + (e.code || e.message || e)); }
  },
  async onUser(u){
    this.user = u; paintNet(); paintPlayers();
    if (!u) return;
    S.name = (u.displayName || '탐험가').split(' ')[0];
    const snap = await this.db.ref('saves/' + u.uid).get();
    const cloud = snap.val(), local = snapshot(); local.savedAt = S.savedAt;
    if (cloud && cloud.savedAt > (S.savedAt || 0)){ apply(cloud); toast('☁️ 다른 기기에서 하던 곳에서 이어서 해요'); }
    else this.saveCloud();
    this.joinRoom();
  },
  saveCloud(){ if (!this.user) return; const s = snapshot(); if (this.user.local){ LOCAL.send({ t: 'save', data: s }); return; } this.db.ref('saves/' + this.user.uid).set(s).catch(() => {}); },
  joinRoom(){
    const me = this.db.ref('rooms/main/players/' + this.user.uid);
    me.onDisconnect().remove();
    const list = this.db.ref('rooms/main/players');
    list.on('child_added', s => this.upsert(s.key, s.val()));
    list.on('child_changed', s => this.upsert(s.key, s.val()));
    list.on('child_removed', s => this.remove(s.key));
  },
  remove(id){ const o = this.others[id]; if (o){ scene.remove(o.m); o.label.remove(); delete this.others[id]; } paintPlayers(); },
  upsert(id, v){
    if (!this.user || id === this.user.uid || !v) return;
    let o = this.others[id];
    if (!o){ o = this.others[id] = { m: M.makeHuman(0xb0503f, 0x2a1d14), label: document.createElement('div') }; scene.add(o.m); o.label.className = 'label'; document.body.appendChild(o.label); }
    Object.assign(o, { tx: v.x, tz: v.z, ty: v.y, try: v.r, sp: v.s, eq: v.e, name: v.n || '친구', at: Date.now() });
    if (o.curEq !== v.e){ M.setTool(o.m, v.e); o.curEq = v.e; }
    if (o.x == null){ o.x = v.x; o.z = v.z; o.y = v.y; o.r = v.r; }
    o.label.textContent = o.name; paintPlayers();
  },
  send(speed){
    if (!this.user) return; const now = performance.now(); if (now - this.lastSend < 120) return; this.lastSend = now;
    if (this.user.local){ LOCAL.send({ t: 'pos', x: +S.x.toFixed(2), z: +S.z.toFixed(2), y: +S.y.toFixed(2), r: +S.ry.toFixed(2), s: +speed.toFixed(1), e: S.equip }); return; }
    this.db.ref('rooms/main/players/' + this.user.uid).set({ x: +S.x.toFixed(2), z: +S.z.toFixed(2), y: +S.y.toFixed(2), r: +S.ry.toFixed(2), s: +speed.toFixed(1), e: S.equip, n: S.name, t: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
  }
};
// 실험용: 내 컴퓨터에서 node server.js 로 연 경우 → 그 서버에 연결 (구글 대신 이름으로 들어가기)
const LOCAL = {
  on: false, ws: null, id: null,
  async detect(){
    if (!/^https?:$/.test(location.protocol) || /github\.io$/.test(location.hostname)) return false;
    try { const r = await fetch('/server', { cache: 'no-store' }); this.on = r.ok; } catch (e) { this.on = false; }
    return this.on;
  },
  login(){
    const name = (prompt('같은 섬에서 보일 이름 (저장도 이 이름으로 돼요)', localStorage.getItem('primal_name') || '') || '').trim();
    if (!name) return;
    try { localStorage.setItem('primal_name', name); } catch (e) {}
    const ws = this.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t === 'welcome'){
        this.id = m.id; S.name = name; NET.user = { uid: 'local-' + name, displayName: name, local: true }; paintNet(); paintPlayers();
        if (m.save && m.save.savedAt > (S.savedAt || 0)){ apply(m.save); toast('💾 서버에 저장된 곳에서 이어서 해요'); } else NET.saveCloud();
        toast('🌐 서버에 들어왔어요');
      } else if (m.t === 'pos') NET.upsert(m.id, m);
      else if (m.t === 'leave') NET.remove(m.id);
    };
    ws.onclose = () => { if (NET.user && NET.user.local){ NET.user = null; for (const id in NET.others) NET.remove(id); paintNet(); toast('서버 연결이 끊겼어요'); } };
  },
  send(obj){ if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
};
function paintNet(){ $('netBtn').textContent = NET.user ? (NET.user.local ? '🌐 ' : '☁️ ') + S.name : (LOCAL.on ? '🌐 서버' : '☁️ 로그인'); $('loginBtn').textContent = NET.user ? '☁️ ' + (NET.user.displayName || '') + ' 로그인됨' : '☁️ 구글로 로그인 (저장·같이 하기)'; }
function paintPlayers(){ const n = Object.keys(NET.others).length; $('players').textContent = NET.user ? '🌐 같은 섬: ' + (n + 1) + '명' : ''; }
$('netBtn').onclick = () => { if (NET.user){ if (confirm('나갈까요? (이 기기 저장은 남아요)')){ if (NET.user.local) LOCAL.ws.close(); else firebase.auth().signOut(); } } else NET.login(); };
$('loginBtn').onclick = () => NET.login();
if (window.FIREBASE_CONFIG && !window.Android) NET.init().catch(() => {});
if (!window.FIREBASE_CONFIG) $('loginBtn').textContent = '☁️ 구글 로그인 (서버 준비 중)';
LOCAL.detect().then(on => { if (on){ $('loginBtn').textContent = '🌐 실험 서버에 들어가기 (이름으로)'; $('netBtn').textContent = '🌐 서버'; } });



// ---------- 시작·죽음 ----------
$('startBtn').onclick = () => {
  $('title').style.display = 'none'; $('hud').style.display = 'block'; playing = true;
  if (!MOBILE && renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
  if (!S.savedAt) toast('🏕️ 버려진 캠프예요. 나뭇가지·돌멩이부터 주워 보세요 (' + (MOBILE ? '✋' : 'E') + ')');
};
(function(){ const d = loadLocal(); if (d){ apply(d); $('startBtn').textContent = '이어서 하기 (' + S.day + '일차)'; } renderHot(); })();
const QN = { high: '높음', mid: '보통', low: '낮음' };
$('qBtn').textContent = '🎨 그래픽: ' + QN[QL];
$('qBtn').onclick = () => { const nx = { high: 'mid', mid: 'low', low: 'high' }[QL]; try { localStorage.setItem('primal_q', nx); } catch (e) {} location.reload(); };
if (MOBILE) $('keysHelp').innerHTML = '왼쪽 화면: 움직이기 · 오른쪽 화면 밀기: 둘러보기<br>🪓 치기 · ✋ 줍기·먹기·굽기 · 🎯 조준 · 🎒 가방에서 만들기·짓기';
function die(){ dead = true; S.climb = null; BM.cancel(); $('dead').classList.add('on'); if (document.exitPointerLock) document.exitPointerLock(); for (const k in S.inv) if (!['axe', 'spear', 'torch'].includes(k)) S.inv[k] = Math.floor(S.inv[k] / 2); }
$('reviveBtn').onclick = () => {
  dead = false; $('dead').classList.remove('on');
  const sp = S.spawn || START; S.x = sp.x + 1.5; S.z = sp.z + 1.5; S.y = heightAt(S.x, S.z); S.hp = 60; S.food = Math.max(S.food, 40); S.sta = 100;
  renderHot(); saveLocal();
};

// ---------- 매 장면 ----------
const clock = new T.Clock(); let saveT = 0, tAcc = 0, fov = 60;
const camPos = new T.Vector3(), lookAt = new T.Vector3();
const C_NIGHT = new T.Color(0x0e1830), C_DAY_TOP = new T.Color(0x5d8fc0), C_DAY_HOR = new T.Color(0xcfdcd6), C_DUSK = new T.Color(0xe39a63), C_NIGHT_HOR = new T.Color(0x1b2540);
function step(){
  const dt = Math.min(.05, clock.getDelta()); tAcc += dt; TIME.value = tAcc;
  if (playing && !dead){
    let mx = 0, mz = 0;
    if (key.KeyW) mz -= 1; if (key.KeyS) mz += 1; if (key.KeyA) mx -= 1; if (key.KeyD) mx += 1;
    mx += input.mx; mz += input.mz;
    const ml = Math.min(1, Math.hypot(mx, mz));
    const run = (key.ShiftLeft || key.ShiftRight || running) && S.sta > 1 && ml > .1 && !aiming;
    const inWater = heightAt(S.x, S.z) < -.1;
    const speed = (run ? 7.2 : aiming ? 2.6 : 4.2) * (inWater ? .55 : 1) * ml;
    if (ml > .05){
      const sy = Math.sin(yaw), cy = Math.cos(yaw), L = Math.hypot(mx, mz);
      const wx = (mx * cy + mz * sy) / L, wz = (-mx * sy + mz * cy) / L;
      const tr = aiming ? yaw + Math.PI : Math.atan2(-wx, -wz);
      let d = tr - S.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); S.ry += d * Math.min(1, dt * 12);
      let nx = S.x - wx * speed * dt, nz = S.z - wz * speed * dt;
      if (S.climb){ const ox = nx - S.climb.x, oz = nz - S.climb.z, od = Math.hypot(ox, oz); if (od > 1.25){ nx = S.climb.x + ox / od * 1.25; nz = S.climb.z + oz / od * 1.25; } }
      else [nx, nz] = collide(nx, nz, .35);
      const rr = Math.hypot(nx, nz); if (rr > R + 20){ nx *= (R + 20) / rr; nz *= (R + 20) / rr; }
      S.x = nx; S.z = nz;
    } else if (aiming){ let d = yaw + Math.PI - S.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); S.ry += d * Math.min(1, dt * 12); }
    S.sta = Math.max(0, Math.min(100, S.sta + (run ? -14 : 9) * dt));
    const ground = S.climb ? S.climb.y + TOWER_H : Math.max(heightAt(S.x, S.z), -1.1);
    if ((key.Space || jumpQ) && S.y <= ground + .01 && S.sta > 8){ S.vy = 6.5; S.sta -= 8; }
    jumpQ = false; S.vy -= 20 * dt; S.y += S.vy * dt; if (S.y < ground){ S.y = ground; S.vy = 0; }
    S.food = Math.max(0, S.food - dt * .2 * (run ? 1.6 : 1));
    if (S.food <= 0) S.hp -= dt * 1.5; else if (S.food > 60) S.hp = Math.min(100, S.hp + dt * .4);
    if (near('fire', 5) || near('kiln', 4)) S.hp = Math.min(100, S.hp + dt * 1.2);
    const cab = STRUCTS.find(s => s.type === 'cabin' && Math.abs(S.x - s.x) < (s.w || 6) / 2 && Math.abs(S.z - s.z) < (s.d || 5) / 2);
    if (cab) S.hp = Math.min(100, S.hp + dt * 2.5);
    if (S.hp <= 0){ S.hp = 0; die(); }
    swingCd -= dt; if (swing > 0){ swing += dt * 2.6; if (swing >= 1) swing = 0; }
    player.position.set(S.x, S.y, S.z); player.rotation.y = S.ry;
    M.animHuman(player, speed, tAcc, swing);
    NET.send(speed);
    S.time += dt / 600; if (S.time >= 1){ S.time -= 1; S.day++; toast('🌅 ' + S.day + '일차 아침'); }
    saveT += dt; if (saveT > 20){ saveT = 0; saveLocal(); }
    BM.update();
  }
  if (Math.hypot(S.x - grassAt.x, S.z - grassAt.z) > (MOBILE ? 8 : 12)) placeGrass(S.x, S.z);
  // 하늘·해·그림자
  const ang = S.time * Math.PI * 2 - Math.PI / 2, sunUp = Math.sin(ang);
  const light = Math.max(0, Math.min(1, sunUp * 1.7 + .3)), dusk = Math.max(0, 1 - Math.abs(sunUp - .08) / .25);
  const sd = new T.Vector3(Math.cos(ang), Math.max(.05, sunUp), .35).normalize();
  sun.position.set(S.x + sd.x * 120, sd.y * 120, S.z + sd.z * 120); sun.target.position.set(S.x, S.y, S.z);
  sun.intensity = 1.7 * light; sun.color.setHex(0xfff0d8).lerp(C_DUSK, dusk * .6);
  hemi.intensity = .3 + .5 * light;
  skyU.top.value.copy(C_NIGHT).lerp(C_DAY_TOP, light); skyU.hor.value.copy(C_NIGHT_HOR).lerp(C_DAY_HOR, light).lerp(C_DUSK, dusk * .55);
  skyU.sunDir.value.copy(sd).setY(sunUp);
  scene.fog.color.copy(skyU.hor.value);
  const isNight = light < .35;
  $('clock').textContent = S.day + '일차 · ' + (isNight ? '🌙 밤' : dusk > .4 && sunUp < .3 ? '🌇 해질녘' : '☀️ 낮');
  torchLight.intensity = S.equip === 'torch' ? 2.4 : 0; torchLight.position.set(S.x, S.y + 2.1, S.z);
  STRUCTS.forEach(s => { const f = s.mesh.userData.flame; if (f){ f.scale.set(1 + Math.sin(tAcc * 17 + s.x) * .08, .85 + Math.sin(tAcc * 12 + s.z) * .2, 1); } });
  // 공룡
  const now = performance.now();
  const onTower = !!S.climb;
  for (const d of DINOS){
    const D = DINO[d.kind];
    if (d.dead){ if (now > d.respawn){ d.dead = false; d.hp = D.hp; d.m.visible = true; d.m.rotation.z = 0; d.state = 'wander'; } continue; }
    const dx = S.x - d.x, dz = S.z - d.z, dist = Math.hypot(dx, dz);
    if (dist > 160){ d.m.visible = false; continue; } d.m.visible = true;
    d.t -= dt; d.cd -= dt; d.hurt -= dt;
    const safe = inCamp(S.x, S.z, -1) && inCamp(d.x, d.z, 0) === false;
    if (D.mood === 'angry' && !dead && playing && dist < (isNight ? 26 : 13) * (D.sense || 1) && d.state !== 'chase' && !safe && !onTower){ d.state = 'chase'; d.t = 10; if (d.kind === 'rex' && !d.roared){ d.roared = true; toast('⚠️ 큰이빨이 다가와요! 캠프나 망루로 피하세요'); } }
    if (D.mood === 'shy' && dist < 8 && d.state === 'wander'){ d.state = 'flee'; d.t = 4; }
    let sp = 0, tr = d.ry;
    if (d.state === 'chase' && !dead){
      tr = Math.atan2(dx, dz); sp = D.run;
      if (onTower){ d.state = 'wander'; } else if (dist < D.rad + D.reach){ sp = 0; if (d.cd <= 0){ d.roared = false; d.cd = D.mood === 'guard' ? 2 : 1.2; S.hp -= D.dmg; toast('🦖 ' + D.name + '에게 ' + (D.mood === 'guard' ? '받혔어요' : D.mood === 'calm' ? '밟혔어요' : '물렸어요') + '! -' + D.dmg); } }
      if (d.t <= 0 || dist > 45) d.state = 'wander';
    } else if (d.state === 'flee'){ tr = Math.atan2(-dx, -dz); sp = D.run; if (d.t <= 0) d.state = 'wander'; }
    else { if (d.t <= 0){ d.t = 3 + Math.random() * 6; d.goal = Math.random() < .55 ? d.ry + (Math.random() - .5) * 2 : null; } if (d.goal != null){ tr = d.goal; sp = D.speed; } }
    let a = tr - d.ry; a = Math.atan2(Math.sin(a), Math.cos(a)); d.ry += a * Math.min(1, dt * (D.rad > 2 ? 1.5 : 4));
    let nx = d.x + Math.sin(d.ry) * sp * dt, nz = d.z + Math.cos(d.ry) * sp * dt;
    [nx, nz] = collide(nx, nz, Math.min(D.rad, 1.2));
    if (heightAt(nx, nz) > .4 && Math.hypot(nx, nz) < R * .95){ d.x = nx; d.z = nz; } else { d.ry += 1.5; d.goal = null; }
    d.m.position.set(d.x, heightAt(d.x, d.z), d.z); d.m.rotation.y = d.ry;
    const k = Math.sin(tAcc * (2.5 + sp * 1.4) / Math.sqrt(D.rad) + d.phase) * Math.min(1, sp / 2.5) * .55;
    d.m.userData.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? k : -k) * (i > 1 ? -1 : 1); });
    d.m.position.y += Math.abs(k) * .06 * D.rad;
  }
  // 다시 자라기
  if (Math.floor(tAcc) !== Math.floor(tAcc - dt)) for (const n of NODES) if (n.dead && now > n.until){ n.dead = false; n.hp = KIND[n.type].hp; setNode(n, true); }
  // 친구들
  for (const id in NET.others){
    const o = NET.others[id];
    o.x += (o.tx - o.x) * Math.min(1, dt * 8); o.z += (o.tz - o.z) * Math.min(1, dt * 8); o.y += (o.ty - o.y) * Math.min(1, dt * 8);
    let a = o.try - o.r; a = Math.atan2(Math.sin(a), Math.cos(a)); o.r += a * Math.min(1, dt * 8);
    o.m.position.set(o.x, o.y, o.z); o.m.rotation.y = o.r; M.animHuman(o.m, o.sp || 0, tAcc, 0);
    _v.set(o.x, o.y + 2.3, o.z).project(camera);
    o.label.style.display = _v.z < 1 && Math.hypot(o.x - S.x, o.z - S.z) < 60 ? 'block' : 'none';
    o.label.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; o.label.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px';
  }
  // 카메라: 어깨 너머 3인칭 (조준하면 가까이 · 시야 좁게)
  const dist = aiming ? 2.6 : 5.4, sh = aiming ? .75 : .55;
  const cx = S.x + Math.sin(yaw) * Math.cos(pitch) * dist + Math.cos(yaw) * sh;
  const cz = S.z + Math.cos(yaw) * Math.cos(pitch) * dist - Math.sin(yaw) * sh;
  let cy = S.y + 1.75 - Math.sin(pitch) * dist; cy = Math.max(cy, heightAt(cx, cz) + .4, -.05);
  camPos.set(cx, cy, cz);
  if (playing) camera.position.lerp(camPos, Math.min(1, dt * 14));
  lookAt.set(S.x + Math.cos(yaw) * sh, S.y + 1.6, S.z - Math.sin(yaw) * sh);
  if (!playing){ const t = tAcc * .04; camera.position.set(CAMP.x + Math.sin(t) * 38, CAMP.h + 20, CAMP.z + Math.cos(t) * 38); lookAt.set(CAMP.x, CAMP.h + 2, CAMP.z); }
  camera.lookAt(lookAt);
  const fv = aiming ? 45 : 60; if (Math.abs(fov - fv) > .1){ fov += (fv - fov) * Math.min(1, dt * 10); camera.fov = fov; camera.updateProjectionMatrix(); }
  $('cross').classList.toggle('aim', aiming);
  if (playing){ $('bHp').style.transform = 'scaleX(' + S.hp / 100 + ')'; $('bFood').style.transform = 'scaleX(' + S.food / 100 + ')'; $('bSta').style.transform = 'scaleX(' + S.sta / 100 + ')'; showPrompt(); }
  renderer.render(scene, camera);
  requestAnimationFrame(step);
}
requestAnimationFrame(step);
addEventListener('pagehide', saveLocal);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(); });
window.__primal = { S, NODES, DINOS, NET, STRUCTS, BM, renderer, heightAt, CAMP, setYaw: v => { yaw = v; } };
})();
