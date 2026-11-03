{const it=fAdd(fBuoy(0x2f7fd8,.6),100,-12);for(let k=0;k<20;k++){const m=new THREE.Mesh(new THREE.TorusGeometry(.14,.04,6,10),fMat(k%2?0xd8d8d8:0x8a8f94,.12));m.position.set(it.x,-k-.5,it.z);m.rotation.y=k%2?0:Math.PI/2;scene.add(m)}fBlock(it,-20.4,.8)}
// 8  big beach ball
{const g=new THREE.Group(),b=new THREE.Mesh(new THREE.SphereGeometry(1.1,20,14),fMat(0xffffff,.25));b.position.y=.3;g.add(b);
 for(let k=0;k<4;k++){const s=new THREE.Mesh(new THREE.CylinderGeometry(1.11,1.11,.5,20,1,true),fMat(k%2?0xe8352b:0x2fd2ff,.3));s.position.y=-.4+k*.5;g.add(s)}fAdd(g,30,26)}
function floaters(dt,t){
 if(!FL.length)return;fProbe();if(!fgot)return;const k=1-Math.exp(-dt*5),w=1+2*storm;
 for(const it of FL){const g=it.g;g.position.y=g.userData.init?g.position.y+(fh[it.i]-g.position.y)*k:fh[it.i];g.userData.init=1;
  if(it.tilt){g.rotation.x=.1*w*Math.sin(t*1.1+it.i*1.7);g.rotation.z=.12*w*Math.sin(t*.8+it.i*2.3)}
  for(const th of it.tethers){th.m.scale.y=Math.max(.01,g.position.y-th.bot)}}}

/* --- cameras: Chase (orbit), Bridge (inside), Bow, Low side, Drone, Cinematic (auto-cuts) --- */
const MODES=['Chase','Inner','Bow','Low side','Drone','Cinematic','Deck'],DECK={yaw:0,pitch:-.3,eye:new THREE.Vector3(0,2.75,2.55),walk:0},CTL={override:false,power:0,k:1,turn:0},look={y:0,p:0,drag:false},lk=new Vector3(),cp=new Vector3(),tp=new Vector3(),tl=new Vector3(),ee=new Euler();let mode=0,camBtn,flipBtn;
function setMode(m){mode=(m+MODES.length)%MODES.length;controls.enabled=mode===0;camBtn.textContent='📷 '+MODES[mode];camera.fov=mode===1?75:mode===6?68:mode===2?68:58;camera.near=(mode===1||mode===6)?.1:.5;camera.updateProjectionMatrix();resize();
 shell.forEach(s=>s.visible=mode!==1);look.y=look.p=0;
 if(mode===0){const h=boat.heading;camera.position.set(boat.position.x+Math.sin(h)*26+9,boat.position.y+9+P.hs*.5,boat.position.z+Math.cos(h)*26);controls.target.set(boat.position.x,boat.position.y+2.5,boat.position.z)}
 else{lk.copy(boat.position);cp.copy(camera.position)}}
function cameras(dt,t){
 const h=boat.heading,bx=boat.position.x,bz=boat.position.z,fx=-Math.sin(h),fz=-Math.cos(h),rx=Math.cos(h),rz=-Math.sin(h),hs=P.hs,wy=S.y;
 if(mode===0){tp.set(bx,wy+2.2+.3*hs,bz);tl.copy(tp).sub(controls.target).multiplyScalar(1-Math.exp(-dt*6));controls.target.add(tl);camera.position.add(tl);controls.update();return}
 if(mode===1){if(!look.drag){look.y*=Math.exp(-dt*.7);look.p*=Math.exp(-dt*.7)}
  hullG.localToWorld(tp.copy(KIT.eye));const sk=ST.slam*.06;tp.x+=(Math.random()-.5)*sk;tp.y+=(Math.random()-.5)*sk;
  camera.position.copy(tp);camera.quaternion.setFromEuler(ee.set(ST.pitch*.5+look.p,h+look.y,ST.roll*.5,'YXZ'));return}   // eye rides the hull, view keeps half its tilt
 if(mode===6){hullG.localToWorld(tp.copy(DECK.eye));const sk=ST.slam*.04;tp.x+=(Math.random()-.5)*sk;tp.y+=(Math.random()-.5)*sk;camera.position.copy(tp);
  camera.quaternion.setFromEuler(ee.set(DECK.pitch+ST.pitch*.35,h+DECK.yaw,ST.roll*.4,'YXZ'));return}
 const k=mode===5?Math.floor(t/9)%4+2:mode,a=t*.18,sw=Math.sin(t*.2)*5,dz=Math.sin(t*.15)*6;
 if(k===2){tp.set(bx+fx*9+rx*3.5,wy+1.5+.3*hs,bz+fz*9+rz*3.5);tl.set(bx-fx*1.5,wy+2,bz-fz*1.5)}               // bow: low, ahead, looking back at the stem
 else if(k===3){tp.set(bx+rx*(13+hs)-fx*sw,wy+.9+.35*hs,bz+rz*(13+hs)-fz*sw);tl.set(bx,wy+1.8,bz)}           // low side: at wave level
 else if(k===4){tp.set(bx-fx*18+rx*dz,wy+15+2*hs,bz-fz*18+rz*dz);tl.set(bx+fx*6,wy,bz+fz*6)}                  // drone
 else{tp.set(bx+Math.cos(a)*24,wy+6+4*Math.sin(a*.7),bz+Math.sin(a)*24);tl.set(bx,wy+2,bz)}                   // orbit
 const c5=mode===5;cp.lerp(tp,1-Math.exp(-dt*(c5?1.2:4)));lk.lerp(tl,1-Math.exp(-dt*(c5?1.5:6)));
 camera.position.copy(cp);camera.position.y=Math.max(cp.y,wy+.7+.3*hs);camera.lookAt(lk)}

