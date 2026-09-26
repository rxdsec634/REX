/* ==================================================================
   REX — origami eagle → origami lion
   ------------------------------------------------------------------
   One mesh of loose paper facets that holds two shapes:

     · an origami EAGLE flying at the viewer — faceted body, hooked
       gold beak, angry brow, glowing red eyes, and wings built feather
       by feather (leading edge, two covert rows, secondaries, fingered
       primaries) that flap from the shoulder with the hand lagging
     · an origami LION head facing the viewer — scowling brow, glowing
       red eyes, caramel muzzle, and a mane of folded paper spikes in four
       interleaved rings, caramel at the face to dark chocolate at the edge

   Every facet has a slot in both. Scrolling down the page drives p from
   0 at the top to 1 near the bottom, the same on every page: each facet
   breaks off on its own delay, spins along a curved path and re-folds
   into its place in the lion. Facets the lion has no slot for become
   floating fragments.

   Placement: data-core="slot" docks the scene into that section's
   .core-slot; other sections dim it so copy stays readable.

   Performance: ~600 facets posed on the CPU (cheap), 60fps docked /
   30fps dimmed, paused when hidden, DPR capped, bloom desktop-only,
   and a governor that sheds bloom then resolution on long frames.
   Debug: ?pose=0.5 pins the morph.
   ================================================================== */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ---------------- small deterministic random ---------------- */
let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);

/* ---------------- palette: fire and sunlight ---------------- */
const C = {
  deep: new THREE.Color(0x4a060c),
  crimson: new THREE.Color(0xa80f1c),
  red: new THREE.Color(0xe0232e),
  orange: new THREE.Color(0xff6418),
  gold: new THREE.Color(0xffbe32),
  pale: new THREE.Color(0xffe6a8),
};
function ramp(t) {
  // crimson → red → orange → gold along t
  const stops = [C.crimson, C.red, C.orange, C.gold];
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return stops[i].clone().lerp(stops[i + 1], x - i);
}
// paper: every facet catches light a little differently
const facet = (c, amt = 0.1) => c.clone().multiplyScalar(1 - amt / 2 + rnd() * amt);

/* ================================================================
   Geometry builders — each pushes triangles as
   { v: [x,y,z ×3], color: THREE.Color, bone: n }
   ================================================================ */
const BONE = { body: 0, armL: 1, handL: 2, armR: 3, handR: 4, tail: 5 };

