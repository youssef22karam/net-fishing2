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
    const spd = Math.abs(boat.speed), noise = (Math.pow(spd / 6, 1.4) + Math.abs(boat.power) / 8 * .35 + (this.rig ? .22 : 0) + strain * .3) * this.boatDef.noise; this.lastNoise = noise;
    const netThreat = this.cast && this.cast.landed ? { x: this.cast.P[0].x, z: this.cast.P[0].z, r: this.cast.rimRadius() * .8, depth: this.cast.rimDepth() } : this.cast ? { x: this.cast.P[0].x, z: this.cast.P[0].z, r: this.cast.R * .5, depth: 0 } : null;
    this.fw.update(dt, { boat, noise, netThreat });
    for (const e of this.fw.events.splice(0)) { if (e.type === 'flee' && !this.gameActive) this.gulls.event('escape', e.x, e.z); }
    this.gulls.update(dt, boat);
    /* meter */
    if (this.charging) { this.chargeT += dt; this.meter = .5 - .5 * Math.cos(this.chargeT * TAU / 1.5); store.set({ charge: this.meter }); }
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
    /* trawl: individual fish are swept in as the net passes; a school in the mouth fills the bag fast */
    if (this.rig) {
      const r = this.rig, sp = spd * C.k, seabed = Math.max(14, 1.3 * (S.P.hs || 0) + 6); r.update(dt, boat, sp, seabed); this.rigT += dt; this.towAvg = lerp(this.towAvg || sp, sp, .02);
      if (r.auto && !r.hauling && this.t - (this._autoT || 0) > .5) { this._autoT = this.t; const b = this.bestSchoolAhead(); if (b) { r.setDepth(b.d); if (Math.abs(store.get().trawl?.depth - r.tgt) > .2) store.set({ trawl: { depth: r.tgt, auto: true } }); } }
      if (r.deploy > .7 && sp > .4 && r.spread > .2 && !r.hauling && r.fill() < 1) {
        const ca = r.m, W = r.W, H = r.H, tx = ca.tx, tz = ca.tz;
        for (const f of this.fw.fishNear(ca.x, ca.z, W * .75 + 3, 14)) {
          const dx = f.x - ca.x, dz = f.z - ca.z, ax = dx * tx + dz * tz, lat = Math.abs(dx * -tz + dz * tx);
          if (ax < -.5 || ax > sp * dt * 3 + 1.8 || lat > W / 2 || Math.abs(-f.y - r.depth) > H / 2 + .35) continue;
          const p = clamp(1 - f.sp.speed / (sp * 1.6 + .5), .05, .92) * r.opening * (f.s.lone ? 1 : 1.6);
          if (R() < clamp(p * dt * 9, 0, 1)) { r.bag.push({ f, depth: -f.y }); this.fw.capture(f, r); this.catchPop(f.sp); tick('good'); }
        }
      }
      this.fw.scare(r.m.x, r.m.z, 14, noise * .1 * dt * 60 * .02);
      if (this.t % .5 < dt) { const fl = r.fill(), feel = r.hauling ? 'hauling back' : !r.bag.length ? 'empty so far' : fl < .15 ? 'a little weight on the warps' : fl < .5 ? 'filling' : fl < .85 ? 'heavy' : 'bag is full'; store.set({ netState: { text: r.hauling ? `hauling the trawl · ${r.warp.toFixed(0)} m of warp out` : `trawl ${r.deploy < 1 ? 'opening ' + Math.round(r.deploy * 100) + '%' : 'towing'} · depth ${r.depth.toFixed(1)} m → ${r.tgt.toFixed(0)} m · ${r.bag.length} fish · ${(sp * 1.944).toFixed(1)} kn · ${feel}` } }); }
      if (r.hauled && this.trawlPending && !this.gameActive) { this.trawlPending = false; if (r.bag.length) this.openTrawlGame(); else { r.dispose(); this.rig = null; store.set({ rig: null, trawl: null }); this.emptyHaul('The trawl'); } }
    }
    /* cast net with nothing under it: no mini-game */
    if (this.cast && this.cast.autoHaulAt && this.t >= this.cast.autoHaulAt && !this.cast.hauling && !this.gameActive) { this.cast.autoHaulAt = 0; this.cast.hauling = true; }
    /* fish finder: a scrolling echogram under the boat + what lies ahead */
    this.sonarT -= dt; if (this.sonarT <= 0) {
      this.sonarT = .25; const SB = this.sonar, sd = Math.max(14, 1.3 * (S.P.hs || 0) + 6), son = this.fw.sonar(boat.position.x, boat.position.z, 13, 28, 14);
      SB.cols.push({ d: son.dens, z: son.size, rig: this.rig ? this.rig.depth : -1, tgt: this.rig ? this.rig.tgt : -1 }); if (SB.cols.length > 150) SB.cols.shift(); SB.bottom = sd;
      const a = this.bestSchoolAhead(); SB.ahead = a ? { dist: Math.max(0, Math.round(a.ax)), depth: a.d, n: a.n, sp: a.sp.id, lat: a.lat } : null;
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
      if (g === this.layingGill) { const [sx, sz] = this.stern(3.4), l = g.pts[g.pts.length - 1]; if (Math.hypot(sx - l.x, sz - l.z) > 4) g.add(sx, sz); if (g.length() >= g.net.length - 2) { this.endBuoy(g); this.layingGill = null; this.toast('Gillnet fully set. J soaks 3 hours, then haul with G'); } }
      g.update(dt); g.buoyA && g.buoyA.update(dt); g.buoyB && g.buoyB.update(dt);
    }
    if (this.t - this.coachT > .25) { this.coachT = this.t; this.updateCoach(); }
    if (this.t % .5 < dt) { store.set({ speedKn: Math.abs(boat.speed * C.k) * 1.944, boatPower: boat.power }); if (!this.cast && !this.rig && !this.wall && !this.gameActive && !this.layingGill && store.get().netState) store.set({ netState: null }); }
  }

  /* --------------------------- "what do I do now?" coach: step list for the current method --------------------------- */
  updateCoach() {
    const st = store.get(), m = st.method; let steps = [], at = 0;
    if (this.gameActive) { store.set({ coach: { steps: ['Play the catch game on screen'], at: 0, method: m } }); return; }
    if (m === 'cast') {
      steps = ['Stand up from the wheel (B) and walk onto the deck', 'Slow the boat and look for a school: dark swirling mass, silver flashes, boiling water', 'Hold F, release in the GREEN to throw the net over it', 'Watch the net open, land and sink — the cut-away opens', 'Hold SPACE in the cut-away to pull the cord when fish are over the net', 'Sell the catch (H)'];
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
