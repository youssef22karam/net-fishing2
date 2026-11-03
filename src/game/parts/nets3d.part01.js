// @ts-nocheck
/* 3D nets, rebuilt.  Every net is made of the same real parts: ROPE (head / lead / hand lines), FLOATS, SINKERS (lead weights) and MESH.
   - CastNet : position-based-dynamics net (apex + 7 rings x 26 ribs).  It leaves the hand as a folded bundle, is spun open by the throw
               (spin energy is fixed, so a heavy net spins slower and opens later / less), sags on its handline, hits the water rim first,
               traps air, sinks at a rate set by lead weight and mesh drag, folds in when the draw cord is pulled and is hauled with the line
               straining.  Opening and landing can partially fail: ribs that did not spin up stay folded and leave holes.
   - WallNet : seine + gillnet.  Paid out from the stern point by point; every metre of net has its own age so the curtain sinks gradually,
               billows in the current, dips between floats, and a purse seine closes (ends join, purse line draws the bottom shut).
   - TrawlRig: warps (sagging), otter boards, wings, throat and codend that fills.  Mouth spreads with tow speed, depth follows warp/speed/weight. */
import * as THREE from 'three';
import { clamp, lerp, sstep, TAU, seaEnv } from './config.js';
import { meshDrag } from './netgen.js';

let _tex = null;
export function netTexture() {
  if (_tex) return _tex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 3.2; x.lineCap = 'round'; x.beginPath();
  x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.moveTo(-32, 32); x.lineTo(32, 96); x.moveTo(32, -32); x.lineTo(96, 32); x.moveTo(32, 96); x.lineTo(96, 32); x.moveTo(-32, 32); x.lineTo(32, -32); x.stroke();
  for (const [px, py] of [[32, 32], [0, 0], [64, 0], [0, 64], [64, 64]]) { x.beginPath(); x.arc(px, py, 4.2, 0, 7); x.fill(); }   // knots
  _tex = new THREE.CanvasTexture(c); _tex.wrapS = _tex.wrapT = THREE.RepeatWrapping; _tex.anisotropy = 4; _tex.colorSpace = THREE.SRGBColorSpace; return _tex;
}
/* depth-faded unlit material: fades toward water colour below the surface */
export function netMat(color, opts = {}) {
  const m = new THREE.MeshBasicMaterial({ color, map: opts.noTex ? null : netTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, ...opts.m });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nwp=instanceMatrix*wp;\n#endif\nwp=modelMatrix*wp;vFade=clamp(1.2+wp.y*.06,.45,1.);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb=mix(vec3(.03,.2,.3),diffuseColor.rgb,vFade);diffuseColor.a*=mix(.62,1.,vFade);');
  };
  return m;
}
export const visCell = (net, mi) => .09 + net.mesh[mi] * .0032;

/* polar triangulated mesh (apex + K rings x M ribs) */
export function polarMesh(K, M, cell, R, color) {
  const N = 1 + K * M, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), idx = [];
  const ix = (r, i) => (r === 0 ? 0 : 1 + (r - 1) * M + (i % M));
  const U = Math.max(4, Math.round(TAU * R / cell / 2) * 2);
  for (let r = 1; r <= K; r++) for (let i = 0; i < M; i++) { const k = ix(r, i); uv[k * 2] = i / M * U; uv[k * 2 + 1] = r / K * R / cell; }
  for (let r = 1; r <= K; r++) for (let i = 0; i < M; i++) { if (r === 1) idx.push(0, ix(1, i), ix(1, i + 1)); else idx.push(ix(r - 1, i), ix(r, i), ix(r, i + 1), ix(r - 1, i), ix(r, i + 1), ix(r - 1, i + 1)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, netMat(color)); m.frustumCulled = false; m.renderOrder = 4; return { mesh: m, pos, ix };
}

