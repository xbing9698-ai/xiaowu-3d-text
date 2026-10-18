import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import fontData from './font-data.json';

/* --------------------------------------------------------------------------
   「小吴是笨蛋」— a procedural 3D type sculpture for mobile browsers.

   The five glyph outlines are embedded as a tiny typeface JSON, so the page
   never downloads or rasterises a full CJK font. Every character is extruded
   into a beveled 3D mesh at runtime.
   -------------------------------------------------------------------------- */

const TEXT_LINE_ONE = '小吴';
const TEXT_LINE_TWO = '是笨蛋';
const ALL_CHARS = (TEXT_LINE_ONE + TEXT_LINE_TWO).split('');
const EXPECTED = '小吴是笨蛋';

const query = new URLSearchParams(window.location.search);
const DEBUG = query.has('debug');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && window.innerWidth < 900);

const dom = {
  canvas: document.getElementById('scene'),
  loading: document.getElementById('loading'),
  fatal: document.getElementById('fatal'),
  fatalDetail: document.getElementById('fatalDetail'),
  hint: document.getElementById('hint'),
  toast: document.getElementById('toast'),
  pauseBtn: document.getElementById('pauseBtn'),
  pauseLabel: document.getElementById('pauseLabel'),
  resetBtn: document.getElementById('resetBtn'),
  fxBtn: document.getElementById('fxBtn'),
  dock: document.getElementById('dock')
};

let fatalShown = false;
function showFatal(error) {
  if (fatalShown) return;
  fatalShown = true;
  console.error(error);
  dom.fatalDetail.textContent = error && error.message ? error.message : String(error || 'Unknown error');
  dom.fatal.classList.add('show');
  dom.loading.classList.add('is-done');
}

window.addEventListener('error', (event) => {
  if (event.error) showFatal(event.error);
});

function boot() {
  try {
    const art = createArtwork();
    window.__art = art.debugApi;
    if (DEBUG) window.__art.requested = true;
  } catch (error) {
    showFatal(error);
  }
}

// Let the loading screen paint before the geometry build blocks the main thread.
requestAnimationFrame(() => setTimeout(boot, 40));

