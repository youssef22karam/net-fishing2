// @ts-nocheck
/* The game controller: deck mode, auto-creep, camera assist, throws, nets in the world, scenario building for the 2D games, economy. */
import * as THREE from 'three';
import { SPECIES, SPECIES_LIST, BOATS, METHODS, clamp, sstep, TAU, seaEnv, lerp } from './config.js';
import { genNet, compat, retention, estimatePool } from './netgen.js';
import { FishWorld } from './fish.js';
import { Gulls } from './gulls.js';
import { CastNet, WallNet, Buoy } from './nets3d.js';
import { TrawlRig } from './trawlrig.js';
import { scanContacts } from './sonar.js';
import { Walker, HELM } from './walk.js';
import { store } from './store.js';

const R = Math.random, V3 = THREE.Vector3;
const CREEP = [.8, .55, .3, 0];            // power levels (m/s). Forward only; the player can only go down to a full stop.
const wrap = (a) => ((a + Math.PI * 3) % TAU) - Math.PI;
export const CAST_MAX_DEPTH = 6.5;           // cast nets only reach shallow schools

/* --------------------------- tiny synthesized audio (warm feedback + ambient gull calls) --------------------------- */
let AC = null, eng = null, lastCryT = 0;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = 40; f.type = 'lowpass'; f.frequency.value = 160; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(AC.destination); o.start(); eng = { o, g, f }; } catch (e) {} } return AC; }
export function chime(kind = 'good') { const a = audio(); if (!a) return; const notes = kind === 'good' ? [523, 659, 784, 1046] : kind === 'perfect' ? [659, 784, 988, 1319, 1568] : kind === 'soft' ? [392, 330] : [440]; notes.forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f; const t = a.currentTime + i * .09; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.07, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .5); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .55); }); }
export function tick(kind) { const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = kind === 'bad' ? 180 : 700 + Math.random() * 300; g.gain.setValueAtTime(.05, a.currentTime); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .12); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .13); }
export function gullCry(dist = 60) {
  if (!AC || document.hidden) return;
  const now = AC.currentTime; if (now - lastCryT < 3.4) return; lastCryT = now;
  const vol = clamp(.038 / (1 + dist / 55), .004, .038);
  const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
  o.type = 'triangle'; f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 2.8;
  const p0 = 1550 + Math.random() * 320;
  o.frequency.setValueAtTime(p0, now);
  o.frequency.linearRampToValueAtTime(p0 * 1.28, now + .09);
  o.frequency.exponentialRampToValueAtTime(p0 * .74, now + .42);
  g.gain.setValueAtTime(.0001, now);
  g.gain.linearRampToValueAtTime(vol, now + .05);
  g.gain.exponentialRampToValueAtTime(.0001, now + .44);
  o.connect(f); f.connect(g); g.connect(AC.destination);
  o.start(now); o.stop(now + .46);
}

