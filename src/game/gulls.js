// @ts-nocheck
/* Hyper-realistic Herring Gulls (Larus argentatus) — rig animation and organic seabird behaviour.
   Gameplay cues preserved: circling = shallow school below | diving / snatching / floating = actively feeding | none != no fish. */
import * as THREE from 'three';
import { clamp, TAU } from './config.js';
import { buildGullRig } from './gullMesh.js';
import { sheerX, sheerY } from './walk.js';

const R = Math.random, rt = (a, b) => a + (b - a) * R();

function railSlot(sign, z) {
  const t = clamp((z + 3.9) / 8.2, 0, 1);
  const x = sign * (sheerX(t) - 0.025), y = sheerY(t) + 0.049;
  const t2 = clamp(t + 0.02, 0, 1), dx = sign * (sheerX(t2) - sheerX(t)), dz = 0.02 * 8.2;
  return { x, y, z, railYaw: Math.atan2(dx, dz), railWalk: true, sign };
}

export class Gulls {
  constructor(S, fishWorld, onCry = null) {
    this.S = S; this.fw = fishWorld; this.onCry = onCry; this.g = []; this.t = 0; this.mt = 0; this.thermals = [];
    const isLow = S.P && S.P.quality === 'Low';
    this.NG = window.__lite || isLow ? 14 : 18;
    this.slots = [
      railSlot(-1, -1.62), railSlot(-1, -2.72), railSlot(1, -1.70), railSlot(1, -2.82),
      { x: 0.0, y: sheerY(0) + 0.049, z: -3.88, railYaw: 0, railWalk: true, transom: true, sign: 1 },
      { x: -0.48, y: 2.33, z: -0.05, railYaw: -0.15, railWalk: false, sign: -1 },
      { x:  0.48, y: 2.33, z: -0.35, railYaw:  0.15, railWalk: false, sign:  1 },
      railSlot(-1, 2.35), railSlot(1, 2.35),
    ];
    this.slotUse = this.slots.map(() => null);
    for (let i = 0; i < this.NG; i++) this.add(i);
    for (let i = 0; i < 3; i++) this.thermals.push({ x: 0, z: 0, ph: R() * 9 });

    // Start with 2 gulls perched on the cockpit rails so deck view immediately shows lifelike perched gulls
    for (let sIdx = 0; sIdx < 2 && sIdx < this.g.length; sIdx++) {
      const g = this.g[sIdx];
      this.slotUse[sIdx] = g; g.slot = sIdx; g.st = 'perch'; g.t = rt(35, 75); g.unfold = 0;
      g.pos.copy(this.slotWorldPos(sIdx, 0)); g.vel.set(0, 0, 0);
      g.yaw = S.boat.heading + (sIdx === 0 ? 0.18 : -0.22);
    }
  }

  slotWorldPos(slotIdx, walkOffset = 0, extraY = 0) {
    const sl = this.slots[slotIdx] || this.slots[0], footClearance = 0.132;
    let lx = sl.x, ly = sl.y + footClearance + extraY, lz = sl.z;
    if (sl.railWalk && walkOffset !== 0) {
      if (sl.transom) lx += walkOffset;
      else {
        lz = clamp(sl.z + walkOffset, -3.5, -1.1);
        const t = clamp((lz + 3.9) / 8.2, 0, 1);
        lx = sl.sign * (sheerX(t) - 0.025); ly = sheerY(t) + 0.049 + footClearance + extraY;
      }
    }
    return this.S.hullG.localToWorld(new THREE.Vector3(lx, ly, lz));
  }

  add(i) {
    const m = buildGullRig(this.S, i); this.S.scene.add(m.root);
    const b = this.S.boat.position, a = R() * TAU, d = rt(28, 125), size = rt(0.94, 1.10);
    const g = {
      ...m, i, size,
      pos: new THREE.Vector3(b.x + Math.cos(a) * d, rt(9, 24), b.z + Math.sin(a) * d),
      vel: new THREE.Vector3(rt(-4, 4), 0, rt(-4, 4)),
      st: i < 4 ? 'follow' : 'cruise', t: rt(8, 25), school: null,
      orbitR: rt(7, 17), orbitEcc: rt(0.78, 1.22), dir: R() < 0.5 ? 1 : -1,
      alt: 8 + (i % 6) * 3.1 + rt(-1.2, 1.2), ang: R() * TAU,
      pose: { shZ: 0.12, shY: 0.06, elZ: -0.08, elY: 0, wrZ: -0.05, wrY: 0, wrX: 0 },
      unfold: 1, mode: 'glide', ph: R() * TAU, baseFreq: rt(2.85, 3.55), freq: 3.1, amp: 0.55,
      yaw: 0, bank: 0, slot: -1, target: new THREE.Vector3(), carry: 0, ret: 'cruise', off: R() * TAU,
      diveT: 0, takeoffT: 0, settleT: 0,
      headYaw: 0, headPitch: 0, headTilt: 0, headTarget: { y: 0, p: 0, z: 0, t: rt(1.2, 3.5) },
      preenT: 0, ruffleT: 0, walkOff: 0, walkTarget: 0, walkT: rt(4, 11), walkPhase: R() * TAU,
      wingDipT: 0, wingDipSide: 1, lod: false,
    };
    g.root.scale.setScalar(g.size); g.yaw = Math.atan2(g.vel.x, g.vel.z); this.g.push(g);
  }

