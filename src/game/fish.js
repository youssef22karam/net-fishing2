// @ts-nocheck
/* Fish: schools that move like real bait balls (rotating mill, amoeba shaped envelope, breathing, silver flash waves, vacuoles around the boat),
   lone stragglers for the trawl to pick up one by one, natural visual cues only.
   Rendering (no dots, no billboards, no markers): near the camera every fish is a real body at true size, shaded by the shared underwater model and cut off below ~8 m;
   a SHALLOW school (top within ~6 m) also paints one dark patch under the surface + ripples + silver flashes; deeper schools show nothing (fish finder only).
   Old rendering notes: every fish is a real body (instanced, tail beating in the vertex shader, counter-shaded, mirror flanks that glitter when they bank) shaded by the shared
   underwater model in underwater.js, plus a soft teal mass where fish overlap. NO markers of any kind. */
import * as THREE from 'three';
import { SPECIES, SPECIES_LIST, clamp, lerp, sstep, TAU, seaEnv } from './config.js';
import { fishGeometry, fishMaterial, surfacePatchMaterial, patchGeometry, glintMaterial, billboards } from './underwater.js';

const R = Math.random, rt = (a, b) => a + (b - a) * R();
const MAXF = window.__lite ? 700 : 1500;
const STRAGGLERS = window.__lite ? 22 : 40;
const wrapA = (a) => ((a + Math.PI * 3) % TAU) - Math.PI;

export class FishWorld {
  constructor(S) {
    this.S = S; this.schools = []; this.t = 0; this.frame = 0; this.count = 0; this.events = [];
    const g = fishGeometry();
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aBel = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aFx = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aCol', this.aCol); g.setAttribute('aBel', this.aBel); g.setAttribute('aFx', this.aFx);
    this.mesh = new THREE.InstancedMesh(g, fishMaterial(), MAXF); this.mesh.frustumCulled = false; this.mesh.renderOrder = .45; this.mesh.count = 0; S.scene.add(this.mesh);
    this.spCol = {}; for (const sp of SPECIES_LIST) this.spCol[sp.id] = { c: new THREE.Color(sp.color), b: new THREE.Color(sp.belly), st: sp.id === 'mackerel' ? 1 : 0 };
    // surface patch of a shallow school: ONE soft dark decal per school just under the sea surface (alpha from depth / distance / clarity / light / sea state)
    this.PMAX = 48; this.patch = new THREE.Mesh(patchGeometry(this.PMAX), surfacePatchMaterial()); this.patch.frustumCulled = false; this.patch.renderOrder = .38; S.scene.add(this.patch);
    // silver glints (additive)
    this.gPos = new Float32Array(MAXF * 3); this.gA = new Float32Array(MAXF); this.gS = new Float32Array(MAXF);
    this.glint = billboards(glintMaterial(), this.gPos, this.gA, this.gS); this.glint.renderOrder = .8; S.scene.add(this.glint);
    // leaping bait: small real fish bodies on a ballistic arc (short-lived, only from shallow active schools)
    const NJ = 60; this.NJ = NJ; this.jn = 0; this.jp = new Float32Array(NJ * 3); this.jv = new Float32Array(NJ * 3); this.jl = new Float32Array(NJ).fill(-1); this.jsp = new Array(NJ).fill(null);
    const jg = fishGeometry(); this.jAC = new THREE.InstancedBufferAttribute(new Float32Array(NJ * 3), 3); this.jAB = new THREE.InstancedBufferAttribute(new Float32Array(NJ * 3), 3); this.jAF = new THREE.InstancedBufferAttribute(new Float32Array(NJ * 4), 4);
    jg.setAttribute('aCol', this.jAC); jg.setAttribute('aBel', this.jAB); jg.setAttribute('aFx', this.jAF);
    this.jumpers = new THREE.InstancedMesh(jg, fishMaterial(0), NJ); this.jumpers.frustumCulled = false; this.jumpers.renderOrder = .47; this.jumpers.count = NJ; S.scene.add(this.jumpers);
    this.zAxis = new THREE.Vector3(0, 0, 1); this.tmpQ = new THREE.Quaternion(); this.tmpD = new THREE.Vector3();
    this.dummy = new THREE.Object3D(); this.tmpV = new THREE.Vector3(); this.waveId = 1;
  }

