// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { World } from './game/world.js';
import { store, useStore } from './game/store.js';
import { SPECIES, BOAT_LIST, BOATS, METHOD_LIST, METHODS, fmtMoney } from './game/config.js';
import { genNet, compat, compatibleRange, NET_BANDS } from './game/netgen.js';
import { buildNetPreview } from './game/nets3d.js';
import CastGame from './games/CastGame';
import { TrawlGame, SeineGame, GillGame } from './games/OtherGames';

const world = () => (window as any).nf.world as World;
const Btn = ({ children, on, active, className = '', ...p }: any) => (
  <button onClick={on} {...p} className={`pe rounded-full px-3 py-1 text-[12px] font-medium border backdrop-blur transition ${active ? 'bg-amber-300/90 text-slate-900 border-amber-100' : 'bg-slate-900/55 text-white border-white/25 hover:bg-slate-800/70'} ${className}`}>{children}</button>
);

function NetPreview({ net }: any) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); r.setSize(cv.clientWidth, cv.clientHeight, false); r.setClearColor(0x0b3b57, 1);
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, cv.clientWidth / cv.clientHeight, .1, 5000), g = buildNetPreview(net, net.meshIdx); sc.add(g);
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3()), rad = Math.max(size.x, size.y, size.z, .5) * 1.25; let raf = 0, t = 0;
    const loop = () => { t += .008; cam.position.set(ctr.x + Math.cos(t) * rad * 1.5, ctr.y + rad * .55, ctr.z + Math.sin(t) * rad * 1.5); cam.lookAt(ctr); r.render(sc, cam); raf = requestAnimationFrame(loop); }; loop();
    return () => { cancelAnimationFrame(raf); g.traverse((o: any) => o.geometry && o.geometry.dispose()); r.dispose(); };
  }, [net.key, net.meshIdx]);
  return <canvas ref={ref} className="w-full h-[210px] rounded-xl border border-white/15" />;
}

