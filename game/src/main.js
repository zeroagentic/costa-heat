// Entry point. Sets up the renderer, boots the world, owns the title/pause screens, the
// fixed-timestep loop, input wiring, shot mode and save menu. This is the only file that
// talks to both the DOM and the simulation loop.
import * as THREE from 'three';
import { skyTexture } from './textures.js';
import { City } from './city.js';
import { World } from './world.js';
import { Input } from './input.js';
import { AudioSystem } from './audio.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { ShotDirector, parseShotParams } from './shots.js';
import { saveGame, loadGame, hasSave, applySave, clearSave, slotInfo } from './save.js';
import { nearestVehicle } from './vehicles.js';
import { CAST } from './cast.js';
import { SHOT, CITY_NAME } from './config.js';

const canvas = document.getElementById('scene-canvas');
const fadeEl = document.getElementById('fade');
const titleEl = document.getElementById('title-screen');
const pauseEl = document.getElementById('pause-screen');
const saveStatus = document.getElementById('save-status');

let renderer;
let world = null;
let hud = null;
let minimap = null;
let input = null;
let audio = null;
let director = null;
let shotMode = null;
let mode = 'title';            // title | play | paused | dead
let lastTime = 0;
let accumulator = 0;
const FIXED = 1 / 60;
const SHOT_FRAMES = 90;   // a staged shot is exactly this many fixed steps long
let shotFrames = 0;

function makeRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(SHOT.width, SHOT.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Pushed up so the midday frame gets open sunlit pavement and real specular hits, rather
  // than squashing the whole tonal range down into a narrow band of flat midtones.
  renderer.toneMappingExposure = 1.75;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  window.addEventListener('resize', () => {
    const w = window.innerWidth, hgt = window.innerHeight;
    renderer.setSize(w, hgt, false);
  });
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

async function boot() {
  makeRenderer();
  hud = new Hud();
  minimap = new Minimap(document.getElementById('minimap'));
  audio = new AudioSystem();
  input = new Input(canvas);
  shotMode = parseShotParams();

  const seed = shotMode ? shotMode.seed : 1;
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.35, 4200);

  const world0 = new World({ scene, camera, hud, audio, minimap, seed });
  await world0.build(() => {});
  world = world0;

  // The environment map has to be fitted to the scene World actually draws, which means
  // this cannot run any earlier: World builds its own city scene and swaps it in mid-build,
  // so anything attached before that point is attached to a scene nobody renders. Skip it
  // and the water stops mirroring the sky, the tower glass goes grey and the car paint
  // loses the last of its reflections.
  try {
    const probeScene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: skyTexture() }),
    );
    probeScene.add(dome);
    const solarBlob = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc }),
    );
    solarBlob.position.set(-0.72, 0.13, -0.62).normalize().multiplyScalar(34);
    probeScene.add(solarBlob);
    const pmremGen = new THREE.PMREMGenerator(renderer);
    pmremGen.compileEquirectangularShader();
    world.scene.environment = pmremGen.fromScene(probeScene, 0.04).texture;
    pmremGen.dispose();
    dome.geometry.dispose();
    dome.material.dispose();
    solarBlob.geometry.dispose();
    solarBlob.material.dispose();
  } catch (err) {
    // Losing the env map costs reflections only, so a warning is enough to boot on.
    console.warn('environment map unavailable:', err);
  }
  world.input = input;
  renderer.setAnimationLoop?.(null);
  wireWorldCallbacks();

  if (shotMode) {
    director = new ShotDirector(world);
    director.stage(shotMode.shot, shotMode.seed);
    if (shotMode.shot === 'city') {
      // the vista shot keeps the HUD but needs the wider fov applied after staging
      camera.fov = 52;
      camera.updateProjectionMatrix();
    }
    hud.show();
    hud.setCash(world.cash);
    hud.setWanted(world.wanted.level);
    titleEl.classList.add('hidden');
    // shots are captured headless, where a CSS opacity transition may not advance:
    // take the fade overlay out of the frame outright so the render is not dimmed
    fadeEl.classList.add('clear');
    fadeEl.style.transition = 'none';
    fadeEl.style.opacity = '0';
    fadeEl.style.display = 'none';
    mode = 'shot';
    world.controlsActive = false;
    // one final settle pass with the staged camera so the first frame is the shot
    for (let i = 0; i < 6; i++) world.stepSimulation(FIXED, { scripted: true, skipCamera: true });
    requestAnimationFrame(frame);
    return;
  }

  titleEl.classList.remove('hidden');
  fadeEl.classList.add('clear');
  refreshSlotButtons();
  mode = 'title';
  world.player.setVisible(false);
  hud.hide();

  // Menu buttons
  document.getElementById('btn-new').addEventListener('click', () => {
    clearSave(1);
    startPlay(null, 1);
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    if (!hasSave(1)) return;
    startPlay(loadGame(1), 1);
  });
  document.getElementById('btn-slot2').addEventListener('click', () => {
    startPlay(hasSave(2) ? loadGame(2) : null, 2);
  });
  document.getElementById('btn-resume').addEventListener('click', () => resumeGame());
  document.getElementById('btn-save').addEventListener('click', () => {
    const ok = saveGame(world, 1);
    saveStatus.textContent = ok ? 'SAVED TO SLOT 1' : 'SAVE FAILED';
    refreshSlotButtons();
  });
  document.getElementById('btn-save2').addEventListener('click', () => {
    const ok = saveGame(world, 2);
    saveStatus.textContent = ok ? 'SAVED TO SLOT 2' : 'SAVE FAILED';
    refreshSlotButtons();
  });
  document.getElementById('btn-load2').addEventListener('click', () => {
    const data = loadGame(2);
    if (!data) { saveStatus.textContent = 'SLOT 2 IS EMPTY'; return; }
    pauseEl.classList.add('hidden');
    hud.show();
    world.player.reset();
    world.player.setVisible(true);
    applySave(world, data);
    world.state = 'play';
    mode = 'play';
    world.controlsActive = true;
    fadeEl.classList.add('clear');
    saveStatus.textContent = 'LOADED SLOT 2';
    input.requestLock();
  });
  document.getElementById('btn-title').addEventListener('click', () => quitToTitle());

  requestAnimationFrame(frame);
}