function buildEagle() {
  const tris = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tri = (a, b, c, color, bone = BONE.body) => tris.push({ v: [a, b, c], color, bone });

  /* ---- body: rings along z, the head toward the viewer (+z) ---- */
  const rings = [
    { z: 1.25, y: 0.06, rx: 0.12, ry: 0.11, t: 0.25 },
    { z: 1.0, y: 0.1, rx: 0.23, ry: 0.2, t: 0.2 },
    { z: 0.7, y: 0.03, rx: 0.21, ry: 0.2, t: 0.35 },
    { z: 0.35, y: -0.02, rx: 0.4, ry: 0.31, t: 0.7 },
    { z: -0.2, y: -0.03, rx: 0.37, ry: 0.28, t: 0.45 },
    { z: -0.72, y: 0.02, rx: 0.2, ry: 0.14, t: 0.3 },
    { z: -0.98, y: 0.03, rx: 0.1, ry: 0.06, t: 0.35 },
  ];
  const K = 8;
  const ringPts = rings.map((r) => {
    const pts = [];
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2 + Math.PI / 2;
      const j = 0.92 + rnd() * 0.16; // paper is never perfectly round
      pts.push(V(Math.cos(a) * r.rx * j, r.y + Math.sin(a) * r.ry * j, r.z + (rnd() - 0.5) * 0.04));
    }
    return pts;
  });
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < K; k++) {
      const a = ringPts[r][k], b = ringPts[r][(k + 1) % K], c = ringPts[r + 1][(k + 1) % K], d = ringPts[r + 1][k];
      // belly facets lean gold (the eagle's breast), back facets stay deep red
      const under = Math.sin(((k + 0.5) / K) * Math.PI * 2 + Math.PI / 2) < 0;
      const base = under ? ramp(0.55 + rings[r].t * 0.4) : ramp(rings[r].t * 0.5);
      if ((r + k) % 2) { tri(a, b, c, facet(base)); tri(a, c, d, facet(base)); }
      else { tri(a, b, d, facet(base)); tri(b, c, d, facet(base)); }
    }
  }
  // tail cap
  const tailTip = V(0, 0.04, -1.05);
  for (let k = 0; k < K; k++) tri(ringPts[6][k], tailTip, ringPts[6][(k + 1) % K], facet(C.crimson));

  /* ---- beak: hooked, gold ---- */
  const top = V(0, 0.15, 1.2), L = V(-0.1, 0.02, 1.22), R = V(0.1, 0.02, 1.22);
  const tip = V(0, 0.0, 1.58), hook = V(0, -0.17, 1.5), chin = V(0, -0.07, 1.28);
  [[top, L, tip], [top, tip, R], [L, hook, tip], [R, tip, hook], [L, chin, hook], [R, hook, chin]].forEach((t) =>
    tri(t[0], t[1], t[2], facet(C.gold, 0.14))
  );
  // face plate around the beak root
  for (let k = 0; k < K; k++) tri(ringPts[0][k], ringPts[0][(k + 1) % K], V(0, 0.05, 1.3), facet(C.red));

  /* ---- brow: angled down toward the beak — the scowl ---- */
  for (const s of [-1, 1]) {
    tri(V(s * 0.04, 0.24, 1.14), V(s * 0.25, 0.2, 0.96), V(s * 0.1, 0.3, 0.9), facet(C.deep, 0.05));
    tri(V(s * 0.04, 0.24, 1.14), V(s * 0.19, 0.13, 1.06), V(s * 0.25, 0.2, 0.96), facet(C.crimson, 0.05));
  }

  /* ---- one folded feather: 4 facets around a raised crease ---- */
  function feather(root, dir, len, width, color, bone, fold = 0.045) {
    const d = dir.clone().normalize();
    const side = new THREE.Vector3().crossVectors(d, V(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, d).normalize();
    const v0 = root.clone();
    const v1 = root.clone().addScaledVector(d, len * 0.35).addScaledVector(side, width / 2).addScaledVector(up, -fold * 0.4);
    const v3 = root.clone().addScaledVector(d, len * 0.35).addScaledVector(side, -width / 2).addScaledVector(up, -fold * 0.4);
    const v2 = root.clone().addScaledVector(d, len);
    const c1 = root.clone().addScaledVector(d, len * 0.5).addScaledVector(up, fold);
    const tipC = ramp(0.75).lerp(C.gold, 0.5);
    tri(v0, v1, c1, facet(color), bone);
    tri(c1, v1, v2, facet(color.clone().lerp(tipC, 0.5)), bone);
    tri(v0, c1, v3, facet(color.clone().multiplyScalar(0.82)), bone);
    tri(c1, v2, v3, facet(color.clone().lerp(tipC, 0.5).multiplyScalar(0.85)), bone);
  }

  /* ---- wings ---- */
  for (const s of [-1, 1]) {
    const arm = s < 0 ? BONE.armL : BONE.armR;
    const hand = s < 0 ? BONE.handL : BONE.handR;
    const WRIST = 1.85;
    const lead = [V(0.28, 0.1, 0.3), V(1.0, 0.17, 0.44), V(WRIST, 0.15, 0.3), V(2.7, 0.08, 0.0)];
    const leadAt = (x) => {
      for (let i = 0; i < lead.length - 1; i++) {
        if (x <= lead[i + 1].x || i === lead.length - 2) {
          const t = clamp01((x - lead[i].x) / (lead[i + 1].x - lead[i].x));
          return lead[i].clone().lerp(lead[i + 1], t);
        }
      }
    };
    const boneAt = (x) => (x < WRIST ? arm : hand);
    const S = (p) => V(p.x * s, p.y, p.z);

    // leading edge: a pleated strip with a raised ridge
    const N = 12;
    let prev = null;
    for (let k = 0; k <= N; k++) {
      const x = lerp(0.28, 2.7, k / N);
      const P = leadAt(x);
      const chord = lerp(0.3, 0.16, k / N);
      const Rg = P.clone().add(V(0, 0.05, -chord * 0.5));
      const B = P.clone().add(V(0, -0.01, -chord));
      if (prev) {
        const col = ramp(0.1 + (k / N) * 0.5);
        const b = boneAt((x + prev.x) / 2);
        tri(S(prev.P), S(P), S(Rg), facet(col), b); tri(S(prev.P), S(Rg), S(prev.R), facet(col), b);
        tri(S(prev.R), S(Rg), S(B), facet(col.clone().multiplyScalar(0.8)), b); tri(S(prev.R), S(B), S(prev.B), facet(col.clone().multiplyScalar(0.8)), b);
      }
      prev = { P, R: Rg, B, x };
    }

    // lesser and greater coverts
    const rows = [{ n: 11, back: 0.22, len: 0.45, w: 0.22, from: 0.35, to: 2.35 }, { n: 10, back: 0.42, len: 0.55, w: 0.25, from: 0.35, to: 2.2 }];
    rows.forEach((row, ri) => {
      for (let i = 0; i < row.n; i++) {
        const x = lerp(row.from, row.to, i / (row.n - 1));
        const root = leadAt(x).add(V(0, 0.02 - ri * 0.02, -row.back));
        const dir = V(0.12 + (x / 2.7) * 0.25, -0.05, -1);
        feather(S(root), V(dir.x * s, dir.y, dir.z), row.len, row.w, ramp(0.15 + (x / 2.7) * 0.45 + ri * 0.08), boneAt(x));
      }
    });

    // secondaries along the arm
    for (let i = 0; i < 10; i++) {
      const x = lerp(0.35, 1.8, i / 9);
      const root = leadAt(x).add(V(0, -0.02, -0.62));
      const dir = V(0.05 + (i / 9) * 0.2, -0.04, -1);
      feather(S(root), V(dir.x * s, dir.y, dir.z), lerp(1.0, 0.92, i / 9), 0.22, ramp(0.35 + (i / 9) * 0.3), arm, 0.05);
    }

    // primaries: the fingered wingtip, fanning outward
    for (let j = 0; j < 9; j++) {
      const x = lerp(1.75, 2.62, j / 8);
      const root = leadAt(x).add(V(0, -0.02, -0.22));
      const ang = 0.25 + j * 0.15;
      const dir = V(Math.sin(ang), -0.03, -Math.cos(ang));
      feather(S(root), V(dir.x * s, dir.y, dir.z), 1.12 + j * 0.06, lerp(0.21, 0.16, j / 8), ramp(0.55 + (j / 8) * 0.45), hand, 0.05);
    }
  }

  /* ---- tail fan ---- */
  for (let i = 0; i < 7; i++) {
    const a = lerp(-0.45, 0.45, i / 6);
    feather(V(a * 0.35, 0.03, -0.95), V(Math.sin(a), -0.02, -Math.cos(a)), 0.85, 0.22, ramp(0.4 + Math.abs(a) * 0.6), BONE.tail, 0.04);
  }

  return tris;
}

