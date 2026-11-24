#!/usr/bin/env python3
"""원시섬 0.3: 사용자가 만든 STL 모형 28종을 게임용 web/assets.js 하나로 굽는다.

    python3 Primal/assets/convert.py <STL 폴더>

<STL 폴더>는 다음처럼 되어 있으면 된다 (없으면 스스로 찾아본다).

    <STL 폴더>/parts.json                     부품별 재질 구간 (없어도 된다)
    <STL 폴더>/base|high|exp2|exp3|exp4/*.stl

- STL(Z가 위) → 게임 좌표(Y가 위, 머리 = +Z)
- 같은 꼭짓점을 합치고 위치를 16비트로 줄여 base64로 담는다 (색은 웹 쪽 재질이 칠한다)
- 재질(부품)마다 따로 담아 웹에서 재질 하나씩 입힌다 (parts.json 의 재질 구간을 그대로 쓴다)
- parts.json 이 없는 예전 팩은 아래 RULES(높이·반지름·법선)로 재질을 나눈다
- 공룡은 다리를 따로 떼어 걸을 수 있게 한다 (엉덩이·어깨 = 돌림 중심)

만들어지는 파일: Primal/web/assets.js (window.ASSETS)
"""
import base64, glob, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))


# 재질 구간이 parts.json 에 없는 팩: (재질, 조건) 을 위에서부터 보고 처음 맞는 것을 쓴다.
# 조건은 게임 좌표의 삼각형 중심 — y = 높이(m), r = 중심에서의 수평 거리(m), ny = 법선의 위쪽 성분
RULES = {
    'fence':    [('log', 'y>1.45'), ('wood', None)],
    'kiln':     [('coal', 'y<0.22'), ('clay', 'y>1.85'), ('stone', None)],
    'shelter':  [('thatch', 'y>3.15'), ('wood', None)],
    'tower':    [('plank', 'y>5.5'), ('wood', None)],
    'well':     [('wood', 'y>2.05'), ('stone', None)],
    'firering': [('ember', 'r<0.62 and y<0.14'), ('stone', 'y<0.28'), ('log', None)],
    'tent':     [('log', 'y>2.95'), ('leather', None)],
    'props':    [('rope', 'y<0.45'), ('plank', None)],
    'longneck': [('skin', 'ny<-0.25'), ('hide', None)],
    'horn':     [('bone', 'y>2.15 and r>1.1'), ('skin', 'ny<-0.25'), ('hide', None)],
    'rex':      [('bone', 'y>3.2 and r<0.5'), ('skin', 'ny<-0.3'), ('hide', None)],
    'plate':    [('plate', 'y>2.35'), ('skin', 'ny<-0.25'), ('hide', None)],
}

# 이름: (찾을 STL 글자, 다리 나누는 높이(없으면 None), 두 발이면 True)
ASSETS = [
    # 시설·자연물 16종 (+ 모닥불·천막)
    ('fence',    'high/detailed_wooden_fence', None, False),
    ('kiln',     'high/detailed_stone_kiln', None, False),
    ('shelter',  'high/detailed_primitive_shelter', None, False),
    ('tower',    'exp2/wooden_watchtower', None, False),
    ('well',     'exp2/primitive_water_well', None, False),
    ('camp',     'exp2/campfire_and_tent', None, False),   # → 모닥불(firering) · 천막(tent) 둘로 나눈다
    ('forge',    'exp3/blacksmith_forge', None, False),
    ('bench',    'exp3/crafting_workbench', None, False),
    ('raft',     'exp3/wooden_raft', None, False),
    ('hut',      'exp4/primitive_hut', None, False),
    ('fishrack', 'exp4/fishing_drying_rack', None, False),
    ('altar',    'exp4/stone_altar', None, False),
    ('palm',     'exp4/palm_tree', None, False),
    ('fern',     'exp4/fern_cluster', None, False),
    ('basalt',   'exp4/basalt_boulder_cluster', None, False),
    ('props',    'base/camp_props_set', None, False),
    # 공룡·고생물 12종
    ('longneck', 'high/brachiosaurus_base_mesh', 1.25, False),
    ('horn',     'high/triceratops_base_mesh', 0.80, False),
    ('rex',      'exp2/tyrannosaurus_base_mesh', 1.80, True),
    ('plate',    'exp2/stegosaurus_base_mesh', 0.90, False),
    ('ptera',    'exp3/pteranodon_base_mesh', 0.50, True),
    ('mammoth',  'exp3/mammoth_base_mesh', 0.85, False),
    ('para',     'exp4/parasaurolophus_base_mesh', 0.70, False),
    ('anky',     'exp4/ankylosaurus_base_mesh', 0.35, False),
    ('raptor',   'exp4/velociraptor_base_mesh', 0.40, True),
    ('dimetro',  'exp4/dimetrodon_base_mesh', 0.50, False),
    ('spino',    'exp4/spinosaurus_base_mesh', 0.90, False),
    ('smilo',    'exp4/smilodon_base_mesh', 0.45, False),
]


