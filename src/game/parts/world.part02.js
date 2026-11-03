      else if (this.t % .4 < dt) { const ph = this.cast.phase(); if (!this.gameActive) store.set({ netState: { text: { throw: 'Throwing…', opening: 'The net is spinning open in the air', landing: 'Splash — the lead line pulls the rim under', sinking: 'The net is sinking — the cut-away opens in a moment', closing: 'Closing the cord', hauling: `Hauling the net in · line tension ${this.cast.tension.toFixed(0)} N` }[ph] } }); }
    }
    /* trawl */
    if (this.rig) {
      const r = this.rig, sp = spd * C.k; r.update(dt, boat, sp, Math.max(14, 1.3 * (S.P.hs || 0) + 6)); this.rigT += dt; this.towAvg = lerp(this.towAvg || sp, sp, .02);
      if (r.deploy > .8 && sp > .5 && r.spread > .25) { const ca = r.m, W = r.W, H = r.H, tx = r.m.tx, tz = r.m.tz; for (const f of this.fw.fishNear(ca.x, ca.z, W * .75 + 3, 14)) { const ax = (f.x - ca.x) * tx + (f.z - ca.z) * tz, lat = Math.abs((f.x - ca.x) * -tz + (f.z - ca.z) * tx); if (ax < -.4 || ax > sp * dt * 3 + 1.5 || lat > W / 2 || Math.abs(-f.y - r.depth) > H / 2 + .4) continue; const p = clamp(1 - f.sp.speed * 1.0 / (sp * 1.6 + .5), .04, .9) * r.opening; if (R() < p * dt * 8) { r.bag.push({ f, depth: -f.y }); f.s.fish = f.s.fish.filter((o) => o !== f); } } this.fw.schools.filter((s) => !s.fish.length).forEach((s) => this.fw.removeSchool(s)); }
      this.fw.scare(r.m.x, r.m.z, 30, noise * .4 * dt * 60 * .02);
      if (this.t % .5 < dt) { const fl = r.fill(), feel = !r.bag.length ? 'light' : fl < .15 ? 'a little weight on the warps' : fl < .5 ? 'filling' : fl < .85 ? 'heavy' : 'bag is full'; store.set({ netState: { text: `trawl ${r.deploy < 1 ? 'opening ' + Math.round(r.deploy * 100) + '%' : 'towing'} · warp ${r.warp.toFixed(0)} m · depth ${r.depth.toFixed(1)} m · mouth ${(r.W || 0).toFixed(1)}×${(r.H || 0).toFixed(1)} m · ${(sp * 1.944).toFixed(1)} kn · ${feel}` } }); }
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
    if (this.t % .5 < dt) { store.set({ speedKn: Math.abs(boat.speed * C.k) * 1.944 }); if (!this.cast && !this.rig && !this.wall && !this.gameActive && !this.layingGill && store.get().netState) store.set({ netState: null }); }
  }

  /* --------------------------- "what do I do now?" coach: step list for the current method --------------------------- */
  updateCoach() {
    const st = store.get(), m = st.method; let steps = [], at = 0;
    if (this.gameActive) { store.set({ coach: { steps: ['Play the catch game on screen'], at: 0, method: m } }); return; }
    if (m === 'cast') {
      steps = ['Stand up from the wheel (B) and walk onto the deck', 'Slow the boat (V) and look for a school: dark patch, silver flashes, boiling water', 'Hold F, release in the GREEN to throw the net over it', 'Watch the net open, land and sink — the cut-away opens', 'Hold SPACE in the cut-away to pull the cord when fish are over the net', 'Sell the catch (H)'];
      at = !this.walking ? 0 : this.cast ? (this.cast.hauling ? 5 : this.cast.settled ? 4 : 3) : st.holdValue > 0 && st.result ? 5 : this.charging ? 2 : 1;
    } else if (m === 'trawl') {
      steps = ['Drive at 2–4 knots (at the wheel: W; or walk and use ↑ ↓)', 'Press F to shoot the trawl — it takes ~16 s to open and sink', 'Tow across the fish. Q / E = warp length (deeper / shallower). Faster tow = wider mouth', 'Feel the warps: "heavy" means fish are in the bag. Press G to haul back', 'Play the haul game, then sell (H)'];
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