function createArtwork() {
  if (!dom.canvas) throw new Error('Missing #scene canvas.');

  /* ----------------------------------------------------------
     Renderer, camera and post-processing
     ---------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas: dom.canvas,
    antialias: !IS_MOBILE,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance'
  });
  if (!renderer.getContext()) throw new Error('WebGL is not available.');

  const pixelRatio = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.55 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x02030a, 1);
  if (DEBUG) renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    44,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.1,
    120
  );
  camera.position.set(0, 0.15, 12);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(window.innerWidth, window.innerHeight);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    IS_MOBILE ? 0.5 : 0.5,
    0.46,
    1.02
  );
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  /* ----------------------------------------------------------
     Procedural studio environment for chrome / gold reflections
     ---------------------------------------------------------- */
  const envMap = buildEnvironment(renderer);
  scene.environment = envMap;

  /* ----------------------------------------------------------
     Background, portal, beams, rings and grid
     ---------------------------------------------------------- */
  const sky = buildSky(scene);
  const stars = buildStars(scene);
  const portal = buildPortal(scene);
  const halo = buildDarkHalo(scene);
  const beams = buildBeams(scene);
  const rings = buildRings(scene);  const floor = buildFloor(scene);
  const motes = buildMotes(scene);

  /* ----------------------------------------------------------
     Type: five separate extruded Chinese glyphs
     ---------------------------------------------------------- */
  const font = new FontLoader().parse(fontData);
  if (ALL_CHARS.join('') !== EXPECTED) {
    throw new Error('The text content is incomplete.');
  }
  for (const char of ALL_CHARS) {
    if (!fontData.glyphs[char]) throw new Error(`Missing glyph: ${char}`);
  }

  const textPivot = new THREE.Group();
  textPivot.rotation.order = 'YXZ';
  scene.add(textPivot);

  const metalNormal = makeMetalNormalTexture();

  const chromeFront = new THREE.MeshPhysicalMaterial({
    color: 0xc7dfeb,
    metalness: 1,
    roughness: 0.135,
    envMapIntensity: 2.5,
    clearcoat: 1,
    clearcoatRoughness: 0.045,
    iridescence: 0.24,
    iridescenceIOR: 1.9,
    iridescenceThicknessRange: [110, 380],
    emissive: 0x00141d,
    emissiveIntensity: 0.28,
    normalMap: metalNormal,
    normalScale: new THREE.Vector2(0.065, 0.065)
  });
  const chromeSide = new THREE.MeshStandardMaterial({
    color: 0x4f7c98,
    metalness: 0.94,
    roughness: 0.3,
    envMapIntensity: 1.8,
    emissive: 0x001018,
    emissiveIntensity: 0.25
  });
  const goldFront = new THREE.MeshPhysicalMaterial({
    color: 0xffc451,
    metalness: 0.82,
    roughness: 0.23,
    envMapIntensity: 2.45,
    clearcoat: 0.9,
    clearcoatRoughness: 0.07,
    emissive: 0x4a2300,
    emissiveIntensity: 0.72,
    normalMap: metalNormal,
    normalScale: new THREE.Vector2(0.04, 0.04)
  });
  const goldSide = new THREE.MeshStandardMaterial({
    color: 0xa76720,
    metalness: 0.72,
    roughness: 0.34,
    envMapIntensity: 1.5,
    emissive: 0x2a1000,
    emissiveIntensity: 0.35
  });

  const auraChrome = new THREE.MeshBasicMaterial({
    color: 0x38e6ff,
    transparent: true,
    opacity: 0.11,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide
  });
  const auraGold = new THREE.MeshBasicMaterial({
    color: 0xff35c9,
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide
  });

  const charGroups = [];

  function createCharacter(char, size, depth, frontMat, sideMat, auraMat, phase) {
    const geometry = new TextGeometry(char, {
      font,
      size,
      height: depth,
      curveSegments: IS_MOBILE ? 6 : 8,
      bevelEnabled: true,
      bevelThickness: size * 0.045,
      bevelSize: size * 0.024,
      bevelSegments: 3,
      bevelOffset: 0
    });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    geometry.translate(
      -(box.max.x + box.min.x) / 2,
      -(box.max.y + box.min.y) / 2,
      -(box.max.z + box.min.z) / 2
    );

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, [frontMat, sideMat]);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);

    // A slightly scaled, back-face neon shell gives the bevel a fine halo.
    const aura = new THREE.Mesh(geometry, auraMat);
    aura.scale.setScalar(1.018);
    aura.position.z = -0.055;
    aura.renderOrder = -1;
    group.add(aura);

    group.userData.phase = phase;
    group.userData.base = new THREE.Vector3();
    group.userData.character = char;
    charGroups.push(group);
    return group;
  }

  function buildLine(text, config) {
    const line = new THREE.Group();
    const chars = text.split('');
    const advance = (fontData.glyphs[chars[0]].ha / fontData.resolution) * config.size;
    const spacing = advance + config.tracking;
    chars.forEach((char, index) => {
      const phase = index * 1.73 + config.phase;
      const group = createCharacter(
        char,
        config.size,
        config.depth,
        config.front,
        config.side,
        config.aura,
        phase
      );
      group.position.x = (index - (chars.length - 1) / 2) * spacing;
      group.position.z = config.z + (index % 2 === 0 ? 0.012 : -0.012);
      group.rotation.y = (index - (chars.length - 1) / 2) * 0.035;
      group.rotation.x = (index % 2 === 0 ? 1 : -1) * 0.008;
      group.userData.base.copy(group.position);
      line.add(group);
    });
    line.position.y = config.y;
    textPivot.add(line);
    return line;
  }

  const lineOne = buildLine(TEXT_LINE_ONE, {
    size: 1.42,
    depth: 0.46,
    tracking: 0.058,
    y: 0.96,
    z: 0.18,
    front: chromeFront,
    side: chromeSide,
    aura: auraChrome,
    phase: 0
  });
  const lineTwo = buildLine(TEXT_LINE_TWO, {
    size: 1.56,
    depth: 0.5,
    tracking: 0.06,
    y: -0.73,
    z: -0.05,
    front: goldFront,
    side: goldSide,
    aura: auraGold,
    phase: 2.7
  });

  // Center the multi-line block around its visual bounds, not its baseline.
  const textBounds = new THREE.Box3().setFromObject(textPivot);
  const textCenter = textBounds.getCenter(new THREE.Vector3());
  lineOne.position.x -= textCenter.x;
  lineOne.position.y -= textCenter.y;
  lineTwo.position.x -= textCenter.x;
  lineTwo.position.y -= textCenter.y;
  for (const group of charGroups) {
    group.userData.base.copy(group.position);
  }
  const centeredBounds = new THREE.Box3().setFromObject(textPivot);
  const blockSize = centeredBounds.getSize(new THREE.Vector3());

  /* ----------------------------------------------------------
     Lights: direct specular accents for the metal
     ---------------------------------------------------------- */
  const hemi = new THREE.HemisphereLight(0x1d3152, 0x050609, 0.32);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xd7f2ff, 0.95);
  keyLight.position.set(2, 5, 8);
  scene.add(keyLight);

  const frontLight = new THREE.PointLight(0xffffff, 22, 22, 2);
  frontLight.position.set(0, 1.4, 7.2);
  scene.add(frontLight);

  const cyanLight = new THREE.PointLight(0x33e6ff, 65, 18, 2);
  cyanLight.position.set(-4.5, 2.2, 4.2);
  scene.add(cyanLight);

  const magentaLight = new THREE.PointLight(0xff2fd0, 55, 18, 2);
  magentaLight.position.set(4.2, -1.4, 3.6);
  scene.add(magentaLight);

  const goldLight = new THREE.PointLight(0xffb258, 46, 15, 2);
  goldLight.position.set(-1.2, -4.2, 4.4);
  scene.add(goldLight);

  const warmFront = new THREE.PointLight(0xffc06a, 78, 13, 2);
  warmFront.position.set(2.4, -0.4, 5.4);
  scene.add(warmFront);

  /* ----------------------------------------------------------
     Interaction state
     ---------------------------------------------------------- */
  const state = {
    paused: false,
    fxIndex: 0,
    yaw: -0.22,
    pitch: 0.055,
    yawTarget: -0.22,
    pitchTarget: 0.055,
    zoom: 1,
    zoomTarget: 1,
    baseDistance: 12,
    distance: 13.8,
    autoMotion: !REDUCED,
    dragging: false,
    pointers: 0,
    lastInteraction: performance.now(),
    intro: 0,
    lookY: 0.02,
    shortViewport: false
  };

  let simTime = 0;
  let dirty = true;
  let firstFrame = true;
  let hintHidden = false;

  const fitInfo = {
    width: blockSize.x,
    height: blockSize.y,
    depth: blockSize.z
  };

  /* ----------------------------------------------------------
     Responsive framing
     ---------------------------------------------------------- */
  function calculateBaseDistance() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const short = window.innerHeight < 540;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    // Extra room for the 3D rotation, bloom, circular stage and the bottom dock.
    const frameWidth = fitInfo.width + (aspect < 0.8 ? 0.72 : 1.15);
    const frameHeight = fitInfo.height + (short ? 1.55 : (aspect < 0.8 ? 0.62 : 0.8));
    const distanceForWidth = (frameWidth * 0.5) / Math.tan(hFov * 0.5);
    const distanceForHeight = (frameHeight * 0.5) / Math.tan(vFov * 0.5);
    return Math.max(distanceForWidth, distanceForHeight, short ? 6.35 : (aspect < 0.8 ? 7.5 : 7.0));
  }

  function updateFraming() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    state.shortViewport = window.innerHeight < 540;
    state.lookY = state.shortViewport ? -0.32 : 0.02;
    camera.aspect = aspect;
    camera.fov = aspect < 0.72 ? 46 : 44;
    camera.updateProjectionMatrix();
    state.baseDistance = calculateBaseDistance();
    state.distance = clamp(state.baseDistance / state.zoom, 4.0, 26);
    dirty = true;
  }

  /* ----------------------------------------------------------
     Scene animation helpers
     ---------------------------------------------------------- */
  const clock = new THREE.Clock();
  const tempColor = new THREE.Color();

  const FX_MODES = [
    {
      id: 'neon',
      label: '霓虹',
      accent: '#43e7ff',
      accent2: '#ff3dcc',
      bloom: IS_MOBILE ? 0.5 : 0.5,
      particles: 1,
      beams: 0.62,
      rings: 0.68,
      grid: 0.82,
      skyA: '#1a5c8c',
      skyB: '#681e6d',
      key: '#d7f2ff',
      cyan: '#33e6ff',
      magenta: '#ff2fd0',
      gold: '#ffb258'
    },
    {
      id: 'aurora',
      label: '极光',
      accent: '#63ffd0',
      accent2: '#9b7bff',
      bloom: IS_MOBILE ? 0.46 : 0.46,
      particles: 0.8,
      beams: 0.54,
      rings: 0.58,
      grid: 0.72,
      skyA: '#1b7b6f',
      skyB: '#4c2d86',
      key: '#c9ffe9',
      cyan: '#64ffd0',
      magenta: '#9b7bff',
      gold: '#ffd085'
    },
    {
      id: 'eco',
      label: '省电',
      accent: '#9eb8c9',
      accent2: '#5b7891',
      bloom: 0.28,
      particles: 0.34,
      beams: 0.3,
      rings: 0.34,
      grid: 0.4,
      skyA: '#1b3447',
      skyB: '#33294d',
      key: '#b8d4e3',
      cyan: '#74b8cc',
      magenta: '#7f6ba8',
      gold: '#c3a16b'
    }
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function damp(current, target, lambda, dt) {
    return current + (target - current) * (1 - Math.exp(-lambda * dt));
  }

  function applyFX(index, announce = true) {
    const fx = FX_MODES[index];
    state.fxIndex = index;
    document.documentElement.style.setProperty('--accent', fx.accent);
    document.documentElement.style.setProperty('--accent-2', fx.accent2);
    document.documentElement.style.setProperty('--gold', fx.gold);

    bloomPass.strength = fx.bloom;
    bloomPass.enabled = fx.id !== 'eco';
    beams.setIntensity(fx.beams, fx);
    rings.setColors(fx);
    floor.setColors(fx);
    motes.setColors(fx);
    portal.setColors(fx);
    sky.setColors(fx);
    cyanLight.color.set(fx.cyan);
    magentaLight.color.set(fx.magenta);
    goldLight.color.set(fx.gold);
    warmFront.color.set(fx.gold);
    keyLight.color.set(fx.key);

    motes.setDrawRange(fx.particles);
    if (announce) showToast(`特效 · ${fx.label}`);
    dirty = true;
  }

  let toastTimer = 0;
  function showToast(message) {
    hideHint();
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 1300);
  }

  function hideHint() {
    if (hintHidden) return;
    hintHidden = true;
    dom.hint.classList.add('is-hidden');
  }

  function setPaused(paused) {
    state.paused = paused;
    dom.pauseBtn.classList.toggle('is-active', paused);
    dom.pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    dom.pauseBtn.setAttribute('aria-label', paused ? '继续动画' : '暂停动画');
    dom.pauseLabel.textContent = paused ? '继续' : '暂停';
    dom.pauseBtn.querySelector('svg').innerHTML = paused
      ? '<path d="M8 5.2 18.3 12 8 18.8Z" fill="currentColor" stroke="none"/>'
      : '<path d="M9 5.5v13M15 5.5v13"/>';
    clock.getDelta();
    dirty = true;
  }

  function resetView() {
    state.yawTarget = 0;
    state.pitchTarget = 0;
    state.zoomTarget = 1;
    state.lastInteraction = performance.now();
    hideHint();
    dirty = true;
  }

  dom.pauseBtn.addEventListener('click', () => setPaused(!state.paused));
  dom.resetBtn.addEventListener('click', resetView);
  dom.fxBtn.addEventListener('click', () => {
    applyFX((state.fxIndex + 1) % FX_MODES.length);
    hideHint();
  });

  /* ----------------------------------------------------------
     Touch / pointer controls
     ---------------------------------------------------------- */
  const pointerMap = new Map();
  let dragPointer = null;
  let lastPointer = { x: 0, y: 0 };
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;

  function pointerDistance() {
    const values = [...pointerMap.values()];
    if (values.length < 2) return 0;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  function beginPinch() {
    pinchStartDistance = pointerDistance();
    pinchStartZoom = state.zoomTarget;
    state.dragging = false;
    dom.canvas.classList.remove('dragging');
  }

  dom.canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dom.canvas.setPointerCapture(event.pointerId);
    pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.pointers = pointerMap.size;
    state.lastInteraction = performance.now();
    hideHint();

    if (pointerMap.size === 1) {
      dragPointer = event.pointerId;
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
      state.dragging = true;
      dom.canvas.classList.add('dragging');
    } else if (pointerMap.size === 2) {
      beginPinch();
    }
  });

  dom.canvas.addEventListener('pointermove', (event) => {
    const pointer = pointerMap.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    state.lastInteraction = performance.now();

    if (pointerMap.size >= 2) {
      const distance = pointerDistance();
      if (pinchStartDistance > 0 && distance > 0) {
        const nextZoom = clamp(pinchStartZoom * (distance / pinchStartDistance), 0.78, 1.9);
        state.zoomTarget = nextZoom;
      }
      dirty = true;
      return;
    }

    if (!state.dragging || dragPointer !== event.pointerId) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;

    state.yawTarget = clamp(state.yawTarget + dx * 0.0082, -1.05, 1.05);
    state.pitchTarget = clamp(state.pitchTarget + dy * 0.0052, -0.42, 0.42);
    dirty = true;
  });

  function endPointer(event) {
    if (!pointerMap.has(event.pointerId)) return;
    pointerMap.delete(event.pointerId);
    state.pointers = pointerMap.size;

    if (pointerMap.size === 0) {
      state.dragging = false;
      dragPointer = null;
      dom.canvas.classList.remove('dragging');
      pinchStartDistance = 0;
    } else if (pointerMap.size === 1) {
      const remaining = [...pointerMap.entries()][0];
      dragPointer = remaining[0];
      lastPointer.x = remaining[1].x;
      lastPointer.y = remaining[1].y;
      state.dragging = true;
      pinchStartDistance = 0;
    }
    dirty = true;
  }

  dom.canvas.addEventListener('pointerup', endPointer);
  dom.canvas.addEventListener('pointercancel', endPointer);
  dom.canvas.addEventListener('lostpointercapture', endPointer);

  dom.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    state.zoomTarget = clamp(state.zoomTarget * Math.exp(-event.deltaY * 0.0011), 0.78, 1.9);
    state.lastInteraction = performance.now();
    hideHint();
    dirty = true;
  }, { passive: false });

  dom.canvas.addEventListener('dblclick', resetView);
  dom.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  /* ----------------------------------------------------------
     Resize
     ---------------------------------------------------------- */
  let resizeTimer = 0;
  function handleResize() {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.55 : 2));
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    bloomPass.setSize(width, height);
    updateFraming();
    dirty = true;
  }
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 45);
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 180);
  }, { passive: true });

  /* ----------------------------------------------------------
     Main loop
     ---------------------------------------------------------- */
  function updateCamera(dt) {
    let changed = false;
    const prevYaw = state.yaw;
    const prevPitch = state.pitch;
    const prevZoom = state.zoom;

    state.yaw = damp(state.yaw, state.yawTarget, 9, dt);
    state.pitch = damp(state.pitch, state.pitchTarget, 9, dt);
    state.zoom = damp(state.zoom, state.zoomTarget, 7, dt);

    if (Math.abs(prevYaw - state.yaw) > 0.00001 ||
        Math.abs(prevPitch - state.pitch) > 0.00001 ||
        Math.abs(prevZoom - state.zoom) > 0.00001) changed = true;

    const motion = state.autoMotion ? 1 : 0;
    const autoYaw = Math.sin(simTime * 0.26) * 0.10 * motion;
    const autoPitch = Math.sin(simTime * 0.21 + 1.4) * 0.018 * motion;
    textPivot.rotation.y = state.yaw + autoYaw;
    textPivot.rotation.x = state.pitch + autoPitch;
    textPivot.rotation.z = Math.sin(simTime * 0.18 + 0.6) * 0.012 * motion;
    textPivot.position.y = Math.sin(simTime * 0.66) * 0.045 * motion;

    const targetDistance = clamp(state.baseDistance / state.zoom, 4.0, 26);
    if (state.distance !== targetDistance) {
      state.distance = damp(state.distance, targetDistance, 5.5, dt);
      changed = true;
    }
    camera.position.z = state.distance;
    camera.position.x = Math.sin(simTime * 0.1) * 0.08 * motion;
    camera.position.y = 0.15 + Math.sin(simTime * 0.23 + 0.6) * 0.035 * motion;
    camera.lookAt(0, state.lookY, 0);
    return changed;
  }

  function updateCharacters(time) {
    const motion = state.autoMotion ? 1 : 0;
    for (let i = 0; i < charGroups.length; i++) {
      const group = charGroups[i];
      const phase = group.userData.phase;
      const base = group.userData.base;
      group.position.x = base.x + Math.sin(time * 0.48 + phase) * 0.012 * motion;
      group.position.y = base.y + Math.cos(time * 0.55 + phase * 1.37) * 0.018 * motion;
      group.position.z = base.z + Math.sin(time * 0.61 + phase * 0.8) * 0.012 * motion;
    }
  }

  function updateEnvironment(time) {
    portal.update(time);
    beams.update(time);
    rings.update(time);
    floor.update(time);
    motes.update(time);
    sky.update(time);
    stars.rotation.y = time * 0.006;
    stars.material.opacity = 0.64 + Math.sin(time * 0.7) * 0.08;

    const t = time;
    cyanLight.position.set(-4.5 + Math.sin(t * 0.32) * 0.9, 2.2 + Math.cos(t * 0.28) * 0.5, 4.2);
    magentaLight.position.set(4.2 + Math.cos(t * 0.27) * 0.8, -1.4 + Math.sin(t * 0.33) * 0.7, 3.6);
    goldLight.position.set(-1.2 + Math.sin(t * 0.22) * 0.8, -4.2 + Math.cos(t * 0.24) * 0.4, 4.4);
  }

  function render() {
    if (DEBUG) renderer.info.reset();
    composer.render();
    if (firstFrame) {
      firstFrame = false;
      setTimeout(() => dom.loading.classList.add('is-done'), 420);
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    const rawDelta = clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);
    let changed = dirty;
    dirty = false;

    if (!state.paused) {
      simTime += dt;
      updateCharacters(simTime);
      updateEnvironment(simTime);
      changed = true;
    }

    if (updateCamera(dt)) changed = true;

    if (state.intro < 1.2) {
      state.intro += dt;
      changed = true;
    }

    if (changed) {
      render();
      if (DEBUG && window.__art) {
        window.__art.lastFrameAt = performance.now();
      }
    }
  }

  // Keep the clock honest after the initial heavy scene construction.
  clock.getDelta();
  updateFraming();
  state.distance = state.baseDistance * 1.17;
  updateCamera(0.016);
  render();
  loop();

  // Hide the instruction after a while, even if the visitor just watches.
  setTimeout(() => {
    if (performance.now() - state.lastInteraction > 7000) hideHint();
  }, 7600);

  // Context-loss is rare, but a clear recovery message is better than a frozen frame.
  dom.canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFatal(new Error('WebGL context lost. Please reload the page.'));
  });

  /* ----------------------------------------------------------
     Small debug API used by automated interaction tests
     ---------------------------------------------------------- */
  let textVertices = 0;
  for (const group of charGroups) {
    group.traverse((object) => {
      if (object.isMesh && object.geometry && object.geometry.attributes.position) {
        textVertices += object.geometry.attributes.position.count;
      }
    });
  }
  const debugApi = {
    ready: true,
    chars: ALL_CHARS.slice(),
    text: ALL_CHARS.join(''),
    charMeshes: charGroups.length,
    textVertices,
    blockSize: { x: blockSize.x, y: blockSize.y, z: blockSize.z },
    mobile: IS_MOBILE,
    pixelRatio: renderer.getPixelRatio(),
    state,
    camera,
    get distance() { return camera.position.z; },
    get rendererInfo() { return renderer.info.render; },
    get frame() { return simTime; },
    get fx() { return FX_MODES[state.fxIndex].id; },
    get paused() { return state.paused; },
    setYaw(value) { state.yawTarget = clamp(value, -1.05, 1.05); dirty = true; },
    setPitch(value) { state.pitchTarget = clamp(value, -0.42, 0.42); dirty = true; },
    setZoom(value) { state.zoomTarget = clamp(value, 0.78, 1.9); dirty = true; }
  };

  applyFX(0, false);

  return { debugApi };
}