  /* ------------ spawning ------------ */
  pickSpecies(shallowOnly) {
    const pool = SPECIES_LIST.filter((s) => !shallowOnly || s.depth[1] < 8);
    let tot = 0; pool.forEach((s) => (tot += s.rarity)); let r = R() * tot;
    for (const s of pool) { r -= s.rarity; if (r <= 0) return s; } return pool[0];
  }
  spawnSchool(spId, x, z, o = {}) {
    const sp = typeof spId === 'string' ? SPECIES[spId] : spId; const lone = o.lone ?? (sp.schoolN[1] <= 3);
    const n = o.n ?? Math.round(rt(sp.schoolN[0], sp.schoolN[1]));
    if (this.totalFish() + n > MAXF) return null;
    const d = o.depth ?? rt(sp.depth[0], sp.depth[1]);
    const s = { sp, id: Math.random(), seed: R() * 100, t: R() * 50, spin: R() * TAU, x, z, d, d0: d, heading: o.heading ?? R() * TAU, al: 0, fl: 0, fleeDir: 0, n, lone, fish: [], act: 0, actT: rt(3, 30), actOn: !!o.feeding, vx: 0, vz: 0, surf: 0, surfT: rt(10, 30), flick: 0, rad: lone ? 1.2 : Math.max(2.0, Math.sqrt(n) * (sp.len * 1.15 + .12)), fleeT0: 0, born: this.t, waveT: rt(1, 5), wave: null, straggler: !!o.straggler };
    if (o.feeding) { s.act = 1; s.actT = rt(50, 120); }
    for (let i = 0; i < n; i++) {
      const r0 = Math.sqrt(R()), a0 = R() * TAU, span = sp.pattern === 'ball' ? Math.min(s.rad * .3, 1.5) : lone ? .3 : 1.1, rr = s.rad * r0;
      s.fish.push({ s, sp, a0, r0, ox: Math.cos(a0) * rr, oz: Math.sin(a0) * rr, ly: (R() - .5) * 2 * span, x: x + Math.cos(a0) * rr, z: z + Math.sin(a0) * rr, y: -d, vx: Math.cos(s.heading) * .2, vy: 0, vz: Math.sin(s.heading) * .2, ph: R() * TAU, flash: 0, rollK: 0, roll: 0, th: 0, lenK: rt(.85, 1.15), alpha: 0, sw: .3, hd: R() * TAU, wid: 0, dart: rt(1, 8), cap: null, tone: rt(.88, 1.12) });
    }
    this.schools.push(s); return s;
  }
  totalFish() { let c = 0; for (const s of this.schools) c += s.fish.length; return c; }
  removeSchool(s) { const i = this.schools.indexOf(s); if (i >= 0) this.schools.splice(i, 1); }
  clear() { [...this.schools].forEach((s) => this.removeSchool(s)); }
  spawnStraggler(boat, near) {
    const sp = this.pickSpecies(), a = R() * TAU, d = near ? rt(30, 160) : rt(120, 330);
    return this.spawnSchool(sp, boat.position.x + Math.cos(a) * d, boat.position.z + Math.sin(a) * d, { lone: true, n: 1 + (R() < .25 ? 1 : 0), straggler: true, depth: rt(sp.depth[0], Math.min(sp.depth[1], 12)) });
  }

