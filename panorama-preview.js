import * as THREE from 'three';

const viewer = document.querySelector('#panorama');
const status = document.querySelector('.status');
const controls = document.querySelector('.controls');
const pitchControl = document.querySelector('#pitch');
const closer = document.querySelector('#closer');
const farther = document.querySelector('#farther');
const help = document.querySelector('#viewer-help');
status.textContent = 'Cargando la vista panorámica…';
let renderer;
const fallback = () => {
  renderer?.domElement.remove();
  renderer?.dispose();
  controls.hidden = true;
  help.hidden = true;
  viewer.removeAttribute('tabindex');
  viewer.dataset.state = 'unavailable';
  status.textContent = 'No se pudo abrir la vista interactiva. Podés ver la imagen completa y volver a la galería real.';
};

try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, .1, 110);
  const geometry = new THREE.SphereGeometry(100, 80, 48);
  geometry.scale(-1, 1, 1);
  const texture = await new THREE.TextureLoader().loadAsync(viewer.querySelector('img').getAttribute('src'));
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  scene.add(new THREE.Mesh(geometry, material));
  viewer.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  viewer.tabIndex = 0;
  viewer.dataset.state = 'ready';
  controls.hidden = false;
  help.hidden = false;
  status.textContent = '';
  let yaw = 90, pitch = 0, magnification = 1;
  // Cap the horizontal lens on wide screens, rather than stretching its edges.
  const baseFov = () => Math.min(65, THREE.MathUtils.radToDeg(2 * Math.atan(1 / camera.aspect)));
  const render = () => {
    if (viewer.dataset.state !== 'ready') return;
    pitch = Math.max(-45, Math.min(45, pitch));
    yaw = ((yaw % 360) + 360) % 360;
    const phi = THREE.MathUtils.degToRad(90 - pitch);
    const theta = THREE.MathUtils.degToRad(yaw);
    camera.lookAt(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov()) / 2) / magnification));
    camera.updateProjectionMatrix();
    pitchControl.value = String(pitch);
    closer.disabled = magnification >= 1.3;
    farther.disabled = magnification <= 1;
    viewer.dataset.yaw = yaw.toFixed(2);
    viewer.dataset.pitch = pitch.toFixed(2);
    viewer.dataset.fov = String(camera.fov);
    viewer.dataset.zoom = magnification.toFixed(1);
    viewer.dataset.horizontalFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect)).toFixed(2);
    renderer.render(scene, camera);
  };
  const resize = () => {
    if (viewer.dataset.state !== 'ready') return;
    camera.aspect = viewer.clientWidth / viewer.clientHeight;
    renderer.setSize(viewer.clientWidth, viewer.clientHeight, false);
    render();
  };
  new ResizeObserver(resize).observe(viewer);
  const reset = () => { yaw = 90; pitch = 0; magnification = 1; render(); };
  const zoom = amount => { magnification = Math.max(1, Math.min(1.3, Math.round((magnification + amount) * 10) / 10)); render(); };
  document.querySelector('#reset').addEventListener('click', reset);
  closer.addEventListener('click', () => zoom(.1));
  farther.addEventListener('click', () => zoom(-.1));
  pitchControl.addEventListener('input', () => { pitch = Number(pitchControl.value); render(); });
  let drag;
  viewer.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || viewer.dataset.state !== 'ready') return;
    viewer.focus({ preventScroll: true });
    viewer.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, touch: event.pointerType === 'touch' };
  });
  viewer.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    yaw = drag.yaw + (drag.x - event.clientX) * .18;
    if (!drag.touch) pitch = drag.pitch + (event.clientY - drag.y) * .15;
    render();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewer.addEventListener(name, () => { drag = null; });
  viewer.addEventListener('keydown', event => {
    const actions = {
      ArrowLeft: () => { yaw -= 10; }, ArrowRight: () => { yaw += 10; },
      ArrowUp: () => { pitch += 10; }, ArrowDown: () => { pitch -= 10; },
      '+': () => zoom(.1), '=': () => zoom(.1), '-': () => zoom(-.1), Home: reset
    };
    if (!actions[event.key]) return;
    event.preventDefault(); actions[event.key](); render();
  });
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(); });
  resize();
} catch {
  fallback();
}