/* a rope = instanced cylinders laid along a polyline (so it has real thickness, unlike GL lines) */
class Rope {
  constructor(max, radius, color) {
    this.m = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), netMat(color, { noTex: true, m: { side: THREE.FrontSide } }), max);
    this.m.frustumCulled = false; this.m.renderOrder = 5; this.m.count = 0; this.max = max; this.r = radius; this.d = new THREE.Object3D(); this.up = new THREE.Vector3(0, 1, 0); this.v = new THREE.Vector3();
  }
  /* pts: flat array [x,y,z,...] with n points */
  set(pts, n, closed = false) {
    const d = this.d, v = this.v; let c = 0; const segs = closed ? n : n - 1;
    for (let i = 0; i < segs && c < this.max; i++) {
      const a = i * 3, b = ((i + 1) % n) * 3; v.set(pts[b] - pts[a], pts[b + 1] - pts[a + 1], pts[b + 2] - pts[a + 2]); const len = v.length(); if (len < 1e-4) continue;
      d.position.set((pts[a] + pts[b]) / 2, (pts[a + 1] + pts[b + 1]) / 2, (pts[a + 2] + pts[b + 2]) / 2); d.quaternion.setFromUnitVectors(this.up, v.multiplyScalar(1 / len)); d.scale.set(this.r, len * 1.04, this.r); d.updateMatrix(); this.m.setMatrixAt(c++, d.matrix);
    }
    this.m.count = c; this.m.instanceMatrix.needsUpdate = true;
  }
}
const ball = (n, r, color, sy = 1) => { const m = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 7, 5), netMat(color, { noTex: true, m: { side: THREE.FrontSide } }), n); m.frustumCulled = false; m.renderOrder = 5; m.count = 0; m.userData.sy = sy; return m; };
const disposeGroup = (S, group) => { S.scene.remove(group); group.traverse((o) => { o.geometry && o.geometry.dispose(); }); };

