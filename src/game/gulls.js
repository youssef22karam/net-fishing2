// @ts-nocheck
/* Seagulls as GAMEPLAY INFORMATION.
   circling a spot = a school below | diving = shallow & actively feeding (cast-net range) | none != no fish (deep schools have no bird cue)
   Behaviours: flap / glide / soar on thermals / hover / dive / land on the boat rails / take off / squabble / follow the boat for scraps
   Reacts to events: scatter on net throw, swarm a good catch, investigate fish escaping. */
import * as THREE from 'three';
import { clamp, TAU } from './config.js';
import { buildGull, primAngle } from './gullmodel.js';

const R = Math.random, rt = (a, b) => a + (b - a) * R();
const touchDev = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const NG = window.__lite || touchDev ? 12 : 16;      // hard cap on the flock; Low trims it further at runtime (see Gulls.cap)
const STAND = .145, LOD_DIST = 60;
const sstepL = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function buildG() {
  const v = { size: rt(1.08, 1.26), mantle: [rt(.9, 1.1), rt(.92, 1.08), rt(.95, 1.1)] };   // individual size + mantle shade
  const m = buildGull(v); m.prey = new THREE.Mesh(new THREE.ConeGeometry(.014, .12, 5).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfdde8, roughness: .35 })); m.prey.position.set(0, -.02, .26); m.prey.visible = false; m.prey.frustumCulled = false;
  m.full.head.add(m.prey); m.prey.position.set(0, -.012, .1);
  return { ...m, size: v.size };
}

/* pose table (right wing; the left is mirrored by the rig). shz dihedral/flap, shy sweep back, elz/ely elbow, wrz/wry wrist, spr primaries fan, neck/hp neck + head pitch, tailP/tailS, legR/ank/lgx, bp body pitch, by body height, shpx/shpy shoulder position, elpy/wrpy fold layering */
const BASE = { shz: .17, shy: .1, shx: 0, elz: -.04, ely: -.1, wrz: -.2, wry: .26, spr: 1, neck: .3, hp: .22, jaw: 0, tailP: 0, tailS: 1.05, legR: 1.45, ank: -.35, lgx: 0, bp: 0, by: 0, shpx: .07, shpy: .045, elpy: 0, wrpy: 0 };
const POSE = {
  glide: {}, soar: { shz: .24, shy: .06, elz: -.03, ely: -.08, wrz: -.26, wry: .16, spr: 1.25, tailS: 1.4 },
  flap: { shz: .05, shy: .08, elz: -.02, ely: -.06, wrz: -.05, wry: .15, spr: .35 },
  hover: { shz: .35, spr: .9, tailS: 1.6, tailP: .35, legR: .6, ank: -.6, neck: .55, hp: .5, lgx: .1 },
  dive: { shz: .05, shy: .75, elz: 0, ely: -.9, wrz: -.1, wry: .9, spr: .1, neck: .12, hp: .3, tailS: .7 },
  snatch: { shz: .45, shy: .15, wrz: -.1, wry: .1, spr: 1, legR: .35, ank: -.35, lgx: .12, neck: .5, hp: .62, tailS: 1.3, tailP: .2, jaw: .15 },
  land: { shz: .3, shy: .1, spr: 1.1, tailP: .5, tailS: 1.8, legR: .35, ank: -.2, neck: .75, hp: .62, lgx: .15 },
  fold: { shz: .06, shy: 1.63, elz: .0, ely: -3.25, wrz: -.08, wry: 3.22, spr: 0, neck: .95, hp: .86, tailS: .86, legR: .12, ank: -.12, bp: -.38, by: STAND, shpx: .078, shpy: .058, elpy: .012, wrpy: .024 },
  flare: { shz: .5, shy: .2, spr: .9, neck: .9, hp: .8, tailS: 1.4, legR: .15, ank: -.15, bp: -.38, by: STAND },
  crouch: { shz: .38, shy: .9, ely: -1.9, wry: 1.9, spr: .5, neck: .5, hp: .45, tailS: 1, legR: .8, ank: -.8, bp: -.3, by: STAND - .05, shpx: .075, shpy: .05 },
  float: { shz: .06, shy: 1.63, ely: -3.25, wry: 3.22, spr: 0, neck: .78, hp: .68, tailS: .9, legR: .4, ank: -.3, bp: -.18, by: .05, shpx: .078, shpy: .058, elpy: .012, wrpy: .024 },
};
const KEYS = Object.keys(BASE);