/* --- flip bar, capsize overlay, controls --- */
const fb=document.createElement('div');fb.id='flip';fb.innerHTML='<span></span><div><i></i></div>';document.body.append(fb);if(!touch)document.body.insertAdjacentHTML('beforeend','<div id="keys">W/S throttle \u00b7 A/D lean + steer \u00b7 C camera \u00b7 R right boat</div>');
const cz=document.createElement('div');cz.id='capz';cz.innerHTML='<b>CAPSIZED</b><br>Engine off - righting in <span></span>s<br><button type="button">Right the boat</button>';document.body.append(cz);cz.querySelector('button').onclick=rightBoat;
function flipUI(){const b=ST.bal,r=Math.abs(b),c=ST.cap!==0,n=fb.querySelector('i');
 fb.firstChild.textContent=((ST.pm&&ST.pw>0)?(ST.pd>0?'\u25c0 WAVE HIT  ':'WAVE HIT \u25b6  '):'')+(!ST.flip?'FLIP OFF':c?'CAPSIZED':r>.75?'DANGER - STEER OUT':r>.45?'HEELING':'STABLE')+'  |  lean '+(ST.roll>0?'L ':'R ')+Math.abs(ST.roll*57.3).toFixed(0)+'\u00b0  |  '+(boat.speed*1.944).toFixed(1)+' kn';
 n.style.left=(50-clamp(b,-1,1)*50)+'%';n.style.background=r>.75?'#ff4a3a':r>.45?'#ffb340':'#4ee08a';fb.style.opacity=ST.flip?1:.55;
 cz.style.display=c?'block':'none';if(c)cz.querySelector('span').textContent=Math.max(0,Math.ceil(7-ST.capT));
 $('#lf').style.height=(boat.power<-.01?.2+boat.power/3*.2:boat.power>.01?.3+boat.power/8*.7:.25)*100+'%';$('#lt').textContent=boat.power.toFixed(1)}