/* ============================================================ CAST NET ============================================================ */
export class CastNet {
  constructor(S, net, meshIdx, hand, dir, dist, quality, comp, onLand) {
    this.S = S; this.net = net; this.mi = meshIdx; this.K = 7; this.M = 26; this.state = 'air'; this.t = 0; this.close = 0; this.closeTarget = 0; this.onLand = onLand; this.landed = false; this.settled = false;
    this.sunkT = 0; this.hauling = false; this.done = false; this.driven = null; this.tension = 0; this.landT = 0; this.quality = quality; this.comp = comp;
    const { K, M } = this, R = net.radius, W = net.weight, N = 1 + K * M; this.R = R; this.N = N; this.W = W;
    this.hand = hand.clone(); this.L = dist + net.handline * 1.4;
    /* masses: lead (sinkers) carries ~80 % of the weight, mesh is nearly weightless */
    const mRim = .8 * W / M, mMesh = .2 * W / (K * M) + .004, mApex = .3 + .05 * W;
    const T = .72 + .012 * W + dist * .02, h0 = hand.y - S.S.y;
    const vx = dir.x * dist / T, vz = dir.z * dist / T, vy = (-h0 + 4.9 * T * T) / T;
    /* spin: the thrower puts in a fixed amount of rotational energy; a heavy lead line takes it with a lower angular speed (slow, partial opening) */
    const Espin = 20 * (.3 + quality) * comp.openMul, spin = Math.sqrt(2 * Espin / (.8 * W + .4)); this.spin = spin;
    this.fail = []; for (let i = 0; i < M; i++) this.fail.push(clamp(1 - (1 - quality) * Math.random() * 1.1 * (Math.random() < .4 ? 1 : .25) - (Math.random() < (1 - quality) * .18 ? .55 : 0), .08, 1.05));
    this.P = []; const mk = (x, y, z, mass, kind, f, i, vx_, vy_, vz_) => ({ x, y, z, ox: x, oy: y, oz: z, vx: vx_, vy: vy_, vz: vz_, im: 1 / mass, kind, f, rib: i, wet: 0 });
    this.P.push(mk(hand.x, hand.y, hand.z, mApex, 0, 0, 0, vx, vy, vz));
    for (let r = 1; r <= K; r++) for (let i = 0; i < M; i++) {
      const a = i / M * TAU + .4, ca = Math.cos(a), sa = Math.sin(a), f = r / K, rr = .1 + .2 * f, vt = spin * (.3 + .7 * f) * this.fail[i];
      this.P.push(mk(hand.x + ca * rr, hand.y - .12 - .5 * f, hand.z + sa * rr, r === K ? mRim : mMesh, r === K ? 2 : 1, f, i, vx - sa * vt, vy, vz + ca * vt));
    }
    this.C = [];   // [a, b, max, kind]  kind 0 radial (slack 18 % -> the bell hangs from its apex) | 1 ring
    const ix = (r, i) => 1 + (r - 1) * M + (i % M); this.ix = ix;
    for (let i = 0; i < M; i++) this.C.push([0, ix(1, i), R / K * 1.18, 0]);
    for (let r = 1; r <= K; r++) for (let i = 0; i < M; i++) { if (r < K) this.C.push([ix(r, i), ix(r + 1, i), R / K * 1.18, 0]); this.C.push([ix(r, i), ix(r, i + 1), TAU * R * (r / K) / M * 1.0, 1]); }
    const cell = visCell(net, meshIdx), pm = polarMesh(K, M, cell, R, net.material.color); this.pm = pm; this.mesh = pm.mesh;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    this.rim = new Rope(M, Math.max(.012, net.ropeMm * .0011), 0x2b2b2b); this.rimPts = new Float32Array(M * 3);
    this.hl = new Rope(24, Math.max(.01, net.ropeMm * .0008), 0xcaa86a); this.hlPts = new Float32Array(25 * 3);
    const lm = .8 * W / net.sinkers, sr = Math.max(.024, Math.cbrt(lm / (11340 * 4.19)) * 3.4);
    this.sink = ball(net.sinkers, sr, net.sinkerColor); this.group.add(this.sink);
    const bg = new THREE.BufferGeometry(); this.bpos = new Float32Array(Math.ceil(M / 2) * 6); bg.setAttribute('position', new THREE.BufferAttribute(this.bpos, 3));
    this.brails = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xd8c690, transparent: true, opacity: .8 })); this.brails.frustumCulled = false; this.brails.renderOrder = 5;
    this.float = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({ color: net.floatColor })); this.float.renderOrder = 6;
    this.group.add(this.rim.m, this.hl.m, this.brails, this.float);
    S.scene.add(this.group); this.dummy = new THREE.Object3D(); this.sync();
  }
  /* the 2D cut-away drives the 3D net during the haul so both show the same thing */
  drive(zr, c) { this.driven = { zr, c }; }
  rimRadius() { const P = this.P, K = this.K, M = this.M; let cx = 0, cz = 0; for (let i = 0; i < M; i++) { cx += P[this.ix(K, i)].x; cz += P[this.ix(K, i)].z; } cx /= M; cz /= M; let r = 0; for (let i = 0; i < M; i++) r += Math.hypot(P[this.ix(K, i)].x - cx, P[this.ix(K, i)].z - cz); return r / M; }
  /* water drag on the boat (N): drag area of an open net  F = 1/2 rho Cd A phi v^2 + the pull of lead on the line */
  dragN(v) { if (!this.landed || this.done) return 0; const rr = this.rimRadius(), A = Math.PI * rr * rr * (1 - this.close * .85), phi = clamp(2 * this.net.twineMm / this.net.mesh[this.mi], .04, .4); return .5 * 1025 * 1.1 * A * phi * v * v + this.W * 4.9 * (this.hauling ? 1.4 : .4); }
  phase() { return this.hauling ? 'hauling' : !this.landed ? (this.t < .5 ? 'throw' : 'opening') : !this.settled ? 'landing' : this.close > .05 ? 'closing' : 'sinking'; }
  solve(h) {
    const P = this.P, ringS = 1 - .93 * this.close;
    for (let it = 0; it < 5; it++) for (const c of this.C) {
      const a = P[c[0]], b = P[c[1]], mx = c[2] * (c[3] ? ringS : 1), dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6; if (d <= mx) continue;
      const w = a.im + b.im, q = (d - mx) / d / w; a.x += dx * q * a.im; a.y += dy * q * a.im; a.z += dz * q * a.im; b.x -= dx * q * b.im; b.y -= dy * q * b.im; b.z -= dz * q * b.im;
    }
    const a = P[0], hd = this.hand, dx = a.x - hd.x, dy = a.y - hd.y, dz = a.z - hd.z, d = Math.hypot(dx, dy, dz);
    if (d > this.L) { const k = this.L / d, ex = d - this.L; a.x = hd.x + dx * k; a.y = hd.y + dy * k; a.z = hd.z + dz * k; this.tens = (this.tens || 0) + ex / (h * h) / a.im * 0; this.pull = Math.max(this.pull || 0, ex / h); }
  }
  step(dt, hand) {
    this.hand.copy(hand); this.t += dt; const sub = 4, h = dt / sub, net = this.net, md = meshDrag(net.mesh[this.mi]), sr = net.sinkRate / md, P = this.P, K = this.K, M = this.M, S = this.S;
    const kMesh = 1.3 * Math.pow(30 / net.mesh[this.mi], .45);
    if (this.hauling) this.L = Math.max(1.8, this.L - 1.7 / (1 + .1 * this.W) * dt);
    /* the cord is pulled by hand: closing takes time and goes slower for heavy nets */
    if (this.driven) this.close = this.driven.c; else this.close += (this.closeTarget - this.close) * Math.min(1, dt * .9 / (1 + .12 * this.W));
    let ringPrev = 1 - .93 * (this.prevClose || 0); const ringNow = 1 - .93 * this.close, shrink = ringNow / ringPrev; this.prevClose = this.close;
    this.pull = 0;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; p.ox = p.x; p.oy = p.y; p.oz = p.z;
        if (p.y > 0) {                                 // AIR: gravity, light mesh is held back by air drag (so it billows behind the rim)
          p.vy -= 9.8 * h; const k = Math.exp(-(p.kind === 1 ? kMesh : p.kind === 0 ? .1 : .1) * h); p.vx *= k; p.vz *= k; if (p.kind === 1) p.vy *= Math.exp(-.35 * kMesh * h);
        } else {                                       // WATER: drag, trapped air for the first moments, sinking at the lead-set rate
          p.wet = Math.min(1, p.wet + h / 1.3);
          const ring = p.f, k = Math.exp(-(1.8 + 1.8 * (1 - ring)) * h); p.vx *= k; p.vz *= k;
          let tgt = p.kind === 0 ? -sr * .1 : -sr * (.3 + .7 * ring * ring) * (1 + this.close * .8) * (.25 + .75 * p.wet);
          if (this.hauling) tgt = p.kind === 0 ? 0 : 1.2 / (1 + .08 * this.W);
          if (this.driven && p.kind) { const ty = -this.driven.zr * Math.pow(p.f, 1.5); tgt = clamp((ty - p.y) * 3, -3, 3); }
          if (p.y < -12.6) tgt = Math.max(tgt, 0); p.vy += (tgt - p.vy) * Math.min(1, h * 2.6);
        }
        p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
      }
      if (this.hauling) { const a = P[0]; const dx = this.hand.x - a.x, dy = this.hand.y - a.y, dz = this.hand.z - a.z, d = Math.hypot(dx, dy, dz) + .01, sp = Math.min(2.4, d) / (1 + .1 * this.W); a.x += dx / d * sp * h; a.y += dy / d * sp * h * .8; a.z += dz / d * sp * h; }
      if (this.landed && shrink < .9999) { const sh = Math.pow(shrink, 1 / sub); let cx = 0, cz = 0; for (let i = 0; i < M; i++) { const q = P[this.ix(K, i)]; cx += q.x; cz += q.z; } cx /= M; cz /= M; for (let i = 1; i < P.length; i++) { const p = P[i]; p.x = cx + (p.x - cx) * sh; p.z = cz + (p.z - cz) * sh; } }
      this.solve(h);
      for (const p of P) { p.vx = (p.x - p.ox) / h; p.vy = (p.y - p.oy) / h; p.vz = (p.z - p.oz) / h; }
    }
    this.tension += ((this.pull || 0) * 14 - this.tension) * Math.min(1, dt * 4);
    const a = P[0];
    if (!this.landed) {                               // landing: the heavy lead rim reaches the water first
      let my = 0; for (let i = 0; i < M; i++) my += P[this.ix(K, i)].y; my /= M;
      if (my < .08 && this.t > .2) {
        this.landed = true; this.state = 'water'; this.landT = this.t; const rim = []; for (let i = 0; i < M; i++) rim.push(P[this.ix(K, i)]);
        for (let i = 0; i < M; i += 2) S.splash && S.splash(rim[i].x, rim[i].z, .1 + .02 * this.W);
        for (const p of P) { if (p.y <= .3) { p.vy *= .3; p.vx *= .55; p.vz *= .55; } }
      }
    }
    if (this.landed) { this.sunkT += dt; if (!this.settled && this.t - this.landT > .6) { this.settled = true; this.measure(); this.onLand && this.onLand(this); } }
    if (this.hauling && Math.hypot(a.x - this.hand.x, a.y - this.hand.y, a.z - this.hand.z) < 2.6) this.done = true;
    this.sync();
  }
  measure() {
    const P = this.P, K = this.K, M = this.M, R = this.R; let cx = 0, cz = 0; for (let i = 0; i < M; i++) { cx += P[this.ix(K, i)].x; cz += P[this.ix(K, i)].z; } cx /= M; cz /= M;
    let area = 0, holes = 0, mr = 0; const rs = [];
    for (let i = 0; i < M; i++) { const a = P[this.ix(K, i)], b = P[this.ix(K, i + 1)]; area += ((a.x - cx) * (b.z - cz) - (b.x - cx) * (a.z - cz)) / 2; const r = Math.hypot(a.x - cx, a.z - cz); rs.push(r); mr += r; }
    mr /= M; for (const r of rs) if (r < Math.max(.4 * R, .6 * mr)) holes++;
    const effR = Math.sqrt(Math.abs(area) / Math.PI);
    this.footprint = { cx, cz, effR, openFrac: effR / R, holes: holes / M, R, spin: this.spin, quality: this.quality, vy: 0 };
  }
  center() { const a = this.P[0]; return { x: a.x, y: a.y, z: a.z }; }
  rimDepth() { let y = 0; for (let i = 0; i < this.M; i++) y += this.P[this.ix(this.K, i)].y; return -y / this.M; }
  sync() {
    const P = this.P, pos = this.pm.pos, K = this.K, M = this.M; for (let i = 0; i < P.length; i++) { pos[i * 3] = P[i].x; pos[i * 3 + 1] = P[i].y; pos[i * 3 + 2] = P[i].z; }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeBoundingSphere();
    for (let i = 0; i < M; i++) { const p = P[this.ix(K, i)]; this.rimPts.set([p.x, p.y, p.z], i * 3); } this.rim.set(this.rimPts, M, true);
    const ns = this.net.sinkers, d = this.dummy; d.quaternion.identity(); for (let k = 0; k < ns; k++) { const t = k / ns * M, i = Math.floor(t), f = t - i, a = P[this.ix(K, i)], b = P[this.ix(K, i + 1)]; d.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - .025, a.z + (b.z - a.z) * f); d.scale.set(1, 1.35, 1); d.updateMatrix(); this.sink.setMatrixAt(k, d.matrix); }
    this.sink.count = ns; this.sink.instanceMatrix.needsUpdate = true;
    for (let k = 0, j = 0; k < M; k += 2, j++) { const p = P[this.ix(K, k)], a = P[0]; this.bpos.set([p.x, p.y, p.z, a.x, a.y, a.z], j * 6); } this.brails.geometry.attributes.position.needsUpdate = true;
    /* handline: a rope with real slack — it hangs in a catenary while the net is flying / sinking and straightens when it takes load */
    const a = P[0], hd = this.hand, dist = Math.hypot(a.x - hd.x, a.y - hd.y, a.z - hd.z), slack = Math.sqrt(Math.max(0, this.L * this.L - dist * dist)) * .35;
    for (let i = 0; i < 25; i++) { const t = i / 24; this.hlPts.set([hd.x + (a.x - hd.x) * t, hd.y + (a.y - hd.y) * t - slack * 4 * t * (1 - t) * (a.y > 0 ? 1 : .35), hd.z + (a.z - hd.z) * t], i * 3); } this.hl.set(this.hlPts, 25);
    this.float.position.set(a.x, Math.max(a.y, .02) + .03, a.z);
  }
  dispose() { disposeGroup(this.S, this.group); }
}