/* ==========================================================================
   Procedural environment / scene pieces
   ========================================================================== */

function makeMetalNormalTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  const hash = (x, y) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const brushed =
        Math.sin(y * 1.7 + Math.sin(x * 0.045) * 1.7) * 0.42 +
        Math.sin(y * 5.3 + x * 0.08) * 0.18;
      const grain = hash(x, y) * 0.22 + hash(Math.floor(x / 3), Math.floor(y / 3)) * 0.18;
      heights[y * size + x] = brushed + grain;
    }
  }

  const strength = 1.8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = heights[y * size + Math.max(0, x - 1)];
      const right = heights[y * size + Math.min(size - 1, x + 1)];
      const up = heights[Math.max(0, y - 1) * size + x];
      const down = heights[Math.min(size - 1, y + 1) * size + x];
      let nx = (left - right) * strength;
      let ny = (up - down) * strength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      const index = (y * size + x) * 4;
      image.data[index] = Math.round((nx * 0.5 + 0.5) * 255);
      image.data[index + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      image.data[index + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.anisotropy = 4;
  return texture;
}

function buildEnvironment(renderer) {  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#010207');
  base.addColorStop(0.42, '#040a18');
  base.addColorStop(0.57, '#071327');
  base.addColorStop(0.74, '#02040b');
  base.addColorStop(1, '#000102');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);

  function softRect(x, y, w, h, color, blur = 30) {
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function blob(x, y, radius, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(0.28, color.replace(/[\d.]+\)$/, '0.42)'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Long vertical strip lights read as crisp chrome reflections.
  softRect(92, 72, 40, 342, 'rgba(54, 226, 255, .95)', 12);
  softRect(146, 130, 8, 230, 'rgba(225, 253, 255, .95)', 4);
  softRect(710, 56, 45, 378, 'rgba(255, 46, 204, .92)', 14);
  softRect(776, 170, 8, 194, 'rgba(255, 230, 250, .9)', 4);
  softRect(472, 0, 24, 210, 'rgba(240, 251, 255, .95)', 10);
  softRect(410, 374, 205, 36, 'rgba(255, 177, 73, .9)', 10);
  softRect(488, 56, 5, 158, 'rgba(255, 255, 255, .95)', 3);

  // These hit the front faces of the glyphs and make the chrome readable.
  softRect(742, 96, 5, 318, 'rgba(255, 255, 255, .76)', 2);
  softRect(758, 128, 20, 260, 'rgba(176, 242, 255, .68)', 6);
  softRect(690, 118, 18, 292, 'rgba(255, 185, 74, .78)', 8);
  softRect(802, 76, 6, 338, 'rgba(255, 211, 137, .8)', 3);
  softRect(824, 150, 18, 230, 'rgba(255, 255, 255, .56)', 6);
  softRect(670, 205, 4, 165, 'rgba(84, 242, 255, .72)', 3);
  softRect(900, 300, 3, 120, 'rgba(255, 255, 255, .66)', 2);
  softRect(368, 116, 5, 250, 'rgba(255, 235, 195, .68)', 3);
  softRect(560, 330, 120, 20, 'rgba(255, 186, 84, .46)', 8);

  blob(142, 216, 120, 'rgba(31, 200, 255, 0.34)');
  blob(740, 190, 135, 'rgba(255, 48, 196, 0.28)');
  blob(510, 400, 150, 'rgba(255, 166, 67, 0.2)');
  blob(512, 90, 110, 'rgba(175, 221, 255, 0.24)');
  blob(914, 320, 90, 'rgba(96, 79, 255, 0.2)');
  blob(770, 250, 70, 'rgba(255, 250, 235, 0.38)');

  // Fine horizontal lines give the metal a slightly cinematic anamorphic feel.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const y = 90 + i * 42;
    const g = ctx.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, 'rgba(80, 160, 255, .035)');
    g.addColorStop(0.65, 'rgba(255, 80, 200, .035)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 1024, 1);
  }
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(texture);
  texture.dispose();
  pmrem.dispose();
  return envRT.texture;
}

function buildSky(scene) {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(0x1a5c8c) },
    uColorB: { value: new THREE.Color(0x681e6d) },
    uColorC: { value: new THREE.Color(0x060a1a) }
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float height = smoothstep(-0.15, 0.8, d.y);
        vec3 col = mix(vec3(0.002, 0.003, 0.008), uColorC, height);
        col += uColorA * 0.035 * exp(-pow((d.y - 0.02) * 4.2, 2.0));

        vec2 p = d.xy;
        float left = exp(-dot(p - vec2(-0.52, 0.14), p - vec2(-0.52, 0.14)) * 16.0);
        float right = exp(-dot(p - vec2(0.56, -0.06), p - vec2(0.56, -0.06)) * 22.0);
        float crown = exp(-dot(p - vec2(0.08, 0.46), p - vec2(0.08, 0.46)) * 10.0);
        col += uColorA * left * 0.075;
        col += uColorB * right * 0.065;
        col += vec3(0.015, 0.025, 0.07) * crown * 0.6;

        float bands = 0.5 + 0.5 * sin(d.y * 24.0 + d.x * 7.0 + uTime * 0.08);
        col += uColorA * bands * 0.006 * smoothstep(-0.2, 0.7, d.y);

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(46, 36, 20), material);
  mesh.renderOrder = -20;
  scene.add(mesh);
  return {
    update(time) {
      uniforms.uTime.value = time;
    },
    setColors(fx) {
      uniforms.uColorA.value.set(fx.accent);
      uniforms.uColorB.value.set(fx.accent2);
    }
  };
}

function makeSoftDotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,.86)');
  g.addColorStop(0.48, 'rgba(255,255,255,.20)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildStars(scene) {
  const count = IS_MOBILE ? 220 : 380;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  let index = 0;
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.lerp(-0.1, 1, Math.random()));
    const radius = 24 + Math.random() * 12;
    positions[index] = Math.cos(theta) * Math.sin(phi) * radius;
    positions[index + 1] = Math.cos(phi) * radius;
    positions[index + 2] = Math.sin(theta) * Math.sin(phi) * radius;
    color.set(Math.random() < 0.72 ? 0xa9ddff : (Math.random() < 0.5 ? 0xff9bdf : 0xffe2aa));
    color.multiplyScalar(0.5 + Math.random() * 0.7);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
    index += 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    map: makeSoftDotTexture(),
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    alphaTest: 0.01,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return points;
}

function buildPortal(scene) {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(0x43e7ff) },
    uColorB: { value: new THREE.Color(0xff3dcc) },
    uIntensity: { value: 1 }
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float angle = atan(p.y, p.x);

        float outer = smoothstep(0.635, 0.652, r) * (1.0 - smoothstep(0.665, 0.682, r));
        float inner = smoothstep(0.49, 0.497, r) * (1.0 - smoothstep(0.503, 0.51, r));
        float haze = exp(-pow((r - 0.65) * 12.0, 2.0)) * 0.13;
        float swirl = 0.5 + 0.5 * sin(angle * 7.0 + uTime * 0.18 - r * 18.0);
        float spokes = pow(max(0.0, sin(angle * 14.0 + uTime * 0.22)), 12.0)
          * smoothstep(0.24, 0.63, r) * (1.0 - smoothstep(0.64, 0.9, r)) * 0.04;
        float pulse = 0.84 + 0.16 * sin(uTime * 0.85 + r * 4.0);

        vec3 col = mix(uColorA, uColorB, swirl);
        float alpha = (outer * 0.32 + inner * 0.11 + haze + spokes) * pulse * uIntensity;
        gl_FragColor = vec4(col * 1.25, alpha);
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), material);
  mesh.position.set(0, 0.15, -4.36);
  mesh.renderOrder = -4;
  scene.add(mesh);
  return {
    update(time) { uniforms.uTime.value = time; },
    setColors(fx) {
      uniforms.uColorA.value.set(fx.accent);
      uniforms.uColorB.value.set(fx.accent2);
      uniforms.uIntensity.value = fx.id === 'eco' ? 0.34 : 0.72;
    }
  };
}

