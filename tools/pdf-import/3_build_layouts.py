# Turn the PDF extraction into src/model/layouts.json for the app.
import json, sys, re
from collections import Counter
D, OUT = sys.argv[1], sys.argv[2]
E = json.load(open(f'{D}/extract.json', encoding='utf8'))

SIZE = {'pillar': (4, 4), 'door': (4, 4), 'drawer': (2, 2), 'stool': (2, 2), 'roundTable': (6, 6)}
LAYER = lambda t: 'floor' if t in ('zone', 'door') else 'structure' if t in ('wall', 'glass', 'partition', 'pillar') else 'furniture'

META = {
  '2C': dict(floor=2, unit='C', title='TOBE: 2층 / UNIT C', subtitle='비즈플레이 (모바일/웹), 비플레이', subtitleEn='Bizplay (mobile/web), Bplay',
             legend=['비즈플레이', '로컬 프로젝트', '글로벌 상품 (CMS)', '비플페이', '캐비닛 실 (에어컨 등)', '주 출입구']),
  '2D': dict(floor=2, unit='D', title='TOBE: 2층 / UNIT D', subtitle='쿠콘, IT 인프라', subtitleEn='Coocon, IT infrastructure',
             legend=['쿠콘웹', '쿠콘 스크래핑', '캐비닛 실 (에어컨 등)', '서버실', '주 출입구']),
  '4C': dict(floor=4, unit='C', title='TO-BE: 4층 / UNIT C', subtitle='CEO, GM, 로컬 아웃소싱, 영업/CX', subtitleEn='CEO, GM, local outsourcing, sales/CX',
             legend=['로컬비즈니스센터', '전략기획실', 'GM', '캐비닛 실 (에어컨 등)', '주 출입구']),
  '4D': dict(floor=4, unit='D', title='TO-BE: 4층 / UNIT D', subtitle='위카페, 마사지 실', subtitleEn='WeCafe, massage rooms',
             legend=['마사지 실 (NEW)', '바리스타', '위카페', '캐비닛 실 (에어컨 등)', '주 출입구']),
}
# Zones read off the wall lines of each PDF page (cells: gx, gy, w, d).
def Z(gx, gy, w, d, label, kind, en='', n=None, on=None):
    return dict(gx=gx, gy=gy, w=w, d=d, label=label, kind=kind, en=en, n=n, on=on)
ZONES = {
  '2C': [Z(22, 4, 18, 7, '캐비닛 실', 'cabinet', 'Cabinet room (A/C)', 5),
         Z(59, 29, 19, 18, '서울 회의실', 'meeting', 'Seoul meeting room', on=True),
         Z(33, 67, 23, 16, '앙코르 회의실', 'meeting', 'Angkor meeting room', on=False),
         Z(5, 4, 15, 22, '비플페이', 'dept', 'Bplay pay', 4),
         Z(2, 31, 43, 14, '로컬 프로젝트 · 글로벌 상품', 'dept', 'Local projects · Global products (CMS)', 2),
         Z(2, 46, 43, 15, '비즈플레이', 'dept', 'Bizplay', 1),
         Z(56, 11, 22, 14, '여유 좌석', 'dept', 'Spare seats'),
         Z(38, 26, 9, 2, '개발서버 PC (?)', 'note', 'Dev server PC'),
         Z(60, 84, 18, 3, '주 출입구', 'entrance', 'Main entrance', 6)],
  '2D': [Z(38, 4, 18, 7, '캐비닛 실', 'cabinet', 'Cabinet room (A/C)', 3),
         Z(0, 29, 19, 18, '제주 회의실', 'meeting', 'Jeju meeting room', on=False),
         Z(21, 67, 24, 16, '서버실', 'server', 'Server room', 4),
         Z(0, 10, 22, 15, '쿠콘웹', 'dept', 'Coocon web', 1),
         Z(57, 3, 15, 23, '쿠콘웹', 'dept', 'Coocon web', 1),
         Z(32, 31, 44, 14, '쿠콘웹', 'dept', 'Coocon web', 1),
         Z(32, 46, 44, 15, '쿠콘 데이터 · 스크래핑', 'dept', 'Coocon data · scraping', 2),
         Z(2, 61, 15, 23, '쿠콘 · IT 인프라', 'dept', 'Coocon · IT infrastructure'),
         Z(0, 48, 5, 11, '주 출입구', 'entrance', 'Main entrance', 5),
         Z(3, 84, 14, 3, '메인 출/입구문 (닫음)', 'note', 'Main door (closed)')],
  '4C': [Z(22, 3, 18, 8, '캐비닛 실', 'cabinet', 'Cabinet room (A/C)', 4),
         Z(0, 3, 21, 24, 'CEO', 'ceo', 'CEO office'),
         Z(0, 28, 21, 38, '바욘 회의실', 'meeting', 'Bayon meeting room', on=False),
         Z(59, 28, 19, 19, '회의실', 'meeting', 'Meeting room', on=True),
         Z(57, 4, 21, 23, 'GM', 'dept', 'GM', 3),
         Z(22, 34, 30, 31, '로컬비즈니스센터', 'dept', 'Local business center', 1),
         Z(33, 66, 23, 17, '전략기획실', 'dept', 'Strategy & planning office', 2),
         Z(60, 84, 18, 3, '주 출입구', 'entrance', 'Main entrance', 5)],
  '4D': [Z(38, 4, 18, 7, '캐비닛 실', 'cabinet', 'Cabinet room (A/C)', 4),
         Z(0, 4, 19, 24, '남성 마사지 실', 'massage', "Men's massage room", 1),
         Z(0, 29, 19, 18, '여성 마사지 실', 'massage', "Women's massage room", 1),
         Z(21, 66, 24, 17, '위카페 바리스타', 'barista', 'WeCafe barista', 2, on=True),
         Z(20, 12, 57, 53, '위카페', 'cafe', 'WeCafe', 3, on=True),
         Z(3, 84, 14, 3, '주 출입구', 'entrance', 'Main entrance', 5)],
}