/* a lion is brown: dark chocolate at the edge of the mane, caramel at the face */
const CHOC = {
  dark: new THREE.Color(0x24140b),
  choc: new THREE.Color(0x4a2c18),
  milk: new THREE.Color(0x7a4a28),
  caramel: new THREE.Color(0xa8703f),
  tan: new THREE.Color(0xc99a66),
};
function chocRamp(t) {
  const stops = [CHOC.dark, CHOC.choc, CHOC.milk, CHOC.caramel];
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return stops[i].clone().lerp(stops[i + 1], x - i);
}

function buildLion() {
  const tris = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tri = (a, b, c, color) => tris.push({ v: [a, b, c], color });
  const mirror = (p) => V(-p.x, p.y, p.z);

  /* ---- face: hand-placed facets, right half mirrored to the left ----
     The brow sits low in the middle and high at the sides: the scowl. */
  const Ct = V(0, 1.2, 0.3), Cb = V(0, 0.5, 0.64), Cr = V(0, 0.1, 0.86), Cn = V(0, -0.33, 1.06);
  const Cl = V(0, -0.62, 0.96), Cm = V(0, -0.8, 0.86), Cc = V(0, -1.12, 0.62);
  const R = {
    fore: V(0.5, 1.05, 0.3), brow: V(0.52, 0.68, 0.5), temple: V(0.96, 0.72, 0.15),
    eyeIn: V(0.2, 0.36, 0.63), eyeOut: V(0.56, 0.36, 0.48), eyeLow: V(0.38, 0.17, 0.58),
    cheek: V(0.9, 0.04, 0.3), noseSide: V(0.24, -0.28, 0.89), muzzle: V(0.52, -0.5, 0.72),
    corner: V(0.34, -0.82, 0.72), jaw: V(0.72, -0.78, 0.35), cheekLow: V(0.99, -0.38, 0.15),
    earIn: V(0.55, 1.1, 0.2), earTip: V(0.98, 1.52, 0.02), earOut: V(1.13, 0.98, 0.02),
  };
  const gold = CHOC.caramel, pale = CHOC.tan, orange = CHOC.milk, deep = new THREE.Color(0x140a05), crimson = CHOC.choc;
  // [a, b, c, colour] with names from R, or centre points
  const face = [
    [Ct, "fore", Cb, gold], ["fore", "brow", Cb, orange], ["fore", "temple", "brow", orange],
    [Cb, "brow", "eyeIn", crimson], ["brow", "eyeOut", "eyeIn", crimson], ["brow", "temple", "eyeOut", orange],
    ["eyeIn", "eyeOut", "eyeLow", deep],
    [Cb, "eyeIn", Cr, gold], ["eyeIn", "eyeLow", Cr, gold], [Cr, "eyeLow", "noseSide", pale], [Cr, "noseSide", Cn, pale],
    ["eyeOut", "temple", "cheek", orange], ["eyeOut", "cheek", "eyeLow", gold], ["eyeLow", "cheek", "muzzle", gold], ["eyeLow", "muzzle", "noseSide", pale],
    [Cn, "noseSide", Cl, deep], ["noseSide", "muzzle", Cl, pale], [Cl, "muzzle", "corner", pale], [Cl, "corner", Cm, crimson],
    [Cm, "corner", Cc, gold], ["corner", "jaw", Cc, orange], ["muzzle", "jaw", "corner", gold], ["muzzle", "cheek", "jaw", orange],
    ["cheek", "cheekLow", "jaw", crimson], ["temple", "cheekLow", "cheek", crimson],
    ["earIn", "earTip", "earOut", orange], ["earIn", "earOut", "temple", deep], ["fore", "earIn", "temple", crimson], [Ct, "earIn", "fore", gold],
  ];
  const pt = (x) => (typeof x === "string" ? R[x] : x);
  face.forEach(([a, b, c, col]) => {
    const A = pt(a), B = pt(b), Cp = pt(c);
    tri(A, B, Cp, facet(col, 0.14));
    tri(mirror(A), mirror(Cp), mirror(B), facet(col, 0.14));
  });

  /* ---- mane: rings of folded paper spikes, caramel at the face to dark chocolate at the edge ---- */
  function spike(a, r0, r1, z0, z1, width, color) {
    const jit = (rnd() - 0.5) * 0.12;
    const root = V(Math.cos(a) * r0, Math.sin(a) * r0 * 1.06 - 0.05, z0);
    const tip = V(Math.cos(a + jit) * r1, Math.sin(a + jit) * r1 * 1.1 - 0.05, z1);
    const d = tip.clone().sub(root);
    const len = d.length();
    d.normalize();
    const side = V(-d.y, d.x, 0).normalize();
    const up = V(0, 0, 1);
    const v1 = root.clone().addScaledVector(d, len * 0.35).addScaledVector(side, width / 2).addScaledVector(up, -0.05);
    const v3 = root.clone().addScaledVector(d, len * 0.35).addScaledVector(side, -width / 2).addScaledVector(up, -0.05);
    const c1 = root.clone().addScaledVector(d, len * 0.5).addScaledVector(up, 0.09); // the raised fold
    const tipC = color.clone().lerp(CHOC.caramel, 0.3);
    tri(root, v1, c1, facet(color));
    tri(c1, v1, tip, facet(tipC));
    tri(root, c1, v3, facet(color.clone().multiplyScalar(0.8)));
    tri(c1, tip, v3, facet(tipC.clone().multiplyScalar(0.8)));
  }
  const layers = [
    { n: 18, r0: 0.95, r1: 1.75, z0: 0.12, z1: -0.05, w: 0.5, t: 0.85 },
    { n: 22, r0: 1.35, r1: 2.3, z0: -0.05, z1: -0.25, w: 0.55, t: 0.6 },
    { n: 26, r0: 1.85, r1: 2.8, z0: -0.25, z1: -0.5, w: 0.55, t: 0.35 },
    { n: 30, r0: 2.3, r1: 3.15, z0: -0.5, z1: -0.75, w: 0.5, t: 0.08 },
  ];
  layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      // offset each ring by half a spike so the layers interleave like fur
      const a = ((i + (li % 2) * 0.5) / L.n) * Math.PI * 2 + Math.PI / 2;
      spike(a, L.r0, L.r1 * (0.92 + rnd() * 0.16), L.z0, L.z1, L.w, chocRamp(L.t + (rnd() - 0.5) * 0.15));
    }
  });
  return tris;
}

