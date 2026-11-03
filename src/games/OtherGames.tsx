// @ts-nocheck
/* TRAWL  — "Hold the Lane": a depth-keeping + tow-power game (steering a lagging winch through scrolling fish layers, rocks and tension).
   SEINE  — "Pursing Rhythm": a two-lane rhythm game; every on-beat pull tightens the purse line and closes the leak gap under the ring.
   GILL   — "Pick the Net": a sorting conveyor; fish are tangled in the mesh and must be freed (several clicks) and sorted keep / release before the drum swallows them. */
import { SPECIES, clamp } from '../game/config.js';
import { retention } from '../game/netgen.js';
import { Frame, GameCanvas, W, H, R, drawFish, sea, bar, keepRoll, tally, hex } from './common';

/* ============================================================ TRAWL ============================================================ */
function trawlFactory(cfg: any) {
  const net = cfg.net, comp = cfg.comp, Dm = Math.min(13.5, cfg.seabed - .5), top = 34, ppm = (H - 120) / Dm, mx = 170, N = cfg.pool.length, span = 33;
  const fish = cfg.pool.map((p: any, i: number) => ({ i, p, sp: SPECIES[p.sp], x: W + 30 + 200, y: p.depth, spawn: (i + R() * .6) / Math.max(N, 1) * span, state: 'wait', keep: keepRoll(p, cfg), lat: R(), ph: R() * 7, vy: 0 }));
  const rocks: any[] = []; for (let i = 0; i < 6; i++) rocks.push({ x: 300 + i * 190 + R() * 80, h: .8 + R() * 1.6, w: 60 + R() * 40 });
  const lag = 1.7 / (1 + net.weight / 300 + comp.strain * 1.1), openBase = clamp(cfg.opening * (.55 + .45 * comp.openMul), .22, 1);
  const G: any = { t: 0, y: Math.min(cfg.depth || 3, Dm - 1), target: Math.min(cfg.depth || 3, Dm - 1), surge: false, tension: .08, over: 0, snags: 0, caught: [], escaped: 0, missed: 0, result: null, snagT: 0, scroll: 0, fx: [] };
  const potential = fish.filter((f: any) => f.keep).length;
  const finish = (why: string) => {
    let kept = G.caught.filter((f: any) => f.keep); if (why === 'overload') kept = kept.filter(() => R() > .3);
    const idx = kept.map((f: any) => f.i), score = potential ? clamp(idx.length / potential, 0, 1) : 0, perfect = potential >= 3 && score >= .85 && !G.snags && why === 'done';
    G.result = { caught: tally(cfg, idx), caughtIdx: idx, score, perfect, headline: why === 'overload' ? 'Winch overload — hauling early' : perfect ? 'PERFECT TOW' : 'Trawl hauled', delay: 900,
      tip: !N ? 'The trawl swept an empty patch. Tow through dark patches and gull-marked water, then haul.' : why === 'overload' ? `The ${net.name} is too big for this boat (${comp.label.toLowerCase()}). A smaller net or a stronger boat keeps the tension down.` : G.snags ? 'A rock snagged the net. Keep the lower edge of the mouth clear of the seabed.' : G.missed > idx.length ? 'Many fish passed over or under the mouth — match the winch depth to the layer.' : 'Smooth tow. Surge only when fast fish are about to pass.' };
  };
  G.update = (dt: number) => {
    if (G.result) return; G.t += dt; const surge = G.surge ? 1 : 0, spdK = (1 + .55 * surge) * (G.snagT > 0 ? .5 : 1), scroll = 105 * spdK * clamp(.6 + comp.speedMul * .5, .5, 1.1); G.scroll += scroll * dt; G.snagT = Math.max(0, G.snagT - dt);
    const prev = G.y; G.y += clamp(G.target - G.y, -lag * 1.4, lag * 1.4) * Math.min(1, dt * 2) * 1.0; const dy = Math.abs(G.y - prev) / dt;
    const open = clamp(openBase * (.7 + .3 * clamp(spdK, 0, 1.4)) , .15, 1), Hpx = net.mouthH * ppm * open * 1.15 + 14;
    G.Hpx = Hpx; G.open = open;
    G.tension += ((comp.strain * .08 + surge * (.26 + .15 * comp.strain) + dy * .04 + (G.snagT > 0 ? .5 : 0)) - (surge ? 0 : .13 + .05 * (1 - comp.strain)) * (G.tension > .1 ? 1 : 0) ) * dt; G.tension = clamp(G.tension, 0, 1.05);
    G.over = G.tension >= 1 ? G.over + dt : Math.max(0, G.over - dt);
    for (const r of rocks) { r.x -= scroll * dt; if (r.x < -120) { r.x += 1200; r.h = .8 + R() * 1.6; } if (Math.abs(r.x - mx) < r.w * .5 + 14 && G.y + net.mouthH * open / 2 > Dm - r.h && G.snagT <= 0) { G.snagT = 1.1; G.snags++; G.tension = Math.min(1.05, G.tension + .35); G.fx.push({ x: mx, y: top + (Dm - r.h / 2) * ppm, t: 0 }); for (const f of G.caught) if (R() < .12) { f.lost = true; } G.caught = G.caught.filter((f: any) => !f.lost); } }
    for (const f of fish) {
      if (f.state === 'wait') { if (G.t >= f.spawn) { f.state = 'swim'; f.x = W + 20; } continue; } if (f.state !== 'swim') continue;
      f.ph += dt * 9; const away = f.sp.speed * 14; f.x -= (scroll - away) * dt; const dx = f.x - mx;
      if (dx < 130 && dx > 5 && Math.abs(f.y - G.y) * ppm > Hpx / 2 - 6 && R() < dt * f.sp.shy * .9 * clamp(f.sp.speed / 3, .3, 1.2)) f.vy = (f.y > G.y ? 1 : -1) * f.sp.dive * .8;   // fast, shy fish dodge out of the mouth
      f.y = clamp(f.y + f.vy * dt, .5, Dm - .3);
      if (dx <= 0 && dx > -14) { const hit = Math.abs(f.y - G.y) * ppm < Hpx / 2 && f.lat < clamp(net.mouthW / 14, .35, 1) * (.75 + .25 * open); if (hit) { f.state = 'in'; G.caught.push(f); } else { f.state = 'gone'; G.missed++; } }
    }
    if (fish.every((f: any) => f.state === 'in' || f.state === 'gone') || G.t > 38) finish('done'); else if (G.over > 1.8) finish('overload');
  };
  G.key = (e: KeyboardEvent, d: boolean) => { if (e.code === 'Space' || e.code === 'ShiftLeft') G.surge = d; if (d) { if (e.code === 'KeyW' || e.code === 'ArrowUp') G.target = clamp(G.target - 1, .8, Dm - 1); if (e.code === 'KeyS' || e.code === 'ArrowDown') G.target = clamp(G.target + 1, .8, Dm - 1); } };
  G.pointer = (t: string, x: number, y: number) => { if (t === 'move' || t === 'down') G.target = clamp((y - top - 3) / ppm, .8, Dm - 1); };
  G.draw = (c: CanvasRenderingContext2D) => {
    sea(c, G.t, Dm, top, H - 52, ppm); const sb = top + 3 + Dm * ppm;
    c.fillStyle = '#6d5b3e'; c.fillRect(0, sb, W, 40); for (const r of rocks) { c.fillStyle = '#4b4e53'; c.beginPath(); c.moveTo(r.x - r.w / 2, sb); c.quadraticCurveTo(r.x, sb - r.h * ppm * 1.5, r.x + r.w / 2, sb); c.fill(); }
    for (const f of fish) { if (f.state !== 'swim') continue; drawFish(c, f.x, top + 3 + f.y * ppm, Math.max(8, f.sp.len * 46), f.sp, Math.PI, f.ph, f.keep ? 1 : .55); }
    const my = top + 3 + G.y * ppm, Hp = G.Hpx || 40; // net cone + mouth
    c.fillStyle = 'rgba(235,235,215,.16)'; c.strokeStyle = 'rgba(240,235,210,.8)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(mx, my - Hp / 2); c.lineTo(mx + 280, my - 8); c.lineTo(mx + 280, my + 8); c.lineTo(mx, my + Hp / 2); c.closePath(); c.fill(); c.stroke();
    c.save(); c.clip(); c.strokeStyle = 'rgba(240,235,210,.25)'; for (let x = mx - (G.scroll % 18); x < mx + 300; x += 18) { c.beginPath(); c.moveTo(x, my - Hp); c.lineTo(x + 40, my + Hp); c.stroke(); } c.restore();
    c.strokeStyle = '#3a2b14'; c.lineWidth = 6; c.beginPath(); c.moveTo(mx, my - Hp / 2); c.lineTo(mx, my + Hp / 2); c.stroke(); c.strokeStyle = '#c9a96a'; c.lineWidth = 2; c.beginPath(); c.moveTo(mx, my); c.lineTo(0, top - 10); c.stroke();
    c.fillStyle = '#ff6a1a'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(mx, my - Hp / 2 + i * 0, 4, 0, 7); } for (const f of G.caught) { const k = f.i * 37 % 100; drawFish(c, mx + 120 + (k % 10) * 14, my + (k % 7 - 3) * 2.2, 11, f.sp, Math.PI, G.t * 8); }
    for (const e of G.fx) { e.t += .02; c.strokeStyle = `rgba(255,200,120,${1 - e.t})`; c.beginPath(); c.arc(e.x, e.y, 10 + e.t * 40, 0, 7); c.stroke(); } G.fx = G.fx.filter((e: any) => e.t < 1);
    c.fillStyle = 'rgba(8,20,32,.7)'; c.fillRect(0, 0, W, 28); c.fillStyle = '#fff'; c.font = '600 13px system-ui'; c.fillText(`In the bag: ${G.caught.length} fish (~$${Math.round(G.caught.reduce((s: number, f: any) => s + f.sp.value, 0))})`, 12, 19);
    c.font = '11px ui-monospace,monospace'; c.fillStyle = '#bfe3f0'; c.fillText(`mouth ${(net.mouthW * (G.open || 1)).toFixed(1)}×${(net.mouthH * (G.open || 1)).toFixed(1)} m · opening ${Math.round((G.open || 0) * 100)}% · ${comp.label}`, 300, 18);
    bar(c, 16, H - 44, 230, 14, G.tension, G.tension > .75 ? '#ff6a5a' : '#ffc060', 'winch tension'); bar(c, 16, H - 24, 230, 14, G.t / 38, '#8fd0ff', 'tow time'); c.fillStyle = G.surge ? '#ffb347' : 'rgba(255,255,255,.7)'; c.font = '600 13px system-ui'; c.fillText(G.surge ? 'SURGE!' : 'steady tow', 280, H - 28);
    if (G.result) { c.fillStyle = 'rgba(5,14,24,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = G.result.perfect ? '#ffe28a' : '#fff'; c.font = '700 32px system-ui'; c.textAlign = 'center'; c.fillText(G.result.headline, W / 2, H / 2); c.textAlign = 'left'; }
  };
  return G;
}
export function TrawlGame({ cfg, onDone }: any) {
  return (<Frame title="Trawl — Hold the Lane" cfg={cfg} tagline="Move the mouth to the depth where the fish layers pass. Your winch lags (heavy or oversized nets lag more), surging opens the mouth but loads the winch, and rocks snag low nets." keysHint="Mouse / W S moves the mouth up and down · hold Space or Shift to surge · keep tension below the red">
    <GameCanvas cfg={cfg} factory={trawlFactory} onDone={onDone} /></Frame>);
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
    <GameCanvas cfg={cfg} factory={seineFactory} onDone={onDone} /></Frame>);
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
    <GameCanvas cfg={cfg} factory={gillFactory} onDone={onDone} /></Frame>);
}
