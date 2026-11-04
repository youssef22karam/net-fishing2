// @ts-nocheck
/* How a shallow school shows itself: NEVER a painted patch. Three physical, fish-driven layers, all built from the live fish list of the school simulation:
   1. DENSITY  - soft puffs sitting at the fish's real depth, broken by animated 3-D noise (no contour), tinted with the water body colour, fading/bluer with depth. Drawn before the sea, so the real water covers them.
   2. SURFACE  - many tiny short-lived cells ON the real wave surface (they read the sea's own displacement maps): broken ripple arcs, fish backs breaking the surface, micro-splash droplets.
   3. FLANK GLINTS - thin fish-shaped slivers whose brightness is computed from flank normal x sun x view (geometry, not sprites).
   Cell sizes have a minimum in PIXELS (U.uPx), so readability does not depend on ocean mesh density, pixel ratio, wake-sim resolution or any other thing the Low preset turns down. */
import * as THREE from 'three';
import { clamp, lerp, sstep } from './config.js';
import { uwU } from './underwater.js';

const R = Math.random, rt = (a, b) => a + (b - a) * R();
const TONE = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

const SURF_VS = `attribute vec3 aPos;attribute vec4 aP;attribute vec3 aQ;
uniform sampler2D uD0,uD1,uD2;uniform vec3 uLS,uSun;uniform float uTexels,uHs,uPx;
varying vec2 vUv;varying vec4 vP;varying float vBr;
vec3 cas(sampler2D m,vec2 uv,float L){return textureLod(m,uv/L,log2(max(.3/(L/uTexels),1.))).xyz;}
vec3 disp(vec2 s){return cas(uD0,s,uLS.x)+cas(uD1,s,uLS.y)+cas(uD2,s,uLS.z);}
void main(){
  vec2 w=aPos.xy;vec2 s=w-disp(w).xz;vec3 d=disp(s);              // the same displaced surface the sea draws
  vec3 c=vec3(w.x,d.y+.03+.025*uHs+aQ.z,w.y);
  float dist=distance(cameraPosition,c),k=aP.w;
  float stx=1.,sty=1.;if(k>1.5&&k<2.5){stx=2.2;sty=.9;}else if(k>2.5){stx=3.2;sty=.5;}
  float sz=max(aP.x,dist*uPx*(k>2.5?2.4+dist/70.:3.2+dist/32.));                  // never smaller than ~3 px
  vec2 rq=vec2(position.x*stx,position.z*sty)*sz;float ch=cos(aPos.z),sh=sin(aPos.z);
  vec2 ro=vec2(ch*rq.x-sh*rq.y,sh*rq.x+ch*rq.y);
  float sinE=clamp((cameraPosition.y-c.y)/dist,.05,1.);          // grazing deck views squash flat cells to ~1-2 px: keep a minimum apparent height by growing the cell in depth
  float stv=clamp(dist*uPx*2.2/(sz*sinE),1.,k>2.5?3.:7.);
  vec2 vd=normalize(c.xz-cameraPosition.xz+vec2(1e-4));ro+=vd*dot(ro,vd)*(stv-1.);
  vec3 wp=vec3(c.x+ro.x,c.y,c.z+ro.y);
  vec3 V=normalize(cameraPosition-wp);
  vBr=aQ.x;
  if(k>2.5&&k<3.5){vec3 perp=vec3(-sh,0.,ch);vec3 N=normalize(vec3(0.,cos(aQ.y),0.)+perp*sin(aQ.y));   // flank mirror: tilt by roll
    float sp=pow(max(dot(reflect(-V,N),normalize(uSun)),0.),7.);vBr=aQ.x*(.1+1.9*sp);}
  vUv=position.xz;vP=aP;
  gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`;

