// The screenshot's moment: a quick white flash over the screen as the picture is taken (ShotFlash), then the
// picture itself (ShotPreview) floating over the page like a photo — a thin white frame and a soft shadow, the
// page behind it blurred — with Download and Discard floating inside the photo, at its bottom. Escape or a
// click outside discards it. The picture's blob url is let go when it closes.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';

/** A white flash over the whole screen; `n` changes on every shot (each one flashes again). */
export function ShotFlash({ n }) {
  if (!n) return null;
  return createPortal(<div key={n} className="shot-flash pointer-events-none fixed inset-0 z-[90]" aria-hidden="true" />, document.body);
}

/** shot: { url, filename, width, height } from exportPng(…, { save: false }); onClose() after either choice. */
export default function ShotPreview({ shot, onClose }) {
  const t = useT();
  const dl = useRef(null);
  useEffect(() => {
    dl.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  useEffect(() => () => URL.revokeObjectURL(shot.url), [shot.url]);
  const download = () => {
    const a = document.createElement('a');
    a.href = shot.url;
    a.download = shot.filename;
    a.click();
    // the url is revoked when the preview unmounts, after the click has started the download
    setTimeout(onClose, 0);
  };
  return createPortal(
    <div className="shot-backdrop fixed inset-0 z-[80] grid place-items-center p-10" role="dialog" aria-modal="true" aria-label={t('Screenshot')}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <figure className="shot-photo relative m-0 rounded-[6px] bg-white p-[6px]">
        <img src={shot.url} alt={t('Screenshot')} className="block max-h-[78vh] max-w-[82vw] rounded-[3px] object-contain"
          style={{ aspectRatio: `${shot.width} / ${shot.height}` }} />
        {/* the choices, floating inside the photo at its bottom */}
        <figcaption className="absolute inset-x-0 bottom-5 flex justify-center gap-2">
          <button type="button" onClick={onClose}
            className="shot-btn frost-panel frost-edge rounded-full px-4 py-1.5 text-[12.5px] font-medium text-ink-hi">
            {t('Discard')}
          </button>
          <button ref={dl} type="button" onClick={download}
            className="shot-btn rounded-full bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-lg">
            {t('Download')}
          </button>
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}
