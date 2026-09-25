/* ==================================================================
   REX — the agent, in 3D
   ------------------------------------------------------------------
   Not a logo. A picture of what REX does:

     · the MIND — a particle sphere whose surface ripples with noise.
       It churns harder while REX is thinking.
     · the GATE — two hexagon rings (the sigil's shape) around the mind.
       This is the permission gate.
     · the TOOLS — labelled tiles orbiting outside the gate.
     · a THOUGHT — a pulse that leaves the mind along a curved synapse
       toward a tool. Safe tools (read, grep, search) pass straight
       through. Risky ones (edit, shell, desktop…) stop AT the gate,
       which flares red — "waiting for approval" — then turns white and
       lets the pulse through.

   The page hears each phase as a `rex:tool` event
   ({ name, phase: "call" | "gate" | "approved" | "done" }).

   Sections steer the scene: data-core="slot" docks it into that
   section's .core-slot; anything else is ambient (small, low, dim,
   labels hidden so no text ever sits under body copy).

   Performance: 60fps docked / 30fps ambient, paused when hidden, DPR
   capped, bloom desktop-only, and a governor that sheds bloom then
   resolution if frames run long. Reduced motion: no clock.
   ================================================================== */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* Ashima 3D simplex noise — the ripple on the mind's surface */
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

