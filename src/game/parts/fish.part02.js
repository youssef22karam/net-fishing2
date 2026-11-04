      const sc0 = this.spCol[s.sp.id], stream = s.sp.pattern === 'stream' || s.sp.pattern === 'surfacing' || s.sp.pattern === 'skim';
      if (!s.lone && pi < this.PMAX) {
        const c = this.cue(s, cam, env); s.cueK = c.k;
        if (c.a > .01) { const el = stream ? 1.7 : 1, D = (s.rad * 2.5 + (s.top || 0) * .7 + 1.2) * (stream ? 1.15 : 1);
          pPos[pi * 3] = s.x; pPos[pi * 3 + 1] = -.32; pPos[pi * 3 + 2] = s.z; pP[pi * 4] = D * el; pP[pi * 4 + 1] = c.a; pP[pi * 4 + 2] = s.heading; pP[pi * 4 + 3] = el; pS[pi] = s.seed; pi++; }
      } else s.cueK = 0;
      for (const f of s.fish) {
        if (i >= MAXF) break;
        const dx = f.x - cam.x, dz = f.z - cam.z, dd = Math.hypot(dx, dz), L = f.sp.len * f.lenK;
        if (dd < 82) {   // real fish bodies near the camera, always at true size
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
