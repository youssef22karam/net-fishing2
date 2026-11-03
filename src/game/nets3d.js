// @ts-nocheck
/* 3D nets: rope, floats, sinkers, mesh sag and drag, opening in air/water, sinking, closing.
   CastNet = position-based-dynamics cloth (121 particles). TrawlRig / WallNet = lighter towed / set nets. */
import * as THREE from 'three';
import { clamp, TAU } from './config.js';
import { meshDrag } from './netgen.js';

let _tex = null;
export function netTexture() {
  if (_tex) return _tex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = '#fff'; x.lineWidth = 4.2; x.lineCap = 'round'; x.beginPath();
  x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.moveTo(-32, 32); x.lineTo(32, 96); x.moveTo(32, -32); x.lineTo(96, 32); x.moveTo(32, 96); x.lineTo(96, 32); x.moveTo(-32, 32); x.lineTo(32, -32); x.stroke();
  _tex = new THREE.CanvasTexture(c); _tex.wrapS = _tex.wrapT = THREE.RepeatWrapping; _tex.anisotropy = 4; _tex.colorSpace = THREE.SRGBColorSpace; return _tex;
}
/* depth-faded unlit material: fades toward water colour below the surface, depth-tested against the boat, never against the water */
export function netMat(color, opts = {}) {
  const m = new THREE.MeshBasicMaterial({ color, map: opts.noTex ? null : netTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, ...opts.m });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nwp=instanceMatrix*wp;\n#endif\nwp=modelMatrix*wp;vFade=clamp(1.2+wp.y*.06,.45,1.);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb=mix(vec3(.03,.2,.3),diffuseColor.rgb,vFade);diffuseColor.a*=mix(.62,1.,vFade);');
  };
  return m;
}
const lineMat = (c) => netMat(c, { noTex: true, m: { side: THREE.FrontSide } });

/* polar triangulated mesh (apex + K rings x M ribs) */
function polarMesh(K, M, cell, R, color) {
  const N = 1 + K * M, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), idx = [];
  const ix = (r, i) => (r === 0 ? 0 : 1 + (r - 1) * M + (i % M));
  const U = Math.max(4, Math.round(TAU * R / cell / 2) * 2);
  for (let r = 1; r <= K; r++) for (let i = 0; i <= M; i++) { if (i < M) { const k = ix(r, i); uv[k * 2] = i / M * U; uv[k * 2 + 1] = r / K * R / cell; } }
  for (let r = 1; r <= K; r++) for (let i = 0; i < M; i++) { if (r === 1) idx.push(0, ix(1, i), ix(1, i + 1)); else idx.push(ix(r - 1, i), ix(r, i), ix(r, i + 1), ix(r - 1, i), ix(r, i + 1), ix(r - 1, i + 1)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, netMat(color)); m.frustumCulled = false; m.renderOrder = 4; return { mesh: m, pos, ix };
}
const sinkerMesh = (n, r, color) => { const m = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 6, 5), netMat(color, { noTex: true, m: { side: THREE.FrontSide } }), n); m.frustumCulled = false; m.renderOrder = 5; return m; };
const visCell = (net, mi) => .09 + net.mesh[mi] * .0032;

