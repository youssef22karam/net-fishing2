// @ts-nocheck
/* Hyper-realistic procedural Herring Gull (Larus argentatus) anatomy & feather shader. */
import * as THREE from 'three';

function pushTri(pos, col, aux, idx, a, b, c) {
  const base = pos.length / 3;
  for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); col.push(v.r, v.g, v.b); aux.push(v.u || 0, v.v || 0, v.mat || 0, v.feath || 0); }
  idx.push(base, base + 1, base + 2);
}
function pushQuad(pos, col, aux, idx, a, b, c, d) {
  const base = pos.length / 3;
  for (const v of [a, b, c, d]) { pos.push(v.x, v.y, v.z); col.push(v.r, v.g, v.b); aux.push(v.u || 0, v.v || 0, v.mat || 0, v.feath || 0); }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function finishGeo(pos, col, aux, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aAux', new THREE.Float32BufferAttribute(aux, 4));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function loftRings(rings, capStart = true, capEnd = true) {
  const pos = [], col = [], aux = [], idx = [], nr = rings.length, seg = rings[0].length;
  for (let i = 0; i < nr - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1];
    for (let j = 0; j < seg; j++) { const jn = (j + 1) % seg; pushQuad(pos, col, aux, idx, r0[j], r0[jn], r1[jn], r1[j]); }
  }
  if (capStart) {
    const r0 = rings[0]; let cx = 0, cy = 0, cz = 0; for (const p of r0) { cx += p.x; cy += p.y; cz += p.z; }
    const ctr = { ...r0[0], x: cx / seg, y: cy / seg, z: cz / seg };
    for (let j = 0; j < seg; j++) pushTri(pos, col, aux, idx, ctr, r0[(j + 1) % seg], r0[j]);
  }
  if (capEnd) {
    const r1 = rings[nr - 1]; let cx = 0, cy = 0, cz = 0; for (const p of r1) { cx += p.x; cy += p.y; cz += p.z; }
    const ctr = { ...r1[0], x: cx / seg, y: cy / seg, z: cz / seg };
    for (let j = 0; j < seg; j++) pushTri(pos, col, aux, idx, ctr, r1[j], r1[(j + 1) % seg]);
  }
  return finishGeo(pos, col, aux, idx);
}
function appendGeoTo(pos, col, aux, idx, g) {
  const gp = g.attributes.position.array, gc = g.attributes.color.array, ga = g.attributes.aAux.array, gi = g.index.array, base = pos.length / 3;
  for (let k = 0; k < gp.length; k++) pos.push(gp[k]);
  for (let k = 0; k < gc.length; k++) col.push(gc[k]);
  for (let k = 0; k < ga.length; k++) aux.push(ga[k]);
  for (let k = 0; k < gi.length; k++) idx.push(base + gi[k]);
}

// Calibrated linear-space colours so under ACES tone mapping the pearl-grey mantle, snowy white body, and jet-black wingtips read with true Herring Gull contrast
const C_WHITE = [0.96, 0.965, 0.955], C_MANTLE = [0.30, 0.35, 0.41], C_BLACK = [0.032, 0.036, 0.045];
const C_BILL = [0.94, 0.66, 0.08], C_GONYS = [0.85, 0.11, 0.09], C_LEG = [0.86, 0.48, 0.44], C_WEB = [0.82, 0.44, 0.40];
const C_IRIS = [0.98, 0.92, 0.55], C_PUPIL = [0.02, 0.025, 0.035], C_ORBIT = [0.78, 0.32, 0.18];

