import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTheme } from './lib/theme.js';
import { exportPng } from './lib/exportPng.js';
import { initState, reducer, save, floorStats, planId, RENTED, TOTAL_FLOORS, UNITS } from './model/floors.js';
import TowerView from './components/TowerView.jsx';
import FloorEditor from './components/FloorEditor.jsx';
import FloorOverview from './components/FloorOverview.jsx';
import Switch, { ICONS } from './components/Switch.jsx';
import MenuIcon from './components/MenuIcon.jsx';
import { useCameraNav } from './lib/useCameraNav.js';

export default function App() {
  const { theme, setTheme, light, labels, setLabels } = useTheme();
  const [state, dispatch] = useReducer(reducer, null, initState);
  // view changes go through a camera-style zoom (see useCameraNav)
  const { view, go: setView, stageRef, layers, bindLayer } = useCameraNav({ kind: 'building' });
  const [savedAt, setSavedAt] = useState(null);
  const [floorsOpen, setFloorsOpen] = useState(false); // floor panel on the building view, collapsed by default
  const [jelly, setJelly] = useState(false);           // menu button wobbles as the panel lands back in it
  const toggleFloors = () => { if (floorsOpen) setJelly(true); setFloorsOpen(!floorsOpen); };
  const towerRef = useRef(null);

  // autosave every committed change to LocalStorage
  useEffect(() => {
    if (save(state.plans)) setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    else setSavedAt(null);
  }, [state.plans]);

  const occupancy = useMemo(
    () => Object.fromEntries(RENTED.map((f) => [f, floorStats(state.plans, f)])),
    [state.plans],
  );
  // Building → Floor (all units) → Unit
  const openFloor = (floor) => setView({ kind: 'floor', floor });
  const openUnit = (floor, unit = UNITS[floor][0]) => setView({ kind: 'unit', floor, unit });

  const floors = Array.from({ length: TOTAL_FLOORS }, (_, i) => TOTAL_FLOORS - i);

  const renderView = (view) => (
  view.kind === 'building' ? (
            <div className="relative flex flex-1 min-h-0">
              {/* the floor panel floats over the scene, so the building keeps its place whether it is open or not */}
              <div className="flex flex-1 min-w-0">
                <TowerView occupancy={occupancy} plans={state.plans} light={light} svgRef={towerRef}
                  onOpen={(f) => openFloor(f)} onGuide={(f) => setView({ kind: 'floor', floor: f, guide: true })} />
              </div>
              {/* floor list: a menu button at the bottom right that opens a floating frosted panel above it */}
              <div className="pointer-events-none absolute inset-y-3 right-3 z-10 flex w-64 flex-col items-end justify-end gap-2">
              {/* always mounted so it can grow out of / shrink back into the menu button (no fade): it scales
                  from the button's centre, 20px in from its right edge and 28px below it (8px gap + half the
                  40px button); inert while closed */}
              <aside id="floor-panel" inert={!floorsOpen} aria-hidden={!floorsOpen}
                className={`frost-panel frost-edge w-64 min-h-0 origin-[calc(100%-20px)_calc(100%+28px)] rounded-2xl p-3 flex flex-col gap-2 overflow-auto transition-[scale,visibility] motion-reduce:transition-none ${floorsOpen ? 'pointer-events-auto visible scale-100 duration-[420ms] ease-[cubic-bezier(.34,1.56,.64,1)]' : 'pointer-events-none invisible scale-0 duration-[260ms] ease-[cubic-bezier(.55,0,.75,.2)]'}`}>
                <h3 className="text-[10px] uppercase tracking-[.18em] text-ink">Floors</h3>
                <ul className="flex flex-col gap-0.5">
                  {floors.map((f) => {
                    const rented = RENTED.includes(f);
                    const o = occupancy[f];
                    return (
                      <li key={f}>
                        <button type="button" disabled={!rented} onClick={() => openFloor(f)}
                          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${rented ? 'border border-accent/60 bg-accent-dim text-ink-hi hover:border-accent' : 'border border-transparent text-ink cursor-default'}`}>
                          <span className={`size-1.5 rounded-full ${rented ? 'bg-accent' : 'bg-detail'}`} />
                          <span className="tabular-nums w-8">F{String(f).padStart(2, '0')}</span>
                          <span className="flex-1">{rented ? `Units ${UNITS[f].join(' · ')}` : f === 1 ? 'Lobby' : 'Vacant'}</span>
                          {rented && <span className="text-[11px] text-accent-hi tabular-nums">{o.assigned}/{o.desks}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] leading-relaxed text-ink">
                  Floors 2 and 4 are rented (Units C and D each), laid out from the official layout PDF of 2026-09-29.
                  Lit windows show how many desks have someone assigned.
                </p>
                <button type="button"
                  onClick={() => exportPng(towerRef.current, { filename: 'tela-office-building.png' }).catch(() => {})}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-edge bg-panel px-3 py-1.5 text-[12px] text-ink-hi hover:border-accent hover:text-accent">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />
                  </svg>
                  Export tower PNG
                </button>
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
            <FloorOverview floor={view.floor} plans={state.plans} light={light} guide={!!view.guide}
              onBack={() => setView({ kind: 'building' })} onFloor={openFloor} onUnit={openUnit} />
          ) : (
            <FloorEditor
              pid={planId(view.floor, view.unit)}
              items={state.plans[planId(view.floor, view.unit)]}
              dispatch={dispatch}
              light={light}
              savedAt={savedAt}
              onBack={() => openFloor(view.floor)}
              onSwitch={openUnit}
              onFloor={openFloor}
            />
          )
  );

  return (
    <div className={`h-full flex flex-col bg-panel ${view.kind === 'building' ? 'overflow-hidden' : ''}`}>
      <header className="flex items-center gap-3 px-4 py-2.5">
        <span className="text-[18px] leading-none text-ink-hi tracking-wide"><span className="font-semibold">KOSIGN</span> Floor Plan</span>
        <nav className="text-[12px] text-ink flex items-center gap-1.5" aria-label="Breadcrumb">
          <span>/</span>
          <button type="button" className={view.kind === 'building' ? 'text-ink-hi' : 'hover:text-ink-hi'} onClick={() => setView({ kind: 'building' })}>Building</button>
          {view.kind !== 'building' && (<><span>/</span>
            <button type="button" className={view.kind === 'floor' ? 'text-ink-hi' : 'hover:text-ink-hi'} onClick={() => openFloor(view.floor)}>Floor {view.floor}</button></>)}
          {view.kind === 'unit' && (<><span>/</span><span className="text-ink-hi">Unit {view.unit}</span></>)}
        </nav>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Switch checked={labels} onChange={setLabels} label="Labels" icon={ICONS.labels}
            title="Labels: show or hide all text in the drawing (room, team and employee names, signs, ground markings)" />
          <Switch checked={theme === 'dark'} onChange={(on) => setTheme(on ? 'dark' : 'light')} label="Dark mode" icon={ICONS.theme} />
        </div>
      </header>

      <main className="flex flex-1 min-h-0 bg-panel">
        <div ref={stageRef} className={`relative flex flex-1 min-h-0 min-w-0 ${layers.length > 1 ? 'overflow-hidden' : ''}`}>
        {/* the current view; it remounts on every switch and settles in (see useCameraNav) */}
        {layers.map((L) => (
          <div key={L.key} ref={bindLayer(L.key)} style={L.style}
            className="view-enter flex flex-1 min-h-0 min-w-0 bg-panel">
            {renderView(L.view)}
          </div>
        ))}
        </div>
      </main>
    </div>
  );
}
