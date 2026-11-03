// @ts-nocheck
/* Seagulls as GAMEPLAY INFORMATION.
   circling a spot = a school below | diving = shallow & actively feeding (cast-net range) | none != no fish (deep schools have no bird cue)
   Behaviours: flap / glide / soar on thermals / hover / dive / land on the boat rails / take off / squabble / follow the boat for scraps
   Reacts to events: scatter on net throw, swarm a good catch, investigate fish escaping. */
import * as THREE from 'three';
import { clamp, TAU } from './config.js';

const R = Math.random, rt = (a, b) => a + (b - a) * R();
const NG = window.__lite ? 10 : 16;
const WHITE = new THREE.MeshLambertMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide });
const GREY = new THREE.MeshLambertMaterial({ color: 0x9aa4ab, side: THREE.DoubleSide });
const TIP = new THREE.MeshLambertMaterial({ color: 0x1b1d22, side: THREE.DoubleSide });
const BEAK = new THREE.MeshLambertMaterial({ color: 0xf0b81c }), LEG = new THREE.MeshLambertMaterial({ color: 0xd97a5a });

function quadGeo(pts) { const g = new THREE.BufferGeometry(); const v = []; const idx = [[0, 1, 2], [0, 2, 3]]; for (const t of idx) for (const k of t) v.push(...pts[k]); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g; }
const G = {
  body: new THREE.SphereGeometry(.5, 10, 8).scale(.085, .08, .27),
  head: new THREE.SphereGeometry(.5, 8, 6).scale(.085, .085, .1),
  beak: new THREE.ConeGeometry(.018, .09, 6).rotateX(Math.PI / 2),
  tail: quadGeo([[-.05, 0, 0], [.05, 0, 0], [.07, 0, -.17], [-.07, 0, -.17]]),
  leg: new THREE.CylinderGeometry(.006, .006, .09, 4),
};
const wingIn = (s) => quadGeo(s > 0 ? [[0, 0, .1], [.34, 0, .07], [.34, 0, -.07], [0, 0, -.11]] : [[0, 0, .1], [0, 0, -.11], [-.34, 0, -.07], [-.34, 0, .07]].reverse());
const wingOut = (s) => quadGeo(s > 0 ? [[0, 0, .07], [.38, 0, -.015], [.3, 0, -.06], [0, 0, -.07]] : [[0, 0, .07], [0, 0, -.07], [-.3, 0, -.06], [-.38, 0, -.015]].reverse());
const WG = { in: [wingIn(1), wingIn(-1)], out: [wingOut(1), wingOut(-1)] };

function buildGull() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const m = (g, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, mat); o.position.set(x, y, z); o.frustumCulled = false; body.add(o); return o; };
  m(G.body, WHITE); m(G.head, WHITE, 0, .035, .27); m(G.beak, BEAK, 0, .025, .36); m(G.tail, WHITE, 0, .01, -.22);
  const back = m(G.body, GREY, 0, .018, -.02); back.scale.set(.86, .5, .82);
  const legs = [m(G.leg, LEG, .03, -.1, .0), m(G.leg, LEG, -.03, -.1, .0)];
  const wings = [1, -1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(.06 * s, .03, .06); body.add(sh);
    const wi = new THREE.Mesh(WG.in[s > 0 ? 0 : 1], GREY); wi.frustumCulled = false; sh.add(wi);
    const el = new THREE.Group(); el.position.set(.34 * s, 0, 0); sh.add(el);
    const wo = new THREE.Mesh(WG.out[s > 0 ? 0 : 1], TIP); wo.frustumCulled = false; el.add(wo);
    return { s, sh, el };
  });
  return { root, body, wings, legs };
}

