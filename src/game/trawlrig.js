// @ts-nocheck
/* OTTER TRAWL.  Two steel otter boards, two warps, bridles, wings, a net body of real knotted mesh that narrows to a codend, head rope with floats, foot rope with lead.
   - VISUAL SIZE is decoupled from the raw stats: huge nets are drawn with a log-compressed size (trawlVisual) so even the biggest one is big but believable next to the boat.
     Capture uses the same (visual) mouth, so no fish is ever taken from outside the net you can see.
   - ROPES are real catenaries (segmented, solved every frame) between the boat's actual winch blocks (hull-local points -> world space, so they ride heave / pitch / roll)
     and the otter boards.  Rope length follows the slack the tow leaves; chord length comes from the live endpoints -> sag when slack, straight when tight.
   - CATCH is accumulated during the tow, fish by fish, in sweep(): a fish is taken when it crosses the mouth plane inside the mouth width AND the mouth height band
     around the net's real depth, minus the fish that slip through a mesh too large for them.  r.bag is the one and only catch list.
   - Net depth = the mouth centre.  The top of the mouth (and the boards) stay >= ~1 m below the surface while shooting / towing; the net only comes up while it is hauled aboard. */
import * as THREE from 'three';
import { clamp, lerp, sstep, TAU, SPECIES } from './config.js';
import { retention } from './netgen.js';
import { netMaterial, litMaterial, fishGeometry, fishMaterial } from './underwater.js';
import { Rope, ball, disposeGroup, netTwine, visCell } from './nets3d.js';

const logVis = (x, ref, k) => (x <= ref ? x : ref * (1 + k * Math.log(x / ref)));
export function trawlVisual(net, mi) {
  const W = logVis(net.mouthW, 9, .55), H = Math.min(logVis(net.mouthH, 2.6, .5), W * .5), doorH = clamp(.9 + .28 * Math.log(1 + net.mouthW), 1, 3.3);
  const cell = visCell(net, mi) * 2.1 * (1 + .3 * Math.log2(Math.max(1, W / 8)));   // mesh drawn coarser than life so the knotted netting stays readable
  return { W, H, doorH, doorL: doorH * 1.5, Lb: W * 1.25 + 4, wing: 4 + W * .35, bridle: 7 + W * .42, cell, rope: clamp(net.ropeMm * .0017, .022, .06) };
}

/* segmented catenary between A and B (arrays [x,y,z]) for a rope of length L; writes n points into out; returns the chord length */
export function catenary(A, B, L, n, out) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], h = Math.hypot(dx, dz), c = Math.hypot(h, dy);
  const line = () => { for (let i = 0; i < n; i++) { const t = i / (n - 1); out[i * 3] = A[0] + dx * t; out[i * 3 + 1] = A[1] + dy * t; out[i * 3 + 2] = A[2] + dz * t; } };
  if (L <= c * 1.0004 || h < .08) { line(); return c; }
  const rhs = Math.sqrt(Math.max(L * L - dy * dy, h * h * 1.0000001)); let lo = h * .02, hi = h * 4000;
  for (let i = 0; i < 64; i++) { const a = Math.sqrt(lo * hi); if (2 * a * Math.sinh(h / (2 * a)) > rhs) lo = a; else hi = a; }
  const a = Math.sqrt(lo * hi), sh = 2 * a * Math.sinh(h / (2 * a)), x0 = h / 2 - a * Math.asinh(dy / sh), y0 = A[1] - a * Math.cosh(x0 / a);
  for (let i = 0; i < n; i++) { const t = i / (n - 1), x = h * t; out[i * 3] = A[0] + dx * t; out[i * 3 + 1] = a * Math.cosh((x - x0) / a) + y0; out[i * 3 + 2] = A[2] + dz * t; }
  return c;
}

const NR = 12, NM = 20, MI = 3, NBODY = 8;   // rows (3 wing rows, mouth, 8 body rows), ring segments, mouth row index
const LOC = [[-1.02, 1.62, -4.3], [1.02, 1.62, -4.3]];   // warp blocks on the stern gallows, hull-local (hull faces +z, transom at z ~ -4.3)
let RIG_ID = 1;

