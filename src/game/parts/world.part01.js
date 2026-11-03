// @ts-nocheck
/* The game controller: deck mode, auto-creep, camera assist, throws, nets in the world, scenario building for the 2D games, economy. */
import * as THREE from 'three';
import { SPECIES, BOATS, METHODS, clamp, sstep, TAU, seaEnv, lerp } from './config.js';
import { genNet, compat, retention, estimatePool } from './netgen.js';
import { FishWorld } from './fish.js';
import { Gulls } from './gulls.js';
import { CastNet, WallNet, TrawlRig, Buoy } from './nets3d.js';
import { Walker, HELM } from './walk.js';
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
    this.t = 0; this.charging = false; this.chargeT = 0; this.cast = null; this.cd = 0; this.rig = null; this.wall = null; this.gill = []; this.seineState = 'idle'; this.dying = [];
    this.pointerLocked = false; this.lastNoise = 0; this.dragK = 1; this.walker = new Walker(); this.walking = false; this.keysDown = new Set(); this.auto = { power: 0, rudder: 0 };
    this.touch = { fwd: 0, strafe: 0, run: false }; this.sonar = { cols: [], ahead: null }; this.sonarT = 0; this.feed = []; this.trawlPending = false; this.nets = {}; this.refreshNets(true); this.gameActive = false; this.startAt = 0; this.coachT = 0;
    S.onFrame = (dt) => this.tick(dt);
    this.bindInput(); S.setMode(1); store.set({ started: true, camMode: 1, walking: false, auto: { ...this.auto } }); this.applyControls();
  }
  get boatDef() { return BOATS[store.get().boatId]; }
  equipPrice(type, price) { const st = store.get(), n = genNet(type, price); const old = st.nets[type]; const cost = st.free ? 0 : n.price; if (cost > st.cash) return this.toast('Not enough cash for that net — switch on Free test mode or pick a cheaper price'); n.meshIdx = old ? Math.min(old.meshIdx, 2) : 1; store.set({ nets: { ...st.nets, [type]: n }, cash: st.cash - cost }); this.afterGear(); this.toast(`${n.name} equipped · ${n.sizeLabel} · ${n.weight.toFixed(1)} kg`); }
  refreshNets(init) { if (!init) return; const d = { cast: 180, trawl: 1800, seine: 6000, gill: 900 }; const nets = {}; for (const k in d) nets[k] = genNet(k, d[k]); store.set({ nets }); this.afterGear(); }
  net() { const s = store.get(); return s.nets[s.method]; }
  afterGear() { const s = store.get(), n = s.nets[s.method]; if (!n) return; const c = compat(n, this.boatDef); store.set({ compatWarn: c.warning, compatLabel: c.label, compatOver: c.over }); }
  setBoat(id) { store.set({ boatId: id }); this.afterGear(); this.toast(`Boat: ${BOATS[id].name}`); }
  setMethod(m) {
    if (this.busy()) return this.toast('Finish or haul the current gear first');
    store.set({ method: m }); this.afterGear(); this.applyControls(); this.toast(METHODS[m].name + (m === 'cast' && !this.walking ? ' — stand up from the wheel (B) and walk onto the deck to throw it' : ''));
  }
  busy() { return !!(this.cast || this.rig || this.wall || this.layingGill || this.gameActive || this.startAt); }
  cycleMethod() { const l = Object.keys(METHODS), s = store.get(); this.setMethod(l[(l.indexOf(s.method) + 1) % l.length]); }
  cycleMesh() { const s = store.get(), n = { ...s.nets[s.method] }; n.meshIdx = (n.meshIdx + 1) % 3; store.set({ nets: { ...s.nets, [s.method]: n } }); this.toast(`Mesh ${n.mesh[n.meshIdx]} mm`); }
  toast(t) { store.set({ toast: { t, id: Math.random() } }); }

  /* --------------------------- leaving the wheel / walking the boat (first person) --------------------------- */
  goDeck() { if (this.walking) return this.sitDown(); this.S.setMode(6); this.syncMode(); }
  startWalk() {
    const S = this.S; this.walking = true; this.walker.reset(); S.DECK.yaw = 0; S.DECK.pitch = -.12; S.DECK.eye.set(this.walker.x, this.walker.eyeY, this.walker.z);
    this.keysDown.clear(); this.touch.fwd = this.touch.strafe = 0; this.S.setLever && this.S.setLever(0); this.auto.power = 0; this.auto.rudder = 0; this.applyControls();
    store.set({ walking: true, help: false, auto: { ...this.auto } }); this.toast(this.boat.speed > .3 ? 'You left the wheel — engine to idle, the boat coasts to a stop. Walk to the wheel (B) to drive again' : 'You left the wheel. The boat stays put. WASD walks · mouse looks · B at the wheel to sit back down');
  }
  endWalk() { this.walking = false; this.charging = false; this.keysDown.clear(); this.touch.fwd = this.touch.strafe = 0; store.set({ walking: false, charge: null }); this.applyControls(); }
  sitDown() {
    if (!this.walker.nearHelm()) return this.toast('Walk back to the wheel (starboard side of the wheelhouse, behind the dash) and press B');
    this.S.setLever && this.S.setLever(Math.max(0, this.boat.power)); this.S.setMode(1); this.syncMode(); this.toast('Back at the wheel — W S throttle · A D steer');
  }
  syncMode() { const m = this.S.getMode(); if (m === 6 && !this.walking) this.startWalk(); else if (m !== 6 && this.walking) this.endWalk(); else this.applyControls(); }
  applyControls() {
    const C = this.S.CTL; store.set({ camMode: this.S.getMode() });
    if (this.walking) { C.override = true; C.power = this.auto.power; C.rudder = this.auto.rudder; C.turn = 0; }
    else { C.override = false; C.rudder = 0; C.turn = 0; }
  }
  setAuto(dp, dr) {
    if (!this.walking) return; this.auto.power = clamp(this.auto.power + dp, 0, 8); this.auto.rudder = clamp(Math.round((this.auto.rudder + dr) * 4) / 4, -1, 1); this.applyControls(); store.set({ auto: { ...this.auto } });
  }
  toggleCreep() { if (!this.walking) return this.toast('Stand up from the wheel first (B)'); this.auto.power = this.auto.power > 0 ? 0 : 1.2; this.applyControls(); store.set({ auto: { ...this.auto } }); this.toast(this.auto.power ? 'Slow cruise — about 2 knots. ↑ ↓ change the throttle, V stops' : 'Engine to idle — drifting'); }
  creepSlower() {}
  walkInput() { const k = this.keysDown, t = this.touch; return { fwd: clamp((k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + t.fwd, -1, 1), strafe: clamp((k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + t.strafe, -1, 1), run: k.has('ShiftLeft') || k.has('ShiftRight') || t.run }; }
  setTouchMove(fwd, strafe, run = false) { this.touch.fwd = fwd; this.touch.strafe = strafe; this.touch.run = run; }
  lookBy(dx, dy) { if (!this.walking || this.gameActive) return; this.S.DECK.yaw = wrap(this.S.DECK.yaw - dx * .0042); this.S.DECK.pitch = clamp(this.S.DECK.pitch - dy * .0042, -1.35, 1.2); }

  bindInput() {
    const cv = this.S.renderer.domElement, S = this.S;
    cv.addEventListener('pointerdown', (e) => { audio(); if (!this.walking) return; if (e.button === 0) { if (!this.pointerLocked && !('ontouchstart' in window)) { try { cv.requestPointerLock && cv.requestPointerLock(); } catch (x) {} } this.dragLook = true; if (this.pointerLocked) this.beginCharge(); } });
    addEventListener('pointerup', (e) => { this.dragLook = false; if (this.pointerLocked && e.button === 0) this.release(); });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === cv; });
    addEventListener('pointermove', (e) => {
      if (!this.walking || this.gameActive) return; let mx = e.movementX || 0, my = e.movementY || 0; if (e.pointerType === 'touch') return; if (Math.abs(mx) + Math.abs(my) < 1) return;
      if (this.pointerLocked || this.dragLook) { const k = this.pointerLocked ? .0024 : .004; S.DECK.yaw = wrap(S.DECK.yaw - mx * k); S.DECK.pitch = clamp(S.DECK.pitch - my * k, -1.35, 1.2); }
    });
    addEventListener('keydown', (e) => {
      if (this.gameActive) return; this.keysDown.add(e.code); if (e.repeat) return; audio(); const c = e.code, st = store.get();
      if (st.workshop && c !== 'KeyZ') return;
      if (c === 'KeyF') this.beginCharge(); else if (c === 'KeyG') this.haul(); else if (c === 'KeyN') this.cycleMethod(); else if (c === 'KeyT') this.cycleMesh(); else if (c === 'KeyV') this.toggleCreep();
      else if (c === 'KeyB' || (c === 'KeyE' && this.walking && this.walker.nearHelm())) this.goDeck(); else if (c === 'KeyH') this.sell(); else if (c === 'KeyZ') store.set({ workshop: !st.workshop }); else if (c === 'KeyJ') this.soak(); else if (c === 'KeyK') store.set({ help: !st.help });
      else if (this.walking && c === 'ArrowUp') this.setAuto(.5, 0); else if (this.walking && c === 'ArrowDown') this.setAuto(-.5, 0); else if (this.walking && c === 'ArrowLeft') this.setAuto(0, .25); else if (this.walking && c === 'ArrowRight') this.setAuto(0, -.25);
      else if (c === 'KeyQ' && this.rig) this.trawlDepth(e.shiftKey ? 3 : 1); else if (c === 'KeyE' && this.rig) this.trawlDepth(e.shiftKey ? -3 : -1); else if (c === 'KeyX') this.trawlAuto();
      else if (c === 'KeyC' || /^Digit[1-7]$/.test(c) || c === 'KeyR') setTimeout(() => this.syncMode(), 30);
    });
    addEventListener('keyup', (e) => { this.keysDown.delete(e.code); if (e.code === 'KeyF') this.release(); });
    addEventListener('blur', () => this.keysDown.clear());
  }

  /* --------------------------- actions --------------------------- */
  beginCharge() {
    if (this.gameActive || this.startAt) return; const m = store.get().method;
    if (m === 'cast') { if (!this.walking) return this.toast('Stand up from the wheel first (B). The cast net is thrown by hand from the deck.'); if (this.cast || this.cd > 0) return this.toast('Net is still out — haul it in (G)'); this.charging = true; this.chargeT = 0; }
    else if (m === 'trawl') this.setTrawl(); else if (m === 'seine') this.setSeine(); else this.setGill();
  }
  release() { if (!this.charging) return; this.charging = false; store.set({ charge: null }); this.throwCast(this.meter); }
  deckEyeWorld() { return this.S.hullG.localToWorld(this.S.DECK.eye.clone()); }
  castRange() { const net = store.get().nets.cast; return net ? clamp(8.3 - net.weight * .5, 3.2, 8) : 6; }
  throwCast(m) {
    const net = this.net(), S = this.S, comp = compat(net, this.boatDef), q = 1 - clamp(Math.abs(m - .8) / .5, 0, 1);
    /* heavier = shorter throw. A weak wind-up (meter low) gives a short toss */
    const base = clamp(8.3 - net.weight * .5, 3.2, 8), dist = clamp(base * (.55 + .45 * clamp(m / .8, 0, 1)) * (comp.over > 1.1 ? .9 : 1), 2.5, 8);
    const eye = this.deckEyeWorld(), yaw = S.boat.heading + S.DECK.yaw, dir = new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const hand = eye.clone().add(new V3(0, -.45, 0)).addScaledVector(dir, .3);
    this.lastThrow = { q, dist, m };
    this.cast = new CastNet(S, { ...net }, net.meshIdx, hand, dir, dist, q, comp, (cn) => this.onLand(cn, q));
    this.gulls.event('throw', hand.x + dir.x * dist, hand.z + dir.z * dist);
    this.cd = 1; tick('good'); store.set({ netState: { text: 'Throwing…' } });
    this.toast(q > .85 ? 'Good release — the net is spinning open' : q > .5 ? 'Decent throw — it may not open fully' : 'Rushed throw — the net will be half folded. Release in the green next time');
  }
  /* the net has hit the water and settled: read what it actually covers and queue the cut-away */
  onLand(cn, q) {
    if (cn.hauling) return;
    const fp = cn.footprint, fw = this.fw, net = cn.net, env = seaEnv(), comp = compat(net, this.boatDef);
    fw.scare(fp.cx, fp.cz, 7 + net.radius, .9);
    this.gulls.event('escape', fp.cx, fp.cz);
    const inside = fw.fishNear(fp.cx, fp.cz, Math.max(fp.effR, net.radius * .5) * 1.18, 13), seabed = Math.max(14, 1.3 * (this.S.P.hs || 0) + 6);
    let near = null, nd = 1e9; for (const s of fw.schools) { const d = Math.hypot(s.x - fp.cx, s.z - fp.cz); if (d < nd) { nd = d; near = s; } }
    const lab = !near ? 'miss' : nd < near.rad * .4 ? 'direct hit' : nd < near.rad + fp.effR * .6 ? 'edge hit' : 'miss';
    const MAXP = 72, mult = Math.max(1, inside.length / MAXP), picks = inside.length > MAXP ? inside.filter((_, i) => R() < MAXP / inside.length) : inside;
    const pool = picks.map((f) => ({ ref: f, sp: f.sp.id, len: f.sp.len * f.lenK, depth: -f.y, x: (f.x - fp.cx) / Math.max(net.radius, .5), z: (f.z - fp.cz) / Math.max(net.radius, .5), speed: f.sp.speed, panic: f.sp.panic, dive: f.sp.dive, flee: f.sp.flee, shy: f.sp.shy }));
    const deepNear = near && near.d > CAST_MAX_DEPTH && nd < near.rad + net.radius;
    const pending = { type: 'cast', net, meshIdx: net.meshIdx, comp, env, pool, mult, effR: fp.effR, R: net.radius, openFrac: fp.openFrac, holes: fp.holes, quality: q, sinkRate: net.sinkRate, seabed, label: lab, boatSpeed: Math.abs(this.boat.speed), noise: this.lastNoise, deepNear: !!deepNear, closeBoost: 1, spin: fp.spin };
    if (!pool.length) { cn.autoHaulAt = this.t + 1.7; this.pending = null; this.cd = 3; this.toast('The net settles over empty water — no fish under it. Hauling it back…'); store.set({ netState: { text: 'Empty water under the net — hauling' } }); return; }
    const e = estimatePool(pool, net, net.meshIdx, .7);
    this.queueGame(pending, { fish: Math.round(e.fish * mult), value: Math.round(e.value * mult) }, 1.1);
    this.toast(fp.openFrac > .8 ? 'The net opened well and is sinking…' : fp.openFrac > .5 ? 'The net only half opened — sinking with folds…' : 'The net landed bunched up — it will not cover much');
  }
  queueGame(pending, estimate, delay) { this.pending = pending; this.pendingEst = estimate; this.startAt = this.t + delay; this.cd = 9; }
  haul() {
    const m = store.get().method;
    if (m === 'cast') { if (this.cast && !this.gameActive) { this.startAt = 0; this.pending = null; this.cast.hauling = true; this.toast('Hauling the net in…'); } else if (!this.cast) this.toast('Nothing to haul — throw the net first'); }
    else if (m === 'trawl') this.haulTrawl(); else if (m === 'seine') this.haulSeine(); else this.haulGill();
  }
  /* ---------- trawl ---------- */
  setTrawl() {
    if (this.rig) { return this.toast('Trawl already out — keep towing, then haul (G). Q / E or the depth buttons set the trawl depth, X follows the school'); }
    const net = this.net(), comp = compat(net, this.boatDef); this.rig = new TrawlRig(this.S, net, net.meshIdx, comp); this.rigT = 0; this.trawlPending = false;
    const tgt = this.bestSchoolAhead(); this.rig.tgt = tgt ? clamp(tgt.d, 1, 12) : 5; this.rig.auto = !!tgt; store.set({ rig: { type: 'trawl' }, trawl: { depth: this.rig.tgt, auto: this.rig.auto } });
    this.toast(`Trawl shot away. It needs ~16 s and 2–4 knots to open. ${tgt ? 'Following the school ahead' : 'Set the depth with Q / E'} — watch the fish finder. G = haul back.`);
  }
  trawlDepth(delta) { const r = this.rig; if (!r || r.hauling) return; r.auto = false; r.setDepth(r.tgt + delta); store.set({ trawl: { depth: r.tgt, auto: false } }); }
  trawlAuto() { const r = this.rig; if (!r || r.hauling) return this.toast('Shoot the trawl first (F)'); r.auto = !r.auto; store.set({ trawl: { depth: r.tgt, auto: r.auto } }); this.toast(r.auto ? 'Depth follow ON — the winch tracks the school ahead' : 'Depth follow OFF — manual depth (Q / E)'); }
  /* the school the boat is heading for: biggest, closest, inside the swept path */
  bestSchoolAhead() {
    const b = this.boat, fx = -Math.sin(b.heading), fz = -Math.cos(b.heading); let best = null, bs = 0;
    for (const s of this.fw.schools) { if (s.lone) continue; const dx = s.x - b.position.x, dz = s.z - b.position.z, ax = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx); if (ax < -10 || ax > 170 || lat > s.rad + 22) continue; const sc = s.fish.length / (1 + Math.max(0, ax) / 45) / (1 + lat / 25); if (sc > bs) { bs = sc; best = { s, d: s.d, ax, lat, n: s.fish.length, sp: s.sp }; } }
    return best;
  }
  catchPop(sp) { this.feed = [...this.feed.filter((f) => Date.now() - f.t < 3200).slice(-4), { k: Math.random(), sp: sp.id, t: Date.now() }]; store.set({ feed: this.feed }); }
  haulTrawl() {
    if (!this.rig) return this.toast('Shoot the trawl first (F)'); if (this.rig.hauling) return;
    this.rig.haulIn(); this.trawlPending = true; store.set({ trawl: { depth: 0, auto: false } }); this.toast(this.rig.bag.length ? 'Hauling the trawl — the codend is heavy…' : 'Hauling the trawl back…');
  }
  openTrawlGame() {
    const r = this.rig, net = r.net, comp = r.comp, env = seaEnv(), seabed = Math.max(14, 1.3 * (this.S.P.hs || 0) + 6), bag = r.bag, pool = bag.map((b) => ({ ref: b.f, sp: b.f.sp.id, len: b.f.sp.len * b.f.lenK, depth: b.depth, speed: b.f.sp.speed, shy: b.f.sp.shy }));
    this.pending = { type: 'trawl', net, meshIdx: net.meshIdx, comp, env, pool, mult: 1, opening: r.opening, W: r.W || net.mouthW, H: r.H || net.mouthH, depth: r.depth, seabed, towSpeed: this.towAvg || 1, boatSpeed: Math.abs(this.boat.speed), seaDiff: env.seaDiff, rigTime: this.rigT, snags: r.snag };
    this.gameActive = true; store.set({ game: this.pending, estimate: null });
  }
  /* nothing in the net: no mini-game, just bring it aboard */
  emptyHaul(what) { this.toast(`${what} comes up empty — nothing in it. Try another spot`); chime('soft'); store.set({ netState: null }); }
  /* ---------- purse seine ---------- */
  setSeine() {
    const net = this.net();
    if (this.wall && this.seineState === 'laying') return this.beginSeineClose('manual');
    if (this.wall) return this.toast('A seine is already out — wait for the purse game');
    this.wall = new WallNet(this.S, net, net.meshIdx, 'seine'); this.seineState = 'laying'; const st = this.stern(3.4); this.wall.add(...st); this.seineStart = st; this.laidL = 0;
    this.buoy = new Buoy(this.S, st[0], st[1]);
    this.toast('Start buoy dropped and the net is leaving the stern. Steer a wide circle around the school and come back toward the buoy — the purse closes by itself when you are near it.'); store.set({ rig: { type: 'seine' } });
  }
  stern(k = 3.6) { const h = this.boat.heading; return [this.boat.position.x + Math.sin(h) * k, this.boat.position.z + Math.cos(h) * k]; }
  seineCloseR() { return clamp(this.wall.net.length * .07, 10, 22); }
  beginSeineClose(why) {
    const w = this.wall, net = w.net; if (!w || this.seineState !== 'laying') return; const L = w.length();
    if (L < Math.max(30, net.length * .25)) return this.toast('Not enough net laid yet — keep going around the school');
    this.seineState = 'closing'; this.closeT = 0; const pts = w.pts, n = pts.length; let cx = 0, cz = 0; pts.forEach((p) => { cx += p.x; cz += p.z; }); cx /= n; cz /= n; w.cx = cx; w.cz = cz;
    const a = pts[0], b = pts[n - 1], gap = Math.hypot(a.x - b.x, a.z - b.z), inPoly = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) if ((pts[i].z > z) !== (pts[j].z > z) && x < (pts[j].x - pts[i].x) * (z - pts[i].z) / (pts[j].z - pts[i].z) + pts[i].x) c = !c; return c; };
    const fish = []; for (const s of this.fw.schools) { if (Math.hypot(s.x - cx, s.z - cz) > L / 2 + 40) continue; for (const f of s.fish) if (-f.y < net.depth * .92 && inPoly(f.x, f.z) && (s.fl <= 0 || R() < .35)) fish.push(f); }
    const MAXP = 90, mult = Math.max(1, fish.length / MAXP), picks = fish.length > MAXP ? fish.filter(() => R() < MAXP / fish.length) : fish;
    const env = seaEnv(), comp = compat(net, this.boatDef), pool = picks.map((f) => ({ ref: f, sp: f.sp.id, len: f.sp.len * f.lenK, depth: -f.y, speed: f.sp.speed, shy: f.sp.shy, a: R() * TAU, r: Math.sqrt(R()) }));
    this.seineData = { pool, mult, gap, L, circ: L, diam: L / Math.PI, comp, env, net, inside: fish.length };
    this.toast(why === 'auto' ? 'Back at the buoy — the ends join and the purse line starts drawing the bottom shut…' : 'Closing the ring early — the ends join and the purse line draws…');
    store.set({ netState: { text: 'Closing the ring · pulling the purse line' } }); this.gulls.event('escape', cx, cz); this.fw.scare(cx, cz, L / 3, .5);
  }
  openSeineGame() {
    const d = this.seineData; if (!d.pool.length) { this.dying.push({ w: this.wall, buoy: this.buoy, t: 0, from: this.wall.pull }); this.wall = null; this.buoy = null; this.seineState = 'idle'; store.set({ rig: null, netState: null }); return this.emptyHaul('The seine'); }
    this.seineState = 'pursing';
    this.pending = { type: 'seine', net: d.net, meshIdx: d.net.meshIdx, comp: d.comp, env: d.env, pool: d.pool, mult: d.mult, gap: d.gap, L: d.L, seabed: 14, inside: d.inside }; this.gameActive = true; store.set({ game: this.pending, netState: null });
  }
  haulSeine() {
    if (!this.wall) return this.toast('Lay the seine around a school first (F)');
    if (this.seineState === 'laying') return this.beginSeineClose('manual'); this.toast(this.seineState === 'closing' ? 'The ring is still closing…' : 'Purse the net with the game');
  }
  /* ---------- gillnet ---------- */
  setGill() {
    const net = this.net(); if (this.layingGill) { this.layingGill = null; this.endBuoy(this.gill[this.gill.length - 1]); return this.toast('Gillnet set. Drive off; J soaks 3 hours; come back within 40 m and haul with G'); }
    const w = new WallNet(this.S, net, net.meshIdx, 'gill'); const st = this.stern(3.4); w.add(...st); w.hours = 0; w.laid = 0; w.hp = 100; w.buoyA = new Buoy(this.S, st[0], st[1], 0xffcc22); this.gill.push(w); this.layingGill = w; this.toast('Laying the gillnet — drive in a fairly straight line; F again to finish'); store.set({ rig: { type: 'gill' } });
  }
  endBuoy(w) { if (!w || w.buoyB) return; const l = w.pts[w.pts.length - 1]; w.buoyB = new Buoy(this.S, l.x, l.z, 0xffcc22); }
  soak() {
    if (!this.gill.length) return this.toast('Set a gillnet first (method Gill, F)'); if (this.layingGill) { this.endBuoy(this.layingGill); this.layingGill = null; } for (const w of this.gill) { w.hours += 3; }
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
    const [x, z] = this.stern(0); const w = this.gill.find((g) => g.pts.some((p) => Math.hypot(p.x - x, p.z - z) < 40)); if (!w) return this.toast(this.gill.length ? 'Get within 40 m of a gillnet buoy to haul it' : 'No gillnet set — press F while driving to lay one'); if (this.layingGill) { this.endBuoy(this.layingGill); this.layingGill = null; }
    const net = w.net, env = seaEnv(), comp = compat(net, this.boatDef), pool = this.gillCatchPool(w); const bycatch = R() < .12 * Math.min(w.hours / 6, 1.5) ? 1 + (R() * 2 | 0) : 0;
    if (!pool.length && !bycatch) { w.dispose(); w.buoyA && w.buoyA.dispose(); w.buoyB && w.buoyB.dispose(); this.gill = this.gill.filter((g) => g !== w); store.set({ rig: this.gill.length ? { type: 'gill' } : null }); return this.emptyHaul('The gillnet'); }
    this.pending = { type: 'gill', net, meshIdx: net.meshIdx, comp, env, pool, mult: 1, hours: w.hours, bycatch, wall: w, seabed: 14 }; this.gameActive = true; store.set({ game: this.pending, estimate: this.gillEstimate() });
  }

  /* --------------------------- game finished (called by React 2D games) --------------------------- */
  finishGame(res) {
    const g = this.pending, net = g.net; this.gameActive = false; this.pending = null;
    const caught = res.caught || {}; let n = 0, v = 0; const hold = { ...store.get().hold };
    for (const k in caught) { n += caught[k]; v += caught[k] * SPECIES[k].value; hold[k] = (hold[k] || 0) + caught[k]; }
    if (g.pool && res.caughtIdx) { const refs = res.caughtIdx.map((i) => g.pool[i] && g.pool[i].ref).filter(Boolean); this.fw.removeFish(refs); if (g.mult > 1 && g.type === 'cast' && this.cast && this.cast.footprint) { const extra = Math.round(refs.length * (g.mult - 1)), c = this.cast.footprint; this.fw.removeFish(this.fw.fishNear(c.cx, c.cz, c.effR, 14).slice(0, extra)); } }
    if (g.type === 'cast' && this.cast) { this.cast.driven = null; this.cast.hauling = true; this.cast.closeTarget = 1; }
    if (g.type === 'trawl') { this.rig.dispose(); this.rig = null; this.trawlPending = false; store.set({ rig: null, trawl: null }); }
    if (g.type === 'seine') { this.fw.removeFish(g.pool.filter((p, i) => (res.caughtIdx || []).includes(i)).map((p) => p.ref)); this.dying.push({ w: this.wall, buoy: this.buoy, t: 0, from: this.wall.pull }); this.wall = null; this.buoy = null; this.seineState = 'idle'; store.set({ rig: null }); }
    if (g.type === 'gill') { g.wall.dispose(); g.wall.buoyA && g.wall.buoyA.dispose(); g.wall.buoyB && g.wall.buoyB.dispose(); this.gill = this.gill.filter((w) => w !== g.wall); store.set({ rig: this.gill.length ? { type: 'gill' } : null }); }
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
    this.t += dt; const S = this.S, st = store.get(), boat = this.boat, C = S.CTL;
    this.cd = Math.max(0, this.cd - dt);
