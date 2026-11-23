// Terrain and atmosphere: the ground plane, the sloped beach, the animated sea, the
// gradient sky dome, the low warm sun and the haze that ties the horizon together.
import * as THREE from 'three';
import { CITY, ROAD } from './config.js';
import { planeGeometry } from './geometry-utils.js';
import { sandTexture, waterTexture, skyTexture, glowTexture, hazeTexture } from './textures.js';

// Direction the key light comes from. The elevation matters more than the compass bearing:
// the small vertical component keeps the sun near the horizon, so its rays arrive almost
// parallel to the ground and graze the buildings instead of hitting them face-on. A grazing
// angle gives every wall a bright side and a shadowed side, throws long shadows down the
// street and picks out a warm edge on anything standing against the sky — that modelling is
// where the sense of depth comes from. Lift the sun overhead and all four walls of a block
// receive nearly the same light, the shadows shrink to the footprint, and the frame
// collapses into a single even tone. The sideways component keeps it off the avenue's axis
// too, so the two kerbs are lit unequally rather than like a mirror.
export const SUN_DIRECTION = new THREE.Vector3(0.72, 0.13, -0.5).normalize();
// Tint of the airborne light that sits between the city and the dome. This colour is not
// free to choose: it is on screen at the same time as the sky gradient, and the eye reads
// the two as one body of air. Matching the haze to the warm end of the dome is what makes
// it look like depth — sunlight scattered over a few kilometres of coast. A haze that is
// cooler than the sky behind it stops describing distance and starts describing a separate
// grey layer loitering in front of the beach, which the eye reports as dirty air.
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
  // This material opts out of tone mapping. ACES is tuned for a scene whose bright end is
  // already hot, and pushing a saturated mid-blue through it pulls the colour toward grey
  // while lifting it — the sky would arrive on screen desaturated and milky. The gradient is
  // painted in final display colours, so it is shown exactly as authored.
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
    map: sunTex, color: 0xfff0c0, transparent: true, opacity: 0.95, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  // The disc is deliberately kept small against the far distance it sits at. Its edge is a
  // soft falloff, not a hard circle, so its apparent size decides whether it still reads as
  // a sun at all: widen it and the outer glow climbs into the orange band of the dome behind
  // it, the two gradients merge, and the eye loses the boundary that says "disc". Held at
  // this size the core stays compact and luminous, the bloom stays a halo around it, and the
  // horizon keeps a defined hot spot rather than a general smear of light.
  sunSprite.scale.set(620, 620, 1);
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

  // ---- lights: one strong low golden key, a cool sky fill that leaves the shadows dark,
  // and a warm rim from behind the camera's usual side so silhouettes separate ----
  const hemi = new THREE.HemisphereLight(0x83b2ff, 0x6b3a18, 0.42);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(0xffb463, 4.6);
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

  // cool bounce from the opposite side of the sky: keeps shadows blue, not black
  const fill = new THREE.DirectionalLight(0x5a82d6, 0.5);
  fill.position.set(-200, 90, -160);
  scene.add(fill);

  // warm rim / backlight: a low golden light opposite the key, so palms, poles, cars and
  // the player catch a bright edge against the sky and the haze
  const rim = new THREE.DirectionalLight(0xffcf9a, 1.15);
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