/* 1. Torso: keeled breast, broad shoulders, pearl-grey saddle/back, tapering to tail root */
function buildTorsoGeo() {
  const stations = [
    [-0.225, 0.012, 0.014, 0.012, 0.012, 9.0],
    [-0.185, 0.014, 0.032, 0.022, 0.024, 9.0],
    [-0.135, 0.015, 0.052, 0.036, 0.042, 0.95],
    [-0.075, 0.014, 0.068, 0.046, 0.058, 1.05],
    [-0.010, 0.012, 0.078, 0.052, 0.068, 1.08],
    [ 0.050, 0.012, 0.080, 0.050, 0.070, 0.98],
    [ 0.095, 0.018, 0.070, 0.044, 0.058, 0.72],
    [ 0.132, 0.028, 0.052, 0.036, 0.040, 9.0],
    [ 0.150, 0.036, 0.036, 0.026, 0.026, 9.0],
  ], seg = 16;
  const rings = stations.map(([z, yc, hw, th, bh, mAng], si) => {
    const u = si / (stations.length - 1), ring = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const keel = ca < 0 ? 1 + 0.12 * Math.pow(-ca, 2) * Math.sin(u * Math.PI) : 1;
      const x = sa * hw * (ca < -0.4 ? 0.92 : 1.0), y = yc + (ca >= 0 ? ca * th : ca * bh * keel);
      const isMantle = mAng < 5.0 && Math.abs(a) < mAng && z > -0.15 && z < 0.105, col = isMantle ? C_MANTLE : C_WHITE;
      ring.push({ x, y, z, r: col[0], g: col[1], b: col[2], u, v: j / seg, mat: isMantle ? 1 : 0, feath: isMantle ? 1.2 : 0.4 });
    }
    return ring;
  });
  return loftRings(rings, true, true);
}

/* 2. Folded wings (perched / floating): distinct pearl-grey mantle saddle + crisp white tertial crescent + crossed black primary tips with white mirror spots */
function buildFoldedWingsGeo() {
  const pos = [], col = [], aux = [], idx = [];
  for (const s of [1, -1]) {
    const st = [
      [ 0.095, 0.050,  0.004, 0.072, 0.028, 1],
      [ 0.045, 0.057, -0.006, 0.088, 0.022, 1],
      [-0.015, 0.056, -0.008, 0.090, 0.020, 1],
      [-0.075, 0.050, -0.003, 0.080, 0.016, 1],
      [-0.135, 0.044,  0.003, 0.064, 0.012, 1],
      [-0.162, 0.040,  0.007, 0.052, 0.010, 1],
      [-0.178, 0.038,  0.009, 0.045, 0.008, 0], // crisp white tertial crescent
      [-0.192, 0.036,  0.010, 0.039, 0.005, 0],
      [-0.205, 0.034,  0.011, 0.034, 0.003, 2], // black folded primaries begin
      [-0.265, 0.029,  0.013, 0.022, -0.003, 2],
      [-0.315, 0.025,  0.015, 0.012, -0.006, 2],
      [-0.340, 0.023,  0.016, 0.005, -0.008, 0], // white apical mirror spot
    ], seg = 12;
    const rings = st.map(([z, yt, yb, xo, xi, zone], si) => {
      const u = si / (st.length - 1), yc = (yt + yb) * 0.5, hh = (yt - yb) * 0.5, xc = (xo + xi) * 0.5, hw = (xo - xi) * 0.5, ring = [];
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const x = s * (xc + sa * hw), y = yc + ca * hh;
        const c = zone === 1 ? C_MANTLE : zone === 2 ? C_BLACK : C_WHITE;
        ring.push({ x, y, z, r: c[0], g: c[1], b: c[2], u, v: j / seg, mat: zone, feath: 1.4 });
      }
      return ring;
    });
    appendGeoTo(pos, col, aux, idx, loftRings(rings, true, true));
  }
  return finishGeo(pos, col, aux, idx);
}