  event(type, x, z) {
    for (const g of this.g) {
      const d = Math.hypot(g.pos.x - x, g.pos.z - z);
      if (type === 'throw' && d < 36) {
        const wasPerched = g.st === 'perch';
        this.release(g); this.setState(g, wasPerched ? 'takeoff' : 'scatter');
        g.target.set(g.pos.x - (x - g.pos.x), 0, g.pos.z - (z - g.pos.z));
      } else if (type === 'catch' && d < 420 && (g.st !== 'perch' || R() < 0.5)) {
        this.release(g); this.setState(g, 'investigate');
        g.target.set(x + rt(-3, 3), 3.5, z + rt(-3, 3)); g.t = rt(14, 22);
      } else if (type === 'escape' && d < 200 && g.st !== 'dive' && g.st !== 'perch' && R() < 0.7) {
        this.release(g); this.setState(g, 'investigate');
        g.target.set(x + rt(-4, 4), 4.5, z + rt(-4, 4)); g.t = rt(6, 10);
      }
    }
  }

  release(g) { if (g.slot >= 0) { this.slotUse[g.slot] = null; g.slot = -1; } g.school = null; }
  setState(g, st) {
    g.st = st; g.diveT = 0;
    if (st === 'scatter') g.t = rt(4, 6);
    if (st === 'takeoff') { g.takeoffT = 0; g.t = rt(1.8, 2.5); }
    if (st === 'perch') { g.settleT = 0.65; g.walkOff = 0; g.walkTarget = 0; }
  }

  relocateNearBoat(g, boat, distMin = 95, distMax = 195) {
    const bx = boat.position.x, bz = boat.position.z, fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
    const a = Math.atan2(fz, fx) + rt(-1.35, 1.35), d = rt(distMin, distMax);
    this.release(g); this.setState(g, 'cruise'); g.t = rt(10, 22);
    g.pos.set(bx + Math.cos(a) * d, rt(11, 26), bz + Math.sin(a) * d);
    g.vel.set(fx * Math.max(4, Math.abs(boat.speed)), 0, fz * Math.max(4, Math.abs(boat.speed)));
  }