/* ============================================================ CAST NET ============================================================ */
export class CastNet {
  constructor(S, net, meshIdx, hand, dir, dist, quality, comp, onLand) {
    this.S = S; this.net = net; this.mi = meshIdx; this.K = 6; this.M = 20; this.state = 'air'; this.t = 0; this.close = 0; this.onLand = onLand; this.landed = false; this.sunkT = 0; this.hauling = false; this.done = false;
    const { K, M } = this, R = net.radius, W = net.weight, N = 1 + K * M; this.R = R; this.N = N;
    this.hand = hand.clone(); this.L = dist + net.handline * 1.4;
    const T = .72 + .012 * W + dist * .02, h0 = hand.y - S.S.y;
    const vx = dir.x * dist / T, vz = dir.z * dist / T, vy = (-h0 + 4.9 * T * T) / T;
    // opening: spin imparted by the throw (quality) minus weight (heavy nets open hard) and boat strain; failures are partial
    const open = clamp((.45 + quality * .62) * comp.openMul - W * .014, .12, 1);
    this.open = open;
    this.P = []; const mk = (x, y, z, im, vx_, vy_, vz_) => ({ x, y, z, ox: x, oy: y, oz: z, vx: vx_, vy: vy_, vz: vz_, im });
    this.P.push(mk(hand.x, hand.y, hand.z, 1, vx, vy, vz));
    this.fail = []; for (let i = 0; i < M; i++) this.fail.push(1 - (1 - quality) * Math.random() * .9 * (Math.random() < .35 ? 1 : .3));
    for (let r = 1; r <= K; r++) for (let i = 0; i < M; i++) {
      const a = i / M * TAU + .4, ca = Math.cos(a), sa = Math.sin(a), f = r / K, rr = .25 * f;
      const vr = (open * this.fail[i] * R * f - rr) / T * 1.0;
      this.P.push(mk(hand.x + ca * rr, hand.y - .5 * f - (r === K ? .15 : 0), hand.z + sa * rr, r === K ? 1 / (1 + W * .45) : 1, vx + ca * vr, vy, vz + sa * vr));
    }
    this.C = [];   // [a,b,max,kind] kind 0 radial 1 ring
    const ix = (r, i) => 1 + (r - 1) * M + (i % M);
    for (let i = 0; i < M; i++) this.C.push([0, ix(1, i), R / K, 0]);
    for (let r = 1; r <= K; r++) for (let i = 0; i < M; i++) { if (r < K) this.C.push([ix(r, i), ix(r + 1, i), R / K * 1.0, 0]); this.C.push([ix(r, i), ix(r, i + 1), TAU * R * (r / K) / M * 1.02, 1]); }
    this.ix = ix;
    const cell = visCell(net, meshIdx), pm = polarMesh(K, M, cell, R, net.material.color); this.pm = pm; this.mesh = pm.mesh;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    // lead line: rope loop through the rim + instanced sinkers (count capped by generator)
    const lg = new THREE.BufferGeometry(); this.lpos = new Float32Array((M + 1) * 3); lg.setAttribute('position', new THREE.BufferAttribute(this.lpos, 3));
    this.lead = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x2b2b2b })); this.lead.frustumCulled = false; this.lead.renderOrder = 5; this.group.add(this.lead);
    const lm = .72 * W / net.sinkers, sr = Math.max(.02, Math.cbrt(lm / (11340 * 4.19)) * 2.4);
    this.sink = sinkerMesh(net.sinkers, sr, net.sinkerColor); this.group.add(this.sink);
    const hg = new THREE.BufferGeometry(); this.hpos = new Float32Array(16 * 3); hg.setAttribute('position', new THREE.BufferAttribute(this.hpos, 3));
    this.hline = new THREE.Line(hg, new THREE.LineBasicMaterial({ color: 0xcaa86a })); this.hline.frustumCulled = false; this.hline.renderOrder = 5; this.group.add(this.hline);
    this.float = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: net.floatColor })); this.float.renderOrder = 5; this.group.add(this.float);
    S.scene.add(this.group); this.dummy = new THREE.Object3D(); this.sync();
  }
  solve() {
    const P = this.P, ringS = 1 - .93 * this.close, radS = 1 - .32 * this.close;
    for (let it = 0; it < 6; it++) for (const c of this.C) {
      const a = P[c[0]], b = P[c[1]], mx = c[2] * (c[3] ? ringS : radS), dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6; if (d <= mx) continue;
      const w = a.im + b.im, q = (d - mx) / d / w; a.x += dx * q * a.im; a.y += dy * q * a.im; a.z += dz * q * a.im; b.x -= dx * q * b.im; b.y -= dy * q * b.im; b.z -= dz * q * b.im;
    }
    const a = P[0], hd = this.hand, dx = a.x - hd.x, dy = a.y - hd.y, dz = a.z - hd.z, d = Math.hypot(dx, dy, dz);
    if (d > this.L) { const k = this.L / d; a.x = hd.x + dx * k; a.y = hd.y + dy * k; a.z = hd.z + dz * k; }
  }
  step(dt, hand) {
    this.hand.copy(hand); this.t += dt; const sub = 3, h = dt / sub, net = this.net, md = meshDrag(net.mesh[this.mi]), sr = net.sinkRate / md, P = this.P, K = this.K, M = this.M, S = this.S, seaY = 0;
    if (this.hauling) this.L = Math.max(1.8, this.L - 1.7 * dt);
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; p.ox = p.x; p.oy = p.y; p.oz = p.z;
        if (p.y > seaY) { p.vy -= 9.8 * h; const k = Math.exp(-.35 * h); p.vx *= k; p.vz *= k; }
        else {
          const ring = i === 0 ? 0 : Math.ceil(i / M) / K, k = Math.exp(-(1.6 + 1.8 * (1 - ring)) * h);
          p.vx *= k; p.vz *= k;
          let tgt = i === 0 ? -sr * .1 : -sr * (.3 + .7 * ring * ring) * (1 - this.close * .35); if (this.hauling) tgt = i === 0 ? 0 : 1.2;
          if (p.y < -12.6) tgt = Math.max(tgt, 0); p.vy += (tgt - p.vy) * Math.min(1, h * 2.6);
        }
        p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
      }
      if (this.hauling) { const a = P[0]; const dx = this.hand.x - a.x, dy = this.hand.y - a.y, dz = this.hand.z - a.z, d = Math.hypot(dx, dy, dz) + .01, sp = Math.min(2.4, d); a.x += dx / d * sp * h; a.y += dy / d * sp * h * .8; a.z += dz / d * sp * h; }
      this.solve();
      for (const p of P) { p.vx = (p.x - p.ox) / h; p.vy = (p.y - p.oy) / h; p.vz = (p.z - p.oz) / h; }
    }
    const a = P[0];
    if (!this.landed && a.y < .12 && this.t > .15) {
      this.landed = true; this.state = 'water'; const rim = []; let cx = 0, cz = 0; for (let i = 0; i < M; i++) { const p = P[this.ix(K, i)]; rim.push(p); cx += p.x; cz += p.z; } cx /= M; cz /= M;
      let er = 0, holes = 0; for (const p of rim) { const d = Math.hypot(p.x - cx, p.z - cz); er += d; if (d < this.R * .45) holes++; } er /= M;
      for (let i = 0; i < M; i += 2) if (S.splash) S.splash(rim[i].x, rim[i].z, .12); if (S.splash) S.splash(a.x, a.z, .2);
      this.footprint = { cx, cz, effR: er, openFrac: er / this.R, holes: holes / M, R: this.R, open: this.open, vy: -a.vy };
      this.onLand && this.onLand(this);
    }
    if (this.landed) this.sunkT += dt;
    if (this.hauling && Math.hypot(a.x - this.hand.x, a.y - this.hand.y, a.z - this.hand.z) < 2.6) this.done = true;
    this.sync();
  }
  center() { const a = this.P[0]; return { x: a.x, y: a.y, z: a.z }; }
  rimDepth() { let y = 0; for (let i = 0; i < this.M; i++) y += this.P[this.ix(this.K, i)].y; return -y / this.M; }
  sync() {
    const P = this.P, pos = this.pm.pos; for (let i = 0; i < P.length; i++) { pos[i * 3] = P[i].x; pos[i * 3 + 1] = P[i].y; pos[i * 3 + 2] = P[i].z; }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeBoundingSphere();
    const M = this.M, K = this.K; for (let i = 0; i <= M; i++) { const p = P[this.ix(K, i)]; this.lpos.set([p.x, p.y, p.z], i * 3); } this.lead.geometry.attributes.position.needsUpdate = true;
    const ns = this.net.sinkers, d = this.dummy; for (let k = 0; k < ns; k++) { const t = k / ns * M, i = Math.floor(t), f = t - i, a = P[this.ix(K, i)], b = P[this.ix(K, i + 1)]; d.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - .02, a.z + (b.z - a.z) * f); d.updateMatrix(); this.sink.setMatrixAt(k, d.matrix); }
    this.sink.instanceMatrix.needsUpdate = true;
    const a = P[0], hd = this.hand, dist = Math.hypot(a.x - hd.x, a.y - hd.y, a.z - hd.z), sag = Math.sqrt(Math.max(0, this.L * this.L - dist * dist)) * .32;
    for (let i = 0; i < 16; i++) { const t = i / 15; this.hpos.set([hd.x + (a.x - hd.x) * t, hd.y + (a.y - hd.y) * t - sag * 4 * t * (1 - t) * (a.y > 0 ? 1 : .4), hd.z + (a.z - hd.z) * t], i * 3); } this.hline.geometry.attributes.position.needsUpdate = true;
    this.float.position.set(a.x, Math.max(a.y, .02) + .02, a.z);
  }
  dispose() { this.S.scene.remove(this.group); this.group.traverse((o) => { o.geometry && o.geometry.dispose(); }); }
}

