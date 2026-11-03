// @ts-nocheck

/* Sea surface simulator. Extending it: opaque objects (fish, nets) go in window.sea.scene below y=0.
   They draw before the water, which blends over them (see Water > clarity). */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GUI} from 'lil-gui';
const $=s=>document.querySelector(s),{clamp,lerp}=THREE.MathUtils;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const touch=matchMedia('(pointer:coarse)').matches||'ontouchstart' in window;

/* ===== 1. renderer, camera ===== */
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.toneMapping=THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,1,.5,20000);
camera.position.set(24,5,8);
const controls=new OrbitControls(camera,renderer.domElement);
Object.assign(controls,{enableDamping:true,enablePan:false,minDistance:4,maxDistance:140,maxPolarAngle:Math.PI/2-.04});
controls.target.set(0,2.5,0);

/* ===== 2. parameters, storm drive ===== */
const TIERS={Low:{seg:192,pr:1,rain:.5},Medium:{seg:320,pr:1.5,rain:.75},High:{seg:512,pr:2,rain:1}};
const P={preset:'Midday',hour:12,play:false,dayMin:8,cov:.35,dens:.6,expo:1,chop:.9,height:1,hs:0,foamDecay:.35,foamB:.82,foamS:.6,foamC:.65,
 clar:.65,rough:.07,fog:.5,body:'#06303b',bodyNoon:'#345786',seabed:true,quality:(touch||window.__lite)?'Low':'Auto'};
const WS={scale:1,wind:11,dir:-20,fetch:120,spread:.85,swell:.2,peak:3.3,fade:.02};      // wind sea (fetch in km)
const SW={scale:.7,wind:6,dir:-60,fetch:600,spread:1,swell:1,peak:3.3,fade:.05};      // swell
// public sliders the storm drives: [object,key,value at 100 % storm]
const REF=[[WS,'wind',19],[WS,'scale',1],[WS,'fetch',300],[SW,'wind',12],[SW,'fetch',900],[P,'chop',2],[P,'cov',.9],[P,'dens',.95],[P,'expo',.6]];
const B=REF.map(([o,k])=>o[k]);                                     // calm baseline
let storm=0,target=0,dirty=true,flash=0;
const applyStorm=()=>REF.forEach(([o,k,r],i)=>o[k]=lerp(B[i],r,storm));