  manage(boat) {
    const fw = this.fw, bx = boat.position.x, bz = boat.position.z, fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
    for (const g of this.g) {
      if (g.school) {
        const sDist = Math.hypot(g.school.x - bx, g.school.z - bz);
        if (!fw.schools.includes(g.school) || !fw.isShallowFeeding(g.school) || sDist > 360) {
          g.school = null;
          if (g.st === 'circle' || g.st === 'hover' || g.st === 'climb' || g.st === 'dive' || g.st === 'float') this.setState(g, 'cruise');
        }
      }
    }
    for (const g of this.g) {
      if (g.st === 'perch' || g.st === 'land') continue;
      const dB = Math.hypot(g.pos.x - bx, g.pos.z - bz), dotFwd = (g.pos.x - bx) * fx + (g.pos.z - bz) * fz;
      if (dB > 360 || (dB > 240 && dotFwd < -130 && !g.school && g.st !== 'follow')) this.relocateNearBoat(g, boat, 90, 190);
    }
    let nf = this.g.filter((g) => g.st === 'follow' || g.st === 'perch' || g.st === 'land' || (g.st === 'squabble' && g.ret === 'follow')).length;
    while (nf < 5) {
      const idle = this.g.filter((g) => g.st !== 'follow' && g.st !== 'perch' && g.st !== 'land')
        .sort((a, b) => (a.school ? 1 : 0) - (b.school ? 1 : 0) || a.pos.distanceTo(boat.position) - b.pos.distanceTo(boat.position));
      if (!idle.length) break;
      const g = idle[0]; this.release(g);
      if (Math.hypot(g.pos.x - bx, g.pos.z - bz) > 120) {
        const a = Math.atan2(-fz, -fx) + rt(-0.8, 0.8), d = rt(22, 60);
        g.pos.set(bx + Math.cos(a) * d, rt(6, 13), bz + Math.sin(a) * d);
      }
      this.setState(g, 'follow'); g.t = rt(35, 75); g.off = R() * TAU; nf++;
    }
    const feedingSchools = fw.schools
      .filter((s) => fw.isShallowFeeding(s) && Math.hypot(s.x - bx, s.z - bz) <= 340)
      .sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz))
      .slice(0, 4);

    for (const s of feedingSchools) {
      const want = Math.min(6, 2 + Math.ceil(s.act * 4)), flock = this.g.filter((g) => g.school === s);
      if (flock.length > 2 && R() < 0.03) {
        const lv = flock[(R() * flock.length) | 0];
        if (lv.st === 'circle') { lv.school = null; this.setState(lv, 'cruise'); lv.t = rt(10, 22); }
      }
      for (let k = flock.length; k < want; k++) {
        if (this.g.filter((g) => g.school).length >= this.NG - 4) break;
        const c = this.g.filter((g) => !g.school && (g.st === 'cruise' || g.st === 'soar' || g.st === 'investigate'))
          .sort((a, b) => Math.hypot(a.pos.x - s.x, a.pos.z - s.z) - Math.hypot(b.pos.x - s.x, b.pos.z - s.z))[0];
        if (!c) break;
        this.release(c); c.school = s; this.setState(c, 'circle');
        c.alt = 7.5 + k * 3.2 + rt(-1.0, 1.5); c.orbitR = s.rad * 0.75 + 4.5 + k * 2.1 + rt(-1.2, 1.8);
        c.dir = (k % 2 === 0 ? 1 : -1) * (R() < 0.8 ? 1 : -1);
        if (Math.hypot(c.pos.x - s.x, c.pos.z - s.z) > 180) {
          const ang = R() * TAU;
          c.pos.set(s.x + Math.cos(ang) * rt(55, 95), rt(12, 22), s.z + Math.sin(ang) * rt(55, 95));
        }
      }
      if ((s.top ?? s.d) < 3.6) {
        for (const g of this.g) {
          if (g.school === s && g.st === 'circle' && g.pos.y < 24 && R() < 0.36 * s.act) {
            this.setState(g, 'dive'); g.snatch = R() < 0.42;
            g.target.set(s.x + rt(-1, 1) * s.rad * 0.65, 0, s.z + rt(-1, 1) * s.rad * 0.65);
            if (this.onCry && R() < 0.45) this.onCry(Math.hypot(g.pos.x - bx, g.pos.z - bz));
            break;
          }
        }
      }
      if ((s.top ?? s.d) < 3.2 && s.act > 0.65) {
        for (const g of this.g) {
          if (g.school === s && g.st === 'circle' && R() < 0.10) { this.setState(g, 'hover'); g.t = rt(2.2, 4.8); break; }
        }
      }
    }
    const spd = Math.abs(boat.speed), perchedCount = this.g.filter((g) => g.st === 'perch' || g.st === 'land').length;
    if (spd < 2.2 && perchedCount < 3) {
      for (const g of this.g) {
        if (g.st === 'follow' && (perchedCount === 0 || R() < 0.25)) {
          const free = this.slotUse.findIndex((u) => !u);
          if (free >= 0) { this.slotUse[free] = g; g.slot = free; this.setState(g, 'land'); break; }
        }
      }
    }
    const fl = this.g.filter((g) => g.st === 'follow' || g.st === 'investigate');
    if (fl.length > 1 && R() < 0.22) {
      const a = fl[(R() * fl.length) | 0], b = fl[(R() * fl.length) | 0];
      if (a !== b && a.pos.distanceTo(b.pos) < 13) {
        a.ret = a.st; b.ret = b.st;
        this.setState(a, 'squabble'); a.other = b; a.t = 3.5; a.chaser = true;
        this.setState(b, 'squabble'); b.other = a; b.t = 3.5; b.chaser = false;
        if (this.onCry && R() < 0.5) this.onCry(Math.hypot(a.pos.x - bx, a.pos.z - bz));
      }
    }
    for (const g of this.g) {
      if (g.st === 'perch') {
        if (g.preenT <= 0 && g.walkT > 1.5 && R() < 0.16) g.preenT = rt(2.4, 4.8);
        if (g.ruffleT <= 0 && R() < 0.14) g.ruffleT = rt(0.9, 1.6);
      }
    }
  }

  update(dt, boat) {
    this.t += dt; this.mt -= dt; if (this.mt <= 0) { this.mt = 0.45; this.manage(boat); }
    const bx = boat.position.x, bz = boat.position.z, fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
    const rx = Math.cos(boat.heading), rz = -Math.sin(boat.heading), bs = Math.abs(boat.speed), bvx = fx * boat.speed, bvz = fz * boat.speed;
    this.thermals.forEach((th, i) => {
      const ang = Math.atan2(fz, fx) + Math.sin(this.t * 0.02 + i * 2.1) * 1.15 + (i - 1) * 0.75, dist = 70 + i * 34;
      th.x = bx + Math.cos(ang) * dist; th.z = bz + Math.sin(ang) * dist;
    });
    const wavesY = this.S.S.y, camPos = this.S.camera.position;

    for (const g of this.g) {
      const p = g.pos, v = g.vel, des = new THREE.Vector3();
      let acc = 7.5, spd = 8.5, mode = 'glide', alt = g.alt;
      g.t -= dt;
      if (g.carry > 0) g.carry = Math.max(0, g.carry - dt);
      if (g.prey) g.prey.visible = g.carry > 0;
      const orbit = (cx, cz, r, a, sp) => {
        const dx = (p.x - cx) * g.orbitEcc, dz = (p.z - cz) / g.orbitEcc, d = Math.hypot(dx, dz) + 0.01;
        const tx = (-dz / d) * g.dir, tz = (dx / d) * g.dir, rad = clamp((r - d) * 0.65, -sp * 0.85, sp * 0.85);
        des.set(tx * sp + (dx / d) * rad, (a - p.y) * 0.6, tz * sp + (dz / d) * rad);
      };

      switch (g.st) {
        case 'cruise': {
          const th = this.thermals[g.i % 3], d = Math.hypot(p.x - th.x, p.z - th.z);
          if (d < 36 && p.y < 46 && bs < 5) { g.st = 'soar'; g.t = rt(12, 24); break; }
          const tx = th.x - p.x, tz = th.z - p.z, tl = Math.hypot(tx, tz) + 1;
          spd = 7.5 + (d > 90 ? Math.min(8, (d - 90) * 0.06) + bs * 0.85 : bs * 0.45);
          des.set((tx / tl) * spd + bvx * 0.35, (alt - p.y) * 0.35 + Math.sin(this.t * 0.35 + g.off) * 0.5, (tz / tl) * spd + bvz * 0.35);
          mode = p.y < 10 || d > 115 || Math.sin(this.t * 0.85 + g.off) > 0.25 ? 'flap' : 'glide';
          g.freq = g.baseFreq; g.amp = 0.54;
          if (g.t < 0) { g.t = rt(10, 20); g.off = R() * TAU; }
          break;
        }
        case 'soar': {
          const th = this.thermals[g.i % 3], d = Math.hypot(p.x - th.x, p.z - th.z);
          if (d > 85) { g.st = 'cruise'; g.t = rt(8, 16); break; }
          orbit(th.x, th.z, 16, p.y + 1.2, 7.2 + bs * 0.4);
          des.x += bvx * 0.5; des.z += bvz * 0.5; des.y = p.y < 48 ? 0.9 : -0.3; mode = 'soar';
          if (g.t < 0 || p.y > 50) { g.st = 'cruise'; g.t = rt(10, 20); }
          break;
        }
        case 'circle': {
          const s = g.school; if (!s) { g.st = 'cruise'; break; }
          const ds = Math.hypot(p.x - s.x, p.z - s.z), sp = ds > g.orbitR + 24 ? 11.2 : 7.4 + (g.i % 3) * 0.45;
          const targetAlt = g.alt + Math.sin(this.t * 0.55 + g.off) * 1.4;
          orbit(s.x, s.z, g.orbitR, targetAlt, sp);
          for (const o of this.g) {
            if (o !== g && o.school === s) {
              const ox = p.x - o.pos.x, oy = p.y - o.pos.y, oz = p.z - o.pos.z, od = Math.hypot(ox, oy, oz);
              if (od < 4.2 && od > 0.05) {
                const push = ((4.2 - od) / 4.2) * 3.5;
                des.x += (ox / od) * push; des.y += (oy / od) * push * 0.6; des.z += (oz / od) * push;
              }
            }
          }
          mode = Math.abs(p.y - targetAlt) > 2.6 || ds > g.orbitR + 18 || Math.sin(this.t * 0.9 + g.off * 1.7) > 0.35 ? 'flap' : 'soar';
          g.freq = g.baseFreq * 1.06; g.amp = 0.52;
          break;
        }
        case 'hover': {
          const s = g.school; if (!s) { g.st = 'cruise'; break; }
          des.set((s.x - p.x) * 0.7 - v.x * 0.5, (4.8 - p.y) * 1.25, (s.z - p.z) * 0.7 - v.z * 0.5);
          mode = 'hover'; spd = 3.4; acc = 9.5;
          if (g.t < 0) {
            if (R() < 0.55) { this.setState(g, 'dive'); g.snatch = true; g.target.set(s.x + rt(-1, 1) * s.rad * 0.5, 0, s.z + rt(-1, 1) * s.rad * 0.5); }
            else g.st = 'circle';
          }
          break;
        }
        case 'dive': {
          g.diveT += dt;
          const tx = g.target.x - p.x, tz = g.target.z - p.z, ty = wavesY + 0.05 - p.y, tl = Math.hypot(tx, tz, ty) + 0.01;
          spd = g.snatch ? Math.min(12.5, 6.5 + g.diveT * 7) : Math.min(17.5, 7.5 + g.diveT * 12);
          des.set((tx / tl) * spd, (ty / tl) * spd, (tz / tl) * spd); acc = 22;
          mode = g.snatch ? (p.y < wavesY + 2.2 ? 'hover' : 'glide') : (g.diveT > 0.35 ? 'dive' : 'flap');
          g.freq = g.baseFreq * 1.45;
          if (p.y < wavesY + 0.22 || g.diveT > 5.0) {
            if (this.S.splash) { this.S.splash(p.x, p.z, g.snatch ? 0.11 : 0.18); this.S.splash(p.x + 0.35, p.z - 0.2, 0.08); }
            g.carry = R() < 0.68 ? rt(4.0, 7.5) : 0;
            if (R() < 0.42) { this.setState(g, 'float'); g.t = rt(3.2, 6.5); v.multiplyScalar(0.15); }
            else { this.setState(g, 'climb'); g.t = 2.6; v.y = 4.2; v.multiplyScalar(0.55); }
          }
          break;
        }
        case 'float': {
          const s = g.school;
          p.y = wavesY + 0.06 + Math.sin(this.t * 2.4 + g.off) * 0.06;
          v.set(s ? (s.x - p.x) * 0.12 : 0, 0, s ? (s.z - p.z) * 0.12 : 0);
          p.x += v.x * dt; p.z += v.z * dt; mode = 'float';
          if (g.t < 0 || Math.hypot(p.x - bx, p.z - bz) < 9.5) { this.setState(g, 'takeoff'); g.ang = g.yaw; }
          this.place(g, dt, mode, v, camPos);
          continue;
        }
        case 'climb': {
          const s = g.school;
          des.set(v.x * 1.1, 5.8, v.z * 1.1);
          if (des.length() < 6) des.set(Math.cos(g.ang) * 6, 5.8, Math.sin(g.ang) * 6);
          spd = 7.8; mode = 'flap'; g.freq = g.baseFreq * 1.4; g.amp = 0.82; acc = 9.5;
          if (g.t < 0 || p.y > 9.5) g.st = s ? 'circle' : 'cruise';
          break;
        }
        case 'follow': {
          const sideSign = g.i % 2 === 0 ? 1 : -1;
          const sd = sideSign * (4.5 + (g.i % 3) * 2.4) + Math.sin(g.off + this.t * 0.35) * 2.2;
          const back = -1.5 + (g.i % 4) * 3.8 + Math.cos(g.off + this.t * 0.28) * 2.0;
          const tx = bx - fx * back + rx * sd, tz = bz - fz * back + rz * sd;
          const ex = tx - p.x, ez = tz - p.z, el = Math.hypot(ex, ez) + 0.01;
          const maxFollowSpd = Math.max(12, bs * 1.35 + 5), vs = Math.min(bs + el * 0.65, maxFollowSpd);
          const targetY = wavesY + 3.4 + (g.i % 3) * 1.1 + Math.sin(this.t * 0.65 + g.off) * 0.75;
          des.set(fx * bs * (boat.speed > 0 ? 1 : 0) + (ex / el) * Math.min(vs, el * 0.9 + 1.8), (targetY - p.y) * 0.95, fz * bs * (boat.speed > 0 ? 1 : 0) + (ez / el) * Math.min(vs, el * 0.9 + 1.8));
          spd = maxFollowSpd; acc = 14;
          mode = el > 7.5 || p.y < wavesY + 2.4 || Math.sin(this.t * 1.1 + g.off) > 0.2 ? 'flap' : 'glide';
          g.freq = g.baseFreq * 1.05; g.amp = 0.56;
          if (g.t < 0) {
            if (this.g.filter((x) => x.st === 'follow').length <= 3) g.t = rt(30, 65);
            else { g.st = 'cruise'; g.t = rt(8, 16); }
          }
          break;
        }
        case 'investigate': {
          orbit(g.target.x, g.target.z, 6, g.target.y, 6.5);
          mode = 'flap'; g.freq = g.baseFreq * 1.15; g.amp = 0.62;
          if (g.t < 0) { g.st = 'follow'; g.t = rt(25, 55); }
          break;
        }
        case 'scatter': {
          const tx = g.target.x - p.x, tz = g.target.z - p.z, tl = Math.hypot(tx, tz) + 0.1;
          des.set((tx / tl) * 11, 6 - p.y * 0.1 + 3, (tz / tl) * 11);
          spd = 11; acc = 14; mode = 'flap'; g.freq = g.baseFreq * 1.55; g.amp = 0.88;
          if (g.t < 0) { g.st = 'cruise'; g.t = 6; }
          break;
        }
        case 'squabble': {
          const o = g.other; if (!o || g.t < 0) { g.st = g.ret || 'cruise'; g.t = 10; break; }
          const dx = o.pos.x - p.x, dz = o.pos.z - p.z, dy = o.pos.y - p.y, dl = Math.hypot(dx, dy, dz) + 0.01, s2 = g.chaser ? 9 : -7;
          des.set((dx / dl) * s2 + Math.sin(this.t * 6 + g.i) * 4, (dy / dl) * s2 * 0.6 + 1, (dz / dl) * s2 + Math.cos(this.t * 5 + g.i) * 4);
          spd = 10; acc = 18; mode = 'flap'; g.freq = g.baseFreq * 1.65; g.amp = 0.92;
          break;
        }
        case 'land': {
          const sl = this.slots[g.slot]; if (!sl) { g.st = 'cruise'; break; }
          const w = this.slotWorldPos(g.slot, 0, 0.04);
          const dx = w.x - p.x, dy = w.y - p.y, dz = w.z - p.z, dl = Math.hypot(dx, dy, dz) + 0.01, sp = clamp(dl * 0.95, 1.1, 7.8);
          des.set((dx / dl) * sp + fx * boat.speed * 0.6, (dy / dl) * sp * (dl > 2.8 ? 0.55 : 1) + (dl > 2.8 ? (w.y + 1.6 - p.y) * 0.35 : 0), (dz / dl) * sp + fz * boat.speed * 0.6);
          acc = 12; spd = 8.5; mode = dl < 3.6 ? 'land' : 'glide'; g.freq = g.baseFreq * 1.35; g.amp = 0.68;
          if (dl < 0.32) { this.setState(g, 'perch'); g.t = rt(24, 65); v.set(0, 0, 0); }
          break;
        }
        case 'perch': {
          const sl = this.slots[g.slot]; if (!sl) { g.st = 'cruise'; break; }
          g.walkT -= dt;
          if (sl.railWalk && g.preenT <= 0 && g.walkT <= 0) { g.walkTarget = clamp(g.walkOff + rt(-0.26, 0.26), -0.32, 0.32); g.walkT = rt(5.5, 13.0); }
          const walkDiff = g.walkTarget - g.walkOff, isWalking = Math.abs(walkDiff) > 0.015;
          if (isWalking) { g.walkOff += Math.sign(walkDiff) * Math.min(Math.abs(walkDiff), dt * 0.22); g.walkPhase += dt * 11.5; }
          if (g.settleT > 0) g.settleT = Math.max(0, g.settleT - dt);
          const settleY = g.settleT > 0 ? Math.sin(g.settleT * Math.PI * 3) * 0.018 * g.settleT : 0;
          p.copy(this.slotWorldPos(g.slot, g.walkOff, settleY)); v.set(0, 0, 0);
          mode = g.settleT > 0.25 ? 'settle' : isWalking ? 'walk' : 'fold';
          const targetPerchYaw = boat.heading + (sl.railYaw || 0) + (g.i % 2 === 0 ? 0.12 : -0.12);
          g.yaw += (((targetPerchYaw - g.yaw + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 4.5); g.bank = 0;
          if (g.t < 0 || Math.abs(boat.speed) > 3.6) { this.release(g); this.setState(g, 'takeoff'); g.ang = g.yaw + rt(-0.4, 0.4); }
          this.place(g, dt, mode, v, camPos);
          continue;
        }
        case 'takeoff': {
          g.takeoffT += dt;
          if (g.takeoffT < 0.20) { mode = 'crouch'; v.set(0, 0, 0); this.place(g, dt, mode, v, camPos); continue; }
          if (g.takeoffT - dt < 0.20) v.set(Math.sin(g.yaw) * 2.6 + fx * 1.5, 3.2, Math.cos(g.yaw) * 2.6 + fz * 1.5);
          des.set(fx * 3.5 + Math.sin(g.ang) * 4.2, 4.8, fz * 3.5 + Math.cos(g.ang) * 4.2);
          spd = 8.2; acc = 12; mode = 'takeoff'; g.freq = g.baseFreq * 1.55; g.amp = 0.88;
          if (g.t < 0) { g.st = 'follow'; g.t = rt(18, 42); }
          break;
        }
      }

      const dv = des.sub(v), dl2 = dv.length();
      if (dl2 > acc * dt) dv.multiplyScalar((acc * dt) / dl2);
      v.add(dv);
      const sm = v.length(); if (sm > spd * 1.3) v.multiplyScalar((spd * 1.3) / sm);
      if (g.st !== 'dive' && g.st !== 'float' && p.y + v.y * dt < wavesY + 1.5 && g.st !== 'land' && g.st !== 'climb') v.y = Math.max(v.y, 1.3);
      p.addScaledVector(v, dt);
      this.place(g, dt, mode, v, camPos);
    }
  }

  place(g, dt, mode, v, camPos) {
    const hs = Math.hypot(v.x, v.z), targetYaw = hs > 0.35 ? Math.atan2(v.x, v.z) : g.yaw;
    let dy = ((targetYaw - g.yaw + Math.PI * 3) % TAU) - Math.PI;
    const yr = dy / Math.max(dt, 1e-3);
    if (g.st !== 'perch' && mode !== 'crouch') g.yaw += dy * Math.min(1, dt * 5.2);

    if ((mode === 'glide' || mode === 'soar') && g.wingDipT <= 0 && R() < dt * 0.28) { g.wingDipT = rt(0.35, 0.65); g.wingDipSide = R() < 0.5 ? 1 : -1; }
    if (g.wingDipT > 0) g.wingDipT = Math.max(0, g.wingDipT - dt);
    const dipRoll = g.wingDipT > 0 ? Math.sin(g.wingDipT * Math.PI * 2.5) * 0.22 * g.wingDipSide : 0;

    const targetBank = (g.st === 'perch' || mode === 'float' || mode === 'crouch') ? 0 : clamp(-yr * 0.42 + dipRoll, -0.78, 0.78);
    g.bank += (targetBank - g.bank) * Math.min(1, dt * 4.5);

    const pitch = mode === 'dive' ? 0.92 : mode === 'hover' ? -0.52 : mode === 'land' ? -0.38 : mode === 'crouch' ? 0.22 : (g.st === 'perch' || mode === 'float') ? -0.06 : clamp(-Math.atan2(v.y, hs + 0.5) * 0.75, -0.55, 0.55);
    const r = g.root; r.position.copy(g.pos); r.rotation.set(0, 0, 0); r.rotation.order = 'YXZ'; r.rotation.y = g.yaw; r.rotation.x = pitch; r.rotation.z = g.bank;

    const distCam = camPos ? Math.hypot(g.pos.x - camPos.x, g.pos.y - camPos.y, g.pos.z - camPos.z) : 30;
    const useLod = distCam > 62 && g.st !== 'perch';
    if (useLod !== g.lod) {
      g.lod = useLod;
      for (const w of g.wings) { w.wh.visible = !useLod; w.whLod.visible = useLod; }
    }

    const wantUnfold = (mode === 'fold' || mode === 'walk' || mode === 'float') ? 0 : 1;
    g.unfold += (wantUnfold - g.unfold) * Math.min(1, dt * 12);
    const showFolded = g.unfold < 0.35;
    g.foldedWings.visible = showFolded;
    for (const w of g.wings) w.sh.visible = !showFolded;

    let shZ = 0.16, shY = 0.04, elZ = -0.14, elY = 0.04, wrZ = -0.06, wrY = -0.08, wrX = 0;
    let fl = 0, freq = g.freq, amp = g.amp, legMode = 0, tailSpread = 1.0, tailPitch = 0.04;

    switch (mode) {
      case 'glide': shZ = 0.17; shY = 0.05; elZ = -0.16; elY = 0.06; wrZ = -0.08; wrY = -0.12; tailSpread = 0.92; break;
      case 'soar': shZ = 0.22; shY = 0.02; elZ = -0.12; elY = 0.02; wrZ = -0.04; wrY = -0.04; tailSpread = 1.18; break;
      case 'flap': fl = 1; shZ = 0.10; shY = 0.04; elZ = -0.10; elY = 0.04; wrZ = -0.05; wrY = -0.06; tailSpread = 0.96; break;
      case 'takeoff': fl = 1; shZ = 0.20; shY = 0.02; elZ = -0.06; elY = 0.02; wrZ = -0.02; wrY = -0.04; legMode = g.takeoffT < 0.65 ? 0.6 : 0; tailSpread = 1.32; tailPitch = 0.18; break;
      case 'hover': fl = 1; freq = g.baseFreq * 1.85; amp = 0.78; shZ = 0.32; shY = -0.05; elZ = -0.08; wrZ = -0.04; legMode = 0.55; tailSpread = 1.42; tailPitch = 0.28; break;
      case 'dive': shZ = 0.08; shY = 0.68; elZ = -0.22; elY = 0.42; wrZ = -0.18; wrY = -0.85; tailSpread = 0.78; tailPitch = -0.08; break;
      case 'land': fl = 1; freq = g.baseFreq * 1.35; amp = 0.65; shZ = 0.42; shY = -0.12; elZ = -0.12; wrZ = -0.05; wrX = 0.28; legMode = 1.0; tailSpread = 1.48; tailPitch = 0.32; break;
      case 'settle': shZ = 0.25; shY = 0.55; elZ = -0.35; elY = 0.45; wrZ = -0.25; wrY = -0.75; legMode = 1.0; tailSpread = 1.15; break;
      case 'crouch': shZ = 0.28; shY = 0.35; elZ = -0.25; elY = 0.25; wrZ = -0.15; wrY = -0.45; legMode = 1.0; tailSpread = 1.22; break;
      case 'fold': case 'walk': legMode = 1.0; tailSpread = 0.78; tailPitch = -0.05; break;
      case 'float': legMode = 0.35; tailSpread = 0.82; tailPitch = 0.08; break;
    }

    const P = g.pose, k = Math.min(1, dt * (mode === 'dive' ? 14 : 9));
    P.shZ += (shZ - P.shZ) * k; P.shY += (shY - P.shY) * k;
    P.elZ += (elZ - P.elZ) * k; P.elY += (elY - P.elY) * k;
    P.wrZ += (wrZ - P.wrZ) * k; P.wrY += (wrY - P.wrY) * k; P.wrX += (wrX - P.wrX) * k;

    if (fl) g.ph = (g.ph + dt * freq * TAU) % TAU;
    const sSh = fl ? Math.sin(g.ph) : 0, sEl = fl ? Math.sin(g.ph - 0.85) : 0, sWr = fl ? Math.sin(g.ph - 1.55) : 0;
    const upstroke = fl ? Math.max(0, Math.cos(g.ph - 0.35)) : 0;
    const wristTrim = !fl && !showFolded ? Math.sin(this.t * 4.2 + g.off * 2.3) * 0.045 : 0;

    if (!showFolded) {
      for (const w of g.wings) {
        const side = w.s;
        w.sh.rotation.z = (P.shZ + sSh * amp * 0.72) * side;
        w.sh.rotation.y = (-P.shY - upstroke * 0.14) * side;
        w.sh.rotation.x = fl ? Math.cos(g.ph) * 0.08 : 0;
        w.el.rotation.z = (P.elZ + sEl * amp * 0.58 - upstroke * 0.34) * side;
        w.el.rotation.y = (-P.elY + upstroke * 0.26) * side;
        w.wr.rotation.z = (P.wrZ + sWr * amp * 0.52 - upstroke * 0.28 + wristTrim) * side;
        w.wr.rotation.y = (P.wrY - upstroke * 0.38) * side;
        w.wr.rotation.x = P.wrX + (fl ? Math.cos(g.ph - 0.9) * 0.22 : wristTrim * 0.6);
      }
    }

    let bodyY = fl ? -sSh * 0.018 : 0, bodyRoll = 0;
    if (mode === 'crouch') bodyY = -0.028;
    if (mode === 'walk') { bodyY = Math.abs(Math.sin(g.walkPhase)) * 0.008; bodyRoll = Math.sin(g.walkPhase) * 0.045; }
    if (g.ruffleT > 0) {
      g.ruffleT = Math.max(0, g.ruffleT - dt);
      const rf = Math.sin(this.t * 38.0) * 0.06 * Math.min(1, g.ruffleT * 2);
      bodyRoll += rf; g.foldedWings.scale.set(1 + Math.abs(rf) * 1.4, 1 + Math.abs(rf) * 0.8, 1);
    } else g.foldedWings.scale.set(1, 1, 1);
    g.body.position.y = bodyY; g.body.rotation.z = bodyRoll;

    g.tail.scale.x += (tailSpread - g.tail.scale.x) * Math.min(1, dt * 8);
    g.tail.rotation.x += (tailPitch - g.tail.rotation.x) * Math.min(1, dt * 8);
    g.tail.rotation.z = clamp(-yr * 0.12, -0.22, 0.22);

    if (g.st === 'perch' || mode === 'float') {
      if (g.preenT > 0) {
        g.preenT = Math.max(0, g.preenT - dt);
        const side = g.i % 2 === 0 ? 1 : -1, nibble = Math.sin(this.t * 14.0 + g.i) * 0.09;
        g.headYaw += (side * 1.85 - g.headYaw) * Math.min(1, dt * 6);
        g.headPitch += (0.42 + nibble - g.headPitch) * Math.min(1, dt * 8);
        g.headTilt += (side * 0.25 - g.headTilt) * Math.min(1, dt * 6);
      } else {
        g.headTarget.t -= dt;
        if (g.headTarget.t <= 0) { g.headTarget.t = rt(1.4, 3.8); g.headTarget.y = rt(-0.95, 0.95); g.headTarget.p = rt(-0.22, 0.28); g.headTarget.z = R() < 0.45 ? rt(-0.22, 0.22) : 0; }
        g.headYaw += (g.headTarget.y - g.headYaw) * Math.min(1, dt * 5.5);
        g.headPitch += (g.headTarget.p - g.headPitch) * Math.min(1, dt * 5.5);
        g.headTilt += (g.headTarget.z - g.headTilt) * Math.min(1, dt * 5.5);
      }
      const walkBob = mode === 'walk' ? Math.sin(g.walkPhase * 2) * 0.12 : 0;
      g.neck.rotation.set(g.headPitch + walkBob, g.headYaw, g.headTilt, 'YXZ');
    } else {
      const lookIntoTurn = clamp(yr * 0.18, -0.45, 0.45), lookDown = (g.st === 'circle' || g.st === 'hover') ? 0.22 : 0;
      g.headYaw += (lookIntoTurn - g.headYaw) * Math.min(1, dt * 6);
      g.headPitch += (lookDown - g.headPitch) * Math.min(1, dt * 6);
      g.neck.rotation.set(g.headPitch, g.headYaw, -g.bank * 0.35, 'YXZ');
    }

    g.legs.forEach((lg, idx) => {
      const side = idx === 0 ? 1 : -1;
      if (legMode >= 0.9) {
        const stepSwing = mode === 'walk' ? Math.sin(g.walkPhase + (idx === 0 ? 0 : Math.PI)) * 0.32 : 0;
        const stepLift = mode === 'walk' ? Math.max(0, Math.cos(g.walkPhase + (idx === 0 ? 0 : Math.PI))) * 0.012 : 0;
        lg.visible = true; lg.rotation.x = (mode === 'crouch' ? -0.25 : 0.06) + stepSwing; lg.rotation.z = side * 0.03;
        lg.position.set(0.036 * side, -0.042 + stepLift, -0.008);
      } else if (legMode > 0.2) {
        const paddle = mode === 'float' ? Math.sin(this.t * 5.0 + idx * Math.PI) * 0.25 : 0;
        lg.visible = !g.lod; lg.rotation.x = 0.35 + paddle; lg.rotation.z = side * 0.08;
        lg.position.set(0.036 * side, -0.042, -0.012);
      } else {
        lg.visible = !g.lod; lg.rotation.x = 1.48; lg.rotation.z = -side * 0.08;
        lg.position.set(0.026 * side, -0.024, -0.045);
      }
    });
  }
}
