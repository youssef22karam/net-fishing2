// @ts-nocheck
import { useEffect, useRef } from 'react';
import { store, useStore } from '../game/store.js';
import { SPECIES } from '../game/config.js';

const world = () => (window as any).nf?.world;
const BINS = 28, MAXD = 14;

/* Scrolling echogram, like a real fish finder: what is under the boat right now on the right, 40 s of history to the left.
   Warm colours = dense fish. White line = where the trawl is, amber dashed = where the winch is heading. Tap the screen to send the trawl to that depth. */
export function FishFinder({ small }: { small: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const s = useStore();
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!; let raf = 0;
    const W = cv.width, H = cv.height, padL = 26, plotW = W - padL, ppb = H / BINS;
    const ramp = (v: number) => { // echo colour ramp
      const stops = [[0, [4, 24, 48]], [.18, [20, 70, 150]], [.4, [30, 170, 130]], [.65, [230, 220, 60]], [.85, [250, 140, 40]], [1, [250, 60, 50]]];
      for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]); return a[1].map((c, k) => Math.round(c + (b[1][k] - c) * t)); }
      return stops[stops.length - 1][1];
    };
    const draw = () => {
      raf = requestAnimationFrame(draw); const w = world(); if (!w) return; const SB = w.sonar, cols = SB.cols, n = cols.length;
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b3d63'); g.addColorStop(1, '#030d1a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const cw = plotW / 150;
      for (let i = 0; i < n; i++) { const c = cols[i], x = padL + plotW - (n - i) * cw;
        for (let b = 0; b < BINS; b++) { const d = c.d[b]; if (d <= 0) continue; const v = Math.min(1, .25 + d / 7 + c.z[b] * .35), [r, gg, bb] = ramp(v); ctx.fillStyle = `rgba(${r},${gg},${bb},${.55 + .4 * v})`; ctx.fillRect(x, b * ppb, cw + .6, ppb + .4); } }
      // depth grid
      ctx.font = '9px ui-monospace,monospace'; ctx.textAlign = 'right'; for (let d = 0; d <= MAXD; d += 2) { const y = d / MAXD * H; ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(padL, y, plotW, 1); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(d + 'm', padL - 3, Math.min(H - 2, y + 9)); }
      // seabed
      const bot = Math.min(MAXD, SB.bottom || 14); if (bot < MAXD) { ctx.fillStyle = '#6b5a3a'; ctx.fillRect(padL, bot / MAXD * H, plotW, H); }
      // trawl path (history) + target
      if (n) {
        ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
        for (let i = 0; i < n; i++) { const c = cols[i]; if (c.rig < 0) { started = false; continue; } const x = padL + plotW - (n - i) * cw + cw / 2, y = c.rig / MAXD * H; if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); } ctx.stroke();
        const last = cols[n - 1]; if (last.rig >= 0) {
          const ty = last.tgt / MAXD * H, ry = last.rig / MAXD * H; ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ffc94a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(padL, ty); ctx.lineTo(W, ty); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(W - 1, ry); ctx.lineTo(W - 10, ry - 5); ctx.lineTo(W - 10, ry + 5); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.18)'; const hh = (w.rig ? (w.rig.H || 3) : 3) / MAXD * H; ctx.fillRect(padL, ry - hh / 2, plotW, hh);   // net mouth height
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.strokeRect(padL + .5, .5, plotW - 1, H - 1);
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, []);
  const w = world(); const ahead = w?.sonar?.ahead, tr = s.trawl, rigOut = !!s.rig && s.rig.type === 'trawl';
  const tap = (e: any) => { const w = world(); if (!w || !w.rig || w.rig.hauling) return; const r = ref.current!.getBoundingClientRect(); const d = (e.clientY - r.top) / r.height * MAXD; w.rig.auto = false; w.rig.setDepth(d); store.set({ trawl: { depth: w.rig.tgt, auto: false } }); };
  if (!s.finder) return null;
  return (
    <div className={`pe fixed z-20 rounded-2xl border border-white/20 bg-slate-950/60 p-2 text-white backdrop-blur ${small ? 'right-2 top-9 w-[214px]' : 'left-3 bottom-3 w-[322px]'}`} data-testid="finder">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold tracking-wide text-sky-200/90">
        <span className="whitespace-nowrap">{small ? 'SONAR' : 'FISH FINDER'}</span>
        <span className="whitespace-nowrap font-mono font-normal text-sky-100/70">{rigOut && tr ? `trawl ${(w?.rig?.depth ?? 0).toFixed(1)} m → ${tr.depth.toFixed(0)} m` : 'under the boat'}</span>
      </div>
      <canvas ref={ref} width={300} height={small ? 90 : 150} onPointerDown={tap} className="w-full rounded-lg border border-white/10 touch-none" style={{ aspectRatio: small ? '300/90' : '300/150' }} />
      <div className="mt-1 min-h-[14px] text-[10.5px] leading-tight text-amber-200">
        {ahead ? <>▶ {SPECIES[ahead.sp].name} school {ahead.dist} m ahead · <b>{ahead.depth.toFixed(1)} m</b> deep · ~{ahead.n} fish</> : <span className="text-sky-200/60">No school on the course ahead</span>}
      </div>
      {s.method === 'trawl' && (
        <div className="mt-1.5 flex items-center gap-1">
          {rigOut && !w?.rig?.hauling ? (
            <>
              <button className="pe h-8 w-8 shrink-0 rounded-full border border-white/30 bg-white/10 text-lg leading-none active:bg-white/30" onClick={() => w.trawlDepth(-1)} aria-label="shallower">−</button>
              <div className="flex-1 whitespace-nowrap text-center font-mono text-[12px]">{tr ? tr.depth.toFixed(0) : '–'} m</div>
              <button className="pe h-8 w-8 shrink-0 rounded-full border border-white/30 bg-white/10 text-lg leading-none active:bg-white/30" onClick={() => w.trawlDepth(1)} aria-label="deeper">+</button>
              <button className={`pe ml-0.5 h-8 shrink-0 whitespace-nowrap rounded-full border px-2 text-[10.5px] font-medium ${tr?.auto ? 'border-amber-100 bg-amber-300/90 text-slate-900' : 'border-white/30 bg-white/10'}`} onClick={() => w.trawlAuto()}>{small ? 'Follow' : 'Follow school'}</button>
              <button className="pe h-8 shrink-0 rounded-full border border-white/30 bg-emerald-500/80 px-2 text-[10.5px] font-semibold" onClick={() => w.haul()}>Haul</button>
            </>
          ) : rigOut ? <div className="w-full text-center text-[11px] text-sky-100/80">Hauling the trawl back…</div>
            : <button className="pe h-8 w-full rounded-full border border-amber-100 bg-amber-300/90 text-[12px] font-semibold text-slate-900" onClick={() => w.beginCharge()}>Shoot the trawl (F)</button>}
        </div>
      )}
      {rigOut && <div className="mt-1 text-[9.5px] text-sky-200/60">Q / E or tap the screen to set the depth · X follows the school</div>}
    </div>
  );
}
