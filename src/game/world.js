// @ts-nocheck
/* The game controller: deck mode, auto-creep, camera assist, throws, nets in the world, scenario building for the 2D games, economy. */
import * as THREE from 'three';
import { SPECIES, BOATS, METHODS, clamp, sstep, TAU, seaEnv, lerp } from './config.js';
import { genNet, compat, retention, estimatePool } from './netgen.js';
import { FishWorld } from './fish.js';
import { Gulls } from './gulls.js';
import { CastNet, WallNet, TrawlRig } from './nets3d.js';
import { store } from './store.js';

const R = Math.random, V3 = THREE.Vector3;
const CREEP = [.8, .55, .3, 0];            // power levels (m/s). Forward only; the player can only go down to a full stop.
const wrap = (a) => ((a + Math.PI * 3) % TAU) - Math.PI;
export const CAST_MAX_DEPTH = 6.5;           // cast nets only reach shallow schools

/* --------------------------- tiny synthesized audio (warm feedback) --------------------------- */
let AC = null, eng = null;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = 40; f.type = 'lowpass'; f.frequency.value = 160; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(AC.destination); o.start(); eng = { o, g, f }; } catch (e) {} } return AC; }
export function chime(kind = 'good') { const a = audio(); if (!a) return; const notes = kind === 'good' ? [523, 659, 784, 1046] : kind === 'perfect' ? [659, 784, 988, 1319, 1568] : kind === 'soft' ? [392, 330] : [440]; notes.forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f; const t = a.currentTime + i * .09; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.07, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .5); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .55); }); }
export function tick(kind) { const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = kind === 'bad' ? 180 : 700 + Math.random() * 300; g.gain.setValueAtTime(.05, a.currentTime); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .12); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .13); }

export class World {
  constructor(S) {
    this.S = S; this.boat = S.boat; this.fw = new FishWorld(S); this.fw.initialWorld(S.boat); this.gulls = new Gulls(S, this.fw);
    this.t = 0; this.charging = false; this.chargeT = 0; this.cast = null; this.cd = 0; this.rig = null; this.wall = null; this.gill = []; this.seineState = 'idle';
    this.assist = null; this.assistCd = 0; this.dragLook = false; this.pointerLocked = false; this.lastNoise = 0; this.dragK = 1; this.catchStreak = 0;
    this.nets = {}; this.refreshNets(true); this.gameActive = false; this.castSpot = new V3();
    S.onFrame = (dt) => this.tick(dt);
    this.bindInput(); S.setMode(6); store.set({ started: true, camMode: 6 }); this.applyControls();
  }
  get boatDef() { return BOATS[store.get().boatId]; }
  equipPrice(type, price) { const st = store.get(), n = genNet(type, price); const old = st.nets[type]; const cost = st.free ? 0 : n.price; if (cost > st.cash) return this.toast('Not enough cash for that net — switch on Free test mode or pick a cheaper price'); n.meshIdx = old ? Math.min(old.meshIdx, 2) : 1; store.set({ nets: { ...st.nets, [type]: n }, cash: st.cash - cost }); this.afterGear(); this.toast(`${n.name} equipped · ${n.sizeLabel} · ${n.weight.toFixed(1)} kg`); }
  refreshNets(init) { if (!init) return; const d = { cast: 180, trawl: 1800, seine: 6000, gill: 900 }; const nets = {}; for (const k in d) nets[k] = genNet(k, d[k]); store.set({ nets }); this.afterGear(); }
  net() { const s = store.get(); return s.nets[s.method]; }
  afterGear() { const s = store.get(), n = s.nets[s.method]; if (!n) return; const c = compat(n, this.boatDef); store.set({ compatWarn: c.warning, compatLabel: c.label, compatOver: c.over }); }
  setBoat(id) { store.set({ boatId: id }); this.afterGear(); this.toast(`Boat: ${BOATS[id].name}`); }
  setMethod(m) { store.set({ method: m }); this.afterGear(); this.applyControls(); this.toast(METHODS[m].name + (m === 'cast' && this.S.getMode() !== 6 ? ' — step onto the deck (B) to throw it' : '')); }
  cycleMethod() { const l = Object.keys(METHODS), s = store.get(); this.setMethod(l[(l.indexOf(s.method) + 1) % l.length]); }
  cycleMesh() { const s = store.get(), n = { ...s.nets[s.method] }; n.meshIdx = (n.meshIdx + 1) % 3; store.set({ nets: { ...s.nets, [s.method]: n } }); this.toast(`Mesh ${n.mesh[n.meshIdx]} mm`); }
  toast(t) { store.set({ toast: { t, id: Math.random() } }); }
  goDeck() { this.S.setMode(6); store.set({ camMode: 6 }); this.applyControls(); }