const SURF_FS = `varying vec2 vUv;varying vec4 vP;varying float vBr;uniform vec3 uBody,uSunCol;uniform float uLight,uDay,uTime;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 uv=vUv*2.;float k=vP.w,age=vP.y;
  vec3 skyc=vec3(.68,.82,.95)*(.18+.82*uLight);
  if(k<.5){                                                       // broken ripple arc: bright sky-facing flank, darker lee flank, gaps in the ring
    float r=length(uv),R0=.2+.76*age,w0=.11+.07*(1.-age),w=max(w0,fwidth(r)*1.4);
    float d=(r-R0)/w,ring=exp(-d*d*1.5)*(w0/w);
    vec2 dir=uv/(r+1e-4);float brk=smoothstep(.28,.5,vn(dir*1.8+vP.z*13.+vec2(age*1.4)));
    float env=smoothstep(0.,.09,age)*(1.-smoothstep(.5,1.,age));
    vec3 dk=uBody*uLight*.85+vec3(.004,.012,.018);
    gl_FragColor=vec4(mix(dk,skyc,smoothstep(-.7,.8,d)),clamp(ring*brk*env*vBr*2.2,0.,.95)*(1.-smoothstep(.85,1.,r)));
  }else if(k<2.5){                                                // a fish back breaking the surface: small dark-green-blue dorsal with a wet sky streak
    float e=length(vec2(uv.x,uv.y*1.5)),body=1.-smoothstep(.5,1.,e);
    vec3 back=vec3(.04,.13,.17)*(.4+.6*uLight)+skyc*.5*pow(max(1.-abs(uv.y*1.6+.2),0.),2.);
    gl_FragColor=vec4(back,body*sin(3.14159*clamp(age,0.,1.))*vBr);
  }else{                                                          // additive: flank glint sliver (k=3) / spray streak (k=4)
    float t=abs(uv.x),wd=(1.-t*t)*.6,s=1.-smoothstep(wd*.45,wd,abs(uv.y));
    float fl=.55+.45*sin(uTime*13.+vP.z*40.);
    float a=s*vBr*(k<3.5?(.55+.45*fl):(1.-age))*uDay;
    gl_FragColor=vec4(k<3.5?vec3(.86,.95,1.):vec3(.8,.9,1.),a);
  }
${TONE}}`;

const PUFF_VS = 'attribute vec3 aPos;attribute float aA;attribute float aS;attribute vec3 aC;varying float vA;varying vec3 vC;varying vec2 vUv;varying vec3 vW;void main(){vec4 mv=viewMatrix*vec4(aPos,1.);mv.xy+=position.xy*aS;gl_Position=projectionMatrix*mv;vA=aA;vC=aC;vUv=position.xy*2.;vW=aPos;}';
const PUFF_FS = `varying float vA;varying vec3 vC;varying vec2 vUv;varying vec3 vW;uniform vec3 uWBody;uniform float uWLight,uWTime;
float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
  float d=length(vUv);if(d>1.)discard;float soft=1.-smoothstep(.1,1.,d);
  vec3 q=vW*1.7+vec3(uWTime*.21,-uWTime*.33,uWTime*.17)+vC.x*13.;
  float n=vn3(q)*.62+vn3(q*2.7+3.1)*.38;                           // animated 3-D noise: the mass churns and has no clean outline
  float a=soft*smoothstep(.34,.74,n+soft*.22)*vA;
  vec3 col=uWBody*uWLight*mix(.74,1.,vC.y)+vec3(.004,.012,.018);     // the water's own blue-green, only slightly darker, softer with depth
  gl_FragColor=vec4(col,a);
${TONE}}`;

function instGeo(max, layout, rot) {
  const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1); if (rot) q.rotateX(-Math.PI / 2);
  g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const arrs = {};
  for (const [name, n] of layout) { arrs[name] = new Float32Array(max * n); g.setAttribute(name, new THREE.InstancedBufferAttribute(arrs[name], n).setUsage(THREE.DynamicDrawUsage)); }
  g.instanceCount = 0; return { g, arrs };
}

