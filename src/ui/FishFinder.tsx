// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../game/store.js';
import { SPECIES } from '../game/config.js';

const world = () => (window as any).nf?.world;
const BINS = 28, MAXD = 14, SW = 44, RANGE = 300;
const COLS = ['#ffd24a', '#5ee6c4', '#c79bff', '#ff8f6b'];
const depthCol = (d: number) => { const t = Math.min(1, d / MAXD), a = [255, 210, 74], b = [58, 160, 255]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; };

/* Scrolling echogram, like a real fish finder: what is under the boat right now, 40 s of history to the left, and on the right an AHEAD strip with the depth band of every
   detected school (numbered) next to the NET's own depth band, so the net can be matched to the fish (Q / E).  Below: a plan view (boat, net, schools by distance and bearing)
   and a list: distance, bearing, depth band, and the net-vs-school depth gap.  Warm echoes = dense fish.  Tap the echogram to send the trawl to that depth. */
export function FishFinder({ small }: { small: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null), plan = useRef<HTMLCanvasElement>(null);
  const s = useStore(), [, force] = useState(0);
  useEffect(() => { const i = setInterval(() => force((n) => n + 1), 350); return () => clearInterval(i); }, []);
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!; let raf = 0;
    const W = cv.width, H = cv.height, padL = 26, plotW = W - padL - SW, ppb = H / BINS;
    const ramp = (v: number) => { const stops = [[0, [4, 24, 48]], [.18, [20, 70, 150]], [.4, [30, 170, 130]], [.65, [230, 220, 60]], [.85, [250, 140, 40]], [1, [250, 60, 50]]];
      for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]); return a[1].map((c, k) => Math.round(c + (b[1][k] - c) * t)); } return stops[stops.length - 1][1]; };
    const draw = () => {
      raf = requestAnimationFrame(draw); const w = world(); if (!w) return; const SB = w.sonar, cols = SB.cols, n = cols.length;
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b3d63'); g.addColorStop(1, '#030d1a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const cw = plotW / 150;
      for (let i = 0; i < n; i++) { const c = cols[i], x = padL + plotW - (n - i) * cw;
        for (let b = 0; b < BINS; b++) { const d = c.d[b]; if (d <= 0) continue; const v = Math.min(1, .25 + d / 7 + c.z[b] * .35), [r, gg, bb] = ramp(v); ctx.fillStyle = `rgba(${r},${gg},${bb},${.55 + .4 * v})`; ctx.fillRect(x, b * ppb, cw + .6, ppb + .4); } }
      ctx.font = '9px ui-monospace,monospace'; ctx.textAlign = 'right'; for (let d = 0; d <= MAXD; d += 2) { const y = d / MAXD * H; ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(padL, y, plotW + SW, 1); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(d + 'm', padL - 3, Math.min(H - 2, y + 9)); }
      const bot = Math.min(MAXD, SB.bottom || 14); if (bot < MAXD) { ctx.fillStyle = '#6b5a3a'; ctx.fillRect(padL, bot / MAXD * H, plotW + SW, H); }
      // trawl path (history) + target
      if (n) {
        ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
        for (let i = 0; i < n; i++) { const c = cols[i]; if (c.rig < 0) { started = false; continue; } const x = padL + plotW - (n - i) * cw + cw / 2, y = c.rig / MAXD * H; if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); } ctx.stroke();
        const last = cols[n - 1]; if (last.rig >= 0) { const ty = last.tgt / MAXD * H; ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ffc94a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(padL, ty); ctx.lineTo(W, ty); ctx.stroke(); ctx.setLineDash([]); }
      }
      // AHEAD strip: the depth band of each detected school (numbered) and the net's own band
      const sx = W - SW; ctx.fillStyle = 'rgba(2,12,24,.55)'; ctx.fillRect(sx, 0, SW, H); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.moveTo(sx + .5, 0); ctx.lineTo(sx + .5, H); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '8px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('AHEAD', sx + SW / 2, 9);
      const list = (SB.contacts || []).filter((k: any) => k.ahead).slice(0, 3), bw = (SW - 6) / 3;
      list.forEach((k: any, i: number) => { const y0 = Math.max(0, k.top - .15) / MAXD * H, y1 = Math.min(MAXD, k.bot + .15) / MAXD * H, x = sx + 3 + i * bw; ctx.fillStyle = COLS[i]; ctx.globalAlpha = .6; ctx.fillRect(x, y0, bw - 2, Math.max(3, y1 - y0)); ctx.globalAlpha = 1; ctx.fillStyle = '#04121f'; ctx.font = '700 9px ui-monospace,monospace'; ctx.fillText(String(i + 1), x + (bw - 2) / 2, Math.max(10, y0 + 9)); });
      const net = SB.net; if (net) { const y0 = Math.max(0, net.depth - net.H / 2) / MAXD * H, y1 = (net.depth + net.H / 2) / MAXD * H; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(sx + 1.5, y0, SW - 3, Math.max(3, y1 - y0)); ctx.fillStyle = '#fff'; ctx.beginPath(); const ry = net.depth / MAXD * H; ctx.moveTo(sx - 1, ry); ctx.lineTo(sx - 9, ry - 5); ctx.lineTo(sx - 9, ry + 5); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.strokeRect(padL + .5, .5, plotW + SW - 1, H - 1);
      // plan view
      const pc = plan.current; if (pc) { const p = pc.getContext('2d')!, PW = pc.width, PH = pc.height, bx = PW / 2, by = PH - 14, k = (PH - 22) / RANGE; p.clearRect(0, 0, PW, PH); p.fillStyle = 'rgba(4,22,40,.9)'; p.fillRect(0, 0, PW, PH);
        p.strokeStyle = 'rgba(160,220,255,.22)'; p.lineWidth = 1; p.fillStyle = 'rgba(190,230,255,.5)'; p.font = '8px ui-monospace,monospace'; p.textAlign = 'left'; for (const r of [100, 200, 300]) { p.beginPath(); p.arc(bx, by, r * k, Math.PI * 1.08, Math.PI * 1.92); p.stroke(); p.fillText(String(r), bx + 2, by - r * k + 8); }
        p.beginPath(); p.moveTo(bx, by); p.lineTo(bx, 4); p.stroke();
        const SBc = w.sonar, nt = w.rig && !w.rig.dead ? w.rig : null; const h = w.boat.heading, fx = -Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
        const toPlan = (wx: number, wz: number) => { const dx = wx - w.boat.position.x, dz = wz - w.boat.position.z; return [bx + (dx * rx + dz * rz) * k, by - (dx * fx + dz * fz) * k]; };
        if (w.gill && w.gill.length) {
          p.strokeStyle = '#ffcc22'; p.lineWidth = 1.5;
          for (const g of w.gill) { if (!g.pts.length) continue; p.beginPath(); g.pts.forEach((pt: any, idx: number) => { const [px, py] = toPlan(pt.x, pt.z); idx ? p.lineTo(px, py) : p.moveTo(px, py); }); p.stroke(); const [b0x, b0y] = toPlan(g.pts[0].x, g.pts[0].z); p.fillStyle = '#ffcc22'; p.fillRect(b0x - 2, b0y - 2, 4, 4); }
        }
        if (w.wall && w.wall.pts.length) {
          p.strokeStyle = '#ff6a1a'; p.lineWidth = 1.5; p.beginPath();
          w.wall.pts.forEach((pt: any, idx: number) => { const [px, py] = toPlan(pt.x, pt.z); idx ? p.lineTo(px, py) : p.moveTo(px, py); }); p.stroke();
          const [b0x, b0y] = toPlan(w.wall.pts[0].x, w.wall.pts[0].z); p.fillStyle = '#ff6a1a'; p.beginPath(); p.arc(b0x, b0y, 2.5, 0, 7); p.fill();
        }
        if (nt) { const dx = nt.m.x - w.boat.position.x, dz = nt.m.z - w.boat.position.z, ax = dx * fx + dz * fz, lt = dx * rx + dz * rz; p.strokeStyle = 'rgba(255,255,255,.6)'; p.beginPath(); p.moveTo(bx, by); p.lineTo(bx + lt * k, by - ax * k); p.stroke(); p.fillStyle = '#fff'; p.fillRect(bx + lt * k - 3, by - ax * k - 2, 6, 4); }
        (SBc.contacts || []).forEach((c: any, i: number) => { const x = bx + c.lat * k, y = by - c.ax * k; if (x < 2 || x > PW - 2 || y < 2 || y > PH - 2) return; const r = Math.max(3, Math.min(8, 2 + Math.sqrt(c.n) * .45)); p.globalAlpha = c.ahead ? 1 : .45; p.fillStyle = depthCol(c.mean); p.beginPath(); p.arc(x, y, r, 0, 7); p.fill(); p.strokeStyle = c.ahead && i < 3 ? COLS[i] : 'rgba(255,255,255,.4)'; p.lineWidth = 1.6; p.stroke(); p.globalAlpha = 1; if (c.ahead && i < 3) { p.fillStyle = '#04121f'; p.font = '700 8px ui-monospace,monospace'; p.textAlign = 'center'; p.fillText(String(i + 1), x, y + 3); } });
        p.fillStyle = '#fff'; p.beginPath(); p.moveTo(bx, by - 6); p.lineTo(bx - 4, by + 4); p.lineTo(bx + 4, by + 4); p.fill(); }
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, []);
  const w = world(), SB = w?.sonar, contacts: any[] = SB?.contacts || [], ahead = contacts.filter((k) => k.ahead), tr = s.trawl, rigOut = !!s.rig && s.rig.type === 'trawl', net = SB?.net;
  const tap = (e: any) => { const w = world(); if (!w || !w.rig || w.rig.hauling) return; const r = ref.current!.getBoundingClientRect(); const d = (e.clientY - r.top) / r.height * MAXD; w.rig.auto = false; w.rig.setDepth(d); store.set({ trawl: { ...store.get().trawl, depth: w.rig.tgt, auto: false } }); };
  if (!s.finder) return null;
  const side = (k: any) => (Math.abs(k.brg) < 4 ? 'dead ahead' : `${Math.abs(k.brg).toFixed(0)}° ${k.brg > 0 ? 'stbd' : 'port'}`);
  const where = (k: any) => (k.overNet ? 'over the net' : k.ax < -k.rad ? `${Math.round(k.dist)} m astern` : `${Math.round(k.dist)} m · ${side(k)}`);
  const match = (k: any) => { if (!net || k.netGap === null) return null; const half = (k.bot - k.top) / 2 + net.H / 2 + .2, gap = net.depth - k.mean; if (Math.abs(gap) <= half) return { ok: true, t: `net ${net.depth.toFixed(1)} m ✓ on the school` }; return { ok: false, t: `net ${net.depth.toFixed(1)} m — ${gap > 0 ? 'too deep, press E' : 'too shallow, press Q'} (${Math.abs(gap).toFixed(1)} m)` }; };
  const meshTxt = (k: any) => (k.ret === null ? null : k.ret > .6 ? ['mesh holds', 'text-emerald-300'] : k.ret > .25 ? ['mesh holds some', 'text-amber-300'] : ['slips through mesh', 'text-rose-300']);
  return (
    <div className={`pe fixed z-20 rounded-2xl border border-white/20 bg-slate-950/60 p-2 text-white backdrop-blur ${small ? 'right-2 top-9 w-[214px]' : 'left-3 bottom-3 w-[322px]'}`} data-testid="finder">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold tracking-wide text-sky-200/90">
        <span className="whitespace-nowrap">{small ? 'SONAR' : 'FISH FINDER'}</span>
        <span className="whitespace-nowrap font-mono font-normal text-sky-100/70" data-testid="finder-net">{rigOut && net ? `net ${net.depth.toFixed(1)} m → set ${net.tgt.toFixed(0)} m` : 'under the boat'}</span>
      </div>
      <canvas ref={ref} width={300} height={small ? 90 : 150} onPointerDown={tap} className="w-full rounded-lg border border-white/10 touch-none" style={{ aspectRatio: small ? '300/90' : '300/150' }} />
      <div className="mt-1 flex gap-1.5" data-testid="finder-contacts">
        {!small && <canvas ref={plan} width={104} height={104} className="shrink-0 rounded-lg border border-white/10" style={{ width: 104, height: 104 }} />}
        <div className="min-w-0 flex-1 text-[10.5px] leading-tight">
          {ahead.length === 0
            ? <div className="text-sky-200/70" data-testid="no-school">No school within {Math.round(340)} m ahead{contacts.length ? <span className="block text-[9.5px] text-sky-200/50">{contacts.length} contact{contacts.length > 1 ? 's' : ''} abeam / astern</span> : null}</div>
            : ahead.slice(0, small ? 1 : 3).map((k, i) => { const m = match(k), ms = meshTxt(k); return (
              <div key={k.id} className="mb-1 border-l-2 pl-1.5" style={{ borderColor: COLS[i] }} data-testid="contact">
                <div className="text-amber-100"><b style={{ color: COLS[i] }}>{i + 1}</b> {SPECIES[k.sp].name} · ~{k.n} fish</div>
                <div className="font-mono text-[10px] text-sky-100/90">{where(k)} · <b>{k.top.toFixed(1)}–{k.bot.toFixed(1)} m</b></div>
                {m && <div className={`font-mono text-[9.5px] ${m.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{m.t}</div>}
                {ms && <div className={`text-[9.5px] ${ms[1]}`}>{ms[0]}</div>}
              </div>); })}
        </div>
      </div>
      {s.method === 'trawl' && (
        <div className="mt-1.5 flex items-center gap-1">
          {rigOut && !w?.rig?.hauling ? (
            <>
              <button className="pe h-8 w-8 shrink-0 rounded-full border border-white/30 bg-white/10 text-lg leading-none active:bg-white/30" onClick={() => w.trawlDepth(-1)} aria-label="shallower">−</button>
              <div className="flex-1 whitespace-nowrap text-center font-mono text-[12px]">{tr ? tr.depth.toFixed(0) : '–'} m · {tr?.fish ?? 0} fish</div>
              <button className="pe h-8 w-8 shrink-0 rounded-full border border-white/30 bg-white/10 text-lg leading-none active:bg-white/30" onClick={() => w.trawlDepth(1)} aria-label="deeper">+</button>
              <button className={`pe ml-0.5 h-8 shrink-0 whitespace-nowrap rounded-full border px-2 text-[10.5px] font-medium ${tr?.auto ? 'border-amber-100 bg-amber-300/90 text-slate-900' : 'border-white/30 bg-white/10'}`} onClick={() => w.trawlAuto()}>{small ? 'Follow' : 'Follow school'}</button>
              <button className="pe h-8 shrink-0 rounded-full border border-white/30 bg-emerald-500/80 px-2 text-[10.5px] font-semibold" onClick={() => w.haul()}>Haul</button>
            </>
          ) : rigOut ? <div className="w-full text-center text-[11px] text-sky-100/80">Hauling the trawl back…</div>
            : <button className="pe h-8 w-full rounded-full border border-amber-100 bg-amber-300/90 text-[12px] font-semibold text-slate-900" onClick={() => w.beginCharge()}>Shoot the trawl (F)</button>}
        </div>
      )}
      {rigOut && <div className="mt-1 text-[9.5px] text-sky-200/60">Q / E or tap the echogram to set the net depth · X follows the school</div>}
    </div>
  );
}