export class Gulls {
  constructor(S, fishWorld, onCry = null) {
    this.S = S; this.fw = fishWorld; this.onCry = onCry; this.g = []; this.t = 0; this.mt = 0; this.thermals = [];
    this.slots = [[1.28, 1.2, -2.9], [-1.28, 1.2, -2.9], [1.25, 1.2, -1.7], [-1.25, 1.2, -1.7], [0, 1.1, -3.85], [.45, 2.45, .15], [-.45, 2.45, -.4], [.45, 1.55, 3.3], [-.45, 1.55, 3.3]];
    this.slotUse = this.slots.map(() => null);
    for (let i = 0; i < NG; i++) this.add(i);
    this.all = this.g.slice(); this.cap = NG; this.vt = rt(18, 35);
    for (let i = 0; i < 3; i++) this.thermals.push({ x: 0, z: 0, ph: R() * 9 });
  }
  add(i) {
    const m = buildG(); this.S.scene.add(m.root);
    const b = this.S.boat.position, a = R() * TAU, d = rt(45, 150);
    const g = { ...m, i, pos: new THREE.Vector3(b.x + Math.cos(a) * d, rt(12, 26), b.z + Math.sin(a) * d), vel: new THREE.Vector3(rt(-4, 4), 0, rt(-4, 4)), st: i < 3 ? 'follow' : 'cruise', t: rt(8, 25), school: null, orbitR: rt(9, 15), dir: R() < .5 ? 1 : -1, alt: rt(10, 20), ang: R() * TAU,
      pose: { ...BASE }, mode: 'glide', ph: R() * TAU, freq: 3, amp: .6, yaw: 0, bank: 0, slot: -1, target: new THREE.Vector3(), flap: 0, carry: 0, ret: 'cruise', off: R() * TAU, diveT: 0, fq: rt(.88, 1.12), pl: { m: 'look', t: rt(.5, 3), dir: 1, side: 1, sh: 0 }, hy: 0, hr: 0, hpa: 0, nka: 0, rs: 0, dip: null, dipT: rt(8, 30), bf: 0, bfT: rt(1, 5), cryT: 0, wx: 0, wz: 0, settle: 0, dtype: 'plunge' };
    g.yaw = Math.atan2(g.vel.x, g.vel.z); this.g.push(g);
  }
  /* ---- events from the game ---- */
  event(type, x, z) {
    for (const g of this.g) {
      const d = Math.hypot(g.pos.x - x, g.pos.z - z);
      if (type === 'throw' && d < 36) { this.release(g); this.setState(g, 'scatter'); g.target.set(g.pos.x - (x - g.pos.x), 0, g.pos.z - (z - g.pos.z)); }
      else if (type === 'catch' && d < 420) { if (g.st !== 'perch' || R() < .6) { this.release(g); this.setState(g, 'investigate'); g.target.set(x + rt(-3, 3), 3.5, z + rt(-3, 3)); g.t = rt(14, 22); } }
      else if (type === 'escape' && d < 200 && g.st !== 'dive' && R() < .7) { this.release(g); this.setState(g, 'investigate'); g.target.set(x + rt(-4, 4), 4.5, z + rt(-4, 4)); g.t = rt(6, 10); }
    }
  }
  release(g) { if (g.slot >= 0) { this.slotUse[g.slot] = null; g.slot = -1; } g.school = null; }
  setState(g, st) { g.st = st; g.diveT = 0; if (st === 'scatter') g.t = rt(4, 6); }

  /* relocate a gull that drifted far behind the boat so the sky around the player never empties */
  relocateNearBoat(g, boat, distMin = 110, distMax = 210) {
    const bx = boat.position.x, bz = boat.position.z, fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
    const baseA = Math.atan2(fz, fx), a = baseA + rt(-1.35, 1.35), d = rt(distMin, distMax);
    this.release(g);
    this.setState(g, 'cruise');
    g.t = rt(10, 22);
    g.pos.set(bx + Math.cos(a) * d, rt(13, 27), bz + Math.sin(a) * d);
    g.vel.set(fx * Math.max(4, Math.abs(boat.speed)), 0, fz * Math.max(4, Math.abs(boat.speed)));
  }

