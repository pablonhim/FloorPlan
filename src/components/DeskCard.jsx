// The desk card: a small frosted card beside the selected desk, to assign it on the spot. The employee's
// profile picture (click it to upload one, then drag and zoom to frame the face: saved as a small square JPEG
// kept on the desk) and
// their name (Enter or leaving the field saves it; Escape puts it back). It follows the desk while the
// camera pans and zooms, and keeps to the side of the desk with room for it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PHOTOS, animalOf } from '../iso/render.js';
import { icon } from './SceneButton.jsx';
import { useT } from '../lib/i18n.js';

const W = 232, GAP = 14, EDGE = 12;
const camera = icon(<><path d="M2.5 5.5h2.2l1-1.5h4.6l1 1.5h2.2v7h-11z" /><circle cx="8" cy="8.8" r="2.2" /></>);

/** The picked file as a loaded image (its object URL is revoked by the cropper). */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('not an image')); };
    img.src = URL.createObjectURL(file);
  });
}

const V = 208, OUT = 128, ZMAX = 5;   // the crop window (px), the saved picture (px), the closest zoom

/**
 * The crop step after a picture is picked: a square window over the image, which is dragged to place it and
 * zoomed with the slider or the wheel (always covering the window). It starts top-aligned, where the face
 * is in a whole-body shot. Save draws the framed square into a 128 px JPEG.
 */
