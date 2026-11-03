// The desk card: a small frosted card beside the selected desk, to assign it on the spot. The employee's
// profile picture (click it to upload one: cropped square and shrunk to a small JPEG kept on the desk) and
// their name (Enter or leaving the field saves it; Escape puts it back). It follows the desk while the
// camera pans and zooms, and keeps to the side of the desk with room for it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PHOTOS, animalOf } from '../iso/render.js';
import { icon } from './SceneButton.jsx';
import { useT } from '../lib/i18n.js';

const W = 232, GAP = 14, EDGE = 12;
const camera = icon(<><path d="M2.5 5.5h2.2l1-1.5h4.6l1 1.5h2.2v7h-11z" /><circle cx="8" cy="8.8" r="2.2" /></>);

/** The picked image, centre-cropped to a square and shrunk to 128 px, as a JPEG data URL. */
function toPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const S = 128, s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
      x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, S, S);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

export default function DeskCard({ desk, svgRef, stageRef, patch }) {
  const t = useT();
  const card = useRef(null), file = useRef(null), input = useRef(null);
  const [draft, setDraft] = useState(desk.name || '');
  const [err, setErr] = useState('');
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
    try { patch({ photo: await toPhoto(f) }); setErr(''); } catch { setErr(t('That file is not a picture')); }
  };

  return (
    <div ref={card} role="dialog" aria-label={t('Desk {x}', { x: desk.label || '' })} style={{ width: W, visibility: 'hidden' }}
      className="menu-frost pop-in absolute left-0 top-0 z-20 flex flex-col gap-2.5 rounded-xl p-3">
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
    </div>
  );
}