  /* ---- manager: who watches which school, who dives, who follows ---- */
  manage(boat) {
    const fw = this.fw, bx = boat.position.x, bz = boat.position.z, fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
    this.vt -= .45; if (this.vt < 0) { this.vt = rt(18, 40); const cr = this.g.filter((x) => x.st === 'cruise' && !x.school); if (cr.length) this.relocateNearBoat(cr[(R() * cr.length) | 0], boat, 170, 240); }   // birds arrive over time
    // 1. Release gulls from schools that despawned, stopped feeding, or are now far behind the boat (> 360 m)
    for (const g of this.g) {
      if (g.school) {
        const sDist = Math.hypot(g.school.x - bx, g.school.z - bz);
        if (!fw.schools.includes(g.school) || !fw.isShallowFeeding(g.school) || sDist > 360) {
          g.school = null;
          if (g.st === 'circle' || g.st === 'hover' || g.st === 'climb' || g.st === 'dive' || g.st === 'float') this.setState(g, 'cruise');
        }
      }
    }
    // 2. Relocate ANY non-perched gull that has fallen > 370 m from the boat (regardless of state!)
    for (const g of this.g) {
      if (g.st === 'perch' || g.st === 'land') continue;
      const dB = Math.hypot(g.pos.x - bx, g.pos.z - bz);
      const dotFwd = (g.pos.x - bx) * fx + (g.pos.z - bz) * fz;
      if (dB > 370 || (dB > 250 && dotFwd < -140 && !g.school && g.st !== 'follow')) {
        this.relocateNearBoat(g, boat, 100, 210);
      }
    }
    // 3. Followers & perchers FIRST: always keep 4 gulls accompanying the boat regardless of how far we sailed
    let nf = this.g.filter((g) => g.st === 'follow' || g.st === 'perch' || g.st === 'land' || (g.st === 'squabble' && g.ret === 'follow')).length;
    while (nf < 4) {
      const idle = this.g
        .filter((g) => g.st !== 'follow' && g.st !== 'perch' && g.st !== 'land')
        .sort((a, b) => (a.school ? 1 : 0) - (b.school ? 1 : 0) || a.pos.distanceTo(boat.position) - b.pos.distanceTo(boat.position));
      if (!idle.length) break;
      const g = idle[0];
      this.release(g);
      const dBoat = Math.hypot(g.pos.x - bx, g.pos.z - bz);
      if (dBoat > 140) {
        const a = Math.atan2(-fz, -fx) + rt(-.8, .8), d = rt(40, 80);
        g.pos.set(bx + Math.cos(a) * d, rt(8, 15), bz + Math.sin(a) * d);
      }
      this.setState(g, 'follow');
      g.t = rt(35, 75);
      g.off = R() * TAU;
      nf++;
    }
    // 4. Assign gulls to the nearest shallow feeding schools (within 340 m), keeping 4 gulls free for boat follow & thermals
    const feedingSchools = fw.schools
      .filter((s) => fw.isShallowFeeding(s) && Math.hypot(s.x - bx, s.z - bz) <= 340)
      .sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz))
      .slice(0, 4);

    for (const s of feedingSchools) {
      const want = Math.min(5, 2 + Math.ceil(s.act * 3)), have = this.g.filter((g) => g.school === s).length;
      for (let k = have; k < want; k++) {
        if (this.g.filter((g) => g.school).length >= this.cap - 4) break;
        const c = this.g
          .filter((g) => !g.school && (g.st === 'cruise' || g.st === 'soar' || g.st === 'investigate'))
          .sort((a, b) => Math.hypot(a.pos.x - s.x, a.pos.z - s.z) - Math.hypot(b.pos.x - s.x, b.pos.z - s.z))[0];
        if (!c) break;
        this.release(c);
        c.school = s;
        this.setState(c, 'circle');
        c.alt = 9 + ((have + k) % 5) * 2.5 + rt(-.8, .8); c.dir = Math.floor(s.seed) % 2 ? 1 : -1; c.fq = rt(.88, 1.12);
        c.orbitR = s.rad * .7 + rt(6, 11);
        const ds = Math.hypot(c.pos.x - s.x, c.pos.z - s.z);
        if (ds > 190) {
          const ang = R() * TAU;
          c.pos.set(s.x + Math.cos(ang) * rt(65, 110), rt(14, 22), s.z + Math.sin(ang) * rt(65, 110));
        }
      }
      // divers: on shallow, actively feeding schools
      if (s.d < 3.6) {
        for (const g of this.g) {
          if (g.school === s && g.st === 'circle' && g.pos.y < 24 && R() < .34 * s.act) {
            this.setState(g, 'dive'); g.dtype = R() < .45 ? 'snatch' : 'plunge';
            g.target.set(s.x + rt(-1, 1) * s.rad * .6, 0, s.z + rt(-1, 1) * s.rad * .6);
            if (R() < .45) { g.cryT = rt(.5, .9); if (this.onCry) this.onCry(Math.hypot(g.pos.x - bx, g.pos.z - bz)); }
            break;
          }
        }
      }
      if (s.d < 3.2 && s.act > .7) {
        for (const g of this.g) {
          if (g.school === s && g.st === 'circle' && R() < .08) {
            this.setState(g, 'hover');
            g.t = rt(2.5, 5);
            break;
          }
        }
      }
    }
    const spd = Math.abs(boat.speed);
    for (const g of this.g) if (g.st === 'follow' && spd < 2 && g.t < 24 && R() < .15) { const free = this.slotUse.findIndex((u) => !u); if (free >= 0) { this.slotUse[free] = g; g.slot = free; this.setState(g, 'land'); } }
    // squabbles: two nearby followers fight over scraps
    const fl = this.g.filter((g) => g.st === 'follow' || g.st === 'investigate');
    if (fl.length > 1 && R() < .22) {
      const a = fl[(R() * fl.length) | 0], b = fl[(R() * fl.length) | 0];
      if (a !== b && a.pos.distanceTo(b.pos) < 12) {
        a.ret = a.st; b.ret = b.st;
        this.setState(a, 'squabble'); a.other = b; a.t = 3.5;
        this.setState(b, 'squabble'); b.other = a; b.t = 3.5;
        b.chaser = false; a.chaser = true;
        a.cryT = rt(.6, 1.2); b.cryT = rt(.4, 1); if (this.onCry && R() < .5) this.onCry(Math.hypot(a.pos.x - bx, a.pos.z - bz));
      }
    }
    const pg = this.g.filter((g) => g.st === 'perch'); if (pg.length > 1 && R() < .15) { const a = pg[(R() * pg.length) | 0]; if (!a.flare) a.flare = 1.6; }
  }

  /* ---- per-frame ---- */
  update(dt, boat) {
    const q = this.S.P.quality, low = !!window.__lite || q === 'Low' || (q === 'Auto' && touchDev), cap = low ? Math.min(NG, 10) : NG;
    if (cap !== this.cap) { this.cap = cap; for (const g of this.all) { const on = g.i < cap; g.root.visible = on; if (!on) { this.release(g); if (g.st === 'perch' || g.st === 'land' || g.st === 'crouch') g.st = 'cruise'; } } this.g = this.all.slice(0, cap); }
    this.t += dt; this.mt -= dt; if (this.mt <= 0) { this.mt = .45; this.manage(boat); }
    this.boatSpd = boat.speed;
    const bx = boat.position.x, bz = boat.position.z, fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
    const bs = Math.abs(boat.speed), bvx = fx * boat.speed, bvz = fz * boat.speed;
    // Thermals orbit gently ahead and abeam of the boat so cruising/soaring gulls stay in view as you travel
    this.thermals.forEach((th, i) => {
      const ang = Math.atan2(fz, fx) + Math.sin(this.t * .02 + i * 2.1) * 1.15 + (i - 1) * .75;
      const dist = 75 + i * 35;
      th.x = bx + Math.cos(ang) * dist;
      th.z = bz + Math.sin(ang) * dist;
    });
    const wavesY = this.S.S.y;
    for (const g of this.g) {
      const p = g.pos, v = g.vel, des = new THREE.Vector3(); let acc = 7, spd = 8.5, mode = 'glide', alt = 18, hoverFlap = 0;
      g.t -= dt;
      if (g.carry > 0) g.carry = Math.max(0, g.carry - dt);
      if (g.prey) g.prey.visible = g.carry > 0;
      const orbit = (cx, cz, r, a, sp) => { // circle around centre: tangent + radial correction
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz) + .01, tx = -dz / d * g.dir, tz = dx / d * g.dir, rad = clamp((r - d) * .65, -sp * .9, sp * .9);
        des.set(tx * sp + dx / d * rad, (a - p.y) * .55, tz * sp + dz / d * rad);
      };
      switch (g.st) {
        case 'cruise': {
          const th = this.thermals[g.i % 3], d = Math.hypot(p.x - th.x, p.z - th.z);
          if (d < 36 && p.y < 46 && bs < 5) { g.st = 'soar'; g.t = rt(12, 24); break; }
          const tx = th.x - p.x, tz = th.z - p.z, tl = Math.hypot(tx, tz) + 1;
          const catchup = d > 90 ? Math.min(8, (d - 90) * .06) + bs * .85 : bs * .45;
          spd = 7.5 + catchup;
          des.set(tx / tl * spd + bvx * .35, (alt - p.y) * .35 + Math.sin(this.t * .3 + g.off) * .5, tz / tl * spd + bvz * .35);
          mode = p.y < 11 || d > 120 ? 'flap' : 'glide'; g.freq = 3.2; g.amp = .55;
          if (g.t < 0) { g.t = rt(10, 20); g.off = R() * TAU; }
          break;
        }
        case 'soar': {
          const th = this.thermals[g.i % 3], d = Math.hypot(p.x - th.x, p.z - th.z);
          if (d > 85) { g.st = 'cruise'; g.t = rt(8, 16); break; }
          orbit(th.x, th.z, 16, 0, 7 + bs * .4);
          des.x += bvx * .5; des.z += bvz * .5;
          des.y = p.y < 48 ? .9 : -.3; mode = 'soar';
          if (g.t < 0 || p.y > 50) { g.st = 'cruise'; g.t = rt(10, 20); }
          break;
        }
        case 'circle': {
          const s = g.school; if (!s) { g.st = 'cruise'; break; }
          const ds = Math.hypot(p.x - s.x, p.z - s.z);
          const sp = ds > g.orbitR + 25 ? 11.5 : 7.5;
          orbit(s.x, s.z, g.orbitR, g.alt + Math.sin(this.t * .25 + g.off) * 1.4, sp);
          mode = Math.abs(p.y - g.alt) > 3 || ds > g.orbitR + 20 || R() < .003 ? 'flap' : 'soar';
          g.freq = 3.4; g.amp = .5; if (Math.sin(this.t * .7 + g.i) > .6) mode = 'flap';
          break;
        }
        case 'hover': { const s = g.school; if (!s) { g.st = 'cruise'; break; } des.set((s.x - p.x) * .7 - v.x * .5, (5.5 - p.y) * 1.2, (s.z - p.z) * .7 - v.z * .5); mode = 'hover'; spd = 3.5; acc = 9; if (g.t < 0) { g.st = 'circle'; } break; }
        case 'dive': {
          g.diveT += dt; const snatch = g.dtype === 'snatch', dh = Math.hypot(g.target.x - p.x, g.target.z - p.z);
          const tx = g.target.x - p.x, tz = g.target.z - p.z, ty = (snatch && dh > 7 ? wavesY + 1.3 : wavesY - .1) - p.y, tl = Math.hypot(tx, tz, ty) + .01;
          spd = snatch ? 9.5 : Math.min(18, 7 + g.diveT * 12); des.set(tx / tl * spd, ty / tl * spd, tz / tl * spd); acc = 22;
          mode = snatch ? (dh < 9 ? 'snatch' : 'glide') : (g.diveT > .5 ? 'dive' : 'flap'); g.freq = 5;
          if (p.y < wavesY + .18 || g.diveT > 5.5) { if (this.S.splash) { this.S.splash(p.x, p.z, .16); this.S.splash(p.x + .4, p.z, .08); } g.carry = R() < .65 ? rt(3.5, 6.5) : 0;
            if (!snatch && g.school && R() < .4) { g.st = 'float'; g.t = rt(3, 6); v.set(0, 0, 0); } else { g.st = 'climb'; g.t = 2.6; v.y = 4.2; v.multiplyScalar(.55); } } break; }
        case 'float': { v.multiplyScalar(Math.max(0, 1 - dt * 3)); const s = g.school; if (s) { v.x += (s.vx * .8 - v.x) * Math.min(1, dt); v.z += (s.vz * .8 - v.z) * Math.min(1, dt); } p.y = wavesY + .02 + Math.sin(this.t * 1.7 + g.off) * .05; p.x += v.x * dt; p.z += v.z * dt;
          if (g.t < 0) { g.st = 'climb'; g.t = 2.6; v.y = 4; } this.place(g, dt, 'float', v, 0); continue; }
        case 'climb': { const s = g.school; des.set(v.x * 1.1, 6, v.z * 1.1); if (des.length() < 6) des.set(Math.cos(g.ang) * 6, 6, Math.sin(g.ang) * 6); spd = 7.5; mode = 'flap'; g.freq = 4.6; g.amp = .8; acc = 9; if (g.t < 0 || p.y > 9.5) g.st = s ? 'circle' : 'cruise'; break; }
        case 'follow': {
          const sd = Math.sin(g.off + this.t * .25) * 3.6, back = 8.5 + (g.i % 4) * 2.2, tx = bx - fx * back - fz * sd * -1, tz = bz - fz * back + fx * sd * -1;
          const ex = tx - p.x, ez = tz - p.z, el = Math.hypot(ex, ez) + .01;
          const maxFollowSpd = Math.max(12, bs * 1.35 + 5), vs = Math.min(bs + el * .65, maxFollowSpd);
          des.set(fx * bs * (boat.speed > 0 ? 1 : 0) + ex / el * Math.min(vs, el * .9 + 1.5), (5.2 + Math.sin(this.t * .6 + g.off) * 1.2 - p.y) * .85, fz * bs * (boat.speed > 0 ? 1 : 0) + ez / el * Math.min(vs, el * .9 + 1.5));
          spd = maxFollowSpd; acc = 14; mode = el > 8 || p.y < 3 ? 'flap' : 'glide'; g.freq = 3.4; g.amp = .55; if (g.t < 0) { if (this.g.filter((x) => x.st === 'follow').length <= 4) g.t = rt(30, 65); else { g.st = 'cruise'; g.t = rt(8, 16); } } break; }
        case 'investigate': { orbit(g.target.x, g.target.z, 6, g.target.y, 6.5); mode = 'flap'; g.freq = 3.6; g.amp = .6; if (g.t < 0) { g.st = 'follow'; g.t = rt(25, 55); } break; }
        case 'scatter': { const tx = g.target.x - p.x, tz = g.target.z - p.z, tl = Math.hypot(tx, tz) + .1; des.set(tx / tl * 11, 6 - p.y * .1 + 3, tz / tl * 11); spd = 11; acc = 14; mode = 'flap'; g.freq = 5.2; g.amp = .9; if (g.t < 0) { g.st = 'cruise'; g.t = 6; } break; }
        case 'squabble': { const o = g.other; if (!o || g.t < 0) { g.st = g.ret || 'cruise'; g.t = 10; break; } const dx = o.pos.x - p.x, dz = o.pos.z - p.z, dy = o.pos.y - p.y, dl = Math.hypot(dx, dy, dz) + .01; const s2 = g.chaser ? 9 : -7; des.set(dx / dl * s2 + Math.sin(this.t * 6 + g.i) * 4, dy / dl * s2 * .6 + 1, dz / dl * s2 + Math.cos(this.t * 5 + g.i) * 4); spd = 10; acc = 18; mode = 'flap'; g.freq = 6; g.amp = 1.0; break; }
        case 'land': {
          const sl = this.slots[g.slot]; if (!sl) { g.st = 'cruise'; break; }
          const w = boat.localToWorld(new THREE.Vector3(sl[0], sl[1] + .02, sl[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
          const dx = w.x - p.x, dy = w.y - p.y, dz = w.z - p.z, dl = Math.hypot(dx, dy, dz) + .01, sp = clamp(dl * .9, 1.4, 8);
          des.set(dx / dl * sp + fx * boat.speed * .6, dy / dl * sp * (dl > 3 ? .5 : 1) + (dl > 3 ? (w.y + 2 - p.y) * .3 : 0), dz / dl * sp + fz * boat.speed * .6); acc = 11; spd = 9; mode = dl < 3.2 ? 'land' : 'glide'; g.freq = 4.2; g.amp = .7;
          if (dl < .5) { g.st = 'perch'; g.t = rt(16, 48); g.flare = 0; g.settle = .85; g.wx = g.wz = 0; v.set(0, 0, 0); } break; }
        case 'perch': {
          const sl = this.slots[g.slot]; if (!sl) { g.st = 'cruise'; break; }
          const w = boat.localToWorld(new THREE.Vector3(sl[0], sl[1], sl[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); p.copy(w); v.set(0, 0, 0);
          if (g.settle > 0) { g.settle -= dt; mode = g.settle > .35 ? 'land' : 'flare'; g.freq = 3.4; g.amp = g.settle > .35 ? .5 : .3; } else if (g.flare > 0) { g.flare -= dt; mode = 'flare'; g.freq = 7; g.amp = .5; } else mode = 'fold';
          g.yaw += ((boat.heading + Math.PI + (g.i % 2 ? .3 : -.3)) - g.yaw) * Math.min(1, dt * 3); g.bank = 0;
          if (g.t < 0 || Math.abs(boat.speed) > 3.5) { g.st = 'crouch'; g.t = .38; }
          this.place(g, dt, mode, v, 0); continue; }
        case 'crouch': { v.set(0, 0, 0); p.x += fx * boat.speed * dt; p.z += fz * boat.speed * dt; this.place(g, dt, 'crouch', v, 0);
          if (g.t < 0) { this.release(g); g.st = 'takeoff'; g.t = 2.2; g.wx = g.wz = 0; v.set(fx * 3 + Math.cos(g.ang) * 2, 4.8, fz * 3 + Math.sin(g.ang) * 2); } continue; }
        case 'takeoff': { des.set(fx * 4 + Math.cos(g.ang) * 3, 5, fz * 4 + Math.sin(g.ang) * 3); spd = 8; acc = 11; mode = 'flap'; g.freq = 5; g.amp = .95; if (g.t < 0) { g.st = 'follow'; g.t = rt(15, 35); } break; }
      }
      // organic flocking: individual flap bursts between glides, the odd single wing-dip
      g.bfT -= dt; if (g.bfT < 0) { g.bf = g.bf ? 0 : 1; g.bfT = g.bf ? rt(1.2, 3) : rt(2.5, 7); }
      if (g.bf && (mode === 'glide' || (mode === 'soar' && g.st === 'circle')) && ['cruise', 'follow', 'circle', 'investigate'].includes(g.st)) { mode = 'flap'; g.freq = 3 + g.fq * .4; g.amp = .5; }
      g.dipT -= dt; if (g.dipT < 0) { g.dipT = rt(10, 35); if (mode === 'glide' || mode === 'soar') g.dip = { side: R() < .5 ? 0 : 1, t: 0 }; }
      // steering
      const dv = des.sub(v), dl2 = dv.length(); if (dl2 > acc * dt) dv.multiplyScalar(acc * dt / dl2); v.add(dv);
      const sm = v.length(); if (sm > spd * 1.3) v.multiplyScalar(spd * 1.3 / sm);
      if (g.st !== 'dive' && p.y + v.y * dt < wavesY + 1.6 && g.st !== 'land' && g.st !== 'climb') v.y = Math.max(v.y, 1.2);
      p.addScaledVector(v, dt);
      this.place(g, dt, mode, v, hoverFlap);
    }
  }
  /* perched life: look around, preen, shift weight, ruffle, short walks */
  pickPerch(g) {
    const L = g.pl, r = R();
    if (r < .42) { L.m = 'look'; L.hy = rt(-1.15, 1.15); L.hr = rt(-.35, .35); L.hp = rt(-.18, .22); L.t = rt(.8, 3.6); }
    else if (r < .58) { L.m = 'preen'; L.side = R() < .5 ? -1 : 1; L.t = rt(2.2, 4); }
    else if (r < .7) { L.m = 'shift'; L.sh = rt(-.08, .08) * (R() < .5 ? 1 : -1); L.t = rt(1, 2.2); }
    else if (r < .8) { L.m = 'ruffle'; L.t = .9; }
    else if (r < .9) { L.m = 'walk'; L.dir = R() < .5 ? -1 : 1; L.t = rt(1.2, 2.2); }
    else { L.m = 'look'; L.hy = 0; L.hr = 0; L.hp = rt(.0, .15); L.t = rt(1.5, 4); }
  }
  place(g, dt, mode, v, _h) {
    const cam = this.S.camera.position, perched = g.st === 'perch' || g.st === 'crouch' || g.st === 'float';
    const hs = Math.hypot(v.x, v.z), targetYaw = hs > .4 ? Math.atan2(v.x, v.z) : g.yaw;
    const dy = ((targetYaw - g.yaw + Math.PI * 3) % TAU) - Math.PI, yr = dy / Math.max(dt, 1e-3);
    if (g.st !== 'perch' && g.st !== 'crouch') g.yaw += dy * Math.min(1, dt * 5);
    g.bank += (clamp(-yr * .45, -.8, .8) - g.bank) * Math.min(1, dt * 4);
    const pitch = perched ? 0 : mode === 'dive' ? .95 : mode === 'hover' ? -.65 : mode === 'land' ? -.35 : mode === 'snatch' ? .15 : clamp(-Math.atan2(v.y, hs + .5) * .8, -.6, .6);
    const r = g.root, sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
    r.position.set(g.pos.x + sy * g.wz + cy * g.wx, g.pos.y, g.pos.z + cy * g.wz - sy * g.wx); r.rotation.order = 'YXZ'; r.rotation.set(pitch, g.yaw, perched ? 0 : g.bank);
    g.setLod(g.pos.distanceTo(cam) > LOD_DIST ? 1 : 0); const rg = g.rig, full = rg.lod === 0;
    // pose targets (smoothed)
    const T = PM[mode] || PM.glide, P = g.pose, k = Math.min(1, dt * (mode === 'dive' ? 14 : mode === 'crouch' ? 16 : 8));
    for (const key of KEYS) P[key] += (T[key] - P[key]) * k;
    let fl = 0, freq = g.freq * g.fq, amp = g.amp;
    switch (mode) { case 'flap': fl = 1; break; case 'hover': fl = 1; freq = 6.5; amp = .9; break; case 'land': fl = 1; freq = (g.st === 'perch' ? 3.4 : 3) * g.fq; amp = g.st === 'perch' ? .5 : .55; break; case 'flare': fl = 1; freq = 7; amp = g.st === 'perch' ? .35 : .7; break; }
    if (fl) g.ph += dt * freq * TAU;
    const s1 = Math.sin(g.ph), c1 = Math.cos(g.ph), A = fl ? amp : 0, rise = fl ? Math.max(0, c1) : 0, t = this.t, calm = mode === 'glide' || mode === 'soar';
    // perched / floating behaviour layer
    let hyT = 0, hrT = 0, hpT = 0, nkT = 0, rsT = 0, walk = 0, ruffle = 0, jaw = P.jaw;
    if (g.st === 'perch' && mode === 'fold') {
      const L = g.pl; L.t -= dt; if (L.t <= 0) this.pickPerch(g);
      if (L.m === 'look') { hyT = L.hy; hrT = L.hr; hpT = L.hp; }
      else if (L.m === 'preen') { hyT = L.side * 2.1; hpT = .55 + Math.sin(t * 13) * .12; nkT = -.12; hrT = L.side * .3; }
      else if (L.m === 'shift') rsT = L.sh;
      else if (L.m === 'ruffle') ruffle = Math.sin(Math.PI * clamp(1 - L.t / .9, 0, 1));
      else if (L.m === 'walk') { walk = 1; g.wz = clamp(g.wz + L.dir * .14 * dt, -.3, .3); nkT = Math.sin(t * 9) * .09; hpT = -Math.sin(t * 9) * .09; }
    }
    if (g.st === 'float') { hyT = Math.sin(t * .6 + g.off) * .7; }
    if (g.cryT > 0) { g.cryT -= dt; jaw += .3 + .22 * Math.sin(t * 20); hpT -= .28; nkT += .12; }
    if (g.st === 'perch' && !g.settle) { /* nothing */ }
    const kh = Math.min(1, dt * 6); g.hy += (hyT - g.hy) * kh; g.hr += (hrT - g.hr) * kh; g.hpa += (hpT - g.hpa) * kh; g.nka += (nkT - g.nka) * kh; g.rs += (rsT - g.rs) * Math.min(1, dt * 3);
    if (g.dip) { g.dip.t += dt; if (g.dip.t > 1.3) g.dip = null; }
    const wind = perched ? Math.min(1, .35 + Math.abs(this.boatSpd || 0) * .15) : 0;
    // wings
    for (let wi = 0; wi < 2; wi++) {
      const w = rg.wings[wi], s = wi ? -1 : 1, dip = g.dip && g.dip.side === wi ? Math.sin(Math.PI * clamp(g.dip.t / 1.3, 0, 1)) * .42 : 0;
      const corr = calm ? Math.sin(t * 1.7 + g.off + wi * 1.9) * .03 : 0, wcorr = calm ? Math.sin(t * 2.3 + g.off * 2 + wi) * .05 : 0, flutter = perched ? Math.sin(t * 5.3 + g.off + wi) * .012 * wind + ruffle * .12 : 0;
      w.sh.position.set(P.shpx * s, P.shpy, .07 - (P.shpy - .045) * .3); w.sh.rotation.set(P.shx, P.shy, P.shz + A * s1 + corr - dip + flutter);
      w.el.rotation.set(0, P.ely - rise * A * .3, P.elz + A * .5 * Math.sin(g.ph - .9)); w.el.position.y = P.elpy;
      w.wr.rotation.set(0, P.wry + rise * A * .55, P.wrz + A * .85 * Math.sin(g.ph - 1.8) + wcorr + dip * .3); w.wr.position.y = P.wrpy;
      if (full) { const spread = Math.max(0, P.spr * (1 - rise * .85)) + ruffle * .3; for (let i = 0; i < 9; i++) { const pg = w.prim[i]; pg.rotation.y = primAngle(i) + spread * (i - 4) * .022 + Math.sin(t * 9 + i * 1.3 + g.i) * .012 * spread; pg.rotation.z = spread * Math.pow(i / 8, 2) * .28 + (calm ? Math.sin(t * 2 + i + g.off) * .01 : 0); } }
    }
    // body, neck, head, tail, legs
    const b = rg.body; b.rotation.x = P.bp + (fl ? c1 * .05 : 0); b.rotation.z = g.rs; b.position.y = P.by + (fl ? -s1 * .012 : 0) + (g.st === 'perch' && mode === 'fold' ? Math.sin(t * 1.3 + g.off) * .0025 + ruffle * .006 : 0);
    if (g.st === 'float') b.rotation.z = Math.sin(t * 1.4 + g.off) * .06;
    const puff = 1 + ruffle * .06; b.scale.set(puff, puff, puff);
    if (full) {
      rg.neck.rotation.set(-(P.neck + g.nka), g.hy * .4, 0); rg.head.rotation.set(P.hp + g.hpa, g.hy * .6, g.hr); rg.jaw.rotation.x = jaw;
      rg.tail.rotation.x = P.tailP + (perched ? Math.sin(t * 7 + g.i) * .03 * wind + ruffle * .15 : 0); rg.tail.scale.x = P.tailS * (1 + ruffle * .2);
      for (let li = 0; li < 2; li++) { const lg = rg.legs[li], sw = walk ? Math.sin(t * 9 + li * Math.PI) * .5 : 0; lg.hip.rotation.set(P.legR - P.bp + sw, 0, (li ? -1 : 1) * P.lgx); lg.ank.rotation.x = P.ank - sw * .8; }
    } else { rg.tail.rotation.x = P.tailP; }
  }
}

const PM = {}; for (const [k, v] of Object.entries(POSE)) PM[k] = { ...BASE, ...v };
Object.assign(PM.fold, { neck: .8, hp: .99, bp: -.24 }); Object.assign(PM.flare, { neck: .85, hp: 1.0, bp: -.24 }); Object.assign(PM.crouch, { neck: .6, hp: .82 }); Object.assign(PM.float, { neck: .75, hp: .9 }); Object.assign(PM.land, { by: STAND, neck: .6, hp: .5 });