function boot(canvas) {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = !matchMedia("(pointer: fine)").matches || innerWidth < 820;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  let dprCap = coarse ? 1.25 : 1.5;
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
  renderer.setClearColor(0x050406, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050406, 0.045);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(0, 0, 9);
  const VIS_H = 2 * 9 * Math.tan(THREE.MathUtils.degToRad(19));
  const OUTER = 3.7; // radius of the whole rig, used to fit it into a slot

  const rig = new THREE.Group();
  scene.add(rig);

  /* ================= the mind ================= */
  const MIND_R = 1.15;
  const PN = coarse ? 2600 : 7000;
  const mPos = new Float32Array(PN * 3);
  const mSeed = new Float32Array(PN);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < PN; i++) {
    const y = 1 - (i / (PN - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    mPos[i * 3] = Math.cos(th) * r * MIND_R;
    mPos[i * 3 + 1] = y * MIND_R;
    mPos[i * 3 + 2] = Math.sin(th) * r * MIND_R;
    mSeed[i] = Math.random();
  }
  const mindGeo = new THREE.BufferGeometry();
  mindGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
  mindGeo.setAttribute("seed", new THREE.BufferAttribute(mSeed, 1));

  const mindU = {
    uTime: { value: 0 },
    uAmp: { value: 0.18 },
    uGlow: { value: 1 },
    uSize: { value: coarse ? 3.2 : 2.6 },
    uDpr: { value: renderer.getPixelRatio() },
  };
  const mind = new THREE.Points(
    mindGeo,
    new THREE.ShaderMaterial({
      uniforms: mindU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        ${NOISE}
        uniform float uTime, uAmp, uSize, uDpr;
        attribute float seed;
        varying float vN;
        varying float vSeed;
        void main(){
          vec3 p = position;
          float n = snoise(p * 1.6 + vec3(0.0, uTime * 0.35, uTime * 0.2));
          float n2 = snoise(p * 4.0 - uTime * 0.6) * 0.35;
          float d = (n + n2) * uAmp;
          p *= 1.0 + d;
          vN = n;
          vSeed = seed;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uDpr * (0.55 + 0.9 * max(n, 0.0) + seed * 0.4) * (7.0 / -mv.z);
        }`,
      fragmentShader: `
        uniform float uGlow;
        varying float vN;
        varying float vSeed;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.0, d);
          vec3 deep = vec3(0.55, 0.03, 0.07);
          vec3 red  = vec3(1.0, 0.18, 0.24);
          vec3 hot  = vec3(1.0, 0.86, 0.82);
          vec3 col = mix(deep, red, smoothstep(-0.4, 0.2, vN));
          col = mix(col, hot, smoothstep(0.35, 0.85, vN));
          gl_FragColor = vec4(col, soft * (0.35 + 0.65 * uGlow) * (0.55 + 0.45 * vSeed));
        }`,
    })
  );
  rig.add(mind);

  // a hot point at the centre of the mind
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,230,225,1)");
    grd.addColorStop(0.18, "rgba(255,70,85,0.7)");
    grd.addColorStop(0.5, "rgba(255,30,50,0.15)");
    grd.addColorStop(1, "rgba(255,30,50,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  heart.scale.setScalar(1.9);
  rig.add(heart);

  // two fast "iris" rings: attention sweeping around the mind
  const iris = [];
  for (let k = 0; k < 2; k++) {
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(MIND_R * (1.32 + k * 0.1)));
    }
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xff5a66, dashSize: 0.12, gapSize: 0.18, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.computeLineDistances();
    ring.rotation.x = k ? 1.2 : -0.5;
    ring.rotation.y = k ? 0.4 : -0.3;
    rig.add(ring);
    iris.push(ring);
  }

  /* ================= the gate ================= */
  const GATE_R = 2.15;
  const hexLoop = (r) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  };
  const gateMat = new THREE.LineBasicMaterial({ color: 0xff2d3d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const gate = new THREE.Group();
  const gateA = new THREE.Line(hexLoop(GATE_R), gateMat);
  const gateB = new THREE.Line(hexLoop(GATE_R * 1.04), gateMat);
  gateB.rotation.y = Math.PI / 2;
  gate.add(gateA, gateB);
  // a translucent hex "shield" plane that flares when the gate holds a call
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0xff2d3d, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const shield = new THREE.Mesh(new THREE.CircleGeometry(GATE_R, 6, Math.PI / 2), shieldMat);
  gate.add(shield);
  rig.add(gate);

  /* ================= tools ================= */
  const TOOLS = [
    { name: "read", risk: false }, { name: "grep", risk: false }, { name: "edit", risk: true },
    { name: "shell", risk: true }, { name: "browser", risk: false }, { name: "git", risk: true },
    { name: "web_fetch", risk: false }, { name: "memory", risk: false }, { name: "write", risk: true },
    { name: "desktop", risk: true }, { name: "search", risk: false }, { name: "plan", risk: false },
  ];
  const TOOL_R = 3.35;

  function tileTexture(label, risk) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 72;
    const g = c.getContext("2d");
    const r = 16;
    g.beginPath();
    g.moveTo(r, 2); g.arcTo(254, 2, 254, 70, r); g.arcTo(254, 70, 2, 70, r); g.arcTo(2, 70, 2, 2, r); g.arcTo(2, 2, 254, 2, r);
    g.closePath();
    g.fillStyle = "rgba(14,9,11,0.92)";
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = risk ? "rgba(255,70,85,0.95)" : "rgba(255,220,215,0.45)";
    g.stroke();
    g.fillStyle = risk ? "#ff4b58" : "#3ee0a1";
    g.beginPath(); g.arc(30, 36, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f5efef";
    g.font = "500 30px 'JetBrains Mono', ui-monospace, Consolas, monospace";
    g.textBaseline = "middle";
    g.fillText(label, 50, 38);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  const toolRing = new THREE.Group();
  toolRing.rotation.x = 0.32;
  rig.add(toolRing);
  const tiles = TOOLS.map((tool, i) => {
    const a = (i / TOOLS.length) * Math.PI * 2;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tileTexture(tool.name, tool.risk), transparent: true, depthWrite: false }));
    s.position.set(Math.cos(a) * TOOL_R, Math.sin(a * 2) * 0.35, Math.sin(a) * TOOL_R);
    s.scale.set(1.5, 0.42, 1);
    s.userData = { tool, flash: 0, base: s.position.clone() };
    toolRing.add(s);
    return s;
  });
  // relabel once the mono web font is ready, so the tiles use it
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      tiles.forEach((s) => {
        s.material.map.dispose();
        s.material.map = tileTexture(s.userData.tool.name, s.userData.tool.risk);
        s.material.needsUpdate = true;
      });
    });
  }

  /* ================= thought: synapse + pulse ================= */
  const SEG = 48;
  const synGeo = new THREE.BufferGeometry().setFromPoints(new Array(SEG + 1).fill(0).map(() => new THREE.Vector3()));
  const synMat = new THREE.LineBasicMaterial({ color: 0xff7a84, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const synapse = new THREE.Line(synGeo, synMat);
  rig.add(synapse);
  const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  pulse.scale.setScalar(0.55);
  rig.add(pulse);

  // one thought at a time: call → (gate → approved) → done → rest
  const thought = { active: false, phase: "rest", t: 0, hold: 0, tile: null, curve: null, gateT: 0, restUntil: 0 };
  const tmp = new THREE.Vector3();

  function emit(name, phase) {
    dispatchEvent(new CustomEvent("rex:tool", { detail: { name, phase } }));
  }

  function think(now, forceTile) {
    const tile = forceTile || tiles[(Math.random() * tiles.length) | 0];
    tile.updateWorldMatrix(true, false);
    const end = tile.getWorldPosition(new THREE.Vector3());
    rig.worldToLocal(end);
    const dir = end.clone().normalize();
    const start = dir.clone().multiplyScalar(MIND_R * 1.05);
    const ctrl = dir.clone().multiplyScalar(2.4).add(new THREE.Vector3(0, 0.9, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);
    const pts = curve.getPoints(SEG);
    const p = synGeo.attributes.position;
    for (let i = 0; i <= SEG; i++) p.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    p.needsUpdate = true;
    // where along the curve it crosses the gate
    let gateT = 0.5;
    for (let i = 0; i <= SEG; i++) if (pts[i].length() >= GATE_R) { gateT = i / SEG; break; }
    Object.assign(thought, { active: true, phase: "call", t: 0, tile, curve, gateT, hold: 0 });
    emit(tile.userData.tool.name, "call");
  }

  /* ================= surroundings ================= */
  const grid = new THREE.GridHelper(80, 80, 0x4a0a12, 0x170b0f);
  grid.position.y = -4.4;
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  scene.add(grid);

  const DN = coarse ? 350 : 1000;
  const dPos = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) {
    const r = 5 + Math.random() * 9;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    dPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    dPos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
    dPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 2;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0xff6b76, size: 0.03, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dust);

  /* ================= post ================= */
  let composer = null;
  let bloom = null;
  if (!coarse) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.35, 0.4);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /* ================= sizing + steering ================= */
  let W = 0, H = 0;
  let dirty = true;
  function resize() {
    W = innerWidth;
    H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    mindU.uDpr.value = renderer.getPixelRatio();
    if (composer) {
      composer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
      composer.setSize(W, H);
      bloom.resolution.set(W / 2, H / 2);
    }
    dirty = true;
  }

  const target = { x: 0, y: 0, s: 1, glow: 1, labels: 1 };
  const cur = { x: 0, y: 0, s: 0.5, glow: 0, labels: 0 };
  let docked = false;
  let slotEl = null;
  const sections = Array.prototype.slice.call(document.querySelectorAll("[data-core]"));

  function pickSection() {
    const mid = H * 0.5;
    let found = null;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { found = s; break; }
    }
    slotEl = found && found.getAttribute("data-core") === "slot" ? found.querySelector(".core-slot") : null;
  }

  function steer() {
    const visW = VIS_H * camera.aspect;
    if (slotEl) {
      const r = slotEl.getBoundingClientRect();
      target.x = ((r.left + r.width / 2) / W - 0.5) * visW;
      target.y = -((r.top + r.height / 2) / H - 0.5) * VIS_H;
      target.s = Math.max(0.25, ((Math.min(r.width, r.height) / H) * VIS_H) / 2 / OUTER);
      target.glow = 1;
      target.labels = 1;
      docked = true;
    } else {
      target.x = 0;
      target.y = -VIS_H * 0.18;
      target.s = (Math.min(visW, VIS_H) * 0.5) / OUTER;
      target.glow = 0.2;
      target.labels = 0;
      docked = false;
    }
  }

  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; pickSection(); dirty = true; });
  }, { passive: true });
  addEventListener("resize", () => { resize(); pickSection(); });

  const tilt = { x: 0, y: 0 }, tiltT = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => {
    tiltT.x = (e.clientY / H - 0.5) * 0.45;
    tiltT.y = (e.clientX / W - 0.5) * 0.6;
  }, { passive: true });

  // a click on the stage makes REX reach for a risky tool, so the gate is shown on demand
  let kick = 0;
  addEventListener("rex:pulse", () => {
    kick = 1;
    if (!thought.active) {
      const risky = tiles.filter((s) => s.userData.tool.risk);
      think(performance.now(), risky[(Math.random() * risky.length) | 0]);
    }
  });

  /* ================= loop ================= */
  let visible = !document.hidden;
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; last = performance.now(); });
  const clock0 = performance.now();
  let last = clock0;
  let slowFrames = 0;
  thought.restUntil = clock0 + 900;
  const gateRed = new THREE.Color(0xff2d3d);
  const gateHot = new THREE.Color(0xffe2dc);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const budget = docked ? 1000 / 60 : 1000 / 30;
    const elapsed = now - last;
    if (elapsed < budget - 1.5) return;
    if (reduced && !dirty) return;
    last = now;
    dirty = false;

    const dt = Math.min(elapsed / 1000, 0.1);
    const t = reduced ? 8 : (now - clock0) / 1000;
    const k = 1 - Math.pow(0.001, dt);

    if (!reduced) {
      if (elapsed > budget * 1.7) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 40) {
        slowFrames = 0;
        if (composer) composer = null;
        else if (dprCap > 0.75) { dprCap -= 0.25; renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap)); mindU.uDpr.value = renderer.getPixelRatio(); }
      }
    }

    steer();
    for (const key in target) cur[key] += (target[key] - cur[key]) * (reduced ? 1 : k * 0.9);
    rig.position.set(cur.x, cur.y, 0);
    rig.scale.setScalar(cur.s);
    tilt.x += (tiltT.x - tilt.x) * k;
    tilt.y += (tiltT.y - tilt.y) * k;
    rig.rotation.set(tilt.x, tilt.y + Math.sin(t * 0.15) * 0.2, 0);

    /* ---- thought state machine ---- */
    let gateHeat = 0; // 0 idle, 1 holding (red), -1 just approved (white)
    if (!thought.active && now > thought.restUntil) think(now);
    if (thought.active) {
      const risk = thought.tile.userData.tool.risk;
      const speed = 0.9;
      if (thought.phase === "call") {
        thought.t += dt * speed;
        if (risk && thought.t >= thought.gateT) {
          thought.t = thought.gateT;
          thought.phase = "gate";
          thought.hold = 0;
          emit(thought.tile.userData.tool.name, "gate");
        } else if (thought.t >= 1) thought.phase = "arrive";
      } else if (thought.phase === "gate") {
        thought.hold += dt;
        gateHeat = 1;
        if (thought.hold > (reduced ? 0 : 1.3)) {
          thought.phase = "pass";
          thought.hold = 0;
          emit(thought.tile.userData.tool.name, "approved");
        }
      } else if (thought.phase === "pass") {
        thought.hold += dt;
        gateHeat = -1;
        thought.t += dt * speed;
        if (thought.t >= 1) thought.phase = "arrive";
      }
      if (thought.phase === "arrive") {
        thought.tile.userData.flash = 1;
        emit(thought.tile.userData.tool.name, "done");
        thought.active = false;
        thought.phase = "rest";
        thought.restUntil = now + (reduced ? 1e9 : 900 + Math.random() * 1100);
      }
      thought.curve.getPoint(Math.min(1, thought.t), tmp);
      pulse.position.copy(tmp);
    }
    const on = thought.active ? 1 : 0;
    synMat.opacity += ((on ? 0.55 : 0) * (0.4 + cur.glow * 0.6) - synMat.opacity) * Math.min(1, dt * 8);
    pulse.material.opacity += ((on ? 1 : 0) * (0.3 + cur.glow * 0.7) - pulse.material.opacity) * Math.min(1, dt * 10);

    /* ---- mind ---- */
    kick = Math.max(0, kick - dt * 1.2);
    const busy = thought.active ? 1 : 0;
    mindU.uTime.value = t;
    mindU.uAmp.value += ((0.14 + busy * 0.1 + kick * 0.2) - mindU.uAmp.value) * Math.min(1, dt * 3);
    mindU.uGlow.value = 0.3 + cur.glow * 0.7;
    mind.rotation.y = t * 0.12;
    heart.material.opacity = (0.55 + 0.25 * Math.sin(t * 2.2) + busy * 0.2) * (0.35 + cur.glow * 0.65);
    iris[0].rotation.z = t * 0.9;
    iris[1].rotation.z = -t * 0.6;
    iris.forEach((r) => (r.material.opacity = 0.2 + cur.glow * 0.4));

    /* ---- gate ---- */
    gate.rotation.y = t * 0.12;
    gate.rotation.z = Math.sin(t * 0.3) * 0.1;
    const holding = gateHeat === 1;
    gateMat.color.copy(gateHeat === -1 ? gateHot : gateRed);
    const gateOp = (holding ? 0.8 + 0.2 * Math.sin(t * 18) : gateHeat === -1 ? 0.9 : 0.4) * (0.35 + cur.glow * 0.65);
    gateMat.opacity += (gateOp - gateMat.opacity) * Math.min(1, dt * 10);
    shieldMat.opacity += ((holding ? 0.14 : 0) - shieldMat.opacity) * Math.min(1, dt * 8);
    gate.scale.setScalar(holding ? 1 + 0.015 * Math.sin(t * 18) : 1);

    /* ---- tools ---- */
    toolRing.rotation.y = t * 0.08;
    tiles.forEach((s) => {
      const u = s.userData;
      u.flash = Math.max(0, u.flash - dt * 1.4);
      const lit = thought.active && thought.tile === s ? 0.35 : 0;
      const g = 1 + u.flash * 0.25 + lit * 0.3;
      s.scale.set(1.5 * g, 0.42 * g, 1);
      s.material.opacity = cur.labels * (0.78 + u.flash * 0.22 + lit);
      s.position.y = u.base.y + Math.sin(t * 0.8 + u.base.x) * 0.06;
    });

    dust.rotation.y = t * 0.01;
    grid.position.z = (t * 0.5) % 1;

    if (composer) {
      bloom.strength = 0.25 + cur.glow * 0.5 + kick * 0.4;
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    if (!root.classList.contains("core-on")) root.classList.add("core-on");
  }

  resize();
  pickSection();
  requestAnimationFrame((n) => { last = n - 100; frame(n); });
}

// Started last: boot() reads NOISE, which a top-level `const` only
// defines once the module body reaches it.
const canvas = document.getElementById("core");
if (canvas) {
  try {
    boot(canvas);
  } catch (e) {
    console.warn("[core] disabled:", e && e.message);
  }
}
