    const MAXP = 90, mult = Math.max(1, fish.length / MAXP), picks = fish.length > MAXP ? fish.filter(() => R() < MAXP / fish.length) : fish;
    const env = seaEnv(), comp = compat(net, this.boatDef), pool = picks.map((f) => ({ ref: f, sp: f.sp.id, len: f.sp.len * f.lenK, depth: -f.y, speed: f.sp.speed, shy: f.sp.shy, a: R() * TAU, r: Math.sqrt(R()) }));
    this.seineData = { pool, mult, gap, L, circ: L, diam: L / Math.PI, comp, env, net, inside: fish.length };
    this.toast(why === 'auto' ? 'Back at the buoy — the ends join and the purse line starts drawing the bottom shut…' : 'Closing the ring early — the ends join and the purse line draws…');
    store.set({ netState: { text: 'Closing the ring · pulling the purse line' } }); this.gulls.event('escape', cx, cz); this.fw.scare(cx, cz, L / 4, .3);
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
    const st = store.get(), hot = st.hotSpecies;
    const caught = res.caught || {}; let n = 0, v = 0; const hold = { ...st.hold };
    for (const k in caught) {
      n += caught[k];
      const hotMul = k === hot ? 1.35 : 1;
      v += caught[k] * SPECIES[k].value * hotMul;
      hold[k] = (hold[k] || 0) + caught[k];
    }
    if (g.pool && res.caughtIdx) { const refs = res.caughtIdx.map((i) => g.pool[i] && g.pool[i].ref).filter(Boolean); this.fw.removeFish(refs); if (g.mult > 1 && g.type === 'cast' && this.cast && this.cast.footprint) { const extra = Math.round(refs.length * (g.mult - 1)), c = this.cast.footprint; this.fw.removeFish(this.fw.fishNear(c.cx, c.cz, c.effR, 14).slice(0, extra)); } }
    if (g.type === 'cast' && this.cast) { this.cast.driven = null; this.cast.hauling = true; this.cast.closeTarget = 1; }
    if (g.type === 'trawl') { this.rig.dispose(); this.rig = null; this.trawlPending = false; store.set({ rig: null, trawl: null }); }
    if (g.type === 'seine') { this.fw.removeFish(g.pool.filter((p, i) => (res.caughtIdx || []).includes(i)).map((p) => p.ref)); this.dying.push({ w: this.wall, buoy: this.buoy, t: 0, from: this.wall.pull }); this.wall = null; this.buoy = null; this.seineState = 'idle'; store.set({ rig: null }); }
    if (g.type === 'gill') { g.wall.dispose(); g.wall.buoyA && g.wall.buoyA.dispose(); g.wall.buoyB && g.wall.buoyB.dispose(); this.gill = this.gill.filter((w) => w !== g.wall); store.set({ rig: this.gill.length ? { type: 'gill' } : null }); }
    const streak = res.perfect ? st.streak + 1 : n > 0 ? st.streak : 0, bonus = 1 + Math.min(streak, 6) * .05; v = Math.round(v * bonus * 100) / 100;   // cents: the result panel, the hold and the sale all use this exact number
    const hv = Math.round((st.holdValue + v) * 100) / 100; net.uses = (net.uses || 0) + 1;
    store.set({ hold, holdValue: hv, totalCaught: (st.totalCaught || 0) + n, game: null, estimate: null, streak, best: Math.max(st.best, Math.round(v)), result: { ...res, n, value: v, bonus, hotHit: !!(hot && caught[hot]), hotSpecies: hot, type: g.type, tip: res.tip, name: net.name, codend: g.type === 'trawl' ? g.codend : undefined, escaped: g.type === 'trawl' ? g.escaped : undefined } });
    if (n > 0) { chime(res.perfect ? 'perfect' : 'good'); if (v > 12 || n > 12) this.gulls.event('catch', this.boat.position.x, this.boat.position.z); } else chime('soft');
    this.applyControls();
  }
  sell() {
    const s = store.get(); if (!s.holdValue) return this.toast('The hold is empty');
    const p = Math.round(s.cash * 100 + s.holdValue * 100) / 100, sold = Math.round(s.holdValue * 100) / 100;
    const nextHot = SPECIES_LIST[(SPECIES_LIST.findIndex((sp) => sp.id === s.hotSpecies) + 1 + ((R() * 3) | 0)) % SPECIES_LIST.length].id;
    store.set({ cash: p, hold: {}, holdValue: 0, hotSpecies: nextHot });
    chime('good');
    this.toast(`Sold the catch for $${sold.toFixed(2)}! Market demand now favours ${SPECIES[nextHot].name} (+35%)`);
  }

  /* --------------------------- per-frame --------------------------- */
  tick(dt) {
    if (this.paused && !this._manual) return;
    this.t += dt; const S = this.S, st = store.get(), boat = this.boat, C = S.CTL;
    this.cd = Math.max(0, this.cd - dt);
    if ((S.getMode() === 6) !== this.walking) this.syncMode();
    /* walking */
    if (this.walking) {
      const inp = this.gameActive || st.workshop ? { fwd: 0, strafe: 0, run: false } : this.walkInput();
      this.walker.step(dt, inp.fwd, inp.strafe, S.DECK.yaw, inp.run); S.DECK.eye.set(this.walker.x, this.walker.eyeY, this.walker.z); C.override = true; C.power = this.auto.power; C.rudder = this.auto.rudder;
    }
    const comp = this.net() ? compat(this.net(), this.boatDef) : { speedMul: 1, strain: 0, openMul: 1 };
    /* drag and engine: towing nets slow the boat visibly */
    let towK = 1, strain = 0;
    if (this.rig) { towK = comp.speedMul; strain = comp.strain; }
    if (this.wall && this.seineState === 'laying') { towK = Math.min(towK, clamp(1.05 - .35 * comp.strain - .1 * this.wall.length() / this.wall.net.length, .3, 1)); strain = Math.max(strain, comp.strain * .6); }
    if (this.cast) { const F = this.cast.dragN(Math.abs(boat.speed)); if (F > 0) { towK = Math.min(towK, 1 / (1 + F / (this.boatDef.pull * 1000 * .22))); strain = Math.max(strain, clamp(F / (this.boatDef.pull * 1000), 0, 1)); } }
    this.dragK += (towK - this.dragK) * Math.min(1, dt * 2); C.k = this.boatDef.vmaxK * this.dragK; this.strain = strain;
    if (eng && AC) { const pw = Math.abs(boat.power); eng.o.frequency.value += ((38 + pw * 7 + strain * 18) - eng.o.frequency.value) * .1; eng.g.gain.value += ((.012 + Math.min(pw / 8, 1) * .03 + strain * .02) * (document.hidden ? 0 : 1) - eng.g.gain.value) * .1; eng.f.frequency.value = 130 + strain * 140 + pw * 12; }
    /* noise that fish hear and feel: speed, engine, wake, towing */
    const spd = Math.abs(boat.speed), noise = (Math.pow(spd / 6, 1.4) + Math.abs(boat.power) / 8 * .35 + (this.rig ? .15 : 0) + strain * .25) * this.boatDef.noise; this.lastNoise = noise;
    const netThreat = this.cast && this.cast.landed ? { x: this.cast.P[0].x, z: this.cast.P[0].z, r: this.cast.rimRadius() * .8, depth: this.cast.rimDepth() } : this.cast ? { x: this.cast.P[0].x, z: this.cast.P[0].z, r: this.cast.R * .5, depth: 0 } : null;
    const trawlMouth = this.rig && this.rig.fishing() ? { x: this.rig.m.x, y: this.rig.m.y, z: this.rig.m.z, W: this.rig.W, H: this.rig.H, tx: this.rig.m.tx, tz: this.rig.m.tz } : null;
    this.fw.update(dt, { boat, noise, netThreat, walking: this.walking, trawling: !!this.rig, seining: !!(this.wall && this.seineState === 'laying'), trawlMouth });
    for (const e of this.fw.events.splice(0)) { if (e.type === 'flee' && !this.gameActive) this.gulls.event('escape', e.x, e.z); }
    this.gulls.update(dt, boat);
    /* meter */
    if (this.charging) { this.chargeT += dt; this.meter = .5 - .5 * Math.cos(this.chargeT * TAU / 1.5); store.set({ charge: this.meter }); }
    /* 3D Cast-Net Aiming Ring on the water surface when walking on deck */
    if (this.aimRing) {
      const showAim = this.walking && st.method === 'cast' && !this.cast && !this.gameActive && !st.workshop;
      this.aimRing.visible = showAim;
      if (showAim) {
        const m = this.charging ? this.meter : .8;
        const { net, q, tx, tz } = this.calcThrowTarget(m);
        this.aimRing.position.set(tx, S.S.y + .08, tz);
        const rad = net.radius * (this.charging ? (.45 + .55 * q) : .92);
        this.aimRing.scale.set(rad, 1, rad);
        const col = this.charging ? (q > .8 ? 0x34d399 : q > .5 ? 0xfbbf24 : 0xf87171) : 0x38bdf8;
        this.aimMatOut.color.setHex(col); this.aimMatIn.color.setHex(col);
        this.aimMatOut.opacity = this.charging ? .85 : .42 + .12 * Math.sin(this.t * 4);
        this.aimMatIn.opacity = this.charging ? .22 : .09;
      }
    }
    /* queued cut-away game */
    if (this.startAt && this.t >= this.startAt) { this.startAt = 0; if (this.pending && this.cast && !this.cast.hauling) { this.gameActive = true; this.charging = false; store.set({ game: this.pending, estimate: this.pendingEst, charge: null, netState: null }); } else this.pending = null; }
    /* cast net */
    if (this.cast) {
      const eye = this.deckEyeWorld(), hand = eye.add(new V3(0, -.55, 0)); const G = window.__game;
      if (this.gameActive && this.pending && this.pending.type === 'cast' && G && G.zr !== undefined) this.cast.drive(G.zr, G.c || 0);
      this.cast.step(Math.min(dt, .05), hand);
      if (this.cast.done) { this.cast.dispose(); this.cast = null; this.cd = .5; if (!this.gameActive) store.set({ netState: null }); }
      else if (this.cast.landed && !this.gameActive && !this.startAt && this.cast.settled && !this.cast.hauling && this.cast.sunkT > 26) this.cast.hauling = true;
      else if (this.t % .4 < dt) { const ph = this.cast.phase(); if (!this.gameActive) store.set({ netState: { text: { throw: 'Throwing…', opening: 'The net is spinning open in the air', landing: 'Splash — the lead line pulls the rim under', sinking: 'The net is sinking — the cut-away opens in a moment', closing: 'Closing the cord', hauling: `Hauling the net in · line tension ${this.cast.tension.toFixed(0)} N` }[ph] } }); }
    }
    /* trawl: the catch is accumulated DURING the tow, fish by fish, as they cross the mouth (see TrawlRig.sweep); r.bag is the only catch list */
    if (this.rig) {
      const r = this.rig, sp = spd, seabed = Math.max(14, 1.3 * (S.P.hs || 0) + 6), G = window.__game;   // boat.speed already includes the drag factor
      if (this.gameActive && this.pending && this.pending.type === 'trawl' && G && G.pos !== undefined) r.setHaul(G.pos, G.T || 0);
      r.update(dt, boat, sp, seabed, S.P.hs || 0); this.rigT += dt; this.towAvg = lerp(this.towAvg || sp, sp, .02);
      if (r.auto && !r.hauling && this.t - (this._autoT || 0) > .5) { this._autoT = this.t; const b = this.bestSchoolAhead(); if (b) { r.setDepth(b.d); if (Math.abs((store.get().trawl?.depth ?? 0) - r.tgt) > .2) store.set({ trawl: { ...store.get().trawl, depth: r.tgt, auto: true } }); } }
      const nt = r.net; r.sweep(this.fw, dt, nt.mesh[nt.meshIdx], this.strain, (f) => { if (this.t - (this._pop || 0) > .12) { this._pop = this.t; this.catchPop(f.sp); tick('good'); } });
      if (this.t % .5 < dt) { const fl = r.fill(), feel = r.hauling ? 'hauling back' : !r.bag.length ? 'empty so far' : fl < .15 ? 'a little weight on the warps' : fl < .5 ? 'filling' : fl < .85 ? 'heavy' : 'bag is full';
        store.set({ trawl: store.get().trawl ? { ...store.get().trawl, fish: r.bag.length, escaped: r.escaped } : store.get().trawl });
        if (!this.gameActive) store.set({ netState: { text: r.hauling ? `hauling the trawl · ${r.warp.toFixed(0)} m of warp out` : `trawl ${r.deploy < 1 ? 'opening ' + Math.round(r.deploy * 100) + '%' : 'towing'} · net depth ${r.depth.toFixed(1)} m (set ${r.tgt.toFixed(0)} m) · ${r.bag.length} fish in the codend${r.escaped ? ' · ' + r.escaped + ' slipped the mesh' : ''} · ${(sp * 1.944).toFixed(1)} kn · ${feel}` } }); }
      if (r.hauled && this.trawlPending && !this.gameActive) { this.trawlPending = false; if (r.bag.length) this.openTrawlGame(); else { r.dispose(); this.rig = null; store.set({ rig: null, trawl: null }); this.emptyHaul('The trawl'); } }
    }
    /* cast net with nothing under it: no mini-game */
    if (this.cast && this.cast.autoHaulAt && this.t >= this.cast.autoHaulAt && !this.cast.hauling && !this.gameActive) { this.cast.autoHaulAt = 0; this.cast.hauling = true; }
    /* fish finder: a scrolling echogram under the boat + what lies ahead */
    this.sonarT -= dt; if (this.sonarT <= 0) {
      this.sonarT = .25; const SB = this.sonar, sd = Math.max(14, 1.3 * (S.P.hs || 0) + 6), son = this.fw.sonar(boat.position.x, boat.position.z, 13, 28, 14);
      SB.cols.push({ d: son.dens, z: son.size, rig: this.rig ? this.rig.depth : -1, tgt: this.rig ? this.rig.tgt : -1 }); if (SB.cols.length > 150) SB.cols.shift(); SB.bottom = sd;
      SB.contacts = scanContacts(this); const a = SB.contacts.find((k) => k.ahead); SB.ahead = a ? { dist: Math.max(0, Math.round(a.dist)), depth: a.mean, n: a.n, sp: a.sp, lat: a.lat } : null;
      const rg = this.rig; SB.net = rg && !rg.dead ? { depth: rg.depth, tgt: rg.tgt, H: rg.H, W: rg.W, fish: rg.bag.length, hauling: rg.hauling } : null;
    }
    /* seine */
    if (this.wall) {
      const w = this.wall; w.update(dt); if (this.buoy) this.buoy.update(dt);
      if (this.seineState === 'laying') {
        const [sx, sz] = this.stern(3.4), l = w.pts[w.pts.length - 1]; if (Math.hypot(sx - l.x, sz - l.z) > 4) w.add(sx, sz); const L = w.length(), d0 = Math.hypot(sx - this.seineStart[0], sz - this.seineStart[1]);
        if (this.t % .5 < dt) store.set({ netState: { text: `seine laid ${L.toFixed(0)} / ${w.net.length.toFixed(0)} m · start buoy ${d0.toFixed(0)} m away${L > w.net.length * .55 ? ' · closes itself inside ' + this.seineCloseR().toFixed(0) + ' m' : ''}` } });
        if ((L > w.net.length * .55 && L > 45 && d0 < this.seineCloseR()) || L >= w.net.length - 2) this.beginSeineClose('auto');
      } else if (this.seineState === 'closing') {
        this.closeT += dt; w.join = sstep(0, 2.5, this.closeT); w.pull = .3 * sstep(2.2, 6, this.closeT); if (this.closeT > 6.2) this.openSeineGame();
      } else if (this.seineState === 'pursing') { const G = window.__game; if (G && G.c !== undefined && this.gameActive) w.pull = .3 + .7 * clamp(G.c, 0, 1); }
    }
    for (const d of this.dying) { d.t += dt; d.w.pull = lerp(d.from, 1, sstep(0, 2.5, d.t)); d.w.update(dt); if (d.buoy) d.buoy.update(dt); if (d.t > 3.2) { d.w.dispose(); d.buoy && d.buoy.dispose(); d.dead = true; } } this.dying = this.dying.filter((d) => !d.dead);
    for (const g of this.gill) {
      if (g === this.layingGill) { const [sx, sz] = this.stern(3.4), l = g.pts[g.pts.length - 1]; if (Math.hypot(sx - l.x, sz - l.z) > 4) { g.add(sx, sz); } if (g.length() >= g.net.length - 2) { this.endBuoy(g); this.layingGill = null; this.toast('Gillnet fully set. J soaks 3 hours, then haul with G'); } }
      g.update(dt); g.buoyA && g.buoyA.update(dt); g.buoyB && g.buoyB.update(dt);
    }
    if (this.t - this.coachT > .25) { this.coachT = this.t; this.updateCoach(); this.updateTelemetry(); }
    if (this.t % .5 < dt) { store.set({ speedKn: Math.abs(boat.speed) * 1.944, boatPower: boat.power }); if (!this.cast && !this.rig && !this.wall && !this.gameActive && !this.layingGill && store.get().netState) store.set({ netState: null }); }
  }

  /* --------------------------- live telemetry: approach stealth, cast target & seagull cues --------------------------- */
  updateTelemetry() {
    const b = this.boat, bx = b.position.x, bz = b.position.z, spd = Math.abs(b.speed);
    const stealth = (this.walking || spd < 2.45) ? 'quiet' : spd < 4.2 ? 'moderate' : 'loud';
    let nearSpot = null;
    if (this.walking && store.get().method === 'cast' && !this.cast) {
      const { net, tx, tz } = this.calcThrowTarget(this.charging ? this.meter : .8);
      const inRing = this.fw.fishNear(tx, tz, net.radius * 1.15, CAST_MAX_DEPTH).length;
      let bestS = null, bestD = 1e9;
      for (const s of this.fw.schools) {
        if (s.lone || (s.top ?? s.d) > CAST_MAX_DEPTH) continue;
        const d = Math.max(0, Math.hypot(s.x - tx, s.z - tz) - s.rad);
        if (d < bestD) { bestD = d; bestS = s; }
      }
      if (inRing > 0 || (bestS && bestD < 45)) {
        nearSpot = { inRing, sp: bestS ? bestS.sp.name : 'Fish', dist: Math.round(bestD), depth: bestS ? (bestS.mean ?? bestS.d).toFixed(1) : '1.5' };
      }
    }
    const circling = this.gulls.g.filter((g) => g.st === 'circle' || g.st === 'dive' || g.st === 'hover').length;
    const following = this.gulls.g.filter((g) => g.st === 'follow' || g.st === 'perch').length;
    let flockDist = null;
    const gCircle = this.gulls.g.find((g) => g.school && (g.st === 'circle' || g.st === 'dive'));
    if (gCircle && gCircle.school) flockDist = Math.round(Math.hypot(gCircle.school.x - bx, gCircle.school.z - bz));
    store.set({ stealth, nearSpot, gullCue: { circling, following, flockDist } });
  }

  /* --------------------------- "what do I do now?" coach: step list for the current method --------------------------- */
  updateCoach() {
    const st = store.get(), m = st.method; let steps = [], at = 0;
    if (this.gameActive) { store.set({ coach: { steps: ['Play the catch game on screen'], at: 0, method: m } }); return; }
    if (m === 'cast') {
      steps = ['Approach a shallow school (circling gulls, dark patch) at < 5 kn so it stays calm, then press B to stand up', 'Walk onto the deck (WASD) and line up the water target ring over the fish', 'Hold F, release in the GREEN to throw the net cleanly over the school', 'Watch the net open, land and sink — the cut-away opens', 'Hold SPACE in the cut-away to pull the cord when fish are inside the bell', 'Sell the catch (H)'];
      at = !this.walking ? 0 : this.cast ? (this.cast.hauling ? 5 : this.cast.settled ? 4 : 3) : st.holdValue > 0 && st.result ? 5 : this.charging ? 2 : 1;
    } else if (m === 'trawl') {
      steps = ['Drive at 2–4 knots from the wheel (W) and head for a school', 'Press F to shoot the trawl — it takes ~16 s to open and sink', 'Match the trawl depth to the fish on the fish finder (Q / E or the depth buttons; X follows the school). Faster tow = wider mouth', 'Feel the warps: "heavy" means fish are in the bag. Press G to haul back', 'Play the haul game, then sell (H)'];
      at = !this.rig ? 0 : this.rig.deploy < 1 ? 1 : this.rig.bag.length > 8 ? 3 : 2; if (!this.rig && this.boat.speed > 1) at = 1;
    } else if (m === 'seine') {
      steps = ['Press F near a school: the start buoy drops and the net leaves the stern', 'Steer a wide circle around the school (at the wheel: A / D, or ← → rudder when walking)', 'Come back toward the buoy — the ends join and the purse closes automatically', 'Play the pursing game to draw the purse line tight', 'Sell the catch (H)'];
      at = !this.wall ? 0 : this.seineState === 'laying' ? (this.wall.length() > this.wall.net.length * .55 ? 2 : 1) : this.seineState === 'closing' ? 2 : 3;
    } else {
      steps = ['Drive in a fairly straight line and press F to start laying', 'Press F again to finish the net and drop the end buoy', 'Press J to soak the net for 3 hours (fish tangle in the mesh)', 'Return within 40 m of a buoy and press G to haul', 'Sort the fish in the haul game'];
      at = !this.gill.length ? 0 : this.layingGill ? 1 : this.gill[0].hours > 0 ? 3 : 2;
    }
    const prev = st.coach; if (!prev || prev.at !== at || prev.method !== m) store.set({ coach: { steps, at, method: m } });
  }

  /* debug helper for screenshots / tests */
  place(spId, dist, bearing, depth, feeding = true, n) { const b = this.boat, a = Math.atan2(-Math.cos(b.heading), -Math.sin(b.heading)) + bearing; return this.fw.spawnSchool(spId, b.position.x + Math.cos(a) * dist, b.position.z + Math.sin(a) * dist, { depth, feeding, n }); }
}
