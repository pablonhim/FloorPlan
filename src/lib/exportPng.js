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

export async function exportPng(svg, { filename, viewBox, width = 2400 }) {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (viewBox) clone.setAttribute('viewBox', viewBox);
  clone.querySelectorAll('[data-noexport]').forEach((n) => n.remove());
  clone.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));

  const [vx, vy, vw, vh] = clone.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
  const height = Math.round((width * vh) / vw);
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  clone.setAttribute('data-theme', root.dataset.theme || 'dark');
  clone.setAttribute('data-labels', root.dataset.labels || 'on');
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
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
