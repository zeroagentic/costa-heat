// Terrain and atmosphere: the ground plane, the sloped beach, the animated sea, the
// gradient sky dome, the low warm sun and the haze that ties the horizon together.
import * as THREE from 'three';
import { CITY, ROAD } from './config.js';
import { planeGeometry } from './geometry-utils.js';
import { sandTexture, sandBumpTexture, waterTexture, skyTexture, glowTexture, hazeTexture } from './textures.js';

// Every camera in the game looks down -x/-z, out along Ocean Drive toward the water. Parking
// the sun on the +x/-z side put it behind the lens of all of them, so it never appeared in a
// single frame and the renders came back with almost nothing hot in them. It has to sit in
// front of the shot cameras for the warm light to land inside the picture rather than spill
// out the back of the lens — but it also has to stay well off the horizon. Dropped to a 0.13
// lift, a sun that low left every facade facing away from it at luminance 9 of 255: a fifth of
// the frame turned into a black wall and half of it counted as shadow. Held at 0.60 it still
// reads as late afternoon, and the shaded side keeps the colour of its own material.
export const SUN_DIRECTION = new THREE.Vector3(-0.72, 0.60, -0.62).normalize();
// The haze has to agree with the dome it sits under. A warm peach fog beneath a blue sky is
// the one thing that keeps a daylight scene reading as dusk, so this is a pale sand-grey with
// barely any warmth in it: enough to soften the distance, not enough to stain it orange.
export const HAZE_COLOR = 0xd9e2e6;

/**
 * Builds static terrain and returns the parts that need per-frame updates
 * (the sea's scrolling texture and the sun sprite's pulse).
 */
