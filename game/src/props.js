// Street furniture and vegetation: palm trees along Ocean Drive and the beach, and
// streetlights that cast a soft pool of light at dusk. All merged into few draw calls.
import * as THREE from 'three';
import { GRID, ROAD, CITY } from './config.js';
import { mergeGeometries, boxGeometry } from './geometry-utils.js';
import { frondTexture, glowTexture } from './textures.js';

/** One palm: tapered trunk built from boxes, plus 7 crossed frond cards. */
function palmGeometries(rng, x, z, scale = 1) {
  const trunk = [];
  const h = rng.range(6.5, 12) * scale;
  const lean = rng.range(-0.16, 0.16);
  const segments = 9;
  let px = x, pz = z, py = 0;
  const radius = 0.26 * scale;
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const segH = h / segments;
    const r = radius * (1 - t * 0.45);
    px += lean * segH * 0.55;
    pz += Math.sin(t * 2.4) * 0.07 * segH;
    trunk.push(boxGeometry(r * 2, segH * 1.02, r * 2, px, py + segH / 2, pz, i % 2 ? 0x6b543a : 0x7d6344));
    py += segH;
  }
  // crown
  const crown = new THREE.SphereGeometry(0.62 * scale, 6, 4);
  crown.translate(px, py, pz);
  trunk.push(crown.toNonIndexed().scale(1, 1, 1));
  const fronds = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const g = new THREE.PlaneGeometry(2.6 * scale, 7.2 * scale, 1, 1);
    g.translate(0, 3.1 * scale, 0);
    const m = new THREE.Matrix4();
    m.makeRotationY((i / count) * Math.PI * 2 + rng.range(-0.2, 0.2));
    g.applyMatrix4(m);
    const tilt = new THREE.Matrix4().makeRotationX(Math.PI / 2 - rng.range(0.42, 0.95));
    const pivot = new THREE.Matrix4().makeTranslation(px, py, pz);
    const back = new THREE.Matrix4().makeTranslation(-px, -py, -pz);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(pivot, tilt).multiply(back));
    fronds.push(g);
  }
  return { trunk, fronds, h };
}

