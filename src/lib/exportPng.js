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

// what a screenshot leaves out: the pointer's and the editor's marks (hover and selection outlines, the piece
// being placed, the camera's pointer shield) and the labels of what is only there for context (the units round
// the one shown, the building core, the ghosted building) — the drawing itself stays as it is on screen
const UI_ONLY = '[data-ui], .cam-shield, .it.ghost, .foot, .cellhint';
const CONTEXT_LABELS = ':is(.nb, .nbi, .nbc, .core-faded, .faded) :is(text, .tag, foreignObject)';

/**
 * Rasterises `svg` to a PNG download. `viewBox`: the part to draw (default: the camera's view, data-view).
 * `shot`: a screenshot of the view as it shows — the context round it kept, only the labels that belong to
 * the view (see UI_ONLY, CONTEXT_LABELS); otherwise everything marked data-noexport goes too (a clean plan).
 * `save`: download it (default), or return { blob, url, filename, width, height } for the caller to show.
 */
export async function exportPng(svg, { filename, viewBox, width = 2400, shot = false, save = true }) {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // the view itself, not the overscanned box the camera draws (svgCamera's setBox)
  if (viewBox || svg.dataset.view) clone.setAttribute('viewBox', viewBox || svg.dataset.view);
  if (shot) {
    clone.querySelectorAll(UI_ONLY).forEach((n) => n.remove());
    clone.querySelectorAll(CONTEXT_LABELS).forEach((n) => n.remove());
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
  if (!save) return { blob, url, filename, width, height };
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
