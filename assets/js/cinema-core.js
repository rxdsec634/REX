/* A local, procedural sculpture. No remote models or device permissions. */
import * as THREE from 'three';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const compact = matchMedia('(pointer: coarse)').matches || innerWidth < 700;

for (const stage of document.querySelectorAll('[data-core-visual]')) {
  const canvas = stage.querySelector('canvas');
  const button = stage.querySelector('[data-rotate-core]');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !compact, powerPreference: 'low-power' });
  } catch {
    stage.dataset.coreState = 'fallback';
    if (button) {
      button.setAttribute('aria-label', 'Rotate the REX illustration');
      button.addEventListener('click', () => {
        stage.classList.toggle('is-turned');
        stage.dataset.coreTurns = String(Number(stage.dataset.coreTurns || 0) + 1);
      });
    }
    continue;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1.25 : 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 60);
  camera.position.set(0, .5, 12.8);
  camera.lookAt(0, -.05, 0);

  // White softboxes and a red strip form reflections in the bevelled metal.
  const environmentScene = new THREE.Scene();
  environmentScene.background = new THREE.Color('#151518');
  const softboxes = [];
  for (const [color, x, y, z, sx, sy] of [
    [0xffffff, -4, 4, 3, 4, 6], [0xffffff, 4, 1, 2, 2, 7],
    [0xff2414, -3, -1, -3, 5, 5], [0xff9b84, 1, 6, -1, 7, 2]
  ]) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    box.position.set(x, y, z); box.lookAt(0, 0, 0);
    environmentScene.add(box); softboxes.push(box);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environmentScene, .12);
  scene.environment = env.texture;
  pmrem.dispose();
  softboxes.forEach(box => { box.geometry.dispose(); box.material.dispose(); });

  const shape = new THREE.Shape();
  shape.moveTo(-1.55, -2.25); shape.lineTo(-1.55, 2.25); shape.lineTo(.35, 2.25);
  shape.quadraticCurveTo(1.85, 2.25, 1.85, .95);
  shape.quadraticCurveTo(1.85, .05, .85, -.3);
  shape.lineTo(2.05, -2.25); shape.lineTo(.72, -2.25);
  shape.lineTo(-.37, -.45); shape.lineTo(-.45, -.45); shape.lineTo(-.45, -2.25); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-.45, 1.3); hole.lineTo(-.45, .5); hole.lineTo(.3, .5);
  hole.quadraticCurveTo(.72, .5, .72, .9); hole.quadraticCurveTo(.72, 1.3, .3, 1.3); hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .65, bevelEnabled: true, bevelThickness: .14, bevelSize: .1, bevelSegments: 4, curveSegments: 18, steps: 1 });
  geometry.center();
  const material = new THREE.MeshPhysicalMaterial({ color: 0xe62a16, metalness: .86, roughness: .23, clearcoat: 1, clearcoatRoughness: .16, envMapIntensity: 1.5 });
  const sculpture = new THREE.Group();
  sculpture.add(new THREE.Mesh(geometry, material));
  sculpture.rotation.set(.03, -.42, -.12);
  sculpture.position.set(.2, .24, 0);
  scene.add(sculpture);

  scene.add(new THREE.HemisphereLight(0xffd7c9, 0x201415, 2));
  const key = new THREE.DirectionalLight(0xffe8e1, 5);
  key.position.set(-3, 5, 6); scene.add(key);
  const rim = new THREE.PointLight(0xff2916, 35, 18, 2);
  rim.position.set(3, -1, 3); scene.add(rim);
  const white = new THREE.DirectionalLight(0xffffff, 2);
  white.position.set(4, 2, -3); scene.add(white);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 3.15, .16, 80), new THREE.MeshStandardMaterial({ color: 0x121113, metalness: .6, roughness: .4 }));
  base.position.set(.15, -2.9, 0); scene.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, .012, 5, 120), new THREE.MeshBasicMaterial({ color: 0xec311f, transparent: true, opacity: .75 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(.15, -2.8, 0); scene.add(ring);
  const halo = new THREE.Mesh(new THREE.RingGeometry(2.88, 2.9, 120), new THREE.MeshBasicMaterial({ color: 0x853024, transparent: true, opacity: .35, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(.15, -2.79, 0); scene.add(halo);
  const fragments = new THREE.Group();
  const fragmentGeometry = new THREE.BoxGeometry(.13, .32, .12);
  for (let i = 0; i < 8; i++) {
    const fragment = new THREE.Mesh(fragmentGeometry, material);
    const angle = i * 2.4;
    fragment.position.set(Math.sin(angle) * (2.4 + (i % 2) * .4), Math.cos(angle) * 1.7, -.8 - (i % 3));
    fragment.rotation.set(i * .7, i, i * .4); fragments.add(fragment);
  }
  scene.add(fragments);

  let alive = true, visible = true, frame = 0, last = 0, spin = 0, targetSpin = 0;
  let hoverX = 0, hoverY = 0;
  const still = () => reduce.matches || stage.hasAttribute('data-core-static');
  function draw(time = 0) {
    if (!alive) return;
    const animated = !still();
    if (animated) {
      spin += (targetSpin - spin) * .055;
      sculpture.rotation.y = -.42 + spin + hoverX;
      sculpture.rotation.x = .03 + hoverY;
      sculpture.position.y = .24 + Math.sin(time * .00065) * .1;
      fragments.rotation.y = Math.sin(time * .00012) * .12;
    } else sculpture.rotation.y = -.42 + targetSpin;
    renderer.render(scene, camera);
    stage.classList.add('is-ready');
    stage.dataset.coreState = animated ? 'interactive' : 'static';
  }
  function tick(time) {
    frame = 0;
    if (!alive || !visible || document.hidden || still()) return;
    if (time - last >= (compact ? 32 : 16)) { draw(time); last = time; }
    frame = requestAnimationFrame(tick);
  }
  function wake() {
    if (!alive) return;
    if (still()) { cancelAnimationFrame(frame); frame = 0; draw(); }
    else if (visible && !document.hidden && !frame) frame = requestAnimationFrame(tick);
  }
  const resize = new ResizeObserver(() => {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height || !alive) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    draw(); wake();
  });
  resize.observe(stage);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) { cancelAnimationFrame(frame); frame = 0; }
    else wake();
  }, { rootMargin: '80px' });
  observer.observe(stage);
  const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else wake(); };
  document.addEventListener('visibilitychange', onVisibility);
  reduce.addEventListener('change', wake);
  if (button) button.addEventListener('click', () => {
    if (!alive) { stage.classList.toggle('is-turned'); return; }
    targetSpin += Math.PI * 2;
    stage.dataset.coreTurns = String(Number(stage.dataset.coreTurns || 0) + 1);
    // Reduced motion rotates to a distinct pose without an animated spin.
    if (still()) { targetSpin += Math.PI / 4; draw(); } else wake();
  });
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    stage.addEventListener('pointermove', event => {
      const rect = stage.getBoundingClientRect();
      hoverX = ((event.clientX - rect.left) / rect.width - .5) * .3;
      hoverY = ((event.clientY - rect.top) / rect.height - .5) * .13;
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { hoverX = hoverY = 0; });
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); alive = false; cancelAnimationFrame(frame);
    stage.classList.remove('is-ready'); stage.dataset.coreState = 'fallback';
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) { cancelAnimationFrame(frame); frame = 0; return; }
    alive = false; cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility); reduce.removeEventListener('change', wake);
    const geometries = new Set(), materials = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); env.dispose(); renderer.dispose();
  });
  window.addEventListener('pageshow', wake);
}
