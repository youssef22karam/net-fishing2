// @ts-nocheck
import { useSyncExternalStore } from 'react';
const listeners = new Set();
let state = {
  cash: 2500, boatId: 'lobster', method: 'cast', camMode: 0, creep: { on: false, level: 0 }, charge: null, nets: {}, hold: {}, holdValue: 0, streak: 0, best: 0,
  toast: null, game: null, result: null, estimate: null, workshop: false, help: true, free: true, rig: null, netState: null, compatWarn: '', speedKn: 0, started: false, finder: true, trawl: null, feed: [], boatPower: 0, auto: { power: 0, rudder: 0 },
  hotSpecies: 'mackerel', nearSpot: null, stealth: 'quiet', totalCaught: 0, gullCue: null,
};
export const store = {
  get: () => state,
  set(patch) { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; listeners.forEach((l) => l()); },
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
};
export const useStore = (sel = (s) => s) => useSyncExternalStore(store.subscribe, () => state, () => state) && sel(state);
