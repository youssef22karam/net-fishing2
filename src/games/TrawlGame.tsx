// @ts-nocheck
/* TRAWL — "Haul the Bag".  The 3D tow decided what is in the codend (cfg.pool = the one and only catch list, cfg.towDepth = the real tow depth).
   Hold SPACE to wind the winch, keep the warp tension in the green band, ease off on surges and snags.  Performance may only SCALE the catch that is already aboard:
   fish can burst / spill out of the codend (lost), nothing is re-rolled, replaced or reset.  The bag is drawn rising from the REAL tow depth to the surface and
   every fish in it is alive: swimming, shifting, panicking when the bag rises or the warp tightens, pressing against the mesh. */
import { SPECIES, clamp } from '../game/config.js';
import { Frame, GameCanvas, W, H, R, drawFish, sea, bar, tally } from './common';

function trawlFactory(cfg: any) {
  const net = cfg.net, comp = cfg.comp, env = cfg.env, N = cfg.pool.length, Dm = Math.min(13.5, cfg.seabed - .5), top = 40, ppm = (H - 130) / Dm;
  const towDepth = clamp(cfg.towDepth ?? cfg.depth ?? 3, .5, Dm), load = clamp(N / (120 + net.mouthW * 14), 0, 1);
  const haulRate = .1 / (1 + load * .7 + comp.strain * .6) * (1 - .1 * env.seaDiff);   // fraction of the way up per second at full haul
  const G: any = { t: 0, pos: 0, T: .15, hold: false, inBand: 0, over: 0, lost: 0, surge: 0, snag: 0, nextSnag: 6 + R() * 5, snags: 0, fx: [], result: null, limit: 46, started: false, depthNow: towDepth, towDepth, N, rate: 0 };
  const lostFlag = new Array(N).fill(false), base = () => .14 + .3 * load + .22 * comp.strain;
  /* sprites: one per fish up to 110 (more fish = each sprite stands for several); they are real little simulated animals inside the bag */
  const NS = Math.min(N, 110), bwBase = 44 + 40 * load, sprites = Array.from({ length: NS }, (_, j) => {
    const fi = Math.floor(j * N / NS), a = R() * 6.283, r = Math.sqrt(R()); return { j, fi, sp: SPECIES[cfg.pool[fi].sp], x: Math.cos(a) * r * bwBase * .35, y: 14 + Math.sin(a) * r * 24, vx: (R() - .5) * 10, vy: (R() - .5) * 10, hd: R() * 6.283, ph: R() * 9, st: 'in', out: 0, side: R() < .5 ? -1 : 1, flash: 0, press: 0, wander: R() * 6 };
  });
  const bagPath = (c: CanvasRenderingContext2D, x0: number, bagY: number, bw: number, ext: number) => {
    c.beginPath(); c.moveTo(x0 - 14, bagY - 36); c.lineTo(x0 - bw / 2, bagY - 6); c.quadraticCurveTo(x0 - bw / 2 - 6, bagY + 36 + ext, x0, bagY + 44 + ext + 6); c.quadraticCurveTo(x0 + bw / 2 + 6, bagY + 36 + ext, x0 + bw / 2, bagY - 6); c.lineTo(x0 + 14, bagY - 36); c.closePath();
  };
  const finish = (why: string) => {
    const idx: number[] = []; for (let i = 0; i < N; i++) if (!lostFlag[i]) idx.push(i); const score = N ? idx.length / N : 0, band = G.inBand / Math.max(G.t, 1), perfect = N >= 3 && score >= .9 && band > .55;
    G.result = { caught: tally(cfg, idx), caughtIdx: idx, score, perfect, potential: N, codend: N, aboard: idx.length, lost: N - idx.length, delay: 900, headline: !N ? 'Empty bag' : why === 'time' ? 'Hauled too slowly' : perfect ? 'PERFECT HAUL' : 'Bag on deck',
      tip: why === 'time' ? 'You ran out of time with fish still in the water. Keep SPACE held while the tension is in the green.' : G.lost > N * .3 ? 'The codend burst open whenever tension hit the red. Ease off on surges and on snags.' : band < .4 ? 'Stay in the green band — lots of time in slack or red costs fish.' : 'Smooth haul.' };
  };
  const loseOne = () => {
    const alive = lostFlag.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0); if (!alive.length) return; lostFlag[alive[(R() * alive.length) | 0]] = true; G.lost++; G.fx.push({ t: 0, s: '−fish' });
    const need = Math.round(NS * (N - G.lost) / N), vis = sprites.filter((s) => s.st === 'in'); if (vis.length > need && vis.length) { const s = vis[(R() * vis.length) | 0]; s.st = 'out'; s.out = 0; }
  };
  G.update = (dt: number) => {
    if (G.result) { sim(dt); return; } G.t += dt; G.surge = Math.sin(G.t * 1.9 + 1) * (.07 + .1 * env.seaDiff) + Math.sin(G.t * .8) * .04;
    G.nextSnag -= dt; if (G.nextSnag <= 0 && G.pos < .85 && towDepth > Dm - 4) { G.snag = .9; G.snags++; G.nextSnag = 9 + R() * 6; G.fx.push({ t: 0, s: 'snag!' }); } else if (G.nextSnag <= 0) G.nextSnag = 8 + R() * 6;
    G.snag = Math.max(0, G.snag - dt);
    const tgt = base() + (G.hold ? .36 + .12 * comp.strain : 0) + G.surge + (G.snag > 0 ? .4 : 0); G.T += (tgt - G.T) * Math.min(1, dt * 3.2); G.T = clamp(G.T, 0, 1.1);
    const p0 = G.pos; if (G.hold && G.T < 1) G.pos = Math.min(1, G.pos + haulRate * dt * (G.T > .75 ? .5 : 1) * (G.snag > 0 ? .3 : 1));
    G.rate = (G.pos - p0) / Math.max(dt, 1e-3); G.depthNow = towDepth * (1 - G.pos);
    if (G.T >= .3 && G.T <= .72) G.inBand += dt;
    // tension in the red bursts fish out of the codend; slack lets the bag sag and spill a few — only ever REMOVES fish from the catch that is already aboard
    const risk = G.T > .86 ? (G.T - .86) * 7 + .25 : G.T < .1 && G.pos > .05 ? .12 : 0; G.over = risk;
    for (let i = 0; i < N; i++) { if (lostFlag[i]) continue; if (R() < risk * dt * .22 / Math.max(1, N / 14)) loseOne(); }
    sim(dt); if (G.pos >= 1) finish('done'); else if (G.t > G.limit) finish('time');
  };
  /* ---- the fish: wander, flock loosely, panic with depth change + tension, press the mesh, shift with the bag ---- */
  const sim = (dt: number) => {
    const panic = clamp(G.rate * 9 + Math.max(0, G.T - .66) * 3.2 + (G.snag > 0 ? 1.4 : 0) + (G.hold ? .25 : 0), 0, 1.6), squeeze = clamp((G.T - .45) / .6, 0, 1), bw = bwBase * (1 - .2 * squeeze), rx = bw / 2 - 5, ry = 30 + load * 20 + 5 * squeeze, cy = 12 + load * 10;
    G.panic = panic; G.bw = bw; G.sway = Math.sin(G.t * 1.7) * (1 - G.T) * 6 + Math.sin(G.t * 3.1) * panic * 2;
    for (const s of sprites) {
      if (s.st === 'out') { s.out += dt; s.x += s.side * 70 * dt; s.y += 40 * dt; s.hd = s.side > 0 ? .3 : Math.PI - .3; continue; }
      s.wander += (R() - .5) * dt * (5 + panic * 9); const spd = 11 + 9 * s.sp.speed * .3 + panic * 46; s.hd += Math.sin(s.wander) * dt * (2 + panic * 4);
      let ax = Math.cos(s.hd) * spd - s.vx, ay = Math.sin(s.hd) * spd * .7 - s.vy;
      ax += -G.sway * 1.2 * dt * 60 * .05; ay += (G.rate > 0 ? 55 * G.rate * 10 : 0) * .08 + (G.T < .3 ? 10 : -6);                 // the bag is pulled up: fish are pushed down; slack bag sags
      for (let k = 1; k <= 3; k++) { const o = sprites[(s.j + k * 7) % NS]; if (o === s || o.st !== 'in') continue; const dx = s.x - o.x, dy = s.y - o.y, d2 = dx * dx + dy * dy + .01; if (d2 < 150) { const d = Math.sqrt(d2); ax += dx / d * 55; ay += dy / d * 55; } }
      s.vx += ax * dt * 2.2; s.vy += ay * dt * 2.2; s.x += s.vx * dt; s.y += s.vy * dt;
      const nx = s.x / rx, ny = (s.y - cy) / ry, rr = Math.hypot(nx, ny); s.press += (((rr > .82 ? 1 : 0) * (.4 + squeeze * .6)) - s.press) * Math.min(1, dt * 4);
      if (rr > 1) { s.x = s.x / rr * .98; s.y = cy + (s.y - cy) / rr * .98; const dot = (s.vx * nx / rx + s.vy * ny / ry); s.vx -= nx / rx * dot * 1.6 * rx * rx / 100 * .1; s.vy -= ny / ry * dot * 1.6 * ry * ry / 100 * .1; s.hd += 2.2; }
      s.flash = Math.max(0, s.flash - dt * 2.5); if (panic > .7 && R() < dt * 1.2) s.flash = 1;
    }
  };
  G.key = (e: KeyboardEvent, d: boolean) => { if (e.code === 'Space' || e.code === 'KeyG' || e.code === 'KeyF') G.hold = d; };
  G.pointer = (t: string) => { if (t === 'down') G.hold = true; if (t === 'up') G.hold = false; };
  G.draw = (c: CanvasRenderingContext2D) => {
    sea(c, G.t, Dm, top, H - 60, ppm); const x0 = 250 + (G.sway || 0), bagY = top + 3 + G.depthNow * ppm + 10, bw = G.bw || bwBase, ext = load * 24 + G.T * 6, dk = Math.exp(-G.depthNow * .1);
    c.fillStyle = '#5b4a35'; c.fillRect(0, top - 34, 160, 34); c.fillStyle = '#c9b690'; c.fillRect(0, top - 40, 150, 8);   // boat stern
    // warps: catenaries that straighten as the tension rises (a slack warp sags, a tight one is a line)
    const tn = clamp(G.T / .8, 0, 1), sag = (1 - tn) * 80 * (.4 + .6 * clamp(G.depthNow / 6, .2, 1)) + 4;
    c.strokeStyle = '#d6c8a0'; c.lineWidth = 2.6; for (const [sx, sy, ex, ey] of [[132, top - 22, x0 - 12, bagY - 36], [150, top - 22, x0 + 12, bagY - 36]] as any) {
      c.beginPath(); for (let i = 0; i <= 24; i++) { const u = i / 24, x = sx + (ex - sx) * u, y = sy + (ey - sy) * u + Math.sin(u * Math.PI) * sag; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
    // net body + codend
    c.save(); bagPath(c, x0, bagY, bw, ext); c.fillStyle = `rgba(235,235,215,${.12 + .08 * dk})`; c.fill();
    c.clip(); c.strokeStyle = `rgba(240,235,210,${.16 + .2 * dk})`; c.lineWidth = 1; for (let x = x0 - 90; x < x0 + 90; x += 11) { c.beginPath(); c.moveTo(x, bagY - 42); c.lineTo(x + 46, bagY + 100); c.moveTo(x, bagY - 42); c.lineTo(x - 46, bagY + 100); c.stroke(); }
    // fish (inside the clip so the ones pressing the mesh are cut by it)
    const cyB = bagY + 6 + 0; for (const s of sprites) { if (s.st === 'out') continue; const len = Math.max(8, s.sp.len * 30 * (1 - .3 * load)) * (1 - .12 * s.press); drawFish(c, x0 + s.x, cyB + s.y, len, s.sp, s.hd, G.t * (6 + G.panic * 14) + s.ph, .55 + .45 * dk, s.flash); }
    c.fillStyle = `rgba(4,34,60,${.5 * (1 - dk)})`; c.fillRect(x0 - 100, bagY - 50, 200, 160); c.restore();
    c.strokeStyle = `rgba(240,235,210,${.5 + .4 * dk})`; c.lineWidth = 1.6; bagPath(c, x0, bagY, bw, ext); c.stroke();
    c.fillStyle = '#8a6d3b'; c.fillRect(x0 - 9, bagY + 38 + ext, 18, 5);   // codend tie
    for (const s of sprites) if (s.st === 'out') { const k = Math.min(1, s.out / 1.6); drawFish(c, x0 + s.x, cyB + s.y, Math.max(8, s.sp.len * 30 * (1 - .3 * load)), s.sp, s.hd, G.t * 12 + s.ph, (1 - k) * (.5 + .5 * dk)); }
    // panel
    c.fillStyle = 'rgba(8,20,32,.78)'; c.beginPath(); c.roundRect(470, 44, 310, 372, 16); c.fill();
    c.fillStyle = '#fff'; c.font = '600 14px system-ui'; c.fillText('WINCH', 490, 72); c.font = '12px system-ui'; c.fillStyle = '#bfe3f0';
    c.fillText(G.hold ? 'hauling…' : 'HOLD SPACE (or press the mouse button) to haul', 490, 92);
    const gx = 500, gy = 110, gh = 270, gw = 36; c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(gx, gy, gw, gh);
    const yT = (v: number) => gy + gh - gh * clamp(v / 1.1, 0, 1); c.fillStyle = 'rgba(255,90,70,.45)'; c.fillRect(gx, yT(1.1), gw, yT(.86) - yT(1.1)); c.fillStyle = 'rgba(110,230,150,.55)'; c.fillRect(gx, yT(.72), gw, yT(.3) - yT(.72)); c.fillStyle = 'rgba(255,200,90,.3)'; c.fillRect(gx, yT(.1), gw, yT(0) - yT(.1));
    c.fillStyle = '#fff'; c.fillRect(gx - 6, yT(G.T) - 2, gw + 12, 4); c.font = '11px ui-monospace,monospace'; c.fillText('tension', gx - 6, gy - 6); c.fillStyle = '#9ff0b8'; c.fillText('keep here', gx + gw + 8, (yT(.3) + yT(.72)) / 2 + 4); c.fillStyle = '#ff9a8a'; c.fillText('bursts fish', gx + gw + 8, yT(.98)); c.fillStyle = '#ffd890'; c.fillText('slack: spills', gx + gw + 8, yT(.04));
    bar(c, 640, 112, 120, 14, G.pos, '#7be0a8', 'bag up'); bar(c, 640, 136, 120, 14, G.t / G.limit, '#8fd0ff', 'time');
    const aboard = N - G.lost; c.fillStyle = '#fff'; c.font = '12px ui-monospace,monospace'; c.fillText(`fish aboard: ${aboard}/${N}`, 640, 180); c.fillText(`lost: ${G.lost}`, 640, 198);
    c.fillStyle = '#bfe3f0'; c.fillText(`depth ${G.depthNow.toFixed(1)} m`, 640, 222); c.fillText(`towed at ${towDepth.toFixed(1)} m`, 640, 240); c.fillText(`${comp.label}`, 640, 258);
    c.fillStyle = G.over > 0 ? '#ff7a6a' : G.T < .3 ? '#ffd890' : '#9ff0b8'; c.font = '600 13px system-ui'; c.fillText(G.snag > 0 ? 'SNAG — let go!' : G.T > .86 ? 'TOO TIGHT — ease off' : G.T < .3 ? (G.hold ? 'easy…' : 'pull!') : 'good tension', 640, 300);
    for (const e of G.fx) { e.t += .016; c.fillStyle = `rgba(255,170,120,${1 - e.t})`; c.font = '600 14px system-ui'; c.fillText(e.s, x0 + 40, bagY - 30 - e.t * 40); } G.fx = G.fx.filter((e: any) => e.t < 1);
    const val = Math.round(cfg.pool.reduce((s: number, p: any, i: number) => s + (lostFlag[i] ? 0 : SPECIES[p.sp].value), 0));
    c.fillStyle = 'rgba(8,20,32,.7)'; c.fillRect(0, 0, W, 28); c.fillStyle = '#fff'; c.font = '600 13px system-ui'; c.fillText(`Haul the bag — ${aboard} of ${N} fish in the codend (~$${val}) · net ${net.name}`, 12, 19);
    if (G.result) { c.fillStyle = 'rgba(5,14,24,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = G.result.perfect ? '#ffe28a' : '#fff'; c.font = '700 32px system-ui'; c.textAlign = 'center'; c.fillText(G.result.headline, W / 2, H / 2); c.font = '600 15px system-ui'; c.fillText(`${G.result.aboard} of ${N} fish aboard`, W / 2, H / 2 + 28); c.textAlign = 'left'; }
  };
  return G;
}
export function TrawlGame({ cfg, onDone }: any) {
  return (<Frame title="Trawl — Haul the Bag" cfg={cfg} tagline="Wind the codend up from the depth you towed at. The fish in it are the ones your tow swept up — wind it in without bursting the bag." keysHint="Hold Space / mouse button to haul · release on surges · stay in the green band">
    <GameCanvas cfg={cfg} factory={trawlFactory} onDone={onDone} help={{ title: 'Trawl — haul back the bag', goal: 'Bring the bag from its tow depth to the surface before time runs out and lose as few fish as possible.', steps: ['The fish in the codend are exactly the fish your 3D tow caught (right depth, right speed, mesh that holds them). Nothing is re-rolled.', 'HOLD SPACE (or the mouse button) to wind the winch. Hauling raises the warp tension; releasing lets it fall.', 'Keep the white marker in the GREEN band. In the red the codend bursts and fish escape; with slack the bag sags and spills.', 'The bag rises from the depth you towed at; the fish panic as it rises and when the warp tightens.', 'Bigger nets on a weak boat haul slower and strain more.'], tip: 'Tap-hold in short pulses — hold while tension is falling, let go as it climbs.' }} /></Frame>);
}
