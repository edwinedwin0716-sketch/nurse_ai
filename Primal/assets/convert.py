#!/usr/bin/env python3
"""사용자가 준 STL 모형(울타리·가마·움막·공룡)을 게임용 web/assets.js 로 바꾼다.

    python3 Primal/assets/convert.py <STL 폴더>

- STL(Z가 위) → 게임 좌표(Y가 위, 머리 = +Z)
- 같은 꼭짓점을 합치고, 위치를 16비트로 줄여 base64로 담는다 (색은 models.js 가 칠한다)
- 공룡은 다리를 따로 떼어 걸을 수 있게 한다 (엉덩이·어깨 = 돌림 중심)
STL 머리글(80바이트)의 글자는 버린다.
"""
import base64, glob, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = {  # 이름: (STL 파일 이름에 들어 있는 글자, 다리 나누는 높이(없으면 None), 두 발이면 True)
    'fence': ('detailed_wooden_fence', None, False),
    'kiln': ('detailed_stone_kiln', None, False),
    'shelter': ('detailed_primitive_shelter', None, False),
    'tower': ('wooden_watchtower', None, False),
    'well': ('primitive_water_well', None, False),
    'camp': ('campfire_and_tent', None, False),      # 아래에서 모닥불(fire) · 천막(tent) 둘로 나눈다
    'longneck': ('brachiosaurus_base_mesh', 1.25, False),
    'horn': ('triceratops_base_mesh', .8, False),
    'rex': ('tyrannosaurus_base_mesh', 1.8, True),
    'plate': ('stegosaurus_base_mesh', .9, False),
}


def read_stl(path):
    b = open(path, 'rb').read()
    for h in (80, 81):   # 머리글이 81바이트로 잘못 저장된 파일도 있다
        n = struct.unpack('<I', b[h:h + 4])[0]
        if h + 4 + 50 * n == len(b):
            return [struct.unpack('<12f', b[h + 4 + 50 * i:h + 4 + 50 * i + 48])[3:12] for i in range(n)]
    raise SystemExit('STL 형식을 읽지 못했어요: ' + path)


def to_game(t):  # (x,y,z) Z-up → (-x, z, y) Y-up, 머리(+y)가 +Z
    return [(-t[k], t[k + 2], t[k + 1]) for k in (0, 3, 6)]


def pack(tris, origin=(0, 0, 0)):
    verts, index, keys = [], [], {}
    for tri in tris:
        for v in tri:
            v = (v[0] - origin[0], v[1] - origin[1], v[2] - origin[2])
            k = (round(v[0], 4), round(v[1], 4), round(v[2], 4))
            if k not in keys:
                keys[k] = len(verts); verts.append(k)
            index.append(keys[k])
    lo = [min(v[i] for v in verts) for i in range(3)]; hi = [max(v[i] for v in verts) for i in range(3)]
    q = bytearray()
    for v in verts:
        for i in range(3):
            span = hi[i] - lo[i] or 1
            q += struct.pack('<H', round((v[i] - lo[i]) / span * 65535))
    big = len(verts) > 65535
    ib = struct.pack('<%d%s' % (len(index), 'I' if big else 'H'), *index)
    return {'lo': [round(x, 4) for x in lo], 'hi': [round(x, 4) for x in hi], 'v': base64.b64encode(bytes(q)).decode(), 'i': base64.b64encode(ib).decode(), 'b': int(big)}


def split_legs(tris, thr, biped):
    body, legs = [], []
    for t in tris:
        (legs if all(v[1] < thr for v in t) else body).append(t)
    # 다리: 좌우(x 부호) × 앞뒤(z 가운데 기준). 두 발이면 좌우만
    zs = [v[2] for t in legs for v in t]; zmid = (min(zs) + max(zs)) / 2
    groups = {}
    for t in legs:
        cx = sum(v[0] for v in t) / 3; cz = sum(v[2] for v in t) / 3
        groups.setdefault((cx > 0, False if biped else cz > zmid), []).append(t)
    out = []
    for key in sorted(groups):
        g = groups[key]
        px = sum(v[0] for t in g for v in t) / (3 * len(g)); pz = sum(v[2] for t in g for v in t) / (3 * len(g))
        out.append({'pivot': [round(px, 4), thr, round(pz, 4)], 'mesh': pack(g, (px, thr, pz))})
    return body, out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '.'
    assets = {}
    for name, (pat, thr, biped) in FILES.items():
        found = glob.glob(os.path.join(src, '*' + pat + '*.stl'))
        if not found: raise SystemExit('없어요: ' + pat)
        tris = [to_game(t) for t in read_stl(found[0])]
        if name == 'camp':   # 왼쪽 = 모닥불 돌무더기, 오른쪽 = 천막 → 각각 제자리(가운데)로
            for part, side in (('firering', lambda c: c > 1.0), ('tent', lambda c: c <= 1.0)):
                ts = [t for t in tris if side(sum(v[0] for v in t) / 3)]
                cx = sum(v[0] for t in ts for v in t) / (3 * len(ts)); cz = sum(v[2] for t in ts for v in t) / (3 * len(ts))
                assets[part] = {'mesh': pack(ts, (cx, 0, cz))}
        elif thr is None:
            assets[name] = {'mesh': pack(tris)}
        else:
            body, legs = split_legs(tris, thr, biped)
            assets[name] = {'mesh': pack(body), 'legs': legs}
        print(name, len(tris), '삼각형')
    out = os.path.join(HERE, '..', 'web', 'assets.js')
    open(out, 'w', encoding='utf-8').write('// 자동 생성: Primal/assets/convert.py (사용자가 만든 STL 모형 · 직접 고치지 마세요)\nwindow.ASSETS = ' + json.dumps(assets, separators=(',', ':')) + ';\n')
    print(out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