/** Update the title/pause buttons to say what each slot holds. */
function refreshSlotButtons() {
  const cont = document.getElementById('btn-continue');
  const slot2 = document.getElementById('btn-slot2');
  if (!cont || !slot2) return;
  const s1 = slotInfo(1);
  const s2 = slotInfo(2);
  cont.disabled = s1.empty;
  cont.style.opacity = s1.empty ? '0.4' : '1';
  cont.textContent = s1.empty ? 'Continue' : `Continue · $${s1.cash.toLocaleString('en-US')}`;
  slot2.textContent = s2.empty ? 'Slot 2 (empty)' : `Slot 2 · $${s2.cash.toLocaleString('en-US')}`;
  slot2.style.opacity = s2.empty ? '0.5' : '1';
}

function wireWorldCallbacks() {
  world.onArrested = () => { hud.showBanner('BUSTED', 3); };
  world.onDied = () => { mode = 'dead'; };
  world.audio = audio;
}

function startPlay(saveData, slot = 1) {
  audio.start();
  titleEl.classList.add('hidden');
  fadeEl.classList.remove('clear');
  hud.show();
  world.player.reset();
  world.player.setVisible(true);
  world.missions.restore({ index: 0 });
  world.missions.clearMissionVehicles?.();
  world.cash = 500;
  world.wanted.clear();
  world.police.clearAll();
  world.roadblocks.clear(world);
  world.helicopter.retire();
  world.rig.setMode('foot');
  world.rig.yaw = Math.PI * 0.5;
  if (saveData) applySave(world, saveData);
  world.state = 'play';
  mode = 'play';
  world.controlsActive = true;
  hud.setCash(world.cash);
  setTimeout(() => fadeEl.classList.add('clear'), 60);
  input.requestLock();
  if (!world._loopStarted) {
    world._loopStarted = true;
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }
  const sal = CAST.sal;
  hud.say(sal.short ?? sal.name, saveData ? sal.lines.return : sal.lines.greeting, 5, sal.colour);
  hud.showToast(`${CITY_NAME} · SLOT ${slot}`);
}

function resumeGame() {
  pauseEl.classList.add('hidden');
  fadeEl.classList.add('clear');
  mode = 'play';
  world.controlsActive = true;
  input.requestLock();
  audio.resume();
}

function pauseGame() {
  if (mode !== 'play') return;
  mode = 'paused';
  world.controlsActive = false;
  pauseEl.classList.remove('hidden');
  saveStatus.textContent = '';
  input.releaseLock();
}

