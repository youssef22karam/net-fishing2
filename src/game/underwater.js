// @ts-nocheck
/* Shared "under the sea" look for everything the game puts below the waterline (fish, nets, ropes, boards).
   The sea shader blends a see-through body over whatever was drawn before it, so these materials do the physically-motivated part themselves:
   - wavelength dependent absorption (red dies first, so deep things go blue-green),
   - irradiance falling off with depth, animated sun caustics near the surface,
   - in-scattered "veil" of the water body colour taking over with distance / depth.
   They are drawn in the transparent list with renderOrder .2 - .9 (before the depth pre-pass of the sea, see engine/sea.js), so the hull still hides them
   correctly but the water surface does not. */
import * as THREE from 'three';

let _u = null;
export function uwU() {
  if (_u) return _u; const U = window.sea.U;
  _u = { uWBody: U.uBody, uWLight: U.uLight, uWClar: U.uClar, uWDay: U.uDay, uWSun: U.uSun, uWTime: U.uTime }; return _u;
}

export const UW_GLSL = /* glsl */`
uniform vec3 uWBody; uniform float uWLight,uWClar,uWDay,uWTime; uniform vec3 uWSun;
float uwCaus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.7+t*.8),cos(q.x*1.3-t*.7))*.55;c+=abs(sin(q.x*2.1)+sin(q.y*2.3));}return pow(1.-clamp(c/6.,0.,1.),4.);}
// alb: linear albedo | wp: world position | lit: 0..1 direct sun factor | alpha | spec: additive sun glint
vec4 uwShade(vec3 alb,vec3 wp,float lit,float alpha,float spec){
  float depth=max(-wp.y,0.); vec3 vd=cameraPosition-wp; float dist=length(vd);
  float cs=clamp(abs(vd.y)/max(dist,.001),.22,1.);
  float k=mix(.52,.12,uWClar);
  vec3 T=exp(-vec3(.55,.16,.07)*k*(depth/cs*.7+depth*.8+dist*.012));
  float irr=exp(-depth*k*.33);
  float ca=uwCaus(wp.xz*.7+vec2(wp.y*.12,0.),uWTime)*smoothstep(-.1,.7,depth)*exp(-depth*k*.55)*uWDay;
  vec3 L=uWLight*(vec3(.2,.29,.36)+vec3(1.,.95,.84)*(lit*.8+ca*.85)*uWDay)*irr;
  vec3 c=alb*L+vec3(1.,.97,.9)*spec*uWDay*irr*uWLight;
  vec3 veil=uWBody*uWLight*1.2+vec3(.01,.03,.04);
  c=mix(veil,c,T);
  alpha*=clamp(.12+1.05*dot(T,vec3(.33,.33,.34)),0.,1.);
  return vec4(c,alpha);
}`;

const TONE = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

/* ---------------------------------------------------------------- netting: procedural diamond mesh, knots, lit twine ---------------------------------------------------------------- */
export function netMaterial(color, tw = .12, opacity = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { ...uwU(), uColor: { value: new THREE.Color(color) }, uTw: { value: tw }, uOpa: { value: opacity } },
    vertexShader: `varying vec2 vUv;varying vec3 vW;varying vec3 vN;
void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vW;varying vec3 vN;uniform vec3 uColor;uniform float uTw,uOpa;${UW_GLSL}
void main(){
  vec2 uv=vUv;float a=uv.x-uv.y,b=uv.x+uv.y;
  float da=abs(a-floor(a+.5))*.7071,db=abs(b-floor(b+.5))*.7071;
  float fw=length(fwidth(uv))*.7071+1e-5;
  float w=max(uTw,fw*.8),en=clamp(uTw/w,0.,1.);
  float dl=min(da,db);
  float line=1.-smoothstep(w*.6,w+fw*.7,dl);
  float prof=sqrt(clamp(1.-(dl*dl)/(w*w),0.,1.));
  float knot=1.-smoothstep(w*1.3,w*2.2+fw*.7,length(vec2(da,db)));
  float m=max(line*en,knot*clamp(en*1.5,0.,1.));
  m=mix(m,clamp(uTw*4.5,0.,.5),smoothstep(.1,.28,fw));
  float film=.06*(1.-m);
  vec3 N=normalize(cross(dFdx(vW),dFdy(vW))+1e-7),V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;
  vec3 L=normalize(uWSun);float lit=clamp(dot(N,L)*.5+.5,0.,1.);
  float spec=pow(max(dot(reflect(-L,N),V),0.),18.)*prof*.55+knot*.12;
  vec3 alb=uColor*(.7+.55*prof)+vec3(.2)*knot;
  vec4 c=uwShade(alb,vW,lit,(m+film)*uOpa,spec*m);
  if(c.a<.01)discard;
  gl_FragColor=c;${TONE}}`,
  });
}