def read_stl(path):
    b = open(path, 'rb').read()
    for h in (80, 81):   # 머리글이 81바이트로 잘못 저장된 파일도 있다
        n = struct.unpack('<I', b[h:h + 4])[0]
        if h + 4 + 50 * n == len(b):
            return [struct.unpack('<12f', b[h + 4 + 50 * i:h + 4 + 50 * i + 48])[3:12] for i in range(n)]
    raise SystemExit('STL 형식을 읽지 못했어요: ' + path)


def to_game(t):  # (x,y,z) Z-up → (-x, z, y) Y-up, 머리(+y)가 +Z
    return [(-t[k], t[k + 2], t[k + 1]) for k in (0, 3, 6)]


def tri_normal(t):
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    L = (nx * nx + ny * ny + nz * nz) ** .5 or 1.0
    return nx / L, ny / L, nz / L


def q(v, places=4):   # 꼭짓점 합치기 열쇠 (0.1mm)
    return (round(v[0], places), round(v[1], places), round(v[2], places))


def pack(tris, origin=(0, 0, 0)):
    """삼각형 묶음 → 16비트 위치 + 색인 (base64)"""
    verts, index, keys = [], [], {}
    for tri in tris:
        for v in tri:
            v = (v[0] - origin[0], v[1] - origin[1], v[2] - origin[2])
            k = q(v)
            if k not in keys:
                keys[k] = len(verts); verts.append(k)
            index.append(keys[k])
    if not verts:
        return None
    lo = [min(v[i] for v in verts) for i in range(3)]
    hi = [max(v[i] for v in verts) for i in range(3)]
    span = [hi[i] - lo[i] for i in range(3)]
    qb = bytearray()
    for v in verts:
        for i in range(3):
            qb += struct.pack('<H', round((v[i] - lo[i]) / span[i] * 65535) if span[i] > 1e-6 else 0)
    big = len(verts) > 65535
    ib = struct.pack('<%d%s' % (len(index), 'I' if big else 'H'), *index)
    return {
        'lo': [round(x, 4) for x in lo],          # origin 기준 상대 좌표 (다리는 돌림 중심이 원점)
        'hi': [round(x, 4) for x in hi],
        'v': base64.b64encode(bytes(qb)).decode(),
        'i': base64.b64encode(ib).decode(),
        'b': int(big), 'n': len(verts), 't': len(tris),
    }


def bbox(tris, origin=(0, 0, 0)):
    xs = [v[0] - origin[0] for t in tris for v in t]
    ys = [v[1] - origin[1] for t in tris for v in t]
    zs = [v[2] - origin[2] for t in tris for v in t]
    return [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3),
            round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)]


