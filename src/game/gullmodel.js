// @ts-nocheck
/* A procedural herring gull (Larus argentatus): lofted torso with a rounded breast and tapered rear, neck, a head in proportion (yellow bill with the red gonys spot, pale iris),
   two-segment wing (arm + forearm + hand/wrist) with 9 individually modelled primaries per side (black tips, white mirrors, they fan apart in flight), fan tail, pink webbed feet.
   Shading: MeshStandardMaterial (real sun + sky) with a procedural feather shader (barb noise + soft lines between feather groups), light grey mantle, white underside.
   Two LODs share one rig API: full (every part) and lite (silhouette-correct, 5 draw calls, wings still animated). Wings are built for the right side; the left is the mirrored group. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2, C = (h) => new THREE.Color(h), mix = (a, b, t) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
const WHITE = C('#f3f3ef'), BELLY = C('#e6e8e6'), MANTLE = C('#7c8a95'), MANTLE_L = C('#98a5ae'), GWING = C('#7a8791'), BLACK = C('#202327'), UNDERGREY = C('#c9ced2'), UNDERDARK = C('#62696f');
const BILL = C('#e6b41f'), BILL_T = C('#f2cf5a'), RED = C('#d63a22'), PINK = C('#d89a94'), IRIS = C('#ece3a2'), PUPIL = C('#16171a');

/* ---- geometry helpers: every geometry has exactly position, normal, aTop (rgb + mantle mask; a<0 = plain, no feather texture) and aBot (rgb) ---- */
function mk(pos, idx, topFn, botFn, plain) {
  const g = new THREE.BufferGeometry(), n = pos.length / 3, top = new Float32Array(n * 4), bot = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = topFn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], i), b = botFn ? botFn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], i) : t;
    top.set([t[0].r, t[0].g, t[0].b, plain ? -1 : (t[1] || 0)], i * 4); bot.set([b[0].r, b[0].g, b[0].b], i * 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.setAttribute('aTop', new THREE.BufferAttribute(top, 4)); g.setAttribute('aBot', new THREE.BufferAttribute(bot, 3)); g.computeVertexNormals(); return g;
}
function loft(st0, ring0, topFn, botFn, plain) {
  const pos = [], idx = [], cr = (a, b, c, d, t) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t), st = [], N = st0.length, ring = Math.max(ring0, 16);   // spline-subdivided stations: smooth, not faceted
  for (let i = 0; i < N - 1; i++) for (let k = 0; k < 3; k++) { const t = k / 3, a = st0[Math.max(i - 1, 0)], b = st0[i], c = st0[i + 1], d = st0[Math.min(i + 2, N - 1)], f = (n) => cr(a[n], b[n], c[n], d[n], t); st.push({ z: b.z + (c.z - b.z) * t, cy: f('cy'), w: Math.max(0, f('w')), t: Math.max(0, f('t')), b: Math.max(0, f('b')) }); }
  st.push(st0[N - 1]);
  for (const s of st) for (let j = 0; j < ring; j++) { const a = j / ring * TAU, sn = Math.sin(a), cs = Math.cos(a); pos.push(s.w * Math.sign(sn) * Math.pow(Math.abs(sn), .9), s.cy + (cs >= 0 ? s.t : s.b) * Math.sign(cs) * Math.pow(Math.abs(cs), .9), s.z); }
  for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring; idx.push(a, c, b, b, c, d); }
  return mk(pos, idx, topFn, botFn, plain);
}
/* a lofted wing/tail panel: X(u) along the span, lead(u)/trail(u) in z, camber */
function patch(nx, nz, X, lead, trail, cam, colFn, botFn) {
  const pos = [], idx = [], uv = [];
  for (let iu = 0; iu <= nx; iu++) for (let iv = 0; iv <= nz; iv++) { const u = iu / nx, v = iv / nz; pos.push(X(u), cam(u) * 4 * v * (1 - v) * (1 - .45 * v) - cam(u) * .5 * v * v, lead(u) + (trail(u) - lead(u)) * v); uv.push([u, v]); }
  for (let iu = 0; iu < nx; iu++) for (let iv = 0; iv < nz; iv++) { const a = iu * (nz + 1) + iv, b = a + 1, c = a + nz + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  return mk(pos, idx, (x, y, z, i) => colFn(uv[i][0], uv[i][1]), botFn ? (x, y, z, i) => botFn(uv[i][0], uv[i][1]) : null);
}
function ell(rx, ry, rz, cx, cy, cz, col, plain = true, seg = [14, 10]) {
  const s = new THREE.SphereGeometry(1, seg[0], seg[1]); s.scale(rx, ry, rz); s.translate(cx, cy, cz);
  return mk(Array.from(s.attributes.position.array), Array.from(s.index.array), () => [col, 0], null, plain);
}
const BAKE = (g, m) => g.clone().applyMatrix4(m);
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z), RY = (a) => new THREE.Matrix4().makeRotationY(a), RZ = (a) => new THREE.Matrix4().makeRotationZ(a), RX = (a) => new THREE.Matrix4().makeRotationX(a);