function Cropper({ img, onSave, onCancel }) {
  const t = useT();
  const nw = img.naturalWidth, nh = img.naturalHeight, base = V / Math.min(nw, nh);
  const clamp = (o, z) => {
    const k = base * z;
    return { x: Math.min(0, Math.max(V - nw * k, o.x)), y: Math.min(0, Math.max(V - nh * k, o.y)) };
  };
  const [z, setZ] = useState(1);
  const [o, setO] = useState(() => clamp({ x: (V - nw * base) / 2, y: 0 }, 1));
  const view = useRef(null), drag = useRef(null), now = useRef({ z, o });
  now.current = { z, o };
  useEffect(() => () => URL.revokeObjectURL(img.src), [img]);
  /** zoom to z2 about the window's centre */
  const zoom = (z2) => {
    const { z: z1, o: o1 } = now.current, c = V / 2;
    z2 = Math.max(1, Math.min(ZMAX, z2));
    setZ(z2);
    setO(clamp({ x: c - (c - o1.x) * (z2 / z1), y: c - (c - o1.y) * (z2 / z1) }, z2));
  };
  useEffect(() => {   // the wheel zooms (a native listener: React's is passive and the page would scroll)
    const el = view.current;
    const onWheel = (e) => { e.preventDefault(); zoom(now.current.z * Math.exp(-e.deltaY * 0.002)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    const k = base * z, c = document.createElement('canvas');
    c.width = c.height = OUT;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, OUT, OUT);
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, -o.x / k, -o.y / k, V / k, V / k, 0, 0, OUT, OUT);
    onSave(c.toDataURL('image/jpeg', 0.88));
  };
  const k = base * z;
  return (
    <div className="flex flex-col gap-2.5" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <span className="text-[12px] font-medium text-ink-hi">{t('Frame the face')}</span>
      <div ref={view} role="img" aria-label={t('Drag to move the picture; the slider or the wheel zooms')}
        className="relative cursor-grab touch-none select-none overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] active:cursor-grabbing"
        style={{ width: V, height: V }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { sx: e.clientX, sy: e.clientY, o }; }}
        onPointerMove={(e) => { const d = drag.current; if (d) setO(clamp({ x: d.o.x + e.clientX - d.sx, y: d.o.y + e.clientY - d.sy }, z)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none"
          style={{ width: nw * k, height: nh * k, transform: `translate(${o.x}px, ${o.y}px)` }} />
        {/* thirds, to help centre the face */}
        <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/70"
          style={{ backgroundImage: 'linear-gradient(to right, transparent 33.2%, rgb(255 255 255 / .45) 33.3%, transparent 33.6%, transparent 66.5%, rgb(255 255 255 / .45) 66.6%, transparent 66.9%), linear-gradient(to bottom, transparent 33.2%, rgb(255 255 255 / .45) 33.3%, transparent 33.6%, transparent 66.5%, rgb(255 255 255 / .45) 66.6%, transparent 66.9%)' }} />
      </div>
      <label className="flex items-center gap-2 text-ink">
        <span className="text-[11px]">{t('Zoom')}</span>
        <input type="range" min={1} max={ZMAX} step={0.01} value={z} onChange={(e) => zoom(Number(e.target.value))}
          aria-label={t('Zoom')} className="min-w-0 flex-1 accent-[var(--accent)]" />
      </label>
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onCancel} className="menu-item rounded-md px-2.5 py-1 text-[12px] text-ink-hi outline-none">{t('Cancel')}</button>
        <button type="button" onClick={save} autoFocus
          className="rounded-md bg-accent px-3 py-1 text-[12px] font-medium text-white outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent/40">{t('Save')}</button>
      </div>
    </div>
  );
}

export default function DeskCard({ desk, svgRef, stageRef, patch }) {
  const t = useT();
  const card = useRef(null), file = useRef(null), input = useRef(null);
  const [draft, setDraft] = useState(desk.name || '');
  const [err, setErr] = useState('');
  const [crop, setCrop] = useState(null);   // a picked picture being framed (Cropper)
  useEffect(() => { setDraft(desk.name || ''); setErr(''); }, [desk.id, desk.name]);

  // beside the desk, every frame while open (the camera moves the drawing with CSS transforms)
  useLayoutEffect(() => {
    let raf = 0;
    const place = () => {
      const el = card.current, stage = stageRef.current, g = svgRef.current?.querySelector(`g[data-id="${CSS.escape(desk.id)}"]`);
      if (el && stage && g) {
        const s = stage.getBoundingClientRect(), r = g.getBoundingClientRect(), h = el.offsetHeight;
        const off = r.right < s.left || r.left > s.right || r.bottom < s.top || r.top > s.bottom;
        let left = r.right - s.left + GAP;
        if (left + W > s.width - EDGE) left = r.left - s.left - GAP - W;   // no room on the right: the left side
        left = Math.max(EDGE, Math.min(s.width - W - EDGE, left));
        const top = Math.max(EDGE + 48, Math.min(s.height - h - EDGE - 56, (r.top + r.bottom) / 2 - s.top - h / 2));
        el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
        el.style.visibility = off ? 'hidden' : 'visible';
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [desk.id, svgRef, stageRef]);

  const name = (desk.name || '').trim();
  const photo = desk.photo || PHOTOS[name];
  const commit = () => { const v = draft.trim(); if (v !== (desk.name || '')) patch({ name: v }); };
  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setCrop(await loadImage(f)); setErr(''); } catch { setErr(t('That file is not a picture')); }
  };

  return (
    <div ref={card} role="dialog" aria-label={t('Desk {x}', { x: desk.label || '' })} style={{ width: W, visibility: 'hidden' }}
      className="menu-frost pop-in absolute left-0 top-0 z-20 flex flex-col gap-2.5 rounded-xl p-3">
      {crop ? <Cropper img={crop} onCancel={() => setCrop(null)} onSave={(p) => { patch({ photo: p }); setCrop(null); }} /> : <>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => file.current.click()} title={t(photo ? 'Change the profile picture' : 'Upload a profile picture')}
          aria-label={t(photo ? 'Change the profile picture' : 'Upload a profile picture')}
          className="group relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {photo ? <img src={photo} alt="" className="size-full object-cover" />
            : name ? <span className="text-[34px] leading-none" style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>{animalOf(name).a}</span>
              : <span className="text-ink">{camera}</span>}
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{camera}</span>
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={upload} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input ref={input} value={draft} placeholder={t('Employee name')} aria-label={t('Employee name')} maxLength={60}
            className="w-full rounded-md border border-[color-mix(in_srgb,var(--ink)_22%,transparent)] bg-white/70 px-2 py-1.5 text-[13px] font-medium text-ink-hi outline-none placeholder:font-normal placeholder:text-ink/70 focus:border-accent"
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commit(); e.currentTarget.blur(); }
              else if (e.key === 'Escape') { setDraft(desk.name || ''); e.currentTarget.blur(); e.stopPropagation(); }
            }} />
          <span className="truncate text-[11px] text-ink">
            {[desk.label && t('Desk {x}', { x: desk.label }), desk.team].filter(Boolean).join(' · ') || t('Unassigned')}
          </span>
        </div>
      </div>
      {err && <span className="text-[11px] text-[#e5484d]">{err}</span>}
      {(desk.photo || name) && (
        <div className="flex gap-1">
          {desk.photo && <button type="button" onClick={() => patch({ photo: '' })}
            className="menu-item rounded-md px-2 py-1 text-[12px] text-ink-hi outline-none">{t('Remove picture')}</button>}
          {name && <button type="button" onClick={() => { setDraft(''); patch({ name: '', team: '' }); }}
            className="menu-item rounded-md px-2 py-1 text-[12px] text-ink-hi outline-none">{t('Unassign seat')}</button>}
        </div>
      )}
      </>}
    </div>
  );
}
