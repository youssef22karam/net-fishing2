// @ts-nocheck
/* Fish: boids schools (separation / alignment / cohesion + predator avoidance + depth layering), lone fish, natural visual cues only.
   Cues: dark shifting patches, silver flashes on turns, surface ripples/boil (wave-sim impulses), leaping bait, tight bait balls. NO markers of any kind. */
import * as THREE from 'three';
import { SPECIES, SPECIES_LIST, clamp, lerp, sstep, TAU, seaEnv } from './config.js';

const R = Math.random, rt = (a, b) => a + (b - a) * R();
const MAXF = window.__lite ? 700 : 1500;

function fishGeometry() {   // spindle body with a forked tail; nose at +Z
  const pts = [[0, .52], [.07, .45], [.15, .3], [.2, .08], [.19, -.12], [.12, -.3], [.05, -.42], [.09, -.5], [.15, -.58], [.0, -.5]].map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts, 6); g.rotateX(Math.PI / 2); g.rotateY(Math.PI);   // lathe axis Y -> Z
  return g;
}

export class FishWorld {
  constructor(S) {
    this.S = S; this.schools = []; this.t = 0; this.frame = 0; this.count = 0; this.events = [];
    const g = fishGeometry();
    g.setAttribute('aVis', new THREE.InstancedBufferAttribute(new Float32Array(MAXF), 1));
    this.visA = g.attributes.aVis; this.visA.setUsage(THREE.DynamicDrawUsage);
    this.flashA = new THREE.InstancedBufferAttribute(new Float32Array(MAXF), 1); this.flashA.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aFlash', this.flashA);
    this.uT = { value: 0 }; this.uL = { value: 1 };
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = this.uT; sh.uniforms.uL = this.uL;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aVis;attribute float aFlash;varying float vVis;varying float vFl;varying float vBelly;uniform float uT;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ph=float(gl_InstanceID)*1.7;transformed.x+=sin(uT*11.0+ph-position.z*7.0)*.10*smoothstep(.05,-.55,position.z);vVis=aVis;vFl=aFlash;vBelly=-normal.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vVis;varying float vFl;varying float vBelly;uniform float uL;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.8,.86,.9),smoothstep(.1,.8,vBelly)*.5)*uL;diffuseColor.rgb=mix(vec3(.02,.13,.2)*uL,diffuseColor.rgb,.5+.4*vVis);diffuseColor.rgb+=vec3(.9,.95,1.)*vFl*1.2;diffuseColor.a*=clamp(vVis+vFl*.6*vVis,0.,1.);');
    };
    this.mesh = new THREE.InstancedMesh(g, m, MAXF); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.count = 0;
    for (let i = 0; i < MAXF; i++) this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    S.scene.add(this.mesh);
    // school body: soft dark sprites, one per fish. A tight ball overlaps into one dark mass that shifts as the boids turn;
    // a loose school stays a thin shadow. Individual fish only resolve (3D mesh) when close and shallow.
    this.cPos = new Float32Array(MAXF * 3); this.cA = new Float32Array(MAXF); this.cS = new Float32Array(MAXF);
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(this.cPos, 3).setUsage(THREE.DynamicDrawUsage)); cg.setAttribute('aA', new THREE.BufferAttribute(this.cA, 1).setUsage(THREE.DynamicDrawUsage)); cg.setAttribute('aS', new THREE.BufferAttribute(this.cS, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 600 };
    const sprite = (additive, col) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: this.uScale, uCol: { value: new THREE.Color(col) } },
      vertexShader: 'attribute float aA;attribute float aS;uniform float uScale;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;vA=aA;gl_PointSize=clamp(aS*uScale/max(.3,-mv.z),1.,96.);}',
      fragmentShader: 'uniform vec3 uCol;varying float vA;void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,.05,d);a*=a;gl_FragColor=vec4(uCol,a*vA);}' });
    this.cloud = new THREE.Points(cg, sprite(false, 0x021a2a)); this.cloud.frustumCulled = false; this.cloud.renderOrder = 3; S.scene.add(this.cloud);
    this.gPos = new Float32Array(MAXF * 3); this.gA = new Float32Array(MAXF); this.gS = new Float32Array(MAXF);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(this.gPos, 3).setUsage(THREE.DynamicDrawUsage)); gg.setAttribute('aA', new THREE.BufferAttribute(this.gA, 1).setUsage(THREE.DynamicDrawUsage)); gg.setAttribute('aS', new THREE.BufferAttribute(this.gS, 1).setUsage(THREE.DynamicDrawUsage));
    this.glint = new THREE.Points(gg, sprite(true, 0xe8f6ff)); this.glint.frustumCulled = false; this.glint.renderOrder = 5; S.scene.add(this.glint);
    // leaping bait
    const NJ = 90; this.jp = new Float32Array(NJ * 3); this.jv = new Float32Array(NJ * 3); this.jl = new Float32Array(NJ).fill(-1);
    const jg = new THREE.BufferGeometry(); jg.setAttribute('position', new THREE.BufferAttribute(this.jp, 3));
    this.jumpers = new THREE.Points(jg, new THREE.PointsMaterial({ color: 0xeaf4ff, size: .09, sizeAttenuation: true, transparent: true, opacity: .95, depthWrite: false }));
    this.jumpers.frustumCulled = false; this.jumpers.renderOrder = 5; S.scene.add(this.jumpers); this.NJ = NJ; this.jn = 0;
    this.dummy = new THREE.Object3D(); this.col = new THREE.Color(); this.tmpV = new THREE.Vector3();
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
    const s = { sp, id: Math.random(), x, z, d, d0: d, heading: o.heading ?? R() * TAU, al: 0, fl: 0, fleeDir: 0, n, lone, fish: [], act: 0, actT: rt(3, 30), actOn: !!o.feeding, vx: 0, vz: 0, surf: 0, surfT: rt(10, 30), flick: 0, rad: lone ? 1.2 : Math.max(2.4, Math.sqrt(n) * (sp.len * 2.2 + .25)) , fleeT0: 0, born: this.t };
    if (o.feeding) { s.act = 1; s.actT = rt(50, 120); }
    for (let i = 0; i < n; i++) {
      const rr = s.rad * Math.sqrt(R()), a = R() * TAU, span = sp.pattern === 'ball' ? Math.min(s.rad * .3, 1.5) : lone ? .3 : 1.1;
      const f = { s, sp, ox: Math.cos(a) * rr, oz: Math.sin(a) * rr, ly: (R() - .5) * 2 * span, x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, y: -d, vx: 0, vy: 0, vz: 0, ph: R() * TAU, flash: 0, th: 0, lenK: rt(.85, 1.15), alpha: 0 };
      s.fish.push(f);
    }
    this.schools.push(s); return s;
  }
  totalFish() { let c = 0; for (const s of this.schools) c += s.fish.length; return c; }
  removeSchool(s) { if (s.patch) { this.S.scene.remove(s.patch); s.patch.material.dispose(); } this.schools.splice(this.schools.indexOf(s), 1); }
  clear() { [...this.schools].forEach((s) => this.removeSchool(s)); }

  initialWorld(boat) {
    const fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading), at = (d, ang) => { const a = Math.atan2(fz, fx) + ang; return [boat.position.x + Math.cos(a) * d, boat.position.z + Math.sin(a) * d]; };
    let p = at(52, -.18); this.spawnSchool('sardine', p[0], p[1], { depth: 1.1, feeding: true, heading: Math.atan2(fz, fx) + 1.2 });
    p = at(100, .6); this.spawnSchool('mackerel', p[0], p[1], { depth: 3.4, feeding: true });
    p = at(170, -1.1); this.spawnSchool('sardine', p[0], p[1], { depth: 1.5, feeding: true });
    p = at(75, 1.6); this.spawnSchool('cod', p[0], p[1], { depth: 11 });
    p = at(230, .3); this.spawnSchool('tuna', p[0], p[1], { depth: 5 });
    p = at(38, 2.4); this.spawnSchool('mullet', p[0], p[1], { depth: .9 });
    for (let i = 0; i < 7; i++) { const sp = this.pickSpecies(); const a = R() * TAU, d = rt(110, 380); this.spawnSchool(sp, boat.position.x + Math.cos(a) * d, boat.position.z + Math.sin(a) * d, { feeding: sp.depth[1] < 4 && R() < .5 }); }
    for (let i = 0; i < 9; i++) { const sp = R() < .6 ? SPECIES.mullet : SPECIES.seabass; const a = R() * TAU, d = rt(25, 220); this.spawnSchool(sp, boat.position.x + Math.cos(a) * d, boat.position.z + Math.sin(a) * d, { lone: true, n: 1 + (R() * 2 | 0) }); }
  }

  /* ------------ queries for nets / gulls ------------ */
  fishNear(x, z, r, maxDepth = 14) { const out = []; for (const s of this.schools) { if (Math.hypot(s.x - x, s.z - z) > r + s.rad + 3) continue; for (const f of s.fish) if (f.y > -maxDepth && Math.hypot(f.x - x, f.z - z) < r) out.push(f); } return out; }
  removeFish(list) { const set = new Set(list); for (const s of this.schools) { if (s.fish.some((f) => set.has(f))) s.fish = s.fish.filter((f) => !set.has(f)); } this.schools.filter((s) => s.fish.length === 0).forEach((s) => this.removeSchool(s)); }
  scare(x, z, r, amt, dive = true) { for (const s of this.schools) { const d = Math.hypot(s.x - x, s.z - z); if (d < r + s.rad) { s.al += amt * (1 - clamp(d / (r + s.rad), 0, 1) * .6) * (.4 + s.sp.shy); if (s.al >= 1) this.flee(s, x, z); } } }
  flee(s, tx, tz) {
    if (s.fl > 0) return; s.fl = rt(6, 10); s.al = 0; s.fleeT0 = this.t; s.fleeDir = Math.atan2(s.z - tz, s.x - tx);
    this.events.push({ type: 'flee', school: s, x: s.x, z: s.z });
  }
  /* shallow & actively feeding = what gulls dive on */
  isShallowFeeding(s) { return !s.lone && s.act > .45 && s.d < 3.6; }

  /* ------------ visibility: distance, depth, clarity, light/sun angle, weather, sea state ------------ */
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
    this.t += dt; this.frame++; this.uT.value = this.t;
    const S = this.S, boat = ctx.boat, env = seaEnv(), cam = S.camera.position;
    this.uL.value = .18 + .82 * env.light;
    const bx = boat.position.x, bz = boat.position.z, fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading);
    const noise = ctx.noise;   // 0..~1.5 : speed, engine, wake, towing
    let wi = 0; const cur = env.current;
    for (let si = this.schools.length - 1; si >= 0; si--) {
      const s = this.schools[si], sp = s.sp, dB = Math.hypot(s.x - bx, s.z - bz);
      if (dB > 460) { this.removeSchool(s); this.respawn(boat); continue; }
      /* activity (feeding) cycle */
      s.actT -= dt; if (s.actT <= 0) { if (sp.depth[0] < 4 && !s.lone) { s.actOn = !s.actOn; s.actT = s.actOn ? rt(60, 130) : rt(15, 40); } else s.actT = 30; }
      if (sp.pattern === 'surfacing') { s.surfT -= dt; if (s.surfT <= 0) { s.surf = s.surf > 0 ? 0 : rt(5, 8); s.surfT = s.surf > 0 ? s.surf : rt(25, 45); } }
      const actT = (s.actOn && s.fl <= 0 ? 1 : 0) * (s.d0 < 3.6 ? 1 : 0) + (s.surf > 0 ? 1 : 0); s.act += (clamp(actT, 0, 1) - s.act) * Math.min(1, dt * .5);
      /* alertness from boat noise, hull shadow and wake */
      const hear = 14 + 55 * noise * sp.shy, shadow = dB < 7 && s.d < 3 ? .09 : 0;
      if (dB < hear) s.al += ((noise * .55 + .03) * sp.shy * (1 - dB / hear) * 1.1 + shadow * sp.shy) * dt;
      s.al = Math.max(0, s.al - .1 * dt);
      if (s.al >= 1) this.flee(s, bx, bz);
      /* school motion */
      const pat = sp.pattern; let spd = sp.speed * .3, turn = (R() - .5) * dt * .9;
      if (s.fl > 0) { s.fl -= dt; const el = this.t - s.fleeT0; spd = sp.speed * (sp.flee === 'sprint' ? 3.4 : 2.4); let target = s.fleeDir;
        if (sp.flee === 'zigzag') target += Math.sin(el * 3.2) * .85; if (sp.flee === 'circle') { target = s.heading + dt * 1.8; spd = sp.speed * .8; } if (sp.flee === 'dive') spd = sp.speed * .6;
        let da = ((target - s.heading + Math.PI * 3) % TAU) - Math.PI; s.heading += da * Math.min(1, dt * 4);
        const dive = sp.dive * Math.min(el, 4) * (sp.flee === 'dive' ? 2.2 : 1) * .7; s.d += (clamp(s.d0 + dive + 1.5, 0, 12.6) - s.d) * Math.min(1, dt * 1.2);
        if (el < .8 && s.d < 3.5) this.splashAt(s.x + rt(-s.rad, s.rad), s.z + rt(-s.rad, s.rad), .1);
      } else {
        s.d += (s.d0 - (s.surf > 0 ? s.d0 - .45 : 0) - s.d) * Math.min(1, dt * .6);
        if (pat === 'ball') { spd = .12 + .1 * s.act; } else if (pat === 'circle') { turn = dt * .4; spd = sp.speed * .35; } else if (pat === 'lurk') { spd = .15; }
        else if (pat === 'surfacing' && s.surf > 0) { spd = sp.speed * 1.4; turn = (R() - .5) * dt * 2.2; }
        s.heading += turn;
      }
      s.vx = Math.cos(s.heading) * spd + fx * 0 + cur * .3; s.vz = Math.sin(s.heading) * spd + cur * .15; s.x += s.vx * dt; s.z += s.vz * dt;
      const compact = pat === 'ball' ? (1 - .35 * s.act) : 1;
      /* boids */
      const F = s.fish, n = F.length; let cx = 0, cz = 0; for (let i = 0; i < n; i += 3) { cx += F[i].x; cz += F[i].z; } const k3 = Math.ceil(n / 3); cx /= k3; cz /= k3;
      const fleeing = s.fl > 0, vmax = sp.speed * (fleeing ? (sp.flee === 'sprint' ? 3.2 : 2.7) : 1.15);
      for (let i = 0; i < n; i++) {
        const f = F[i]; let ax = 0, az = 0, ay = 0;
        // goal: stay with school position + own offset (cohesion), school velocity
        const gx = s.x + f.ox * compact, gz = s.z + f.oz * compact;
        const cohK = pat === 'ball' ? 2.4 : fleeing ? 2.2 : 1.4; ax += (gx - f.x) * cohK; az += (gz - f.z) * cohK; ax += (cx - s.x) * 0; 
        // alignment & separation vs sampled neighbours
        let avx = 0, avz = 0;
        for (let k = 0; k < 4; k++) {
          const j = (i + 1 + ((i * 7 + k * 13 + this.frame * 3) % Math.max(1, n - 1))) % n; if (j === i) continue; const o = F[j];
          avx += o.vx; avz += o.vz; const dx = f.x - o.x, dz = f.z - o.z, d2 = dx * dx + dz * dz, sr = sp.len * 1.8;
          if (d2 < sr * sr && d2 > 1e-5) { const d = Math.sqrt(d2); const w = (sr - d) / sr * 6; ax += dx / d * w; az += dz / d * w; }
        }
        ax += (avx / 4 + s.vx - f.vx) * 1.1; az += (avz / 4 + s.vz - f.vz) * 1.1;
        // individual predator avoidance: boat hull, bow wave and its shadow
        const bdx = f.x - bx, bdz = f.z - bz, bd = Math.hypot(bdx, bdz);
        if (bd < 9 && f.y > -6) { const w = (9 - bd) / 9; ax += bdx / (bd + .1) * w * 5 * sp.shy; az += bdz / (bd + .1) * w * 5 * sp.shy; if (bd < 5) s.al += .02 * dt * 60 * w * dt * sp.shy; }
        if (ctx.netThreat && ctx.netThreat.r) { const nx = f.x - ctx.netThreat.x, nz = f.z - ctx.netThreat.z, nd = Math.hypot(nx, nz); if (nd < ctx.netThreat.r * 2 && f.y > -(ctx.netThreat.depth + 3)) { const w = 1 - nd / (ctx.netThreat.r * 2); ax += nx / (nd + .1) * w * 9; az += nz / (nd + .1) * w * 9; } }
        if (fleeing && sp.flee === 'burst') { const sx = f.x - s.x, sz = f.z - s.z, sd = Math.hypot(sx, sz) + .1; ax += sx / sd * 2.5; az += sz / sd * 2.5; }
        if (pat === 'circle' && !fleeing) { const rx = f.x - s.x, rz = f.z - s.z; ax += -rz * .9; az += rx * .9; }
        const pvx = f.vx, pvz = f.vz;
        f.vx += ax * dt; f.vz += az * dt; const sm = Math.hypot(f.vx, f.vz); if (sm > vmax) { f.vx *= vmax / sm; f.vz *= vmax / sm; }
        f.x += f.vx * dt; f.z += f.vz * dt;
        // depth layering
        const ty = clamp(-(s.d + f.ly) + (fleeing && sp.flee !== 'dive' ? 0 : 0), -12.6, -.28), dv = (fleeing ? sp.dive * 1.4 : .7) * dt; f.vy = (ty - f.y); f.y += clamp(ty - f.y, -dv, dv);
        // turning flash
        const a0 = Math.atan2(pvx, pvz), a1 = Math.atan2(f.vx, f.vz); let dth = Math.abs(((a1 - a0 + Math.PI * 3) % TAU) - Math.PI);
        f.th = dth / Math.max(dt, 1e-3);
        if (f.th > 3.5 && sm > .25 && R() < (fleeing ? .12 : .035) + s.act * .03) f.flash = 1;
        f.flash = Math.max(0, f.flash - dt * 3.2);
      }
      /* surface cues */
      if (s.d < 3.2 && dB < 320) {
        const rate = (s.act * 16 * Math.min(1, s.fish.length / 60) + (s.fl > 0 && s.d < 3 ? 8 : 0)) * (s.lone ? .3 : 1); s._acc = (s._acc || 0) + rate * dt;
        while (s._acc > 1) { s._acc--; const a = R() * TAU, rr = s.rad * Math.sqrt(R()) * .9; this.splashAt(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr, rt(.07, .2)); }
        if (s.act > .5 && R() < dt * 2.2 * s.act * (sp.pattern === 'ball' ? 1.4 : 1)) this.jump(s.x + rt(-1, 1) * s.rad * .8, s.z + rt(-1, 1) * s.rad * .8);
      }
    }
    this.updateInstances(cam, env);
    this.updateJumpers(dt);
  }
  respawn(boat) {
    const sp = this.pickSpecies(); const fx = -Math.sin(boat.heading), fz = -Math.cos(boat.heading), a = Math.atan2(fz, fx) + rt(-1.7, 1.7), d = rt(180, 380);
    this.spawnSchool(sp, boat.position.x + Math.cos(a) * d, boat.position.z + Math.sin(a) * d, { feeding: sp.depth[1] < 4 && R() < .55 });
  }
  splashAt(x, z, k) { if (this.S.splash) this.S.splash(x, z, k); }
  jump(x, z) { for (let t = 0; t < 4; t++) { const i = (this.jn++) % this.NJ; if (this.jl[i] > 0) continue; this.jp.set([x, -.05, z], i * 3); this.jv.set([rt(-1.2, 1.2), rt(2.2, 3.6), rt(-1.2, 1.2)], i * 3); this.jl[i] = 1; break; } }
  updateJumpers(dt) {
    for (let i = 0; i < this.NJ; i++) { if (this.jl[i] < 0) { this.jp[i * 3 + 1] = -50; continue; } const o = i * 3; this.jv[o + 1] -= 9.8 * dt; this.jp[o] += this.jv[o] * dt; this.jp[o + 1] += this.jv[o + 1] * dt; this.jp[o + 2] += this.jv[o + 2] * dt;
      if (this.jp[o + 1] < 0 && this.jv[o + 1] < 0) { this.splashAt(this.jp[o], this.jp[o + 2], .06); this.jl[i] = -1; } }
    this.jumpers.geometry.attributes.position.needsUpdate = true;
  }
  updateInstances(cam, env) {
    const m = this.mesh, d = this.dummy, col = this.col; let i = 0, ci = 0, gi = 0;
    const va = this.visA.array, fa = this.flashA.array, cp = this.cPos, ca = this.cA, cs = this.cS, gp = this.gPos, ga = this.gA, gs = this.gS;
    const sz = this.S.renderer.getSize(this.tmpS || (this.tmpS = new THREE.Vector2())); this.uScale.value = sz.y * this.S.renderer.getPixelRatio() * .5 / Math.tan(this.S.camera.fov * Math.PI / 360);
    for (const s of this.schools) {
      for (const f of s.fish) {
        if (i >= MAXF) break;
        const dd = Math.hypot(f.x - cam.x, f.z - cam.z);
        const vis = dd > 300 ? 0 : this.visibility(f.x, -f.y, f.z, cam, env);
        const visBody = dd > 300 ? 0 : this.visibility(f.x, -f.y, f.z, cam, env, true);   // the blurred mass is seen further / deeper than a single fish
        const flashVis = f.flash > 0 ? this.visibility(f.x, Math.max(0, -f.y * .35), f.z, cam, env) : 0;
        f.alpha = vis; const close = 1 - sstep(9, 24, dd), a = clamp(vis * 3.2, 0, 1) * close;
        va[i] = a; fa[i] = f.flash * clamp(flashVis * 3, 0, 1) * close;
        const L = f.sp.len * f.lenK, sc = Math.max(L, dd > 25 ? L * 1.6 : L);
        d.position.set(f.x, f.y, f.z); d.rotation.set(-clamp(f.vy * .2, -.5, .5), Math.atan2(f.vx, f.vz), Math.sin(this.t * 3 + f.ph) * .04, 'YXZ');
        d.scale.set(sc * .3 * 1.5, sc * .5 * 1.5, sc * 1.5); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        col.setHex(f.sp.color); m.setColorAt(i, col); i++;
        const al = clamp(visBody * 1.6, 0, .55) * (1 - .4 * close);
        if (al > .004) { cp[ci * 3] = f.x; cp[ci * 3 + 1] = f.y; cp[ci * 3 + 2] = f.z; ca[ci] = al; cs[ci] = L * 5 + dd * .014 + .15; ci++; }
        if (f.flash > .05 && flashVis > .01) { gp[gi * 3] = f.x; gp[gi * 3 + 1] = f.y + .05; gp[gi * 3 + 2] = f.z; ga[gi] = clamp(f.flash * flashVis * 7, 0, 1); gs[gi] = L * 1.5 + dd * .006 + .06; gi++; }
      }
    }
    m.count = i; this.count = i; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; this.visA.needsUpdate = true; this.flashA.needsUpdate = true;
    const cg = this.cloud.geometry, gg = this.glint.geometry; cg.setDrawRange(0, ci); gg.setDrawRange(0, gi);
    cg.attributes.position.needsUpdate = cg.attributes.aA.needsUpdate = cg.attributes.aS.needsUpdate = true; gg.attributes.position.needsUpdate = gg.attributes.aA.needsUpdate = gg.attributes.aS.needsUpdate = true;
  }
}