export class SchoolFX {
  constructor(S, fw) {
    this.S = S; this.fw = fw; this.t = 0; this.cells = []; this.drops = []; this.acc = new Map();
    this._touch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
    const WU = S.water.material.uniforms;
    const sm = (fs, additive) => new THREE.ShaderMaterial({ uniforms: WU, vertexShader: SURF_VS, fragmentShader: SURF_FS.replace('void main(){', '#define K\nvoid main(){'), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const L = [['aPos', 3], ['aP', 4], ['aQ', 3]];
    this.NR = 560; this.NG = 560;
    const r = instGeo(this.NR, L, true); this.rA = r.arrs; this.rG = r.g; this.rip = new THREE.Mesh(r.g, sm(null, false)); this.rip.frustumCulled = false; this.rip.renderOrder = 2.4; S.scene.add(this.rip);
    const g = instGeo(this.NG, L, true); this.gA = g.arrs; this.gG = g.g; this.gl = new THREE.Mesh(g.g, sm(null, true)); this.gl.frustumCulled = false; this.gl.renderOrder = 2.5; S.scene.add(this.gl);
    const P = instGeo(360, [['aPos', 3], ['aA', 1], ['aS', 1], ['aC', 3]], false); this.pA = P.arrs; this.pG = P.g;
    this.puff = new THREE.Mesh(P.g, new THREE.ShaderMaterial({ uniforms: uwU(), vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false }));
    this.puff.frustumCulled = false; this.puff.renderOrder = .42; S.scene.add(this.puff);
  }
  isLow() { const q = this.S.P.quality; return !!window.__lite || q === 'Low' || (q === 'Auto' && this._touch); }
  /* readability of a mass at distance from light, sea state, atmosphere, sun glare, viewing angle (NOT depth: depth is handled per layer) */
  envK(s, cam, env, dist) {
    const camH = Math.max(cam.y - this.S.S.y, .5), sinE = camH / Math.hypot(dist, camH), ang = .5 + .5 * sstep(.02, .25, sinE);
    const clar = lerp(.7, 1, env.clar), atmos = Math.exp(-dist * (.0016 + .01 * env.storm)) * (1 - sstep(300, 420, dist));
    const light = .25 + .75 * env.light, sea = 1 / (1 + .15 * Math.pow(env.hs, 1.4)), su = this.S.U.uSun.value, sl = Math.hypot(su.x, su.z) + 1e-4, dd = dist + 1e-3;
    const dot = Math.max(0, ((s.x - cam.x) / dd) * (su.x / sl) + ((s.z - cam.z) / dd) * (su.z / sl)), glare = clamp((Math.pow(dot, 6) * (1 - env.sunY) * .5 + Math.pow(dot, 40) * .25) * env.day, 0, .6);
    return clamp(clar * atmos * light * sea * ang * (1 - glare), 0, 1);
  }
  ring(x, z, size, life, kind, h = 0, br = 1) { this.cells.push({ x, z, size, life, t: 0, kind, h, br, seed: R() }); }
  drop(x, z, vx, vy, vz, br) { this.drops.push({ x, z, vx, vy, vz, yo: .02, t: 0, life: rt(.3, .6), br }); }
  update(dt, cam, env) {
    this.t += dt; const low = this.isLow(), cap = low ? { r: 380, g: 260, d: 80, p: 200, pb: 40 } : { r: 520, g: 420, d: 140, p: 360, pb: 70 };
    const sp = this.S.splash;
    let gn = 0, pn = 0; const GA = this.gA, PA = this.pA;
    const g = (i) => i * 3;
    for (const s of this.fw.schools) {
      if (s.lone) continue; const F = s.fish, n = F.length; if (n < 4) continue;
      const dB = Math.hypot(s.x - cam.x, s.z - cam.z); if (dB > 420) continue;
      const top = s.top ?? s.d, ek = this.envK(s, cam, env, dB), act = s.act || 0;
      /* 2. surface disturbance: only for schools in the top ~4 m, strongest in the top 1.5 m */
      const ripK = 1 - sstep(1.2, 4.2, top);
      if (ripK > .02 && ek > .01) {
        let a = (this.acc.get(s) || 0) + (16 + 70 * act) * ripK * Math.min(1, (s.live || n) / 60) * (low ? .85 : 1) * dt * (1 + (s.fl > 0 ? 1.5 : 0)) * (1 + Math.min(dB, 150) / 75);
        while (a >= 1 && this.cells.length < cap.r) {
          a--; let f = null; for (let k = 0; k < 8; k++) { const c = F[(R() * n) | 0]; if (!c.cap && -c.y < top + 1.1) { f = c; break; } } if (!f) break;
          this.ring(f.x + rt(-.25, .25), f.z + rt(-.25, .25), rt(.35, .95) * (.6 + .5 * ripK), rt(.9, 2.1), 0, 0, clamp(ek * 1.8 * (.45 + .55 * ripK) * (1 + dB / 110), 0, 1));
        }
        this.acc.set(s, Math.min(a, 3));
        // backs breaking the surface + micro-splashes: only for schools in the top ~1.5 m
        const bk = (1 - sstep(.5, 1.6, top)) * (1.5 + 9 * act) * dt;
        if (bk > 0 && R() < bk && this.cells.length < cap.r - 6) {
          let f = null; for (let k = 0; k < 8; k++) { const c = F[(R() * n) | 0]; if (!c.cap && -c.y < 1.1) { f = c; break; } }
          if (f) {
            const br = clamp(ek * 1.5, 0, 1), hh = Math.PI / 2 - f.hd;
            this.ring(f.x, f.z, f.sp.len * rt(1.5, 2.3), rt(.4, .7), 2, hh, br); this.ring(f.x, f.z, rt(.4, .7), rt(.7, 1.3), 0, 0, br); this.ring(f.x + rt(-.2, .2), f.z + rt(-.2, .2), rt(.25, .45), rt(.6, 1), 0, 0, br);
            if (this.drops.length < cap.d && dB < 160) for (let k = 0, m = 2 + ((R() * 4) | 0); k < m; k++) { const an = R() * 6.28, sp2 = rt(.2, .9); this.drop(f.x, f.z, Math.cos(an) * sp2, rt(1.2, 2.6), Math.sin(an) * sp2, br * .9); }
            if (sp && dB < 120 && R() < .5) sp(f.x, f.z, .05);
          }
        }
      }
      /* 3. flank glints: fish near the surface that roll or flash */
      if (top < 4.2 && dB < 330) for (const f of F) {
        const dep = -f.y; if (dep > 4 || f.cap) continue; const fr = f.roll + f.rollK * 1.1;
        if (f.flash < .15 && Math.abs(fr) < .38) continue; if (gn >= cap.g) break;
        const br = ek * Math.exp(-dep * .5) * (1 - sstep(.8, 3.9, dep)) * clamp(.35 + f.flash * 1.1 + Math.abs(fr) * .4, 0, 1.4); if (br < .02) continue;
        const o = gn * 3, o4 = gn * 4; GA.aPos[o] = f.x; GA.aPos[o + 1] = f.z; GA.aPos[o + 2] = Math.PI / 2 - f.hd;
        GA.aP[o4] = f.sp.len * f.lenK * .6; GA.aP[o4 + 1] = .5; GA.aP[o4 + 2] = f.ph; GA.aP[o4 + 3] = 3; GA.aQ[o] = br; GA.aQ[o + 1] = fr; GA.aQ[o + 2] = 0; gn++;
      }
      /* 1. density: puffs at the fish's real depth. none at all for a school whose top is deeper than ~7 m */
      const dk = (1 - sstep(3.2, 6.8, top)) * (.5 + .5 * sstep(.4, 2.4, top)); if (dk > .02 && dB < 240 && pn < cap.p) {
        const stride = Math.max(1, Math.ceil(n / cap.pb)), off = (s.id * 997) % stride | 0, el = Math.exp(-dB * .004);
        for (let i = off; i < n && pn < cap.p; i += stride) {
          const f = F[i]; if (f.cap) continue; const o = pn * 3;
          PA.aPos[o] = f.x; PA.aPos[o + 1] = f.y; PA.aPos[o + 2] = f.z; PA.aA[pn] = .34 * dk * el * (.6 + .4 * ek); PA.aS[pn] = f.sp.len * 4 + .35 + .12 * stride; PA.aC[o] = (i * .37 + s.seed) % 7; PA.aC[o + 1] = clamp(-f.y / 7, 0, 1); PA.aC[o + 2] = 0; pn++;
        }
      }
    }
    /* spray droplets */
    for (let i = this.drops.length - 1; i >= 0; i--) { const d = this.drops[i]; d.t += dt; d.vy -= 9.8 * dt; d.yo += d.vy * dt; d.x += d.vx * dt; d.z += d.vz * dt; if (d.yo < 0 || d.t > d.life) this.drops.splice(i, 1); }
    for (const d of this.drops) { if (gn >= this.NG) break; const o = gn * 3, o4 = gn * 4; GA.aPos[o] = d.x; GA.aPos[o + 1] = d.z; GA.aPos[o + 2] = Math.atan2(d.vz, d.vx); GA.aP[o4] = .06; GA.aP[o4 + 1] = d.t / d.life; GA.aP[o4 + 2] = 0; GA.aP[o4 + 3] = 4; GA.aQ[o] = d.br; GA.aQ[o + 1] = 0; GA.aQ[o + 2] = d.yo; gn++; }
    /* ripple / back cells */
    let rn = 0; const RA = this.rA;
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const c = this.cells[i]; c.t += dt; if (c.t >= c.life) { this.cells.splice(i, 1); continue; }
    }
    for (const c of this.cells) { if (rn >= this.NR) break; const o = rn * 3, o4 = rn * 4; RA.aPos[o] = c.x; RA.aPos[o + 1] = c.z; RA.aPos[o + 2] = c.h; RA.aP[o4] = c.size; RA.aP[o4 + 1] = c.t / c.life; RA.aP[o4 + 2] = c.seed; RA.aP[o4 + 3] = c.kind; RA.aQ[o] = c.br; RA.aQ[o + 1] = 0; RA.aQ[o + 2] = 0; rn++; }
    this.rG.instanceCount = rn; this.gG.instanceCount = gn; this.pG.instanceCount = pn;
    for (const k of ['aPos', 'aP', 'aQ']) { this.rG.attributes[k].needsUpdate = true; this.gG.attributes[k].needsUpdate = true; }
    for (const k of ['aPos', 'aA', 'aS', 'aC']) this.pG.attributes[k].needsUpdate = true;
  }
}
