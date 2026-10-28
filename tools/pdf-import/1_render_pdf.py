import sys, io, json
from pypdf import PdfReader
from pypdf.generic import ContentStream
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:\Users\ksg-usr\OneDrive\Desktop\File\2026_KOSIGN_Official_Layout_0929.pptx.pdf"
OUT = sys.argv[1]; SCALE = float(sys.argv[2]) if len(sys.argv) > 2 else 1.4
pages = [int(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else None
r = PdfReader(SRC)
FONT = r"C:\Windows\Fonts\malgun.ttf"

def mul(a, b):
    return [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3], a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3],
            a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]]

def col(ops):
    v = [float(x) for x in ops]
    if len(v) == 1: g = int(v[0]*255); return (g, g, g)
    if len(v) == 3: return tuple(int(x*255) for x in v)
    if len(v) == 4: c, m, y, k = v; return tuple(int(255*(1-a)*(1-k)) for a in (c, m, y))
    return (0, 0, 0)

for pi, page in enumerate(r.pages, 1):
    if pages and pi not in pages: continue
    W, H = float(page.mediabox.width), float(page.mediabox.height)
    img = Image.new('RGB', (int(W*SCALE), int(H*SCALE)), 'white')
    dr = ImageDraw.Draw(img)
    base = [SCALE, 0, 0, -SCALE, 0, H*SCALE]
    res = page['/Resources']
    xobjs = res.get('/XObject', {}) if res else {}
    texts, fills, strokes = [], [], []

    def run(content, ctm0, res):
        st = []; ctm = ctm0[:]; fillc = (0,0,0); strokec = (0,0,0); lw = 1
        path = []; cur = []
        tm = [1,0,0,1,0,0]; tlm = tm[:]; fsize = 10; lead = 0; tfont = None
        def P(x, y, m=None):
            m = m or ctm; return (x*m[0]+y*m[2]+m[4], x*m[1]+y*m[3]+m[5])
        xo = res.get('/XObject', {}) if res else {}
        for ops, op in content.operations:
            op = op.decode() if isinstance(op, bytes) else op
            if op == 'q': st.append((ctm[:], fillc, strokec, lw))
            elif op == 'Q' and st: ctm, fillc, strokec, lw = st.pop()
            elif op == 'cm': ctm = mul([float(x) for x in ops], ctm)
            elif op in ('rg','g','k','sc','scn'):
                try: fillc = col([x for x in ops if not hasattr(x,'startswith')])
                except Exception: pass
            elif op in ('RG','G','K','SC','SCN'):
                try: strokec = col([x for x in ops if not hasattr(x,'startswith')])
                except Exception: pass
            elif op == 'w': lw = float(ops[0])
            elif op == 'm':
                if cur: path.append(cur)
                cur = [P(float(ops[0]), float(ops[1]))]
            elif op == 'l': cur.append(P(float(ops[0]), float(ops[1])))
            elif op in ('c','v','y'):
                v = [float(x) for x in ops]; cur.append(P(v[-2], v[-1]))
            elif op == 'h':
                if cur: cur.append(cur[0])
            elif op == 're':
                x, y, w, h = [float(v) for v in ops]
                if cur: path.append(cur)
                cur = []
                path.append([P(x,y), P(x+w,y), P(x+w,y+h), P(x,y+h), P(x,y)])
            elif op in ('f','F','f*','B','B*','b','b*','S','s','n'):
                if cur: path.append(cur)
                for sp in path:
                    if len(sp) < 2: continue
                    if op not in ('S','s','n') and len(sp) > 2:
                        dr.polygon(sp, fill=fillc)
                        xs=[p[0] for p in sp]; ys=[p[1] for p in sp]
                        fills.append({'c': fillc, 'x0': min(xs)/SCALE, 'y0': min(ys)/SCALE, 'x1': max(xs)/SCALE, 'y1': max(ys)/SCALE, 'n': len(sp)})
                    if op in ('S','s','B','B*','b','b*'):
                        sw = lw*abs(ctm[0]*ctm[3]-ctm[1]*ctm[2])**.5
                        dr.line(sp, fill=strokec, width=max(1, int(sw)))
                        strokes.append({'c': strokec, 'w': round(sw/SCALE,2), 'pts': [[round(p[0]/SCALE,1), round(p[1]/SCALE,1)] for p in sp]})
                path = []; cur = []
            elif op == 'BT': tm = [1,0,0,1,0,0]; tlm = tm[:]
            elif op == 'Tf': fsize = float(ops[1])
            elif op == 'TL': lead = float(ops[0])
            elif op == 'Tm': tm = [float(x) for x in ops]; tlm = tm[:]
            elif op in ('Td','TD'):
                tlm = mul([1,0,0,1,float(ops[0]),float(ops[1])], tlm); tm = tlm[:]
            elif op == 'T*': tlm = mul([1,0,0,1,0,-lead], tlm); tm = tlm[:]
            elif op in ('Tj','TJ',"'",'"'):
                m = mul(tm, ctm); x, y = m[4], m[5]
                sz = max(4, fsize * (m[0]**2+m[1]**2)**.5)
                pass
                tm = mul([1,0,0,1,fsize*0.5,0], tm)
            elif op == 'Do':
                name = ops[0]
                o = xo.get(name)
                if o is None: continue
                o = o.get_object()
                if o.get('/Subtype') == '/Image':
                    try:
                        from pypdf.filters import _xobj_to_image
                        im = _xobj_to_image(o)[2]
                    except Exception as e:
                        try:
                            im = Image.open(io.BytesIO(o.get_data()))
                        except Exception: print('img fail', e); continue
                    pts = [P(0,0), P(1,0), P(0,1), P(1,1)]
                    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
                    bx = (int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys)))
                    if bx[2]-bx[0] > 2 and bx[3]-bx[1] > 2:
                        im = im.convert('RGBA').resize((bx[2]-bx[0], bx[3]-bx[1]))
                        img.paste(im, bx[:2], im)
                    print(f'page {pi} image at', [round(v/SCALE) for v in bx], o.get('/Width'), o.get('/Height'))
                elif o.get('/Subtype') == '/Form':
                    fm = [float(x) for x in o.get('/Matrix', [1,0,0,1,0,0])]
                    run(ContentStream(o, r), mul(fm, ctm), o.get('/Resources') or res)
    run(ContentStream(page.get_contents(), r), base, res)
    # overlay text with positions from pypdf's visitor (more reliable than the dot markers)
    font = ImageFont.truetype(FONT, int(9*SCALE))
    def vis(text, cm, tm, fd, fs):
        t = text.strip()
        if not t: return
        m = mul(tm, cm); x, y = m[4]*SCALE, (H - m[5])*SCALE
        texts.append({'t': t, 'x': round(m[4],1), 'y': round(H-m[5],1), 'fs': round(fs*(m[0]**2+m[1]**2)**.5,1)})
        dr.text((x, y - 9*SCALE), t, fill=(0,0,255), font=font)
    page.extract_text(visitor_text=vis)
    img.save(f"{OUT}/p{pi}.png")
    json.dump({'texts': texts, 'fills': fills, 'strokes': strokes, 'W': W, 'H': H}, open(f"{OUT}/p{pi}.json", 'w', encoding='utf8'), ensure_ascii=False)
    print('page', pi, 'texts', len(texts), 'fills', len(fills))
