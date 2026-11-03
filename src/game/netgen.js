// @ts-nocheck
/* PRICE -> NET generator. Same philosophy as keel-ships' price -> vessel DNA:
   1. one number (price) is mapped on a log scale to a progress value q inside the type's price band,
   2. beyond the band q keeps growing but SOFTLY (log1p), so absurd prices never overflow,
   3. a hash(key) seeded stream gives deterministic per-net jitter (same price = same net, always),
   4. every other property (dimensions, weight, sink rate, mesh options, material tier, durability, layout) is derived from q + stream.
   Formula summary:
     q       = ln(price / pMin) / ln(pMax / pMin), clamped >= 0
     g(q)    = q                      (q <= 1)
             = 1 + 0.8 * ln(1 + 4 (q-1))   (q > 1)
     dim(a,b)= a * (b / a)^g * jitter    (log-lerp)  e.g. cast radius = clamp(dim(2.0, 5.0), 2, 5)
     sink    = 0.7 * sqrt(0.72 W / (0.12 R^2 + 0.5)) * meshDrag      (cast net, m/s)
     load    = 0.05 W (cast) | 0.45 w h^0.7 (trawl) | 0.02 L D^0.6 (seine) | 0.006 L D (gill)      [kN the boat must handle]  */
import { SPECIES, clamp, hashStr, rng, meshHoldLen } from './config.js';

export const NET_BANDS = {
  cast:  { min: 15,   max: 3000 },
  trawl: { min: 400,  max: 60000 },
  seine: { min: 800,  max: 120000 },
  gill:  { min: 60,   max: 30000 },
};
const MATERIALS = [
  { name: 'Cotton / hemp', q: .35, color: 0xcdbf9a, upTo: .18 },
  { name: 'Nylon monofilament', q: .55, color: 0xdfe6e0, upTo: .45 },
  { name: 'Nylon multifilament', q: .7, color: 0xe9e2c8, upTo: .7 },
  { name: 'HT polyester', q: .85, color: 0xd4dcd8, upTo: 1.0 },
  { name: 'Dyneema (UHMWPE)', q: 1.0, color: 0xf2f0ea, upTo: 1.7 },
  { name: 'Aramid-Dyneema composite', q: 1.25, color: 0xe8c64a, upTo: 1e9 },
];
const grow = (q) => (q <= 1 ? q : 1 + 0.8 * Math.log1p((q - 1) * 4));
const dim = (a, b, g) => a * Math.pow(b / a, g);

export function genNet(type, priceIn) {
  const band = NET_BANDS[type];
  const price = Math.round(clamp(Number.isFinite(+priceIn) ? +priceIn : band.min, 1, 1e15));
  const key = `${type}:${price}:net-v1`, h = hashStr(key);
  const r = rng(hashStr(key + ':dims')), rl = rng(hashStr(key + ':layout'));
  const q = Math.max(0, Math.log(price / band.min) / Math.log(band.max / band.min)), g = grow(q);
  const mat = MATERIALS.find((m) => q < m.upTo) || MATERIALS[MATERIALS.length - 1];
  const tier = MATERIALS.indexOf(mat);
  const j = (a = .96, b = 1.04) => r.range(a, b);
  const net = { type, price, key, id: h.toString(16).toUpperCase().padStart(8, '0'), q, g, tier, material: mat, hue: r.range(-.04, .04) };
  const quality = mat.q;
  if (type === 'cast') {
    net.radius = clamp(dim(2.0, 5.0, Math.min(g, 1)) * j(), 2, 5);
    net.weight = Math.min(dim(1.3, 8.5, Math.min(g, 1)) * (g > 1 ? 1 + .35 * (g - 1) : 1) * j(.95, 1.05), 28);
    net.handline = 2.4 + net.radius * .9; net.drop = net.radius * .85;
    net.load = net.weight * .05;
    net.sinkers = clamp(Math.round(net.radius * 15), 24, 72); net.floats = 0;
    const b = dim(34, 16, Math.min(g, 1.4)) * j(.95, 1.05);
    net.mesh = [b * .8, b, b * 1.45].map((v) => Math.round(v));
    net.sinkRate = .7 * Math.sqrt(.72 * net.weight / (.12 * net.radius ** 2 + .5));
    net.size = net.radius; net.sizeLabel = `radius ${net.radius.toFixed(2)} m`;
  } else if (type === 'trawl') {
    net.mouthW = dim(4, 40, g) * j(); net.mouthH = clamp(net.mouthW * .22 * j(.9, 1.1), 1, 12); net.length = net.mouthW * 2.6;
    net.weight = net.mouthW * 18 + net.mouthW * net.mouthH * 6;
    net.load = .45 * net.mouthW * Math.pow(net.mouthH, .7);
    const b = dim(70, 40, Math.min(g, 1.4)) * j(.95, 1.05);
    net.mesh = [b * .75, b, b * 1.35].map((v) => Math.round(v));
    net.sinkRate = .35 + net.weight / (net.weight + 400); net.floats = clamp(Math.round(net.mouthW * .9), 6, 40); net.sinkers = clamp(Math.round(net.mouthW * 1.2), 8, 48);
    net.size = net.mouthW; net.sizeLabel = `mouth ${net.mouthW.toFixed(1)} × ${net.mouthH.toFixed(1)} m`;
  } else if (type === 'seine') {
    net.length = dim(40, 400, g) * j(); net.depth = dim(6, 30, g) * j();
    net.weight = net.length * net.depth * .12;
    net.load = .02 * net.length * Math.pow(net.depth, .6);
    const b = dim(30, 18, Math.min(g, 1.4)) * j(.95, 1.05);
    net.mesh = [b * .8, b, b * 1.5].map((v) => Math.round(v));
    net.sinkRate = .45 + net.weight / (net.weight + 900); net.floats = clamp(Math.round(net.length / 3), 16, 64); net.sinkers = clamp(Math.round(net.length / 3), 16, 64);
    net.size = net.length; net.sizeLabel = `${net.length.toFixed(0)} m × ${net.depth.toFixed(0)} m deep`;
  } else {
    net.length = dim(30, 300, g) * j(); net.depth = dim(2, 12, g) * j();
    net.weight = net.length * net.depth * .05;
    net.load = .006 * net.length * net.depth;
    const b = dim(40, 95, Math.min(g, 1.4)) * j(.95, 1.05);
    net.mesh = [b * .6, b, b * 1.6].map((v) => Math.round(v));
    net.sinkRate = .4; net.floats = clamp(Math.round(net.length / 2.5), 12, 60); net.sinkers = clamp(Math.round(net.length / 2.5), 12, 60);
    net.size = net.length; net.sizeLabel = `${net.length.toFixed(0)} m × ${net.depth.toFixed(1)} m deep`;
  }
  net.meshIdx = 1;
  net.durability = Math.round(14 * (1 + g * 2.2) * quality * rl.range(.9, 1.1));
  net.twineMm = +(0.5 + quality * .9 + g * .5).toFixed(2);
  net.ropeMm = Math.round(clamp(6 + g * 10 + (type === 'cast' ? 0 : 6), 5, 40));
  net.floatColor = rl.pick([0xff6a1a, 0xf4f4f4, 0xffcc22, 0xe0452e]);
  net.sinkerColor = rl.pick([0x2a2a2a, 0x555a5e, 0x3a3025]);
  net.name = `${{ cast: 'Cast net', trawl: 'Trawl', seine: 'Purse seine', gill: 'Gillnet' }[type]} ${net.id.slice(0, 4)}`;
  return net;
}

