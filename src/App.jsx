import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTheme } from './lib/theme.js';
import { initState, reducer, save, saveLog, floorStats, planId, RENTED, TOTAL_FLOORS, UNITS, PLANS } from './model/floors.js';
import { focusOf } from './model/search.js';
import TowerView from './components/TowerView.jsx';
import Switch, { ICONS } from './components/Switch.jsx';
import MenuIcon from './components/MenuIcon.jsx';
import Credit from './components/Credit.jsx';
import SearchBar from './components/SearchBar.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import ZoomRail from './components/ZoomRail.jsx';
import { DockMenuContext } from './components/DockMenu.jsx';
import { useCameraNav } from './lib/useCameraNav.js';
import { whenIdle } from './lib/keep.js';
import { useOneOpen } from './lib/oneOpen.js';

// the floor and unit pages load as their own chunks (the building page is the first view); both are
// fetched as soon as the browser is idle after the first paint, so opening a floor never waits on them
const loadOverview = () => import('./components/FloorOverview.jsx');
const loadEditor = () => import('./components/FloorEditor.jsx');
const FloorOverview = lazy(loadOverview);
const FloorEditor = lazy(loadEditor);

/**
 * The views stay alive once visited: one per building, per floor and per floor's unit editor (a unit view
 * moves between the units of its floor itself). A view not on screen is hidden with content-visibility, which
 * keeps its finished layout without painting it, so going back to it is near-instant instead of rebuilding
 * thousands of elements; it is inert, and told it is not active (it then leaves keys and the zoom rail alone).
 */
const keyOf = (v) => (v.kind === 'unit' ? `unit-${v.floor}` : v.kind === 'floor' ? `floor-${v.floor}` : 'building');

/** One kept-alive view: shown and fading in when it becomes the active one, hidden but kept otherwise. */
function Layer({ active, plain, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    el.classList.remove('view-enter');
    void el.offsetWidth;   // restart the settle-in animation
    el.classList.add('view-enter');
  }, [active]);
  return (
    // (not `inert`: toggling it restyles every element of the view; hidden content is not hit or painted anyway)
    <div ref={ref} aria-hidden={!active}
      className={`absolute inset-0 flex min-h-0 min-w-0 ${plain ? '' : 'bg-panel'} ${active ? 'z-[1]' : ''}`}
      style={active ? undefined : { contentVisibility: 'hidden' }}>
      {children}
    </div>
  );
}