export class World {
  constructor(S) {
    this.S = S; this.boat = S.boat; this.fw = new FishWorld(S); this.fw.initialWorld(S.boat); this.gulls = new Gulls(S, this.fw, (d) => gullCry(d));
    this.t = 0; this.charging = false; this.chargeT = 0; this.cast = null; this.cd = 0; this.rig = null; this.wall = null; this.gill = []; this.seineState = 'idle'; this.dying = [];
    this.pointerLocked = false; this.lastNoise = 0; this.dragK = 1; this.walker = new Walker(); this.walking = false; this.keysDown = new Set(); this.auto = { power: 0, rudder: 0 };
    this.touch = { fwd: 0, strafe: 0, run: false }; this.sonar = { cols: [], ahead: null, contacts: [], net: null }; this.sonarT = 0; this.feed = []; this.trawlPending = false; this.nets = {}; this.refreshNets(true); this.gameActive = false; this.startAt = 0; this.coachT = 0;
    this.initAimRing();
    S.onFrame = (dt) => this.tick(dt);
    S.onCam = (dt) => { if (this.rig && !this.rig.dead) this.rig.attach(); };   // after the boat has been moved / heaved / pitched: the warps are re-tied to the winch blocks every frame
    this.bindInput(); S.setMode(1); store.set({ started: true, camMode: 1, walking: false, auto: { ...this.auto } }); this.applyControls();
  }
  initAimRing() {
    const g = new THREE.Group();
    const outerGeo = new THREE.RingGeometry(.94, 1.0, 48); outerGeo.rotateX(-Math.PI / 2);
    const innerGeo = new THREE.RingGeometry(.0, .92, 48); innerGeo.rotateX(-Math.PI / 2);
    this.aimMatOut = new THREE.MeshBasicMaterial({ color: 0x5ee6c4, transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false });
    this.aimMatIn = new THREE.MeshBasicMaterial({ color: 0x5ee6c4, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false });
    this.aimOut = new THREE.Mesh(outerGeo, this.aimMatOut); this.aimIn = new THREE.Mesh(innerGeo, this.aimMatIn);
    this.aimOut.renderOrder = .85; this.aimIn.renderOrder = .84;
    g.add(this.aimOut, this.aimIn); g.visible = false;
    this.aimRing = g; this.S.scene.add(g);
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
    store.set({ walking: true, help: false, auto: { ...this.auto } }); this.toast(this.boat.speed > .3 ? 'You left the wheel — engine to idle, the boat coasts quietly. WASD walks · mouse aims · F throws' : 'On deck — WASD walks · mouse aims · F throws · B returns to the wheel');
  }
  endWalk() { this.walking = false; this.charging = false; if (this.aimRing) this.aimRing.visible = false; this.keysDown.clear(); this.touch.fwd = this.touch.strafe = 0; store.set({ walking: false, charge: null }); this.applyControls(); }
  sitDown() {
    this.walker.reset();
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
  toggleCreep() { if (!this.walking) return this.toast('Stand up from the wheel first (B)'); this.auto.power = this.auto.power > 0 ? 0 : 1.2; this.applyControls(); store.set({ auto: { ...this.auto } }); this.toast(this.auto.power ? 'Slow stealth cruise (~2.3 kn) — shoals stay calm. ↑ ↓ change throttle, V stops' : 'Engine to idle — drifting quietly'); }
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
  castRange() { const net = store.get().nets.cast; return net ? clamp(8.8 - net.weight * .45, 3.5, 8.5) : 6.5; }
  calcThrowTarget(m = .8) {
    const net = store.get().nets.cast || this.net(), S = this.S, comp = compat(net, this.boatDef), q = 1 - clamp(Math.abs(m - .8) / .5, 0, 1);
    const base = clamp(8.8 - net.weight * .45, 3.5, 8.5), dist = clamp(base * (.55 + .45 * clamp(m / .8, 0, 1)) * (comp.over > 1.1 ? .9 : 1), 2.5, 8.5);
    const eye = this.deckEyeWorld(), yaw = S.boat.heading + S.DECK.yaw, dir = new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const hand = eye.clone().add(new V3(0, -.45, 0)).addScaledVector(dir, .3);
    return { net, comp, q, dist, hand, dir, tx: hand.x + dir.x * dist, tz: hand.z + dir.z * dist };
  }
  throwCast(m) {
    const { net, comp, q, dist, hand, dir, tx, tz } = this.calcThrowTarget(m);
    this.lastThrow = { q, dist, m };
    this.cast = new CastNet(this.S, { ...net }, net.meshIdx, hand, dir, dist, q, comp, (cn) => this.onLand(cn, q));
    this.gulls.event('throw', tx, tz);
    this.cd = 1; tick('good'); store.set({ netState: { text: 'Throwing…' } });
    this.toast(q > .85 ? 'Clean release — the net is spinning open!' : q > .5 ? 'Decent throw — opening over the water' : 'Rushed throw — release in the green sweet spot for full spread');
  }
  /* the net has hit the water and settled: read what it actually covers and queue the cut-away */
  onLand(cn, q) {
    if (cn.hauling) return;
    const fp = cn.footprint, fw = this.fw, net = cn.net, env = seaEnv(), comp = compat(net, this.boatDef);
    fw.scare(fp.cx, fp.cz, 4.5 + net.radius * .8, .35);
    this.gulls.event('escape', fp.cx, fp.cz);
    const inside = fw.fishNear(fp.cx, fp.cz, Math.max(fp.effR, net.radius * .6) * 1.32, 13), seabed = Math.max(14, 1.3 * (this.S.P.hs || 0) + 6);
    let near = null, nd = 1e9; for (const s of fw.schools) { const d = Math.hypot(s.x - fp.cx, s.z - fp.cz); if (d < nd) { nd = d; near = s; } }
    const lab = !near ? 'miss' : nd < near.rad * .5 ? 'direct hit' : nd < near.rad + fp.effR * .75 ? 'edge hit' : 'miss';
    const MAXP = 72, mult = Math.max(1, inside.length / MAXP), picks = inside.length > MAXP ? inside.filter(() => R() < MAXP / inside.length) : inside;
    const pool = picks.map((f) => ({ ref: f, sp: f.sp.id, len: f.sp.len * f.lenK, depth: -f.y, x: (f.x - fp.cx) / Math.max(net.radius, .5), z: (f.z - fp.cz) / Math.max(net.radius, .5), speed: f.sp.speed, panic: f.sp.panic, dive: f.sp.dive, flee: f.sp.flee, shy: f.sp.shy }));
    const deepNear = near && near.d > CAST_MAX_DEPTH && nd < near.rad + net.radius;
    const pending = { type: 'cast', net, meshIdx: net.meshIdx, comp, env, pool, mult, effR: fp.effR, R: net.radius, openFrac: fp.openFrac, holes: fp.holes, quality: q, sinkRate: net.sinkRate, seabed, label: lab, boatSpeed: Math.abs(this.boat.speed), noise: this.lastNoise, deepNear: !!deepNear, closeBoost: 1, spin: fp.spin };
    if (!pool.length) { cn.autoHaulAt = this.t + 1.7; this.pending = null; this.cd = 3; this.toast('The net settles over empty water — no fish under it. Hauling it back…'); store.set({ netState: { text: 'Empty water under the net — hauling' } }); return; }
    const e = estimatePool(pool, net, net.meshIdx, .75);
    this.queueGame(pending, { fish: Math.round(e.fish * mult), value: Math.round(e.value * mult) }, 1.0);
    this.toast(fp.openFrac > .8 ? 'The net opened wide and is sinking over the fish…' : fp.openFrac > .5 ? 'The net half-opened and is sinking…' : 'The net landed bunched — cinch quickly!');
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
    const tgt = this.bestSchoolAhead(); this.rig.seabed = Math.max(14, 1.3 * (this.S.P.hs || 0) + 6); this.rig.hs = this.S.P.hs || 0; this.rig.setDepth(tgt ? tgt.d : 5); this.rig.auto = !!tgt; store.set({ rig: { type: 'trawl' }, trawl: { depth: this.rig.tgt, auto: this.rig.auto, fish: 0, escaped: 0 } });
    this.toast(`Trawl shot away. It needs ~16 s and 2–4 knots to open. ${tgt ? 'Following the school ahead' : 'Set the depth with Q / E'} — watch the fish finder. G = haul back.`);
  }
  trawlDepth(delta) { const r = this.rig; if (!r || r.hauling) return; r.auto = false; r.setDepth(r.tgt + delta); store.set({ trawl: { ...store.get().trawl, depth: r.tgt, auto: false } }); }
  trawlAuto() { const r = this.rig; if (!r || r.hauling) return this.toast('Shoot the trawl first (F)'); r.auto = !r.auto; store.set({ trawl: { ...store.get().trawl, depth: r.tgt, auto: r.auto } }); this.toast(r.auto ? 'Depth follow ON — the winch tracks the school ahead' : 'Depth follow OFF — manual depth (Q / E)'); }
  /* the school the boat (or the net) is heading for, from the live sounder contacts: best ahead of the boat or already over the net */
  bestSchoolAhead() {
    const c = scanContacts(this).find((k) => k.ahead); if (!c) return null;
    return { s: c.s, d: c.mean, ax: c.ax, lat: Math.abs(c.lat), n: c.n, sp: c.s.sp, top: c.top, bot: c.bot };
  }
  catchPop(sp) { this.feed = [...this.feed.filter((f) => Date.now() - f.t < 3200).slice(-4), { k: Math.random(), sp: sp.id, t: Date.now() }]; store.set({ feed: this.feed }); }
  /* G: with fish in the codend the winch game starts right away from the REAL state (tow depth, catch, net, mesh) and the 3D bag follows it up; an empty net is just hauled back */
  haulTrawl() {
    const r = this.rig; if (!r) return this.toast('Shoot the trawl first (F)'); if (r.hauling) return;
    if (r.bag.length) { r.setHaul(0, 0); this.openTrawlGame(); this.toast(`Hauling the trawl — ${r.bag.length} fish in the codend`); }
    else { r.haulIn(); this.trawlPending = true; store.set({ trawl: { ...store.get().trawl, depth: 0, auto: false } }); this.toast('Hauling the trawl back…'); }
  }
  openTrawlGame() {
    const r = this.rig, net = r.net, comp = r.comp, env = seaEnv(), seabed = Math.max(14, 1.3 * (this.S.P.hs || 0) + 6), bag = r.bag.slice();
    const pool = bag.map((b) => ({ ref: b.f, sp: b.sp, len: b.len, depth: b.depth, speed: b.f.sp.speed, shy: b.f.sp.shy }));
    this.pending = { type: 'trawl', net, meshIdx: net.meshIdx, comp, env, pool, mult: 1, opening: r.opening, W: r.W, H: r.H, depth: r.depth0 ?? r.depth, towDepth: r.depth0 ?? r.depth, seabed, towSpeed: this.towAvg || 1, boatSpeed: Math.abs(this.boat.speed), seaDiff: env.seaDiff, rigTime: this.rigT, snags: r.snag, codend: bag.length, escaped: r.escaped, swept: r.swept, bagFill: r.fill() };
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
  seineCloseR() { return clamp(this.wall.net.length * .08, 12, 24); }
  beginSeineClose(why) {
    const w = this.wall, net = w.net; if (!w || this.seineState !== 'laying') return; const L = w.length();
    if (L < Math.max(28, net.length * .22)) return this.toast('Not enough net laid yet — keep going around the school');
    this.seineState = 'closing'; this.closeT = 0; const pts = w.pts, n = pts.length; let cx = 0, cz = 0; pts.forEach((p) => { cx += p.x; cz += p.z; }); cx /= n; cz /= n; w.cx = cx; w.cz = cz;
    const a = pts[0], b = pts[n - 1], gap = Math.hypot(a.x - b.x, a.z - b.z), inPoly = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) if ((pts[i].z > z) !== (pts[j].z > z) && x < (pts[j].x - pts[i].x) * (z - pts[i].z) / (pts[j].z - pts[i].z) + pts[i].x) c = !c; return c; };
    const fish = []; for (const s of this.fw.schools) { if (Math.hypot(s.x - cx, s.z - cz) > L / 2 + 45) continue; for (const f of s.fish) if (-f.y < net.depth * .95 && (inPoly(f.x, f.z) || Math.hypot(f.x - cx, f.z - cz) < L / (TAU * 1.15)) && (s.fl <= 0 || R() < .6)) fish.push(f); }