  initialWorld(boat) {
    const fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading), at = (d, ang) => { const a = Math.atan2(fz, fx) + ang; return [boat.position.x + Math.cos(a) * d, boat.position.z + Math.sin(a) * d]; };
    let p = at(52, -.18); this.spawnSchool('sardine', p[0], p[1], { depth: 1.1, feeding: true, heading: Math.atan2(fz, fx) + 1.2 });
    p = at(100, .6); this.spawnSchool('mackerel', p[0], p[1], { depth: 3.4, feeding: true });
    p = at(170, -1.1); this.spawnSchool('sardine', p[0], p[1], { depth: 1.5, feeding: true });
    p = at(75, 1.6); this.spawnSchool('cod', p[0], p[1], { depth: 11 });
    p = at(230, .3); this.spawnSchool('tuna', p[0], p[1], { depth: 5 });
    p = at(38, 2.4); this.spawnSchool('mullet', p[0], p[1], { depth: .9 });
    p = at(130, -.5); this.spawnSchool('mackerel', p[0], p[1], { depth: 5.2 });
    for (let i = 0; i < 7; i++) { const sp = this.pickSpecies(); const a = R() * TAU, d = rt(110, 380); this.spawnSchool(sp, boat.position.x + Math.cos(a) * d, boat.position.z + Math.sin(a) * d, { feeding: sp.depth[1] < 4 && R() < .5 }); }
    for (let i = 0; i < STRAGGLERS; i++) this.spawnStraggler(boat, true);
  }

  /* ------------ queries for nets / gulls / sonar ------------ */
  fishNear(x, z, r, maxDepth = 14) { const out = []; for (const s of this.schools) { if (Math.hypot(s.x - x, s.z - z) > r + s.rad + 3) continue; for (const f of s.fish) if (!f.cap && f.y > -maxDepth && Math.hypot(f.x - x, f.z - z) < r) out.push(f); } return out; }
  removeFish(list) { const set = new Set(list); for (const s of this.schools) { if (s.fish.some((f) => set.has(f))) s.fish = s.fish.filter((f) => !set.has(f)); } this.schools.filter((s) => s.fish.length === 0).forEach((s) => this.removeSchool(s)); }
  /* a fish is swept into the net: it keeps swimming (visibly) into the codend, then leaves the sea */
  capture(f, rig) { if (f.cap) return; f.cap = { rig, t: 0, off: [rt(-.5, .5), rt(-.3, .3), rt(-.5, .5)] }; f.flash = 1; f.rollK = rt(-1, 1); }
  /* echo sounder: fish counts per depth bin inside a swath around (x,z) */
  sonar(x, z, half, bins, maxD) {
    const out = new Float32Array(bins), sz = new Float32Array(bins);
    for (const s of this.schools) { if (Math.hypot(s.x - x, s.z - z) > half + s.rad + 6) continue; for (const f of s.fish) { if (f.cap) continue; if (Math.hypot(f.x - x, f.z - z) > half) continue; const b = Math.floor(clamp(-f.y / maxD, 0, .999) * bins); out[b] += 1; sz[b] = Math.max(sz[b], f.sp.len); } }
    return { dens: out, size: sz };
  }
  scare(x, z, r, amt) { for (const s of this.schools) { const d = Math.hypot(s.x - x, s.z - z); if (d < r + s.rad) { s.al += amt * (1 - clamp(d / (r + s.rad), 0, 1) * .6) * (.4 + s.sp.shy) * (1 - .6 * sstep(1.5, 6, s.top ?? s.d)); if (s.al >= 1) this.flee(s, x, z); } } }
  flee(s, tx, tz) {
    if (s.fl > 0) return; s.fl = rt(6, 10); s.al = 0; s.fleeT0 = this.t; s.fleeDir = Math.atan2(s.z - tz, s.x - tx);
    s.wave = { x: s.x, z: s.z, t0: this.t, sp: 9, id: this.waveId++ };
    this.events.push({ type: 'flee', school: s, x: s.x, z: s.z });
  }
  isShallowFeeding(s) { return !s.lone && s.act > .35 && (s.top ?? s.d) < 5; }
  /* 0..1: how readable this school is from the surface by depth alone (continuous, exactly 0 beyond ~7.6 m) */
  depthCue(s) { return 1 - sstep(1.0, 7.6, s.top ?? s.d); }

  /* ------------ visibility of a fish mass: distance, depth, clarity, light/sun angle, weather, sea state ------------ */
  visibility(x, depth, z, cam, env, patch = false) {
    const dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz) + 1e-3, h = Math.max(cam.y - this.S.S.y, .6);
    const slant = Math.min(Math.sqrt(1 + (d / (h + depth * .75)) ** 2), patch ? 6.5 : 9);
    const k = lerp(1.2, .2, env.clar);
    const water = Math.exp(-k * depth * slant * .5);
    const atmos = Math.exp(-d * (.0028 + .009 * env.storm));
    const lightF = .12 + .88 * env.light, sunF = .5 + .5 * sstep(0, .8, env.sunY);
    const su = this.S.U.uSun.value, sl = Math.hypot(su.x, su.z) + 1e-4, dot = Math.max(0, (dx / d) * (su.x / sl) + (dz / d) * (su.z / sl));
    const glare = (Math.pow(dot, 6) * (1 - env.sunY) * .7 + Math.pow(dot, 40) * .35) * env.day;
    const sea = 1 / (1 + .12 * Math.pow(env.hs, 1.5));
    return water * atmos * lightF * sunF * (1 - clamp(glare, 0, .8)) * sea;
  }

  /* ------------ per-frame ------------ */
  update(dt, ctx) {
    this.t += dt; this.frame++;
    const S = this.S, boat = ctx.boat, env = seaEnv(), cam = S.camera.position;
    const bx = boat.position.x, bz = boat.position.z;
    const noise = ctx.noise; const cur = env.current; let lones = 0;
    for (let si = this.schools.length - 1; si >= 0; si--) {
      const s = this.schools[si], sp = s.sp, dB = Math.hypot(s.x - bx, s.z - bz); s.t += dt; if (s.lone) lones++;
      if (dB > 460) { this.removeSchool(s); if (!s.lone) this.respawn(boat); continue; }
      /* activity (feeding) cycle */
      s.actT -= dt; if (s.actT <= 0) { if (sp.depth[0] < 4 && !s.lone) { s.actOn = !s.actOn; s.actT = s.actOn ? rt(60, 130) : rt(15, 40); } else s.actT = 30; }
      if (sp.pattern === 'surfacing') { s.surfT -= dt; if (s.surfT <= 0) { s.surf = s.surf > 0 ? 0 : rt(5, 8); s.surfT = s.surf > 0 ? s.surf : rt(25, 45); } }
      const actT = (s.actOn && s.fl <= 0 ? 1 : 0) * (s.d0 < 3.6 ? 1 : 0) + (s.surf > 0 ? 1 : 0); s.act += (clamp(actT, 0, 1) - s.act) * Math.min(1, dt * .5);
      /* alertness from boat noise, hull shadow and wake */
      /* a school several metres down hears a hull / tow far less than a surface school does (the hull passing overhead does not make a mid-water school bolt) */
      const mf = 1 - .85 * sstep(1.5, 6, s.top ?? s.d), hear = (14 + 55 * noise * sp.shy) * (.55 + .45 * mf), shadow = dB < 7 && s.d < 3 ? .09 : 0;
      if (dB < hear) s.al += ((noise * .55 + .03) * sp.shy * (1 - dB / hear) * 1.1 * mf + shadow * sp.shy) * dt;
      s.al = Math.max(0, s.al - .1 * dt);
      if (s.al >= 1) this.flee(s, bx, bz);
      /* school motion */
      const pat = sp.pattern; let spd = sp.speed * .3, turn = (R() - .5) * dt * .9;
      if (s.fl > 0) { s.fl -= dt; const el = this.t - s.fleeT0; spd = sp.speed * (sp.flee === 'sprint' ? 3.4 : 2.4); let target = s.fleeDir;
        if (sp.flee === 'zigzag') target += Math.sin(el * 3.2) * .85; if (sp.flee === 'circle') { target = s.heading + dt * 1.8; spd = sp.speed * .8; } if (sp.flee === 'dive') spd = sp.speed * .6;
        const da = wrapA(target - s.heading); s.heading += da * Math.min(1, dt * 4);
        const dive = sp.dive * Math.min(el, 4) * (sp.flee === 'dive' ? 2.2 : 1) * .7; s.d += (clamp(s.d0 + dive + 1.5, 0, 12.6) - s.d) * Math.min(1, dt * 1.2);
        if (el < .8 && s.d < 3.5) this.splashAt(s.x + rt(-s.rad, s.rad), s.z + rt(-s.rad, s.rad), .1);
      } else {
        s.d += (s.d0 - (s.surf > 0 ? s.d0 - .45 : 0) - s.d) * Math.min(1, dt * .6);
        if (pat === 'ball') { spd = .12 + .1 * s.act; turn = Math.sin(s.t * .13 + s.seed) * dt * .22; } else if (pat === 'circle') { turn = dt * .4; spd = sp.speed * .35; } else if (pat === 'lurk') { spd = .15; }
        else if (pat === 'surfacing' && s.surf > 0) { spd = sp.speed * 1.4; turn = (R() - .5) * dt * 2.2; }
        else if (pat === 'stream') { turn = Math.sin(s.t * .09 + s.seed) * dt * .35; spd = sp.speed * .42; }
        if (s.lone) { turn = (R() - .5) * dt * 1.4; spd = sp.speed * .35; }
        s.heading += turn;
      }
      s.vx = Math.cos(s.heading) * spd + cur * .3; s.vz = Math.sin(s.heading) * spd + cur * .15; s.x += s.vx * dt; s.z += s.vz * dt;
      /* the school's flash wave: a silver ripple that races through the fish */
      s.waveT -= dt; if (s.waveT <= 0 && !s.lone && s.fish.length > 8) { s.waveT = rt(2.2, 6) / (1 + s.act * 1.6); const f0 = s.fish[(R() * s.fish.length) | 0]; s.wave = { x: f0.x, z: f0.z, t0: this.t, sp: rt(5, 9), id: this.waveId++ }; }
      if (s.wave && this.t - s.wave.t0 > 3) s.wave = null;
      /* boids on a moving, breathing, amoeba-shaped mill */
      const F = s.fish, n = F.length, fleeing = s.fl > 0, vmax = sp.speed * (fleeing ? (sp.flee === 'sprint' ? 3.2 : 2.7) : 1.15);
      const stream = pat === 'stream' || pat === 'surfacing' || pat === 'skim', elong = stream ? 1.8 : 1, narrow = stream ? .62 : 1;
      const compact = (pat === 'ball' ? 1 - .3 * s.act : 1) * (fleeing ? 1.45 : 1) * (1 + .09 * Math.sin(s.t * .6 + s.seed));
      const rad = s.rad * compact, om = Math.min((pat === 'ball' ? .5 : .28) * (1 + .6 * s.act) * (fleeing ? 1.6 : 1), .8 * sp.speed / Math.max(s.rad, 1));
      s.spin += om * dt; const cH = Math.cos(s.heading), sH = Math.sin(s.heading), cohK = pat === 'ball' ? 2.6 : fleeing ? 2.3 : 1.7;
      let done = 0;
      for (let i = 0; i < n; i++) {
        const f = F[i];
        if (f.cap) {   // swept into the net: swim into the codend
          f.cap.t += dt; const c = f.cap.rig.cod; if (!c || f.cap.rig.dead) { f.cap.t = 9; }
          else { const k = Math.min(1, dt * 2.6), tx = c.x + f.cap.off[0], ty = c.y + f.cap.off[1], tz = c.z + f.cap.off[2]; const px = f.x, pz = f.z; f.x += (tx - f.x) * k; f.y += (ty - f.y) * k; f.z += (tz - f.z) * k; f.vx = (f.x - px) / dt; f.vz = (f.z - pz) / dt; f.sw = 1; f.flash = Math.max(0, f.flash - dt * 1.4); f.rollK *= Math.exp(-dt * 1.5); }
          if (f.cap.t > 2.2) f.dead = true; if (f.dead) done++; continue;
        }
        const w = 1.18 - .62 * f.r0, a = f.a0 + s.spin * w;
        const e = 1 + .28 * Math.sin(2 * a + s.t * .35 + s.seed) + .16 * Math.sin(3 * a - s.t * .27 + s.seed * 2.1) + .08 * Math.sin(5 * a + s.t * .7 + f.ph);
        const lx = Math.cos(a) * f.r0 * rad * e * elong, lz = Math.sin(a) * f.r0 * rad * e * narrow;
        const gx = s.x + lx * cH - lz * sH + Math.sin(s.t * .8 + f.ph) * rad * .05, gz = s.z + lx * sH + lz * cH + Math.cos(s.t * .7 + f.ph * 1.3) * rad * .05;
        let ax = (gx - f.x) * cohK, az = (gz - f.z) * cohK;
        // separation + alignment vs sampled neighbours
        let avx = 0, avz = 0;
        for (let k = 0; k < 3; k++) {
          const j = (i + 1 + ((i * 7 + k * 13 + this.frame * 3) % Math.max(1, n - 1))) % n; if (j === i) continue; const o = F[j];
          avx += o.vx; avz += o.vz; const dx = f.x - o.x, dz = f.z - o.z, d2 = dx * dx + dz * dz, sr = sp.len * 1.9;
          if (d2 < sr * sr && d2 > 1e-5) { const d = Math.sqrt(d2), ww = (sr - d) / sr * 7; ax += dx / d * ww; az += dz / d * ww; }
        }
        ax += (avx / 3 + s.vx - f.vx) * .9; az += (avz / 3 + s.vz - f.vz) * .9;
        // darting: single fish snap in a new direction, and the neighbours follow through the flash wave
        f.dart -= dt; if (f.dart <= 0) { f.dart = rt(2, 9) / (1 + s.act); const ang = R() * TAU; f.vx += Math.cos(ang) * sp.speed * .9; f.vz += Math.sin(ang) * sp.speed * .9; if (R() < .3) { f.flash = Math.max(f.flash, .8); f.rollK = (R() < .5 ? -1 : 1) * rt(.8, 1.3); } }
        // predators: the hull, its bow wave and shadow open a vacuole in the school
        const bdx = f.x - bx, bdz = f.z - bz, bd = Math.hypot(bdx, bdz);
        if (bd < 11 && f.y > -6) { const ww = (11 - bd) / 11 * (1 - .9 * sstep(2, 5.5, -f.y)); ax += bdx / (bd + .1) * ww * 6 * sp.shy; az += bdz / (bd + .1) * ww * 6 * sp.shy; if (bd < 5) s.al += .02 * dt * 60 * ww * dt * sp.shy; }
        if (ctx.netThreat && ctx.netThreat.r) { const nx = f.x - ctx.netThreat.x, nz = f.z - ctx.netThreat.z, nd = Math.hypot(nx, nz); if (nd < ctx.netThreat.r * 2 && f.y > -(ctx.netThreat.depth + 3)) { const ww = 1 - nd / (ctx.netThreat.r * 2); ax += nx / (nd + .1) * ww * 9; az += nz / (nd + .1) * ww * 9; } }
        if (fleeing && sp.flee === 'burst') { const sx = f.x - s.x, sz = f.z - s.z, sd = Math.hypot(sx, sz) + .1; ax += sx / sd * 2.5; az += sz / sd * 2.5; }
        const pvx = f.vx, pvz = f.vz;
        f.vx += ax * dt; f.vz += az * dt; const sm = Math.hypot(f.vx, f.vz); if (sm > vmax) { f.vx *= vmax / sm; f.vz *= vmax / sm; }
        f.x += f.vx * dt; f.z += f.vz * dt; f.sw += (clamp(sm / (sp.speed * 1.4), 0, 1) - f.sw) * Math.min(1, dt * 3);
        // depth layering: a bait ball is a 3-D ball, fish drift through its layers
        const breathe = s.lone ? 1 : .55 + .45 * Math.sin(s.t * .4 + f.ph), ty = clamp(-(s.d + f.ly * breathe), -12.6, -.28), dv = (fleeing ? sp.dive * 1.4 : .7) * dt; f.vy = (ty - f.y); f.y += clamp(ty - f.y, -dv, dv);
        // banking in turns exposes the mirror flank; flash = sun glinting off it
        const a0 = Math.atan2(pvx, pvz), a1 = Math.atan2(f.vx, f.vz), da = wrapA(a1 - a0); f.th = Math.abs(da) / Math.max(dt, 1e-3);
        const turn = wrapA(a1 - f.hd), spF = clamp(sm / (sp.speed * .6), 0, 1); f.hd = wrapA(f.hd + turn * Math.min(1, dt * 4.5 * (.3 + spF)));
        const bank = clamp(-turn * .8, -.65, .65) * spF; f.roll += (bank - f.roll) * Math.min(1, dt * 3);
        if (f.th > 5 && sm > .4 && R() < (fleeing ? .1 : .02) + s.act * .02) { f.flash = 1; f.rollK = (da > 0 ? -1 : 1) * rt(.7, 1.2); }
        if (s.wave && f.wid !== s.wave.id) { const d = Math.hypot(f.x - s.wave.x, f.z - s.wave.z); if (Math.abs(d - s.wave.sp * (this.t - s.wave.t0)) < 1.1) { f.wid = s.wave.id; f.flash = Math.max(f.flash, .9 * rt(.6, 1)); f.rollK = (R() < .5 ? -1 : 1) * rt(.6, 1.2); } }
        f.flash = Math.max(0, f.flash - dt * 2.6); f.rollK *= Math.exp(-dt * 3);
      }
      if (done) { s.fish = s.fish.filter((f) => !f.dead); if (!s.fish.length) { this.removeSchool(s); continue; } }
      /* real school extent in depth (mean ± 1.7 sd, clipped to the actual fish): what the sounder sees and what the net must match */
      { let c = 0, sum = 0, sq = 0, mn = 99, mx = 0; for (const f of F) { if (f.cap) continue; const dp = -f.y; c++; sum += dp; sq += dp * dp; if (dp < mn) mn = dp; if (dp > mx) mx = dp; }
        if (c) { const mean = sum / c, sd = Math.sqrt(Math.max(0, sq / c - mean * mean)); s.mean = mean; s.top = Math.max(mn, mean - 1.7 * sd, 0); s.bot = Math.min(mx, mean + 1.7 * sd); s.live = c; } else { s.mean = s.d; s.top = s.d; s.bot = s.d; s.live = 0; } }
      /* surface cues: fade continuously with the depth of the TOP of the school; nothing at all for a deep school */
      const cueD = this.depthCue(s);
      if (cueD > .02 && dB < 320 && !s.lone) {
        const rate = ((.35 + s.act * 14) * Math.min(1, s.fish.length / 60) + (s.fl > 0 ? 7 : 0)) * cueD; s._acc = (s._acc || 0) + rate * dt;
        while (s._acc > 1) { s._acc--; const a = R() * TAU, rr = s.rad * Math.sqrt(R()) * .9; this.splashAt(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr, rt(.06, .2) * (.45 + .55 * cueD)); }
        if (cueD > .5 && s.act > .5 && R() < dt * 2.2 * s.act * (sp.pattern === 'ball' ? 1.4 : 1)) this.jump(s.x + rt(-1, 1) * s.rad * .8, s.z + rt(-1, 1) * s.rad * .8, sp);
      }
    }
    if (lones < STRAGGLERS && this.frame % 20 === 0) this.spawnStraggler(boat, false);
    this.updateInstances(cam, env);
    this.updateJumpers(dt);
  }
  respawn(boat) {
    const sp = this.pickSpecies(); const fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading), a = Math.atan2(fz, fx) + rt(-1.7, 1.7), d = rt(180, 380);
    this.spawnSchool(sp, boat.position.x + Math.cos(a) * d, boat.position.z + Math.sin(a) * d, { feeding: sp.depth[1] < 4 && R() < .55 });
  }
  splashAt(x, z, k) { if (this.S.splash) this.S.splash(x, z, k); }
  jump(x, z, sp) { for (let t = 0; t < 3; t++) { const i = (this.jn++) % this.NJ; if (this.jl[i] > 0) continue; this.jp.set([x, -.05, z], i * 3); this.jv.set([rt(-1.2, 1.2), rt(2.2, 3.6), rt(-1.2, 1.2)], i * 3); this.jl[i] = 1; this.jsp[i] = sp || SPECIES.sardine;
      const c = this.spCol[this.jsp[i].id]; this.jAC.array.set([c.c.r, c.c.g, c.c.b], i * 3); this.jAB.array.set([c.b.r, c.b.g, c.b.b], i * 3); this.jAF.array.set([.7, R() * 6, 1, c.st], i * 4); break; } }
  updateJumpers(dt) {
    const d = this.dummy, q = this.tmpQ, v = this.tmpD;
    for (let i = 0; i < this.NJ; i++) {
      const o = i * 3;
      if (this.jl[i] < 0) { d.position.set(0, -60, 0); d.scale.set(0, 0, 0); d.quaternion.identity(); d.updateMatrix(); this.jumpers.setMatrixAt(i, d.matrix); continue; }
      this.jv[o + 1] -= 9.8 * dt; this.jp[o] += this.jv[o] * dt; this.jp[o + 1] += this.jv[o + 1] * dt; this.jp[o + 2] += this.jv[o + 2] * dt;
      if (this.jp[o + 1] < 0 && this.jv[o + 1] < 0) { this.splashAt(this.jp[o], this.jp[o + 2], .06); this.jl[i] = -1; continue; }
      v.set(this.jv[o], this.jv[o + 1], this.jv[o + 2]).normalize(); q.setFromUnitVectors(this.zAxis, v); const L = this.jsp[i].len * 1.0;
      d.position.set(this.jp[o], this.jp[o + 1], this.jp[o + 2]); d.quaternion.copy(q); d.scale.set(L * .95, L * 1.0, L); d.updateMatrix(); this.jumpers.setMatrixAt(i, d.matrix);
    }
    this.jumpers.instanceMatrix.needsUpdate = true; this.jAC.needsUpdate = this.jAB.needsUpdate = this.jAF.needsUpdate = true;
  }
  /* readability of a school from the surface: depth of its top x distance x clarity x light x sea state x viewing angle x sun glare (all continuous) */
  cue(s, cam, env) {
    const dk = this.depthCue(s); if (dk <= .001) return { k: 0, a: 0 };
    const dist = Math.hypot(s.x - cam.x, s.z - cam.z), camH = Math.max(cam.y - this.S.S.y, .5), sinE = camH / Math.hypot(dist, camH);
    const ang = .28 + .72 * sstep(.03, .3, sinE), clar = lerp(.5, 1, env.clar), atmos = Math.exp(-dist * (.0032 + .011 * env.storm)) * (1 - sstep(260, 380, dist));
    const light = .14 + .86 * env.light, sea = 1 / (1 + .22 * Math.pow(env.hs, 1.4)), su = this.S.U.uSun.value, sl = Math.hypot(su.x, su.z) + 1e-4, dd = dist + 1e-3;
    const dot = Math.max(0, ((s.x - cam.x) / dd) * (su.x / sl) + ((s.z - cam.z) / dd) * (su.z / sl)), glare = clamp((Math.pow(dot, 6) * (1 - env.sunY) * .6 + Math.pow(dot, 40) * .3) * env.day, 0, .7);
    const k = dk * clar * atmos * light * sea * ang * (1 - glare), dens = 1 - Math.exp(-(s.live || s.fish.length) / 38);
    return { k, a: clamp(k * (.25 + .9 * dens) * 1.25, 0, .9) };
  }
  updateInstances(cam, env) {
    const m = this.mesh, d = this.dummy; let i = 0, gi = 0, pi = 0;
    const gp = this.gPos, ga = this.gA, gs = this.gS, AC = this.aCol.array, AB = this.aBel.array, AF = this.aFx.array;
    const PG = this.patch.geometry, pPos = PG.attributes.aPos.array, pP = PG.attributes.aP.array, pS = PG.attributes.aSeed.array; this.patch.material.uniforms.uT.value = this.t;
    for (const s of this.schools) {
      const sc0 = this.spCol[s.sp.id], stream = s.sp.pattern === 'stream' || s.sp.pattern === 'surfacing' || s.sp.pattern === 'skim';
      if (!s.lone && pi < this.PMAX) {
        const c = this.cue(s, cam, env); s.cueK = c.k;
        if (c.a > .01) { const el = stream ? 1.7 : 1, D = (s.rad * 2.5 + (s.top || 0) * .7 + 1.2) * (stream ? 1.15 : 1);
          pPos[pi * 3] = s.x; pPos[pi * 3 + 1] = -.32; pPos[pi * 3 + 2] = s.z; pP[pi * 4] = D * el; pP[pi * 4 + 1] = c.a; pP[pi * 4 + 2] = s.heading; pP[pi * 4 + 3] = el; pS[pi] = s.seed; pi++; }
      } else s.cueK = 0;
      for (const f of s.fish) {
        if (i >= MAXF) break;
        const dx = f.x - cam.x, dz = f.z - cam.z, dd = Math.hypot(dx, dz), L = f.sp.len * f.lenK;
        if (dd < 76) {   // real fish bodies only near the camera, always at true size
          const wd = L * (f.sp.girth / .17);
          d.position.set(f.x, f.y, f.z); d.rotation.set(-clamp(f.vy * .25, -.5, .5), f.hd, f.roll + f.rollK * 1.1 + Math.sin(this.t * 3 + f.ph) * .04, 'YXZ');
          d.scale.set(wd, wd * 1.05, L); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
          const k = f.tone; AC[i * 3] = sc0.c.r * k; AC[i * 3 + 1] = sc0.c.g * k; AC[i * 3 + 2] = sc0.c.b * k; AB[i * 3] = sc0.b.r; AB[i * 3 + 1] = sc0.b.g; AB[i * 3 + 2] = sc0.b.b;
          AF[i * 4] = f.flash; AF[i * 4 + 1] = f.ph; AF[i * 4 + 2] = f.sw; AF[i * 4 + 3] = sc0.st; i++;
        }
        // silver flashes: only fish just under the surface, fading out by ~4.5 m, never from deeper fish
        const dep = -f.y;
        if (f.flash > .05 && dep < 4.5 && dd < 260 && !f.cap) { const fv = this.visibility(f.x, dep, f.z, cam, env) * (1 - sstep(1.2, 4.5, dep)); if (fv > .012 && gi < MAXF) { gp[gi * 3] = f.x; gp[gi * 3 + 1] = f.y + .04; gp[gi * 3 + 2] = f.z; ga[gi] = clamp(f.flash * fv * 7, 0, .9); gs[gi] = L * 2.2 + dd * .0025 + .04; gi++; } }
      }
    }
    m.count = i; this.count = i; m.instanceMatrix.needsUpdate = true; this.aCol.needsUpdate = this.aBel.needsUpdate = this.aFx.needsUpdate = true;
    PG.instanceCount = pi; for (const k of ['aPos', 'aP', 'aSeed']) PG.attributes[k].needsUpdate = true;
    const gg = this.glint.geometry; gg.instanceCount = gi; for (const k of ['aPos', 'aA', 'aS']) gg.attributes[k].needsUpdate = true;
  }
}