export function buildProps(rng, scene, colliders) {
  const trunkParts = [];
  const frondParts = [];
  const lightPosts = [];
  const lampGlows = [];
  const benches = [];
  const palms = []; // collider list

  const addPalm = (x, z, scale = 1) => {
    const { trunk, fronds, h } = palmGeometries(rng, x, z, scale);
    trunkParts.push(...trunk);
    frondParts.push(...fronds);
    palms.push({ x, z, radius: 0.5 * scale, height: h });
    colliders.push({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5, h: 3, thin: true });
  };

  // ---- palms: dense along the promenade, scattered across the beach, some inland ----
  for (let z = CITY.north + 20; z < CITY.south - 20; z += rng.range(11, 17)) {
    addPalm(CITY.landMaxX - 2.6 + rng.range(-0.6, 0.6), z + rng.range(-3, 3), rng.range(0.95, 1.25));
    if (rng.chance(0.6)) addPalm(CITY.landMaxX - 7.5 + rng.range(-1, 1), z + rng.range(-5, 5), rng.range(0.85, 1.1));
  }
  for (let i = 0; i < 90; i++) {
    const x = rng.range(CITY.landMaxX + 12, CITY.beachMaxX - 26);
    const z = rng.range(CITY.north + 40, CITY.south - 40);
    addPalm(x, z, rng.range(0.8, 1.35));
  }
  // palms in the block plazas near the beach
  for (let i = 0; i < 70; i++) {
    const x = rng.range(60, 170);
    const z = rng.range(CITY.north + 30, CITY.south - 30);
    if (colliders.some((c) => !c.thin && x > c.x0 - 2 && x < c.x1 + 2 && z > c.z0 - 2 && z < c.z1 + 2)) continue;
    addPalm(x, z, rng.range(0.8, 1.2));
  }

  // ---- streetlights: alternate corners of every intersection ----
  const lightGlowGeom = [];
  for (let i = 0; i < GRID.xs.length - 1; i++) {
    for (let j = 0; j < GRID.zs.length - 1; j++) {
      const x = GRID.xs[i] + ROAD.halfWidth + ROAD.sidewalk * 0.5;
      const z = GRID.zs[j] + ROAD.halfWidth + ROAD.sidewalk * 0.5;
      const flip = (i + j) % 2 === 0;
      const px = flip ? x : GRID.xs[i + 1] - ROAD.halfWidth - ROAD.sidewalk * 0.5;
      const pz = flip ? z : GRID.zs[j + 1] - ROAD.halfWidth - ROAD.sidewalk * 0.5;
      // skip the promenade strip (palms live there)
      if (px > 176) continue;
      const post = 7.4;
      lightPosts.push(boxGeometry(0.16, post, 0.16, px, post / 2, pz, 0x2d3238));
      const armDir = Math.sign((GRID.xs[i] + GRID.xs[i + 1]) / 2 - px) || 1;
      lightPosts.push(boxGeometry(1.9, 0.14, 0.14, px + armDir * 0.95, post - 0.1, pz, 0x2d3238));
      const head = new THREE.BoxGeometry(0.72, 0.2, 0.34);
      head.translate(px + armDir * 1.85, post - 0.22, pz);
      lightPosts.push(head.toNonIndexed());
      const glow = new THREE.PlaneGeometry(9, 9);
      glow.rotateX(-Math.PI / 2);
      glow.translate(px + armDir * 1.85, 0.05, pz);
      lightGlowGeom.push(glow);
      colliders.push({ x0: px - 0.3, x1: px + 0.3, z0: pz - 0.3, z1: pz + 0.3, h: 7, thin: true });
    }
  }

  // ---- benches + lifeguard towers on the beach ----
  for (let i = 0; i < 26; i++) {
    const x = rng.range(CITY.landMaxX + 4, CITY.landMaxX + 30);
    const z = rng.range(CITY.north + 30, CITY.south - 30);
    benches.push(boxGeometry(2.4, 0.12, 0.7, x, 0.62, z, 0x8a6a44));
    benches.push(boxGeometry(2.4, 0.7, 0.12, x, 0.95, z - 0.3, 0x8a6a44));
    benches.push(boxGeometry(0.16, 0.62, 0.6, x - 1.05, 0.31, z, 0x4a4a4a));
    benches.push(boxGeometry(0.16, 0.62, 0.6, x + 1.05, 0.31, z, 0x4a4a4a));
  }
  for (let i = 0; i < 7; i++) {
    const x = CITY.landMaxX + rng.range(26, 60);
    const z = CITY.north + 60 + i * 100;
    const y = 0.18 - Math.min(1, (x - CITY.landMaxX) / (CITY.beachMaxX - CITY.landMaxX)) ** 2 * 0.6;
    for (const [dx, dz, w, h, d] of [[0, 0, 3.4, 0.3, 3.4], [-1.4, -1.4, 0.24, 3.1, 0.24], [1.4, -1.4, 0.24, 3.1, 0.24], [-1.4, 1.4, 0.24, 3.1, 0.24], [1.4, 1.4, 0.24, 3.1, 0.24], [0, 0, 4.6, 0.24, 4.6]]) {
      benches.push(boxGeometry(w, h, d, x + dx, y + (h === 3.1 ? h / 2 : h === 0.24 && w === 4.6 ? 3.25 : 0.15), z + dz, h === 3.1 ? 0xe8e0cc : 0xf2ede0));
    }
  }

  const group = new THREE.Group();
  group.name = 'props';

  const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const trunks = new THREE.Mesh(mergeGeometries(trunkParts), trunkMat);
  trunks.name = 'palm-trunk';
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  group.add(trunks);

  const frondMat = new THREE.MeshStandardMaterial({
    map: frondTexture(rng), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    vertexColors: true, roughness: 0.85,
  });
  const fronds = new THREE.Mesh(mergeGeometries(frondParts.map((g) => {
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = 0.52; colors[i * 3 + 1] = 0.78; colors[i * 3 + 2] = 0.4; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  })), frondMat);
  fronds.castShadow = true;
  fronds.name = 'palm-fronds';
  group.add(fronds);

  const postMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 });
  const posts = new THREE.Mesh(mergeGeometries(lightPosts), postMat);
  posts.name = 'streetlight';
  posts.castShadow = true;
  group.add(posts);

  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), color: 0xffcf8a, transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glows = new THREE.Mesh(mergeGeometries(lightGlowGeom), glowMat);
  glows.name = 'streetlight-pools';
  group.add(glows);

  const benchMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const benchMesh = new THREE.Mesh(mergeGeometries(benches), benchMat);
  benchMesh.name = 'bench';
  benchMesh.castShadow = true;
  benchMesh.receiveShadow = true;
  group.add(benchMesh);

  scene.add(group);
  return { group, palms, glows };
}