/* 3. Neck + Proportioned Herring Gull Head + Hooked Bill + Prominent Eyes */
function buildHeadAndNeckGeo() {
  const pos = [], col = [], aux = [], idx = [];
  const neckSt = [
    [-0.018, -0.004, 0.044, 0.032, 0.034],
    [ 0.005,  0.016, 0.039, 0.029, 0.029],
    [ 0.022,  0.040, 0.035, 0.027, 0.026],
    [ 0.036,  0.062, 0.035, 0.028, 0.024],
    [ 0.056,  0.072, 0.036, 0.027, 0.024],
    [ 0.078,  0.071, 0.032, 0.024, 0.022],
    [ 0.098,  0.065, 0.023, 0.018, 0.016],
    [ 0.112,  0.060, 0.014, 0.011, 0.010],
  ], seg = 14;
  const neckRings = neckSt.map(([z, yc, hw, th, bh], si) => {
    const u = si / (neckSt.length - 1), ring = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const crownFlat = (si >= 4 && si <= 6 && ca > 0.5) ? 0.87 : 1.0;
      ring.push({ x: sa * hw, y: yc + (ca >= 0 ? ca * th * crownFlat : ca * bh), z, r: C_WHITE[0], g: C_WHITE[1], b: C_WHITE[2], u, v: j / seg, mat: 0, feath: 0.5 });
    }
    return ring;
  });
  appendGeoTo(pos, col, aux, idx, loftRings(neckRings, true, true));

  const billSt = [
    [0.108, 0.059, 0.0118, 0.0098, 0.0078, false],
    [0.132, 0.057, 0.0095, 0.0090, 0.0070, false],
    [0.156, 0.055, 0.0076, 0.0085, 0.0082, true],
    [0.175, 0.052, 0.0052, 0.0070, 0.0056, true],
    [0.188, 0.046, 0.0024, 0.0040, 0.0026, false],
    [0.193, 0.040, 0.0008, 0.0012, 0.0010, false],
  ], bSeg = 10;
  const billRings = billSt.map(([z, yc, hw, th, bh, gon], si) => {
    const u = si / (billSt.length - 1), ring = [];
    for (let j = 0; j < bSeg; j++) {
      const a = (j / bSeg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), isSpot = gon && ca < -0.05, c = isSpot ? C_GONYS : C_BILL;
      ring.push({ x: sa * hw, y: yc + (ca >= 0 ? ca * th : ca * bh), z, r: c[0], g: c[1], b: c[2], u, v: j / bSeg, mat: 3, feath: isSpot ? 2.0 : 0.0 });
    }
    return ring;
  });
  appendGeoTo(pos, col, aux, idx, loftRings(billRings, true, true));

  // Eyes placed cleanly proud of the orbital cheek
  for (const s of [1, -1]) {
    const ex = s * 0.0338, ey = 0.0725, ez = 0.077;
    const eRings = [
      [0.0000, 0.0085, C_ORBIT],
      [0.0015, 0.0072, C_IRIS],
      [0.0030, 0.0056, C_IRIS],
      [0.0045, 0.0042, C_PUPIL],
      [0.0058, 0.0015, C_PUPIL],
    ].map(([outX, rad, c], ri) => {
      const ring = [];
      for (let j = 0; j < 10; j++) {
        const angle = (s > 0 ? 1 : -1) * (j / 10) * Math.PI * 2;
        ring.push({ x: ex + s * outX, y: ey + Math.cos(angle) * rad, z: ez + Math.sin(angle) * rad + outX * 0.25, r: c[0], g: c[1], b: c[2], u: ri / 4, v: j / 10, mat: 5, feath: ri >= 3 ? 1.0 : 0.0 });
      }
      return ring;
    });
    appendGeoTo(pos, col, aux, idx, loftRings(eRings, false, true));
  }
  return finishGeo(pos, col, aux, idx);
}

/* 4. Three-segment Articulated Wing Geometries */
function buildAirfoilSegmentGeo(s, span, rootChordF, rootChordB, tipChordF, tipChordB, thickRoot, thickTip, zSweep, isMid = false) {
  const nx = 9, nc = 12, rings = [];
  for (let i = 0; i <= nx; i++) {
    const u = i / nx, x = s * u * span, zOff = u * zSweep;
    const zF = rootChordF + (tipChordF - rootChordF) * u + zOff;
    const zB = rootChordB + (tipChordB - rootChordB) * u + zOff - Math.sin(u * 26.0) * 0.0035 * (1 - u * 0.3);
    const yArch = Math.sin(u * Math.PI) * (isMid ? 0.008 : 0.012), chord = zF - zB, thick = thickRoot + (thickTip - thickRoot) * u, ring = [];
    for (let j = 0; j < nc; j++) {
      const a = (j / nc) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), tChord = 0.5 - 0.5 * ca, z = zF - tChord * chord;
      const camber = Math.sin(tChord * Math.PI) * 0.011 * (1 - 0.35 * u);
      const env = Math.pow(Math.max(0, 1 - tChord), 0.65) * Math.sqrt(Math.max(0.02, tChord));
      const y = yArch + camber + (sa >= 0 ? sa * thick * 1.45 * env : sa * thick * 0.65 * env);
      const isUpper = sa > -0.08 && tChord <= 0.80, c = isUpper ? C_MANTLE : C_WHITE, mat = isUpper ? 1 : 0;
      ring.push({ x, y, z, r: c[0], g: c[1], b: c[2], u, v: tChord, mat, feath: tChord > 0.45 ? 1.5 : 0.6 });
    }
    if (s < 0) ring.reverse();
    rings.push(ring);
  }
  return loftRings(rings, true, true);
}