export class Gulls {
  constructor(S, fishWorld) {
    this.S = S; this.fw = fishWorld; this.g = []; this.t = 0; this.mt = 0; this.thermals = [];
    this.slots = [[1.28, 1.2, -2.9], [-1.28, 1.2, -2.9], [1.25, 1.2, -1.7], [-1.25, 1.2, -1.7], [0, 1.1, -3.85], [.45, 2.45, .15], [-.45, 2.45, -.4], [.45, 1.55, 3.3], [-.45, 1.55, 3.3]];
    this.slotUse = this.slots.map(() => null);
    for (let i = 0; i < NG; i++) this.add(i);
    for (let i = 0; i < 3; i++) this.thermals.push({ x: 0, z: 0, ph: R() * 9 });
  }
  add(i) {
    const m = buildGull(); this.S.scene.add(m.root);
    const b = this.S.boat.position, a = R() * TAU, d = rt(60, 160);
    const g = { ...m, i, pos: new THREE.Vector3(b.x + Math.cos(a) * d, rt(12, 28), b.z + Math.sin(a) * d), vel: new THREE.Vector3(rt(-4, 4), 0, rt(-4, 4)), st: 'cruise', t: rt(2, 8), school: null, orbitR: rt(9, 15), dir: R() < .5 ? 1 : -1, alt: rt(10, 20), ang: R() * TAU,
      pose: { sh: .1, sw: .1, elz: 0, ely: 0 }, mode: 'glide', ph: R() * TAU, freq: 3, amp: .6, yaw: 0, bank: 0, slot: -1, target: new THREE.Vector3(), flap: 0, carry: 0, ret: 'cruise', off: R() * TAU, size: rt(1.25, 1.5), diveT: 0 };
    g.root.scale.setScalar(g.size); g.yaw = Math.atan2(g.vel.x, g.vel.z); this.g.push(g);
  }
  /* ---- events from the game ---- */
  event(type, x, z) {
    for (const g of this.g) {
      const d = Math.hypot(g.pos.x - x, g.pos.z - z);
      if (type === 'throw' && d < 40) { this.release(g); this.setState(g, 'scatter'); g.target.set(g.pos.x - (x - g.pos.x), 0, g.pos.z - (z - g.pos.z)); }
      else if (type === 'catch' && d < 500) { if (g.st !== 'perch' || R() < .6) { this.release(g); this.setState(g, 'investigate'); g.target.set(x + rt(-3, 3), 3.5, z + rt(-3, 3)); g.t = rt(14, 22); } }
      else if (type === 'escape' && d < 220 && g.st !== 'dive' && R() < .7) { this.release(g); this.setState(g, 'investigate'); g.target.set(x + rt(-4, 4), 4.5, z + rt(-4, 4)); g.t = rt(6, 10); }
    }
  }
  release(g) { if (g.slot >= 0) { this.slotUse[g.slot] = null; g.slot = -1; } g.school = null; }
  setState(g, st) { g.st = st; g.diveT = 0; if (st === 'scatter') g.t = rt(4, 6); }

  /* ---- manager: who watches which school, who dives, who follows ---- */
  manage(boat) {
    const fw = this.fw, bx = boat.position.x, bz = boat.position.z;
    const per = new Map();
    for (const g of this.g) if (g.school) per.set(g.school, (per.get(g.school) || 0) + 1);
    for (const g of this.g) if (g.school && (!fw.schools.includes(g.school) || !fw.isShallowFeeding(g.school))) { if (g.st === 'circle' || g.st === 'hover' || g.st === 'climb') { g.school = null; this.setState(g, 'cruise'); } else g.school = null; }
    for (const s of fw.schools) {
      if (!fw.isShallowFeeding(s) || Math.hypot(s.x - bx, s.z - bz) > 650) continue;
      const want = Math.min(6, 2 + Math.ceil(s.act * 4)), have = [...this.g].filter((g) => g.school === s).length;
      for (let k = have; k < want; k++) {
        const c = this.g.filter((g) => !g.school && (g.st === 'cruise' || g.st === 'follow' || g.st === 'soar' || g.st === 'investigate')).sort((a, b) => a.pos.distanceTo(new THREE.Vector3(s.x, a.pos.y, s.z)) - b.pos.distanceTo(new THREE.Vector3(s.x, b.pos.y, s.z)))[0];
        if (!c) break; this.release(c); c.school = s; this.setState(c, 'circle'); c.alt = rt(11, 19); c.orbitR = s.rad * .7 + rt(7, 11);
      }
      // divers: only on shallow, actively feeding schools
      if (s.d < 3.2) for (const g of this.g) if (g.school === s && g.st === 'circle' && g.pos.y < 24 && R() < .3 * s.act) { this.setState(g, 'dive'); g.target.set(s.x + rt(-1, 1) * s.rad * .6, 0, s.z + rt(-1, 1) * s.rad * .6); break; }
      if (s.d < 3.0 && s.act > .8) for (const g of this.g) if (g.school === s && g.st === 'circle' && R() < .06) { this.setState(g, 'hover'); g.t = rt(2.5, 5); break; }
    }
    // followers & perchers
    const idle = this.g.filter((g) => !g.school && g.st === 'cruise' && g.pos.distanceTo(boat.position) < 200);
    const nf = this.g.filter((g) => g.st === 'follow').length;
    if (nf < 4 && idle.length) { const g = idle[(R() * idle.length) | 0]; this.setState(g, 'follow'); g.t = rt(25, 60); g.off = R() * TAU; }
    const spd = Math.abs(boat.speed);
    for (const g of this.g) if (g.st === 'follow' && spd < 2 && g.t < 18 && R() < .12) { const free = this.slotUse.findIndex((u) => !u); if (free >= 0) { this.slotUse[free] = g; g.slot = free; this.setState(g, 'land'); } }
    // squabbles: two nearby followers fight over scraps
    const fl = this.g.filter((g) => g.st === 'follow' || g.st === 'investigate');
    if (fl.length > 1 && R() < .25) { const a = fl[(R() * fl.length) | 0], b = fl[(R() * fl.length) | 0]; if (a !== b && a.pos.distanceTo(b.pos) < 12) { a.ret = a.st; b.ret = b.st; this.setState(a, 'squabble'); a.other = b; a.t = 4; this.setState(b, 'squabble'); b.other = a; b.t = 4; b.chaser = false; a.chaser = true; } }
    const pg = this.g.filter((g) => g.st === 'perch'); if (pg.length > 1 && R() < .15) { const a = pg[(R() * pg.length) | 0]; if (!a.flare) a.flare = 1.6; }
    // keep gulls from drifting far
    for (const g of this.g) if (g.pos.distanceTo(boat.position) > 700 && g.st === 'cruise') { const a = R() * TAU; g.pos.set(bx + Math.cos(a) * 250, rt(14, 30), bz + Math.sin(a) * 250); }
  }