/* ============================================================ WALL NETS (seine + gill) ============================================================ */
export class WallNet {
  constructor(S, net, meshIdx, kind) {
    this.S = S; this.net = net; this.kind = kind; this.pts = []; this.sink = 0; this.pull = 0; this.cx = 0; this.cz = 0; this.MAXP = 150;
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(this.MAXP * 2 * 3); this.uv = new Float32Array(this.MAXP * 2 * 2); const idx = [];
    for (let i = 0; i < this.MAXP - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2)); g.setIndex(idx); g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, netMat(kind === 'gill' ? 0xd7e8d0 : net.material.color)); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.nf = Math.min(64, net.floats); this.fl = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshBasicMaterial({ color: net.floatColor }), this.nf); this.fl.frustumCulled = false; this.fl.renderOrder = 5; this.fl.count = 0;
    this.sk = sinkerMesh(Math.min(64, net.sinkers), .07, net.sinkerColor); this.sk.count = 0;
    this.top = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd7a0 })); this.top.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.MAXP * 3), 3)); this.top.frustumCulled = false; this.top.renderOrder = 5;
    this.group = new THREE.Group(); this.group.add(this.mesh, this.fl, this.sk, this.top); S.scene.add(this.group); this.dummy = new THREE.Object3D(); this.cell = visCell(net, meshIdx) * 2.4;
  }
  add(x, z) { if (this.pts.length < this.MAXP) { this.pts.push({ x, z }); } }
  length() { let L = 0; for (let i = 1; i < this.pts.length; i++) L += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z); return L; }
  update(dt) {
    const D = this.net.depth, tgt = this.kind === 'gill' ? 1 : 1; this.sink += (tgt - this.sink) * Math.min(1, dt * (this.net.sinkRate * 1.2) / Math.max(.4, D * .15)); const sk = this.sink;
    const n = this.pts.length, p = this.pos, uv = this.uv; let u = 0; const sc = 1 - .86 * this.pull, dep = D * sk * (1 - .35 * this.pull);
    for (let i = 0; i < n; i++) {
      const q = this.pts[i]; if (i) u += Math.hypot(q.x - this.pts[i - 1].x, q.z - this.pts[i - 1].z);
      const x = this.cx + (q.x - this.cx) * sc, z = this.cz + (q.z - this.cz) * sc;
      p.set([x, .18, z], i * 6); p.set([x, -dep, z], i * 6 + 3); uv.set([u / this.cell, 0, u / this.cell, dep / this.cell], i * 4);
      this.top.geometry.attributes.position.array.set([x, .18, z], i * 3);
    }
    this.mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 6); this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.uv.needsUpdate = true;
    this.top.geometry.setDrawRange(0, n); this.top.geometry.attributes.position.needsUpdate = true;
    const d = this.dummy, nf = Math.min(this.nf, Math.max(0, n)); this.fl.count = nf; this.sk.count = Math.min(nf, this.sk.instanceMatrix.count);
    for (let k = 0; k < nf; k++) { const q = this.pts[Math.min(n - 1, Math.floor(k / Math.max(1, nf - 1) * (n - 1)))]; const x = this.cx + (q.x - this.cx) * sc, z = this.cz + (q.z - this.cz) * sc; d.position.set(x, .2, z); d.updateMatrix(); this.fl.setMatrixAt(k, d.matrix); if (k < this.sk.count) { d.position.set(x, -dep, z); d.updateMatrix(); this.sk.setMatrixAt(k, d.matrix); } }
    this.fl.instanceMatrix.needsUpdate = true; this.sk.instanceMatrix.needsUpdate = true;
  }
  depthNow() { return this.net.depth * this.sink; }
  dispose() { this.S.scene.remove(this.group); this.group.traverse((o) => { o.geometry && o.geometry.dispose(); }); }
}