let PARTS = null;
const PL = [.16, .175, .19, .205, .22, .232, .242, .236, .2];             // primary lengths (P1 inner .. P9 outer)
const pivot = (i) => [.012 + .0085 * i, -.05 + .035 * (i / 8)], baseAng = (i) => .2 * Math.pow(1 - i / 8, 1.2) - .01;
function parts() {
  if (PARTS) return PARTS; const P = {};
  // torso: rounded breast, deep keel, tapered rear. mantle grey on the back (shaded by the shader), white elsewhere
  const sm = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  P.torso = loft([{ z: .27, cy: .045, w: .03, t: .04, b: .035 }, { z: .22, cy: .02, w: .07, t: .075, b: .07 }, { z: .14, cy: 0, w: .096, t: .096, b: .096 }, { z: .04, cy: 0, w: .104, t: .099, b: .092 }, { z: -.06, cy: 0, w: .093, t: .089, b: .076 }, { z: -.16, cy: -.005, w: .07, t: .066, b: .05 }, { z: -.25, cy: -.01, w: .045, t: .04, b: .03 }, { z: -.33, cy: -.012, w: .025, t: .022, b: .016 }, { z: -.36, cy: -.012, w: .004, t: .004, b: .004 }], 14,
    (x, y, z) => { const m = sm(.01, .05, y) * sm(-.22, -.1, z) * sm(.2, .12, z); return [mix(WHITE, MANTLE, m), m]; }, () => [BELLY, 0]);
  P.neck = loft([{ z: -.01, cy: 0, w: .046, t: .046, b: .046 }, { z: .06, cy: 0, w: .037, t: .037, b: .037 }, { z: .13, cy: 0, w: .031, t: .031, b: .031 }], 10, () => [WHITE, 0]);
  const head = ell(.031, .034, .05, 0, .006, .03, WHITE, false), eyes = [];
  for (const s of [1, -1]) { eyes.push(ell(.0085, .0085, .0085, s * .0245, .013, .034, IRIS, true, [8, 6])); eyes.push(ell(.0058, .0058, .0058, s * .0277, .013, .034, PUPIL, true, [8, 6])); }
  const bt = loft([{ z: .065, cy: .002, w: .016, t: .014, b: .009 }, { z: .085, cy: 0, w: .0125, t: .0105, b: .007 }, { z: .105, cy: -.001, w: .008, t: .008, b: .0045 }, { z: .118, cy: -.004, w: .0045, t: .0065, b: .0025 }, { z: .124, cy: -.007, w: .0015, t: .002, b: .001 }], 8, (x, y, z) => [mix(BILL, BILL_T, sm(.105, .125, z)), 0], null, true);
  P.head = mergeGeometries([head, ...eyes, bt]);
  P.jaw = loft([{ z: 0, cy: 0, w: .0135, t: .004, b: .007 }, { z: .02, cy: 0, w: .011, t: .0035, b: .0075 }, { z: .04, cy: 0, w: .007, t: .003, b: .0078 }, { z: .052, cy: 0, w: .0035, t: .002, b: .004 }, { z: .058, cy: 0, w: .001, t: .001, b: .001 }], 8, (x, y, z) => [(z > .024 && z < .052 && y < .002) ? RED : BILL, 0], null, true);
  // tail: white fan
  { const pos = [], idx = [], nxn = 8, nzn = 3; for (let iu = 0; iu <= nxn; iu++) for (let iv = 0; iv <= nzn; iv++) { const xn = iu / nxn * 2 - 1, v = iv / nzn; pos.push(xn * (.02 + .05 * v), -.014 * v * v, -v * (.17 - .02 * xn * xn)); }
    for (let iu = 0; iu < nxn; iu++) for (let iv = 0; iv < nzn; iv++) { const a = iu * (nzn + 1) + iv, b = a + 1, c = a + nzn + 1, d = c + 1; idx.push(a, b, c, b, d, c); } P.tail = mk(pos, idx, () => [WHITE, 0], () => [BELLY, 0]); }
  P.tars = (() => { const c = new THREE.CylinderGeometry(.0058, .0046, .085, 6, 1); c.translate(0, -.0425, 0); return mk(Array.from(c.attributes.position.array), Array.from(c.index.array), () => [PINK, 0], null, true); })();
  P.foot = (() => { const pos = [0, 0, -.008], idx = [], tips = [-.5, 0, .5].map((a) => [Math.sin(a) * .062, 0, Math.cos(a) * .062]); tips.forEach((t) => pos.push(...t)); pos.push(0, 0, -.03); idx.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1);
    for (let k = 0; k < 3; k++) { const t = tips[k]; pos.push(t[0] * .5 + .003, .003, t[2] * .5, t[0], .003, t[2], t[0] * .5 - .003, .003, t[2] * .5); } return mk(pos, idx, () => [PINK, 0], null, true); })();
  P.trs = mergeGeometries([ell(.04, .05, .066, .052, -.045, -.03, WHITE, false), ell(.04, .05, .066, -.052, -.045, -.03, WHITE, false)]);
  // wing panels (right wing; x outward, +z forward)
  const lw = (g) => g;
  const secCol = (u, v) => [mix(mix(MANTLE, MANTLE_L, (1 - v) * .5), WHITE, sm(.8, .97, v) * .95), 1 - sm(.8, .97, v)];
  const secBot = (u, v) => [mix(WHITE, UNDERGREY, sm(.72, 1, v) * .8), 0];
  P.arm = patch(5, 5, (u) => u * .17, (u) => .078 - .02 * u, (u) => -.125 + .01 * u, () => .016, secCol, secBot);
  P.fore = patch(5, 5, (u) => u * .15, () => .058 - .01 * 0, (u) => -.115 + .025 * u, () => .014, (u, v) => { const [c, m] = secCol(u, v); return [mix(c, GWING, sm(.55, 1, u) * (1 - v) * .5), m]; }, secBot);
  P.hand = patch(4, 4, (u) => u * .09, (u) => .05 - .012 * u, (u) => -.055 + .022 * u, () => .01, (u, v) => [mix(mix(MANTLE, GWING, u * .6), BLACK, u * .55 * (1 - v * .5)), 1 - u * .8], (u, v) => [mix(WHITE, UNDERDARK, u * .8), 0]);
  P.prim = PL.map((L, i) => {
    const o = i / 8, bs = .75 - .65 * Math.pow(o, .8), pos = [], idx = [], H = [.019, .0185, .017, .0145, .009, .0], U = [0, .25, .55, .8, .95, 1], uvs = [];
    for (let k = 0; k < 6; k++) for (let c = -1; c <= 1; c++) { pos.push(U[k] * L, (c === 0 ? .0016 : 0) - .004 * U[k] * U[k], c * H[k]); uvs.push(U[k]); }
    for (let k = 0; k < 5; k++) for (let c = 0; c < 2; c++) { const a = k * 3 + c, b = a + 1, cc = a + 3, d = cc + 1; idx.push(a, b, cc, b, d, cc); }
    return mk(pos, idx, (x, y, z, n) => { const u = uvs[n]; let c = u < bs ? mix(MANTLE, GWING, o) : BLACK; if (i >= 7 && u > .72 && u < .87) c = WHITE; if (i < 7 && u > .93) c = mix(c, WHITE, .75); if (i === 6 && u > .78 && u < .9) c = mix(c, WHITE, .7); return [c, u < bs ? .6 : 0]; },
      (x, y, z, n) => { const u = uvs[n]; return [u < .25 ? WHITE : mix(UNDERGREY, UNDERDARK, Math.min(1, u * (.4 + o * .8))), 0]; });
  });
  const primM = (i, spread, curl) => T(pivot(i)[0] + .09 * 0, 0, pivot(i)[1]).multiply(RY(-0 + baseAng(i) + spread * (i - 4) * .018)).multiply(RZ(curl * Math.pow(i / 8, 2) * .25));
  P.primM = primM;
  // ---- lite versions: baked
  const flightNeck = T(0, .04, .2).multiply(RX(-.3)); const headM = flightNeck.clone().multiply(T(0, 0, .13)).multiply(RX(.22));
  const legs = [1, -1].map((s) => BAKE(P.tars, T(s * .042, -.058, -.03).multiply(RX(1.45)))), feet = [1, -1].map((s) => BAKE(P.foot, T(s * .042, -.058, -.03).multiply(RX(1.45)).multiply(T(0, -.085, 0)).multiply(RX(-.4))));
  P.liteBody = mergeGeometries([P.torso, P.trs, BAKE(P.neck, flightNeck), BAKE(P.head, headM), BAKE(P.jaw, headM.clone().multiply(T(0, -.012, .07))), BAKE(P.tail, T(0, -.004, -.33).multiply(RX(0))), ...legs, ...feet]);
  P.liteArm = mergeGeometries([P.arm, BAKE(P.fore, T(.17, 0, 0))]);
  P.liteHand = mergeGeometries([P.hand, ...P.prim.map((g, i) => BAKE(g, primM(i, 1, 1)))]);
  return (PARTS = P);
}