function quitToTitle() {
  pauseEl.classList.add('hidden');
  hud.hide();
  world.player.setVisible(false);
  mode = 'title';
  titleEl.classList.remove('hidden');
  const cont = document.getElementById('btn-continue');
  cont.disabled = !hasSave();
  cont.style.opacity = hasSave() ? '1' : '0.4';
  input.releaseLock();
}

function handleGlobalKeys() {
  if (input.wasPressed('pause')) {
    if (mode === 'play') pauseGame();
    else if (mode === 'paused') resumeGame();
  }
  if (input.wasPressed('mute')) {
    const muted = audio.toggleMute();
    hud.showToast(muted ? 'AUDIO MUTED' : 'AUDIO ON');
  }
  if (mode !== 'play') return;

  // enter / exit vehicle
  if (input.wasPressed('enter')) {
    if (world.player.inVehicle) {
      world.exitVehicle();
      hud.showToast('ON FOOT');
    } else {
      const v = nearestVehicle(world.allVehicles(), world.player.position.x, world.player.position.z, 4.6);
      if (v) {
        world.enterVehicle(v);
      } else if (world.missions.canStart(world)) {
        world.missions.begin(world);
      }
    }
  }
  // garage: store the car you are driving, or roll one back out
  if (input.wasPressed('garage')) {
    if (world.garage.nearPad(world.player.position.x, world.player.position.z)) {
      if (world.player.inVehicle) world.garage.store(world);
      else world.garage.retrieve(world);
    } else {
      hud.showToast('NO GARAGE HERE — VEGA\'S LOCK-UP, AVENIDA COSTA');
    }
  }
  // save slots from the keyboard
  if (input.wasPressed('save1') || input.wasPressed('save2')) {
    const slot = input.wasPressed('save2') ? 2 : 1;
    const ok = saveGame(world, slot);
    hud.showToast(ok ? `SAVED — SLOT ${slot}` : 'SAVE FAILED');
    refreshSlotButtons();
  }
  // start the mission when the prompt says so (missions.canStart handled above via E)
  if (input.wasPressed('confirm') && world.missions.canStart(world) && !world.player.inVehicle) {
    world.missions.begin(world);
  }
}

function updateInteractPrompt() {
  if (mode !== 'play') return;
  const p = world.player;
  if (p.inVehicle) {
    if (world.garage.nearPad(p.position.x, p.position.z)) {
      hud.setPrompt('<b>E</b> LEAVE VEHICLE &nbsp;·&nbsp; <b>G</b> STORE IN GARAGE');
      return;
    }
    hud.setPrompt('<b>E</b> LEAVE VEHICLE');
    return;
  }
  if (world.garage.nearPad(p.position.x, p.position.z)) {
    hud.setPrompt('<b>G</b> ROLL OUT A STORED CAR');
    return;
  }
  const car = nearestVehicle(world.allVehicles(), p.position.x, p.position.z, 4.6);
  if (car) {
    hud.setPrompt(car.isPolice ? '<b>E</b> STEAL POLICE CRUISER' : '<b>E</b> STEAL VEHICLE');
    return;
  }
  if (world.missions.canStart(world)) {
    hud.setPrompt(`<b>E</b> TALK TO ${world.missions.giverName}`);
    return;
  }
  hud.setPrompt('');
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;

  if (mode === 'shot') {
    // A shot is a fixed-length movie: the staging already ran its deterministic warm-up,
    // and then the camera is posed. Frame count never changes the world, so the same
    // seed and shot always produce the same picture.
    if (shotFrames < 2) {
      shotFrames++;
      director.poseFinal();
      world.hud.update(0);
      world.minimap.draw(world);
      renderer.render(world.scene, world.camera);
    }
    return;
  }

  if (mode === 'title') {
    // slow idle orbit of the city behind the title card
    const t = now / 1000;
    const cam = world.camera;
    cam.position.set(-60 + Math.sin(t * 0.06) * 90, 44, 240 + Math.cos(t * 0.05) * 70);
    cam.lookAt(-40, 20, 40);
    cam.fov = 60;
    cam.updateProjectionMatrix();
    world.city.update(raw, t, cam, { x: 0, z: 0 });
    renderer.render(world.scene, world.camera);
    return;
  }

  if (mode === 'paused') {
    // input still has to be polled while paused, or Escape can never resume
    handleGlobalKeys();
    world.renderFrame(raw, null);
    renderer.render(world.scene, world.camera);
    input.endFrame();
    return;
  }

  if (mode === 'play' || mode === 'dead') {
    handleGlobalKeys();
    // mouse look
    const look = input.lookDelta();
    if (world.player.inVehicle) {
      world.rig.yaw += look.yaw * 1.1;
    } else {
      world.rig.look(look.yaw, look.pitch);
    }
    accumulator = Math.min(accumulator + raw, 0.2);
    let steps = 0;
    while (accumulator >= FIXED && steps < 4) {
      world.stepSimulation(FIXED, { input });
      accumulator -= FIXED;
      steps++;
    }
    updateInteractPrompt();
    world.renderFrame(raw, null);
    renderer.render(world.scene, world.camera);
    input.endFrame();
    return;
  }

  renderer.render(world.scene, world.camera);
}