/* Outer hand (manus): solid overlapping primary web up to 68% span (grey -> black with white trailing edge), then 6 slotted primary tips */
function buildOuterHandGeo(s) {
  const pos = [], col = [], aux = [], idx = [];
  // Continuous inner hand web from wrist (x=0) out to x=0.21m (transitions from pearl-grey coverts to black primary web)
  const webSt = [
    [0.00,  0.052, -0.068, 0.011,  0.000, C_MANTLE, 1],
    [0.07,  0.048, -0.064, 0.009, -0.004, C_MANTLE, 1],
    [0.13,  0.042, -0.056, 0.007, -0.010, C_BLACK,  2],
    [0.18,  0.035, -0.042, 0.005, -0.016, C_BLACK,  2],
    [0.22,  0.026, -0.024, 0.004, -0.020, C_BLACK,  2],
  ];
  const wRings = webSt.map(([x, zf, zb, th, zOff, c, mat], si) => {
    const u = si / (webSt.length - 1), chord = zf - zb, ring = [];
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), tChord = 0.5 - 0.5 * ca;
      const z = zf - tChord * chord + zOff, y = sa * th * Math.sin(tChord * Math.PI);
      const isTrailingWhite = si <= 1 && tChord > 0.82;
      const vc = isTrailingWhite ? C_WHITE : (sa < -0.2 && si <= 1 ? C_WHITE : c);
      const vm = isTrailingWhite || (sa < -0.2 && si <= 1) ? 0 : mat;
      ring.push({ x: s * x, y, z, r: vc[0], g: vc[1], b: vc[2], u, v: tChord, mat: vm, feath: 1.5 });
    }
    if (s < 0) ring.reverse();
    return ring;
  });
  appendGeoTo(pos, col, aux, idx, loftRings(wRings, true, true));

  // 6 overlapping primary feathers whose outer 35% tips separate cleanly into slotted wingtips with white sub-terminal mirrors
  const primaries = [
    [0.13, -0.032, 0.115, -0.042, -0.002, 0.022, 0.78],
    [0.15, -0.022, 0.135, -0.036,  0.001, 0.021, 0.76],
    [0.17, -0.012, 0.150, -0.028,  0.005, 0.020, 0.74],
    [0.185,-0.002, 0.160, -0.016,  0.010, 0.018, 0.72],
    [0.195, 0.006, 0.155, -0.004,  0.016, 0.016, 0.72],
    [0.202, 0.014, 0.128,  0.008,  0.021, 0.014, 0.75],
  ];
  for (const [xr, zr, len, swZ, liftY, wid, mirU] of primaries) {
    const fRings = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, fx = s * (xr + u * len), fz = zr + u * swZ - Math.pow(u, 1.5) * 0.008, fy = u * u * liftY;
      // Wide overlapping base (u < 0.45), narrowing into distinct slotted tip (u > 0.5)
      const w = wid * (1.15 - 0.75 * Math.pow(u, 1.3)), th = 0.003 * (1 - 0.7 * u);
      const isMirror = u >= mirU && u <= 0.93;
      const c = isMirror ? C_WHITE : C_BLACK, mat = isMirror ? 0 : 2;
      const ring = [
        { x: fx, y: fy,      z: fz + w * 0.42, r: c[0], g: c[1], b: c[2], u, v: 0.0, mat, feath: 2.0 },
        { x: fx, y: fy + th, z: fz,            r: c[0], g: c[1], b: c[2], u, v: 0.25, mat, feath: 2.0 },
        { x: fx, y: fy,      z: fz - w * 0.58, r: c[0], g: c[1], b: c[2], u, v: 0.5, mat, feath: 2.0 },
        { x: fx, y: fy - th, z: fz,            r: c[0], g: c[1], b: c[2], u, v: 0.75, mat, feath: 2.0 },
      ];
      if (s < 0) ring.reverse();
      fRings.push(ring);
    }
    appendGeoTo(pos, col, aux, idx, loftRings(fRings, true, true));
  }
  return finishGeo(pos, col, aux, idx);
}