def rule_mat(tri, rule):
    """RULES 의 조건으로 삼각형 하나의 재질을 고른다."""
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = tri
    x, y, z = (ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3
    env = {'x': x, 'y': y, 'z': z, 'r': (x * x + z * z) ** .5, 'ny': tri_normal(tri)[1]}
    for mat, test in rule:
        if test is None or eval(test, {'__builtins__': {}}, env):
            return mat
    return 'stone'


def load_groups(parts, stl_rel):
    """parts.json 의 재질 구간 (원본 STL 삼각형 순서) — 없으면 None"""
    e = parts.get(stl_rel) or parts.get(os.path.basename(stl_rel))
    if not e or not e.get('groups'):
        return None
    return [(g['mat'], int(g['start']), int(g['count'])) for g in e['groups']]


def split_legs(pairs, thr, biped):
    """(번호, 삼각형) 목록 → (몸통, [다리...])  다리 = thr 아래에 통째로 있는 삼각형"""
    body, legs = [], []
    for p in pairs:
        (legs if all(v[1] < thr for v in p[1]) else body).append(p)
    if not legs:
        return body, []
    zs = [v[2] for p in legs for v in p[1]]
    zmid = (min(zs) + max(zs)) / 2
    groups = {}
    for p in legs:
        cx = sum(v[0] for v in p[1]) / 3
        cz = sum(v[2] for v in p[1]) / 3
        groups.setdefault((cx > 0, False if biped else cz > zmid), []).append(p)
    out = []
    for key in sorted(groups):
        g = groups[key]
        px = sum(v[0] for p in g for v in p[1]) / (3 * len(g))
        pz = sum(v[2] for p in g for v in p[1]) / (3 * len(g))
        out.append({'pivot': [round(px, 3), round(thr, 3), round(pz, 3)], 'pairs': g})
    return body, out


def build_parts(pairs, groups, rule, origin=(0, 0, 0)):
    """재질별로 pack() 한 부품 목록 (큰 재질부터).

    parts.json 구간이 있으면 원본 삼각형 번호로 재질을 정하고, 없으면 RULES 로 나눈다.
    """
    if groups:
        mat_of = {}
        for mat, start, count in groups:
            for i in range(start, start + count):
                mat_of[i] = mat
        buckets = {}
        for idx, tri in pairs:
            buckets.setdefault(mat_of.get(idx, 'stone'), []).append(tri)
    else:
        buckets = {}
        for _idx, tri in pairs:
            buckets.setdefault(rule_mat(tri, rule), []).append(tri)
    out = []
    for mat, chunk in buckets.items():
        p = pack(chunk, origin)
        if p:
            p['m'] = mat
            out.append(p)
    out.sort(key=lambda p: -p['t'])
    return out


def find_src():
    for a in sys.argv[1:]:
        if os.path.isdir(a):
            return os.path.abspath(a)
    for c in (os.environ.get('PRIMAL_STL'),
              os.path.join(REPO, 'work', 'durango-3d', 'assets'),
              os.path.join(REPO, '..', 'work', 'durango-3d', 'assets'),
              os.path.join(REPO, 'Primal', 'assets', 'stl'),
              os.path.join(os.getcwd(), 'assets')):
        if c and os.path.isdir(c):
            return os.path.abspath(c)
    raise SystemExit('STL 폴더를 찾지 못했어요.  python3 Primal/assets/convert.py <STL 폴더>')


def find_stl(src, key):
    path = os.path.join(src, key + '.stl')
    if os.path.exists(path):
        return path
    found = glob.glob(os.path.join(src, '**', key + '.stl'), recursive=True)
    if not found:
        raise SystemExit('없어요: ' + key + '.stl  (' + src + ')')
    return sorted(found)[0]


def main():
    src = find_src()
    parts_path = os.path.join(src, 'parts.json')
    manifest = json.load(open(parts_path, encoding='utf-8')) if os.path.exists(parts_path) else {}
    out, lines, tris_total, parts_total = {}, [], 0, 0
    for name, key, thr, biped in ASSETS:
        path = find_stl(src, key)
        rel = os.path.relpath(path, src).replace(os.sep, '/')
        pairs = [(i, to_game(t)) for i, t in enumerate(read_stl(path))]
        tris = [p[1] for p in pairs]
        tris_total += len(tris)
        groups, rule = load_groups(manifest, rel), RULES.get(name, [('stone', None)])
        if name == 'camp':   # 왼쪽 = 모닥불 돌무더기, 오른쪽 = 천막 → 각각 제자리(가운데)로
            for part, side in (('firering', lambda c: c > 1.0), ('tent', lambda c: c <= 1.0)):
                ps = [p for p in pairs if side(sum(v[0] for v in p[1]) / 3)]
                ts = [p[1] for p in ps]
                cx = sum(v[0] for t in ts for v in t) / (3 * len(ts))
                cz = sum(v[2] for t in ts for v in t) / (3 * len(ts))
                obj = {'bb': bbox(ts, (cx, 0, cz)), 'parts': build_parts(ps, None, RULES[part], (cx, 0, cz))}
                out[part] = obj
                parts_total += len(obj['parts'])
                lines.append((part, len(ts), len(obj['parts']), os.path.basename(path)))
            continue
        row = {'bb': bbox(tris), 'parts': build_parts(pairs, groups, rule)}
        parts_total += len(row['parts'])
        if thr is not None:
            body, legs = split_legs(pairs, thr, biped)
            row['parts'] = build_parts(body, groups, rule)
            leg_out = []
            for lg in legs:
                lp = build_parts(lg['pairs'], groups, rule, tuple(lg['pivot']))
                if lp:
                    leg_out.append({'pivot': lg['pivot'], 'parts': lp})
                    parts_total += len(lp)
            if leg_out:
                row['legs'] = leg_out
        out[name] = row
        lines.append((name, len(tris), len(row['parts']) + sum(len(l['parts']) for l in row.get('legs', [])),
                      os.path.basename(path)))
    dest = os.path.join(HERE, '..', 'web', 'assets.js')
    meta = {'v': '0.3', 'assets': len(out), 'triangles': tris_total, 'parts': parts_total,
            'source': os.path.basename(src)}
    with open(dest, 'w', encoding='utf-8') as f:
        f.write('// 자동 생성: Primal/assets/convert.py (사용자가 만든 STL 모형 · 직접 고치지 마세요)\n')
        f.write('// 원시섬 0.3 · STL %d종 · 삼각형 %d · 재질 부품 %d\n' % (len(ASSETS), tris_total, parts_total))
        f.write('window.ASSET_META = ' + json.dumps(meta, separators=(',', ':')) + ';\n')
        f.write('window.ASSETS = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    for name, t, p, f in lines:
        print('  %-9s %6d 삼각형  %2d 부품  %s' % (name, t, p, f))
    size = os.path.getsize(dest)
    print('합계 %d 삼각형 · 항목 %d · 부품 %d' % (tris_total, len(out), parts_total))
    print('%s  %.2f MB' % (os.path.relpath(dest, REPO), size / 1048576))
    if '--report' in sys.argv:
        p = sys.argv[sys.argv.index('--report') + 1]
        json.dump([{'name': n, 'tris': t, 'parts': c, 'file': f} for n, t, c, f in lines],
                  open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('report:', p)


if __name__ == '__main__':
    main()