// Expose a tiny surface for automated verification (no gameplay effect).
Object.defineProperty(window, '__world', { get: () => world });
Object.defineProperty(window, '__audio', { get: () => audio });
window.__save = () => saveGame(world);
Object.defineProperty(window, '__renderer', { get: () => renderer });
window.__load = () => loadGame();
window.__probe = (cols = 48, rows = 27) => {
  if (!world) return null;
  const THREE_ = THREE;
  const cam = world.camera;
  const ray = new THREE_.Raycaster();
  const targets = [];
  world.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    // skip the skydome and other fog:false backdrops so the probe sees real geometry
    if (o.material && o.material.fog === false) return;
    if (o.renderOrder < 0) return;
    targets.push(o);
  });
  const grid = [];
  const legend = new Map();
  const label = (obj) => {
    let o = obj;
    while (o) {
      if (o.name) return o.name;
      o = o.parent;
    }
    return 'mesh';
  };
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const ndc = new THREE_.Vector2((c + 0.5) / cols * 2 - 1, -((r + 0.5) / rows * 2 - 1));
      ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(targets, false);
      const hit = hits.find((h) => h.object.visible);
      if (!hit) { line += ' '; continue; }
      const name = label(hit.object);
      if (!legend.has(name)) legend.set(name, String.fromCharCode(65 + legend.size));
      line += legend.get(name);
    }
    grid.push(line);
  }
  return { grid, legend: Object.fromEntries([...legend].map(([k, v]) => [v, k])) };
};

window.__diag = () => {
  const d = {
    mode,
    cash: world?.cash,
    wanted: world?.wanted?.level,
    health: world?.player?.health,
    inVehicle: Boolean(world?.player?.inVehicle),
    mission: world?.missions?.active?.title ?? null,
    pos: world ? { x: +world.player.position.x.toFixed(1), z: +world.player.position.z.toFixed(1) } : null,
  };
  if (world) {
    const cam = world.camera;
    d.cam = { x: +cam.position.x.toFixed(1), y: +cam.position.y.toFixed(1), z: +cam.position.z.toFixed(1), fov: +cam.fov.toFixed(0) };
    d.camInside = world.city.isInsideBuilding(cam.position.x, cam.position.y, cam.position.z);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    d.dir = { x: +dir.x.toFixed(2), y: +dir.y.toFixed(2), z: +dir.z.toFixed(2) };
    const project = (v) => {
      const p = v.clone().project(cam);
      return { x: +((p.x * 0.5 + 0.5) * window.innerWidth).toFixed(0), y: +((-p.y * 0.5 + 0.5) * window.innerHeight).toFixed(0), z: +p.z.toFixed(2) };
    };
    d.screen = { player: project(world.player.position.clone().setY(world.player.position.y + 1)) };
    if (world.player.inVehicle) d.screen.car = project(world.player.inVehicle.position.clone());
    d.counts = {
      traffic: world.traffic.cars.filter((c) => c.state !== 'dead').length,
      peds: world.pedestrians.peds.filter((p) => p.alive).length,
      cruisers: world.police.cruisers.length,
      officers: world.police.officers.filter((o) => o.alive).length,
      markers: world.missions.markers.size,
    };
    d.carSpeed = world.player.inVehicle ? +world.player.inVehicle.speed.toFixed(1) : 0;
    d.render = renderer ? {
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    } : null;
  }
  return d;
};

window.addEventListener('unhandledrejection', (e) => {
  window.__errors = window.__errors ?? [];
  window.__errors.push(String(e.reason));
});

boot().catch((err) => {
  console.error(err);
  window.__errors = window.__errors ?? [];
  window.__errors.push(err?.stack ?? String(err));
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:absolute;left:10px;top:10px;color:#f66;z-index:99;font:12px monospace;white-space:pre-wrap">${String(err?.stack ?? err)}</pre>`);
});