/* ---------------------------------------------------------------- lit solids (rope / floats / lead / boards), works instanced or not ---------------------------------------------------------------- */
export function litMaterial(color, kind = 0, gloss = .3) {   // kind 0 plain | 1 twisted rope | 2 steel plate (otter board) | 3 painted float with band | 4 lead
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: kind === 2 ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: { ...uwU(), uColor: { value: new THREE.Color(color) }, uKind: { value: kind }, uGloss: { value: gloss } },
    vertexShader: `varying vec3 vW;varying vec3 vN;varying vec3 vP;varying vec2 vUv;varying float vLen;varying float vR;
void main(){mat4 im=mat4(1.);
#ifdef USE_INSTANCING
im=instanceMatrix;
#endif
vec4 wp=modelMatrix*im*vec4(position,1.);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*mat3(im)*normal);vP=position;vUv=uv;vLen=length(im[1].xyz);vR=length(im[0].xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `varying vec3 vW;varying vec3 vN;varying vec3 vP;varying vec2 vUv;varying float vLen;varying float vR;uniform vec3 uColor;uniform float uKind,uGloss;${UW_GLSL}
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec3 N=normalize(vN),V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;vec3 L=normalize(uWSun);
  vec3 alb=uColor;float gl=uGloss,rough=24.;
  if(uKind<1.5&&uKind>.5){float ang=atan(vP.z,vP.x);float tw=ang*.4775+vP.y*vLen/(max(vR,.004)*5.);float st=smoothstep(.3,.7,abs(fract(tw)-.5)*2.);alb*=.68+.32*st;gl=.12;}
  else if(uKind>1.5&&uKind<2.5){vec2 u=vUv;float edge=smoothstep(0.,.08,min(min(u.x,1.-u.x),min(u.y,1.-u.y)));vec2 g=fract(u*vec2(4.,3.))-.5;float bolt=1.-smoothstep(.06,.1,length(g));float wear=hh(floor(u*vec2(40.,30.)))*.18;alb=alb*(.55+.45*edge)*(1.-wear)+vec3(.35)*bolt*edge;gl=.55;rough=40.;}
  else if(uKind>2.5&&uKind<3.5){float band=smoothstep(.12,.18,abs(vP.y));alb=mix(vec3(.95),uColor,band);gl=.8;rough=60.;}
  else if(uKind>3.5){gl=.7;rough=50.;}
  float nl=dot(N,L);float lit=clamp(nl*.5+.5,0.,1.);
  float spec=pow(max(dot(reflect(-L,N),V),0.),rough)*gl;
  float rim=pow(1.-max(dot(N,V),0.),3.)*.18;
  vec4 c=uwShade(alb*(.85+rim),vW,lit,1.,spec);
  gl_FragColor=c;${TONE}}`,
  });
}

/* ---------------------------------------------------------------- fish: a real body, wiggling in the vertex shader, counter-shaded, mirror flanks that glitter when they bank ---------------------------------------------------------------- */
export function fishGeometry() {
  // stations along the body (z: +0.5 nose ... -0.5 tail root): z, half width, half height, y offset
  const S = [[.5, .0, .0, 0], [.46, .045, .06, 0], [.38, .08, .11, 0], [.25, .1, .14, 0], [.1, .105, .155, .005], [-.05, .095, .15, .005], [-.2, .07, .115, 0], [-.34, .04, .07, 0], [-.44, .022, .04, 0], [-.5, .014, .026, 0]];
  const RS = 10, pos = [], part = [], idx = [];
  for (let i = 0; i < S.length; i++) for (let j = 0; j < RS; j++) {
    const a = j / RS * Math.PI * 2, [z, w, h, o] = S[i]; pos.push(Math.sin(a) * w, Math.cos(a) * h + o, z); part.push(0);
  }
  for (let i = 0; i < S.length - 1; i++) for (let j = 0; j < RS; j++) { const a = i * RS + j, b = i * RS + (j + 1) % RS, c = a + RS, d = b + RS; idx.push(a, b, c, b, d, c); }
  const tri = (p) => { const b = pos.length / 3; p.forEach((q) => { pos.push(...q); part.push(1); }); idx.push(b, b + 1, b + 2); };
  tri([[0, 0, -.46], [0, .17, -.66], [0, .02, -.56]]); tri([[0, 0, -.46], [0, -.17, -.66], [0, -.02, -.56]]);
  tri([[0, .15, .12], [0, .26, -.08], [0, .13, -.12]]); tri([[0, -.1, -.2], [0, -.17, -.3], [0, -.08, -.32]]);
  tri([[.07, -.06, .24], [.2, -.14, .12], [.08, -.08, .12]]); tri([[-.07, -.06, .24], [-.2, -.14, .12], [-.08, -.08, .12]]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function fishMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { ...uwU() },
    vertexShader: `attribute vec3 aCol;attribute vec3 aBel;attribute vec4 aFx;attribute float aPart;