export class TrawlRig {
  constructor(S, net, meshIdx, comp) {
    this.S = S; this.net = net; this.mi = meshIdx; this.comp = comp; this.id = RIG_ID++; const V = this.vis = trawlVisual(net, meshIdx);
    this.hist = []; this.head = { x: 0, z: 0 }; this.warp = 28; this.deploy = 0; this.depth = 1.8; this.vDepth = 0; this.bag = []; this.escaped = 0; this.swept = 0; this.spilled = 0; this.snag = 0;
    this.opening = 0; this.spread = 0; this.t = 0; this.tgt = 5; this.auto = false; this.hauling = false; this.winch = false; this.haulK = 0; this.winchT = 0; this.hauled = false; this.dead = false;
    this.Lr = 32; this.Tsim = .15; this.tension = .15; this.hs = 0; this.seabed = 14; this.panic = 0; this.W = V.W * .3; this.H = V.H * .25; this.NB = 64; this.pm = null;
    this.m = { x: 0, y: -2, z: 0, tx: 0, tz: -1 }; this.cod = { x: 0, y: -5, z: 0 }; this.doorP = [[0, 0, 0], [0, 0, 0]]; this.A = [new THREE.Vector3(), new THREE.Vector3()]; this.tmpV = new THREE.Vector3(); this.nrm = { nx: 1, nz: 0 };
    const N = NR * NM, g = new THREE.BufferGeometry(); this.pos = new Float32Array(N * 3); const uv = new Float32Array(N * 2), idx = [];
    const perim = Math.PI * (V.W + V.H) * .5, U = Math.max(8, Math.round(perim / V.cell / 2) * 2), sAll = V.wing + V.Lb;
    for (let r = 0; r < NR; r++) { const s = r < MI ? -V.wing * [1, .62, .26][r] : (r - MI) / NBODY * V.Lb; for (let i = 0; i < NM; i++) { uv[(r * NM + i) * 2] = i / NM * U; uv[(r * NM + i) * 2 + 1] = (s + V.wing) / V.cell; } }
    for (let r = 0; r < NR - 1; r++) for (let i = 0; i < NM; i++) { const a = r * NM + i, b = r * NM + (i + 1) % NM, c = a + NM, d = b + NM; idx.push(a, c, b, b, c, d); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, netMaterial(net.material.color, clamp(netTwine(net) * 2.4 / V.cell, .05, .16), 1, .012)); this.mesh.frustumCulled = false; this.mesh.renderOrder = .55;
    const rw = V.rope; this.rope = { warpA: new Rope(26, rw, 0xcbbf9f), warpB: new Rope(26, rw, 0xcbbf9f), head: new Rope(24, rw * .9, 0xf0c98a), foot: new Rope(24, rw * 1.2, 0x4b4e54),
      bU0: new Rope(10, rw * .75, 0xcbbf9f), bU1: new Rope(10, rw * .75, 0xcbbf9f), bL0: new Rope(10, rw * .75, 0xb9ad8e), bL1: new Rope(10, rw * .75, 0xb9ad8e) };
    this.lines = [0, 1, 2, 3].map(() => new Rope(NR, rw * .6, 0xd9b36b)); this.rings = [0, 1, 2].map(() => new Rope(NM, rw * .7, 0x8a6d3b));
    this.lineBuf = new Float32Array(NR * 3); this.ringBuf = new Float32Array(NM * 3); this.cb = new Float32Array(26 * 3); this.hb = new Float32Array(24 * 3); this.fb = new Float32Array(24 * 3);
    this.nfl = Math.min(40, net.floats); this.fl = ball(this.nfl, clamp(.1 + V.W * .006, .12, .26), net.floatColor, 1, 3); this.nsk = Math.min(40, net.sinkers); this.sk = ball(this.nsk, clamp(.09 + V.W * .004, .1, .2), 0x6b7078, 1, 4);
    this.doors = [0, 1].map(() => { const b = new THREE.Mesh(new THREE.BoxGeometry(.1, V.doorH, V.doorL), litMaterial(0x7a8590, 2, .5)); b.renderOrder = .6; b.frustumCulled = false; return b; });
    const fg = fishGeometry(), NB = this.NB; this.bAC = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3); this.bAB = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3); this.bAF = new THREE.InstancedBufferAttribute(new Float32Array(NB * 4), 4);
    fg.setAttribute('aCol', this.bAC); fg.setAttribute('aBel', this.bAB); fg.setAttribute('aFx', this.bAF);
    this.bagMesh = new THREE.InstancedMesh(fg, fishMaterial(0), NB); this.bagMesh.frustumCulled = false; this.bagMesh.renderOrder = .5; this.bagMesh.count = 0;
    this.group = new THREE.Group(); this.group.add(this.mesh, this.fl, this.sk, this.bagMesh, ...Object.values(this.rope).map((r) => r.m), ...this.lines.map((r) => r.m), ...this.rings.map((r) => r.m), ...this.doors); S.scene.add(this.group);
    // gallows blocks on the hull: the rope ends are tied to these, so they ride the boat
    const bm = new THREE.MeshStandardMaterial({ color: 0x2c3338, roughness: .55, metalness: .6 }); this.blocks = LOC.map((p) => { const gg = new THREE.Group(), post = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, .5, 8), bm), sh = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), bm);
      post.position.y = -.25; gg.add(post, sh); gg.position.set(p[0], p[1], p[2]); S.hullG.add(gg); return gg; });
    this.dummy = new THREE.Object3D(); this.ringC = []; this.ringR = []; this.ringH = []; for (let r = 0; r < NR; r++) { this.ringC.push([0, 0, 0]); this.ringR.push(1); this.ringH.push(1); }
    const w = S.hullG.localToWorld(new THREE.Vector3(0, 1.4, -4.3)); this.head.x = w.x; this.head.z = w.z; this.hist.push({ x: w.x, z: w.z });
    this.fwd = { x: -Math.sin(S.boat.heading), z: -Math.cos(S.boat.heading) };
  }
  /* point `dist` metres back along the track of the stern (starts at the live stern position) */
  trail(dist) {
    const H = this.hist; let ax = this.head.x, az = this.head.z, acc = 0;
    for (let i = H.length - 1; i >= 0; i--) { const bx = H[i].x, bz = H[i].z, d = Math.hypot(ax - bx, az - bz); if (d > 1e-6) { if (acc + d >= dist) { const f = (dist - acc) / d; return { x: ax + (bx - ax) * f, z: az + (bz - az) * f }; } acc += d; } ax = bx; az = bz; }
    return { x: ax, z: az, short: true };
  }
  frame(D) { // tangent (pointing toward the boat) at track distance D
    const a = this.trail(Math.max(0, D - 1.5)), b = this.trail(D + 1.5); let tx = a.x - b.x, tz = a.z - b.z; const l = Math.hypot(tx, tz);
    if (l < 1e-3) { tx = this.fwd.x; tz = this.fwd.z; } else { tx /= l; tz /= l; } return { tx, tz, nx: -tz, nz: tx };
  }
  fill() { return clamp(this.bag.length / (120 + this.net.mouthW * 14), 0, 1); }
  minTgt() { return Math.max(this.vis.H, this.vis.doorH) / 2 + 1.0 + .22 * this.hs; }
  maxTgt() { return Math.max(this.minTgt() + .3, this.seabed - Math.max(this.vis.H, this.vis.doorH) / 2 - .5); }
  setDepth(d) { this.tgt = clamp(d, this.minTgt(), this.maxTgt()); }
  haulIn() { this.hauling = true; this.auto = false; }
  /* the winch mini-game drives the bag from its real tow depth to the surface (k 0..1) */
  setHaul(k, T) { if (!this.winch) { this.winch = true; this.hauling = true; this.auto = false; this.depth0 = this.depth; this.warp0 = this.warp; } this.haulK = clamp(k, 0, 1); this.winchT = T || 0; }
  fishing() { return this.deploy > .7 && this.spread > .2 && this.opening > .03 && !this.hauling && !this.dead; }

  update(dt, boat, speed, seabed, hs = 0) {
    this.t += dt; this.seabed = seabed; this.hs = hs; const V = this.vis, net = this.net, c = this.comp;
    this.pm = this._have ? { x: this.m.x, y: this.m.y, z: this.m.z, tx: this.m.tx, tz: this.m.tz } : null; this._have = true;   // mouth at the previous frame (for the swept volume)
    const w = this.S.hullG.localToWorld(this.tmpV.set(0, 1.4, -4.3)); this.head.x = w.x; this.head.z = w.z; this.fwd.x = -Math.sin(boat.heading); this.fwd.z = -Math.cos(boat.heading);
    const last = this.hist[this.hist.length - 1]; if (!last || Math.hypot(w.x - last.x, w.z - last.z) > .6) { this.hist.push({ x: w.x, z: w.z }); if (this.hist.length > 1800) this.hist.shift(); }
    if (!this.hauling) this.deploy = Math.min(1, this.deploy + dt / 16);
    this.spread += (clamp(Math.pow(speed / 1.5, 2), .06, 1) - this.spread) * Math.min(1, dt * .5);
    this.opening = clamp(this.deploy * c.openMul * this.spread, 0, 1) * (this.hauling ? .5 : 1);
    const W = V.W * (.3 + .7 * this.opening), Hh = V.H * (.25 + .75 * this.opening), fill = this.fill(), dk = .35 + .65 * this.deploy; this.W = W; this.H = Hh;
    /* depth: the winch holds the depth asked for; the top of the mouth stays >= 1 m under (plus a wave allowance) until the net is hauled aboard */
    const minNow = Math.max(Hh, V.doorH) / 2 + 1.0 + .22 * hs;
    if (this.winch) { const k = this.haulK, e = k * k * (3 - 2 * k) * .35 + k * .65; this.depth = this.depth0 * (1 - e); this.warp = lerp(this.warp0, 9.5, e); if (k >= .999) this.hauled = true; }
    else {
      this.tgt = clamp(this.tgt, this.minTgt(), this.maxTgt()); const want = this.hauling ? 0 : this.tgt, eq = this.hauling ? 0 : Math.max(minNow, lerp(minNow, want, this.deploy)), vmax = .55 + net.sinkRate * .9;
      this.vDepth += (clamp((eq - this.depth) * .6, -vmax * .9, vmax) - this.vDepth) * Math.min(1, dt * 1.5); this.depth = clamp(this.depth + this.vDepth * dt, this.hauling ? 0 : minNow, Math.max(minNow, seabed - Math.max(Hh, V.doorH) / 2 - .35));
      const wT = this.hauling ? 8 : clamp(18 + Math.max(this.tgt, this.depth) * 6.5, 25, 140), wr = this.hauling ? 9 : 6; this.warp += clamp(wT - this.warp, -wr * dt, wr * dt);
      if (this.hauling && this.warp <= 8.6 && this.depth < 1.4) this.hauled = true;
    }
    /* tension model: tow drag (speed^2 x mouth opening) + the weight in the bag + surges.  It sets how much slack the warps carry. */
    const spK = clamp(speed / 2.2, 0, 1.2), drag = (.12 + .88 * spK * spK) * (.4 + .6 * this.opening), surge = Math.sin(this.t * 1.7 + 1) * .05 * (1 + hs * .5);
    this.Tsim += (clamp(this.winch ? .45 + .5 * this.winchT : .08 + .62 * drag + fill * .3 + surge, 0, 1) - this.Tsim) * Math.min(1, dt * 2);
    this.panic = clamp(Math.abs(this.vDepth) * .8 + Math.max(0, this.Tsim - .7) * 2 + (this.winch ? .6 : 0), 0, 1.4);
    /* geometry along the track: doors ahead (Hd behind the stern), bridles + wings, mouth, body */
    const Hd = Math.sqrt(Math.max((this.warp * .985) ** 2 - (this.depth + 1.6) ** 2, 9)), Lbr = (V.bridle) * (.65 + .35 * this.deploy), Dm = Hd + Lbr;
    const fm = this.frame(Dm), mp = this.trail(Dm); this.nrm = { nx: fm.nx, nz: fm.nz }; this.m.x = mp.x; this.m.z = mp.z; this.m.y = -this.depth; this.m.tx = fm.tx; this.m.tz = fm.tz;
    const P = this.pos, Lb = V.Lb * dk, wing = V.wing * dk, top = this.hauling ? 9 : -(.3 + .2 * hs), bulgeT = 1 - .2 * Math.sin(this.t * 2), flut = Math.sin(this.t * 3.2) * .03 * speed;
    for (let r = 0; r < NR; r++) {
      const s = r < MI ? -wing * [1, .62, .26][r] : (r - MI) / NBODY * Lb, f = r < MI ? 0 : (r - MI) / NBODY, q = r < MI ? -s / Math.max(wing, .01) : 0, D = Math.max(1, Dm + s), p = this.trail(D), fr = this.frame(D);
      let hw, hh, cy = -this.depth;
      if (r < MI) { hw = W / 2 * (1 + .1 * q); hh = Hh / 2 * (1 - .86 * Math.pow(q, 1.1)); }
      else { const taper = Math.pow(1 - f, 1.3) * .88 + .12, bulge = 1 + fill * 1.3 * sstep(.65, 1, f) * bulgeT * (1 + .05 * Math.sin(this.t * 3 + r)); hw = W / 2 * taper * bulge * (1 + flut * (r % 2 ? 1 : -1)); hh = Hh / 2 * taper * bulge; cy = -this.depth * (1 - f * .05) + f * .5 - fill * f * f * .8; }
      this.ringC[r][0] = p.x; this.ringC[r][1] = cy; this.ringC[r][2] = p.z; this.ringR[r] = hw; this.ringH[r] = hh;
      for (let i = 0; i < NM; i++) { const a = i / NM * TAU, ex = Math.cos(a) * hw, ey = Math.sin(a) * hh, k = (r * NM + i) * 3; P[k] = p.x + fr.nx * ex; P[k + 1] = Math.min(cy + ey, top); P[k + 2] = p.z + fr.nz * ex; }
    }
    this.cod.x = this.ringC[NR - 2][0]; this.cod.y = this.ringC[NR - 2][1]; this.cod.z = this.ringC[NR - 2][2];
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeBoundingSphere(); this.mesh.geometry.computeVertexNormals();
    for (let k = 0; k < 4; k++) { const i = k * (NM / 4), b = this.lineBuf; for (let r = 0; r < NR; r++) { b[r * 3] = P[(r * NM + i) * 3]; b[r * 3 + 1] = P[(r * NM + i) * 3 + 1]; b[r * 3 + 2] = P[(r * NM + i) * 3 + 2]; } this.lines[k].set(b, NR); }
    [NR - 4, NR - 3, NR - 2].forEach((r, k) => { const b = this.ringBuf; for (let i = 0; i < NM; i++) { b[i * 3] = P[(r * NM + i) * 3]; b[i * 3 + 1] = P[(r * NM + i) * 3 + 1]; b[i * 3 + 2] = P[(r * NM + i) * 3 + 2]; } this.rings[k].set(b, NM, true); });
    /* otter boards ahead of the wings, kited apart by the flow */
    const dp = this.trail(Hd), df = this.frame(Hd), dw = (W * .62 + 1.4) * (.45 + .55 * this.spread), th0 = Math.atan2(df.tx, df.tz), slack = lerp(.07, .003, this.Tsim);
    this.doors.forEach((b, j) => { const sg = j ? 1 : -1, x = dp.x + df.nx * dw * sg, z = dp.z + df.nz * dw * sg, y = -this.depth; this.doorP[j] = [x, y, z]; b.position.set(x, y, z); b.rotation.set(0, th0 + sg * .4 * (.5 + .5 * this.spread), sg * .08, 'YXZ'); });
    this.chord0 = Math.hypot(Hd, this.depth + 1.6) * 1.0; const tgtL = this.chord0 * (1 + slack); this.Lr += (tgtL - this.Lr) * Math.min(1, dt * (this.winch ? 6 : 1.4)); if (this.winch) this.Lr = Math.min(this.Lr, tgtL);
    /* bridles: door -> wing tip (upper / lower), nearly taut */
    const w0 = (j) => { const r = 0, c0 = this.ringC[r], fr = this.frame(Math.max(1, Dm - wing)), sg = j ? 1 : -1, hw = this.ringR[0]; return [c0[0] + fr.nx * hw * sg, c0[1], c0[2] + fr.nz * hw * sg]; };
    [0, 1].forEach((j) => { const d = this.doorP[j], t = w0(j), hh = this.ringH[0], bu = [d[0], d[1] + V.doorH * .3, d[2]], bl = [d[0], d[1] - V.doorH * .3, d[2]], tu = [t[0], t[1] + hh, t[2]], tl = [t[0], t[1] - hh, t[2]];
      catenary(bu, tu, Math.hypot(tu[0] - bu[0], tu[1] - bu[1], tu[2] - bu[2]) * (1 + slack * .3), 10, this.cb); this.rope[j ? 'bU1' : 'bU0'].set(this.cb, 10);
      catenary(bl, tl, Math.hypot(tl[0] - bl[0], tl[1] - bl[1], tl[2] - bl[2]) * (1 + slack * .3), 10, this.cb); this.rope[j ? 'bL1' : 'bL0'].set(this.cb, 10); });
    /* head rope (floats) and foot rope (lead) across the mouth, on the mouth ellipse */
    const mc = this.ringC[MI], mf = this.frame(Dm), hp = this.hb, fp = this.fb, mhw = W / 2, mhh = Hh / 2;
    for (let i = 0; i < 24; i++) { const u = i / 23 - .5, e = Math.sqrt(Math.max(0, 1 - 4 * u * u)); hp[i * 3] = mc[0] + mf.nx * u * W; hp[i * 3 + 1] = Math.min(mc[1] + mhh * e + .02, top); hp[i * 3 + 2] = mc[2] + mf.nz * u * W; fp[i * 3] = hp[i * 3]; fp[i * 3 + 1] = mc[1] - mhh * e - Math.cos(u * Math.PI) * .1 * (1 - this.opening * .6); fp[i * 3 + 2] = hp[i * 3 + 2]; }
    this.rope.head.set(hp, 24); this.rope.foot.set(fp, 24);
    const d = this.dummy; d.quaternion.identity(); this.fl.count = this.nfl; this.sk.count = this.nsk;
    for (let k = 0; k < this.nfl; k++) { const u = k / Math.max(1, this.nfl - 1) - .5, e = Math.sqrt(Math.max(0, 1 - 4 * u * u)); d.position.set(mc[0] + mf.nx * u * W, Math.min(mc[1] + mhh * e + .14, top + .1), mc[2] + mf.nz * u * W); d.updateMatrix(); this.fl.setMatrixAt(k, d.matrix); }
    for (let k = 0; k < this.nsk; k++) { const u = k / Math.max(1, this.nsk - 1) - .5, e = Math.sqrt(Math.max(0, 1 - 4 * u * u)); d.position.set(mc[0] + mf.nx * u * W, mc[1] - mhh * e - .1, mc[2] + mf.nz * u * W); d.updateMatrix(); this.sk.setMatrixAt(k, d.matrix); }
    this.fl.instanceMatrix.needsUpdate = true; this.sk.instanceMatrix.needsUpdate = true;
    this.updateBag(dt); this.attach();
  }

  /* warps: catenaries from the boat's real winch blocks (world space, every frame, after the boat has been moved / heaved / pitched / rolled) to the boards */
  attach() {
    if (this.dead || !this.doorP) return; const hull = this.S.hullG, A = this.A; hull.updateWorldMatrix(true, false);
    LOC.forEach((p, j) => A[j].set(p[0], p[1], p[2]).applyMatrix4(hull.matrixWorld));
    const nx = this.nrm.nx, nz = this.nrm.nz, lat = (v) => (v.x - this.m.x) * nx + (v.z - this.m.z) * nz, order = lat(A[0]) <= lat(A[1]) ? [0, 1] : [1, 0]; let T = 0;
    [0, 1].forEach((j) => { const a = A[order[j]], d = this.doorP[j], c = catenary([a.x, a.y, a.z], d, this.Lr, 26, this.cb); T += clamp(1 - (this.Lr / Math.max(c, .1) - 1) / .085, 0, 1) * .5; this.rope[j ? 'warpB' : 'warpA'].set(this.cb, 26); });
    this.tension = T;
  }

  /* TOW-TIME CAPTURE.  Fish that cross the mouth plane this frame inside the mouth width and height band are taken, minus mesh escapes.  Returns the fish caught this frame. */
  sweep(fw, dt, mm, strain = 0, onCatch) {
    const m = this.m, pm = this.pm; if (!this.fishing() || !pm) return 0;
    const W = this.W, H = this.H, tx = m.tx, tz = m.tz, nx = -tz, nz = tx; let got = 0; const full = this.fill() >= 1;
    for (const s of fw.schools) {
      if (Math.hypot(s.x - m.x, s.z - m.z) > s.rad * 3.2 + W + 14) continue;
      for (const f of s.fish) {
        if (f.cap || f.dead || f.netId === this.id) continue;
        const px = f.x - f.vx * dt, pz = f.z - f.vz * dt, axP = (px - pm.x) * pm.tx + (pz - pm.z) * pm.tz, ax = (f.x - m.x) * tx + (f.z - m.z) * tz;
        if (!(axP > 0 && ax <= 0)) continue;
        const q = axP / Math.max(axP - ax, 1e-6), latP = (px - pm.x) * -pm.tz + (pz - pm.z) * pm.tx, lat = (f.x - m.x) * nx + (f.z - m.z) * nz, lc = latP + (lat - latP) * q, vy = f.y - (pm.y + (m.y - pm.y) * q);
        if (Math.abs(lc) > W / 2 + .05 || Math.abs(vy) > H / 2 + .05) continue;
        f.netId = this.id; this.swept++; const len = f.sp.len * f.lenK; if (f.slip === undefined) f.slip = Math.random();
        if (f.slip >= retention(len, mm, 'trawl', strain)) { this.escaped++; continue; }          // slips through the mesh
        if (full) { this.spilled++; continue; }                                                        // codend already full
        this.bag.push({ f, sp: f.sp.id, len, depth: -f.y, tow: this.depth }); fw.capture(f, this); got++; onCatch && onCatch(f);
      }
    }
    return got;
  }

  /* the catch inside the codend: swimming, shifting, panicking as the bag rises and the tension changes, pressing the mesh */
  updateBag(dt) {
    const n = Math.min(this.NB, this.bag.length), d = this.dummy, AC = this.bAC.array, AB = this.bAB.array, AF = this.bAF.array, t = this.t, pan = this.panic, nx = this.nrm.nx, nz = this.nrm.nz; this.bagMesh.count = n;
    const cc = this._c || (this._c = new THREE.Color()), tx = this.m.tx, tz = this.m.tz;
    for (let k = 0; k < n; k++) {
      const b = this.bag[k], sp = SPECIES[b.sp], hsh = Math.sin(k * 91.7) * 43758.5453, u = hsh - Math.floor(hsh), v0 = Math.sin(k * 12.9 + 4.1) * 7.3, v = v0 - Math.floor(v0), dir = k % 2 ? 1 : -1;
      const rr = NR - 2.1 - (k % 3) * .9, r0 = Math.floor(rr), fr = rr - r0, c0 = this.ringC[r0], c1 = this.ringC[r0 + 1], hw = this.ringR[r0] * (1 - fr) + this.ringR[r0 + 1] * fr, hh = this.ringH[r0] * (1 - fr) + this.ringH[r0 + 1] * fr;
      const ang = u * TAU + t * (.35 + .6 * v + pan * 1.6) * dir + Math.sin(t * 1.3 + k) * .4, press = .72 + .2 * v + .1 * Math.sin(t * (2 + pan * 4) + k * 2) * (.4 + pan), ex = Math.cos(ang) * hw * press, ey = Math.sin(ang) * hh * press;
      d.position.set(lerp(c0[0], c1[0], fr) + nx * ex, lerp(c0[1], c1[1], fr) + ey, lerp(c0[2], c1[2], fr) + nz * ex);
      const sx = -Math.sin(ang) * dir, yaw = Math.atan2(nx * sx * hw + tx * .35, nz * sx * hw + tz * .35) + Math.sin(t * (3 + pan * 6) + k * 1.3) * (.35 + .4 * pan);
      d.rotation.set(Math.cos(ang) * dir * .5, yaw, Math.sin(t * (2.3 + pan * 5) + k) * (.45 + .5 * pan), 'YXZ'); const L = b.len * .92; d.scale.set(L * .95, L * .95, L); d.updateMatrix(); this.bagMesh.setMatrixAt(k, d.matrix);
      cc.setHex(sp.color); AC[k * 3] = cc.r; AC[k * 3 + 1] = cc.g; AC[k * 3 + 2] = cc.b; cc.setHex(sp.belly); AB[k * 3] = cc.r; AB[k * 3 + 1] = cc.g; AB[k * 3 + 2] = cc.b; AF[k * 4] = pan > .5 && Math.sin(t * 9 + k * 5) > .93 ? .8 : 0; AF[k * 4 + 1] = k * 1.7; AF[k * 4 + 2] = .8 + .2 * pan; AF[k * 4 + 3] = b.sp === 'mackerel' ? 1 : 0;
    }
    this.bagMesh.instanceMatrix.needsUpdate = true; this.bAC.needsUpdate = this.bAB.needsUpdate = this.bAF.needsUpdate = true;
  }
  dispose() { this.dead = true; this.blocks.forEach((b) => { this.S.hullG.remove(b); b.traverse((o) => o.geometry && o.geometry.dispose()); }); disposeGroup(this.S, this.group); }
}