/* ============================================================ TRAWL ============================================================ */
export class TrawlRig {
  constructor(S, net, meshIdx, comp) {
    this.S = S; this.net = net; this.mi = meshIdx; this.comp = comp; this.hist = []; this.warp = 45; this.deploy = 0; this.depth = 0; this.bag = []; this.sweepT = 0; this.snag = 0; this.K = 8; this.M = 12; this.opening = 0;
    const N = (this.K + 1) * this.M, g = new THREE.BufferGeometry(); this.pos = new Float32Array(N * 3); const uv = new Float32Array(N * 2), idx = [];
    for (let r = 0; r <= this.K; r++) for (let i = 0; i < this.M; i++) { uv[(r * this.M + i) * 2] = i / this.M * Math.max(6, net.mouthW * 1.2); uv[(r * this.M + i) * 2 + 1] = r * 1.2; }
    for (let r = 0; r < this.K; r++) for (let i = 0; i < this.M; i++) { const a = r * this.M + i, b = r * this.M + (i + 1) % this.M, c = a + this.M, d = b + this.M; idx.push(a, c, b, b, c, d); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, netMat(net.material.color)); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.lg = new THREE.BufferGeometry(); this.lp = new Float32Array(4 * 2 * 3); this.lg.setAttribute('position', new THREE.BufferAttribute(this.lp, 3));
    this.lines = new THREE.LineSegments(this.lg, new THREE.LineBasicMaterial({ color: 0xdad2b8 })); this.lines.frustumCulled = false; this.lines.renderOrder = 5;
    this.fl = new THREE.InstancedMesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color: net.floatColor }), 40); this.fl.frustumCulled = false; this.fl.renderOrder = 5; this.fl.count = 0;
    this.doors = [0, 1].map(() => { const b = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.1, 1.5), netMat(0x7a5a2e, { noTex: true })); b.renderOrder = 5; b.frustumCulled = false; return b; });
    this.group = new THREE.Group(); this.group.add(this.mesh, this.lines, this.fl, ...this.doors); S.scene.add(this.group); this.dummy = new THREE.Object3D(); this.m = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
  }
  trail(dist) { // point 'dist' metres back along the boat's track
    const H = this.hist; let acc = 0; for (let i = H.length - 1; i > 0; i--) { const a = H[i], b = H[i - 1], d = Math.hypot(a.x - b.x, a.z - b.z); if (acc + d >= dist) { const f = (dist - acc) / (d || 1); return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }; } acc += d; }
    const l = H[0] || { x: 0, z: 0 }; return { x: l.x, z: l.z, short: true };
  }
  update(dt, boat, speed, seabed) {
    const hx = boat.position.x + Math.sin(boat.heading) * 3.6, hz = boat.position.z + Math.cos(boat.heading) * 3.6, last = this.hist[this.hist.length - 1];
    if (!last || Math.hypot(hx - last.x, hz - last.z) > .6) { this.hist.push({ x: hx, z: hz }); if (this.hist.length > 600) this.hist.shift(); }
    this.deploy = Math.min(1, this.deploy + dt / 14); const net = this.net, c = this.comp;
    this.opening = clamp(this.deploy * c.openMul * clamp(.35 + speed / 1.6, .1, 1), 0, 1);   // needs flow through the net to spread
    const eq = clamp(this.warp * .2 * (.55 + .45 * net.sinkRate * 1.6) - speed * 1.4, .8, seabed - .8);
    this.depth += (eq * this.deploy - this.depth) * Math.min(1, dt * .35);
    const m = this.trail(this.warp), pm = this.trail(this.warp + 2); this.m.x = m.x; this.m.z = m.z; this.m.y = -this.depth; let tx = m.x - pm.x, tz = m.z - pm.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; this.m.tx = tx; this.m.tz = tz;
    const W = net.mouthW * (.35 + .65 * this.opening), Hh = net.mouthH * (.3 + .7 * this.opening), nx = -tz, nz = tx;
    const P = this.pos, K = this.K, M = this.M, len = net.length * this.deploy;
    for (let r = 0; r <= K; r++) { const f = r / K, tp = this.trail(this.warp + len * f * .5 + 0.01), taper = Math.pow(1 - f, 1.3) * .88 + .12; const tdx = tp.x - 0, cx = tp.x, cz = tp.z, cy = -this.depth * (1 - f * .08) - Hh * .0 + (f * .5);
      for (let i = 0; i < M; i++) { const a = i / M * TAU, ex = Math.cos(a) * W / 2 * taper, ey = Math.sin(a) * Hh / 2 * taper; P[(r * M + i) * 3] = cx + nx * ex; P[(r * M + i) * 3 + 1] = cy + ey; P[(r * M + i) * 3 + 2] = cz + nz * ex; } void tdx; }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeBoundingSphere();
    // doors (otter boards) ahead of the mouth + warps back to the stern
    const dd = this.trail(this.warp - 12), sx = boat.position.x + Math.sin(boat.heading) * 3.6, sz = boat.position.z + Math.cos(boat.heading) * 3.6, dw = W * .65 + 2;
    this.doors.forEach((b, j) => { const s = j ? 1 : -1; b.position.set(dd.x + nx * dw * s, -this.depth - Hh * .2, dd.z + nz * dw * s); b.rotation.y = Math.atan2(tx, tz) + s * .3; b.scale.setScalar(.8 + net.mouthW * .02); });
    const L = this.lp; let o = 0; const seg = (a, b) => { L.set([...a, ...b], o); o += 6; };
    this.doors.forEach((b, j) => { seg([sx, .3, sz], [b.position.x, b.position.y, b.position.z]); seg([b.position.x, b.position.y, b.position.z], [m.x + nx * W / 2 * (j ? 1 : -1), -this.depth, m.z + nz * W / 2 * (j ? 1 : -1)]); });
    this.lines.geometry.attributes.position.needsUpdate = true;
    const d = this.dummy, nf = Math.min(40, net.floats); this.fl.count = nf; for (let k = 0; k < nf; k++) { const s = (k / Math.max(1, nf - 1) - .5) * W; d.position.set(m.x + nx * s, -this.depth + Hh / 2 + .1, m.z + nz * s); d.updateMatrix(); this.fl.setMatrixAt(k, d.matrix); } this.fl.instanceMatrix.needsUpdate = true;
    this.W = W; this.H = Hh;
  }
  dispose() { this.S.scene.remove(this.group); this.group.traverse((o) => { o.geometry && o.geometry.dispose(); }); }
}