/* ---- the feather shader: barb noise, soft lines between feather groups, mantle shade per bird, lit by the scene's sun + hemisphere ---- */
export function skinMaterial(type, mantle) {
  const m = new THREE.MeshStandardMaterial({ roughness: .78, metalness: 0, side: THREE.DoubleSide }); m.defines = { FT: type }; const uM = { value: new THREE.Color(mantle[0], mantle[1], mantle[2]) }; m.userData.uMantle = uM;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMantle = uM;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aTop;attribute vec3 aBot;varying vec4 vTop;varying vec3 vBot;varying vec3 vObj;varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTop=aTop;vBot=aBot;vObj=position;vON=normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vTop;varying vec3 vBot;varying vec3 vObj;varying vec3 vON;uniform vec3 uMantle;
float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 on=gl_FrontFacing?vON:-vON; float plain=step(vTop.a,-.5); float mm=max(vTop.a,0.);
  vec3 tp=mix(vTop.rgb,vTop.rgb*uMantle,mm); float side=smoothstep(-.2,.3,on.y);
  vec3 col=mix(vBot,tp,side);
  float f1,f2;
#if FT==0
  float rows=fract(vObj.z*30.+sin(vObj.x*38.+vObj.y*20.)*.16);   // overlapping rows of body feathers
  f1=smoothstep(0.,.2,rows)*(1.-smoothstep(.8,1.,rows));
#else
  float rows=fract(vObj.x*52.+sin(vObj.z*26.)*.1);               // flight feathers: strips along the chord
  f1=smoothstep(0.,.16,rows)*(1.-smoothstep(.86,1.,rows));
#endif
  f2=gn(vec2(vObj.x*120.+vObj.y*40.,vObj.z*120.));
  float k=mix(.82+.18*f1,1.,plain)*mix(.9+.14*f2,1.,plain);
  diffuseColor.rgb=col*k; }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * .2;   // sky fill on the shadow side');
  };
  m.customProgramCacheKey = () => 'gullskin' + type;
  return m;
}