function Workshop() {
  const s = useStore();
  const [type, setType] = useState(s.method); const [txt, setTxt] = useState(String(Math.round(s.nets[s.method]?.price || 200)));
  const band = NET_BANDS[type], price = Math.max(1, Number(txt) || band.min), net = genNet(type, price); net.meshIdx = s.nets[type]?.meshIdx ?? 1; const [mi, setMi] = useState(net.meshIdx); net.meshIdx = mi;
  const presets = [['Cheap', band.min * 1.3], ['Mid', Math.sqrt(band.min * band.max)], ['Pricey', band.max * 1.2], ['Absurd', band.max * 5000]];
  return (
    <div className="pe fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3" data-testid="workshop">
      <div className="w-full max-w-[980px] max-h-[94vh] overflow-auto rounded-2xl border border-white/20 bg-slate-900/90 p-4 text-white shadow-2xl">
        <div className="flex items-center justify-between mb-3"><div><div className="text-lg font-semibold">Net Workshop</div><div className="text-[11px] text-sky-200/80">One number — the price — deterministically generates the whole net. Same price, same net.</div></div><Btn on={() => store.set({ workshop: false })}>Close (Z)</Btn></div>
        <div className="flex gap-1.5 mb-3">{METHOD_LIST.map((m) => <Btn key={m.id} active={type === m.id} on={() => { setType(m.id); setTxt(String(Math.round(s.nets[m.id]?.price || NET_BANDS[m.id].min * 2))); }}>{m.name}</Btn>)}</div>
        <div className="grid md:grid-cols-[1fr_1.1fr] gap-4">
          <div>
            <NetPreview net={net} />
            <div className="mt-2 flex items-center gap-2"><span className="text-xs text-sky-100/80">Price $</span><input data-testid="price" value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^0-9.e+]/g, ''))} className="pe w-44 rounded-lg bg-slate-800 border border-white/20 px-2 py-1 font-mono text-sm" /><span className="text-xs text-sky-100/70">{fmtMoney(net.price)}</span></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{presets.map(([n, p]: any) => <Btn key={n} on={() => setTxt(String(Math.round(p)))}>{n} {fmtMoney(p)}</Btn>)}</div>
            <div className="mt-3 flex items-center gap-2"><Btn active={mi === 0} on={() => setMi(0)}>{net.mesh[0]}mm</Btn><Btn active={mi === 1} on={() => setMi(1)}>{net.mesh[1]}mm</Btn><Btn active={mi === 2} on={() => setMi(2)}>{net.mesh[2]}mm</Btn><span className="text-[11px] text-sky-100/70">mesh options</span></div>
          </div>
          <div className="text-[12px]">
            <div className="text-base font-semibold">{net.name} <span className="text-xs text-amber-200">· {net.material.name}</span></div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1 font-mono text-[11px] text-sky-50/90">
              <div>size: {net.sizeLabel}</div><div>weight: {net.weight.toFixed(1)} kg</div><div>sink rate: {net.sinkRate.toFixed(2)} m/s</div><div>load: {net.load.toFixed(2)} kN</div>
              <div>durability: {net.durability} uses</div><div>twine: {net.twineMm} mm · rope {net.ropeMm} mm</div><div>floats: {net.floats} · sinkers: {net.sinkers}</div><div>tier {net.tier + 1}/6 · id {net.id}</div>
              <div>mesh: {net.mesh.join(' / ')} mm</div><div>progress q {net.q.toFixed(2)} · g {net.g.toFixed(2)}</div>
            </div>
            <div className="mt-3 font-semibold text-[12px]">Boat compatibility (derived from engine pull)</div>
            <table className="w-full text-[11px] mt-1"><tbody>
              {BOAT_LIST.map((b) => { const c = compat(net, b), rg = compatibleRange(type, b); return (
                <tr key={b.id} className={`border-t border-white/10 ${s.boatId === b.id ? 'bg-white/10' : ''}`}><td className="py-1 pr-2">{b.name.split('·')[0]}<div className="text-[10px] text-sky-200/60">pull {b.pull} kN · cap {b.cap[type]} kN</div></td>
                  <td className={c.level === 0 ? 'text-emerald-300' : c.level === 1 ? 'text-amber-300' : 'text-rose-300'}>{c.label}<div className="text-[10px] opacity-80">{Math.round(c.over * 100)}% load · speed ×{c.speedMul.toFixed(2)} · opens {Math.round(c.openMul * 100)}%</div></td>
                  <td className="text-right text-sky-100/80 font-mono text-[10px]">ideal ≤ {fmtMoney(rg.ideal)}<br />max ≈ {fmtMoney(rg.max)}</td></tr>); })}
            </tbody></table>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <Btn active on={() => { world().equipPrice(type, price); const n = store.get().nets[type]; if (n) { n.meshIdx = mi; } store.set({ method: type, workshop: false }); world().setMethod(type); }}>Equip {fmtMoney(price)}</Btn>
              <label className="pe text-[11px] flex items-center gap-1"><input type="checkbox" checked={s.free} onChange={(e) => store.set({ free: e.target.checked })} />Free test mode (no cash needed)</label>
            </div>
            <div className="mt-2 flex gap-1.5 flex-wrap items-center"><span className="text-[11px] text-sky-100/70">Boat:</span>{BOAT_LIST.map((b) => <Btn key={b.id} active={s.boatId === b.id} on={() => world().setBoat(b.id)}>{b.name.split('·')[0]}</Btn>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultPanel() {
  const s = useStore(), r = s.result; if (!r) return null;
  return (
    <div className="pe fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px]" data-testid="result">
      <div className="w-[min(92vw,460px)] rounded-3xl border border-white/25 bg-gradient-to-b from-sky-900/95 to-slate-900/95 p-5 text-white shadow-2xl text-center">
        <div className={`text-2xl font-bold ${r.perfect ? 'text-amber-200' : ''}`}>{r.headline}</div>
        <div className="text-[11px] text-sky-200/80 mb-2">{r.name}</div>
        <div className="my-2 flex flex-wrap justify-center gap-1.5">{Object.entries(r.caught || {}).map(([k, n]: any) => <span key={k} className="rounded-full bg-white/10 px-2.5 py-1 text-xs">{n} × {SPECIES[k].name}</span>)}{!r.n && <span className="text-sm text-sky-100/80">No fish this time</span>}</div>
        <div className="text-3xl font-semibold">{r.n ? '$' + r.value : '—'}</div>
        {r.bonus > 1 && <div className="text-xs text-amber-200">perfect-streak bonus ×{r.bonus.toFixed(2)}</div>}
        {r.fine > 0 && <div className="text-xs text-rose-300">fines −${r.fine}</div>}
        <div className="mt-2 text-xs text-sky-100/90 leading-snug">{r.tip}</div>
        <div className="mt-3 text-[11px] text-sky-200/70">catch efficiency {Math.round((r.score || 0) * 100)}%{r.potential !== undefined ? ` of ${r.potential} reachable fish` : ''}</div>
        <Btn active className="mt-3 !px-5 !py-1.5" on={() => { const f = r.fine || 0; if (f) store.set({ cash: store.get().cash - f }); store.set({ result: null }); }}>One more cast</Btn>
      </div>
    </div>
  );
}

function Hud() {
  const s = useStore(), net = s.nets[s.method], boat = BOATS[s.boatId], deck = s.camMode === 6, holdN = Object.values(s.hold).reduce((a: number, b: any) => a + b, 0);
  const c = net ? compat(net, boat) : null;
  return (
    <>
      <div className="pe fixed left-3 top-10 w-[250px] rounded-2xl border border-white/20 bg-slate-950/45 p-2.5 text-white backdrop-blur text-[12px] space-y-1.5" data-testid="hud">
        <div className="flex justify-between items-baseline"><b className="text-base">{fmtMoney(s.cash)}</b><span className="text-[10px] text-sky-200/70">{boat.name.split('·')[0]} · {s.speedKn.toFixed(1)} kn</span></div>
        <div className="flex gap-1 flex-wrap">{METHOD_LIST.map((m) => <Btn key={m.id} active={s.method === m.id} on={() => world().setMethod(m.id)}>{m.short}</Btn>)}</div>
        {net && <div className="text-[11px] leading-tight text-sky-50/90">{net.name} · {net.sizeLabel}<br />{net.weight.toFixed(1)} kg · mesh <button className="pe underline" onClick={() => world().cycleMesh()}>{net.mesh[net.meshIdx]} mm</button> · {net.material.name}</div>}
        {c && c.over > .9 && <div className="rounded-lg bg-rose-500/25 border border-rose-300/40 px-2 py-1 text-[10px] leading-tight text-rose-100">⚠ {c.warning}</div>}
        <div className="flex gap-1 flex-wrap"><Btn on={() => world().goDeck()} active={deck}>On deck (B)</Btn><Btn on={() => store.set({ workshop: true })}>Workshop (Z)</Btn>{s.method === 'cast' && <Btn active={s.creep.on} on={() => world().toggleCreep()}>Auto-Creep (V)</Btn>}</div>
        {s.method === 'cast' && s.creep.on && <div className="text-[10px] text-amber-200">Auto-Creep · {(0.8 - 0.8 * s.creep.level / 3 > 0 ? [1.6, 1.1, .6, 0][s.creep.level] : 0).toFixed(1)} kn — S / Space slows to a stop</div>}
        <div className="flex justify-between items-center border-t border-white/15 pt-1"><span>Hold: {holdN} fish · ${Math.round(s.holdValue)}</span><Btn on={() => world().sell()}>Sell (H)</Btn></div>
        {s.streak > 0 && <div className="text-[10px] text-amber-200">perfect streak ×{s.streak}</div>}
      </div>
      {s.netState && <div className="fixed left-1/2 -translate-x-1/2 top-12 text-[11px] text-white bg-slate-950/45 backdrop-blur rounded-full px-3 py-1 border border-white/15">{s.netState.text}</div>}
      {s.estimate && !s.game && <div className="fixed left-1/2 -translate-x-1/2 top-[74px] text-[11px] text-white bg-slate-950/50 backdrop-blur rounded-xl px-3 py-1 border border-white/15 text-center">Estimated haul ≈ {s.estimate.fish} fish · ${s.estimate.value}{s.estimate.diff !== undefined && <> · difficulty {Math.round(s.estimate.diff * 100)}%</>}<div className="text-[10px] text-sky-200/70">{s.method === 'trawl' ? 'G to haul when ready' : s.method === 'seine' ? 'G to start pursing' : 'G to haul'}</div></div>}
      {s.charge !== null && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 w-[220px]"><div className="relative h-3 rounded-full bg-black/45 border border-white/30 overflow-hidden"><div className="absolute top-0 h-full bg-emerald-400/50" style={{ left: '55%', width: '30%' }} /><div className="absolute top-0 h-full w-1.5 bg-white" style={{ left: `${s.charge * 100}%` }} /></div><div className="text-center text-[10px] text-white/80 mt-0.5">release in the green for a clean throw</div></div>
      )}
      {s.toast && <Toast key={s.toast.id} t={s.toast.t} />}
      {s.help && <div className="pe fixed right-3 bottom-3 w-[290px] rounded-2xl border border-white/20 bg-slate-950/50 p-3 text-[11px] leading-snug text-sky-50 backdrop-blur" data-testid="help">
        <div className="font-semibold text-sm mb-1">Reading the sea</div>
        Stand on deck (B), hold the cast net, press <b>V</b> for Auto-Creep and look for what the water tells you: dark shifting patches, silver flashes, boiling ripples and gulls that circle — or dive. Hold <b>F</b> (or click) and release in the green to throw 4–8 m. <b>N</b> next net · <b>T</b> mesh · <b>G</b> haul · <b>H</b> sell · <b>Z</b> workshop · <b>C</b> camera · W/S/A/D drive.
        <div className="mt-1.5 text-right"><Btn on={() => store.set({ help: false })}>Got it (K)</Btn></div></div>}
    </>
  );
}
function Toast({ t }: any) { const [v, setV] = useState(true); useEffect(() => { const i = setTimeout(() => setV(false), 4200); return () => clearTimeout(i); }, []); return v ? <div className="fixed left-1/2 -translate-x-1/2 bottom-8 max-w-[560px] rounded-full bg-slate-950/60 border border-white/20 px-4 py-1.5 text-[12px] text-white backdrop-blur text-center">{t}</div> : null; }

export default function App() {
  const s = useStore(); const [ready, setReady] = useState(false);
  useEffect(() => { const w = new World((window as any).sea); (window as any).nf = { world: w, store, genNet, compat, BOATS, SPECIES }; setReady(true); }, []);
  const done = (res: any) => world().finishGame(res);
  const g = s.game;
  return (
    <>
      {ready && <Hud />}
      {s.workshop && <Workshop />}
      {g && g.type === 'cast' && <CastGame cfg={g} onDone={done} />}
      {g && g.type === 'trawl' && <TrawlGame cfg={g} onDone={done} />}
      {g && g.type === 'seine' && <SeineGame cfg={g} onDone={done} />}
      {g && g.type === 'gill' && <GillGame cfg={g} onDone={done} />}
      <ResultPanel />
    </>
  );
}
