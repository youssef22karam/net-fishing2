// @ts-nocheck
/* First-person walking on the lobster boat.
   Everything here is in HULL-LOCAL space (bow = +Z, local +X = port, local -X = starboard / right-hand side).
   The numbers mirror the hull builder in engine/boat.js (sheer curves, wheelhouse extents, dash), so the player can
   really stand up from the helm, walk out of the wheelhouse into the cockpit, climb along the side decks and reach the foredeck. */
import { clamp, sstep } from './config.js';

const ZA = -3.9, LEN = 8.2, DECKY = .35, SHELL = .07;
const HOUSE_BACK = -.35, HOUSE_FRONT = 1.45, DASH_Z = .9;
const tOf = (z) => clamp((z - ZA) / LEN, 0, 1);
export const sheerX = (t) => (t <= .42 ? 1.45 - .17 * (1 - t / .42) ** 2 : 1.45 * (1 - ((t - .42) / .58) ** 2.6));
export const sheerY = (t) => { const a = Math.max(0, 1 - t / .2); return .98 + .62 * Math.pow(t, 2.2) + .04 * a * a; };
const houseHW = (z) => sheerX(tOf(z)) - .2;
export const HELM = { x: -.55, z: .22, eyeY: 1.86 };
export const STAND = { x: -.55, z: -.12 };
const EYE = 1.62, ROOF_UNDER = 2.2;

/* can the player stand here? */
export function allowed(x, z) {
  const ax = Math.abs(x), t = tOf(z), sx = sheerX(t);
  if (z < ZA + .45 || z > 3.85) return false;
  if (z >= HOUSE_FRONT) return ax < sx - .12;                         // foredeck
  if (z < -.75) return ax < sx - .3;                                  // open cockpit
  if (z < HOUSE_BACK) return ax < sx - .04;                           // aft end of the wheelhouse: sole, then step up onto the side deck
  const hw = houseHW(z);
  const inside = ax < hw - .12 && z < DASH_Z;                         // wheelhouse interior (the dash blocks the front)
  const ledge = ax > hw - .02 && ax < sx - .04;                       // side deck (washboard) beside the wheelhouse
  if (inside) return Math.hypot(x - HELM.x, z - HELM.z) > .3;         // the helm seat
  return ledge;
}
export function groundY(x, z) {
  const ax = Math.abs(x), t = tOf(z), sx = sheerX(t);
  if (z >= HOUSE_FRONT) { const xe = Math.max(.012, sx - SHELL), f = Math.min(1, ax / xe); return sheerY(t) + .06 * (1 - f * f); }
  if (z < -.75) return DECKY;
  if (z < HOUSE_BACK) return DECKY + (sheerY(t) - DECKY) * sstep(sx - .5, sx - .15, ax);
  return ax > houseHW(z) - .06 ? sheerY(t) : DECKY;
}
export const underRoof = (z) => z > -.95 && z < 1.34;

export class Walker {
  constructor() { this.reset(); }
  reset() { this.x = STAND.x; this.z = STAND.z; this.eyeY = HELM.eyeY; this.phase = 0; this.speed = 0; this.vx = 0; this.vz = 0; }
  nearHelm() { return Math.hypot(this.x - HELM.x, this.z - HELM.z) < 1.15; }
  /* fwd/strafe in -1..1, yaw = view yaw relative to the bow (0 = looking at the bow, + = left) */
  step(dt, fwd, strafe, yaw, run) {
    const f = [Math.sin(yaw), Math.cos(yaw)], r = [-Math.cos(yaw), Math.sin(yaw)];
    let mx = f[0] * fwd + r[0] * strafe, mz = f[1] * fwd + r[1] * strafe; const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const sp = run ? 2.7 : 1.55;
    this.vx += (mx * sp - this.vx) * Math.min(1, dt * 9); this.vz += (mz * sp - this.vz) * Math.min(1, dt * 9);
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (allowed(nx, nz)) { this.x = nx; this.z = nz; }
    else if (allowed(nx, this.z)) { this.x = nx; this.vz *= .2; }
    else if (allowed(this.x, nz)) { this.z = nz; this.vx *= .2; }
    else { this.vx *= .2; this.vz *= .2; }
    this.speed = Math.hypot(this.vx, this.vz); this.phase += this.speed * dt * 4.6;
    const g = groundY(this.x, this.z); let eye = g + EYE;
    if (underRoof(this.z)) eye = Math.min(eye, ROOF_UNDER);
    eye += Math.sin(this.phase) * .022 * Math.min(1, this.speed);
    this.eyeY += (eye - this.eyeY) * (1 - Math.exp(-dt * 7));
    return this;
  }
}