  /* --------------------------- controls: deck mode + auto-creep --------------------------- */
  onDeckCast() { return this.S.getMode() === 6 && store.get().method === 'cast'; }
  applyControls() {
    const C = this.S.CTL, st = store.get(), onDeck = this.S.getMode() === 6;
    store.set({ camMode: this.S.getMode() });
    if (onDeck && st.method === 'cast') { C.override = true; C.power = st.creep.on ? CREEP[st.creep.level] : 0; C.turn = st.creep.on && C.power > 0 ? .3 : 0; }
    else { C.override = false; C.turn = 0; }
  }
  toggleCreep() { if (!this.onDeckCast()) return this.toast('Auto-Creep works while you stand on deck holding the cast net'); const c = store.get().creep; store.set({ creep: { on: !c.on, level: 0 } }); this.applyControls(); this.toast(!c.on ? 'Auto-Creep on — slow forward drift. S / Space slows to a stop' : 'Auto-Creep off — drifting'); }
  creepSlower() { const c = store.get().creep; if (!c.on) return; store.set({ creep: { on: true, level: Math.min(3, c.level + 1) } }); this.applyControls(); }

  bindInput() {
    const cv = this.S.renderer.domElement, S = this.S;
    cv.addEventListener('pointerdown', (e) => { audio(); if (S.getMode() !== 6) return; if (e.button === 0) { if (!this.pointerLocked && !('ontouchstart' in window)) { try { cv.requestPointerLock && cv.requestPointerLock(); } catch (x) {} } this.dragLook = true; if (this.pointerLocked) this.beginCharge(); } });
    addEventListener('pointerup', (e) => { this.dragLook = false; if (this.pointerLocked && e.button === 0) this.release(); });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === cv; });
    addEventListener('pointermove', (e) => {
      if (S.getMode() !== 6 || this.gameActive) return; const mx = e.movementX || 0, my = e.movementY || 0; if (Math.abs(mx) + Math.abs(my) < 1) return;
      if (this.pointerLocked || this.dragLook) { if (this.assist) this.cancelAssist(); const k = this.pointerLocked ? .0024 : .004; S.DECK.yaw = clamp(S.DECK.yaw - mx * k, -2.6, 2.6); S.DECK.pitch = clamp(S.DECK.pitch - my * k, -1.0, .6); }
    });
    addEventListener('keydown', (e) => {
      if (e.repeat || this.gameActive) return; audio(); const c = e.code;
      if (c === 'KeyF') this.beginCharge(); else if (c === 'KeyG') this.haul(); else if (c === 'KeyN') this.cycleMethod(); else if (c === 'KeyT') this.cycleMesh(); else if (c === 'KeyV') this.toggleCreep();
      else if (c === 'KeyB') this.goDeck(); else if (c === 'KeyH') this.sell(); else if (c === 'KeyZ') store.set({ workshop: !store.get().workshop }); else if (c === 'KeyJ') this.soak(); else if (c === 'KeyK') store.set({ help: !store.get().help });
      else if (c === 'KeyS' || c === 'Space' || c === 'ArrowDown') { if (this.onDeckCast() && store.get().creep.on) this.creepSlower(); }
      else if (c === 'KeyQ' && this.rig) { this.rig.warp = clamp(this.rig.warp + 10, 25, 140); } else if (c === 'KeyE' && this.rig) { this.rig.warp = clamp(this.rig.warp - 10, 25, 140); }
      else if (c === 'KeyC' || /^Digit[1-7]$/.test(c) || c === 'KeyR') setTimeout(() => this.applyControls(), 30);
    });
    addEventListener('keyup', (e) => { if (e.code === 'KeyF') this.release(); });
  }

  /* --------------------------- actions --------------------------- */
  beginCharge() {
    if (this.gameActive) return; const m = store.get().method;
    if (m === 'cast') { if (this.S.getMode() !== 6) return this.toast('The cast net can only be thrown while standing on the deck (press B).'); if (this.cast || this.cd > 0) return this.toast('Net is still out — haul it in (G)'); this.charging = true; this.chargeT = 0; this.cancelAssist(); }
    else if (m === 'trawl') this.setTrawl(); else if (m === 'seine') this.setSeine(); else this.setGill();
  }
  release() { if (!this.charging) return; this.charging = false; const st = store.get(); store.set({ charge: null }); this.throwCast(this.meter); }
  deckEyeWorld() { return this.S.hullG.localToWorld(this.S.DECK.eye.clone()); }
  throwCast(m) {
    const net = this.net(), S = this.S, comp = compat(net, this.boatDef), q = 1 - clamp(Math.abs(m - .8) / .5, 0, 1);
    const base = clamp(8.3 - net.weight * .5, 4.2, 8), dist = clamp(base * (.6 + .4 * clamp(m / .8, 0, 1)) * (comp.over > 1.1 ? .92 : 1), 4, 8);
    const eye = this.deckEyeWorld(), yaw = S.boat.heading + S.DECK.yaw, dir = new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const hand = eye.clone().add(new V3(0, -.35, 0)).addScaledVector(dir, .35);
    this.lastThrow = { q, dist, m };
    this.cast = new CastNet(S, { ...net }, net.meshIdx, hand, dir, dist, q, comp, (cn) => this.onLand(cn, q));
    this.gulls.event('throw', hand.x + dir.x * dist, hand.z + dir.z * dist);
    this.cd = 1; tick('good');
    this.toast(q > .85 ? 'Lovely release — the net blooms wide' : q > .5 ? 'Decent throw' : 'Rushed throw — the net is folding. Watch the rhythm next time');
  }
  /* net lands -> simulate the fish actually under it -> start the 2D game */
  onLand(cn, q) {
    const fp = cn.footprint, fw = this.fw, net = cn.net, env = seaEnv(), comp = compat(net, this.boatDef);
    fw.scare(fp.cx, fp.cz, 7 + net.radius, .9);
    this.gulls.event('escape', fp.cx, fp.cz);
    const inside = fw.fishNear(fp.cx, fp.cz, Math.max(fp.effR, net.radius * .5) * 1.18, 13), seabed = Math.max(14, 1.3 * (this.S.P.hs || 0) + 6);
    let near = null, nd = 1e9; for (const s of fw.schools) { const d = Math.hypot(s.x - fp.cx, s.z - fp.cz); if (d < nd) { nd = d; near = s; } }
    const lab = !near ? 'miss' : nd < near.rad * .4 ? 'direct hit' : nd < near.rad + fp.effR * .6 ? 'edge hit' : 'miss';
    const MAXP = 72, mult = Math.max(1, inside.length / MAXP), picks = inside.length > MAXP ? inside.filter((_, i) => R() < MAXP / inside.length) : inside;
    const pool = picks.map((f) => ({ ref: f, sp: f.sp.id, len: f.sp.len * f.lenK, depth: -f.y, x: (f.x - fp.cx) / Math.max(net.radius, .5), z: (f.z - fp.cz) / Math.max(net.radius, .5), speed: f.sp.speed, panic: f.sp.panic, dive: f.sp.dive, flee: f.sp.flee, shy: f.sp.shy }));
    const deepNear = near && near.d > CAST_MAX_DEPTH && nd < near.rad + net.radius;
    this.pending = { type: 'cast', net, meshIdx: net.meshIdx, comp, env, pool, mult, effR: fp.effR, R: net.radius, openFrac: fp.openFrac, holes: fp.holes, quality: q, sinkRate: net.sinkRate, seabed, label: lab, boatSpeed: Math.abs(this.boat.speed), noise: this.lastNoise, deepNear: !!deepNear, closeBoost: 1 };
    this.gameActive = true; this.cd = 5; store.set({ game: this.pending, estimate: { ...estimatePool(pool.map((p) => p), net, net.meshIdx, .7), fish: Math.round(estimatePool(pool, net, net.meshIdx, .7).fish * mult), value: Math.round(estimatePool(pool, net, net.meshIdx, .7).value * mult) } });
  }
  haul() {
    const m = store.get().method;
    if (m === 'cast') { if (this.cast && !this.gameActive) { this.cast.hauling = true; this.toast('Hauling the net in…'); } else if (!this.cast) this.toast('Nothing to haul'); }
    else if (m === 'trawl') this.haulTrawl(); else if (m === 'seine') this.haulSeine(); else this.haulGill();
  }
  /* ---------- trawl ---------- */
  setTrawl() { if (this.rig) { return this.toast('Trawl already out — tow, then haul (G). Q/E adjust the warp'); } const net = this.net(), comp = compat(net, this.boatDef); this.rig = new TrawlRig(this.S, net, net.meshIdx, comp); this.rigT = 0; store.set({ rig: { type: 'trawl' } }); this.toast(`Trawl set. ${comp.warning ? 'The boat feels it already… ' : ''}Tow at 2–4 knots, Q/E for warp length, G to haul.`); }
  haulTrawl() {
    if (!this.rig) return this.toast('Set the trawl first (F)'); const r = this.rig, net = r.net, comp = r.comp, env = seaEnv(), seabed = Math.max(14, 1.3 * (this.S.P.hs || 0) + 6);
    const bag = r.bag, pool = bag.map((b) => ({ ref: b.f, sp: b.f.sp.id, len: b.f.sp.len * b.f.lenK, depth: b.depth, speed: b.f.sp.speed, shy: b.f.sp.shy }));
    this.pending = { type: 'trawl', net, meshIdx: net.meshIdx, comp, env, pool, mult: 1, opening: r.opening, W: r.W || net.mouthW, H: r.H || net.mouthH, depth: r.depth, seabed, towSpeed: this.towAvg || 1, boatSpeed: Math.abs(this.boat.speed), seaDiff: env.seaDiff, rigTime: this.rigT };
    this.gameActive = true; store.set({ game: this.pending, estimate: { ...estimatePool(pool, net, net.meshIdx, .75), diff: 0 } });
  }
  /* ---------- purse seine ---------- */
  setSeine() {
    const net = this.net(); if (this.wall && this.seineState === 'laying') { return this.closeSeine('manual'); } if (this.wall) return this.toast('A seine is already out — G to purse, or finish it first');
    this.wall = new WallNet(this.S, net, net.meshIdx, 'seine'); this.seineState = 'laying'; this.wall.add(...this.stern(3.4)); this.seineStart = this.stern(3.4); this.laidL = 0;
    this.toast('Laying the seine — steer a wide circle around the school and come back to the start buoy (F to close early)'); store.set({ rig: { type: 'seine' } });
  }
  stern(k = 3.6, sd = 0) { const h = this.boat.heading; return [this.boat.position.x + Math.sin(h) * k, this.boat.position.z + Math.cos(h) * k]; }
  closeSeine(why) {
    const w = this.wall, net = w.net; this.seineState = 'closed'; const pts = w.pts, n = pts.length; let cx = 0, cz = 0; pts.forEach((p) => { cx += p.x; cz += p.z; }); cx /= n; cz /= n; w.cx = cx; w.cz = cz;
    const a = pts[0], b = pts[n - 1], gap = Math.hypot(a.x - b.x, a.z - b.z), L = w.length(), inPoly = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) if ((pts[i].z > z) !== (pts[j].z > z) && x < (pts[j].x - pts[i].x) * (z - pts[i].z) / (pts[j].z - pts[i].z) + pts[i].x) c = !c; return c; };
    const fish = []; for (const s of this.fw.schools) { if (Math.hypot(s.x - cx, s.z - cz) > L / 2 + 40) continue; for (const f of s.fish) if (-f.y < net.depth * .92 && inPoly(f.x, f.z) && (s.fl <= 0 || R() < .35)) fish.push(f); }
    const MAXP = 90, mult = Math.max(1, fish.length / MAXP), picks = fish.length > MAXP ? fish.filter(() => R() < MAXP / fish.length) : fish;
    const env = seaEnv(), comp = compat(net, this.boatDef), pool = picks.map((f) => ({ ref: f, sp: f.sp.id, len: f.sp.len * f.lenK, depth: -f.y, speed: f.sp.speed, shy: f.sp.shy, a: R() * TAU, r: Math.sqrt(R()) }));
    this.seineData = { pool, mult, gap, L, circ: L, diam: L / Math.PI, comp, env, net, depthOK: net.depth };
    store.set({ estimate: { ...estimatePool(pool, net, net.meshIdx, .8), fish: Math.round(estimatePool(pool, net, net.meshIdx, .8).fish * mult), value: Math.round(estimatePool(pool, net, net.meshIdx, .8).value * mult), diff: clamp(.25 + .4 * comp.strain / 1.6 + .25 * env.seaDiff + gap / 60, 0, 1) } });
    this.toast(gap > 30 ? `Ring closed with a ${gap.toFixed(0)} m gap — fish will leak. Purse it quickly (G)` : `Ring closed around ${Math.round(fish.length)} fish — G to start pursing`);
    this.gulls.event('escape', cx, cz);
  }
  haulSeine() {
    if (!this.wall) return this.toast('Lay the seine around a school first (F)'); if (this.seineState === 'laying') return this.closeSeine('manual'); const d = this.seineData;
    this.pending = { type: 'seine', net: d.net, meshIdx: d.net.meshIdx, comp: d.comp, env: d.env, pool: d.pool, mult: d.mult, gap: d.gap, L: d.L, seabed: 14 }; this.gameActive = true; store.set({ game: this.pending });
  }
  /* ---------- gillnet ---------- */
  setGill() {
    const net = this.net(); if (this.layingGill) { this.layingGill = null; return this.toast('Gillnet set. Sail off; J soaks 3 hours; haul with G beside it'); }
    const w = new WallNet(this.S, net, net.meshIdx, 'gill'); w.add(...this.stern(3.4)); w.hours = 0; w.laid = 0; w.hp = 100; this.gill.push(w); this.layingGill = w; this.toast('Laying the gillnet — drive straight; F again to finish'); store.set({ rig: { type: 'gill' } });
  }
  soak() {
    if (!this.gill.length) return this.toast('Set a gillnet first (method Gill, F)'); this.layingGill = null; for (const w of this.gill) { w.hours += 3; }
    this.S.P.hour = (this.S.P.hour + 3) % 24; this.toast('3 hours pass quietly… the nets fish'); store.set({ estimate: this.gillEstimate() });
  }
  gillCatchPool(w) {
    const net = w.net, c = w.pts[Math.floor(w.pts.length / 2)] || w.pts[0], pool = []; if (!c) return pool;
    const night = this.S.U.uNight.value, hrs = Math.max(w.hours, 0), L = w.length();
    for (const s of this.fw.schools) {
      const d = Math.hypot(s.x - c.x, s.z - c.z); if (d > 260) continue; const sp = s.sp;
      const ov = Math.max(0, Math.min(net.depth, sp.depth[1]) - Math.max(.3, sp.depth[0])) / Math.max(.5, sp.depth[1] - sp.depth[0]);
      const enc = ov * Math.exp(-d / 110) * (L / 120) * (1 + .6 * night) * Math.min(hrs, 9) / 3 * (s.lone ? .25 : 1);
      const k = Math.min(s.fish.length * .5, Math.round(s.fish.length * enc * .22)); for (let i = 0; i < k; i++) { const f = s.fish[i % s.fish.length]; pool.push({ ref: null, sp: sp.id, len: sp.len * f.lenK, depth: Math.min(net.depth, -f.y), speed: sp.speed, shy: sp.shy, tangle: 1 + (R() * 2 | 0) }); }
    }
    return pool.slice(0, 80);
  }
  gillEstimate() { const w = this.gill[0]; if (!w) return null; const pool = this.gillCatchPool(w), net = w.net, e = estimatePool(pool, net, net.meshIdx, .8); return { ...e, diff: .4 }; }
  haulGill() {
    const [x, z] = this.stern(0); const w = this.gill.find((g) => g.pts.some((p) => Math.hypot(p.x - x, p.z - z) < 40)); if (!w) return this.toast('Get within 40 m of a gillnet to haul it'); this.layingGill = null;
    const net = w.net, env = seaEnv(), comp = compat(net, this.boatDef), pool = this.gillCatchPool(w); const bycatch = R() < .12 * Math.min(w.hours / 6, 1.5) ? 1 + (R() * 2 | 0) : 0;
    this.pending = { type: 'gill', net, meshIdx: net.meshIdx, comp, env, pool, mult: 1, hours: w.hours, bycatch, wall: w, seabed: 14 }; this.gameActive = true; store.set({ game: this.pending, estimate: this.gillEstimate() });
  }

  /* --------------------------- game finished (called by React 2D games) --------------------------- */
  finishGame(res) {
    const g = this.pending, net = g.net; this.gameActive = false; this.pending = null;
    const caught = res.caught || {}; let n = 0, v = 0; const hold = { ...store.get().hold };
    for (const k in caught) { n += caught[k]; v += caught[k] * SPECIES[k].value; hold[k] = (hold[k] || 0) + caught[k]; }
    // remove the actual fish from the world
    if (g.pool && res.caughtIdx) { const refs = res.caughtIdx.map((i) => g.pool[i] && g.pool[i].ref).filter(Boolean); this.fw.removeFish(refs); if (g.mult > 1) { const extra = Math.round(refs.length * (g.mult - 1)); const c = g.net.type === 'cast' && this.cast ? this.cast.footprint : null; if (c) this.fw.removeFish(this.fw.fishNear(c.cx, c.cz, c.effR, 14).slice(0, extra)); } }
    if (g.type === 'cast' && this.cast) { this.cast.hauling = true; }
    if (g.type === 'trawl') { this.rig.dispose(); this.rig = null; store.set({ rig: null }); }
    if (g.type === 'seine') { this.fw.removeFish(g.pool.filter((p) => (res.caughtIdx || []).includes(g.pool.indexOf(p))).map((p) => p.ref)); this.wall.dispose(); this.wall = null; this.seineState = 'idle'; store.set({ rig: null }); }
    if (g.type === 'gill') { g.wall.dispose(); this.gill = this.gill.filter((w) => w !== g.wall); store.set({ rig: this.gill.length ? { type: 'gill' } : null }); }
    const streak = res.perfect ? store.get().streak + 1 : n > 0 ? store.get().streak : 0, bonus = 1 + Math.min(streak, 6) * .05; v *= bonus;
    const hv = store.get().holdValue + v; net.uses = (net.uses || 0) + 1;
    store.set({ hold, holdValue: hv, game: null, estimate: null, streak, best: Math.max(store.get().best, Math.round(v)), result: { ...res, n, value: Math.round(v), bonus, type: g.type, tip: res.tip, name: net.name } });
    if (n > 0) { chime(res.perfect ? 'perfect' : 'good'); if (v > 12 || n > 12) this.gulls.event('catch', this.boat.position.x, this.boat.position.z); } else chime('soft');
    this.applyControls();
  }
  sell() { const s = store.get(); if (!s.holdValue) return this.toast('The hold is empty'); const p = Math.round(s.holdValue); store.set({ cash: s.cash + p, hold: {}, holdValue: 0 }); chime('good'); this.toast(`Sold the catch for $${p}`); }

  /* --------------------------- per-frame --------------------------- */
  tick(dt) {
    if (this.paused && !this._manual) return;
    this.t += dt; const S = this.S, st = store.get(), boat = this.boat, C = S.CTL; this.cd = Math.max(0, this.cd - dt); this.assistCd = Math.max(0, this.assistCd - dt);
    const comp = this.net() ? compat(this.net(), this.boatDef) : { speedMul: 1, strain: 0, openMul: 1 };
    /* drag and engine: towing nets slow the boat visibly */
    let towK = 1, strain = 0;
    if (this.rig) { towK = comp.speedMul; strain = comp.strain; } if (this.wall && this.seineState === 'laying') { towK = Math.min(towK, clamp(1.05 - .35 * comp.strain, .3, 1)); strain = Math.max(strain, comp.strain * .6); }
    if (this.cast && this.cast.hauling) towK = Math.min(towK, .8);
    this.dragK += (towK - this.dragK) * Math.min(1, dt * 2); C.k = this.boatDef.vmaxK * this.dragK; this.strain = strain;
    if (eng && AC) { const pw = Math.abs(boat.power); eng.o.frequency.value += ((38 + pw * 7 + strain * 18) - eng.o.frequency.value) * .1; eng.g.gain.value += ((.012 + Math.min(pw / 8, 1) * .03 + strain * .02) * (document.hidden ? 0 : 1) - eng.g.gain.value) * .1; eng.f.frequency.value = 130 + strain * 140 + pw * 12; }
    /* noise that fish hear and feel: speed, engine, wake, towing */
    const spd = Math.abs(boat.speed), noise = (Math.pow(spd / 6, 1.4) + Math.abs(boat.power) / 8 * .35 + (this.rig ? .22 : 0) + strain * .3) * this.boatDef.noise; this.lastNoise = noise;
    const netThreat = this.cast && this.cast.landed ? { x: this.cast.P[0].x, z: this.cast.P[0].z, r: this.cast.R * .7, depth: this.cast.rimDepth() } : this.cast ? { x: this.cast.P[0].x, z: this.cast.P[0].z, r: this.cast.R * .5, depth: 0 } : null;
    this.fw.update(dt, { boat, noise, netThreat });
    for (const e of this.fw.events.splice(0)) { if (e.type === 'flee' && !this.gameActive) this.gulls.event('escape', e.x, e.z); }
    this.gulls.update(dt, boat);
    /* meter */
    if (this.charging) { this.chargeT += dt; this.meter = .5 - .5 * Math.cos(this.chargeT * TAU / 1.5); store.set({ charge: this.meter }); }
    /* cast net */
    if (this.cast) {
      const eye = this.deckEyeWorld(), hand = eye.add(new V3(0, -.5, 0)); this.cast.step(Math.min(dt, .05), hand);
      if (this.cast.done) { this.cast.dispose(); this.cast = null; this.cd = .5; if (!this.gameActive) store.set({ netState: null }); }
      else if (this.cast.landed && !this.gameActive && this.cast.state === 'water' && !this.cast.hauling && this.cast.sunkT > 20) this.cast.hauling = true;
    }
    /* trawl */
    if (this.rig) {
      const r = this.rig, sp = spd * C.k; r.update(dt, boat, sp, Math.max(14, 1.3 * (S.P.hs || 0) + 6)); this.rigT += dt; this.towAvg = lerp(this.towAvg || sp, sp, .02);
      if (r.deploy > .8 && sp > .5) { const ca = r.m, W = r.W, H = r.H, tx = r.m.tx, tz = r.m.tz; for (const f of this.fw.fishNear(ca.x, ca.z, W * .75 + 3, 14)) { const ax = (f.x - ca.x) * tx + (f.z - ca.z) * tz, lat = Math.abs((f.x - ca.x) * -tz + (f.z - ca.z) * tx); if (ax < -.4 || ax > sp * dt * 3 + 1.5 || lat > W / 2 || Math.abs(-f.y - r.depth) > H / 2 + .4) continue; const p = clamp(1 - f.sp.speed * 1.0 / (sp * 1.6 + .5), .04, .9) * r.opening; if (R() < p * dt * 8) { r.bag.push({ f, depth: -f.y }); f.s.fish = f.s.fish.filter((o) => o !== f); } } this.fw.schools.filter((s) => !s.fish.length).forEach((s) => this.fw.removeSchool(s)); }
      this.fw.scare(ca0(r).x, ca0(r).z, 30, noise * .4 * dt * 60 * .02);
      if (this.t % 1 < dt) { const e = estimatePool(r.bag.map((b) => ({ sp: b.f.sp.id })), r.net, r.net.meshIdx, .75); store.set({ estimate: { ...e, diff: clamp(.2 + .5 * comp.strain / 1.6 + .25 * seaEnv().seaDiff, 0, 1) }, netState: { text: `warp ${r.warp.toFixed(0)} m · depth ${r.depth.toFixed(1)} m · mouth ${(r.W || 0).toFixed(1)}×${(r.H || 0).toFixed(1)} m · ${(sp * 1.944).toFixed(1)} kn` } }); }
    }
    /* seine laying */
    if (this.wall) {
      const w = this.wall; w.update(dt);
      if (this.seineState === 'laying') { const [sx, sz] = this.stern(3.4), l = w.pts[w.pts.length - 1]; if (Math.hypot(sx - l.x, sz - l.z) > 5) { w.add(sx, sz); } const L = w.length(); if (this.t % 1 < dt) store.set({ netState: { text: `seine laid ${L.toFixed(0)} / ${w.net.length.toFixed(0)} m` } });
        const d0 = Math.hypot(sx - this.seineStart[0], sz - this.seineStart[1]); if ((L > 70 && d0 < 22 && L > w.net.length * .45) || L >= w.net.length) this.closeSeine('auto'); }
    }
    for (const g of this.gill) { if (g === this.layingGill) { const [sx, sz] = this.stern(3.4), l = g.pts[g.pts.length - 1]; if (Math.hypot(sx - l.x, sz - l.z) > 5) g.add(sx, sz); if (g.length() >= g.net.length) { this.layingGill = null; this.toast('Gillnet fully set. J soaks 3 hours'); } } g.update(dt); }
    this.updateAssist(dt);
    if (this.t % .5 < dt) { store.set({ speedKn: Math.abs(boat.speed * C.k) * 1.944 }); if (!this.cast && !this.rig && !this.wall && !this.gameActive && store.get().netState) store.set({ netState: null }); }
  }

  /* --------------------------- subtle school camera assist --------------------------- */
  castRange() { const net = store.get().nets.cast; return net ? clamp(8.3 - net.weight * .5, 4.2, 8) + net.radius * .6 : 9; }
  updateAssist(dt) {
    const S = this.S, D = S.DECK;
    if (this.assist) {
      const a = this.assist; a.t += dt; const w = sstep(0, .55, a.t) * (1 - sstep(1.45, 2, a.t));
      D.yaw = a.by + wrap(a.ty - a.by) * w; D.pitch = a.bp + (a.tp - a.bp) * w; if (a.t >= 2) { D.yaw = a.by; D.pitch = a.bp; this.assist = null; } return;
    }
    if (!this.onDeckCast() || this.charging || this.cast || this.gameActive) return;
    const eye = this.deckEyeWorld(), range = this.castRange();
    for (const s of this.fw.schools) {
      if (s.lone) continue; const d = Math.hypot(s.x - eye.x, s.z - eye.z);
      if (d > range + 8) { if (s._ass && this.t - s._ass > 12) s._ass = 0; continue; }
      if (s._ass || this.assistCd > 0 || d > range || s.d > CAST_MAX_DEPTH) continue;
      const n = s.fish.filter((f) => Math.hypot(f.x - eye.x, f.z - eye.z) < range && -f.y < CAST_MAX_DEPTH).length; if (n < 6) continue;
      s._ass = this.t; this.assistCd = 28; const th = Math.atan2(-(s.x - eye.x), -(s.z - eye.z));
      this.assist = { t: 0, by: D.yaw, bp: D.pitch, ty: wrap(th - S.boat.heading), tp: -Math.atan2(1.6 + s.d * .5, d) }; return;
    }
  }
  cancelAssist() { if (!this.assist) return; const D = this.S.DECK, a = this.assist; this.assist = null; /* keep current view, hand control back instantly */ void D; void a; }
  /* debug helper for screenshots */
  place(spId, dist, bearing, depth, feeding = true, n) { const b = this.boat, a = Math.atan2(-Math.cos(b.heading), -Math.sin(b.heading)) + bearing; return this.fw.spawnSchool(spId, b.position.x + Math.cos(a) * dist, b.position.z + Math.sin(a) * dist, { depth, feeding, n }); }
}
const ca0 = (r) => r.m;