/* ============================================================ WALL NETS (purse seine + gillnet) ============================================================ */
const ROWS = 5;
export class WallNet {
  constructor(S, net, meshIdx, kind) {
    this.S = S; this.net = net; this.kind = kind; this.pts = []; this.sink = 0; this.pull = 0; this.join = 0; this.cx = 0; this.cz = 0; this.MAXP = 160; this.t = 0; this.mi = meshIdx;
    const MAXP = this.MAXP, g = new THREE.BufferGeometry(); this.pos = new Float32Array(MAXP * ROWS * 3); this.uv = new Float32Array(MAXP * ROWS * 2); const idx = [];
    for (let i = 0; i < MAXP - 1; i++) for (let j = 0; j < ROWS - 1; j++) { const a = i * ROWS + j, b = a + ROWS; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2)); g.setIndex(idx); g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, netMat(kind === 'gill' ? 0xd7e8d0 : net.material.color)); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.nf = Math.min(64, net.floats); this.fl = ball(this.nf, kind === 'gill' ? .1 : .14, net.floatColor);
    this.ns = Math.min(64, net.sinkers); this.sk = ball(this.ns, .06, net.sinkerColor);
    this.top = new Rope(MAXP, Math.max(.012, net.ropeMm * .0012), 0xffd7a0); this.bot = new Rope(MAXP, Math.max(.014, net.ropeMm * .0014), 0x2b2b2b);
    this.purse = new Rope(MAXP, .016, 0xb7bcc2); this.tp = new Float32Array(MAXP * 3); this.bp = new Float32Array(MAXP * 3); this.pp = new Float32Array(MAXP * 3);
    this.group = new THREE.Group(); this.group.add(this.mesh, this.fl, this.sk, this.top.m, this.bot.m, this.purse.m); S.scene.add(this.group); this.dummy = new THREE.Object3D();
    this.cell = visCell(net, meshIdx) * 2.4; this.TOP = []; this.BOT = []; for (let i = 0; i < MAXP; i++) { this.TOP.push([0, 0, 0]); this.BOT.push([0, 0, 0]); }
  }
  add(x, z) { if (this.pts.length < this.MAXP) this.pts.push({ x, z, age: 0 }); }
  length() { let L = 0; for (let i = 1; i < this.pts.length; i++) L += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z); return L; }
  meanDepth() { const n = this.pts.length; if (!n) return 0; let s = 0; for (const p of this.pts) s += this.depthOf(p); return s / n; }
  depthOf(p) { const D = this.net.depth, rate = this.net.sinkRate * (this.kind === 'gill' ? 1 : 1.1); return Math.min(D, Math.max(0, p.age - .7) * rate); }   // each metre of net has its own age: the curtain sinks gradually
  update(dt) {
    this.t += dt; const net = this.net, n = this.pts.length, env = seaEnv(), D = net.depth; for (const p of this.pts) p.age += dt;
    const pl = this.pull, join = this.join, topS = 1 - .38 * pl, botS = 1 - .97 * pl, cu = env.current * .9, cv = env.current * .45;
    const ballast = clamp(net.weight / (net.length * D * .1 + 1), .25, 3), billow = .55 / (ballast + .3);
    const spacing = Math.max(2, net.length / Math.max(1, this.nf)), dip = clamp(.05 + .0025 * net.weight / Math.max(1, this.nf), .05, .35);
    const p0 = this.pts[0]; let u = 0, sinkSum = 0;
    const T = this.TOP, B = this.BOT, pos = this.pos, uv = this.uv;
    for (let i = 0; i < n; i++) {
      const q = this.pts[i]; if (i) u += Math.hypot(q.x - this.pts[i - 1].x, q.z - this.pts[i - 1].z);
      let qx = q.x, qz = q.z; const JN = 10; if (join > 0 && i > n - JN && p0) { const w = Math.pow((i - (n - JN)) / JN, 1.3) * join; qx += (p0.x - qx) * w; qz += (p0.z - qz) * w; }
      const dep = this.depthOf(q) * (1 - .42 * pl), bx = this.cx + (qx - this.cx) * topS, bz = this.cz + (qz - this.cz) * topS, lx = this.cx + (qx - this.cx) * botS, lz = this.cz + (qz - this.cz) * botS;
      const sw = Math.sin(this.t * .7 + u * .16) * .06 * env.hs, d0 = 1 - Math.cos(TAU * u / spacing);
      const ty = .17 - dip * d0 * .5 * Math.min(1, q.age / 2); sinkSum += dep;
      T[i] = [bx, ty, bz]; B[i] = [lx + (cu * billow + sw) * dep * .6, -dep, lz + (cv * billow) * dep * .6];
      for (let j = 0; j < ROWS; j++) {
        const f = j / (ROWS - 1), bell = Math.sin(Math.PI * f) * dep * .09 * (1 + .4 * billow) * (pl > 0 ? 1.4 : 1), k = (i * ROWS + j) * 3;
        pos[k] = lerp(T[i][0], B[i][0], f) + (cu * billow) * bell * 2 + sw * f; pos[k + 1] = lerp(ty, -dep, f); pos[k + 2] = lerp(T[i][2], B[i][2], f) + (cv * billow) * bell * 2;
        uv[(i * ROWS + j) * 2] = u / this.cell; uv[(i * ROWS + j) * 2 + 1] = dep * f / this.cell;
      }
    }
    this.sink = n ? sinkSum / n / D : 0;
    this.mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * (ROWS - 1) * 6); this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.uv.needsUpdate = true;
    for (let i = 0; i < n; i++) { this.tp.set(T[i], i * 3); this.bp.set(B[i], i * 3); this.pp.set([B[i][0], B[i][1] + (pl > 0 ? .25 : 0), B[i][2]], i * 3); }
    this.top.set(this.tp, n); this.bot.set(this.bp, n); if (pl > 0.02) this.purse.set(this.pp, n, join > .5); else this.purse.m.count = 0;
    const d = this.dummy; d.quaternion.identity(); d.scale.set(1, 1, 1);
    const at = (arr, k) => { const f = k * (n - 1), i = Math.min(n - 2, Math.floor(f)), t = f - i; return n < 2 ? arr[0] : [lerp(arr[i][0], arr[i + 1][0], t), lerp(arr[i][1], arr[i + 1][1], t), lerp(arr[i][2], arr[i + 1][2], t)]; };
    const nf = n ? Math.min(this.nf, Math.max(1, Math.round(this.length() / spacing) + 1)) : 0, ns = n ? Math.min(this.ns, Math.max(1, Math.round(this.length() / Math.max(1.5, net.length / this.ns)) + 1)) : 0;
    this.fl.count = nf; this.sk.count = ns;
    for (let k = 0; k < nf; k++) { const p = at(T, nf > 1 ? k / (nf - 1) : 0); d.position.set(p[0], p[1] + .05, p[2]); d.updateMatrix(); this.fl.setMatrixAt(k, d.matrix); }
    for (let k = 0; k < ns; k++) { const p = at(B, ns > 1 ? k / (ns - 1) : 0); d.position.set(p[0], p[1] - .03, p[2]); d.updateMatrix(); this.sk.setMatrixAt(k, d.matrix); }
    this.fl.instanceMatrix.needsUpdate = true; this.sk.instanceMatrix.needsUpdate = true;
  }
  depthNow() { return this.net.depth * this.sink; }
  dispose() { disposeGroup(this.S, this.group); }
}

