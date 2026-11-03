// @ts-nocheck
import { useRef, useState } from 'react';
import { store, useStore } from '../game/store.js';

const world = () => (window as any).nf?.world;
export const IS_TOUCH = typeof window !== 'undefined' && (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window);

const prevent = (e: any) => { e.preventDefault(); e.stopPropagation(); };

function Round({ label, sub, size = 64, onDown, onUp, tone = 'bg-slate-900/60', className = '' }: any) {
  const [down, setDown] = useState(false);
  return (
    <div role="button" className={`pe select-none touch-none flex flex-col items-center justify-center rounded-full border border-white/35 text-white backdrop-blur ${down ? 'bg-amber-300/80 text-slate-900' : tone} ${className}`}
      style={{ width: size, height: size }}
      onPointerDown={(e) => { prevent(e); (e.currentTarget as any).setPointerCapture(e.pointerId); setDown(true); onDown && onDown(); }}
      onPointerUp={(e) => { prevent(e); setDown(false); onUp && onUp(); }} onPointerCancel={() => { setDown(false); onUp && onUp(); }}>
      <span className="text-[13px] font-bold leading-none">{label}</span>{sub && <span className="mt-0.5 text-[9px] leading-none opacity-80">{sub}</span>}
    </div>
  );
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null); const [k, setK] = useState({ x: 0, y: 0 }); const id = useRef(-1);
  const upd = (e: any) => {
    const r = base.current!.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy), m = Math.min(1, l / R); if (l > 0) { dx = dx / l * m * R; dy = dy / l * m * R; }
    setK({ x: dx, y: dy }); const dz = m < .14 ? 0 : (m - .14) / .86; const w = world(); w && w.setTouchMove(l ? -dy / l * dz : 0, l ? dx / l * dz : 0, m > .97);
  };
  const end = () => { id.current = -1; setK({ x: 0, y: 0 }); world()?.setTouchMove(0, 0, false); };
  return (
    <div ref={base} className="pe touch-none select-none relative h-[126px] w-[126px] rounded-full border border-white/30 bg-slate-950/45 backdrop-blur"
      onPointerDown={(e) => { prevent(e); id.current = e.pointerId; (e.currentTarget as any).setPointerCapture(e.pointerId); upd(e); }}
      onPointerMove={(e) => { if (id.current === e.pointerId) upd(e); }} onPointerUp={end} onPointerCancel={end}>
      <div className="absolute left-1/2 top-1/2 h-[54px] w-[54px] rounded-full border border-white/50 bg-white/25 shadow-lg" style={{ transform: `translate(calc(-50% + ${k.x}px), calc(-50% + ${k.y}px))` }} />
      <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[9px] text-white/60">WALK</span>
    </div>
  );
}

function LookZone() {
  const last = useRef<any>(null);
  return <div className="pe touch-none fixed right-0 top-0 z-[5] h-[70%] w-[62%]" onPointerDown={(e) => { last.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; (e.currentTarget as any).setPointerCapture(e.pointerId); }}
    onPointerMove={(e) => { const l = last.current; if (!l || l.id !== e.pointerId) return; world()?.lookBy(e.clientX - l.x, e.clientY - l.y); l.x = e.clientX; l.y = e.clientY; }}
    onPointerUp={() => { last.current = null; }} onPointerCancel={() => { last.current = null; }} />;
}

/* throttle lever for the wheel: lower 20 % reverse, 20-30 % neutral, rest ahead */
function Lever() {
  const s = useStore(); const el = useRef<HTMLDivElement>(null); const dragging = useRef(false);
  const set = (e: any) => { const r = el.current!.getBoundingClientRect(), f = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); (window as any).sea.setLever(f < .2 ? -3 * (1 - f / .2) : f < .3 ? 0 : 8 * (f - .3) / .7); };
  const p = s.boatPower || 0, fill = p < -.01 ? .2 + p / 3 * .2 : p > .01 ? .3 + p / 8 * .7 : .25;
  return (
    <div ref={el} className="pe touch-none select-none relative h-[150px] w-[62px] rounded-2xl border border-white/30 bg-slate-950/50 backdrop-blur"
      onPointerDown={(e) => { prevent(e); dragging.current = true; (e.currentTarget as any).setPointerCapture(e.pointerId); set(e); }} onPointerMove={(e) => { if (dragging.current) set(e); }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}>
      <div className="absolute bottom-1.5 left-1.5 right-1.5 rounded-xl bg-sky-300/55" style={{ height: `calc(${fill * 100}% - 12px)` }} />
      <div className="absolute left-0 right-0 border-y border-dashed border-white/40" style={{ bottom: '20%', height: '10%' }} />
      <span className="pointer-events-none absolute left-0 right-0 top-1 text-center font-mono text-[10px]">THROTTLE</span>
    </div>
  );
}

function Steer() {
  const hold = (k: string, on: boolean) => { const S = (window as any).sea; on ? S.keys.add(k) : S.keys.delete(k); };
  return (
    <div className="flex gap-2.5">
      <Round label="◀" size={68} onDown={() => hold('left', true)} onUp={() => hold('left', false)} />
      <Round label="▶" size={68} onDown={() => hold('right', true)} onUp={() => hold('right', false)} />
    </div>
  );
}

export function TouchControls() {
  const s = useStore(); if (!IS_TOUCH || s.workshop || s.game || s.result) return null;
  const w = world(); if (!w) return null; const m = s.method, rigOut = !!s.rig;
  const primary = m === 'cast' ? 'THROW' : m === 'trawl' ? (rigOut ? 'HAUL' : 'SHOOT') : m === 'seine' ? (rigOut ? 'CLOSE' : 'SET') : (rigOut ? 'FINISH' : 'LAY');
  const bottom = 'calc(14px + env(safe-area-inset-bottom,0px))';
  return (
    <>
      {s.walking && <LookZone />}
      <div className="fixed left-3 z-10 flex items-end gap-3" style={{ bottom }}>{s.walking ? <Joystick /> : <Lever />}</div>
      <div className="fixed right-3 z-10 flex flex-col items-end gap-2" style={{ bottom }}>
        <div className="flex items-end gap-2">
          <Round label={s.walking ? 'WHEEL' : 'STAND'} sub={s.walking ? 'sit' : 'walk'} size={54} onDown={() => w.goDeck()} />
          {!(m === 'trawl' && rigOut) && <Round label="HAUL" size={56} tone="bg-emerald-600/70" onDown={() => w.haul()} />}
          {m === 'cast' ? <Round label={primary} sub="hold + release" size={84} tone="bg-sky-600/75" onDown={() => w.beginCharge()} onUp={() => w.release()} />
            : <Round label={primary} size={84} tone="bg-sky-600/75" onDown={() => (m === 'trawl' && rigOut ? w.haul() : w.beginCharge())} />}
        </div>
        {!s.walking && <Steer />}
      </div>
    </>
  );
}
