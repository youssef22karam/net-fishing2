// @ts-nocheck
/* CAST NET 2D GAME — "Race the Rim"
   A cross-section of the sea under your landed net. The net sinks like a bell; fish panic after a delay (species, boat noise) and bolt outward and DOWN.
   Hold PULL (space) to cinch the draw cord: the rim contracts and lifts. Tap the water to herd stragglers inward (each tap also spooks them a bit).
   Strategy: cinch early = small, safe catch of the shallow fish | wait while the rim sinks past a deeper layer = bigger catch, but the fish dive and the cord tension rises.
   Heavier nets sink faster (win the race) but pull slower and strain; fine mesh sinks badly; big mesh lets small fish through; waves and current shove the net. */
import { SPECIES, clamp } from '../game/config.js';
import { meshDrag, retention } from '../game/netgen.js';
import { Frame, GameCanvas, W, H, R, drawFish, sea, bar, keepRoll, tally, hex } from './common';

function factory(cfg: any) {
  const net = cfg.net, mesh = net.mesh[cfg.meshIdx], Dm = Math.min(13.5, cfg.seabed - .5), top = 36, ppm = (H - 100) / Dm, Rpx = 235, cx = W / 2, Rm = net.radius, env = cfg.env;
  const rho0 = clamp(cfg.openFrac, .22, 1.05), sinkRate = net.sinkRate / meshDrag(mesh), holes = cfg.holes || 0, cur = env.current * (1 + env.seaDiff) * .6 / Rm;
  const fish = cfg.pool.map((p: any, i: number) => { const sp = SPECIES[p.sp]; return { i, p, sp, x: p.x, y: p.depth, vx: (R() - .5) * .08, vy: 0, panic: sp.panic * (.7 + .8 * R()) / (1 + cfg.boatSpeed * .25 + cfg.noise * .8) * 4.4, state: 'idle', out: false, slip: keepRoll(p, cfg) ? 0 : 1, flash: 0, dead: false, shed: false, ph: R() * 7 }; });
  const potential = fish.filter((f: any) => !f.slip && f.y <= 7).length;
  const G: any = { t: 0, zr: .3, c: 0, tension: 0, holding: false, pulse: 0, pulses: [], fx: [], result: null, msg: '', msgT: 0 };
  const rimY = () => G.zr * (1 - .12 * G.c), rho = () => rho0 * (1 - .93 * G.c), xs = (d: number) => rho() * Math.pow(clamp(d / Math.max(rimY(), .2), 0, 1), .62);
  const inside = (f: any) => !f.out && !f.slip && f.y < rimY() && Math.abs(f.x) < xs(f.y) + .02;
  const finish = (auto: boolean) => {
    const kept = fish.filter((f: any) => !f.out && !f.dead && f.y < rimY() + .3 && Math.abs(f.x) < rho() + .06 && (!f.slip) && (!auto || R() < .55));
    const idx = kept.map((f: any) => f.i), outN = fish.filter((f: any) => f.out).length, slipN = fish.filter((f: any) => f.slip && f.y < 7).length, deepN = fish.filter((f: any) => f.p.depth > 8).length, shed = fish.filter((f: any) => f.shed).length;
    const score = potential ? clamp(idx.length / potential, 0, 1) : 0, perfect = potential >= 3 && score >= .8 && !auto;
    let tip = '';
    if (!cfg.pool.length) tip = cfg.label === 'miss' ? 'The net landed beside the school. Creep closer and aim at the dark patch — range is only a few metres.' : 'Nothing was under the net.';
    else if (!idx.length && deepN > cfg.pool.length * .5) tip = 'The school was too deep — it slid away under the rim. Cast nets only reach shallow fish; look for gulls diving and a dark patch near the surface.';
    else if (outN > idx.length) tip = 'The fish dived faster than the net sank. Cinch earlier, or use a heavier net so the rim wins the race.';
    else if (slipN > idx.length && slipN > 3) tip = `Small fish slipped through the ${mesh} mm mesh — try a finer mesh (T), but expect it to sink slower.`;
    else if (shed) tip = 'The cord strained and the mesh shed fish. Release the cord now and then to let tension drop.';
    else if (perfect) tip = 'Perfect cinch! Smooth timing — bonus streak applies.';
    else tip = 'Nice haul. Closing right as the rim passes the school gives the biggest catch.';
    G.result = { caught: tally(cfg, idx), caughtIdx: idx, score, perfect, tip, potential, headline: perfect ? 'PERFECT CINCH' : idx.length ? 'Net closed' : 'Empty net', delay: 900 };
  };
  G.update = (dt: number) => {
    if (G.result) return; G.t += dt; const wave = 1 + .25 * Math.sin(G.t * 2.3) * env.seaDiff;
    G.zr = Math.min(G.zr + sinkRate * dt * wave * (1 - .3 * G.c), Dm - .3);
    const insideN = fish.filter(inside).length, load = clamp(insideN * (cfg.pool[0] ? SPECIES[cfg.pool[0].sp].len : .3) / 14, 0, 1.4);
    if (G.holding) { const rate = clamp(.66 - net.weight * .02, .25, .7) * (1 - .8 * G.tension * G.tension) * (cfg.comp.over > 1 ? .8 : 1); G.c = Math.min(1, G.c + rate * dt); G.tension = Math.min(1, G.tension + (.1 + .4 * load + .15 * cfg.comp.strain) * dt); }
    else { G.tension = Math.max(0, G.tension - .35 * dt); G.c = Math.max(0, G.c - .02 * dt); }
    G.pulses = G.pulses.filter((p: any) => (p.t += dt) < .6);
    for (const f of fish) {
      if (f.dead) continue; f.ph += dt * 8; f.flash = Math.max(0, f.flash - dt * 3); f.x += cur * dt;
      for (const p of G.pulses) if (p.t < dt * 1.5) { const d = f.x - p.x; if (Math.abs(d) < .7 && f.y < 4) { f.vx += Math.sign(d || 1) * (1 - Math.abs(d) / .7) * .9; f.panic -= .25; f.flash = 1; } }
      if (f.state === 'idle') { f.panic -= dt; f.x += f.vx * dt; if (f.panic <= 0) { f.state = 'flee'; f.flash = 1; } }
      else { const dir = Math.sign(f.x || (R() - .5)) * (f.sp.flee === 'sprint' ? 1.6 : 1), zz = f.sp.flee === 'zigzag' ? Math.sin(f.ph * .5) * .5 : 0, tx = (dir * (.5 + f.sp.speed * .12) + zz) / (1 + Rm * .15), ty = f.sp.dive * (f.sp.flee === 'dive' ? .8 : .36);
        f.vx += (tx - f.vx) * dt * 2.5; f.vy += (ty - f.vy) * dt * 2.5; f.x += f.vx * dt; f.y = Math.min(Dm, f.y + f.vy * dt); }
      // mesh behaviour
      if (!f.out && !f.slip) {
        const lim = xs(f.y); if (f.y < rimY()) { if (Math.abs(f.x) > lim + .02 && Math.abs(f.x) < rho0 * 1.3 + .3 && f.state === 'flee') { const was = Math.abs(f.x - f.vx * dt) <= lim + .03; if (was) { f.x = Math.sign(f.x) * lim; f.vx *= -.15; f.vy += .25; } } }
        else if (f.state === 'flee' && Math.abs(f.x) < rho() + .12 && f.y > rimY() + .05 && f.y - f.vy * dt < rimY() + .5) { f.out = true; G.fx.push({ x: f.x, y: f.y, t: 0 }); }
        if (holes > 0 && inside(f) && xs(f.y) - Math.abs(f.x) < .15 && R() < holes * dt * 1.1) f.out = true;
      }
      if (G.tension >= .98 && inside(f) && !f.shed && R() < dt * .6 && f.sp.len > mesh * .0095 * 1.4) { f.shed = true; f.out = true; }
    }
    if (G.c >= .97) finish(false); else if (G.t > 42 || G.zr >= Dm - .35) { G.c = Math.max(G.c, .6); if (G.t > 42 || G.zr >= Dm - .35) finish(true); }
    G.insideN = fish.filter(inside).length; G.insideV = fish.filter(inside).reduce((s: number, f: any) => s + f.sp.value * (cfg.mult || 1), 0);
  };
  G.key = (e: KeyboardEvent, d: boolean) => { if (e.code === 'Space' || e.code === 'KeyG' || e.code === 'KeyF') G.holding = d; };
  G.pointer = (t: string, x: number, y: number) => { if (t === 'down') { if (y > H - 60 && x > 230 && x < 570) G.holding = true; else { G.pulses.push({ x: (x - cx) / Rpx, t: 0 }); } } if (t === 'up') G.holding = false; };
  G.draw = (c: CanvasRenderingContext2D) => {
    sea(c, G.t, Dm, top, H - 52, ppm); const ry = top + 3 + rimY() * ppm, r = rho() * Rpx;
    // pulses (surface slaps)
    c.strokeStyle = 'rgba(255,255,255,.6)'; for (const p of G.pulses) { c.beginPath(); c.ellipse(cx + p.x * Rpx, top + 3, 18 + p.t * 120, 4 + p.t * 14, 0, 0, 7); c.globalAlpha = 1 - p.t / .6; c.stroke(); c.globalAlpha = 1; }
    // fish behind net
    for (const f of fish) { if (f.dead) continue; const px = cx + f.x * Rpx, py = top + 3 + f.y * ppm, L = Math.max(11, f.sp.len * ppm * 3.2 * f.p.len / f.sp.len); const dim = f.out && f.y > rimY() ? .75 : 1; drawFish(c, px, py, L, f.sp, Math.atan2(f.vy * 1.0, f.vx * 3 + (f.vx === 0 ? 1 : 0)) * .0 + (f.vx < -.02 ? Math.PI : 0) + clamp(f.vy * .25, -.6, .6) * (f.vx < -.02 ? -1 : 1), f.ph, dim * (f.slip ? .55 : 1), f.flash); }
    // bell
    c.beginPath(); c.moveTo(cx, top + 3); for (let d = 0; d <= rimY(); d += rimY() / 24 + .001) c.lineTo(cx + xs(d) * Rpx, top + 3 + d * ppm); c.lineTo(cx + r, ry); c.lineTo(cx - r, ry); for (let d = rimY(); d >= 0; d -= rimY() / 24 + .001) c.lineTo(cx - xs(d) * Rpx, top + 3 + d * ppm); c.closePath();
    c.fillStyle = 'rgba(235,240,225,.16)'; c.fill(); c.strokeStyle = 'rgba(240,235,210,.85)'; c.lineWidth = 1.6; c.stroke();
    c.save(); c.clip(); c.strokeStyle = 'rgba(240,235,210,.28)'; c.lineWidth = 1; const cell = 14 + mesh * .35; for (let x = -W; x < W * 2; x += cell) { c.beginPath(); c.moveTo(x, top); c.lineTo(x + 250, H); c.moveTo(x, top); c.lineTo(x - 250, H); c.stroke(); } c.restore();
    c.strokeStyle = '#242424'; c.lineWidth = 5; c.beginPath(); c.moveTo(cx - r, ry); c.lineTo(cx + r, ry); c.stroke(); c.fillStyle = '#555'; for (let i = 0; i <= 16; i++) { c.beginPath(); c.arc(cx - r + (2 * r) * i / 16, ry, 3.2, 0, 7); c.fill(); }
    c.strokeStyle = '#c9a96a'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, top - 14); c.lineTo(cx, top + 3); c.stroke(); c.fillStyle = '#ff6a1a'; c.beginPath(); c.arc(cx, top + 2, 6, 0, 7); c.fill();
    for (const e of G.fx) { e.t += .016; c.strokeStyle = `rgba(255,120,100,${1 - e.t})`; c.beginPath(); c.arc(cx + e.x * Rpx, top + 3 + e.y * ppm, 6 + e.t * 30, 0, 7); c.stroke(); } G.fx = G.fx.filter((e: any) => e.t < 1);
    // HUD
    c.fillStyle = 'rgba(8,20,32,.7)'; c.fillRect(0, 0, W, 28); c.fillStyle = '#fff'; c.font = '600 13px system-ui'; c.fillText(`In the bell: ${Math.round(G.insideN * (cfg.mult || 1))} fish · ~$${Math.round(G.insideV)}`, 12, 19); c.font = '11px ui-monospace,monospace'; c.fillStyle = '#bfe3f0'; c.fillText(`${cfg.label.toUpperCase()} · rim ${rimY().toFixed(1)} m · sink ${sinkRate.toFixed(2)} m/s · est. difficulty ${Math.round(((1 - cfg.comp.openMul) * .4 + env.seaDiff * .25 + clamp(cfg.pool.reduce((s: number, p: any) => s + p.dive, 0) / Math.max(1, cfg.pool.length) / 3, 0, 1) * .35) * 100)}%`, 270, 18);
    bar(c, 16, H - 44, 230, 14, G.c, '#7be0a8', 'cord closed'); bar(c, 16, H - 24, 230, 14, G.tension, G.tension > .75 ? '#ff6a5a' : '#ffc060', 'tension');
    c.fillStyle = G.holding ? '#ffb347' : 'rgba(255,255,255,.2)'; c.beginPath(); c.roundRect(250, H - 46, 300, 36, 18); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); c.fillStyle = G.holding ? '#3a2200' : '#fff'; c.font = '600 13px system-ui'; c.textAlign = 'center'; c.fillText(G.holding ? 'CINCHING…' : 'HOLD TO PULL THE CORD (Space)', 400, H - 23); c.textAlign = 'left';
    c.fillStyle = '#d6f1ff'; c.font = '11px ui-monospace,monospace'; c.fillText(`time ${Math.max(0, 42 - G.t).toFixed(0)}s`, W - 70, H - 30); c.fillText('tap water = herd', W - 125, H - 14);
    if (G.result) { c.fillStyle = 'rgba(5,14,24,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = G.result.perfect ? '#ffe28a' : '#fff'; c.font = '700 34px system-ui'; c.textAlign = 'center'; c.fillText(G.result.headline, W / 2, H / 2); c.textAlign = 'left'; }
  };
  return G;
}
export default function CastGame({ cfg, onDone }: any) {
  return (
    <Frame title="Cast Net — Race the Rim" cfg={cfg} tagline="The net sinks like a bell while the fish panic and dive. Cinch the cord when the rim passes the fish. Close early for a safe small catch — or wait for a bigger layer and risk the dive."
      keysHint="Hold Space / the button to cinch · click the water to herd fish inward · release to let the cord tension drop">
      <GameCanvas cfg={cfg} factory={factory} onDone={onDone} />
    </Frame>
  );
}