function buildOuterHandLodGeo(s) {
  const st = [
    [0.00, 0.048, -0.064, 0.008, C_MANTLE, 1],
    [0.10, 0.038, -0.056, 0.006, C_BLACK, 2],
    [0.24, 0.022, -0.036, 0.004, C_BLACK, 2],
    [0.32, 0.012, -0.018, 0.002, C_WHITE, 0],
    [0.35, 0.004, -0.004, 0.001, C_BLACK, 2],
  ];
  const rings = st.map(([x, zf, zb, th, c, mat], si) => {
    const u = si / (st.length - 1), zc = (zf + zb) * 0.5;
    const ring = [
      { x: s * x, y: 0,   z: zf, r: c[0], g: c[1], b: c[2], u, v: 0, mat, feath: 1 },
      { x: s * x, y: th,  z: zc, r: c[0], g: c[1], b: c[2], u, v: 0.25, mat, feath: 1 },
      { x: s * x, y: 0,   z: zb, r: c[0], g: c[1], b: c[2], u, v: 0.5, mat, feath: 1 },
      { x: s * x, y: -th, z: zc, r: c[0], g: c[1], b: c[2], u, v: 0.75, mat, feath: 1 },
    ];
    if (s < 0) ring.reverse();
    return ring;
  });
  return loftRings(rings, true, true);
}

/* 5. Fan Tail & Webbed Feet */
function buildTailGeo() {
  const pos = [], col = [], aux = [], idx = [];
  for (let fi = 0; fi < 7; fi++) {
    const fNorm = (fi / 6) * 2 - 1, ang = fNorm * 0.34, sa = Math.sin(ang), ca = Math.cos(ang), len = 0.145 * (1 - 0.08 * fNorm * fNorm), rings = [];
    for (let i = 0; i <= 5; i++) {
      const u = i / 5, r = u * len, cx = sa * r, cz = -ca * r, cy = -Math.abs(fNorm) * 0.003 * u + 0.002 * (1 - u);
      const hw = (0.011 + 0.012 * u) * (1 - 0.18 * u * u), th = 0.0028 * (1 - 0.6 * u), rx = ca * hw, rz = sa * hw;
      rings.push([
        { x: cx - rx, y: cy,      z: cz - rz, r: C_WHITE[0], g: C_WHITE[1], b: C_WHITE[2], u, v: 0, mat: 0, feath: 1.5 },
        { x: cx,      y: cy + th, z: cz,      r: C_WHITE[0], g: C_WHITE[1], b: C_WHITE[2], u, v: 0.25, mat: 0, feath: 1.5 },
        { x: cx + rx, y: cy,      z: cz + rz, r: C_WHITE[0], g: C_WHITE[1], b: C_WHITE[2], u, v: 0.5, mat: 0, feath: 1.5 },
        { x: cx,      y: cy - th, z: cz,      r: C_WHITE[0], g: C_WHITE[1], b: C_WHITE[2], u, v: 0.75, mat: 0, feath: 1.5 },
      ]);
    }
    appendGeoTo(pos, col, aux, idx, loftRings(rings, true, true));
  }
  return finishGeo(pos, col, aux, idx);
}

