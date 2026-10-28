import json, sys, math
from collections import Counter
D = sys.argv[1]
T = 27.34            # one ceiling tile (60 cm) in pt
C = T / 3            # one grid cell (20 cm)
PAGES = {2: '2C', 3: '2D', 5: '4C', 6: '4D'}
near = lambda a, b, tol=2: abs(a - b) <= tol
out = {}

def merge_texts(ts):
    ts = sorted(ts, key=lambda t: (round(t['y'] / 4), t['x']))
    return ' '.join(t['t'] for t in ts).replace('  ', ' ').strip()

for page, pid in PAGES.items():
    J = json.load(open(f'{D}/p{page}.json', encoding='utf8'))
    F = [f for f in J['fills'] if f['x0'] < 760 and f['y1'] < 845]
    S = [s for s in J['strokes'] if s['pts'][0][0] < 760]
    X = [t for t in J['texts'] if t['x'] < 760]
    tiles = [f for f in F if tuple(f['c']) in ((205, 212, 234), (68, 114, 196)) and 25 < f['x1'] - f['x0'] < 30]
    bigs = [f for f in F if tuple(f['c']) == (231, 235, 244)]
    X0 = min(f['x0'] for f in tiles); Y0 = min(f['y0'] for f in tiles)
    X1 = max(f['x1'] for f in tiles + bigs); Y1 = max(f['y1'] for f in tiles + bigs)
    tc, tr = round((X1 - X0) / T), round((Y1 - Y0) / T)
    inside = lambda x, y, fs: any(f['x0'] - .5 <= x <= f['x1'] + .5 and f['y0'] - .5 <= y <= f['y1'] + .5 for f in fs)
    mask = [''.join('1' if inside(X0 + (i + .5) * T, Y0 + (j + .5) * T, tiles + bigs) else '0' for i in range(tc)) for j in range(tr)]
    gx = lambda x: round((x - X0) / C); gy = lambda y: round((y - Y0) / C)
    rect = lambda f: (gx(f['x0']), gy(f['y0']), max(1, gx(f['x1']) - gx(f['x0'])), max(1, gy(f['y1']) - gy(f['y0'])))
    def text_in(f, pad=1):
        return [t for t in X if f['x0'] - pad <= t['x'] <= f['x1'] + pad and f['y0'] - pad <= t['y'] - t['fs'] * .35 <= f['y1'] + pad]
    items = []; notes = []
    for f in F:
        c = tuple(f['c']); w, h = f['x1'] - f['x0'], f['y1'] - f['y0']
        cx, cy = (f['x0'] + f['x1']) / 2, (f['y0'] + f['y1']) / 2
        if c == (0, 0, 0) and w > 30 and h > 30:
            items.append({'type': 'pillar', 'gx': round((cx - X0) / C - 2), 'gy': round((cy - Y0) / C - 2)})
        elif c == (0, 0, 0) and 15 < w < 26 and 15 < h < 26:
            items.append({'type': 'door', 'gx': round((cx - X0) / C - 1.5), 'gy': round((cy - Y0) / C - 1.5), '_bb': [round(f['x0']), round(f['y0'])]})
        elif c == (255, 255, 255) and 45 < w < 70 and 45 < h < 70:
            x, y, ww, dd = rect(f)
            name = merge_texts(text_in(f))
            items.append({'type': 'desk', 'gx': x, 'gy': y, 'w': ww, 'd': dd, 'name': '' if name in ('-', '') else name})
        elif c == (237, 125, 49):
            items.append({'type': 'drawer', 'gx': round((cx - X0) / C - 1), 'gy': round((cy - Y0) / C - 1)})
        elif c == (67, 67, 255):
            x, y, ww, dd = rect(f); items.append({'type': 'table', 'gx': x, 'gy': y, 'w': ww, 'd': dd})
        elif c == (250, 228, 212):
            items.append({'type': 'stool', 'gx': round((cx - X0) / C - 1), 'gy': round((cy - Y0) / C - 1)})
        elif c == (112, 48, 160):
            items.append({'type': 'roundTable', 'gx': round((cx - X0) / C - 3), 'gy': round((cy - Y0) / C - 3)})
        elif c in ((0, 176, 240), (255, 255, 0), (255, 0, 0)) or (c == (0, 0, 0) and w > 40 and h < 40):
            kind = {(0, 176, 240): 'room', (255, 255, 0): 'entrance', (255, 0, 0): 'marker'}.get(c, 'tag')
            notes.append({'kind': kind, 'text': merge_texts(text_in(f, 3)), 'gx': round((cx - X0) / C), 'gy': round((cy - Y0) / C), 'w': round(w / C), 'h': round(h / C)})
    WALL = {(0, 0, 0): 'wall', (187, 214, 238): 'glass', (168, 208, 140): 'partition'}
    for s in S:
        c = tuple(s['c'])
        if c not in WALL or s['w'] < 4: continue
        (xa, ya), (xb, yb) = s['pts'][0], s['pts'][-1]
        if abs(ya - yb) < 1.5:      # horizontal
            a, b = sorted((gx(xa), gx(xb)))
            items.append({'type': WALL[c], 'gx': a, 'gy': math.floor((ya - Y0) / C), 'rot': 0, 'w': max(1, b - a)})
        elif abs(xa - xb) < 1.5:    # vertical
            a, b = sorted((gy(ya), gy(yb)))
            items.append({'type': WALL[c], 'gx': math.floor((xa - X0) / C), 'gy': a, 'rot': 90, 'w': max(1, b - a)})
    out[pid] = {'origin': [round(X0, 2), round(Y0, 2)], 'cols': tc * 3, 'rows': tr * 3, 'mask': mask, 'items': items, 'notes': notes,
                'texts': [{'t': t['t'], 'gx': round((t['x'] - X0) / C), 'gy': round((t['y'] - Y0) / C)} for t in X]}
    cnt = Counter(i['type'] for i in items)
    print(pid, 'grid', tc, 'x', tr, 'tiles ->', tc * 3, 'x', tr * 3, 'cells', dict(cnt))
    for n in notes: print('   note', n)
json.dump(out, open(f'{D}/extract.json', 'w', encoding='utf8'), ensure_ascii=False, indent=0)
