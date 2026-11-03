// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { SPECIES, clamp } from '../game/config.js';
import { retention } from '../game/netgen.js';

export const W = 800, H = 470;
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
export const R = Math.random;

export function drawFish(c: CanvasRenderingContext2D, x: number, y: number, len: number, sp: any, ang = 0, wag = 0, alpha = 1, flash = 0) {
  c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha = alpha; const h = Math.max(2, len * .26);
  const g = c.createLinearGradient(0, -h, 0, h); g.addColorStop(0, hex(sp.color)); g.addColorStop(.55, hex(sp.color)); g.addColorStop(1, flash ? '#fff' : hex(sp.belly));
  c.fillStyle = g; c.beginPath(); c.moveTo(len / 2, 0); c.quadraticCurveTo(len * .15, -h * 1.1, -len * .32, -h * .35); c.lineTo(-len / 2, -h * .8 + Math.sin(wag) * h * .5); c.lineTo(-len * .44, Math.sin(wag) * h * .3); c.lineTo(-len / 2, h * .8 + Math.sin(wag) * h * .5); c.lineTo(-len * .32, h * .35); c.quadraticCurveTo(len * .15, h * 1.1, len / 2, 0); c.fill();
  c.fillStyle = '#0b1722'; c.beginPath(); c.arc(len * .3, -h * .15, Math.max(.8, len * .028), 0, 7); c.fill(); c.restore();
}
export function sea(c: CanvasRenderingContext2D, t: number, depthM: number, top = 0, bottom = H, ppm = 1) {
  const g = c.createLinearGradient(0, top, 0, bottom); g.addColorStop(0, '#7fd0e0'); g.addColorStop(.12, '#2f93b5'); g.addColorStop(.5, '#17607f'); g.addColorStop(1, '#0a2a44'); c.fillStyle = g; c.fillRect(0, top, W, bottom - top);
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; for (let i = 0; i < 5; i++) { const x = (i * 190 + t * 6) % (W + 200) - 100; c.beginPath(); c.moveTo(x, top); c.lineTo(x + 70, bottom); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(0, top + 3); for (let x = 0; x <= W; x += 20) c.lineTo(x, top + 3 + Math.sin(x * .04 + t * 2) * 2); c.lineTo(W, top); c.lineTo(0, top); c.fill();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.font = '10px ui-monospace,monospace'; for (let d = 2; d <= depthM; d += 2) { const y = top + 3 + d * ppm; c.fillRect(W - 24, y, 10, 1); c.fillText(d + 'm', W - 50, y + 3); }
}
export function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, col: string, label = '') {
  c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(x, y, w, h); c.fillStyle = col; c.fillRect(x + 1, y + 1, (w - 2) * clamp(v, 0, 1), h - 2); c.fillStyle = '#fff'; c.font = '11px ui-monospace,monospace'; if (label) c.fillText(label, x + 4, y + h - 3);
}
/* per-fish mesh slip roll: deterministic per fish so the 2D game and result agree */
export const keepRoll = (p: any, cfg: any) => { if (p._slip === undefined) p._slip = R(); return p._slip < retention(p.len, cfg.net.mesh[cfg.meshIdx], cfg.net.type, 0); };

export function tally(cfg: any, keptIdx: number[]) {
  const caught: any = {}; keptIdx.forEach((i) => { const sp = cfg.pool[i].sp; caught[sp] = (caught[sp] || 0) + Math.round(cfg.mult || 1); });
  return caught;
}

/* Hosts a canvas game. factory returns {update(dt), draw(ctx), key(e,down), pointer(type,x,y,e), result?} */
export function GameCanvas({ cfg, factory, onDone, help }: any) {
  const ref = useRef<HTMLCanvasElement>(null), started = useRef(!help), [go, setGo] = useState(!help);
  const start = () => { if (!started.current) { started.current = true; setGo(true); } };
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!; const G = factory(cfg); let raf = 0, last = performance.now(), fin = 0, dead = false;
    const pos = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
    const pd = (e: PointerEvent) => { e.preventDefault(); if (!started.current) return; const p = pos(e); G.pointer && G.pointer('down', p[0], p[1], e); }, pu = (e: PointerEvent) => { if (!started.current) return; const p = pos(e); G.pointer && G.pointer('up', p[0], p[1], e); }, pm = (e: PointerEvent) => { const p = pos(e); G.pointer && G.pointer('move', p[0], p[1], e); };
    const kd = (e: KeyboardEvent) => { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); e.stopPropagation(); if (!started.current) { if (e.code === 'Space' || e.code === 'Enter') start(); return; } if (!e.repeat) G.key && G.key(e, true); }, ku = (e: KeyboardEvent) => { e.stopPropagation(); if (started.current) G.key && G.key(e, false); };
    const ctxm = (e: Event) => e.preventDefault();
    cv.addEventListener('pointerdown', pd); addEventListener('pointerup', pu); cv.addEventListener('pointermove', pm); cv.addEventListener('contextmenu', ctxm); addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
    const loop = (now: number) => { if (dead) return; const dt = Math.min(.05, (now - last) / 1000); last = now; if (started.current) G.update(dt); G.draw(ctx); if (G.result && !fin) { fin = now; } if (fin && now - fin > (G.result.delay ?? 1400)) { dead = true; onDone(G.result); return; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); (window as any).__game = G;
    return () => { dead = true; (window as any).__game = null; cancelAnimationFrame(raf); cv.removeEventListener('pointerdown', pd); removeEventListener('pointerup', pu); cv.removeEventListener('pointermove', pm); cv.removeEventListener('contextmenu', ctxm); removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); };
  }, []);
  return (
    <div className="relative">
      <canvas ref={ref} width={W} height={H} className="w-full rounded-2xl border border-white/20 shadow-2xl touch-none select-none" style={{ aspectRatio: `${W}/${H}`, background: '#0a2a44' }} />
      {help && !go && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/70 backdrop-blur-[2px] p-4" data-testid="game-help">
          <div className="max-w-[560px] rounded-2xl border border-white/25 bg-slate-900/95 p-5 text-white shadow-2xl">
            <div className="text-lg font-semibold">{help.title}</div>
            <div className="mt-1 text-[12px] text-amber-200">GOAL: {help.goal}</div>
            <ol className="mt-3 space-y-1.5 text-[12.5px] leading-snug text-sky-50">{help.steps.map((t: string, i: number) => <li key={i} className="flex gap-2"><span className="mt-[1px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-sky-500/40 text-[11px] font-semibold">{i + 1}</span><span>{t}</span></li>)}</ol>
            {help.tip && <div className="mt-3 text-[11.5px] text-sky-200/85">Tip: {help.tip}</div>}
            <button data-testid="game-start" onClick={start} className="pe mt-4 w-full rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-200">Start — press Space</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Frame({ title, tagline, cfg, children, keysHint }: any) {
  const diff = cfg.diff ?? 0;
  return (
    <div className="pe fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-3">
      <div className="w-full max-w-[860px]">
        <div className="mb-2 flex items-end justify-between gap-3 text-white">
          <div><div className="text-xl font-semibold tracking-tight">{title}</div><div className="text-xs text-sky-100/80 max-w-[520px]">{tagline}</div></div>
          <div className="text-right text-[11px] text-sky-100/80 font-mono leading-tight">{cfg.net.name} · {cfg.net.sizeLabel}<br />mesh {cfg.net.mesh[cfg.meshIdx]} mm · {cfg.comp.label}</div>
        </div>
        {children}
        <div className="mt-2 text-center text-[11px] text-sky-100/80">{keysHint}</div>
      </div>
    </div>
  );
}
