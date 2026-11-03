// @ts-nocheck
/* Workshop preview geometry (static pose of each net type). */
import * as THREE from 'three';
import { TAU } from './config.js';
import { polarMesh, visCell, netTwine } from './nets3d.js';
import { netMaterial } from './underwater.js';

/* ============================================================ PREVIEW (workshop) ============================================================ */
export function buildNetPreview(net, mi) {
  const g = new THREE.Group(), color = net.material.color;
  const wallLike = (len, dep, curve) => {
    const n = 48, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = []; const cell = visCell(net, mi) * Math.max(1, len / 12);
    for (let i = 0; i < n; i++) { const t = i / (n - 1), a = (t - .5) * curve, x = Math.sin(a) * len / curve, z = (1 - Math.cos(a)) * len / curve * 1; pos.set([x, 0, z, x, -dep, z], i * 6); uv.set([t * len / cell, 0, t * len / cell, dep / cell], i * 4); if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); const m = new THREE.Mesh(geo, netMaterial(color, netTwine(net) / cell)); g.add(m);
    const nf = Math.min(64, net.floats), fl = new THREE.InstancedMesh(new THREE.SphereGeometry(Math.max(.08, len / 300), 8, 6), new THREE.MeshBasicMaterial({ color: net.floatColor }), nf), sk = new THREE.InstancedMesh(new THREE.SphereGeometry(Math.max(.06, len / 400), 6, 5), new THREE.MeshBasicMaterial({ color: net.sinkerColor }), nf), d = new THREE.Object3D();
    for (let k = 0; k < nf; k++) { const i = Math.floor(k / (nf - 1) * (n - 1)); d.position.set(pos[i * 6], 0, pos[i * 6 + 2]); d.updateMatrix(); fl.setMatrixAt(k, d.matrix); d.position.y = -dep; d.updateMatrix(); sk.setMatrixAt(k, d.matrix); } g.add(fl, sk);
    return g;
  };
  if (net.type === 'cast') {
    const K = 7, M = 24, R = net.radius, pm = polarMesh(K, M, visCell(net, mi), R, color); pm.mesh.material = netMaterial(color, netTwine(net) / visCell(net, mi));
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
    g.add(new THREE.Mesh(geo, netMaterial(color, .1)));
    const nf = Math.min(40, net.floats), fl = new THREE.InstancedMesh(new THREE.SphereGeometry(Math.max(.1, W * .02), 8, 6), new THREE.MeshBasicMaterial({ color: net.floatColor }), nf), d = new THREE.Object3D(); for (let k = 0; k < nf; k++) { d.position.set((k / (nf - 1) - .5) * W * .8, H / 2, 0); d.updateMatrix(); fl.setMatrixAt(k, d.matrix); } g.add(fl);
    [-1, 1].forEach((s) => { const b = new THREE.Mesh(new THREE.BoxGeometry(.12 * W * .1 + .1, H * .8, W * .06 + .8), new THREE.MeshBasicMaterial({ color: 0x7a5a2e })); b.position.set(s * (W / 2 + W * .12), 0, W * .15); g.add(b); g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s * W / 2, 0, 0), new THREE.Vector3(s * (W / 2 + W * .12), 0, W * .15), new THREE.Vector3(s * W * .08, 0, W * .8)]), new THREE.LineBasicMaterial({ color: 0xdad2b8 }))); });
  } else if (net.type === 'seine') g.add(wallLike(net.length, net.depth, 4.6));
  else g.add(wallLike(net.length, net.depth, 1.2));
  return g;
}