/* ---------------- boat compatibility: gameplay consequences, never a hard block ---------------- */
export function compat(net, boat) {
  const cap = boat.cap[net.type], over = net.load / cap;
  const label = over <= .6 ? 'Ideal match' : over <= .9 ? 'Good match' : over <= 1.1 ? 'Strained' : over <= 1.8 ? 'Overloaded' : 'Hopelessly oversized';
  return {
    over, label, level: over <= .9 ? 0 : over <= 1.1 ? 1 : 2,
    speedMul: clamp(1.08 - .5 * Math.max(0, over - .6), .1, 1),   // boat speed while the net is working
    openMul: clamp(1.25 - .62 * over, .22, 1),                    // how fully the net can open / spread
    strain: clamp((over - .6) / 1.1, 0, 1.6),                     // engine strain 0..1.6: smoke, noise, tension in the 2D games
    warning: over > .9 ? `${net.name} wants ~${net.load.toFixed(1)} kN; ${boat.name.split('·')[0].trim()} handles ${cap} kN. Expect slow towing, poor opening and a harder catch game.` : '',
  };
}

/* Price range this boat can use per net type (bisection on the monotonic load(price)) */
export function compatibleRange(type, boat) {
  const band = NET_BANDS[type], cap = boat.cap[type];
  const find = (lim) => { let lo = 1, hi = 1e13; for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (genNet(type, m).load <= lim) lo = m; else hi = m; } return Math.round(lo); };
  return { ideal: find(cap * .6), good: find(cap * .9), max: find(cap * 1.1), min: band.min };
}

/* mesh selectivity: fraction of fish of a given length that a net with this mesh (mm) holds. */
export function retention(len, meshMm, type, bigStrain = 0) {
  const hold = meshHoldLen(meshMm);
  if (type === 'gill') return Math.exp(-Math.pow(Math.log(len / hold), 2) / (2 * .13));
  const slip = 1 / (1 + Math.exp((len / hold - .62) / .07));   // small fish pass through
  const bigPen = len > hold * 3.2 ? clamp((len / hold - 3.2) / 3, 0, .6) : 0;  // too-fine mesh: big fish are held badly, net strains
  return (1 - slip) * (1 - bigPen * (.5 + bigStrain * .4));
}

/* effective sink-rate multiplier of mesh (fine mesh drags water, sinks badly) */
export const meshDrag = (mm) => clamp(Math.pow(30 / Math.max(mm, 8), .45), .75, 1.5);

/* estimated reward for a pool of fish [{sp, depth,...}], before committing */
export function estimatePool(pool, net, meshIdx, perf = .75) {
  let n = 0, v = 0;
  const mm = net.mesh[meshIdx];
  for (const f of pool) { const sp = SPECIES[f.sp], k = retention(sp.len, mm, net.type) * perf; n += k; v += k * sp.value; }
  return { fish: Math.round(n), value: Math.round(v) };
}
