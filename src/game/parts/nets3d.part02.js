    this.opening = clamp(this.deploy * c.openMul * this.spread, 0, 1);
    /* sinking: gear drops at a rate set by weight; equilibrium depth from warp length, tow speed and weight (heavy gear runs deeper, fast tow lifts it) */
    const eq = clamp(this.warp * .2 * (.55 + .45 * net.sinkRate * 1.6) - speed * 1.4, .8, seabed - .8) * this.deploy;
    const vmax = .35 + net.sinkRate * .9; this.vDepth += (clamp((eq - this.depth) * .5, -vmax * .6, vmax) - this.vDepth) * Math.min(1, dt * 1.5); this.depth = clamp(this.depth + this.vDepth * dt, 0, seabed - .5);
    const m = this.trail(this.warp), pm = this.trail(this.warp + 2); this.m.x = m.x; this.m.z = m.z; this.m.y = -this.depth; let tx = m.x - pm.x, tz = m.z - pm.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; this.m.tx = tx; this.m.tz = tz;
    const W = net.mouthW * (.3 + .7 * this.opening), Hh = net.mouthH * (.25 + .75 * this.opening), nx = -tz, nz = tx;
    const P = this.pos, K = this.K, M = this.M, len = net.length * this.deploy, fill = this.fill();
    for (let r = 0; r <= K; r++) {
      const f = r / K, tp = this.trail(this.warp + len * f * .5 + .01), taper = Math.pow(1 - f, 1.3) * .88 + .12, bulge = 1 + fill * 1.3 * sstep(.65, 1, f) * (1 - .2 * Math.sin(this.t * 2 + r)), flut = Math.sin(this.t * 3.2 + r * 1.3) * .03 * speed;
      const cx = tp.x, cz = tp.z, cy = -this.depth * (1 - f * .05) + f * .5 - fill * f * f * .8;
      for (let i = 0; i < M; i++) { const a = i / M * TAU, ex = Math.cos(a) * W / 2 * taper * bulge * (1 + flut), ey = Math.sin(a) * Hh / 2 * taper * bulge - (r > 5 ? Math.max(0, -Math.sin(a)) * 0 : 0); P[(r * M + i) * 3] = cx + nx * ex; P[(r * M + i) * 3 + 1] = cy + ey; P[(r * M + i) * 3 + 2] = cz + nz * ex; }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeBoundingSphere();
    // otter boards ahead of the mouth, spread by flow; warps sag between the stern and the doors; bridles run to the wing ends
    const dd = this.trail(Math.max(6, this.warp - 12 * (.4 + .6 * this.deploy))), sx = boat.position.x + Math.sin(boat.heading) * 3.6, sz = boat.position.z + Math.cos(boat.heading) * 3.6, dw = (W * .65 + 2) * (.4 + .6 * this.spread);
    const ends = [];
    this.doors.forEach((b, j) => { const s = j ? 1 : -1; b.position.set(dd.x + nx * dw * s, -this.depth - Hh * .2, dd.z + nz * dw * s); b.rotation.y = Math.atan2(tx, tz) + s * .3 * (.5 + .5 * this.spread); b.scale.setScalar(.8 + net.mouthW * .02);
      const dpt = [b.position.x, b.position.y, b.position.z], buf = this.buf; for (let i = 0; i < 16; i++) { const t = i / 15; buf[i * 3] = sx + (dpt[0] - sx) * t; buf[i * 3 + 1] = lerp(.3, dpt[1], Math.pow(t, 1.25)) + Math.sin(t * Math.PI) * -.12 * Math.min(10, this.warp) * .12; buf[i * 3 + 2] = sz + (dpt[2] - sz) * t; } (j ? this.rope.warpR : this.rope.warpL).set(buf, 16);
      const wx = m.x + nx * W / 2 * s, wz = m.z + nz * W / 2 * s; buf[0] = dpt[0]; buf[1] = dpt[1]; buf[2] = dpt[2]; buf[3] = wx; buf[4] = -this.depth; buf[5] = wz; (j ? this.rope.brR : this.rope.brL).set(buf, 2); ends.push([wx, wz]); });
    // head rope (floats) and foot rope (sinkers / rollers) across the mouth
    const hb = this.buf; for (let i = 0; i < 20; i++) { const t = i / 19 - .5, sag = Math.cos(t * Math.PI) * .12; hb[i * 3] = m.x + nx * t * W; hb[i * 3 + 1] = -this.depth + Hh / 2 - sag; hb[i * 3 + 2] = m.z + nz * t * W; } this.buf = hb;
    const hp = new Float32Array(60), fp = new Float32Array(60); for (let i = 0; i < 20; i++) { const t = i / 19 - .5; hp[i * 3] = m.x + nx * t * W; hp[i * 3 + 1] = -this.depth + Hh / 2 - Math.cos(t * Math.PI) * .12; hp[i * 3 + 2] = m.z + nz * t * W; fp[i * 3] = hp[i * 3]; fp[i * 3 + 1] = -this.depth - Hh / 2 + Math.cos(t * Math.PI) * .22 * (1 - this.opening * .6); fp[i * 3 + 2] = hp[i * 3 + 2]; }
    this.rope.head.set(hp, 20); this.rope.foot.set(fp, 20);
    const d = this.dummy; d.quaternion.identity(); this.fl.count = this.nfl; this.sk.count = this.nsk;
    for (let k = 0; k < this.nfl; k++) { const s = (k / Math.max(1, this.nfl - 1) - .5); d.position.set(m.x + nx * s * W, -this.depth + Hh / 2 + .12 - Math.cos(s * Math.PI) * .12, m.z + nz * s * W); d.updateMatrix(); this.fl.setMatrixAt(k, d.matrix); }
    for (let k = 0; k < this.nsk; k++) { const s = (k / Math.max(1, this.nsk - 1) - .5); d.position.set(m.x + nx * s * W, -this.depth - Hh / 2 - .05 + Math.cos(s * Math.PI) * .22 * (1 - this.opening * .6), m.z + nz * s * W); d.updateMatrix(); this.sk.setMatrixAt(k, d.matrix); }
    this.fl.instanceMatrix.needsUpdate = true; this.sk.instanceMatrix.needsUpdate = true; this.W = W; this.H = Hh;
  }
  dispose() { disposeGroup(this.S, this.group); }
}