/* ===== 3. FFT ocean (GPU): 3 cascades, JONSWAP wind sea + swell, accumulated-turbulence foam ===== */
const {BufferGeometry,Color,DataTexture,Float32BufferAttribute,FloatType,GLSL3,HalfFloatType,LinearFilter,LinearMipmapLinearFilter,Mesh,NearestFilter,OrthographicCamera,RepeatWrapping,RGBAFormat,Scene,ShaderMaterial,WebGLRenderTarget}=THREE;
var fullscreenVertex = (
  /* glsl */
  `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`
);
var common = (
  /* glsl */
  `
precision highp float;
precision highp int;

const float PI = 3.141592653589793;
const float GRAVITY = 9.81;

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Multiplies by i.
vec2 mulI(vec2 a) {
  return vec2(-a.y, a.x);
}
`
);
var timeSpectrumFragment = (
  /* glsl */
  `
${common}
uniform sampler2D uH0;
uniform sampler2D uH1;
uniform float uMix;
uniform float uTime;
uniform float uLengthScale;
uniform float uDepth;
uniform int uSize;

layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 n = vec2(
    p.x < uSize / 2 ? p.x : p.x - uSize,
    p.y < uSize / 2 ? p.y : p.y - uSize
  );
  vec2 k = n * 2.0 * PI / uLengthScale;
  float kLength = max(length(k), 1e-6);
  float invK = 1.0 / kLength;

  vec4 h0 = mix(texelFetch(uH0, p, 0), texelFetch(uH1, p, 0), uMix);
  float omega = sqrt(GRAVITY * kLength * tanh(min(kLength * uDepth, 20.0)));
  float phase = omega * uTime;
  vec2 e = vec2(cos(phase), sin(phase));
  vec2 h = cmul(h0.xy, e) + cmul(h0.zw, vec2(e.x, -e.y));
  vec2 ih = mulI(h);

  // Horizontal displacement points towards crests (choppy waves).
  vec2 dx = ih * k.x * invK;
  vec2 dz = ih * k.y * invK;
  vec2 dy = h;
  vec2 dxz = -h * k.x * k.y * invK;
  vec2 dyx = ih * k.x;
  vec2 dyz = ih * k.y;
  vec2 dxx = -h * k.x * k.x * invK;
  vec2 dzz = -h * k.y * k.y * invK;

  outA = vec4(dx + mulI(dz), dy + mulI(dxz));
  outB = vec4(dyx + mulI(dyz), dxx + mulI(dzz));
}
`
);
var fftFragment = (
  /* glsl */
  `
${common}
uniform sampler2D uInputA;
uniform sampler2D uInputB;
uniform int uSize;
uniform int uSubSize;
uniform bool uHorizontal;

layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int index = uHorizontal ? p.x : p.y;
  int halfSub = uSubSize / 2;
  int evenIndex = (index / uSubSize) * halfSub + (index % halfSub);
  int oddIndex = evenIndex + uSize / 2;
  ivec2 pe = uHorizontal ? ivec2(evenIndex, p.y) : ivec2(p.x, evenIndex);
  ivec2 po = uHorizontal ? ivec2(oddIndex, p.y) : ivec2(p.x, oddIndex);

  float angle = 2.0 * PI * float(index % uSubSize) / float(uSubSize);
  vec2 twiddle = vec2(cos(angle), sin(angle));

  vec4 evenA = texelFetch(uInputA, pe, 0);
  vec4 oddA = texelFetch(uInputA, po, 0);
  vec4 evenB = texelFetch(uInputB, pe, 0);
  vec4 oddB = texelFetch(uInputB, po, 0);

  outA = vec4(evenA.xy + cmul(twiddle, oddA.xy), evenA.zw + cmul(twiddle, oddA.zw));
  outB = vec4(evenB.xy + cmul(twiddle, oddB.xy), evenB.zw + cmul(twiddle, oddB.zw));
}
`
);
var assembleFragment = (
  /* glsl */
  `
${common}
uniform sampler2D uInputA;
uniform sampler2D uInputB;
uniform sampler2D uPrevious;
uniform float uChoppiness;
uniform float uDeltaTime;
uniform float uFoamDecay;

layout(location = 0) out vec4 outDisplacement;
layout(location = 1) out vec4 outDerivatives;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uInputA, p, 0);
  vec4 b = texelFetch(uInputB, p, 0);

  float dx = a.x;
  float dz = a.y;
  float dy = a.z;
  float dxz = a.w;
  float dyx = b.x;
  float dyz = b.y;
  float dxx = b.z;
  float dzz = b.w;

  float l = uChoppiness;
  float jacobian = (1.0 + l * dxx) * (1.0 + l * dzz) - l * l * dxz * dxz;

  // Turbulence relaxes back towards 1 and is pulled down wherever the surface folds.
  float previous = texelFetch(uPrevious, p, 0).a;
  float turbulence = previous + uDeltaTime * uFoamDecay / max(jacobian, 0.5);
  turbulence = min(jacobian, turbulence);

  outDisplacement = vec4(l * dx, dy, l * dz, turbulence);
  outDerivatives = vec4(dyx, dyz, l * dxx, l * dzz);
}
`
);