const KM={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'stop'};
addEventListener('keydown',e=>{const k=KM[e.code];if(k){keys.add(k);e.preventDefault()}else if(e.code==='KeyC')setMode(mode+1);else if(e.code==='KeyR')rightBoat();else if(/^Digit[1-7]$/.test(e.code))setMode(+e.code[5]-1)});
addEventListener('keyup',e=>{const k=KM[e.code];if(k)keys.delete(k)});
const pad=document.createElement('div');pad.id='pad';pad.innerHTML='<div id="lever"><i id="lf"></i><b id="lt">0</b></div><div id="steer"><div data-k="left">\u25c0</div><div data-k="right">\u25b6</div></div>';document.body.append(pad);if(touch)document.body.classList.add('touch');
const lev=$('#lever'),setLev=e=>{const r=lev.getBoundingClientRect(),f=clamp(1-(e.clientY-r.top)/r.height,0,1);thrLever=f<.2?-3*(1-f/.2):f<.3?0:8*(f-.3)/.7};   // lower 20 % = reverse, 20-30 % = neutral detent, rest = ahead (max 8)
lev.addEventListener('pointerdown',e=>{lev.setPointerCapture(e.pointerId);lev.dragging=1;setLev(e);e.preventDefault()});lev.addEventListener('pointermove',e=>{if(lev.dragging)setLev(e)});lev.addEventListener('pointerup',()=>lev.dragging=0);
document.querySelectorAll('#steer div').forEach(el=>{const k=el.dataset.k,up=()=>{keys.delete(k);el.classList.remove('down')};el.addEventListener('pointerdown',e=>{keys.add(k);el.setPointerCapture(e.pointerId);el.classList.add('down');e.preventDefault()});el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up)});
const cv=renderer.domElement;let lx=0,ly=0;                                            // drag to look around inside the bridge
cv.addEventListener('pointerdown',e=>{if(mode===1){look.drag=true;lx=e.clientX;ly=e.clientY}});addEventListener('pointerup',()=>look.drag=false);
cv.addEventListener('pointermove',e=>{if(mode===1&&look.drag){look.y=clamp(look.y-(e.clientX-lx)*.004,-2.4,2.4);look.p=clamp(look.p-(e.clientY-ly)*.004,-.7,.7);lx=e.clientX;ly=e.clientY}});
camBtn=btn('\ud83d\udcf7 Chase',()=>setMode(mode+1));flipBtn=btn('Flip \u2713',()=>{ST.flip=!ST.flip;flipBtn.textContent='Flip '+(ST.flip?'\u2713':'\u2717')});btn('Right',rightBoat);
camera.position.set(boat.position.x+Math.sin(boat.heading)*26+9,9,Math.cos(boat.heading)*26);controls.target.set(0,2.5,0);
const bp=new Vector3(),bar={x:innerWidth/2,y:64};
function placeBar(dt){let x=innerWidth/2,y=64;   // inner camera: top centre; otherwise glued above the boat
 if(mode!==1){camera.updateMatrixWorld();bp.set(boat.position.x,boat.position.y+4.6,boat.position.z).project(camera);
  if(bp.z<1){x=clamp((bp.x*.5+.5)*innerWidth,130,innerWidth-130);y=clamp((-bp.y*.5+.5)*innerHeight,76,innerHeight-130)}}
 const k=1-Math.exp(-dt*10);bar.x+=(x-bar.x)*k;bar.y+=(y-bar.y)*k;fb.style.left=bar.x+'px';fb.style.top=bar.y+'px'}

/* --- wake: a 2-D wave-equation sim in a boat-following window. The hull pushes the water (bow hump, hull trough); the sim carries it off as a V wake.
   Foam from the stem, hull sides and prop wash fades slowly = the trail. The sea shader adds this height, slope and foam on top of the ocean. --- */
