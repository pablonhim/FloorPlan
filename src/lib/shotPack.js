// Several screenshots saved together (the screenshot preview's "Take another", ShotPreview / ZoomRail): one PDF,
// a page per picture, or one PowerPoint deck, a slide per picture. The PDF is written here by hand (each picture
// as a JPEG, page sized to it); the deck uses pptxgenjs, loaded only when a deck is made.

/** A picture (blob url) as JPEG bytes and its size: drawn on white (the PDF has no transparency to show). */
async function jpegOf(page, quality = 0.92) {
  const img = new Image();
  img.src = page.url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, dataUrl: c.toDataURL('image/jpeg', quality) };
}

const today = () => new Date().toISOString().slice(0, 10);
export const packName = (ext) => `wefloor-screenshots-${today()}.${ext}`;

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One PDF, a page per picture: each page as wide as an A4 landscape (842 pt) and as tall as its picture needs. */
export async function savePdf(pages, name = packName('pdf')) {
  const enc = new TextEncoder();
  const chunks = [];
  let size = 0;
  const offsets = [];
  const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; put(`${n} 0 obj\n`); body(); put('\nendobj\n'); };

  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  // objects: 1 catalog, 2 page tree, then per picture: page, image, contents
  const pageId = (i) => 3 + i * 3, imgId = (i) => 4 + i * 3, conId = (i) => 5 + i * 3;
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`));
  for (let i = 0; i < n; i++) {
    const j = await jpegOf(pages[i]);
    const W = 842, H = Math.round((W * j.h) / j.w);
    obj(pageId(i), () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${imgId(i)} 0 R >> >> /Contents ${conId(i)} 0 R >>`));
    obj(imgId(i), () => {
      put(`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>\nstream\n`);
      put(j.bytes);
      put('\nendstream');
    });
    const draw = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
    obj(conId(i), () => put(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  }
  const xref = size, count = 3 + n * 3;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let k = 1; k < count; k++) put(`${String(offsets[k]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  save(new Blob(chunks, { type: 'application/pdf' }), name);
}

/** One PowerPoint deck (16:9), a slide per picture, each fitted whole and centred on white. */
export async function savePptx(pages, name = packName('pptx')) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';   // 13.333 × 7.5 in
  deck.title = 'WeFloor screenshots';
  const SW = 13.333, SH = 7.5, M = 0.25;
  for (const p of pages) {
    const j = await jpegOf(p);
    const k = Math.min((SW - 2 * M) / j.w, (SH - 2 * M) / j.h), w = j.w * k, h = j.h * k;
    deck.addSlide().addImage({ data: j.dataUrl, x: (SW - w) / 2, y: (SH - h) / 2, w, h });
  }
  const blob = await deck.write({ outputType: 'blob' });
  save(blob, name);
}
