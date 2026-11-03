    const H = this.hist; let acc = 0; for (let i = H.length - 1; i > 0; i--) { const a = H[i], b = H[i - 1], d = Math.hypot(a.x - b.x, a.z - b.z); if (acc + d >= dist) { const f = (dist - acc) / (d || 1); return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }; } acc += d; }
    const l = H[0] || { x: 0, z: 0 }; return { x: l.x, z: l.z, short: true };
  }
  fill() { return clamp(this.bag.length / (120 + this.net.mouthW * 14), 0, 1); }
  setDepth(d) { this.tgt = clamp(d, 1, this.seabed - 1.2); }
  haulIn() { this.hauling = true; this.auto = false; }
  update(dt, boat, speed, seabed) {
    this.t += dt; this.seabed = seabed; const hx = boat.position.x + Math.sin(boat.heading) * 3.6, hz = boat.position.z + Math.cos(boat.heading) * 3.6, last = this.hist[this.hist.length - 1];
    if (!last || Math.hypot(hx - last.x, hz - last.z) > .6) { this.hist.push({ x: hx, z: hz }); if (this.hist.length > 900) this.hist.shift(); }
    this.deploy = Math.min(1, this.deploy + dt / 16); const net = this.net, c = this.comp;
    /* the mouth spreads with the square of the water flow through the doors; below ~1 kn the net hangs folded and sinks */
    this.spread += (clamp(Math.pow(speed / 1.5, 2), .06, 1) - this.spread) * Math.min(1, dt * .5);
    this.opening = clamp(this.deploy * c.openMul * this.spread, 0, 1) * (this.hauling ? .5 : 1);
    /* winch: hold the depth the player asked for (the warp pays out / heaves in by itself) */
    this.tgt = clamp(this.tgt, 1, Math.max(1.5, seabed - 1.2)); const want = this.hauling ? 0.3 : this.tgt;
    const eq = want * this.deploy, vmax = .55 + net.sinkRate * .9; this.vDepth += (clamp((eq - this.depth) * .6, -vmax * .9, vmax) - this.vDepth) * Math.min(1, dt * 1.5); this.depth = clamp(this.depth + this.vDepth * dt, 0, seabed - .5);
    const wT = this.hauling ? 8 : clamp(18 + Math.max(this.tgt, this.depth) * 6.5, 25, 140), wr = this.hauling ? 9 : 6; this.warp += clamp(wT - this.warp, -wr * dt, wr * dt);
    if (this.hauling && this.warp <= 8.6 && this.depth < 1.4) this.hauled = true;
    const m = this.trail(this.warp), pm = this.trail(this.warp + 2); this.m.x = m.x; this.m.z = m.z; this.m.y = -this.depth; let tx = m.x - pm.x, tz = m.z - pm.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; this.m.tx = tx; this.m.tz = tz;
    const W = net.mouthW * (.3 + .7 * this.opening), Hh = net.mouthH * (.25 + .75 * this.opening), nx = -tz, nz = tx; this.tn = { nx, nz, tx, tz };
    const P = this.pos, K = this.K, M = this.M, len = net.length * this.deploy, fill = this.fill();
    for (let r = 0; r <= K; r++) {
      const f = r / K, tp = this.trail(this.warp + len * f * .5 + .01), taper = Math.pow(1 - f, 1.3) * .88 + .12, bulge = 1 + fill * 1.3 * sstep(.65, 1, f) * (1 - .2 * Math.sin(this.t * 2 + r)), flut = Math.sin(this.t * 3.2 + r * 1.3) * .03 * speed;
      const cx = tp.x, cz = tp.z, cy = -this.depth * (1 - f * .05) + f * .5 - fill * f * f * .8; this.ringC[r][0] = cx; this.ringC[r][1] = cy; this.ringC[r][2] = cz; this.ringR[r] = W / 2 * taper * bulge;
      for (let i = 0; i < M; i++) { const a = i / M * TAU, ex = Math.cos(a) * W / 2 * taper * bulge * (1 + flut), ey = Math.sin(a) * Hh / 2 * taper * bulge; P[(r * M + i) * 3] = cx + nx * ex; P[(r * M + i) * 3 + 1] = cy + ey; P[(r * M + i) * 3 + 2] = cz + nz * ex; }
    }
    this.cod.x = this.ringC[K - 1][0]; this.cod.y = this.ringC[K - 1][1]; this.cod.z = this.ringC[K - 1][2];
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeBoundingSphere(); this.mesh.geometry.computeVertexNormals();
    // lengthwise strengthening ropes and codend rings
    for (let k = 0; k < 4; k++) { const i = k * (M / 4), b = this.lineBuf; for (let r = 0; r <= K; r++) { b[r * 3] = P[(r * M + i) * 3]; b[r * 3 + 1] = P[(r * M + i) * 3 + 1]; b[r * 3 + 2] = P[(r * M + i) * 3 + 2]; } this.lines[k].set(b, K + 1); }
    [K - 3, K - 2, K - 1].forEach((r, k) => { const b = this.ringBuf; for (let i = 0; i < M; i++) { b[i * 3] = P[(r * M + i) * 3]; b[i * 3 + 1] = P[(r * M + i) * 3 + 1]; b[i * 3 + 2] = P[(r * M + i) * 3 + 2]; } this.rings[k].set(b, M, true); });
    // otter boards ahead of the mouth, spread by flow; warps sag between the stern and the doors; bridles run to the wing ends
    const dd = this.trail(Math.max(6, this.warp - 12 * (.4 + .6 * this.deploy))), sx = hx, sz = hz, dw = (W * .65 + 2) * (.4 + .6 * this.spread);
    this.doors.forEach((b, j) => { const s = j ? 1 : -1; b.position.set(dd.x + nx * dw * s, -this.depth - Hh * .2, dd.z + nz * dw * s); b.rotation.y = Math.atan2(tx, tz) + s * .3 * (.5 + .5 * this.spread); b.rotation.z = s * .08; b.scale.setScalar(.8 + net.mouthW * .02);
      const dpt = [b.position.x, b.position.y, b.position.z], buf = this.buf; for (let i = 0; i < 16; i++) { const t = i / 15; buf[i * 3] = sx + (dpt[0] - sx) * t; buf[i * 3 + 1] = lerp(.3, dpt[1], Math.pow(t, 1.25)) + Math.sin(t * Math.PI) * -.12 * Math.min(10, this.warp) * .12; buf[i * 3 + 2] = sz + (dpt[2] - sz) * t; } (j ? this.rope.warpR : this.rope.warpL).set(buf, 16);
      const wx = m.x + nx * W / 2 * s, wz = m.z + nz * W / 2 * s; buf[0] = dpt[0]; buf[1] = dpt[1]; buf[2] = dpt[2]; buf[3] = wx; buf[4] = -this.depth; buf[5] = wz; (j ? this.rope.brR : this.rope.brL).set(buf, 2); });
    const hp = new Float32Array(60), fp = new Float32Array(60); for (let i = 0; i < 20; i++) { const t = i / 19 - .5; hp[i * 3] = m.x + nx * t * W; hp[i * 3 + 1] = -this.depth + Hh / 2 - Math.cos(t * Math.PI) * .12; hp[i * 3 + 2] = m.z + nz * t * W; fp[i * 3] = hp[i * 3]; fp[i * 3 + 1] = -this.depth - Hh / 2 + Math.cos(t * Math.PI) * .22 * (1 - this.opening * .6); fp[i * 3 + 2] = hp[i * 3 + 2]; }
    this.rope.head.set(hp, 20); this.rope.foot.set(fp, 20);
    const d = this.dummy; d.quaternion.identity(); this.fl.count = this.nfl; this.sk.count = this.nsk;
    for (let k = 0; k < this.nfl; k++) { const s = (k / Math.max(1, this.nfl - 1) - .5); d.position.set(m.x + nx * s * W, -this.depth + Hh / 2 + .12 - Math.cos(s * Math.PI) * .12, m.z + nz * s * W); d.updateMatrix(); this.fl.setMatrixAt(k, d.matrix); }
    for (let k = 0; k < this.nsk; k++) { const s = (k / Math.max(1, this.nsk - 1) - .5); d.position.set(m.x + nx * s * W, -this.depth - Hh / 2 - .05 + Math.cos(s * Math.PI) * .22 * (1 - this.opening * .6), m.z + nz * s * W); d.updateMatrix(); this.sk.setMatrixAt(k, d.matrix); }
    this.fl.instanceMatrix.needsUpdate = true; this.sk.instanceMatrix.needsUpdate = true; this.W = W; this.H = Hh;
    this.updateBag();
  }
  /* the catch, visible inside the codend */
  updateBag() {
    const n = Math.min(this.NB, this.bag.length), d = this.dummy, { nx, nz, tx, tz } = this.tn, K = this.K; this.bagMesh.count = n; const AC = this.bAC.array, AB = this.bAB.array, AF = this.bAF.array;
    for (let k = 0; k < n; k++) {
      const b = this.bag[k], sp = b.f.sp, hsh = Math.sin(k * 91.7) * 43758.5453, u = hsh - Math.floor(hsh), v = Math.sin(k * 12.9 + 4.1) * 7.3 - Math.floor(Math.sin(k * 12.9 + 4.1) * 7.3), rr = K - 1 - (k % 3) * .8, r0 = Math.floor(rr), fr = rr - r0, c0 = this.ringC[r0], c1 = this.ringC[Math.min(K, r0 + 1)];
      const rad = (this.ringR[r0] * (1 - fr) + this.ringR[Math.min(K, r0 + 1)] * fr) * .6, ang = u * TAU, ex = Math.cos(ang) * rad * (.3 + .7 * v), ey = Math.sin(ang) * rad * (.3 + .7 * v) * .6;
      d.position.set(lerp(c0[0], c1[0], fr) + nx * ex + Math.sin(this.t * 2 + k) * .03, lerp(c0[1], c1[1], fr) + ey, lerp(c0[2], c1[2], fr) + nz * ex);
      d.rotation.set(0, Math.atan2(tx, tz) + Math.sin(this.t * 1.7 + k * 1.3) * .5 + (u - .5) * .8, Math.sin(this.t * 2.3 + k) * .5, 'YXZ'); const L = sp.len * b.f.lenK * .92; d.scale.set(L * .95, L * .95, L); d.updateMatrix(); this.bagMesh.setMatrixAt(k, d.matrix);
      const cs = SPECIES[sp.id], cc = this._c || (this._c = new THREE.Color()); cc.setHex(cs.color); AC[k * 3] = cc.r; AC[k * 3 + 1] = cc.g; AC[k * 3 + 2] = cc.b; cc.setHex(cs.belly); AB[k * 3] = cc.r; AB[k * 3 + 1] = cc.g; AB[k * 3 + 2] = cc.b; AF[k * 4] = 0; AF[k * 4 + 1] = k * 1.7; AF[k * 4 + 2] = .8; AF[k * 4 + 3] = sp.id === 'mackerel' ? 1 : 0;
    }
    this.bagMesh.instanceMatrix.needsUpdate = true; this.bAC.needsUpdate = this.bAB.needsUpdate = this.bAF.needsUpdate = true;
  }
  dispose() { this.dead = true; disposeGroup(this.S, this.group); }
}