varying vec3 vW;varying vec3 vWN;varying vec3 vLN;varying float vPart;varying vec3 vCol;varying vec3 vBel;varying vec4 vFx;varying float vZ;uniform float uWTime;
void main(){vec3 p=position;float tk=smoothstep(.15,-.5,p.z);float rate=6.+9.*aFx.z;
  p.x+=sin(uWTime*rate+aFx.y-p.z*5.5)*.1*tk*(.35+.65*aFx.z);
  mat4 im=instanceMatrix;vec4 wp=modelMatrix*im*vec4(p,1.);vW=wp.xyz;vWN=normalize(mat3(modelMatrix)*mat3(im)*normal);vLN=normal;vPart=aPart;vCol=aCol;vBel=aBel;vFx=aFx;vZ=position.z;
  gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `varying vec3 vW;varying vec3 vWN;varying vec3 vLN;varying float vPart;varying vec3 vCol;varying vec3 vBel;varying vec4 vFx;varying float vZ;${UW_GLSL}
void main(){
  vec3 N=normalize(vWN),V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;vec3 L=normalize(uWSun);
  float up=normalize(vLN).y;
  float stripe=vFx.w*smoothstep(.3,.6,sin(vZ*52.+sin(vLN.x*9.)*1.6)*.5+.5);
  vec3 back=vCol*.8*(1.-.6*stripe*smoothstep(.0,.5,up));
  float t=smoothstep(-.05,.5,up);
  vec3 silver=vec3(.74,.82,.86);
  vec3 alb=mix(mix(vBel,vec3(.9,.94,.95),.5),back,t);
  float band=smoothstep(.55,.0,abs(up));
  alb=mix(alb,silver*(.8+.15*sin(vZ*24.)),band*.4*(1.-vPart));
  alb=mix(alb,back*.75,vPart);
  alb=mix(alb,vec3(.9,.95,1.),clamp(vFx.x,0.,1.)*.7*(1.-vPart*.5));
  float lit=clamp(dot(N,L)*.5+.5,0.,1.);
  float gl=pow(max(dot(reflect(-V,N),L),0.),26.)*(band*.9+.1)*(1.-vPart)*(.12+vFx.x*2.2);
  float eye=1.-smoothstep(.0,.03,length(vec2(abs(vLN.x)-.075,vZ-.36)));alb*=1.-eye*.9;
  vec4 c=uwShade(alb,vW,lit,1.,gl+vFx.x*.35);
  if(c.a<.015)discard;
  gl_FragColor=c;${TONE}}`,
  });
}

/* soft bait-ball body: instanced camera-facing quads (no point-size limits on phones): a dark mass that thickens where fish overlap */
export function schoolCloudMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'attribute vec3 aPos;attribute float aA;attribute float aS;attribute vec3 aC;varying float vA;varying vec3 vC;varying vec2 vUv;void main(){vec4 mv=viewMatrix*vec4(aPos,1.);mv.xy+=position.xy*aS;gl_Position=projectionMatrix*mv;vA=aA;vC=aC;vUv=position.xy*2.;}',
    fragmentShader: `varying float vA;varying vec3 vC;varying vec2 vUv;void main(){float d=length(vUv);if(d>1.)discard;float a=1.-smoothstep(0.,1.,d);a*=a;gl_FragColor=vec4(vC,a*vA);${TONE}}`,
  });
}
export function glintMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute vec3 aPos;attribute float aA;attribute float aS;varying float vA;varying vec2 vUv;void main(){vec4 mv=viewMatrix*vec4(aPos,1.);mv.xy+=position.xy*aS;gl_Position=projectionMatrix*mv;vA=aA;vUv=position.xy*2.;}',
    fragmentShader: 'varying float vA;varying vec2 vUv;void main(){float d=length(vUv);if(d>1.)discard;float a=1.-smoothstep(0.,1.,d);a*=a;gl_FragColor=vec4(vec3(.8,.93,1.)*a*vA,a*vA);}',
  });
}
/* instanced billboard set: aPos / aA / aS (/ aC) arrays are written by the caller, geometry.instanceCount is the draw count */
export function billboards(mat, pos, a, s, c) {
  const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1); g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const ia = (arr, n) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPos', ia(pos, 3)); g.setAttribute('aA', ia(a, 1)); g.setAttribute('aS', ia(s, 1)); if (c) g.setAttribute('aC', ia(c, 3)); g.instanceCount = 0;
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}