export default function App() {
  const { theme, setTheme, light, labels, setLabels } = useTheme();
  const [state, dispatch] = useReducer(reducer, null, initState);
  // view changes go through a camera-style zoom (see useCameraNav)
  const { view, go: setView } = useCameraNav({ kind: 'building' });
  // every view visited so far, by key, with the props it last had (the active one gets the current view)
  const alive = useRef(new Map());
  alive.current.set(keyOf(view), view);
  const [savedAt, setSavedAt] = useState(null);
  // once the app is idle after its first paint: fetch the floor and unit pages and build their drawings
  // (both floors' scenes, every unit's surroundings and furniture) a little at a time, so opening a floor or
  // a unit later finds them ready instead of building thousands of elements on the click
  const plansNow = useRef(state.plans);
  plansNow.current = state.plans;
  useEffect(() => {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    idle(() => Promise.all([loadOverview(), loadEditor()]).then(([ov, ed]) => {
      whenIdle([...ov.prewarmFloors(plansNow.current), ...ed.prewarmUnits(plansNow.current)]);
    }).catch(() => {}));
  }, []);
  const [floorsOpen, setFloorsOpen] = useState(false); // floor panel on the building view, collapsed by default
  const [jelly, setJelly] = useState(false);           // menu button wobbles as the panel lands back in it
  const toggleFloors = () => { if (floorsOpen) setJelly(true); setFloorsOpen(!floorsOpen); };
  const towerRef = useRef(null);

  // autosave every committed change to LocalStorage
  useEffect(() => {
    if (save(state.plans)) setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    else setSavedAt(null);
  }, [state.plans]);
  useEffect(() => { saveLog(state.log); }, [state.log]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // one menu or side panel open at a time (lib/oneOpen): the floor list and History count too
  useOneOpen(floorsOpen, () => setFloorsOpen(false));
  useOneOpen(historyOpen, () => setHistoryOpen(false));
  const dockMenu = useMemo(() => ({ openHistory: () => setHistoryOpen(true), labels, setLabels }), [labels, setLabels]);
  // a search result (or an edit in the history): open its page; `focus` (a fresh object every time, so
  // picking the same thing again glides again) is the spot the camera moves onto
  const goTo = (v) => setView(v.focus ? { ...v, focus: { ...v.focus } } : v);
  const openEntry = (e) => {
    const p = PLANS[e.plan];
    if (!p) return;
    const it = e.id && state.plans[e.plan]?.find((i) => i.id === e.id);
    goTo({ kind: 'unit', floor: p.floor, unit: p.unit, ...(it ? { focus: focusOf(it) } : {}) });
  };

  const occupancy = useMemo(
    () => Object.fromEntries(RENTED.map((f) => [f, floorStats(state.plans, f)])),
    [state.plans],
  );
  // Building → Floor (all units) → Unit
  // intro: opened from the building, the floor view glides down into the floor from the whole (ghosted) building
  const openFloor = (floor, intro = false) => setView({ kind: 'floor', floor, intro });
  const openUnit = (floor, unit = UNITS[floor][0]) => setView({ kind: 'unit', floor, unit });

  const floors = Array.from({ length: TOTAL_FLOORS + 1 }, (_, i) => TOTAL_FLOORS - i);   // 10 … 1, then G (0)

  const renderView = (view, active) => (
  view.kind === 'building' ? (
            <div className="relative flex flex-1 min-h-0">
              {/* the floor panel floats over the scene, so the building keeps its place whether it is open or not */}
              <div className="flex flex-1 min-w-0">
                <TowerView active={active} occupancy={occupancy} plans={state.plans} light={light} svgRef={towerRef}
                  onOpen={(f) => openFloor(f, true)} onGuide={(f) => setView({ kind: 'floor', floor: f, guide: true })} />
              </div>
              {/* floor list: a menu button at the bottom right that opens a floating frosted panel above it */}
              <div className="pointer-events-none absolute top-[3.75rem] bottom-3 right-3 z-10 flex w-56 flex-col items-end justify-end gap-2">
              {/* always mounted so it can grow out of / shrink back into the menu button (no fade): it scales
                  from the button's centre, 20px in from its right edge and 28px below it (8px gap + half the
                  40px button); inert while closed */}
              <aside id="floor-panel" inert={!floorsOpen} aria-hidden={!floorsOpen}
                className={`frost-panel frost-edge w-56 min-h-0 origin-[calc(100%-20px)_calc(100%+28px)] rounded-xl p-1 flex flex-col gap-0.5 overflow-auto transition-[scale,visibility] motion-reduce:transition-none ${floorsOpen ? 'pointer-events-auto visible scale-100 duration-[420ms] ease-[cubic-bezier(.34,1.56,.64,1)]' : 'pointer-events-none invisible scale-0 duration-[260ms] ease-[cubic-bezier(.55,0,.75,.2)]'}`}>
                <h3 className="px-2 pt-1 text-[10px] uppercase tracking-[.18em] text-ink">Floors</h3>
                <ul className="flex flex-col gap-px">
                  {floors.map((f) => {
                    const rented = RENTED.includes(f);
                    const o = occupancy[f];
                    return (
                      <li key={f}>
                        <button type="button" disabled={!rented} onClick={() => openFloor(f, true)}
                          className={`w-full flex items-center gap-2 rounded-md px-2 py-0.5 text-left text-[12px] leading-5 ${rented ? 'border border-accent/60 bg-accent-dim text-ink-hi hover:border-accent' : 'border border-transparent text-ink cursor-default'}`}>
                          <span className={`size-1.5 rounded-full ${rented ? 'bg-accent' : 'bg-detail'}`} />
                          <span className="tabular-nums w-8">{f === 0 ? 'G' : `F${String(f).padStart(2, '0')}`}</span>
                          <span className="flex-1">{rented ? `Units ${UNITS[f].join(' · ')}` : f === 0 ? 'Lobby' : 'Vacant'}</span>
                          {rented && <span className="text-[11px] text-accent-hi tabular-nums">{o.assigned}/{o.desks}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="px-2 pb-1 pt-0.5 text-[11px] leading-snug text-ink">
                  Floors 2 and 4 are rented (Units C and D each), laid out from the official layout PDF of 2026-09-29.
                  Lit windows show how many desks have someone assigned.
                </p>
              </aside>
              <button type="button" onClick={toggleFloors} onAnimationEnd={() => setJelly(false)}
                aria-expanded={floorsOpen} aria-controls="floor-panel" aria-label={floorsOpen ? 'Close floor list' : 'Open floor list'}
                title={floorsOpen ? 'Close floor list' : 'Floors'}
                className={`frost-panel pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full text-ink-hi hover:text-accent ${jelly ? 'jelly' : ''}`}>
                <MenuIcon open={floorsOpen} />
              </button>
              </div>
            </div>
          ) : view.kind === 'floor' ? (
            <FloorOverview active={active} floor={view.floor} plans={state.plans} light={light} guide={!!view.guide} focus={view.focus || null} intro={!!view.intro}
              onBack={() => setView({ kind: 'building' })} onFloor={openFloor} onUnit={openUnit} />
          ) : (
            <FloorEditor
              active={active}
              pid={planId(view.floor, view.unit)}
              items={state.plans[planId(view.floor, view.unit)]}
              plans={state.plans}
              dispatch={dispatch}
              light={light}
              savedAt={savedAt}
              focus={view.focus || null}
              onBack={() => openFloor(view.floor)}
              onSwitch={openUnit}
            />
          )
  );

  return (
    // History and the Labels switch live in each view's dock menu (DockMenu)
    <DockMenuContext.Provider value={dockMenu}>
    {/* the building page sits on its own backdrop (a light-gray gradient in the light theme), header included */}
    <div className={`relative h-full flex flex-col ${view.kind === 'building' ? 'backdrop-bld overflow-hidden' : 'bg-panel'}`}>
      {/* the header floats over the drawing (no background, no strip of its own): the drawing runs up to the
          top edge, so zooming never crops it at a line; only its controls take the pointer */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 px-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-[18px] font-semibold leading-none text-ink-hi tracking-wide">Floor Plan</span>
            {/* the page you are on, beside the logo: same size, quieter (none on the building page) */}
            {view.kind !== 'building' && (
              <span className="text-[18px] leading-none tracking-wide text-ink-hi/45" aria-live="polite">
                {view.kind === 'floor' ? `Floor ${view.floor}` : `Floor ${view.floor} · Unit ${view.unit}`}
              </span>
            )}
          </div>
          <Credit />
        </div>
        <span className="flex-1" />
        <div className="pointer-events-auto flex items-center gap-4">
          <Switch checked={theme === 'dark'} onChange={(on) => setTheme(on ? 'dark' : 'light')} label="Dark mode" icon={ICONS.theme} />
        </div>
      </header>

      <main className={`flex flex-1 min-h-0 ${view.kind === 'building' ? '' : 'bg-panel'}`}>
        <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {/* every view visited so far, the current one on top and settling in (see Layer) */}
        {[...alive.current].map(([key, v]) => {
          const on = key === keyOf(view);
          return (
            <Layer key={key} active={on} plain={v.kind === 'building'}>
              <Suspense fallback={<div className="flex-1 bg-panel" />}>{renderView(on ? view : v, on)}</Suspense>
            </Layer>
          );
        })}
        {/* the current view's zoom (wheel, + / −, or a click on the track) */}
        <ZoomRail stage={view.kind} right={view.kind === 'unit' ? '6.75rem' : '3.75rem'} />
        {/* the search box, bottom centre on the docks' line (its results open upward) */}
        <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
          <SearchBar plans={state.plans} onPick={(r) => goTo(r.view)} />
        </div>
        </div>
      </main>
      <div id="history-panel">
        <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} log={state.log}
          onOpenEntry={openEntry} onClear={() => dispatch({ type: 'clearLog' })} />
      </div>
    </div>
    </DockMenuContext.Provider>
  );
}