function buildLegAndFootGeo(s) {
  const pos = [], col = [], aux = [], idx = [];
  const legSt = [
    [ 0.000,  0.000, 0.013, C_WHITE, 0],
    [-0.022, -0.006, 0.009, C_WHITE, 0],
    [-0.030, -0.008, 0.0055, C_LEG, 4],
    [-0.062, -0.003, 0.0048, C_LEG, 4],
    [-0.093,  0.002, 0.0052, C_LEG, 4],
  ];
  const lRings = legSt.map(([y, z, r, c, mat], si) => {
    const ring = [];
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      ring.push({ x: Math.sin(a) * r, y, z: z + Math.cos(a) * r, r: c[0], g: c[1], b: c[2], u: si / 4, v: j / 8, mat, feath: 0 });
    }
    return ring;
  });
  appendGeoTo(pos, col, aux, idx, loftRings(lRings, true, true));

  const fy = -0.094, fz0 = 0.002;
  const heelTop = { x: 0, y: fy + 0.004, z: fz0 - 0.006, r: C_LEG[0], g: C_LEG[1], b: C_LEG[2], u: 0, v: 0, mat: 4, feath: 0 };
  const heelBot = { x: 0, y: fy - 0.001, z: fz0 - 0.006, r: C_LEG[0], g: C_LEG[1], b: C_LEG[2], u: 0, v: 0, mat: 4, feath: 0 };
  const toes = [{ x: -0.018 * s, z: fz0 + 0.036 }, { x: 0, z: fz0 + 0.042 }, { x: 0.018 * s, z: fz0 + 0.035 }].map((t) => ({
    top: { x: t.x, y: fy + 0.0018, z: t.z, r: C_WEB[0], g: C_WEB[1], b: C_WEB[2], u: 1, v: 0.5, mat: 4, feath: 0 },
    bot: { x: t.x, y: fy - 0.001,  z: t.z, r: C_WEB[0], g: C_WEB[1], b: C_WEB[2], u: 1, v: 0.5, mat: 4, feath: 0 },
  }));
  for (let ti = 0; ti < 2; ti++) {
    pushTri(pos, col, aux, idx, heelTop, toes[ti].top, toes[ti + 1].top);
    pushTri(pos, col, aux, idx, heelBot, toes[ti + 1].bot, toes[ti].bot);
    pushQuad(pos, col, aux, idx, toes[ti].top, toes[ti].bot, toes[ti + 1].bot, toes[ti + 1].top);
  }
  return finishGeo(pos, col, aux, idx);
}