/* ---- rig builder: returns the same API for both LODs ---- */
function rig(lod, matB, matW) {
  const P = parts(), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const add = (par, g, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, mat); o.position.set(x, y, z); o.frustumCulled = false; par.add(o); return o; };
  const R = { root, body, wings: [], legs: [], neck: null, head: null, jaw: null, tail: null, lod };
  if (lod === 0) {
    add(body, P.torso, matB); add(body, P.trs, matB);
    const neck = new THREE.Group(); neck.position.set(0, .04, .2); body.add(neck); add(neck, P.neck, matB);
    const head = new THREE.Group(); head.position.set(0, 0, .13); neck.add(head); add(head, P.head, matB);
    const jaw = new THREE.Group(); jaw.position.set(0, -.012, .07); head.add(jaw); add(jaw, P.jaw, matB);
    const tail = new THREE.Group(); tail.position.set(0, -.004, -.33); body.add(tail); add(tail, P.tail, matB);
    Object.assign(R, { neck, head, jaw, tail });
    for (const s of [1, -1]) {
      const hip = new THREE.Group(); hip.position.set(s * .042, -.058, -.03); body.add(hip); add(hip, P.tars, matB);
      const ank = new THREE.Group(); ank.position.set(0, -.085, 0); hip.add(ank); add(ank, P.foot, matB); R.legs.push({ hip, ank });
    }
  } else {
    add(body, P.liteBody, matB);
    R.tail = { rotation: { x: 0 }, scale: { x: 1, set() {} } };
  }
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(.07 * s, .045, .07); sh.scale.x = s; body.add(sh);
    const w = { sh, el: new THREE.Group(), wr: new THREE.Group(), prim: [] };
    if (lod === 0) {
      add(sh, P.arm, matW); w.el.position.set(.17, 0, 0); sh.add(w.el); add(w.el, P.fore, matW);
      w.wr.position.set(.15, 0, 0); w.el.add(w.wr); add(w.wr, P.hand, matW);
      for (let i = 0; i < 9; i++) { const pg = new THREE.Group(); pg.position.set(pivot(i)[0], 0, pivot(i)[1]); w.wr.add(pg); add(pg, P.prim[i], matW); w.prim.push(pg); }
    } else { add(sh, P.liteArm, matW); w.wr.position.set(.32, 0, 0); sh.add(w.wr); add(w.wr, P.liteHand, matW); }
    R.wings.push(w);
  }
  return R;
}

/* a whole bird: both LODs under one root. `v` = individual variation (size, mantle shade) */
export function buildGull(v) {
  const m = v.mantle, matB = skinMaterial(0, m), matW = skinMaterial(1, m), full = rig(0, matB, matW), lite = rig(1, matB, matW), root = new THREE.Group();
  root.add(full.root, lite.root); lite.root.visible = false; root.scale.setScalar(v.size);
  return { root, full, lite, rig: full, setLod(l) { const r = l ? lite : full; if (r !== this.rig) { this.rig.root.visible = false; r.root.visible = true; this.rig = r; } } };
}
export const PRIM_SPREAD = (i, spread, curl) => parts().primM(i, spread, curl);
export const primAngle = baseAng;