/* ================================================================ */

function boot(canvas) {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = !matchMedia("(pointer: fine)").matches || innerWidth < 820;
  const pinned = (() => {
    const v = new URLSearchParams(location.search).get("pose");
    return v == null ? null : clamp01(parseFloat(v) || 0);
  })();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  let dprCap = coarse ? 1.25 : 1.5;
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
  renderer.setClearColor(0x050406, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050406, 12, 24);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
  camera.position.set(0, 0.4, 10);
  camera.lookAt(0, 0, 0);
  const VIS_H = 2 * 10 * Math.tan(THREE.MathUtils.degToRad(17.5));
  const OUTER = 2.95;

  /* ---- light: warm key, red rim, soft fill ---- */
  scene.add(new THREE.HemisphereLight(0xffd9b0, 0x1a0508, 0.75));
  const key = new THREE.DirectionalLight(0xffc27a, 2.6);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0xff2030, 90, 18, 1.6);
  rim.position.set(0, 1.5, -4);
  scene.add(rim);
  const fill = new THREE.PointLight(0xff7a2a, 25, 14, 1.6);
  fill.position.set(4, -2, 4);
  scene.add(fill);

  const rig = new THREE.Group();
  scene.add(rig);

  /* ---- facets: pair every eagle facet with a slot in the lion ---- */
  seed = 1337;
  const eagle = buildEagle();
  const lion = buildLion();
  // spare eagle facets become fragments orbiting the finished lion
  const targets = lion.map((t) => ({ ...t, frag: false }));
  while (targets.length < eagle.length) {
    const a = rnd() * Math.PI * 2, r = 2.9 + rnd() * 0.9, z = (rnd() - 0.5) * 1.6, s = 0.07 + rnd() * 0.06;
    const c = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z);
    targets.push({
      v: [c.clone().add(new THREE.Vector3(s, 0, 0)), c.clone().add(new THREE.Vector3(-s / 2, s, 0)), c.clone().add(new THREE.Vector3(0, -s, s / 2))],
      color: facet(chocRamp(0.3 + rnd() * 0.7)), frag: true, orbit: { a, r, z, speed: 0.1 + rnd() * 0.2 },
    });
  }
  // sort both by x so the left wing folds into the left of the mane
  const cx = (t) => (t.v[0].x + t.v[1].x + t.v[2].x) / 3 + ((t.v[0].y + t.v[1].y + t.v[2].y) / 3) * 0.15;
  eagle.sort((a, b) => cx(a) - cx(b));
  targets.sort((a, b) => cx(a) - cx(b));

  const N = eagle.length;
  const pos = new Float32Array(N * 9);
  const col = new Float32Array(N * 9);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));

  const F = eagle.map((e, i) => {
    const t = targets[i];
    const eDist = Math.abs(cx(e)) / 3; // wingtips break off first
    return {
      bind: e.v, bone: e.bone, cA: e.color, cB: t.color, hexV: t.v, frag: t.frag, orbit: t.orbit,
      delay: 0.02 + (1 - eDist) * 0.22 + rnd() * 0.12,
      scatter: new THREE.Vector3(rnd() - 0.5, rnd() - 0.3, rnd() * 0.6).normalize().multiplyScalar(1.2 + rnd() * 1.6),
      axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
      spin: (rnd() > 0.5 ? 1 : -1) * (Math.PI * (1 + rnd() * 2)),
    };
  });

  const glowU = { value: 0.12 };
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0.05,
  });
  // paper that glows: emissive follows each facet's own colour
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glowU;
    sh.fragmentShader = "uniform float uGlow;\n" + sh.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * uGlow;"
    );
  };
  const paper = new THREE.Mesh(geo, mat);
  rig.add(paper);

  /* ---- eyes ---- */
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,235,225,1)");
    grd.addColorStop(0.25, "rgba(255,40,50,0.85)");
    grd.addColorStop(1, "rgba(255,20,30,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff1a28, emissive: 0xff1020, emissiveIntensity: 4, flatShading: true, transparent: true });
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.045), eyeMat));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(0.32);
    g.add(halo);
    g.userData = { local: new THREE.Vector3(s * 0.14, 0.15, 1.1), halo };
    rig.add(g);
    return g;
  });
  // the lion's eyes: they ignite only once the face has folded together
  const lionEyeMat = eyeMat.clone();
  const lionEyes = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.07), lionEyeMat));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(0.55);
    g.add(halo);
    g.userData = { local: new THREE.Vector3(s * 0.37, 0.27, 0.64), halo };
    rig.add(g);
    return g;
  });

  /* ---- sparks (the break-apart burst) and floating shards ---- */
  const SP = coarse ? 220 : 520;
  const spBase = new Float32Array(SP * 3);
  for (let i = 0; i < SP; i++) {
    const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.6 + rnd() * 2.6);
    spBase.set([v.x, v.y, v.z], i * 3);
  }
  const spPos = new Float32Array(spBase);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: 0xffb03a, size: 0.045, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  rig.add(sparks);

  const SH = coarse ? 22 : 45;
  const shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.05), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.7, color: 0x8a3a2a }), SH);
  const shardInfo = [];
  for (let i = 0; i < SH; i++) {
    shardInfo.push({ a: rnd() * Math.PI * 2, r: 5 + rnd() * 6, y: (rnd() - 0.5) * 7, z: -4 - rnd() * 8, s: 0.5 + rnd() * 1.4, spd: 0.03 + rnd() * 0.08, rot: rnd() * 6 });
    shards.setColorAt(i, facet(ramp(rnd()), 0.3));
  }
  scene.add(shards);

  const grid = new THREE.GridHelper(90, 90, 0x4a0a12, 0x170b0f);
  grid.position.y = -4.6;
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  scene.add(grid);

  /* ---- post ---- */
  let composer = null, bloom = null;
  if (!coarse) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.62);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /* ---- sizing + steering ---- */
  let W = 0, H = 0, dirty = true;
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
      composer.setSize(W, H);
      bloom.resolution.set(W / 2, H / 2);
    }
    dirty = true;
  }

  const target = { x: 0, y: 0, s: 1, glow: 1 };
  const cur = { x: 0, y: 0, s: 0.5, glow: 0 };
  let docked = false, slotEl = null;
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
      // a phone is too narrow for the full boost: the wings would leave the screen
      const boost = Math.min(parseFloat(slotEl.getAttribute("data-core-scale")) || 1, W < 700 ? 1.05 : 9);
      target.s = boost * Math.max(0.2, ((Math.min(r.width * (W < 700 ? 1.02 : 1.25), r.height) / H) * VIS_H) / 2 / OUTER);
      target.s *= lerp(1, 0.58, smooth(pCur));
      target.glow = 1;
      docked = true;
    } else {
      target.x = 0;
      target.y = -VIS_H * 0.12;
      target.s = (Math.min(visW, VIS_H) * 0.5) / OUTER;
      target.glow = 0.22;
      docked = false;
    }
  }
  // p: how far the eagle has turned into the lion
  function morphTarget() {
    if (pinned != null) return pinned;
    // One rule on every page: eagle at the top, lion at the bottom, folding
    // across the whole scroll. It completes at 90% so the finished lion is
    // there before the footer, and a short page still reaches it.
    const max = document.documentElement.scrollHeight - H;
    return clamp01(scrollY / Math.max(1, max * 0.9));
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
    tiltT.x = (e.clientY / H - 0.5) * 0.3;
    tiltT.y = (e.clientX / W - 0.5) * 0.5;
  }, { passive: true });
  let kick = 0;
  addEventListener("rex:pulse", () => { kick = 1; });

  /* ---- bones: flapping from the shoulder, hand lagging ---- */
  const bones = new Array(6).fill(0).map(() => new THREE.Matrix4());
  const tmpA = new THREE.Matrix4(), tmpB = new THREE.Matrix4();
  const SHOULDER = 0.28, WRIST = 1.85;
  function hinge(out, pivotX, pivotY, angle, twist) {
    // rotate about the z axis through (pivotX, pivotY), with a slight twist about x
    out.makeTranslation(pivotX, pivotY, 0)
      .multiply(tmpA.makeRotationZ(angle))
      .multiply(tmpB.makeRotationX(twist))
      .multiply(new THREE.Matrix4().makeTranslation(-pivotX, -pivotY, 0));
    return out;
  }
  const eagleRoot = new THREE.Matrix4();
  const hexRoot = new THREE.Matrix4();

  function poseBones(t) {
    const w = t * 3.2; // wingbeat
    const beat = reduced ? 0.25 : Math.sin(w);
    const lag = reduced ? 0.1 : Math.sin(w - 0.7);
    const a1 = 0.1 + beat * 0.48, a2 = 0.05 + lag * 0.42, tw = beat * 0.08;
    bones[BONE.body].identity();
    hinge(bones[BONE.armR], SHOULDER, 0.1, a1, tw);
    bones[BONE.handR].copy(bones[BONE.armR]).multiply(hinge(new THREE.Matrix4(), WRIST, 0.15, a2, tw));
    hinge(bones[BONE.armL], -SHOULDER, 0.1, -a1, tw);
    bones[BONE.handL].copy(bones[BONE.armL]).multiply(hinge(new THREE.Matrix4(), -WRIST, 0.15, -a2, tw));
    bones[BONE.tail].makeRotationX(reduced ? 0 : Math.sin(w + 1) * 0.08);
    // the whole bird: bobs against the beat and looks slightly down at you
    eagleRoot.makeTranslation(0, reduced ? 0 : -beat * 0.12, 0)
      .multiply(tmpA.makeRotationX(0.62))
      .multiply(new THREE.Matrix4().makeRotationZ(reduced ? 0 : Math.sin(t * 0.55) * 0.08))
      .multiply(tmpB.makeRotationY(reduced ? 0 : Math.sin(t * 0.4) * 0.12));
    return beat;
  }

  /* ---- per-facet morph ---- */
  const vA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const vB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const cA = new THREE.Vector3(), cB = new THREE.Vector3(), cP = new THREE.Vector3(), mid = new THREE.Vector3(), off = new THREE.Vector3(), tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();
  function rotate(v, axis, ang) {
    // Rodrigues: cheap enough for ~600 facets a frame
    const c = Math.cos(ang), s = Math.sin(ang);
    tmpV.crossVectors(axis, v);
    const d = axis.dot(v) * (1 - c);
    return v.multiplyScalar(c).addScaledVector(tmpV, s).addScaledVector(axis, d);
  }

  function writeFacets(p, t) {
    hexRoot.makeRotationY(reduced ? 0 : Math.sin(t * 0.35) * 0.35).multiply(tmpA.makeRotationX(reduced ? 0 : Math.sin(t * 0.27) * 0.12));
    for (let i = 0; i < N; i++) {
      const f = F[i];
      const q = smooth(clamp01((p - f.delay) / 0.62));
      // eagle side (skipped entirely once this facet has left the bird)
      if (q < 1) {
        const bm = bones[f.bone];
        for (let k = 0; k < 3; k++) vA[k].copy(f.bind[k]).applyMatrix4(bm).applyMatrix4(eagleRoot);
      }
      // lion side
      if (q > 0) {
        for (let k = 0; k < 3; k++) vB[k].copy(f.hexV[k]);
        if (f.frag && !reduced) {
          const o = f.orbit, a = o.a + t * o.speed;
          const shift = new THREE.Vector3(Math.cos(a) * o.r, Math.sin(a) * o.r, o.z).sub(vB[0]);
          for (let k = 0; k < 3; k++) vB[k].add(shift);
        }
        for (let k = 0; k < 3; k++) vB[k].applyMatrix4(hexRoot);
      }
      let out;
      if (q <= 0) out = vA;
      else if (q >= 1) out = vB;
      else {
        cA.copy(vA[0]).add(vA[1]).add(vA[2]).divideScalar(3);
        cB.copy(vB[0]).add(vB[1]).add(vB[2]).divideScalar(3);
        mid.copy(cA).lerp(cB, 0.5).add(f.scatter);
        // quadratic path A → scatter → B: the facet breaks away, then lands
        cP.copy(cA).multiplyScalar((1 - q) * (1 - q)).addScaledVector(mid, 2 * (1 - q) * q).addScaledVector(cB, q * q);
        const ang = f.spin * Math.sin(q * Math.PI);
        for (let k = 0; k < 3; k++) {
          off.copy(vA[k]).sub(cA).lerp(tmpV.copy(vB[k]).sub(cB), q);
          rotate(off, f.axis, ang);
          vA[k].copy(cP).add(off);
        }
        out = vA;
      }
      for (let k = 0; k < 3; k++) pos.set([out[k].x, out[k].y, out[k].z], i * 9 + k * 3);
      tmpC.copy(f.cA).lerp(f.cB, q);
      for (let k = 0; k < 3; k++) col.set([tmpC.r, tmpC.g, tmpC.b], i * 9 + k * 3);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals(); // non-indexed: one normal per facet — the paper look
    geo.computeBoundingSphere();
  }

  /* ---- ticker: keep the hero's live tool readout alive ---- */
  const TOOLS = ["read", "grep", "edit", "shell", "browser_navigate", "git", "web_fetch", "memory_read", "codebase_search", "update_plan"];
  let nextTool = performance.now() + 1500;

  /* ---- loop ---- */
  let visible = !document.hidden;
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; last = performance.now(); });
  const clock0 = performance.now();
  let last = clock0, slowFrames = 0, pCur = morphTarget();

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
    const t = (now - clock0) / 1000;
    const k = 1 - Math.pow(0.001, dt);

    if (!reduced) {
      if (elapsed > budget * 1.7) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 40) {
        slowFrames = 0;
        if (composer) composer = null;
        else if (dprCap > 0.75) { dprCap -= 0.25; renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap)); }
      }
    }

    steer();
    for (const key in target) cur[key] += (target[key] - cur[key]) * (reduced ? 1 : k * 0.9);
    rig.position.set(cur.x, cur.y, 0);
    rig.scale.setScalar(cur.s);
    tilt.x += (tiltT.x - tilt.x) * k;
    tilt.y += (tiltT.y - tilt.y) * k;
    rig.rotation.set(tilt.x, tilt.y, 0);

    const pT = morphTarget();
    pCur += (pT - pCur) * (reduced ? 1 : Math.min(1, dt * 6));
    const p = pCur;

    poseBones(t);
    writeFacets(p, t);

    // eyes ride the head and go dark as the bird comes apart
    const eyeOn = 1 - smooth(clamp01((p - 0.03) / 0.2));
    eyes.forEach((g) => {
      g.position.copy(g.userData.local).applyMatrix4(eagleRoot);
      g.visible = eyeOn > 0.01;
      const flick = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 13 + g.position.x * 40);
      g.userData.halo.material.opacity = eyeOn * flick;
      g.userData.halo.scale.setScalar(0.32 + kick * 0.2);
    });
    eyeMat.opacity = eyeOn;
    const lionOn = smooth(clamp01((p - 0.82) / 0.16));
    lionEyes.forEach((g) => {
      g.position.copy(g.userData.local).applyMatrix4(hexRoot);
      g.visible = lionOn > 0.01;
      const flick = reduced ? 1 : 0.88 + 0.12 * Math.sin(t * 11 + g.position.x * 30);
      g.userData.halo.material.opacity = lionOn * flick;
      g.userData.halo.scale.setScalar(0.55 + kick * 0.25);
    });
    lionEyeMat.opacity = lionOn;

    // glow builds as the lion forms
    kick = Math.max(0, kick - dt * 1.3);
    glowU.value = (0.06 + smooth(p) * 0.1 + kick * 0.3) * (0.4 + cur.glow * 0.6);

    // sparks burst mid-transformation
    const burst = Math.sin(p * Math.PI);
    sparks.material.opacity = burst * 0.9 * (0.4 + cur.glow * 0.6);
    if (burst > 0.01) {
      const sc = 0.7 + burst * 1.3;
      for (let i = 0; i < SP * 3; i += 3) {
        spPos[i] = spBase[i] * sc + Math.sin(t * 2 + i) * 0.03;
        spPos[i + 1] = spBase[i + 1] * sc + (reduced ? 0 : ((t * 0.3 + i * 0.013) % 1) * 0.4);
        spPos[i + 2] = spBase[i + 2] * sc;
      }
      spGeo.attributes.position.needsUpdate = true;
    }

    // drifting shards in the depth of the scene
    const m = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    for (let i = 0; i < SH; i++) {
      const s = shardInfo[i];
      const a = s.a + (reduced ? 0 : t * s.spd);
      pv.set(Math.cos(a) * s.r, s.y + Math.sin(t * 0.3 + i) * 0.2, s.z + Math.sin(a) * 1.5);
      e.set(s.rot + t * 0.4, s.rot * 2 + t * 0.3, 0);
      q4.setFromEuler(e);
      sv.setScalar(s.s);
      shards.setMatrixAt(i, m.compose(pv, q4, sv));
    }
    shards.instanceMatrix.needsUpdate = true;
    grid.position.z = (t * 0.6) % 1;

    if (now > nextTool && !reduced) {
      dispatchEvent(new CustomEvent("rex:tool", { detail: { name: TOOLS[(Math.random() * TOOLS.length) | 0], phase: "call" } }));
      nextTool = now + 1800 + Math.random() * 1400;
    }

    if (composer) {
      bloom.strength = 0.3 + cur.glow * 0.25 + smooth(p) * 0.08;
      composer.render();
    } else renderer.render(scene, camera);
    if (!root.classList.contains("core-on")) root.classList.add("core-on");
    // behind copy the whole scene steps back, not just its glow: lit paper
    // stays bright under text otherwise
    if (root.classList.contains("core-dim") === docked) root.classList.toggle("core-dim", !docked);
  }

  resize();
  pickSection();
  requestAnimationFrame((n) => { last = n - 100; frame(n); });
}

// Started last, after every top-level const above is initialised.
const canvas = document.getElementById("core");
if (canvas) {
  try {
    boot(canvas);
  } catch (e) {
    console.warn("[core] disabled:", e && e.message);
  }
}