/* ============================================================ PREVIEW (workshop) ============================================================ */
export function buildNetPreview(net, mi) {
  const g = new THREE.Group(), color = net.material.color;
  const wallLike = (len, dep, curve) => {
    const n = 48, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = []; const cell = visCell(net, mi) * Math.max(1, len / 12);
    for (let i = 0; i < n; i++) { const t = i / (n - 1), a = (t - .5) * curve, x = Math.sin(a) * len / curve, z = (1 - Math.cos(a)) * len / curve * 1; pos.set([x, 0, z, x, -dep, z], i * 6); uv.set([t * len / cell, 0, t * len / cell, dep / cell], i * 4); if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false })); g.add(m);
    const nf = Math.min(64, net.floats), fl = new THREE.InstancedMesh(new THREE.SphereGeometry(Math.max(.08, len / 300), 8, 6), new THREE.MeshBasicMaterial({ color: net.floatColor }), nf), sk = new THREE.InstancedMesh(new THREE.SphereGeometry(Math.max(.06, len / 400), 6, 5), new THREE.MeshBasicMaterial({ color: net.sinkerColor }), nf), d = new THREE.Object3D();
    for (let k = 0; k < nf; k++) { const i = Math.floor(k / (nf - 1) * (n - 1)); d.position.set(pos[i * 6], 0, pos[i * 6 + 2]); d.updateMatrix(); fl.setMatrixAt(k, d.matrix); d.position.y = -dep; d.updateMatrix(); sk.setMatrixAt(k, d.matrix); } g.add(fl, sk);
    return g;
  };
  if (net.type === 'cast') {
    const K = 7, M = 24, R = net.radius, pm = polarMesh(K, M, visCell(net, mi), R, color); pm.mesh.material = new THREE.MeshBasicMaterial({ color, map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (let r = 1; r <= K; r++) for (let i = 0; i < M; i++) { const a = i / M * TAU, f = r / K, k = pm.ix(r, i), rad = R * f * (.98 - .12 * Math.sin(a * 3) * f * .4), y = -Math.pow(f, 2.2) * R * .42 + .3 * (1 - f); pm.pos.set([Math.cos(a) * rad, y, Math.sin(a) * rad], k * 3); } pm.pos.set([0, .55, 0], 0);
    pm.mesh.geometry.attributes.position.needsUpdate = true; g.add(pm.mesh);
    const ns = net.sinkers, sm = new THREE.InstancedMesh(new THREE.SphereGeometry(Math.max(.03, R * .018), 6, 5), new THREE.MeshBasicMaterial({ color: net.sinkerColor }), ns), d = new THREE.Object3D();
    for (let k = 0; k < ns; k++) { const a = k / ns * TAU, rad = R * (.98 - .12 * Math.sin(a * 3) * .4); d.position.set(Math.cos(a) * rad, -R * .42, Math.sin(a) * rad); d.updateMatrix(); sm.setMatrixAt(k, d.matrix); } g.add(sm);
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(0, .55 + t * R * .8, t * R * .15 + Math.sin(t * 3) * .2)); } g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcaa86a })));
  } else if (net.type === 'trawl') {
    const W = net.mouthW, H = net.mouthH, K = 8, M = 14, pos = new Float32Array((K + 1) * M * 3), idx = [], uv = new Float32Array((K + 1) * M * 2);
    for (let r = 0; r <= K; r++) { const f = r / K, tp = Math.pow(1 - f, 1.3) * .88 + .12; for (let i = 0; i < M; i++) { const a = i / M * TAU; pos.set([Math.cos(a) * W / 2 * tp, Math.sin(a) * H / 2 * tp, -f * net.length * .5], (r * M + i) * 3); uv.set([i / M * W * 1.2 / 1.2, r * 1.6], (r * M + i) * 2); } }
    for (let r = 0; r < K; r++) for (let i = 0; i < M; i++) { const a = r * M + i, b = r * M + (i + 1) % M, c = a + M, d = b + M; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false })));
    const nf = Math.min(40, net.floats), fl = new THREE.InstancedMesh(new THREE.SphereGeometry(Math.max(.1, W * .02), 8, 6), new THREE.MeshBasicMaterial({ color: net.floatColor }), nf), d = new THREE.Object3D(); for (let k = 0; k < nf; k++) { d.position.set((k / (nf - 1) - .5) * W * .8, H / 2, 0); d.updateMatrix(); fl.setMatrixAt(k, d.matrix); } g.add(fl);
    [-1, 1].forEach((s) => { const b = new THREE.Mesh(new THREE.BoxGeometry(.12 * W * .1 + .1, H * .8, W * .06 + .8), new THREE.MeshBasicMaterial({ color: 0x7a5a2e })); b.position.set(s * (W / 2 + W * .12), 0, W * .15); g.add(b); g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s * W / 2, 0, 0), new THREE.Vector3(s * (W / 2 + W * .12), 0, W * .15), new THREE.Vector3(s * W * .08, 0, W * .8)]), new THREE.LineBasicMaterial({ color: 0xdad2b8 }))); });
  } else if (net.type === 'seine') g.add(wallLike(net.length, net.depth, 4.6));
  else g.add(wallLike(net.length, net.depth, 1.2));
  return g;
}