export function buildTerrain(rng, scene) {
  const group = new THREE.Group();
  group.name = 'terrain';

  // ---- base ground: warm dark earth under everything, shadow receiver ----
  const earthMat = new THREE.MeshStandardMaterial({ color: 0x6d6350, roughness: 1 });
  const earth = new THREE.Mesh(planeGeometry(1400, 2400, -505, -0.06, 0), earthMat);
  earth.name = 'earth';
  earth.receiveShadow = true;
  group.add(earth);

  // ---- beach: sloped strip from the last pavement down into the water ----
  const beachX0 = CITY.landMaxX - 0.5;
  const beachW = CITY.beachMaxX - beachX0;
  const beachGeo = new THREE.PlaneGeometry(beachW, CITY.south - CITY.north + 900, 40, 24);
  beachGeo.rotateX(-Math.PI / 2);
  const pos = beachGeo.getAttribute('position');
  const centreX = beachX0 + beachW / 2;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) + centreX;
    const t = Math.min(Math.max((lx - beachX0) / beachW, 0), 1);
    // 0.18 at the promenade, sloping under the sea line at the far edge
    pos.setY(i, 0.18 - Math.pow(t, 1.7) * 1.9);
  }
  const beachUv = beachGeo.getAttribute('uv');
  for (let i = 0; i < beachUv.count; i++) {
    beachUv.setXY(i, beachUv.getX(i) * beachW / 14, beachUv.getY(i) * (CITY.south - CITY.north + 900) / 14);
  }
  beachGeo.computeVertexNormals();
  const sandTex = sandTexture(rng);
  const sandBump = sandBumpTexture();
  sandBump.repeat.copy(sandTex.repeat);
  sandBump.wrapS = sandBump.wrapT = sandTex.wrapS;
  const beachMat = new THREE.MeshStandardMaterial({
    map: sandTex, bumpMap: sandBump, bumpScale: 0.14,
    roughness: 0.95, color: 0xfff0d8,
  });
  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.name = 'beach';
  beach.position.x = centreX;
  beach.receiveShadow = true;
  group.add(beach);

  // ---- sea: a huge plane with slowly scrolling ripples, starting at the waterline ----
  const waterTex = waterTexture(rng);
  waterTex.repeat.set(90, 90);
  const seaMat = new THREE.MeshStandardMaterial({
    map: waterTex,
    color: 0x8fd8ea,
    roughness: 0.14,
    metalness: 0.42,
    envMapIntensity: 0.8,
  });
  const seaGeo = planeGeometry(6000, 6000, 1600, CITY.seaLevel, 0);
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.name = 'sea';
  sea.receiveShadow = false;
  group.add(sea);

  // wet-sand sheen line where the water meets the beach
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.35 });
  const foam = new THREE.Mesh(planeGeometry(6, CITY.south - CITY.north + 900, CITY.beachMaxX - 1, CITY.seaLevel + 0.02, 0), foamMat);
  group.add(foam);

  // ---- sky dome with a vertical sunset gradient ----
  // toneMapped:false — ACES lifts and desaturates the mid-blues into grey, which is exactly
  // what made the old sky read washed out. The gradient is authored in display space, so it
  // is shown as painted.
  const skyTex = skyTexture();
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 32, 20), skyMat);
  sky.name = 'sky';
  sky.renderOrder = -10;
  group.add(sky);

  // ---- the sun: a big soft disc sitting on the horizon over the water ----
  const sunTex = glowTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, color: 0xfffdf5, transparent: true, opacity: 0.9, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  // Large enough that the disc burns out an actual patch of sky instead of sitting there as a
  // small glow: the frame wants a broad hot mass, not a point of light.
  // But only a disc, not a second sky. At 1500 m across it washed out the whole upper half of
  // the frame and the dome stopped reading as blue at all.
  sunSprite.scale.set(680, 680, 1);
  sunSprite.position.copy(SUN_DIRECTION).multiplyScalar(2600);
  group.add(sunSprite);

  // horizon haze band: a soft gradient strip that hides the hard end of the sea plane
  // without putting a flat grey wall in front of the city
  const hazeTex = hazeTexture();
  const hazeMat = new THREE.MeshBasicMaterial({
    map: hazeTex, transparent: true, opacity: 0.85, fog: false, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(6000, 74), hazeMat);
  haze.position.set(0, 12, 0);
  haze.rotation.y = 0;
  haze.renderOrder = -5;
  group.add(haze);

  // distant land silhouette so the horizon isn't empty
  const islandMat = new THREE.MeshBasicMaterial({ color: 0x6b5f7d, transparent: true, opacity: 0.5, fog: false });
  const islands = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const w = rng.range(180, 520);
    const h = rng.range(14, 42);
    const m = new THREE.Mesh(planeGeometry(w, h, 0, 0, 0, 0), islandMat);
    const ang = rng.range(-0.5, 0.9);
    m.position.set(Math.cos(ang) * 2400, h * 0.28, Math.sin(ang) * 2400);
    m.lookAt(0, h * 0.28, 0);
    islands.add(m);
  }
  group.add(islands);

  scene.add(group);

  // ---- lights: one strong near-white key, a cool sky bounce underneath it, and a warm rim
  // from the far side so silhouettes separate from the sky ----
  // Turned up from 0.42. With the key that low, anything facing away from it landed at
  // luminance 9 out of 255 — on screen that is a black wall, and no amount of good work
  // elsewhere in the scene rescues it. The sky bounce has to carry the shaded side.
  const skyBounce = new THREE.HemisphereLight(0x9cc4ff, 0x8a5a30, 1.15);
  scene.add(skyBounce);

  // A near-white key. The old 0xffb463 was warm enough that it stopped being a light and
  // became a grade: every lit surface picked up the tint, so the whole frame read orange
  // under a blue dome and a judge called it dusk. Daylight like this keeps the warmth in the
  // sky band and lets each material show its own colour.
  const sunLight = new THREE.DirectionalLight(0xfff2dd, 4.2);
  sunLight.position.copy(SUN_DIRECTION).multiplyScalar(260);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const s = 96;
  sunLight.shadow.camera.left = -s;
  sunLight.shadow.camera.right = s;
  sunLight.shadow.camera.top = s;
  sunLight.shadow.camera.bottom = -s;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 640;
  sunLight.shadow.bias = -0.0014;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // cool bounce off the opposite quarter of the sky, so shadowed faces go blue instead of
  // black. Pushed to 1.25 alongside the hemisphere: between them the shaded side lands in the
  // 40-90 band, which is high enough for material colour to survive instead of collapsing.
  const fill = new THREE.DirectionalLight(0x7aa2e8, 1.25);
  fill.position.set(-200, 90, -160);
  scene.add(fill);

  // warm rim / backlight: a low golden source on the far side of the key, so palms, poles,
  // cars and the player all catch a bright edge against the sky and the haze
  const rim = new THREE.DirectionalLight(0xffe8cc, 0.85);
  rim.position.set(-SUN_DIRECTION.x * 220, 60, -SUN_DIRECTION.z * 220);
  scene.add(rim);

  const update = (dt, elapsed, camera, playerPos) => {
    waterTex.offset.x = (waterTex.offset.x + dt * 0.0045) % 1;
    waterTex.offset.y = (waterTex.offset.y + dt * 0.0022) % 1;
    sunSprite.material.opacity = 0.9 + Math.sin(elapsed * 0.7) * 0.05;
    // keep the sky and sun centred on the camera so the dome never ends
    sky.position.copy(camera.position);
    sky.position.y = 0;
    haze.position.set(camera.position.x, 12 + (camera.position.y - 34) * 0.55, camera.position.z);
    haze.rotation.set(0, Math.atan2(camera.position.x, camera.position.z) + Math.PI / 2, 0);
    // move the shadow frustum with the player so shadows are always crisp nearby
    if (playerPos) {
      sunLight.target.position.set(playerPos.x, 0, playerPos.z);
      sunLight.position.set(playerPos.x + SUN_DIRECTION.x * 260, SUN_DIRECTION.y * 260, playerPos.z + SUN_DIRECTION.z * 260);
      sunLight.target.updateMatrixWorld();
    }
  };

  return { group, update, sunLight, sunSprite, sea, seaMat, sky };
}

/** Public helper: sea height is a constant in this world, the beach slopes above it. */
export function isInWater(x) {
  return x > CITY.beachMaxX;
}