function buildDarkHalo(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(0, 2, 8, .82)');
  gradient.addColorStop(0.48, 'rgba(0, 2, 8, .68)');
  gradient.addColorStop(0.72, 'rgba(0, 2, 8, .28)');
  gradient.addColorStop(1, 'rgba(0, 2, 8, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    depthTest: true
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6), material);
  mesh.position.set(0, 0.12, -3.88);
  mesh.renderOrder = -3;
  scene.add(mesh);
  return mesh;
}

function buildBeams(scene) {  const group = new THREE.Group();
  group.position.z = -3.1;
  scene.add(group);
  const geometries = [];
  const materials = [];
  let intensityFactor = 1;
  const count = IS_MOBILE ? 4 : 6;
  for (let i = 0; i < count; i++) {
    const uniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(i % 2 === 0 ? 0x35e5ff : 0xff37ce) },
      uOpacity: { value: 0.17 },
      uPhase: { value: i * 1.3 }
    };
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uPhase;
        varying vec2 vUv;
        void main() {
          float x = abs(vUv.x - 0.5) * 2.0;
          float core = pow(max(0.0, 1.0 - x), 2.4);
          float top = smoothstep(0.0, 0.2, vUv.y);
          float bottom = 1.0 - smoothstep(0.72, 1.0, vUv.y);
          float flicker = 0.72 + 0.28 * sin(uTime * 0.7 + uPhase);
          float alpha = core * top * bottom * uOpacity * flicker;
          gl_FragColor = vec4(uColor * 1.55, alpha);
        }
      `
    });
    const geo = new THREE.PlaneGeometry(0.32 + Math.random() * 0.28, 11.5);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set((i - (count - 1) / 2) * 1.55, 0.15, (Math.random() - 0.5) * 0.8);
    mesh.rotation.z = (Math.random() - 0.5) * 0.18;
    mesh.renderOrder = -3;
    group.add(mesh);
    geometries.push(geo);
    materials.push({ material, uniforms, phase: Math.random() * 5 });
  }
  return {
    update(time) {
      for (let i = 0; i < materials.length; i++) {
        const item = materials[i];
        item.uniforms.uTime.value = time;
        item.uniforms.uOpacity.value = (0.055 + i * 0.009) * intensityFactor * (0.45 + 0.55 * Math.abs(Math.sin(time * 0.24 + item.phase)));
      }
    },
    setIntensity(intensity, fx) {
      intensityFactor = intensity;
      for (let i = 0; i < materials.length; i++) {
        const item = materials[i];
        item.uniforms.uColor.value.set(i % 2 === 0 ? fx.accent : fx.accent2);
        item.uniforms.uOpacity.value = (0.055 + i * 0.009) * intensity;
      }
    }
  };
}

function buildRings(scene) {
  const group = new THREE.Group();
  group.position.set(0, 0.1, -5.25);
  group.scale.setScalar(1.24);
  scene.add(group);
  const entries = [];
  const definitions = [
    { radius: 3.45, tube: 0.017, colorIndex: 0, opacity: 0.3, rotation: [1.18, 0.16, 0.12], speed: 0.11 },
    { radius: 3.05, tube: 0.012, colorIndex: 1, opacity: 0.2, rotation: [-0.65, 0.74, -0.14], speed: -0.16 },
    { radius: 4.45, tube: 0.009, colorIndex: 0, opacity: 0.1, rotation: [0.35, -0.52, 0.08], speed: 0.07 },
    { radius: 2.28, tube: 0.008, colorIndex: 1, opacity: 0.09, rotation: [1.45, 0.15, -0.2], speed: 0.2 }
  ];
  for (const def of definitions) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x43e7ff),
      transparent: true,
      opacity: def.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(def.radius, def.tube, 6, 150), material);
    mesh.rotation.set(def.rotation[0], def.rotation[1], def.rotation[2]);
    mesh.position.z = (Math.random() - 0.5) * 0.7;
    mesh.renderOrder = -2;
    group.add(mesh);
    entries.push({ mesh, material, baseRot: [...def.rotation], speed: def.speed, opacity: def.opacity });
  }
  return {
    update(time) {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        entry.mesh.rotation.x = entry.baseRot[0] + time * entry.speed * 0.34;
        entry.mesh.rotation.y = entry.baseRot[1] + time * entry.speed;
        entry.mesh.rotation.z = entry.baseRot[2] + Math.sin(time * 0.2 + i) * 0.04;
      }
    },
    setColors(fx) {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        entry.material.color.set(i % 2 === 0 ? fx.accent : fx.accent2);
        entry.material.opacity = entry.opacity * (fx.id === 'eco' ? 0.55 : 1) * 0.95;
      }
    }
  };
}

function buildFloor(scene) {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(0x3fe4ff) },
    uColorB: { value: new THREE.Color(0xff3dcc) },
    uIntensity: { value: 0.85 }
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uIntensity;
      varying vec3 vWorld;

      void main() {
        vec2 coord = vWorld.xz;
        vec2 grid = abs(fract(coord - 0.5) - 0.5);
        float line = 1.0 - smoothstep(0.0, 0.035, min(grid.x, grid.y));
        float dist = length(coord);
        float fade = 1.0 - smoothstep(3.0, 18.0, dist);
        float inner = exp(-pow(dist * 0.42, 2.0)) * 0.16;
        float scan = exp(-pow((fract(coord.y * 0.055 - uTime * 0.03) - 0.5) * 8.0, 2.0)) * 0.08;
        vec3 col = mix(uColorA, uColorB, smoothstep(-6.0, 6.0, coord.x));
        float alpha = (line * 0.22 + inner + scan) * fade * uIntensity;
        gl_FragColor = vec4(col * 1.25, alpha);
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -2.85;
  mesh.renderOrder = -1;
  scene.add(mesh);

  const poolMat = new THREE.MeshBasicMaterial({
    map: makeSoftDotTexture(),
    color: 0x43e7ff,
    transparent: true,
    opacity: 0.11,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 5.5), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, -2.84, 0.2);
  pool.renderOrder = -1;
  scene.add(pool);

  return {
    update(time) {
      uniforms.uTime.value = time;
      poolMat.opacity = 0.08 + 0.025 * Math.sin(time * 0.55);
    },
    setColors(fx) {
      uniforms.uColorA.value.set(fx.accent);
      uniforms.uColorB.value.set(fx.accent2);
      uniforms.uIntensity.value = fx.grid;
      poolMat.color.set(fx.accent);
    }
  };
}

function buildMotes(scene) {
  const count = IS_MOBILE ? 620 : 1150;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const tints = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 7.4;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 8.2;
    positions[i * 3 + 2] = -5.2 + Math.random() * 8.4;
    sizes[i] = 0.035 + Math.pow(Math.random(), 2.4) * 0.22;
    phases[i] = Math.random() * Math.PI * 2;
    tints[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 1));

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.55 : 2) },
    uColorA: { value: new THREE.Color(0x43e7ff) },
    uColorB: { value: new THREE.Color(0xff3dcc) },
    uColorC: { value: new THREE.Color(0xffd27a) },
    uIntensity: { value: 1 }
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aSize;
      attribute float aPhase;
      attribute float aTint;
      varying float vTint;
      varying float vTwinkle;
      void main() {
        vec3 p = position;
        float slow = uTime * 0.09;
        p.x += sin(slow + aPhase * 1.7) * 0.28;
        p.y += cos(slow * 1.22 + aPhase * 2.1) * 0.22;
        p.z += sin(slow * 0.82 + aPhase * 1.2) * 0.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uPixelRatio * (360.0 / max(2.0, -mv.z)), 1.0, 21.0);
        vTint = aTint;
        vTwinkle = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * 1.35 + aPhase * 4.0), 2.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      uniform float uIntensity;
      varying float vTint;
      varying float vTwinkle;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, d);
        alpha = pow(alpha, 2.2);
        vec3 col = vTint < 0.45
          ? mix(uColorA, uColorB, vTint / 0.45)
          : mix(uColorB, uColorC, (vTint - 0.45) / 0.55);
        float core = smoothstep(0.22, 0.0, d);
        col += vec3(core * 0.6);
        gl_FragColor = vec4(col, alpha * vTwinkle * 0.7 * uIntensity);
      }
    `
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    update(time) {
      uniforms.uTime.value = time;
      uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.55 : 2);
    },
    setColors(fx) {
      uniforms.uColorA.value.set(fx.accent);
      uniforms.uColorB.value.set(fx.accent2);
      uniforms.uColorC.value.set(fx.gold);
      uniforms.uIntensity.value = fx.id === 'eco' ? 0.45 : 1;
    },
    setDrawRange(fraction) {
      points.geometry.setDrawRange(0, Math.max(30, Math.floor(count * fraction)));
    }
  };
}
