// @ts-nocheck
/* Fish-finder contacts: computed from the REAL school positions / depth bands (never from a cached "ahead" guess).
   For every detected school: where it is (distance, bearing, ahead / abeam / astern), its depth band (top..bottom of the live fish) and,
   while a trawl is out, how far the net's depth is from the school's depth and how well the current mesh holds that species. */
import { SPECIES } from './config.js';
import { retention } from './netgen.js';

export const DETECT = 340;   // metres: sounder + sonar range

export function scanContacts(w) {
  const b = w.boat, h = b.heading, fx = -Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);   // lat > 0 = starboard
  const r = w.rig && !w.rig.dead ? w.rig : null, nm = r ? r.m : null;
  const net = w.net(), mm = net && net.type === 'trawl' ? net.mesh[net.meshIdx] : 0, out = [];
  for (const s of w.fw.schools) {
    const n = s.live ?? s.fish.length; if (s.lone || n < 4) continue;
    const dx = s.x - b.position.x, dz = s.z - b.position.z, dist = Math.hypot(dx, dz), dn = nm ? Math.hypot(s.x - nm.x, s.z - nm.z) : 1e9;
    if (dist > DETECT && dn > DETECT) continue;
    const ax = dx * fx + dz * fz, lat = dx * rx + dz * rz, mean = s.mean ?? s.d, top = s.top ?? s.d, bot = Math.max(s.bot ?? s.d, top + .5);
    const overNet = !!r && dn < s.rad * 1.5 + (r.W || 6) * .5 + 12;
    const ahead = overNet || (ax > -(s.rad + 12) && Math.abs(lat) <= s.rad + 40 + .6 * Math.max(0, ax) && dist <= DETECT);
    const sp = s.sp, ret = mm ? retention(sp.len, mm, 'trawl', 0) : null;
    out.push({ id: s.id, s, sp: sp.id, n, top, bot, mean, dist, ax, lat, brg: Math.atan2(lat, Math.max(ax, .01)) * 180 / Math.PI, ahead, overNet, ret, rad: s.rad, x: s.x, z: s.z,
      score: n / (1 + dist / 70) * (overNet ? 2.2 : 1) * (ret === null ? 1 : .35 + .65 * ret), netGap: r ? r.depth - mean : null });
  }
  out.sort((a, c) => (c.ahead - a.ahead) || (c.score - a.score));
  return out.slice(0, 8);
}