const WN=window.__lite?160:touch?384:512,WW=240,WTX=WW/WN,WC=2.6;
const wkOpt={type:HalfFloatType,format:RGBAFormat,minFilter:LinearFilter,magFilter:LinearFilter,depthBuffer:false};
let wkA=new WebGLRenderTarget(WN,WN,wkOpt),wkB=new WebGLRenderTarget(WN,WN,wkOpt);
const V2=THREE.Vector2,wkMat=new ShaderMaterial({depthTest:false,depthWrite:false,vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
 uniforms:{uPrev:{value:null},uShift:{value:new V2()},uBoat:{value:new V2()},uDir:{value:new V2(0,-1)},uCen:{value:new V2()},uN:{value:WN},uK:{value:.006},uVd:{value:.99},uHd:{value:.9995},uFd:{value:.99},uWW:{value:WW},uSev:{value:0},uHull:{value:new THREE.Vector4(8.2,2.9,0,0)},uImp:{value:Array.from({length:24},()=>new THREE.Vector3())},uNI:{value:0},uT:{value:0},uWet:{value:new THREE.Vector3(1,1,1)}},
 fragmentShader:`uniform sampler2D uPrev;uniform vec2 uShift,uBoat,uDir,uCen;uniform float uN,uK,uVd,uHd,uFd,uWW,uSev;uniform vec4 uHull;uniform vec3 uImp[24],uWet;uniform float uNI,uT;
float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec4 S(vec2 p){return (p.x<0.||p.x>1.||p.y<0.||p.y>1.)?vec4(0.):texture(uPrev,p);}
void main(){
 vec2 uv=gl_FragCoord.xy/uN,px=vec2(1./uN),p0=uv+uShift;
 vec4 c=S(p0),l=S(p0-vec2(px.x,0.)),r=S(p0+vec2(px.x,0.)),d=S(p0-vec2(0.,px.y)),u=S(p0+vec2(0.,px.y));
 float v=(c.y+uK*(l.x+r.x+d.x+u.x-4.*c.x))*uVd;                      // wave equation: acceleration = c^2 * laplacian
 float h=(c.x+v)*uHd;
 float f=mix(c.z,.25*(l.z+r.z+d.z+u.z),.04)*uFd;                      // foam: spreads a little, fades slowly
 vec2 ed=abs(uv-.5);float edge=1.-smoothstep(.38,.5,max(ed.x,ed.y));v*=mix(.55,1.,edge);h*=mix(.85,1.,edge);   // absorb at the window edge
 vec2 wp=uCen+(uv-.5)*uWW,rel=wp-uBoat;
 float al=dot(rel,uDir),ac=dot(rel,vec2(-uDir.y,uDir.x)),L=uHull.x*.5,B=uHull.y*.5,spd=uHull.z,th=uHull.w;
 float e=length(vec2(al/L,ac/B)),sp01=smoothstep(.8,5.,spd);
 float body=1.-smoothstep(.65,1.1,e);                                  // hull footprint
 float hump=exp(-pow((al-L*.9)/(L*.4),2.)-pow(ac/(B*1.3),2.))*clamp(spd/5.,0.,1.3);   // water piled up ahead of the stem
 float sternF0=exp(-pow((al+L*.9)/(L*.45),2.)-pow(ac/(B*1.1),2.));
 float sh=exp(-pow((al-L*.55)/(L*.3),2.)-pow((abs(ac)-B*1.1)/(B*.45),2.))*clamp(spd/4.,0.,1.2);   // bow shoulder crest: the root of the diverging (Kelvin) arms
 float tgt=-.12*body*clamp(spd/3.,0.,1.)+.3*hump-.08*sternF0*clamp(spd/3.,0.,1.)+.2*sh;                       // hull trough
 h+=(tgt-h)*clamp(max(body*.5,max(hump,max(sh*.7,sternF0*.6))),0.,1.)*.5;
 h+=(hs(floor(wp*2.2)+floor(uT*14.))-.5)*.06*sternF0*clamp(th,0.,1.);   // churning prop-wash boil
 float side=smoothstep(.75,1.,e)*(1.-smoothstep(1.02,1.4,e))*(.35+.65*hs(floor(wp*3.)+floor(uT*8.)));
 float bowF=exp(-pow((al-L*.8)/(L*.35),2.)-pow(ac/(B*1.2),2.));
 float sternF=exp(-pow((al+L*1.05)/(L*.5),2.)-pow(ac/(B*.95),2.));   // prop wash behind the transom
 f=max(f,max(max(side*sp01*.35*uWet.y,bowF*sp01*(.3+.2*uSev)*uWet.x),sternF*clamp(th,0.,1.)*.6*uWet.z));
 for(int j=0;j<24;j++){if(float(j)>=uNI)break;vec2 dd=wp-uImp[j].xy;float g=exp(-dot(dd,dd)/.45);v-=uImp[j].z*g;f=max(f,g*.12);}   // falling droplets dent the surface and leave a speck of foam
 gl_FragColor=vec4(clamp(h,-.3,.35),clamp(v,-.12,.12),min(f,1.),1.);}`});
const wkScene=new Scene(),wkMesh=new Mesh(pGeo,wkMat);wkMesh.frustumCulled=false;wkScene.add(wkMesh);
let wcx=0,wcz=0,wkReady=false;
function wakeStep(dt){
 const dx=(pd[3*4+1]+pd[4*4+1])*.5,dz=(pd[3*4+2]+pd[4*4+2])*.5;           // choppy shift at the hull: boat position in sea-grid space
 const gx=boat.position.x-(isFinite(dx)?dx:0),gz=boat.position.z-(isFinite(dz)?dz:0);
 const nx=Math.round(gx/WTX)*WTX,nz=Math.round(gz/WTX)*WTX,u=wkMat.uniforms,prev=renderer.getRenderTarget();
 if(!wkReady){wcx=nx;wcz=nz;wkReady=true;const cc=new Color(),ca=renderer.getClearAlpha();renderer.getClearColor(cc);renderer.setClearColor(0x000000,0);for(const t of [wkA,wkB]){renderer.setRenderTarget(t);renderer.clear()}renderer.setClearColor(cc,ca)}
 const nSub=Math.min(3,Math.max(1,Math.ceil(dt/.02))),sd=dt/nSub,spd=Math.abs(boat.speed),th=ST.cap?0:Math.min(Math.abs(boat.power)/10,1);
 u.uK.value=Math.pow(clamp(spd*.34,1.4,3.4)*sd/WTX,2);u.uVd.value=Math.exp(-sd*.7);u.uHd.value=Math.exp(-sd*.2);u.uFd.value=Math.exp(-sd/3.2);WU.uWk.value=.55/(1+.12*Math.max(P.hs-2,0));   // wake dents shrink in big seasu.uT.value+=dt;   // wave speed tracks boat speed: the V stays at the Kelvin angle (~19.5 deg)
 for(let j=0;j<nImp;j++)u.uImp.value[j].set(impB[j*3]-(isFinite(dx)?dx:0),impB[j*3+1]-(isFinite(dz)?dz:0),impB[j*3+2]);u.uSev.value=ST.sev;
 u.uBoat.value.set(gx,gz);u.uWet.value.set(ST.bowW,ST.midW,ST.sternW);u.uDir.value.set(-Math.sin(boat.heading),-Math.cos(boat.heading));u.uHull.value.set(8.2,2.9,spd,th);u.uCen.value.set(nx,nz);
 for(let k=0;k<nSub;k++){
  u.uNI.value=k?0:nImp;u.uShift.value.set(k?0:(nx-wcx)/WW,k?0:(nz-wcz)/WW);u.uPrev.value=wkA.texture;
  renderer.setRenderTarget(wkB);renderer.render(wkScene,pCam);[wkA,wkB]=[wkB,wkA]}
 renderer.setRenderTarget(prev);wcx=nx;wcz=nz;nImp=0;
 WU.uWake.value=wkA.texture;WU.uWi.value.set(nx,nz,WW);WU.uWN.value=WN}