/* 6. Scene-Lit Feather Shader */
let _gullMats = null;
export function getGullMaterial(S, variant = 0) {
  if (!_gullMats) {
    const U = S.U;
    const tints = [
      new THREE.Vector3(0.92, 0.95, 0.99),
      new THREE.Vector3(0.98, 0.99, 1.00),
      new THREE.Vector3(1.04, 1.04, 1.02),
      new THREE.Vector3(0.86, 0.90, 0.96),
    ];
    _gullMats = tints.map((tint) => new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uSun: U.uSun, uSunCol: U.uSunCol, uLight: U.uLight, uDay: U.uDay, uNight: U.uNight, uWBody: U.uBody, uMantleTint: { value: tint } },
      vertexShader: `attribute vec3 color;attribute vec4 aAux;varying vec3 vCol,vWN,vWP,vLP;varying vec4 vAux;
        void main(){vCol=color;vAux=aAux;vLP=position;vec4 wp=modelMatrix*vec4(position,1.);vWP=wp.xyz;vWN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: `uniform vec3 uSun,uSunCol,uWBody,uMantleTint;uniform float uLight,uDay,uNight;varying vec3 vCol,vWN,vWP,vLP;varying vec4 vAux;
        float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
        float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec3 N=normalize(vWN),V=normalize(cameraPosition-vWP);if(dot(N,V)<0.)N=-N;vec3 L=normalize(uSun);
          vec3 alb=vCol;float mat=vAux.z,feath=vAux.w;
          if(mat>.5&&mat<1.5)alb*=uMantleTint;
          if(mat>1.5&&mat<2.5&&vLP.z<-.21){
            float sp=smoothstep(.76,.88,sin(vLP.z*145.)*cos((abs(vLP.x)-.018)*90.));
            alb=mix(alb,vec3(.95,.96,.95),sp*smoothstep(-.005,.02,vLP.y-.018));
          }
          if(feath>.1&&mat<2.5){
            vec2 fuv=vec2(vAux.x*18.+vLP.z*30.,vAux.y*26.+vLP.x*34.);
            float barbs=vnoise(fuv*3.4)*.65+vnoise(fuv*10.)*.35;
            float covertRow=smoothstep(.15,.85,sin(vAux.x*42.+sin(vAux.y*20.)*.75)*.5+.5);
            alb=clamp(alb+vec3((barbs-.5)*.065+(covertRow-.5)*.04*feath),.02,1.);
            if(mat<.5)alb*=mix(vec3(.92,.95,.99),vec3(1.,.995,.98),clamp(N.y*.5+.5,0.,1.));
          }
          float sunDiff=clamp(dot(N,L)*.58+.42,0.,1.);
          float backLit=pow(clamp(dot(-L,V),0.,1.),3.)*smoothstep(.6,2.,feath)*.28;
          vec3 skyAmb=mix(vec3(.42,.52,.64),vec3(.64,.74,.86),clamp(N.y*.5+.5,0.,1.));
          vec3 seaBounce=(uWBody*.75+vec3(.16,.28,.36))*clamp(-N.y*.65+.35,0.,1.)*.48;
          vec3 sunLight=(vec3(.96,.93,.86)*.65+min(uSunCol,vec3(1.2))*.18)*uDay;
          vec3 lit=(skyAmb*.54+seaBounce+sunLight*(sunDiff*.78+backLit))*(.22+.85*uLight);
          float nh=max(dot(N,normalize(L+V)),0.),spec=mat>4.5?pow(nh,64.)*.9+pow(1.-max(dot(N,V),0.),3.)*.25:mat>2.5&&mat<3.5?pow(nh,28.)*.25:pow(nh,14.)*.06*(.4+.6*feath);
          float rim=pow(1.-max(dot(N,V),0.),3.4)*.11*uDay;
          gl_FragColor=vec4(alb*lit+vec3(1.,.98,.94)*(spec+rim)*uDay*uLight,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
  }
  return _gullMats[variant % _gullMats.length];
}

let _geos = null;
function getGeos() {
  if (_geos) return _geos;
  _geos = {
    torso: buildTorsoGeo(),
    foldedWings: buildFoldedWingsGeo(),
    headNeck: buildHeadAndNeckGeo(),
    wingIn: [buildAirfoilSegmentGeo(1, 0.26, 0.072, -0.095, 0.058, -0.078, 0.017, 0.012, 0.014, false), buildAirfoilSegmentGeo(-1, 0.26, 0.072, -0.095, 0.058, -0.078, 0.017, 0.012, 0.014, false)],
    wingMid: [buildAirfoilSegmentGeo(1, 0.23, 0.058, -0.078, 0.050, -0.066, 0.012, 0.009, 0.022, true), buildAirfoilSegmentGeo(-1, 0.23, 0.058, -0.078, 0.050, -0.066, 0.012, 0.009, 0.022, true)],
    wingHand: [buildOuterHandGeo(1), buildOuterHandGeo(-1)],
    wingHandLod: [buildOuterHandLodGeo(1), buildOuterHandLodGeo(-1)],
    tail: buildTailGeo(),
    leg: [buildLegAndFootGeo(1), buildLegAndFootGeo(-1)],
    prey: new THREE.ConeGeometry(0.014, 0.12, 6).rotateZ(Math.PI / 2),
    preyMat: new THREE.MeshStandardMaterial({ color: 0xd0e2ee, metalness: 0.6, roughness: 0.25 }),
  };
  return _geos;
}

export function buildGullRig(S, idx = 0) {
  const G = getGeos(), mat = getGullMaterial(S, idx);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mk = (geo, m = mat) => { const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; return mesh; };
  const torso = mk(G.torso); body.add(torso);
  const foldedWings = mk(G.foldedWings); body.add(foldedWings);
  const neck = new THREE.Group(); neck.position.set(0, 0.032, 0.125); neck.add(mk(G.headNeck));
  const prey = mk(G.prey, G.preyMat); prey.position.set(0, 0.044, 0.172); prey.visible = false; neck.add(prey); body.add(neck);
  const tail = new THREE.Group(); tail.position.set(0, 0.014, -0.205); tail.add(mk(G.tail)); body.add(tail);
  const legs = [1, -1].map((s, i) => { const lg = new THREE.Group(); lg.position.set(0.036 * s, -0.042, -0.008); lg.add(mk(G.leg[i])); body.add(lg); return lg; });
  const wings = [1, -1].map((s, i) => {
    const sh = new THREE.Group(); sh.position.set(0.062 * s, 0.038, 0.038); body.add(sh);
    const wi = mk(G.wingIn[i]); sh.add(wi);
    const el = new THREE.Group(); el.position.set(0.252 * s, 0.008, 0.012); sh.add(el);
    const wm = mk(G.wingMid[i]); el.add(wm);
    const wr = new THREE.Group(); wr.position.set(0.222 * s, 0.004, 0.020); el.add(wr);
    const wh = mk(G.wingHand[i]); wr.add(wh);
    const whLod = mk(G.wingHandLod[i]); whLod.visible = false; wr.add(whLod);
    return { s, sh, el, wr, wi, wm, wh, whLod };
  });
  return { root, body, torso, foldedWings, neck, tail, legs, wings, prey };
}