/* marker buoy: pole + flag + float, bobbing — the start of a purse-seine set */
export class Buoy {
  constructor(S, x, z, color = 0xff5a1f) {
    this.S = S; this.x = x; this.z = z; this.g = new THREE.Group();
    const m = (c) => new THREE.MeshBasicMaterial({ color: c });
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(.34, .26, .62, 10), m(color)); fl.position.y = .1;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.345, .345, .14, 10), m(0xffffff)); band.position.y = .12;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 3.2, 5), m(0x2b2b2b)); pole.position.y = 1.9;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.9, .55), new THREE.MeshBasicMaterial({ color: 0xffe14a, side: THREE.DoubleSide })); flag.position.set(.46, 3.1, 0);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(.08, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff })); this.lamp.position.y = 3.55;
    this.g.add(fl, band, pole, flag, this.lamp); this.g.position.set(x, 0, z); S.scene.add(this.g); this.t = Math.random() * 6;
  }
  update(dt) { this.t += dt; this.g.position.y = Math.sin(this.t * 1.3) * .12 - .1; this.g.rotation.z = Math.sin(this.t * .9) * .06; this.lamp.visible = Math.sin(this.t * 4) > -.2; }
  dispose() { disposeGroup(this.S, this.g); }
}

/* ============================================================ TRAWL ============================================================ */
export class TrawlRig {
  constructor(S, net, meshIdx, comp) {
    this.S = S; this.net = net; this.mi = meshIdx; this.comp = comp; this.hist = []; this.warp = 45; this.deploy = 0; this.depth = 0; this.bag = []; this.sweepT = 0; this.snag = 0; this.K = 8; this.M = 14; this.opening = 0; this.spread = 0; this.t = 0; this.vDepth = 0;
    const N = (this.K + 1) * this.M, g = new THREE.BufferGeometry(); this.pos = new Float32Array(N * 3); const uv = new Float32Array(N * 2), idx = [];
    for (let r = 0; r <= this.K; r++) for (let i = 0; i < this.M; i++) { uv[(r * this.M + i) * 2] = i / this.M * Math.max(6, net.mouthW * 1.2); uv[(r * this.M + i) * 2 + 1] = r * 1.2; }
    for (let r = 0; r < this.K; r++) for (let i = 0; i < this.M; i++) { const a = r * this.M + i, b = r * this.M + (i + 1) % this.M, c = a + this.M, d = b + this.M; idx.push(a, c, b, b, c, d); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, netMat(net.material.color)); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.rope = { warpL: new Rope(16, .03, 0xdad2b8), warpR: new Rope(16, .03, 0xdad2b8), head: new Rope(20, .03, 0xffd7a0), foot: new Rope(20, .04, 0x2b2b2b), brL: new Rope(2, .02, 0xdad2b8), brR: new Rope(2, .02, 0xdad2b8) };
    this.nfl = Math.min(40, net.floats); this.fl = ball(this.nfl, .17, net.floatColor); this.nsk = Math.min(40, net.sinkers); this.sk = ball(this.nsk, .13, net.sinkerColor);
    this.doors = [0, 1].map(() => { const b = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.1, 1.5), netMat(0x7a5a2e, { noTex: true })); b.renderOrder = 5; b.frustumCulled = false; return b; });
    this.group = new THREE.Group(); this.group.add(this.mesh, this.fl, this.sk, ...Object.values(this.rope).map((r) => r.m), ...this.doors); S.scene.add(this.group); this.dummy = new THREE.Object3D(); this.m = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
    this.buf = new Float32Array(30 * 3);
  }
  trail(dist) { // point 'dist' metres back along the boat's track
    const H = this.hist; let acc = 0; for (let i = H.length - 1; i > 0; i--) { const a = H[i], b = H[i - 1], d = Math.hypot(a.x - b.x, a.z - b.z); if (acc + d >= dist) { const f = (dist - acc) / (d || 1); return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }; } acc += d; }
    const l = H[0] || { x: 0, z: 0 }; return { x: l.x, z: l.z, short: true };
  }
  fill() { return clamp(this.bag.length / (120 + this.net.mouthW * 14), 0, 1); }
  update(dt, boat, speed, seabed) {
    this.t += dt; const hx = boat.position.x + Math.sin(boat.heading) * 3.6, hz = boat.position.z + Math.cos(boat.heading) * 3.6, last = this.hist[this.hist.length - 1];
    if (!last || Math.hypot(hx - last.x, hz - last.z) > .6) { this.hist.push({ x: hx, z: hz }); if (this.hist.length > 700) this.hist.shift(); }
    this.deploy = Math.min(1, this.deploy + dt / 16); const net = this.net, c = this.comp;
    /* the mouth spreads with the square of the water flow through the doors; below ~1 kn the net hangs folded and sinks */
    this.spread += (clamp(Math.pow(speed / 1.5, 2), .06, 1) - this.spread) * Math.min(1, dt * .5);