WU.uWake.value=wkA.texture;WU.uWN.value=WN;

/* --- spray: real droplets. Each is a tiny ballistic streak (stretched along its velocity), thrown as a thin bow sheet, side froth, slam crowns, deck wash and a prop rooster-tail.
   Falling drops hit the sea: they vanish, dent the wake field (ripple rings) and leave a speck of foam. --- */
const SPN=3200,sPos=new Float32Array(SPN*3),sVel=new Float32Array(SPN*3),sLife=new Float32Array(SPN),sMax=new Float32Array(SPN),sSz=new Float32Array(SPN),sInfo=new Float32Array(SPN*2);
const sGeo=new THREE.InstancedBufferGeometry(),iPosA=new THREE.InstancedBufferAttribute(sPos,3).setUsage(THREE.DynamicDrawUsage),iVelA=new THREE.InstancedBufferAttribute(sVel,3).setUsage(THREE.DynamicDrawUsage),iInfoA=new THREE.InstancedBufferAttribute(sInfo,2).setUsage(THREE.DynamicDrawUsage);
sGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-.5,0,0,.5,0,0,-.5,1,0,.5,1,0]),3));sGeo.setIndex([0,1,2,2,1,3]);
sGeo.setAttribute('iPos',iPosA);sGeo.setAttribute('iVel',iVelA);sGeo.setAttribute('iInfo',iInfoA);sGeo.instanceCount=SPN;
const sMat=new ShaderMaterial({uniforms:{uPx:U.uPx,uLight:U.uLight},transparent:true,depthWrite:false,side:THREE.DoubleSide,
 vertexShader:`attribute vec3 iPos,iVel;attribute vec2 iInfo;uniform float uPx;varying vec2 vUv;varying float vA;
void main(){
 vA=iInfo.x;if(vA<.01){gl_Position=vec4(2.,2.,2.,1.);return;}
 vec4 a=viewMatrix*vec4(iPos,1.),b=viewMatrix*vec4(iPos-iVel*.04,1.);float dep=max(-a.z,.3);   // streak = 40 ms of travel
 vec3 dv=b.xyz-a.xyz;vec3 sd=length(dv)>1e-4?normalize(cross(dv,a.xyz)):vec3(1.,0.,0.);
 float w=max(iInfo.y*2.,dep*uPx*1.3);                                // at least ~1.3 px wide
 gl_Position=projectionMatrix*vec4(mix(a.xyz,b.xyz,position.y)+sd*position.x*w,1.);
 vUv=vec2(position.x+.5,position.y);}`,
 fragmentShader:`varying vec2 vUv;varying float vA;uniform float uLight;
void main(){
 float x=abs(vUv.x*2.-1.),y=vUv.y;
 float side=1.-smoothstep(.4,1.,x);                                   // round across the width
 float head=smoothstep(0.,.12,y),tail=1.-smoothstep(.15,1.,y);       // blunt bright head, fading tail
 float a=side*head*tail*vA*.85;if(a<.02)discard;
 vec3 c=mix(vec3(.72,.84,.95),vec3(1.),smoothstep(.55,0.,y)*(1.-x*.6))*(.3+.7*uLight);   // bright glint on the head, bluish water on the tail
 gl_FragColor=vec4(c,a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
const sPts=new THREE.Mesh(sGeo,sMat);sPts.frustumCulled=false;sPts.renderOrder=2;scene.add(sPts);
let sHead=0,sAcc=0,pAcc=0,wAcc=0,hAcc=0,seaY=0,nImp=0;const impB=new Float32Array(24*3),sv=new Vector3(),R=Math.random,dsz=(k=1)=>(.016+.06*R()*R()*R())*k;   // many tiny drops, a few fat ones
function spawn(lx,ly,lz,vr,vu,vf,life,size){   // local hull position; velocity as right/up/forward components
 const m=boat.matrixWorld.elements,i=sHead;sHead=(sHead+1)%SPN;sv.set(lx,ly,lz).applyMatrix4(boat.matrixWorld);
 sPos[i*3]=sv.x;sPos[i*3+1]=sv.y;sPos[i*3+2]=sv.z;
 sVel[i*3]=m[0]*vr+m[4]*vu-m[8]*vf;sVel[i*3+1]=m[1]*vr+m[5]*vu-m[9]*vf;sVel[i*3+2]=m[2]*vr+m[6]*vu-m[10]*vf;
 sLife[i]=sMax[i]=life;sSz[i]=size}
function sprayStep(dt){
 if(pvalid){let s=0;for(let i=0;i<NP;i++)s+=pd[i*4];seaY=s/NP}
 const spd=Math.abs(boat.speed),spN=Math.min(spd/8,1),sev=ST.sev,fw=boat.speed>0?1:0;
 const bw=ST.bowW,se=ST.sprayE,vq=Math.min(1,spN+.6*se);
 sAcc+=bw*(fw*(spd>1.5?1:0)*(70+260*sev)*spN*(.4+.6*Math.min(1,.4+se))+520*se)*dt;   // bow sheet: only while the bow is in the water; surges with each wave hit / slam
 while(sAcc>=1){sAcc--;const sd=R()<.5?-1:1,t=R();spawn(sd*(.1+.5*t),.12,-3.8+t*2.4,sd*(1.5+(3+4*vq)*R()*(1-.4*t)),1.2+(2.5+4*sev+2*vq+3*se)*R()*(1-.5*t),spd*(.15+.4*R()),.55+.7*R(),dsz(1+.6*sev+.5*se))}
 hAcc+=fw*(spd>1.5?1:0)*spd*12*ST.midW*dt;                                               // low froth flicked off the hull sides
 while(hAcc>=1){hAcc--;const sd=R()<.5?-1:1;spawn(sd*.55,.08,-2.4+4.4*R(),sd*(.5+1.8*R()),.8+1.8*R(),spd*.5*R(),.3+.35*R(),dsz(.8))}
 if(ST.evt>0){const n=Math.ceil((60+260*ST.evt)*ST.bowW);for(let k=0;k<n;k++){const sd=R()<.5?-1:1;spawn(sd*(.3+.5*R()),.2,-3.6+1.8*R(),sd*(1.5+6*R()*ST.evt),3+9*R()*ST.evt,spd*(.3+.5*R()),.8+1*R(),dsz(1.3))}ST.evt=0}   // slam: crown burst
 if(ST.wash>.05&&!ST.cap){wAcc+=Math.min(ST.wash,1.2)*120*dt;while(wAcc>=1){wAcc--;const sd=R()<.5?-1:1;spawn(sd*1.2,.35,-3+5*R(),sd*(1+2*R()),2+3*R(),spd*.2,.5+.5*R(),dsz(1.1))}}   // green water over the rail
 const th=ST.cap?0:Math.abs(boat.power)/10;if(th>.2){pAcc+=th*th*140*ST.sternW*dt;while(pAcc>=1){pAcc--;spawn((R()-.5)*.5,.1,3.9,(R()-.5)*2,2+4*R()*th,-(2+5*R()*th),.45+.5*R(),dsz())}}   // prop wash rooster tail
 for(let i=0;i<SPN;i++){
  if(sLife[i]>0){sLife[i]-=dt;sVel[i*3+1]-=9.8*dt;const dr=1-dt*.3;sVel[i*3]*=dr;sVel[i*3+2]*=dr;
   sPos[i*3]+=sVel[i*3]*dt;sPos[i*3+1]+=sVel[i*3+1]*dt;sPos[i*3+2]+=sVel[i*3+2]*dt;
   if(sVel[i*3+1]<0&&sPos[i*3+1]<seaY){   // splashdown
    if(nImp<24&&R()<.15){impB[nImp*3]=sPos[i*3];impB[nImp*3+1]=sPos[i*3+2];impB[nImp*3+2]=.003+sSz[i]*.06;nImp++}
    sLife[i]=0;sInfo[i*2]=0;sPos[i*3+1]=-9999;continue}
   const f=Math.max(0,sLife[i]/sMax[i]);sInfo[i*2]=f<.15?f/.15:1;sInfo[i*2+1]=sSz[i]}
  else{sInfo[i*2]=0;sPos[i*3+1]=-9999}}
 iPosA.needsUpdate=true;iVelA.needsUpdate=true;iInfoA.needsUpdate=true}

/* --- night lights: real lights on the hull (search lamp with a beam, two deck floods, nav lights, masthead, cabin glow, stern light) + a lit pool on the water --- */
const nlSpot=(col,I,dist,ang,pen,dec,pos,aim)=>{const l=new THREE.SpotLight(col,I,dist,ang,pen,dec),tg=new THREE.Object3D();l.position.set(...pos);tg.position.set(...aim);hullG.add(l,tg);l.target=tg;return l},
 nlPoint=(col,I,dist,dec,pos)=>{const l=new THREE.PointLight(col,I,dist,dec);l.position.set(...pos);hullG.add(l);return l};   // model space: bow is +Z, as the glowing lamp lenses
const nlSearch=nlSpot(0xfff1d6,90,90,.22,.5,1,[.42,2.62,1.2],[.42,1.2,30]),
 nlFA=nlSpot(0xfff1d6,22,16,.95,.6,1.4,[.55,2.28,-.81],[.6,.4,-3.2]),nlFB=nlSpot(0xfff1d6,22,16,.95,.6,1.4,[-.55,2.28,-.81],[-.6,.4,-3.2]),
 nlRed=nlPoint(0xff2a1a,3,7,2,[.4,3.45,-.5]),nlGrn=nlPoint(0x22ff66,3,7,2,[-.4,3.45,-.5]),nlMast=nlPoint(0xffffff,4,9,2,[0,3.75,-.5]),
 nlCab=nlPoint(0xffc27a,5,6,2,[0,1.9,.1]),nlStern=nlPoint(0xffffff,2,6,2,[0,1.7,-3.85]);
const nlBeamM=new ShaderMaterial({uniforms:{uK:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
 vertexShader:'varying float vT;varying float vE;void main(){vT=position.z/30.;vec3 n=normalize(normalMatrix*normal),v=normalize(-(modelViewMatrix*vec4(position,1.)).xyz);vE=pow(abs(dot(n,v)),1.4);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform float uK;varying float vT;varying float vE;void main(){float a=uK*.09*pow(clamp(1.-vT,0.,1.),1.3)*vE;gl_FragColor=vec4(vec3(1.,.95,.8)*a,a);}'});
const nlBeamG=new THREE.CylinderGeometry(2.6,.06,30,28,1,true);nlBeamG.rotateX(Math.PI/2);nlBeamG.translate(0,0,15);
const nlBeam=new THREE.Mesh(nlBeamG,nlBeamM);nlBeam.position.set(.42,2.62,1.2);nlBeam.rotation.x=.05;nlBeam.renderOrder=3;hullG.add(nlBeam);
const nlA=new Vector3(),nlB=new Vector3();
function nightLights(){
 const k=Math.min(1,U.uNight.value+.55*(1-U.uLight.value)),on=k>.03;   // night, dusk or a dark storm
 nlSearch.intensity=90*k;nlFA.intensity=nlFB.intensity=22*k;nlRed.intensity=nlGrn.intensity=3*k;nlMast.intensity=4*k;nlCab.intensity=5*k;nlStern.intensity=2*k;
 for(const l of [nlSearch,nlFA,nlFB,nlRed,nlGrn,nlMast,nlCab,nlStern])l.visible=on;
 nlBeam.visible=on;nlBeamM.uniforms.uK.value=k*(1+.5*U.uRain.value);   // beam shows more in rain / spray
 const bp=WU.uBLp.value,bd=WU.uBLd.value;
 nlSearch.getWorldPosition(nlA);nlSearch.target.getWorldPosition(nlB).sub(nlA).normalize();bp[0].set(nlA.x,nlA.y,nlA.z,22*k);bd[0].set(nlB.x,nlB.y,nlB.z,Math.cos(.24));
 nlFA.getWorldPosition(nlA);bp[1].set(nlA.x,nlA.y,nlA.z,7*k);bd[1].set(0,1,0,-2);
 nlMast.getWorldPosition(nlA);bp[2].set(nlA.x,nlA.y,nlA.z,2.5*k);bd[2].set(0,1,0,-2);
 WU.uBLk.value=on?1:0}

function boatFrame(dt,t){
 dt=Math.min(dt,.05);const kk=keys,thr=(kk.has('up')?1:0)-(kk.has('down')?1:0),sIn=ST.cap?0:CTL.override?(CTL.rudder||0):(kk.has('left')?1:0)-(kk.has('right')?1:0);
 if(kk.has('stop'))thrLever=0;   // sea-storm controls: W = +8, S = -3, released = lever (0); power ramps 3.5/s (5/s toward neutral)
 const tgt=ST.cap?0:CTL.override?CTL.power:kk.has('up')?8:kk.has('down')?-3:thrLever,rate=tgt===0?5:3.5;
 boat.power+=Math.min(Math.abs(tgt-boat.power),rate*dt)*Math.sign(tgt-boat.power);if(ST.cap)boat.power*=Math.exp(-dt*2.5);
 const lv=Math.max(Math.min(1,Math.abs(boat.power)/4),CTL.turn),dh=sIn*1.1*lv*dt*(boat.power>=0?1:-1);   // turn rate 1.1 rad/s, needs power, inverted in reverse
 boat.heading+=dh;yaw+=((dt>0?dh/dt:0)-yaw)*(1-Math.exp(-dt*8));ST.lean+=(sIn-ST.lean)*(1-Math.exp(-dt/.3));KIT.animate(dt,boat.power,ST.lean);
 boat.speed=boat.power*CTL.k;   // speed follows power directly
 boat.position.x-=Math.sin(boat.heading)*boat.speed*dt;boat.position.z-=Math.cos(boat.heading)*boat.speed*dt;
 floatStep(dt,t);floaters(dt,t);boat.updateMatrixWorld(true);nightLights();wakeStep(dt);sprayStep(dt);boatLight();cameras(dt,t);if(window.sea.onCam)window.sea.onCam(dt);flipUI();placeBar(dt)}

/* ===== 12. main loop ===== */
applyPreset('Midday');sim.updateSpectrum();dirty=false;setQuality();
window.sea={scene,camera,renderer,water,seabed,P,U,sim,boat,KIT,TUNE,S,ST,hullG,shell,DECK,CTL,keys,setMode,setLever:v=>{thrLever=v},getMode:()=>mode,splash:(x,z,k)=>{if(nImp<24){impB[nImp*3]=x;impB[nImp*3+1]=z;impB[nImp*3+2]=k;nImp++}},storm:()=>storm,wake:()=>wkA};
let last=performance.now(),lastBuild=0;
renderer.setAnimationLoop(now=>{
 const dt=Math.min((now-last)/1000,.1);last=now;U.uTime.value+=dt;
 if(P.play)P.hour=(P.hour+dt*24/(P.dayMin*60))%24;
 if(Math.abs(target-storm)>5e-4){storm+=(target-storm)*(1-Math.exp(-dt/5));applyStorm();dirty=true}   // ~5 s easing
 else if(storm!==target){storm=target;applyStorm();dirty=true}
 hEff+=(P.height-hEff)*(1-Math.exp(-dt/.8));if(Math.abs(P.height-hEff)>.004)dirty=true;   // eased height: rebuild steps stay tiny
 P.hs=4*Math.sqrt(hsVar(WS,hEff)+hsVar(SW,hEff));lamEff=P.chop/(1+.08*Math.max(P.hs-3,0));   // big seas get less choppiness: no fold-over
 stepSpectrum(dt,U.uTime.value);sim.update(U.uTime.value,dt);
 for(let i=0;i<3;i++){WU['uD'+i].value=sim.displacement(i);WU['uF'+i].value=sim.derivatives(i)}
 lightning(dt);lighting();
 pp.textContent=P.play?'⏸':'▶';st.value=target*100;wh.value=P.height;
 if(window.sea.onFrame)window.sea.onFrame(dt);boatFrame(dt,U.uTime.value);seabed.position.set(camera.position.x,-Math.max(14,1.3*P.hs+6),camera.position.z);
 if(P.quality==='Auto'){ema=ema*.95+dt*50;hold-=dt;                                                  // auto resolution, cooldown + hold
  if(hold<0){if(ema>24&&res>.55){res=Math.max(.55,res-.15);hold=4;resize()}else if(ema<15.5&&res<1){res=Math.min(1,res+.15);hold=8;resize()}}}
 renderer.render(scene,camera)});
