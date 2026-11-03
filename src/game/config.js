// @ts-nocheck
/* Central tuning tables: species, boats, helpers. Everything gameplay-relevant is tunable here. */

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;

/* deterministic hashing / rng (same idea as keel-ships: hash(key) -> named streams) */
export function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f.range = (a, b) => a + (b - a) * f(); f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length]; return f; }

/* ------------------------------------------------------------------ SPECIES TABLE ------------------------------------------------------------------
 len: body length (m) | value: $ per fish | depth: preferred [min,max] metres below surface | schoolN: fish per school | speed: cruise m/s
 flee: escape pattern | rarity: spawn weight (lower = rarer) | shy: how easily spooked (x noise) | dive: panic dive rate m/s | panic: reaction delay s
 pattern: idle behaviour of the school | color: back colour, belly: flank colour | lone: also appears as solitary fish                           */
export const SPECIES = {
  sardine:  { id: 'sardine',  name: 'Sardine',   len: .20, value: .7,  depth: [.5, 3.0],  schoolN: [120, 190], speed: 1.3, flee: 'burst',  rarity: 1.0,  shy: .45, dive: 1.1, panic: .55, pattern: 'ball',      color: 0x35566e, belly: 0xe6eef5, girth: .15 },
  mullet:   { id: 'mullet',   name: 'Grey Mullet', len: .32, value: 1.7, depth: [.4, 1.6], schoolN: [24, 40],   speed: 1.6, flee: 'leap',   rarity: .55,  shy: .8,  dive: .7,  panic: .4,  pattern: 'skim',      color: 0x58636b, belly: 0xd9dde0, girth: .17, lone: true },
  mackerel: { id: 'mackerel', name: 'Mackerel',  len: .38, value: 2.3, depth: [2.0, 6.0], schoolN: [60, 95],   speed: 2.5, flee: 'zigzag', rarity: .5,   shy: .6,  dive: 1.8, panic: .5,  pattern: 'stream',    color: 0x1f5d5a, belly: 0xcfd8d6, girth: .16 },
  seabass:  { id: 'seabass',  name: 'Sea Bass',  len: .55, value: 6.5, depth: [1.5, 7.0], schoolN: [1, 3],     speed: 2.2, flee: 'bolt',   rarity: .32,  shy: 1.0, dive: 2.3, panic: .3,  pattern: 'lurk',      color: 0x6c7a74, belly: 0xe3e6df, girth: .19, lone: true },
  cod:      { id: 'cod',      name: 'Atlantic Cod', len: .70, value: 5.0, depth: [9.0, 13.0], schoolN: [26, 40], speed: 1.7, flee: 'dive', rarity: .3,   shy: .5,  dive: 1.5, panic: .8,  pattern: 'stream',    color: 0x8a7a47, belly: 0xe2d9b5, girth: .2 },
  tuna:     { id: 'tuna',     name: 'Bluefin Tuna', len: 1.15, value: 17, depth: [3.0, 9.0], schoolN: [8, 14],  speed: 4.4, flee: 'sprint', rarity: .12,  shy: 1.15, dive: 3.2, panic: .25, pattern: 'surfacing', color: 0x1a3057, belly: 0xc7d0dc, girth: .22 },
  opah:     { id: 'opah',     name: 'Moonfish (Opah)', len: .9, value: 42, depth: [9.5, 13.0], schoolN: [5, 9], speed: 3.0, flee: 'circle', rarity: .035, shy: 1.3, dive: 2.0, panic: .35, pattern: 'circle',    color: 0x2f5a7a, belly: 0xe08a6c, girth: .3 },
};
export const SPECIES_LIST = Object.values(SPECIES);

/* mesh -> fish length that this mesh holds well (m). stretched-mesh mm * 0.0095 */
export const meshHoldLen = (mm) => mm * 0.0095;

/* ------------------------------------------------------------------ BOAT TABLE ------------------------------------------------------------------
 pull: bollard pull kN | cap: max net 'load' (kN) per net type before strain | vmaxK: engine speed fraction | noise: how loud (spook multiplier)
 The 3D hull is the one lobster-boat model of the base project; classes differ in engine/gear specs. */
export const BOATS = {
  skiff:   { id: 'skiff',   name: 'Open Skiff · 40 hp outboard',   pull: 1.8, vmaxK: .55, noise: 1.25, cap: { cast: .28, trawl: 1.6, seine: 1.3, gill: .9 } },
  lobster: { id: 'lobster', name: 'Lobster Boat · 350 hp diesel',  pull: 9,   vmaxK: 1.0, noise: 1.0,  cap: { cast: .5,  trawl: 7,   seine: 5.5, gill: 3.5 } },
  trawler: { id: 'trawler', name: 'Stern Trawler · 900 hp diesel', pull: 34,  vmaxK: 1.15, noise: .85, cap: { cast: .8,  trawl: 26,  seine: 20,  gill: 12 } },
};
export const BOAT_LIST = Object.values(BOATS);

export const METHODS = {
  cast:  { id: 'cast',  name: 'Cast Net',    short: 'Cast',  deck: true },
  trawl: { id: 'trawl', name: 'Trawl',       short: 'Trawl' },
  seine: { id: 'seine', name: 'Purse Seine', short: 'Seine' },
  gill:  { id: 'gill',  name: 'Gillnet',     short: 'Gill' },
};
export const METHOD_LIST = Object.values(METHODS);

export const fmtMoney = (n) => n >= 1e12 ? '$' + (n / 1e12).toFixed(2) + 'T' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? '$' + (n / 1e3).toFixed(1) + 'k' : '$' + Math.round(n);

/* sea state from the engine: a 0..1 difficulty plus raw numbers */
export function seaEnv() {
  const S = window.sea; if (!S) return { hs: .6, storm: 0, clar: .65, wind: 3, current: .15, seaDiff: .1, light: 1, sunY: 1, day: 1 };
  const hs = S.P.hs || 0, storm = S.storm ? S.storm() : 0;
  const clar = S.U.uClar.value, wind = 2.5 + storm * 16 + hs * 1.2;
  return { hs, storm, clar, wind, current: .12 + .1 * storm + .05 * hs, seaDiff: clamp(hs / 3.5 * .7 + storm * .3, 0, 1), light: S.U.uLight.value, sunY: S.U.uSun.value.y, day: S.U.uDay.value };
}
