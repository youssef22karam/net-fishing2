// @ts-nocheck
/* TRAWL  — "Haul the Bag": the 3D tow decided what is in the bag; this is the haul-back. Hold SPACE to wind the winch, keep the warp tension in the green band,
   ease off on wave surges and rock snags, and bring the bag up before time runs out. Too much tension bursts fish out of the codend; too little lets the bag sag and spill.
   PURSE SEINE — "Pursing Rhythm": a two-lane rhythm game; every on-beat pull tightens the purse line and closes the leak gap under the ring.
   GILL   — "Pick the Net": a sorting conveyor; fish are tangled in the mesh and must be freed (several clicks) and sorted keep / release before the drum swallows them. */
import { SPECIES, clamp } from '../game/config.js';
import { retention } from '../game/netgen.js';
import { Frame, GameCanvas, W, H, R, drawFish, sea, bar, keepRoll, tally, hex } from './common';

/* ============================================================ TRAWL: HAUL THE BAG ============================================================ */
function trawlFactory(cfg: any) {
  const net = cfg.net, comp = cfg.comp, env = cfg.env, Dm = Math.min(13.5, cfg.seabed - .5), top = 40, ppm = (H - 130) / Dm, N = cfg.pool.length;
  const bagFish = cfg.pool.map((p: any, i: number) => ({ i, p, sp: SPECIES[p.sp], keep: keepRoll(p, cfg), lost: false, ph: R() * 7, ox: R(), oy: R(), vx: 0, vy: 0, out: 0 }));
  const potential = bagFish.filter((f: any) => f.keep).length, load = clamp(N / (120 + net.mouthW * 14), 0, 1);
  const startDepth = clamp(cfg.depth || 3, 1, Dm), haulRate = .1 / (1 + load * .7 + comp.strain * .6) * (1 - .1 * env.seaDiff);   // fraction of the way up per second at full haul
  const G: any = { t: 0, pos: 0, T: .15, hold: false, inBand: 0, over: 0, slack: 0, lost: 0, surge: 0, snag: 0, nextSnag: 6 + R() * 5, snags: 0, fx: [], result: null, limit: 46, started: false };
  const base = () => .14 + .3 * load + .22 * comp.strain;
  const finish = (why: string) => {
    const keptList = bagFish.filter((f: any) => !f.lost && f.keep), idx = keptList.map((f: any) => f.i), score = potential ? clamp(idx.length / potential, 0, 1) : 0;
    const band = G.inBand / Math.max(G.t, 1), perfect = potential >= 3 && score >= .9 && band > .55;
    G.result = { caught: tally(cfg, idx), caughtIdx: idx, score, perfect, potential, delay: 900, headline: !N ? 'Empty bag' : why === 'time' ? 'Hauled too slowly' : perfect ? 'PERFECT HAUL' : 'Bag on deck',
      tip: !N ? 'The trawl came up empty. Tow slowly at 2–4 knots through a dark patch or boiling water, with the warp length matched to the school depth (Q longer = deeper, E shorter = shallower).' : why === 'time' ? 'You ran out of time with fish still in the water. Keep SPACE held while the tension is in the green.' : G.lost > N * .3 ? 'The codend burst open whenever tension hit the red. Ease off on surges and on snags.' : band < .4 ? 'Stay in the green band — lots of time in slack or red costs fish.' : 'Smooth haul.' };
  };
  G.update = (dt: number) => {
    if (G.result) return; G.t += dt; G.surge = Math.sin(G.t * 1.9 + 1) * (.07 + .1 * env.seaDiff) + Math.sin(G.t * .8) * .04;
    G.nextSnag -= dt; if (G.nextSnag <= 0 && G.pos < .85 && cfg.depth > Dm - 4) { G.snag = .9; G.snags++; G.nextSnag = 9 + R() * 6; G.fx.push({ t: 0, s: 'snag!' }); } else if (G.nextSnag <= 0) G.nextSnag = 8 + R() * 6;
    G.snag = Math.max(0, G.snag - dt);
    const tgt = base() + (G.hold ? .36 + .12 * comp.strain : 0) + G.surge + (G.snag > 0 ? .4 : 0);
    G.T += (tgt - G.T) * Math.min(1, dt * 3.2); G.T = clamp(G.T, 0, 1.1);
    if (G.hold && G.T < 1) G.pos = Math.min(1, G.pos + haulRate * dt * (G.T > .75 ? .5 : 1) * (G.snag > 0 ? .3 : 1));
    if (G.T >= .3 && G.T <= .72) G.inBand += dt;
    // tension in the red bursts fish out of the codend; slack lets the bag sag and spill a few
    const risk = G.T > .86 ? (G.T - .86) * 7 + .25 : G.T < .1 && G.pos > .05 ? .12 : 0; G.over = risk;
    for (const f of bagFish) { if (f.lost) { f.out += dt; continue; } if (R() < risk * dt * .22 / Math.max(1, N / 14)) { f.lost = true; G.lost++; G.fx.push({ t: 0, s: '−fish' }); } }
    if (G.pos >= 1) finish('done'); else if (G.t > G.limit) finish('time');
  };
  G.key = (e: KeyboardEvent, d: boolean) => { if (e.code === 'Space' || e.code === 'KeyG' || e.code === 'KeyF') G.hold = d; };
  G.pointer = (t: string) => { if (t === 'down') G.hold = true; if (t === 'up') G.hold = false; };
  G.draw = (c: CanvasRenderingContext2D) => {
    sea(c, G.t, Dm, top, H - 60, ppm); const x0 = 250, bagY = top + 3 + (startDepth * (1 - G.pos)) * ppm + 10;
    c.fillStyle = '#5b4a35'; c.fillRect(0, top - 34, 160, 34); c.fillStyle = '#c9b690'; c.fillRect(0, top - 40, 150, 8);   // boat stern
    c.strokeStyle = '#d6c8a0'; c.lineWidth = 3; c.beginPath(); c.moveTo(140, top - 24); c.lineTo(x0, bagY - 36); c.stroke();
    // net body + codend (bag)
    const bw = 44 + 40 * load; c.fillStyle = 'rgba(235,235,215,.18)'; c.strokeStyle = 'rgba(240,235,210,.85)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x0 - 14, bagY - 36); c.lineTo(x0 - bw / 2, bagY - 6); c.quadraticCurveTo(x0 - bw / 2 - 6, bagY + 36 + load * 20, x0, bagY + 44 + load * 24); c.quadraticCurveTo(x0 + bw / 2 + 6, bagY + 36 + load * 20, x0 + bw / 2, bagY - 6); c.lineTo(x0 + 14, bagY - 36); c.closePath(); c.fill(); c.stroke();
    c.save(); c.clip(); c.strokeStyle = 'rgba(240,235,210,.3)'; for (let x = x0 - 80; x < x0 + 80; x += 12) { c.beginPath(); c.moveTo(x, bagY - 40); c.lineTo(x + 40, bagY + 90); c.moveTo(x, bagY - 40); c.lineTo(x - 40, bagY + 90); c.stroke(); } c.restore();
    for (const f of bagFish) { if (f.lost) { const k = Math.min(1, f.out / 1.6); drawFish(c, x0 + (f.ox - .5) * bw + k * 120 * (f.ox < .5 ? -1 : 1), bagY + 8 + f.oy * 26 + k * 70, 14, f.sp, (f.ox < .5 ? Math.PI : 0) + .6, G.t * 8, 1 - k); } else drawFish(c, x0 + (f.ox - .5) * bw * .8, bagY + 6 + f.oy * (28 + load * 22), Math.max(10, f.sp.len * 30), f.sp, f.ox * 6, G.t * 6 + f.ph, f.keep ? 1 : .6); }
    // panel
    c.fillStyle = 'rgba(8,20,32,.78)'; c.beginPath(); c.roundRect(470, 44, 310, 372, 16); c.fill();
    c.fillStyle = '#fff'; c.font = '600 14px system-ui'; c.fillText('WINCH', 490, 72); c.font = '12px system-ui'; c.fillStyle = '#bfe3f0';
    c.fillText(G.hold ? 'hauling…' : 'HOLD SPACE (or press the mouse button) to haul', 490, 92);
    // tension gauge (vertical)
    const gx = 500, gy = 110, gh = 270, gw = 36; c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(gx, gy, gw, gh);
    const yT = (v: number) => gy + gh - gh * clamp(v / 1.1, 0, 1); c.fillStyle = 'rgba(255,90,70,.45)'; c.fillRect(gx, yT(1.1), gw, yT(.86) - yT(1.1)); c.fillStyle = 'rgba(110,230,150,.55)'; c.fillRect(gx, yT(.72), gw, yT(.3) - yT(.72)); c.fillStyle = 'rgba(255,200,90,.3)'; c.fillRect(gx, yT(.1), gw, yT(0) - yT(.1));
    c.fillStyle = '#fff'; c.fillRect(gx - 6, yT(G.T) - 2, gw + 12, 4); c.font = '11px ui-monospace,monospace'; c.fillText('tension', gx - 6, gy - 6); c.fillStyle = '#9ff0b8'; c.fillText('keep here', gx + gw + 8, (yT(.3) + yT(.72)) / 2 + 4); c.fillStyle = '#ff9a8a'; c.fillText('bursts fish', gx + gw + 8, yT(.98)); c.fillStyle = '#ffd890'; c.fillText('slack: spills', gx + gw + 8, yT(.04));
    bar(c, 640, 112, 120, 14, G.pos, '#7be0a8', 'bag up'); bar(c, 640, 136, 120, 14, G.t / G.limit, '#8fd0ff', 'time');
    c.fillStyle = '#fff'; c.font = '12px ui-monospace,monospace'; c.fillText(`fish aboard: ${bagFish.filter((f: any) => !f.lost).length}/${N}`, 640, 180); c.fillText(`lost: ${G.lost}`, 640, 198);
    c.fillStyle = '#bfe3f0'; c.fillText(`depth ${(startDepth * (1 - G.pos)).toFixed(1)} m`, 640, 222); c.fillText(`${comp.label}`, 640, 240);
    c.fillStyle = G.over > 0 ? '#ff7a6a' : G.T < .3 ? '#ffd890' : '#9ff0b8'; c.font = '600 13px system-ui'; c.fillText(G.snag > 0 ? 'SNAG — let go!' : G.T > .86 ? 'TOO TIGHT — ease off' : G.T < .3 ? (G.hold ? 'easy…' : 'pull!') : 'good tension', 640, 290);
    for (const e of G.fx) { e.t += .016; c.fillStyle = `rgba(255,170,120,${1 - e.t})`; c.font = '600 14px system-ui'; c.fillText(e.s, x0 + 40, bagY - 30 - e.t * 40); } G.fx = G.fx.filter((e: any) => e.t < 1);
    c.fillStyle = 'rgba(8,20,32,.7)'; c.fillRect(0, 0, W, 28); c.fillStyle = '#fff'; c.font = '600 13px system-ui'; c.fillText(`Haul the bag — ${N} fish in the codend (~$${Math.round(bagFish.filter((f: any) => !f.lost).reduce((s: number, f: any) => s + f.sp.value, 0))})`, 12, 19);
    if (G.result) { c.fillStyle = 'rgba(5,14,24,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = G.result.perfect ? '#ffe28a' : '#fff'; c.font = '700 32px system-ui'; c.textAlign = 'center'; c.fillText(G.result.headline, W / 2, H / 2); c.textAlign = 'left'; }
  };
  return G;
}
export function TrawlGame({ cfg, onDone }: any) {
  return (<Frame title="Trawl — Haul the Bag" cfg={cfg} tagline="The tow is over and the bag is full of whatever the net swept up. Wind it in without bursting the codend." keysHint="Hold Space / mouse button to haul · release on surges · stay in the green band">
    <GameCanvas cfg={cfg} factory={trawlFactory} onDone={onDone} help={{ title: 'Trawl — haul back the bag', goal: 'Bring the bag to the surface before time runs out and lose as few fish as possible.', steps: ['The fish already in the codend came from your 3D tow (right depth + speed = more fish).', 'HOLD SPACE (or the mouse button) to wind the winch. Hauling raises the warp tension; releasing lets it fall.', 'Keep the white marker in the GREEN band. In the red the codend bursts and fish escape; with slack the bag sags and spills.', 'Waves surge the load and rocks can snag a low net: release the moment the tension nears red or a SNAG appears.', 'Bigger nets on a weak boat haul slower and strain more.'], tip: 'Tap-hold in short pulses — hold while tension is falling, let go as it climbs.' }} /></Frame>);
}

/* ============================================================ PURSE SEINE ============================================================ */
function seineFactory(cfg: any) {
  const net = cfg.net, comp = cfg.comp, env = cfg.env, cx = 235, cy = 240, Rr = 168, lineY = 392;
  const gapBase = clamp(cfg.gap / Math.max(cfg.L, 30) * 6, 0, 1.6), winch = 1 / (1 + .6 * Math.max(0, comp.over - .6));
  const fish = cfg.pool.map((p: any, i: number) => ({ i, p, sp: SPECIES[p.sp], a: p.a, r: .2 + p.r * .75, w: (R() > .5 ? 1 : -1) * (.5 + R() * .7) / (.6 + p.r), leaked: false, keep: keepRoll(p, cfg), ph: R() * 7 }));
  const potential = fish.filter((f: any) => f.keep).length;
  const G: any = { t: 0, c: 0, slack: 0, fast: false, notes: [], next: 1.2, hits: 0, perfects: 0, miss: 0, combo: 0, best: 0, flashes: [], result: null, lane: [0, 0], leakN: 0 };
  const win = () => (G.fast ? .11 : .17) * (.8 + .2 * comp.openMul) * (1 - .25 * env.seaDiff);
  const finish = () => {
    const kept = fish.filter((f: any) => !f.leaked && f.keep), idx = kept.map((f: any) => f.i), leak = potential ? fish.filter((f: any) => f.leaked && f.keep).length / potential : 0, acc = (G.hits + G.miss) ? G.hits / (G.hits + G.miss) : 0, score = potential ? clamp(idx.length / potential, 0, 1) : 0, perfect = potential >= 3 && acc >= .82 && leak <= .1;
    G.result = { caught: tally(cfg, idx), caughtIdx: idx, score, perfect, headline: perfect ? 'PERFECT PURSE' : 'Purse closed', delay: 900, tip: !cfg.pool.length ? 'The ring closed around empty water. Circle tighter around the dark patch while the gulls are diving.' : leak > .3 ? 'Too many fish slipped through the gap. Close the ring fully before pursing, and hit the beats cleanly.' : acc < .6 ? 'Missed beats let the purse line go slack. Try the steady tempo (Space) for wider timing windows.' : 'Nice rhythm — the purse line came in smooth.' };
  };
  G.update = (dt: number) => {
    if (G.result) return; G.t += dt; G.next -= dt; const dtBeat = G.fast ? .5 : .82;
    if (G.next <= 0 && G.t < 44) { G.notes.push({ lane: R() < .5 ? 0 : 1, t: 0 }); G.next += dtBeat; }
    for (const n of G.notes) n.t += dt; const dueFall = 1.35;
    for (const n of G.notes) if (!n.done && n.t > dueFall + win() + .05) { n.done = true; G.miss++; G.combo = 0; G.slack += .8; G.c = Math.max(0, G.c - .03); G.flashes.push({ lane: n.lane, c: '#ff6a5a', t: 0 }); }
    G.notes = G.notes.filter((n: any) => n.t < dueFall + .6); G.slack = Math.max(0, G.slack - dt * .5);
    const gapW = gapBase * (1 - G.c) + G.slack * .25 * (1 - G.c * .6);
    for (const f of fish) { if (f.leaked) continue; f.a += f.w * dt * (1 + .4 * G.c); f.ph += dt * 6; const ang = ((f.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); if (gapW > .05 && Math.abs(ang - Math.PI / 2) < gapW / 2 && f.r > .55 && R() < dt * .45) f.leaked = true; }
    G.leakN = fish.filter((f: any) => f.leaked).length; G.gapW = gapW;
    if (G.c >= 1 || G.t > 50) finish();
  };
  const press = (lane: number) => {
    let best: any = null, bd = 1e9; for (const n of G.notes) if (!n.done && n.lane === lane) { const d = Math.abs(n.t - 1.35); if (d < bd) { bd = d; best = n; } }
    if (best && bd < win() * 1.8) { best.done = true; const perfect = bd < win() * .5, pull = .045 * winch * (G.fast ? 1.45 : 1) * (perfect ? 1 : .6); G.c = Math.min(1, G.c + pull); G.hits++; if (perfect) G.perfects++; G.combo++; G.best = Math.max(G.best, G.combo); G.flashes.push({ lane, c: perfect ? '#ffe28a' : '#8fe0b0', t: 0 }); }
    else { G.miss++; G.combo = 0; G.slack += .5; G.flashes.push({ lane, c: '#ff6a5a', t: 0 }); }
  };
  G.key = (e: KeyboardEvent, d: boolean) => { if (!d) return; if (e.code === 'KeyF' || e.code === 'ArrowLeft' || e.code === 'KeyA') press(0); else if (e.code === 'KeyJ' || e.code === 'ArrowRight' || e.code === 'KeyD') press(1); else if (e.code === 'Space') G.fast = !G.fast; };
  G.pointer = (t: string, x: number, y: number) => { if (t !== 'down') return; if (x > 470 && x < 620 && y > 70) press(0); else if (x >= 620 && y > 70) press(1); else if (x > 470 && y < 70) G.fast = !G.fast; };
  G.draw = (c: CanvasRenderingContext2D) => {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2d93b5'); g.addColorStop(1, '#0c3552'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rad = Rr * (1 - .84 * G.c); c.strokeStyle = 'rgba(255,255,255,.08)'; for (let i = 1; i < 4; i++) { c.beginPath(); c.arc(cx, cy, Rr * i / 3, 0, 7); c.stroke(); }
    for (const f of fish) { if (f.leaked) { continue; } const rr = f.r * rad; drawFish(c, cx + Math.cos(f.a) * rr, cy + Math.sin(f.a) * rr, Math.max(7, f.sp.len * 40), f.sp, f.a + (f.w > 0 ? Math.PI / 2 : -Math.PI / 2), f.ph, f.keep ? 1 : .55); }
    // leaked fish fly out the gap
    c.strokeStyle = 'rgba(245,240,215,.95)'; c.lineWidth = 5; c.beginPath(); const gw = G.gapW || 0, a0 = Math.PI / 2 + gw / 2, a1 = Math.PI / 2 - gw / 2 + Math.PI * 2; c.arc(cx, cy, rad, a0, a1); c.stroke();
    c.fillStyle = '#ff6a1a'; for (let i = 0; i < 28; i++) { const a = a0 + (a1 - a0) * i / 27; c.beginPath(); c.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 3.5, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5; c.setLineDash([4, 5]); c.beginPath(); c.arc(cx, cy, rad - 6, 0, 7); c.stroke(); c.setLineDash([]);
    if (gw > .05) { c.fillStyle = 'rgba(255,100,80,.8)'; c.font = '600 12px system-ui'; c.fillText('gap — fish leak!', cx - 44, cy + rad + 22); }
    // rhythm lanes
    c.fillStyle = 'rgba(6,18,30,.55)'; c.beginPath(); c.roundRect(480, 36, 290, 380, 16); c.fill();
    for (let l = 0; l < 2; l++) { const x = 480 + 20 + l * 135, sway = Math.sin(G.t * 1.7 + l) * 5 * env.seaDiff; c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x + sway, 50, 115, 340); c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(x + sway, lineY - 3, 115, 4);
      c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '600 12px system-ui'; c.fillText(l ? 'J / →' : 'F / ←', x + 38, lineY + 22);
      for (const n of G.notes) if (n.lane === l && !n.done) { const y = 50 + (lineY - 50) * (n.t / 1.35); c.fillStyle = '#ffd27a'; c.strokeStyle = '#7a5a2e'; c.lineWidth = 2; c.beginPath(); c.roundRect(x + 14 + sway, y - 10, 87, 20, 10); c.fill(); c.stroke(); } }
    for (const f of G.flashes) { f.t += .03; const x = 500 + f.lane * 135; c.fillStyle = f.c; c.globalAlpha = Math.max(0, 1 - f.t * 2); c.fillRect(x, lineY - 14, 115, 22); c.globalAlpha = 1; } G.flashes = G.flashes.filter((f: any) => f.t < .5);
    c.fillStyle = 'rgba(8,20,32,.7)'; c.fillRect(0, 0, 470, 28); c.fillStyle = '#fff'; c.font = '600 13px system-ui'; c.fillText(`Inside: ${fish.length - G.leakN} fish · leaked ${G.leakN}`, 12, 19); c.font = '11px ui-monospace,monospace'; c.fillStyle = '#bfe3f0'; c.fillText(`combo ${G.combo} · best ${G.best} · winch ${Math.round(winch * 100)}%`, 250, 19);
    bar(c, 16, H - 44, 230, 14, G.c, '#7be0a8', 'purse closed'); c.fillStyle = G.fast ? '#ffb347' : '#cfeeff'; c.font = '600 12px system-ui'; c.fillText(G.fast ? '▶▶ FAST haul (Space)' : '▶ STEADY haul (Space)', 262, H - 33);
    if (G.result) { c.fillStyle = 'rgba(5,14,24,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = G.result.perfect ? '#ffe28a' : '#fff'; c.font = '700 32px system-ui'; c.textAlign = 'center'; c.fillText(G.result.headline, W / 2, H / 2); c.textAlign = 'left'; }
  };
  return G;
}
export function SeineGame({ cfg, onDone }: any) {
  return (<Frame title="Purse Seine — Pursing Rhythm" cfg={cfg} tagline="Haul the purse line in time with the beats. Each clean pull closes the ring; every miss lets it slacken and the fish leak out through the gap. Fast tempo closes quicker but the windows are narrow." keysHint="F / ← and J / → (or click the lanes) on the beat · Space toggles steady / fast tempo">
    <GameCanvas cfg={cfg} factory={seineFactory} onDone={onDone} help={{ title: 'Purse seine — draw the purse line', goal: 'Close the ring under the school before time runs out, without letting fish leak through the gap.', steps: ['The ring of net is closed. Beats fall down the two lanes on the right.', 'Press F (or ← / A, or click the left lane) for the LEFT lane and J (or → / D, or click the right lane) for the RIGHT lane exactly when a beat reaches the line.', 'Every clean pull tightens the purse line and shrinks the ring; every miss slackens it and widens the leak gap.', 'Space toggles fast tempo: closes quicker but the timing window is narrower.', 'Fish that leak out of the gap are gone; the closer the ring, the more you keep.'], tip: 'Start with the steady tempo until the rhythm feels natural.' }} /></Frame>);
}

/* ============================================================ GILLNET ============================================================ */
function gillFactory(cfg: any) {
  const net = cfg.net, env = cfg.env, mesh = net.mesh[cfg.meshIdx], rep = Math.max(1, Math.ceil(cfg.pool.length / 42)), top = 40;
  const items: any[] = []; cfg.pool.forEach((p: any, i: number) => { if (i % rep) return; const sp = SPECIES[p.sp], juv = R() < .16; items.push({ i, p, sp, kind: 'fish', juv, need: Math.max(1, Math.min(3, Math.round(p.tangle + (retention(p.len, mesh, 'gill') > .6 ? 1 : 0)) - 1 + 1)), prog: 0, x: 0, y: 70 + R() * 270, ph: R() * 7, state: 'belt', keepRoll: retention(p.len, mesh, 'gill') > .12 }); });
  for (let k = 0; k < (cfg.bycatch || 0); k++) items.push({ i: -1, kind: 'by', need: 2, prog: 0, x: 0, y: 70 + R() * 270, state: 'belt', ph: 0, name: R() < .5 ? 'turtle' : 'dolphin' });
  items.sort(() => R() - .5); const total = items.length; items.forEach((it, k) => { it.spawn = 1 + k * (36 / Math.max(total, 1)) + R() * .5; });
  const cfg2 = { ...cfg, mult: (cfg.mult || 1) * rep };
  const G: any = { t: 0, kept: [], lost: 0, freed: 0, harmed: 0, wrong: 0, released: 0, result: null, fx: [], sel: null };
  const speed = (t: number) => 46 + t * .9 + env.seaDiff * 8, keepers = items.filter((i) => i.kind === 'fish' && !i.juv && i.keepRoll).length;
  const finish = () => {
    const idx = G.kept.map((it: any) => it.i), clean = !G.harmed && !G.wrong && G.lost <= 1 && keepers >= 3, score = keepers ? clamp(G.kept.filter((i: any) => !i.juv).length / keepers, 0, 1) : 0;
    G.result = { caught: tally({ ...cfg2, pool: cfg.pool }, idx), caughtIdx: idx, score, perfect: clean, headline: clean ? 'PERFECT PICK' : 'Net cleared', delay: 900, fine: G.harmed * 80 + G.wrong * 20,
      tip: !total ? 'The gillnet came up empty — it soaked where no fish passed. Set it across the path of a school, and soak longer at dusk or dawn.' : G.harmed ? 'Bycatch was harmed. Free turtles and dolphins first — they glow red-ringed — before picking fish.' : G.lost > keepers * .4 ? 'The drum swallowed many fish. Work from the left edge first, and free the multi-tangled ones early.' : G.wrong ? 'Juveniles must be released (right-click / Shift-click).' : 'Tidy sorting.' };
  };
  G.update = (dt: number) => {
    if (G.result) return; G.t += dt; const v = speed(G.t);
    for (const it of items) { if (it.state === 'wait') continue; if (G.t < it.spawn) continue; if (it.x === 0 && it.state === 'belt') it.x = W + 40; if (it.state !== 'belt') continue; it.x -= v * dt; it.ph += dt * 6;
      if (it.x < 52) { it.state = 'drum'; if (it.kind === 'by') { G.harmed++; G.fx.push({ x: 60, y: it.y, t: 0, c: '#ff5a4a', s: 'harmed!' }); } else if (!it.juv) { G.lost++; G.fx.push({ x: 60, y: it.y, t: 0, c: '#ffb347', s: 'lost' }); } } }
    if (items.every((it) => it.state !== 'belt' && G.t > it.spawn - .01)) finish();
  };
  const act = (x: number, y: number, release: boolean) => {
    let best: any = null, bd = 34; for (const it of items) if (it.state === 'belt' && it.x < W && it.x > 40) { const d = Math.hypot(it.x - x, it.y - y); if (d < bd) { bd = d; best = it; } }
    if (!best) return; best.prog++; best.flash = 1; tick('x');
    if (best.prog >= best.need) {
      if (best.kind === 'by') { best.state = 'free'; G.freed++; G.fx.push({ x: best.x, y: best.y, t: 0, c: '#8fe0b0', s: 'freed ♥' }); }
      else if (release) { best.state = 'free'; if (best.juv) { G.released++; G.fx.push({ x: best.x, y: best.y, t: 0, c: '#8fe0b0', s: 'released' }); } else { G.fx.push({ x: best.x, y: best.y, t: 0, c: '#cfe', s: 'released' }); G.lost++; } }
      else { best.state = 'kept'; if (best.juv) { G.wrong++; G.fx.push({ x: best.x, y: best.y, t: 0, c: '#ff9a7a', s: 'undersize −$20' }); } else G.fx.push({ x: best.x, y: best.y, t: 0, c: '#ffe28a', s: '+$' + SPECIES[best.sp.id].value.toFixed(0) }); if (best.keepRoll || best.juv) G.kept.push(best); }
    }
  };
  const tick = (_: string) => {};
  G.pointer = (t: string, x: number, y: number, e: PointerEvent) => { if (t === 'down') act(x, y, e.button === 2 || e.shiftKey); G.mx = x; G.my = y; if (t === 'move') { G.mx = x; G.my = y; } };
  G.key = (e: KeyboardEvent, d: boolean) => { if (d && e.code === 'KeyR' && G.mx) act(G.mx, G.my, true); if (d && e.code === 'Space' && G.mx) act(G.mx, G.my, false); };
  G.draw = (c: CanvasRenderingContext2D) => {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#28323a'); g.addColorStop(1, '#171d22'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = '#3a4a42'; c.fillRect(0, top, W, 330); c.strokeStyle = 'rgba(200,230,200,.18)'; c.lineWidth = 1; const off = (G.t * speed(G.t)) % 24; for (let x = -24 + (24 - off); x < W; x += 24) { c.beginPath(); c.moveTo(x, top); c.lineTo(x + 40, top + 330); c.moveTo(x, top + 330); c.lineTo(x + 40, top); c.stroke(); }
    c.fillStyle = '#c9a96a'; c.fillRect(0, top - 4, W, 4); c.fillRect(0, top + 330, W, 4); c.fillStyle = '#6a3a22'; c.fillRect(0, top, 46, 330); c.fillStyle = 'rgba(255,255,255,.25)'; for (let y = top; y < top + 330; y += 16) c.fillRect(8, y + ((G.t * 40) % 16), 30, 3);
    for (const it of items) { if (it.state !== 'belt' || it.x > W + 30) continue; const sh = Math.sin(it.ph) * 3 * (1 + env.seaDiff * 2);
      if (it.kind === 'by') { c.fillStyle = '#4c6b5c'; c.beginPath(); c.ellipse(it.x, it.y + sh, 26, 16, 0, 0, 7); c.fill(); c.fillStyle = '#6b8c78'; c.beginPath(); c.arc(it.x + 24, it.y + sh - 2, 8, 0, 7); c.fill(); c.strokeStyle = '#ff5a4a'; c.lineWidth = 3; c.beginPath(); c.arc(it.x, it.y + sh, 36, 0, 7); c.stroke(); c.fillStyle = '#fff'; c.font = '10px system-ui'; c.fillText(it.name, it.x - 14, it.y + sh + 30); }
      else { drawFish(c, it.x, it.y + sh, Math.max(16, it.sp.len * (it.juv ? 38 : 70)), it.sp, it.ph * .05 + .2, it.ph, 1, it.flash > 0 ? 1 : 0); c.strokeStyle = 'rgba(240,235,210,.6)'; c.lineWidth = 1; c.beginPath(); c.arc(it.x, it.y + sh, 22, 0, 7); c.stroke(); if (it.juv) { c.fillStyle = '#ff9a7a'; c.font = '600 10px system-ui'; c.fillText('undersize', it.x - 20, it.y + sh - 24); } }
      c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(it.x - 16, it.y + sh + 22, 32, 5); c.fillStyle = '#ffe28a'; c.fillRect(it.x - 16, it.y + sh + 22, 32 * it.prog / it.need, 5); it.flash = Math.max(0, (it.flash || 0) - .05); }
    for (const f of G.fx) { f.t += .02; c.globalAlpha = Math.max(0, 1 - f.t); c.fillStyle = f.c; c.font = '700 13px system-ui'; c.fillText(f.s, f.x, f.y - f.t * 40); c.globalAlpha = 1; } G.fx = G.fx.filter((f: any) => f.t < 1);
    c.fillStyle = 'rgba(8,20,32,.85)'; c.fillRect(0, 0, W, 34); c.fillStyle = '#fff'; c.font = '600 13px system-ui'; c.fillText(`Kept ${G.kept.length} · lost ${G.lost} · freed ${G.freed} · ${cfg.hours}h soak${rep > 1 ? ' · each item = ' + rep + ' fish' : ''}`, 12, 22);
    c.font = '11px ui-monospace,monospace'; c.fillStyle = '#bfe3f0'; c.fillText(`mesh ${mesh} mm`, W - 100, 22);
    c.fillStyle = 'rgba(8,20,32,.7)'; c.fillRect(0, H - 56, W, 56); c.fillStyle = '#fff'; c.font = '12px system-ui'; c.fillText('Click fish to free them → keep · right-click / Shift-click = release undersize · free red-ringed bycatch first', 14, H - 28);
    if (G.result) { c.fillStyle = 'rgba(5,14,24,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = G.result.perfect ? '#ffe28a' : '#fff'; c.font = '700 32px system-ui'; c.textAlign = 'center'; c.fillText(G.result.headline, W / 2, H / 2); c.textAlign = 'left'; }
  };
  return G;
}
export function GillGame({ cfg, onDone }: any) {
  return (<Frame title="Gillnet — Pick the Net" cfg={cfg} tagline="The net rolls over the drum. Fish are tangled — click them free before they reach it, keep the good ones, release undersize, and free any bycatch gently. Mesh matched to the fish tangles them harder." keysHint="Click = free / keep · right-click or Shift-click = release · bycatch is red-ringed">
    <GameCanvas cfg={cfg} factory={gillFactory} onDone={onDone} help={{ title: 'Gillnet — pick the net', goal: 'Free the good fish, release undersize ones and save any bycatch before the drum swallows them.', steps: ['The net rolls in from the right. Fish are tangled in the mesh.', 'CLICK a fish repeatedly to untangle it (the number of clicks depends on how tangled it is). A freed fish is KEPT.', 'RIGHT-CLICK or SHIFT-CLICK a fish to RELEASE it. Do this for small juveniles and for turtles / dolphins (bycatch).', 'Whatever reaches the drum on the left is lost — work from the left edge first.', 'Harming bycatch or keeping undersize fish costs you a fine.'], tip: 'Mesh that matches the fish size tangles more fish.' }} /></Frame>);
}
