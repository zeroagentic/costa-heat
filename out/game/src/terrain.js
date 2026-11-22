// Terrain and atmosphere: the ground plane, the sloped beach, the animated sea, the
// gradient sky dome, the low warm sun and the haze that ties the horizon together.
import * as THREE from 'three';
import { CITY, ROAD } from './config.js';
import { planeGeometry } from './geometry-utils.js';
import { sandTexture, waterTexture, skyTexture, glowTexture } from './textures.js';

export const SUN_DIRECTION = new THREE.Vector3(0.72, 0.13, -0.5).normalize();
export const HAZE_COLOR = 0xf0b78a;

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
  const beachMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95, color: 0xfff0d8 });
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
  const skyTex = skyTexture();
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 32, 20), skyMat);
  sky.name = 'sky';
  sky.renderOrder = -10;
  group.add(sky);

  // ---- the sun: a big soft disc sitting on the horizon over the water ----
  const sunTex = glowTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, color: 0xfff0c0, transparent: true, opacity: 0.95, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunSprite.scale.set(620, 620, 1);
  sunSprite.position.copy(SUN_DIRECTION).multiplyScalar(2600);
  group.add(sunSprite);

  // horizon haze band: a wide billboard that hides the hard end of the sea plane
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0.55, fog: false, depthWrite: false, side: THREE.DoubleSide });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(6000, 260), hazeMat);
  haze.position.set(0, 70, 0);
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

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0xffcaa0, 1.05);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(0xffd0a0, 3.0);
  sunLight.position.copy(SUN_DIRECTION).multiplyScalar(260);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  const s = 90;
  sunLight.shadow.camera.left = -s;
  sunLight.shadow.camera.right = s;
  sunLight.shadow.camera.top = s;
  sunLight.shadow.camera.bottom = -s;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 620;
  sunLight.shadow.bias = -0.0018;
  sunLight.shadow.normalBias = 0.035;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const fill = new THREE.DirectionalLight(0x7090ff, 0.35);
  fill.position.set(-160, 110, -120);
  scene.add(fill);

  const update = (dt, elapsed, camera, playerPos) => {
    waterTex.offset.x = (waterTex.offset.x + dt * 0.0045) % 1;
    waterTex.offset.y = (waterTex.offset.y + dt * 0.0022) % 1;
    sunSprite.material.opacity = 0.9 + Math.sin(elapsed * 0.7) * 0.05;
    // keep the sky and sun centred on the camera so the dome never ends
    sky.position.copy(camera.position);
    sky.position.y = 0;
    haze.position.set(camera.position.x, 60, camera.position.z);
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