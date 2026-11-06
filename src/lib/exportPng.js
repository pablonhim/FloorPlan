// Rasterise one of the app's SVG stages to PNG through an HTML5 canvas.
// The stage's styles live in CSS, so the clone carries iso.css plus the current token values.
import isoCss from '../styles/iso.css?raw';

const TOKENS = ['--bg', '--panel', '--edge', '--line', '--detail', '--body', '--deck', '--ink', '--ink-hi', '--live',
  '--glass', '--glass-on', '--recess', '--accent', '--accent-hi', '--accent-dim', '--warn', '--struct-top', '--struct-lit', '--struct-shade', '--struct-glass', '--struct-line', '--struct-cap', '--shadow', '--ao-a', '--furn', '--furn-top', '--furn-side', '--furn-edge', '--font'];

// An SVG drawn as an image cannot load web fonts, so the export embeds the Latin (Host Grotesk,
// Google Sans) and Khmer (Google Sans) font files as data URLs. Fetched once, then cached.
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400;500;600&family=Google+Sans:wght@400;500;600&display=swap';
let fontFaces = null;

async function embeddedFonts() {
  if (fontFaces !== null) return fontFaces;
  try {
    const css = await (await fetch(FONT_CSS)).text();
    const rules = css.split('/* ').slice(1).filter((b) => /^(latin|latin-ext|khmer) \*\//.test(b));
    const toB64 = (buf) => {
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    };
    const out = await Promise.all(rules.map(async (b) => {
      const rule = b.slice(b.indexOf('@font-face'));
      const url = rule.match(/url\((.+?)\)/)?.[1];
      if (!url) return '';
      const buf = await (await fetch(url)).arrayBuffer();
      return rule.replace(url, `data:font/woff2;base64,${toB64(buf)}`);
    }));
    fontFaces = out.join('\n');
  } catch {
    fontFaces = ''; // offline: export with the system fallbacks
  }
  return fontFaces;
}

/**
 * The part of `svg` showing on screen, as a viewBox string: its holder's box (the stage, which clips it) taken
 * back through the svg's screen transform, so a camera move resting as a CSS transform is caught as it shows.
 */
export function shownBox(svg) {
  const ctm = svg.getScreenCTM?.(), r = svg.parentElement.getBoundingClientRect();
  if (!ctm || !(r.width > 1 && r.height > 1)) return svg.dataset.view || svg.getAttribute('viewBox');
  const inv = ctm.inverse(), at = (x, y) => new DOMPoint(x, y).matrixTransform(inv);
  const a = at(r.left, r.top), b = at(r.right, r.bottom);
  return `${a.x.toFixed(2)} ${a.y.toFixed(2)} ${(b.x - a.x).toFixed(2)} ${(b.y - a.y).toFixed(2)}`;
}

/** A floor or unit screenshot's size: 2800 × 2400 px (tightBox frames to its shape). */
export const SHOT_W = 2800, SHOT_H = 2400;

/**
 * A screenshot's frame, tight round its subject: the union of `parts`' drawn boxes (the floor, or the unit with
 * its names) with a small margin, cut down to what is on screen (`shown`, a viewBox string). So the picture
 * follows the drawing's own shape — no wide band of empty sky either side — while the context that falls inside
 * the frame stays. Falls back to `shown` when nothing measurable is there.
 */
export function tightBox(parts, shown, pad = 0.035, aspect = SHOT_W / SHOT_H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of parts) {
    let b;
    try { b = el.getBBox(); } catch { continue; }
    if (!b || !(b.width > 0 && b.height > 0)) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  const [sx, sy, sw, sh] = String(shown).trim().split(/[\s,]+/).map(Number);
  if (!Number.isFinite(x0) || ![sx, sy, sw, sh].every(Number.isFinite)) return shown;
  const m = pad * Math.max(x1 - x0, y1 - y0);
  let ax = Math.max(sx, x0 - m), ay = Math.max(sy, y0 - m), bx = Math.min(sx + sw, x1 + m), by = Math.min(sy + sh, y1 + m);
  // exactly the picture's shape (`aspect`, width / height): the frame grows taller for a wide subject or wider
  // for a tall one (taking in more of the plan round it — past the screen's edges if need be: the drawing goes
  // on there), so every screenshot comes out the same size
  const w = bx - ax, h = by - ay;
  if (w / h > aspect) { const g = w / aspect - h; ay -= g / 2; by += g / 2; }
  else { const g = h * aspect - w; ax -= g / 2; bx += g / 2; }

  if (bx - ax < sw * 0.05 || by - ay < sh * 0.05) return shown;   // (the subject is off screen: the view as it is)
  return `${ax.toFixed(2)} ${ay.toFixed(2)} ${(bx - ax).toFixed(2)} ${(by - ay).toFixed(2)}`;
}

// what a screenshot leaves out: the pointer's and the editor's marks (hover and selection outlines, the piece
// being placed, the camera's pointer shield) and the labels of what is only there for context (the units round
// the one shown, the building core, the ghosted building) — the drawing itself stays as it is on screen
const UI_ONLY = '[data-ui], .cam-shield, .it.ghost, .foot, .cellhint';
const CONTEXT = ':is(.nb, .nbi, .nbc, .core-faded, .faded)';   // the neighbours and faded pieces round a view
const CONTEXT_LABELS = `${CONTEXT} :is(text, .tag, foreignObject)`;

/**
 * What a screenshot can leave out (the preview's Show switches, ShotPreview): each a label and the pieces it
 * covers. A shot reports which of them its view has (`parts`), so the preview offers only those.
 */
export const SHOT_PARTS = [
  { key: 'people', label: 'People', sel: '.desk-callout' },
  { key: 'depts', label: 'Departments', sel: '.tag.team' },
  { key: 'rooms', label: 'Rooms', sel: '.tag:is(.k-meeting, .k-cafe, .k-barista, .k-massage)' },
  { key: 'storage', label: 'Storage', sel: '.tag:is(.k-cabinet, .k-server)' },
  { key: 'notes', label: 'Notes', sel: '.tag:is(.k-note, .k-entrance)' },
  { key: 'units', label: 'Unit titles', sel: '.unit-name, .unit-sub' },
];

/**
 * Rasterises `svg` to a PNG download. `viewBox`: the part to draw (default: the camera's view, data-view).
 * `shot`: a screenshot of the view as it shows — the context round it kept, only the labels that belong to
 * the view (see UI_ONLY, CONTEXT_LABELS); otherwise everything marked data-noexport goes too (a clean plan).
 * `save`: download it (default), or return { blob, url, filename, width, height } for the caller to show.
 */
export async function exportPng(svg, { filename, viewBox, width = 2400, shot = false, save = true, hide = [] }) {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // the view itself, not the overscanned box the camera draws (svgCamera's setBox)
  if (viewBox || svg.dataset.view) clone.setAttribute('viewBox', viewBox || svg.dataset.view);
  if (shot) {
    clone.querySelectorAll(UI_ONLY).forEach((n) => n.remove());
    clone.querySelectorAll(CONTEXT_LABELS).forEach((n) => n.remove());
    // the parts the person switched off in the preview
    for (const p of SHOT_PARTS) if (hide.includes(p.key)) clone.querySelectorAll(p.sel).forEach((n) => n.remove());
    clone.querySelectorAll('.hot, .dock-hot, .tip-hot, .lifted').forEach((n) => n.classList.remove('hot', 'dock-hot', 'tip-hot', 'lifted'));
    clone.classList.remove('cam-moving');
    clone.removeAttribute('data-hot');
  } else clone.querySelectorAll('[data-noexport]').forEach((n) => n.remove());
  clone.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));

  const [vx, vy, vw, vh] = clone.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
  const height = Math.round((width * vh) / vw);
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  clone.setAttribute('data-theme', root.dataset.theme || 'dark');
  clone.setAttribute('data-labels', root.dataset.labels || 'on');
  clone.setAttribute('data-depts', root.dataset.depts || 'on');
  clone.setAttribute('data-blocks', root.dataset.blocks || 'on');
  // inline tokens win over iso.css's :root defaults (which match the <svg> root inside the image)
  clone.setAttribute('style', TOKENS.map((t) => `${t}:${cs.getPropertyValue(t).trim()}`).join(';'));

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = (await embeddedFonts()) + '\n' + isoCss;
  clone.insertBefore(style, clone.firstChild);
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  Object.entries({ x: vx, y: vy, width: vw, height: vh, fill: cs.getPropertyValue('--panel').trim() })
    .forEach(([k, v]) => bg.setAttribute(k, v));
  clone.insertBefore(bg, style.nextSibling);

  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  // save: false — handed back instead of downloaded (the screenshot preview offers the download itself; it
  // revokes the url when it closes)
  // (parts: the switchable parts this view shows at all, labels hidden by a setting or context excluded)
  if (!save) return { blob, url, filename, width, height, parts: SHOT_PARTS.filter((p) => [...svg.querySelectorAll(p.sel)].some((n) => !n.closest(CONTEXT) && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden')).map((p) => p.key) };
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