def fp(it):
    t = it['type']
    if t in SIZE: w, d = SIZE[t]
    elif t in ('wall', 'glass', 'partition'): w, d = it['w'], 1
    else: w, d = it['w'], it['d']
    return (d, w) if it.get('rot', 0) in (90, 270) else (w, d)

def rect(it):
    w, d = fp(it)
    return (it['gx'], it['gy'], it['gx'] + w, it['gy'] + d)

def ov(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]

def collides(a, b):
    la, lb = LAYER(a['type']), LAYER(b['type'])
    if 'floor' in (la, lb) or (la == lb == 'structure'): return False
    return ov(rect(a), rect(b))

def in_plate(it, P):
    x0, y0, x1, y1 = rect(it)
    if x0 < 0 or y0 < 0 or x1 > P['cols'] or y1 > P['rows']: return False
    return all(P['mask'][ty][tx] == '1' for ty in range(y0 // 3, (y1 - 1) // 3 + 1) for tx in range(x0 // 3, (x1 - 1) // 3 + 1))

result = {}
for pid, P in E.items():
    cols, rows = P['cols'], P['rows']
    raw = P['items']
    pillars = [i for i in raw if i['type'] == 'pillar']
    items = []
    # --- structure: clamp to the plate, split walls where they run through a pillar ---
    for p in pillars:
        items.append({'type': 'pillar', 'gx': p['gx'], 'gy': p['gy'], 'rot': 0, 'locked': True})
    seen = set(); edges = []
    for w in raw:
        if w['type'] not in ('wall', 'glass', 'partition'): continue
        horiz = w['rot'] == 0
        a = w['gx'] if horiz else w['gy']
        b = a + w['w']
        fixed = w['gy'] if horiz else w['gx']
        a, b = max(-1, a), min((cols if horiz else rows) + 1, b)
        if fixed < 0 or fixed >= (rows if horiz else cols):   # outer wall just outside the tile grid
            edges.append({'gx': a if horiz else fixed, 'gy': fixed if horiz else a, 'rot': 0 if horiz else 90, 'w': b - a, 'type': w['type']})
            continue
        a, b = max(0, a), min(cols if horiz else rows, b)
        def in_pillar(c):
            x, y = (c, fixed) if horiz else (fixed, c)
            return any(p['gx'] <= x < p['gx'] + 4 and p['gy'] <= y < p['gy'] + 4 for p in pillars)
        cells = [c for c in range(a, b) if not in_pillar(c)]
        runs, cur = [], []
        for c in cells:
            if cur and c != cur[-1] + 1:
                runs.append(cur); cur = []
            cur.append(c)
        if cur: runs.append(cur)
        for r in runs:
            key = (w['type'], horiz, fixed, r[0], len(r))
            if key in seen: continue
            seen.add(key)
            items.append({'type': w['type'], 'gx': r[0] if horiz else fixed, 'gy': fixed if horiz else r[0],
                          'rot': 0 if horiz else 90, 'w': len(r), 'locked': w['type'] != 'partition'})
    # --- doors: the PDF draws each door as two shapes ---
    dd = set()
    for d in raw:
        if d['type'] != 'door' or (d['gx'], d['gy']) in dd: continue
        dd.add((d['gx'], d['gy']))
        items.append({'type': 'door', 'gx': max(0, min(cols - 4, d['gx'])), 'gy': max(0, min(rows - 4, d['gy'])), 'rot': 0, 'locked': True})
    # --- desks: normalise to 140x120 cm (7x6 cells), chair faces away from the facing desk ---
    desks = [i for i in raw if i['type'] == 'desk']
    markers = [n for n in P['notes'] if n['kind'] == 'marker' and re.fullmatch(r'\d( \d)*', n['text'])]
    legend = META[pid]['legend']
    def touching(a, b, side):
        ax0, ay0, ax1, ay1 = a['gx'], a['gy'], a['gx'] + a['w'], a['gy'] + a['d']
        bx0, by0, bx1, by1 = b['gx'], b['gy'], b['gx'] + b['w'], b['gy'] + b['d']
        xo = min(ax1, bx1) - max(ax0, bx0) > 2
        yo = min(ay1, by1) - max(ay0, by0) > 2
        return {'+y': xo and abs(by0 - ay1) <= 1, '-y': xo and abs(ay0 - by1) <= 1,
                '+x': yo and abs(bx0 - ax1) <= 1, '-x': yo and abs(ax0 - bx1) <= 1}[side]
    n = 0
    for k in sorted(desks, key=lambda k: (k['gy'], k['gx'])):
        nb = {s: any(touching(k, o, s) for o in desks if o is not k) for s in ('+y', '-y', '+x', '-x')}
        if k['w'] == k['d']:
            w, d, rot = 6, 6, (180 if nb['+y'] and not nb['-y'] else 0)
        elif k['w'] > k['d']:
            w, d, rot = 7, 6, (180 if nb['+y'] and not nb['-y'] else 0)
        else:  # tall on the page: a 7x6 desk turned 90°, chair away from the neighbour
            w, d, rot = 7, 6, (90 if nb['+x'] else 270 if nb['-x'] else 90)
        name = re.sub(r'(^|\s)\d(?=\s|$)', ' ', k['name']).strip()
        name = re.sub(r'\s+', ' ', name)
        cx, cy = k['gx'] + k['w'] / 2, k['gy'] + k['d'] / 2
        home = sorted((z for z in ZONES[pid] if z['kind'] in ('dept', 'ceo') and z['gx'] <= cx < z['gx'] + z['w'] and z['gy'] <= cy < z['gy'] + z['d']),
                      key=lambda z: z['w'] * z['d'])
        team = home[0]['label'] if home and home[0]['label'] != '여유 좌석' else ''
        n += 1
        it = {'type': 'desk', 'gx': k['gx'], 'gy': k['gy'], 'rot': rot, 'w': w, 'd': d,
              'label': f"{pid}-{n:02d}", 'name': name, 'team': team if name else ''}
        if name == '원격 PC':
            it['name'], it['team'], it['note'] = '', '', '원격 PC (remote PC)'
        items.append(it)
    for t in ('drawer', 'stool', 'roundTable', 'table'):
        for i in raw:
            if i['type'] != t: continue
            it = {'type': t, 'gx': i['gx'], 'gy': i['gy'], 'rot': 0}
            if t == 'table': it.update(w=i['w'], d=i['d'])
            items.append(it)
    for z in ZONES[pid]:
        it = {'type': 'zone', 'gx': z['gx'], 'gy': z['gy'], 'rot': 0, 'w': z['w'], 'd': z['d'], 'kind': z['kind'],
              'label': z['label'], 'en': z['en'], 'locked': True}
        if z['n']: it['n'] = z['n']
        if z['on'] is not None: it['on'] = z['on']
        items.append(it)
    # --- resolve: stay on the plate; nudge colliding furniture by up to 2 cells, else drop ---
    placed, dropped, nudged = [], [], []
    order = sorted(items, key=lambda i: {'structure': 0, 'floor': 1, 'furniture': 2}[LAYER(i['type'])])
    for it in order:
        ok = lambda c: in_plate(c, P) and not any(collides(c, o) for o in placed)
        if LAYER(it['type']) == 'floor':
            while not in_plate(it, P) and it['d'] > 1: it['d'] -= 1
        if ok(it):
            placed.append(it); continue
        found = None
        if it['type'] == 'table':   # rounding can make a table overlap a wall by one cell: trim it
            for c in (dict(it, d=it['d'] - 1), dict(it, gy=it['gy'] + 1, d=it['d'] - 1), dict(it, w=it['w'] - 1), dict(it, gx=it['gx'] + 1, w=it['w'] - 1)):
                if min(c['w'], c['d']) >= 1 and ok(c): found = c; break
        for r in (1, 2):
            if found: break
            for dx, dy in ((r, 0), (-r, 0), (0, r), (0, -r), (r, r), (-r, r), (r, -r), (-r, -r)):
                c = dict(it, gx=it['gx'] + dx, gy=it['gy'] + dy)
                if ok(c): found = c; break
            if found: break
        if found:
            placed.append(found); nudged.append((it['type'], it.get('name', '')))
        else:
            dropped.append(it)
    for i, it in enumerate(placed): it['id'] = f"{pid}-{it['type']}-{i:03d}"
    result[pid] = dict(META[pid], id=pid, cols=cols, rows=rows, mask=P['mask'], edges=edges, items=placed)
    print(pid, len(placed), 'items', dict(Counter(i['type'] for i in placed)))
    print('   nudged', nudged)
    print('   dropped', [(d['type'], d['gx'], d['gy'], d.get('name', '')) for d in dropped])
json.dump(result, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('wrote', OUT)