// src/ocean/spectrum.ts
var GRAVITY = 9.81;
function prepare(system) {
  const fetch = system.fetch * 1e3;
  const wind = Math.max(system.windSpeed, 0.1);
  return {
    ...system,
    angle: system.direction * Math.PI / 180,
    alpha: 0.076 * Math.pow(GRAVITY * fetch / (wind * wind), -0.22),
    peakOmega: 22 * Math.pow(wind * fetch / (GRAVITY * GRAVITY), -0.33)
  };
}
function frequency(k, depth) {
  return Math.sqrt(GRAVITY * k * Math.tanh(Math.min(k * depth, 20)));
}
function frequencyDerivative(k, depth) {
  const th = Math.tanh(Math.min(k * depth, 20));
  const ch = Math.cosh(Math.min(k * depth, 20));
  return GRAVITY * (depth * k / ch / ch + th) / frequency(k, depth) / 2;
}
function tmaCorrection(omega, depth) {
  const omegaH = omega * Math.sqrt(depth / GRAVITY);
  if (omegaH <= 1) return 0.5 * omegaH * omegaH;
  if (omegaH < 2) return 1 - 0.5 * (2 - omegaH) * (2 - omegaH);
  return 1;
}
function jonswap(omega, depth, s) {
  const sigma = omega <= s.peakOmega ? 0.07 : 0.09;
  const d = omega - s.peakOmega;
  const r = Math.exp(-(d * d) / (2 * sigma * sigma * s.peakOmega * s.peakOmega));
  const ratio = s.peakOmega / omega;
  return s.scale * tmaCorrection(omega, depth) * s.alpha * GRAVITY * GRAVITY * Math.pow(omega, -5) * Math.exp(-1.25 * ratio ** 4) * Math.pow(Math.abs(s.peakEnhancement), r);
}
var LANCZOS = [
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9984369578019572e-21,
  15056327351493116e-23
];
function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  const z = x - 1;
  let a = 0.9999999999998099;
  const t = z + 7.5;
  for (const [i, c] of LANCZOS.entries()) a += c / (z + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
function cos2sNormalisation(s) {
  return Math.exp(logGamma(s + 1) - logGamma(s + 0.5)) / (2 * Math.sqrt(Math.PI));
}
function spreadPower(omega, peakOmega) {
  const ratio = omega / peakOmega;
  return ratio > 1 ? 9.77 * Math.pow(ratio, -2.5) : 6.97 * Math.pow(ratio, 5);
}
function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
function directionSpectrum(theta, omega, s) {
  const power = spreadPower(omega, s.peakOmega) + 16 * Math.tanh(Math.min(omega / s.peakOmega, 20)) * s.swell * s.swell;
  const delta = angleDifference(theta, s.angle);
  const cos2s = cos2sNormalisation(power) * Math.pow(Math.abs(Math.cos(0.5 * delta)), 2 * power);
  const uniform = 1 / (2 * Math.PI);
  return uniform + (cos2s - uniform) * s.spreadBlend;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function createGaussianNoise(size2, seed) {
  const random = mulberry32(seed);
  const noise = new Float32Array(size2 * size2 * 2);
  for (let i = 0; i < size2 * size2; i++) {
    const u1 = Math.max(random(), 1e-12);
    const u2 = random();
    const r = Math.sqrt(-2 * Math.log(u1));
    noise[i * 2] = r * Math.cos(2 * Math.PI * u2);
    noise[i * 2 + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  return noise;
}
function buildInitialSpectrum(size2, range, systems, depth, noise) {
  const prepared = systems.map(prepare);
  const deltaK = 2 * Math.PI / range.lengthScale;
  const amplitude = new Float32Array(size2 * size2 * 2);
  for (let y = 0; y < size2; y++) {
    const ny = y < size2 / 2 ? y : y - size2;
    for (let x = 0; x < size2; x++) {
      const nx = x < size2 / 2 ? x : x - size2;
      const kx = nx * deltaK;
      const kz = ny * deltaK;
      const k = Math.hypot(kx, kz);
      const index = y * size2 + x;
      if (k <= range.cutoffLow || k > range.cutoffHigh) continue;
      const theta = Math.atan2(kz, kx);
      const omega = frequency(k, depth);
      const dOmegaDk = frequencyDerivative(k, depth);
      let spectrum = 0;
      for (const system of prepared) {
        const fade = Math.exp(-system.shortWavesFade * system.shortWavesFade * k * k);
        spectrum += jonswap(omega, depth, system) * directionSpectrum(theta, omega, system) * fade;
      }
      const variance = spectrum * dOmegaDk * deltaK * deltaK / k;
      const a = Math.sqrt(Math.max(variance, 0) / 4);
      amplitude[index * 2] = (noise[index * 2] ?? 0) * a;
      amplitude[index * 2 + 1] = (noise[index * 2 + 1] ?? 0) * a;
    }
  }
  const data = new Float32Array(size2 * size2 * 4);
  for (let y = 0; y < size2; y++) {
    for (let x = 0; x < size2; x++) {
      const index = y * size2 + x;
      const mirror = (size2 - y) % size2 * size2 + (size2 - x) % size2;
      data[index * 4] = amplitude[index * 2] ?? 0;
      data[index * 4 + 1] = amplitude[index * 2 + 1] ?? 0;
      data[index * 4 + 2] = amplitude[mirror * 2] ?? 0;
      data[index * 4 + 3] = -(amplitude[mirror * 2 + 1] ?? 0);
    }
  }
  return data;
}

// src/ocean/OceanSimulation.ts
var CASCADE_LENGTHS = [420, 61, 11];
var OceanSimulation = class {
  constructor(renderer2, settings, size2 = 256) {
    this.renderer = renderer2;
    this.settings = settings;
    this.size = size2;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
    );
    this.quad = new Mesh(geometry);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const makeFftTarget = () => new WebGLRenderTarget(size2, size2, {
      count: 2,
      type: FloatType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      generateMipmaps: false
    });
    this.fftTargets = [makeFftTarget(), makeFftTarget()];
    const anisotropy = renderer2.capabilities.getMaxAnisotropy();
    const makeOutputTarget = () => {
      const target = new WebGLRenderTarget(size2, size2, {
        count: 2,
        type: HalfFloatType,
        format: RGBAFormat,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
        wrapS: RepeatWrapping,
        wrapT: RepeatWrapping,
        depthBuffer: false,
        generateMipmaps: true,
        anisotropy
      });
      for (const texture of target.textures) {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.minFilter = LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = anisotropy;
      }
      return target;
    };
    const boundaries = CASCADE_LENGTHS.map((length) => 2 * Math.PI / length * 6);
    this.cascades = CASCADE_LENGTHS.map((lengthScale, i) => {
      const h0 = new DataTexture(
        new Float32Array(size2 * size2 * 4),
        size2,
        size2,
        RGBAFormat,
        FloatType
      );
      h0.minFilter = NearestFilter;
      h0.magFilter = NearestFilter;
      return {
        lengthScale,
        cutoffLow: i === 0 ? 1e-4 : boundaries[i] ?? 0,
        cutoffHigh: boundaries[i + 1] ?? Number.POSITIVE_INFINITY,
        h0,
        noise: createGaussianNoise(size2, 1337 + i * 7919),
        outputs: [makeOutputTarget(), makeOutputTarget()],
        current: 0
      };
    });
    const base = {
      glslVersion: GLSL3,
      vertexShader: fullscreenVertex,
      depthTest: false,
      depthWrite: false
    };
    this.timeMaterial = new ShaderMaterial({
      ...base,
      fragmentShader: timeSpectrumFragment,
      uniforms: {
        uH0: { value: null },
        uH1: { value: null },
        uMix: { value: 0 },
        uTime: { value: 0 },
        uLengthScale: { value: 1 },
        uDepth: { value: settings.depth },
        uSize: { value: size2 }
      }
    });
    this.fftMaterial = new ShaderMaterial({
      ...base,
      fragmentShader: fftFragment,
      uniforms: {
        uInputA: { value: null },
        uInputB: { value: null },
        uSize: { value: size2 },
        uSubSize: { value: 2 },
        uHorizontal: { value: true }
      }
    });
    this.assembleMaterial = new ShaderMaterial({
      ...base,
      fragmentShader: assembleFragment,
      uniforms: {
        uInputA: { value: null },
        uInputB: { value: null },
        uPrevious: { value: null },
        uChoppiness: { value: settings.choppiness },
        uDeltaTime: { value: 0 },
        uFoamDecay: { value: settings.foamDecay }
      }
    });
    this.resetFoam();
    this.updateSpectrum();
  }
  renderer;
  settings;
  size;
  cascades;
  camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene = new Scene();
  quad;
  fftTargets;
  timeMaterial;
  fftMaterial;
  assembleMaterial;
  /** Recomputes h0(k) for every cascade. Call after changing wave systems or depth. */
  updateSpectrum() {
    for (const cascade of this.cascades) {
      const data = buildInitialSpectrum(
        this.size,
        cascade,
        this.settings.systems,
        this.settings.depth,
        cascade.noise
      );
      cascade.h0.image.data = data;
      cascade.h0.needsUpdate = true;
    }
  }
  displacement(index) {
    const cascade = this.cascade(index);
    return cascade.outputs[cascade.current].textures[0];
  }
  derivatives(index) {
    const cascade = this.cascade(index);
    return cascade.outputs[cascade.current].textures[1];
  }
  update(time, deltaTime) {
    const previousTarget = this.renderer.getRenderTarget();
    const log2Size = Math.log2(this.size);
    this.timeMaterial.uniforms.uDepth.value = this.settings.depth;
    this.assembleMaterial.uniforms.uChoppiness.value = this.settings.choppiness;
    this.assembleMaterial.uniforms.uFoamDecay.value = this.settings.foamDecay;
    this.assembleMaterial.uniforms.uDeltaTime.value = deltaTime;
    for (const cascade of this.cascades) {
      let read = 0;
      this.timeMaterial.uniforms.uH0.value = cascade.h0;
      this.timeMaterial.uniforms.uH1.value = cascade.h0b;
      this.timeMaterial.uniforms.uMix.value = this.mix;
      this.timeMaterial.uniforms.uTime.value = time;
      this.timeMaterial.uniforms.uLengthScale.value = cascade.lengthScale;
      this.draw(this.timeMaterial, this.fftTargets[read]);
      for (const horizontal of [true, false]) {
        for (let stage = 0; stage < log2Size; stage++) {
          const source = this.fftTargets[read];
          const destination = this.fftTargets[read === 0 ? 1 : 0];
          this.fftMaterial.uniforms.uInputA.value = source.textures[0];
          this.fftMaterial.uniforms.uInputB.value = source.textures[1];
          this.fftMaterial.uniforms.uSubSize.value = 2 << stage;
          this.fftMaterial.uniforms.uHorizontal.value = horizontal;
          this.draw(this.fftMaterial, destination);
          read = read === 0 ? 1 : 0;
        }
      }
      const previous = cascade.outputs[cascade.current];
      const next = cascade.current === 0 ? 1 : 0;
      this.assembleMaterial.uniforms.uInputA.value = this.fftTargets[read].textures[0];
      this.assembleMaterial.uniforms.uInputB.value = this.fftTargets[read].textures[1];
      this.assembleMaterial.uniforms.uPrevious.value = previous.textures[0];
      this.draw(this.assembleMaterial, cascade.outputs[next]);
      cascade.current = next;
    }
    this.renderer.setRenderTarget(previousTarget);
  }
  resetFoam() {
    const previousTarget = this.renderer.getRenderTarget();
    const clearColor = this.renderer.getClearColor(new Color());
    const clearAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0, 1);
    for (const cascade of this.cascades) {
      for (const target of cascade.outputs) {
        this.renderer.setRenderTarget(target);
        this.renderer.clear(true, false, false);
      }
    }
    this.renderer.setClearColor(clearColor, clearAlpha);
    this.renderer.setRenderTarget(previousTarget);
  }
  cascade(index) {
    const cascade = this.cascades[index];
    if (!cascade) throw new Error(`No cascade ${index}`);
    return cascade;
  }
  draw(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }
};

// src/ocean/OceanSurface.ts

const sysOf=(S,h)=>({scale:S.scale*h*h,windSpeed:S.wind,direction:S.dir,fetch:S.fetch,spreadBlend:S.spread,swell:S.swell,peakEnhancement:S.peak,shortWavesFade:S.fade});
let hEff=P.height,lamEff=P.chop;                                   // height eased, choppiness capped for big seas
const settings={depth:500,get choppiness(){return lamEff},get foamDecay(){return P.foamDecay*(1-.3*storm)},get systems(){return [sysOf(WS,hEff),sysOf(SW,hEff)]}};
const sim=new OceanSimulation(renderer,settings,(touch||window.__lite)?128:256);sim.mix=0;   // fixed Gaussian seeds: sliders morph, never re-roll
sim.cascades.forEach(c=>{c.h0b=new DataTexture(new Float32Array(sim.size*sim.size*4),sim.size,sim.size,RGBAFormat,FloatType);c.h0b.minFilter=c.h0b.magFilter=NearestFilter;c.h0b.needsUpdate=true});
// Rebuilding h0 is the expensive step: one cascade per frame, at most once per FADE s, then cross-faded on the GPU (no pop).
const FADE=touch?2.5:1.5;let queue=[],fade=1,lastRebuild=-9;
function stepSpectrum(dt,now){
 if(queue.length){const c=sim.cascades[queue.shift()];c.h0b.image.data=buildInitialSpectrum(sim.size,c,settings.systems,settings.depth,c.noise);c.h0b.needsUpdate=true;if(!queue.length)fade=0}
 else if(fade<1){fade=Math.min(1,fade+dt/FADE);sim.mix=fade;if(fade>=1){sim.cascades.forEach(c=>[c.h0,c.h0b]=[c.h0b,c.h0]);sim.mix=0}}
 else if(dirty&&now-lastRebuild>FADE){dirty=false;lastRebuild=now;queue=[0,1,2]}}
const hsVar=(S,h)=>{const u=Math.max(S.wind,.1),F=S.fetch*1e3,w=22*Math.pow(u*F/96.2,-.33);return 1.3*S.scale*h*h*.076*Math.pow(9.81*F/(u*u),-.22)*96.2/(5*w**4)};   // wave variance estimate -> Hs

/* ===== 4. shaders ===== */
const U={uSun:{value:new THREE.Vector3(0,1,0)},uMoon:{value:new THREE.Vector3(0,-1,0)},uSunCol:{value:new THREE.Color()},uTint:{value:new THREE.Color()},
 uTime:{value:0},uDay:{value:1},uNight:{value:0},uTwi:{value:0},uCov:{value:.3},uDens:{value:.6},uStorm:{value:0},uFlash:{value:0},uLight:{value:1},

 uBody:{value:new THREE.Color()},uFoam:{value:new THREE.Vector3()},uClar:{value:.6},uRough:{value:.05},uFog:{value:5e-4},
 uHs:{value:1},uWD:{value:new THREE.Vector2()},uRain:{value:0},uPx:{value:.001},uWind:{value:new THREE.Vector2()},uRainCol:{value:new THREE.Color()}};

const SKY=`
uniform vec3 uSun,uMoon,uSunCol,uTint;
uniform float uTime,uDay,uNight,uTwi,uCov,uDens,uStorm,uFlash,uLight;
float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}  // no sin hashes
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s/.9375;}
vec3 dayHz(){return mix(vec3(.66,.78,.95),vec3(.32,1.18,2.2),smoothstep(.4,.9,uSun.y)*(1.-uStorm));}   // high sun: clear saturated blue
vec3 horizon(){
 vec3 h=mix(vec3(.02,.03,.055),mix(dayHz(),vec3(.16,.17,.19),uStorm*.9),uDay);
 return mix(h,uTint*.85,uTwi*.55);}
vec3 hzSoft(){vec3 h=horizon();return mix(h,vec3(dot(h,vec3(.3,.59,.11))),.9*uDay*(1.-uTwi)*(1.-uStorm));}   // neutral version for clouds and foam
vec3 sky(vec3 d){
 float y=max(d.y,0.),sd=max(dot(d,uSun),0.);
 vec3 hz=horizon();float ov=smoothstep(.25,.85,uStorm);
 vec3 zen=mix(vec3(.003,.007,.022),mix(mix(vec3(.09,.27,.68),vec3(.007,.35,1.73),smoothstep(.4,.9,uSun.y)*(1.-uStorm)),vec3(.04,.045,.055),uStorm*.9),uDay);
 vec3 c=mix(hz,zen,pow(y,.42));
 c+=uTint*uTwi*(.3+1.1*pow(sd,3.))*exp(-y*6.);                 // twilight scatter band
 c+=uSunCol*(pow(sd,10.)*.1+pow(sd,180.)*.5)*uDay*(1.-ov);             // mie glow
 float cl=0.,dn=0.;
 if(d.y>.002){
  vec2 p=d.xz/(d.y+.12)*.9+uTime*vec2(.012,.007);
  float fb=fbm(p),up=smoothstep(0.,.1,d.y);
  dn=mix(smoothstep(.62-.3*uCov,.92-.25*uCov,fb),.55+.45*fb,ov);   // storm: no gaps, only the thickness varies
  cl=mix(1.-exp(-uDens*2.8*dn),1.,ov)*up;                          // Beer-law opacity; a solid deck in a storm
  float ci=smoothstep(.55,.9,fbm(d.xz/(d.y+.3)*vec2(2.2,.7)+uTime*vec2(.03,.01)))*.3*(1.-uStorm)*smoothstep(0.,.2,d.y);
  cl=max(cl,ci);                                                // fast thin cirrus
 }
 vec3 cc=hzSoft()*.55+vec3(.015,.02,.035)*uNight+uSunCol*uDay*(.18+.6*pow(sd,5.)+(1.-dn)*pow(sd,3.)*1.4); // silver lining
 cc*=1.-.18*dn*uDay*(1.-uStorm);                                  // fair-weather clouds: slightly greyer cores
 cc=cc*mix(1.,.45*(.55+.45*(1.-dn)),uStorm)+uFlash*vec3(.75,.82,1.)*(.4+dn);   // storm: dark, thick clouds
 vec3 b=uSunCol*smoothstep(.99988,.99996,dot(d,uSun))*4.*uDay;
 if(d.y>0.&&uNight>.01){vec3 g=d*190.,q=floor(g);float h=h12(q.xy+q.z*37.7);
  vec3 jt=vec3(h12(q.yz+7.3),h12(q.zx+3.1),h12(q.xy+9.7))-.5;
  float dot2=1.-smoothstep(0.,.3,length(fract(g)-.5-jt*.5));   // small round point, not a whole square cell
  b+=vec3(.9,.95,1.)*dot2*step(.992,h)*(.35+.65*fract(h*113.))*(.6+.4*sin(uTime*3.+h*80.))*uNight*smoothstep(0.,.12,d.y)*1.5;}
 float md=dot(d,uMoon);b+=vec3(.75,.85,1.)*(smoothstep(.9994,.99965,md)*2.+pow(max(md,0.),80.)*.12)*uNight;
 return mix(c,cc,cl)+b*(1.-cl);}`;

const WVS=`
uniform sampler2D uD0,uD1,uD2,uWake;uniform vec3 uLS,uWi;uniform float uTexels,uAng,uWk;
varying vec3 vP;varying vec2 vUV;
vec3 cas(sampler2D m,vec2 uv,float L,float sp){return textureLod(m,uv/L,log2(max(sp/(L/uTexels),1.))).xyz;}   // prefilter by vertex spacing: no far-field shimmer
void main(){
 vec2 s=position.xz+cameraPosition.xz;float rr=length(position.xz),sp=max(rr*uAng,.001),fd=1.;
 vP=vec3(s.x,0.,s.y)+fd*(cas(uD0,s,uLS.x,sp)+cas(uD1,s,uLS.y,sp)+cas(uD2,s,uLS.z,sp));vUV=s;
 {vec2 wu=(s-uWi.xy)/uWi.z+.5;vec2 we=abs(wu-.5);float ef=(1.-smoothstep(.4,.49,max(we.x,we.y)))*(1.-smoothstep(70.,170.,rr));   // boat wake: its own wave sim, in a window that follows the boat
  vP.y+=texture(uWake,wu).x*ef*uWk;}
 gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.);}`;

const WFS=SKY+`
varying vec3 vP;varying vec2 vUV;uniform sampler2D uD0,uD1,uD2,uF0,uF1,uF2;uniform vec3 uLS;
uniform vec3 uBody,uFoam;uniform vec2 uWD;uniform float uClar,uRough,uFog,uHs;
uniform sampler2D uWake;uniform vec3 uWi;uniform float uWN;uniform vec4 uBLp[3],uBLd[3];uniform float uBLk;
vec3 glint(vec3 L,vec3 N,vec3 V,float a,float nv){
 vec3 H=normalize(L+V);float nh=max(dot(N,H),0.),nl=max(dot(N,L),0.),vh=max(dot(V,H),0.);
 float a2=a*a,d=nh*nh*(a2-1.)+1.,D=a2/(3.14159*d*d);
 float Vis=.5/(nl*sqrt(nv*nv*(1.-a2)+a2)+nv*sqrt(nl*nl*(1.-a2)+a2)+1e-4);   // GGX + Smith
 return vec3(min(D*Vis*(.02+.98*pow(1.-vh,5.))*nl,6.));}                    // clamped glint
void main(){
 vec3 V=cameraPosition-vP;float dist=length(V);V/=dist;vec2 q=vUV;float ov=smoothstep(.25,.85,uStorm);
 float calm=1.-.55*smoothstep(300.,1600.,dist);                 // far swell slopes relax: calm horizon
 vec4 dv=texture(uF0,q/uLS.x)*calm+texture(uF1,q/uLS.y)*(.5+.5*calm)+texture(uF2,q/uLS.z);
 vec2 wu=(q-uWi.xy)/uWi.z+.5,we=abs(wu-.5);float wef=(1.-smoothstep(.4,.49,max(we.x,we.y)))*(1.-smoothstep(120.,300.,dist));
 vec4 wk=texture(uWake,wu);float wtx=1./uWN;
 vec2 wg=vec2(texture(uWake,wu+vec2(wtx,0.)).x-texture(uWake,wu-vec2(wtx,0.)).x,texture(uWake,wu+vec2(0.,wtx)).x-texture(uWake,wu-vec2(0.,wtx)).x)/(2.*uWi.z*wtx);   // wake slopes
 vec3 N=normalize(vec3(-dv.x/(1.+dv.z)-wg.x*wef,1.,-dv.y/(1.+dv.w)-wg.y*wef));       // slopes from the three derivative maps + the wake
 float nvr=dot(N,V);if(nvr<0.)N=normalize(N-V*nvr*1.02);           // no black back-facing sparkles
 float nv=clamp(dot(N,V),.02,1.);
 float rough=clamp(uRough+dist*.00006+uStorm*.04,.02,.5),ra=rough*.6+.02;   // rougher with distance: no mirror sea
 float F=.02+(max(1.-rough,.02)-.02)*pow(1.-nv,5.);
 vec3 R=reflect(-V,N);R.y=abs(R.y);
 vec3 spec=glint(uSun,N,V,ra,nv)*uSunCol*smoothstep(0.,.06,uSun.y)*(1.-.92*ov)+glint(uMoon,N,V,ra,nv)*vec3(.14,.17,.26)*uNight*smoothstep(0.,.06,uMoon.y);
 // see-through body: absorption grows with path length (1/cos), so it is clear looking down and murky at grazing angles
 float thk=max(vP.y+.4*uHs,0.)*smoothstep(1.5,5.,uHs);   // water depth above the trough: crests are thick, only the lower flanks stay see-through
 float aB=1.-exp(-(2.6*pow(1.-uClar,2.)+.04+.9*thk)/max(nv,.07));
 vec3 body=uBody*uLight*mix(1.,.4,uStorm);
 body+=vec3(.03,.24,.34)*pow(clamp(dot(uSun,-V),0.,1.),4.)*smoothstep(-.1*uHs,.45*uHs,vP.y)*uDay*uSunCol*.9*(1.-ov);   // crest scattering
 vec3 col=sky(R)*F+spec+body*(1.-F)*aB;                                      // premultiplied
 float al=F+(1.-F)*aB;
 if(uBLk>.01){vec3 lc=vec3(0.);   // the boat's own lights on the sea: a lit pool plus glitter on the waves
  for(int i=0;i<3;i++){vec3 d=uBLp[i].xyz-vP;float r=length(d);vec3 Lv=d/r;
   float cone=uBLd[i].w<-1.5?1.:smoothstep(uBLd[i].w-.05,uBLd[i].w,dot(-Lv,uBLd[i].xyz));
   float att=uBLp[i].w/(1.+.015*r*r),dif=max(dot(N,Lv),0.),spc=pow(max(dot(N,normalize(Lv+V)),0.),70.);
   lc+=att*cone*(vec3(.35,.65,.75)*dif*.35+vec3(1.,.95,.82)*spc*1.6);}
  col+=lc;al=max(al,clamp(dot(lc,vec3(.33))*2.,0.,1.));}
 float fp=length(fwidth(vUV))*uFoam.y,pat=0.,am=.5,fr=1.;
 vec2 qs=vec2(dot(q,uWD)*.4,dot(q,vec2(-uWD.y,uWD.x)));   // stretched along the wind: streaky foam
 for(int i=0;i<4;i++){float w=1.-smoothstep(.2,.8,fp*fr);pat+=am*mix(.5,vn(qs*uFoam.y*fr+uTime*.05*fr),w);fr*=2.1;am*=.5;}
 pat/=.9375;                                                                 // fine octaves fade to the mean
 float tb=1.+(texture(uD0,q/uLS.x).a-1.)+(texture(uD1,q/uLS.y).a-1.)*.8+(texture(uD2,q/uLS.z).a-1.)*.4;   // accumulated turbulence
 float raw=clamp((uFoam.x-tb)*3.2,0.,1.);
 float fo=clamp(smoothstep(1.-uFoam.z,1.,raw*(.55+pat))+raw*.15,0.,1.);
 fo=mix(fo,raw*.35*uFoam.z,smoothstep(250.,900.,dist));
 float tip=smoothstep(.34,.66,vP.y/uHs)*smoothstep(.12,.7,uStorm)*(1.-smoothstep(250.,800.,dist));   // storm whitecaps: foam only on the highest wave tips
 fo=max(fo,tip*smoothstep(.38,.62,pat+.2*tip));