  /* ---- per-frame ---- */
  update(dt, boat) {
    this.t += dt; this.mt -= dt; if (this.mt <= 0) { this.mt = .5; this.manage(boat); }
    const bx = boat.position.x, bz = boat.position.z, fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
    this.thermals.forEach((th, i) => { th.x = bx + Math.cos(this.t * .003 + i * 2.1) * (90 + i * 40); th.z = bz + Math.sin(this.t * .003 + i * 2.1) * (90 + i * 40); });
    const wavesY = this.S.S.y;
    for (const g of this.g) {
      const p = g.pos, v = g.vel, des = new THREE.Vector3(); let acc = 6, spd = 8, mode = 'glide', alt = 18, hoverFlap = 0;
      g.t -= dt;
      const orbit = (cx, cz, r, a, sp) => { // circle around centre: tangent + radial correction
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz) + .01, tx = -dz / d * g.dir, tz = dx / d * g.dir, rad = (r - d) * .5;
        des.set(tx * sp + dx / d * rad, (a - p.y) * .5, tz * sp + dz / d * rad); };
      switch (g.st) {
        case 'cruise': {
          const th = this.thermals[g.i % 3], d = Math.hypot(p.x - th.x, p.z - th.z);
          if (d < 40 && p.y < 48) { g.st = 'soar'; g.t = rt(15, 30); break; }
          const tx = th.x - p.x, tz = th.z - p.z, tl = Math.hypot(tx, tz) + 1; des.set(tx / tl * 7, (alt - p.y) * .3 + Math.sin(this.t * .3 + g.off) * .5, tz / tl * 7); spd = 7; mode = p.y < 11 ? 'flap' : 'glide'; g.freq = 3.1; g.amp = .55;
          if (g.t < 0) { g.t = rt(10, 20); g.off = R() * TAU; } break; }
        case 'soar': { const th = this.thermals[g.i % 3]; orbit(th.x, th.z, 16, 0, 6.5); des.y = p.y < 50 ? .9 : -.3; mode = 'soar'; if (g.t < 0 || p.y > 52) { g.st = 'cruise'; g.t = rt(10, 20); } break; }
        case 'circle': { const s = g.school; if (!s) { g.st = 'cruise'; break; } orbit(s.x, s.z, g.orbitR, g.alt, 7.2); mode = Math.abs(p.y - g.alt) > 3 || R() < .003 ? 'flap' : 'soar'; g.freq = 3.4; g.amp = .5; if (Math.sin(this.t * .7 + g.i) > .6) mode = 'flap'; break; }
        case 'hover': { const s = g.school; if (!s) { g.st = 'cruise'; break; } des.set((s.x - p.x) * .7 - v.x * .5, (5.5 - p.y) * 1.2, (s.z - p.z) * .7 - v.z * .5); mode = 'hover'; spd = 3; acc = 9; if (g.t < 0) { g.st = 'circle'; } break; }
        case 'dive': {
          g.diveT += dt; const tx = g.target.x - p.x, tz = g.target.z - p.z, ty = wavesY - .1 - p.y, tl = Math.hypot(tx, tz, ty) + .01; spd = Math.min(18, 7 + g.diveT * 12); des.set(tx / tl * spd, ty / tl * spd, tz / tl * spd); acc = 22; mode = g.diveT > .5 ? 'dive' : 'flap'; g.freq = 5;
          if (p.y < wavesY + .15 || g.diveT > 6) { if (this.S.splash) { this.S.splash(p.x, p.z, .16); this.S.splash(p.x + .4, p.z, .08); } g.carry = R() < .5 ? 2.5 : 0; g.st = 'climb'; g.t = 2.5; v.y = 4; v.multiplyScalar(.5); } break; }
        case 'climb': { const s = g.school; des.set(v.x * 1.1, 6, v.z * 1.1); if (des.length() < 6) des.set(Math.cos(g.ang) * 6, 6, Math.sin(g.ang) * 6); spd = 7; mode = 'flap'; g.freq = 4.6; g.amp = .8; acc = 9; if (g.t < 0 || p.y > 9) g.st = s ? 'circle' : 'cruise'; break; }
        case 'follow': {
          const sd = Math.sin(g.off) * 3.2, back = 9 + (g.i % 4) * 2.2, tx = bx - fx * back - fz * sd * -1, tz = bz - fz * back + fx * sd * -1;
          const ex = tx - p.x, ez = tz - p.z, el = Math.hypot(ex, ez) + .01; const bs = Math.abs(boat.speed), vs = Math.min(bs + el * .5, 11);
          des.set(fx * bs * (boat.speed > 0 ? 1 : 0) + ex / el * Math.min(vs, el * .8 + 1), (5.2 + Math.sin(this.t * .6 + g.off) * 1.2 - p.y) * .8, fz * bs * (boat.speed > 0 ? 1 : 0) + ez / el * Math.min(vs, el * .8 + 1));
          spd = 11; mode = el > 8 || p.y < 3 ? 'flap' : 'glide'; g.freq = 3.4; g.amp = .55; if (g.t < 0) { g.st = 'cruise'; g.t = rt(5, 12); } break; }
        case 'investigate': { orbit(g.target.x, g.target.z, 6, g.target.y, 6); mode = 'flap'; g.freq = 3.6; g.amp = .6; if (g.t < 0) { g.st = 'follow'; g.t = rt(20, 50); } break; }
        case 'scatter': { const tx = g.target.x - p.x, tz = g.target.z - p.z, tl = Math.hypot(tx, tz) + .1; des.set(tx / tl * 11, 6 - p.y * .1 + 3, tz / tl * 11); spd = 11; acc = 14; mode = 'flap'; g.freq = 5.2; g.amp = .9; if (g.t < 0) { g.st = 'cruise'; g.t = 6; } break; }
        case 'squabble': { const o = g.other; if (!o || g.t < 0) { g.st = g.ret || 'cruise'; g.t = 10; break; } const dx = o.pos.x - p.x, dz = o.pos.z - p.z, dy = o.pos.y - p.y, dl = Math.hypot(dx, dy, dz) + .01; const s2 = g.chaser ? 9 : -7; des.set(dx / dl * s2 + Math.sin(this.t * 6 + g.i) * 4, dy / dl * s2 * .6 + 1, dz / dl * s2 + Math.cos(this.t * 5 + g.i) * 4); spd = 10; acc = 18; mode = 'flap'; g.freq = 6; g.amp = 1.0; break; }
        case 'land': {
          const sl = this.slots[g.slot], w = boat.localToWorld(new THREE.Vector3(sl[0], sl[1] + .15, sl[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
          const dx = w.x - p.x, dy = w.y - p.y, dz = w.z - p.z, dl = Math.hypot(dx, dy, dz) + .01, sp = clamp(dl * .9, 1.4, 7);
          des.set(dx / dl * sp + fx * boat.speed * .6, dy / dl * sp * (dl > 3 ? .5 : 1) + (dl > 3 ? (w.y + 2 - p.y) * .3 : 0), dz / dl * sp + fz * boat.speed * .6); acc = 10; spd = 8; mode = dl < 3.2 ? 'land' : 'glide'; g.freq = 4.2; g.amp = .7;
          if (dl < .5) { g.st = 'perch'; g.t = rt(14, 45); g.flare = 0; v.set(0, 0, 0); } break; }
        case 'perch': {
          const sl = this.slots[g.slot]; if (!sl) { g.st = 'cruise'; break; }
          const w = boat.localToWorld(new THREE.Vector3(sl[0], sl[1], sl[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); p.copy(w); v.set(0, 0, 0);
          if (g.flare > 0) { g.flare -= dt; mode = 'flare'; p.y += Math.abs(Math.sin(this.t * 12)) * .05; } else mode = 'fold';
          g.yaw += ((boat.heading + Math.PI + (g.i % 2 ? .3 : -.3)) - g.yaw) * Math.min(1, dt * 3); g.bank = 0;
          if (g.t < 0 || Math.abs(boat.speed) > 3.2) { this.release(g); g.st = 'takeoff'; g.t = 2.2; v.set(fx * 3, 3.5, fz * 3); } this.place(g, dt, mode, v, 0); continue; }
        case 'takeoff': { des.set(fx * 4 + Math.cos(g.ang) * 3, 5, fz * 4 + Math.sin(g.ang) * 3); spd = 7; acc = 10; mode = 'flap'; g.freq = 5; g.amp = .95; if (g.t < 0) { g.st = 'follow'; g.t = rt(10, 25); } break; }
      }
      // steering
      const dv = des.sub(v), dl2 = dv.length(); if (dl2 > acc * dt) dv.multiplyScalar(acc * dt / dl2); v.add(dv);
      const sm = v.length(); if (sm > spd * 1.3) v.multiplyScalar(spd * 1.3 / sm);
      if (g.st !== 'dive' && p.y + v.y * dt < wavesY + 1.6 && g.st !== 'land' && g.st !== 'climb') v.y = Math.max(v.y, 1.2);
      p.addScaledVector(v, dt);
      this.place(g, dt, mode, v, hoverFlap);
    }
  }
  place(g, dt, mode, v, _h) {
    const hs = Math.hypot(v.x, v.z); const targetYaw = hs > .4 ? Math.atan2(v.x, v.z) : g.yaw;
    let dy = ((targetYaw - g.yaw + Math.PI * 3) % TAU) - Math.PI; const yr = dy / Math.max(dt, 1e-3);
    if (g.st !== 'perch') g.yaw += dy * Math.min(1, dt * 5);
    g.bank += (clamp(-yr * .45, -.8, .8) - g.bank) * Math.min(1, dt * 4);
    const pitch = mode === 'dive' ? .95 : mode === 'hover' ? -.65 : mode === 'land' ? -.35 : clamp(-Math.atan2(v.y, hs + .5) * .8, -.6, .6);
    const r = g.root; r.position.copy(g.pos); r.rotation.set(0, 0, 0); r.rotation.order = 'YXZ'; r.rotation.y = g.yaw; r.rotation.x = pitch; r.rotation.z = g.bank;
    // wing pose targets
    let sh = .12, sw = .1, elz = -.04, ely = 0, fl = 0, freq = g.freq, amp = g.amp, legs = 0;
    switch (mode) {
      case 'glide': sh = .1; sw = .12; elz = -.06; break;
      case 'soar': sh = .2; sw = .02; elz = -.02; break;
      case 'flap': fl = 1; sw = .1; break;
      case 'hover': fl = 1; freq = 6.5; amp = .9; sh = .25; sw = .05; legs = .5; break;
      case 'dive': sh = -.1; sw = 1.2; elz = .0; ely = -1.1; break;
      case 'land': fl = 1; freq = 3; amp = .55; sh = .55; sw = .0; legs = 1; break;
      case 'fold': sh = -.08; sw = 1.5; elz = 0; ely = -.12; break;
      case 'flare': fl = 1; freq = 7; amp = .7; sh = .5; sw = .0; break;
    }
    const k = Math.min(1, dt * (mode === 'dive' ? 14 : 8)), P = g.pose; P.sh += (sh - P.sh) * k; P.sw += (sw - P.sw) * k; P.elz += (elz - P.elz) * k; P.ely += (ely - P.ely) * k;
    g.ph += dt * freq * TAU * (fl ? 1 : 0); const s1 = Math.sin(g.ph), s2 = Math.sin(g.ph - 1.0);
    const flapA = fl ? s1 * amp : 0, elbowF = fl ? s2 * amp * .75 : 0, bend = fl ? Math.max(0, Math.cos(g.ph)) * .5 : 0;
    for (const w of g.wings) {
      w.sh.rotation.z = (P.sh + flapA) * w.s * 1; w.sh.rotation.y = P.sw * w.s * 1; w.sh.rotation.x = 0;
      w.el.rotation.z = (P.elz + elbowF) * w.s; w.el.rotation.y = (P.ely - bend * .6) * w.s;
    }
    g.body.position.y = fl ? s1 * .015 : 0;
    g.legs.forEach((l, i) => { l.rotation.x = legs ? 0.3 : 1.3; l.position.y = legs ? -.1 : -.045; l.position.z = legs ? .0 : -.08; });
  }
}
