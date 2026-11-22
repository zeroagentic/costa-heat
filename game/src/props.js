// Street furniture and vegetation: palm trees along Ocean Drive and the beach, streetlights
// that cast a warm pool at dusk, and the clutter of a real pavement — benches, bins, bus
// shelters, planters, crates, scooters, hydrants, bollards, newspaper boxes, umbrellas and
// lifeguard towers. Everything merges into a handful of draw calls.
import * as THREE from 'three';
import { GRID, ROAD, CITY } from './config.js';
import { mergeGeometries, boxGeometry } from './geometry-utils.js';
import { frondTexture, glowTexture } from './textures.js';

/** One palm: tapered trunk built from boxes, plus 9 crossed frond cards and coconuts. */
function palmGeometries(rng, x, z, scale = 1) {
  const trunk = [];
  const h = rng.range(6.5, 13.5) * scale;
  const lean = rng.range(-0.22, 0.22);
  const segments = 9;
  let px = x, pz = z, py = 0;
  const radius = 0.27 * scale;
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const segH = h / segments;
    const r = radius * (1 - t * 0.45);
    px += lean * segH * 0.55;
    pz += Math.sin(t * 2.4) * 0.08 * segH;
    // alternating ring colour reads as bark at screenshot distance
    trunk.push(boxGeometry(r * 2, segH * 1.02, r * 2, px, py + segH / 2, pz, i % 2 ? 0x6a5136 : 0x8a6d47));
    py += segH;
  }
  // crown: a knuckle plus coconut cluster
  const crown = new THREE.SphereGeometry(0.66 * scale, 6, 4);
  crown.translate(px, py, pz);
  trunk.push(crown.toNonIndexed());
  for (let c = 0; c < 4; c++) {
    const a = (c / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const nut = new THREE.SphereGeometry(0.17 * scale, 5, 4);
    nut.translate(px + Math.cos(a) * 0.4 * scale, py - 0.22 * scale, pz + Math.sin(a) * 0.4 * scale);
    trunk.push(nut.toNonIndexed());
  }
  const fronds = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const g = new THREE.PlaneGeometry(rng.range(2.3, 3.0) * scale, rng.range(6.4, 8.0) * scale, 1, 1);
    g.translate(0, 3.2 * scale, 0);
    const m = new THREE.Matrix4();
    m.makeRotationY((i / count) * Math.PI * 2 + rng.range(-0.25, 0.25));
    g.applyMatrix4(m);
    const tilt = new THREE.Matrix4().makeRotationX(Math.PI / 2 - rng.range(0.3, 1.05));
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
  const softParts = [];    // benches, towers, umbrellas: mid-tone warm timber/canvas
  const metalParts = [];   // bins, hydrants, bollards, scooter frames, boxes: saturated
  const crowdParts = [];   // planters + umbrellas: foliage and fabric colour

  const addPalm = (x, z, scale = 1) => {
    const { trunk, fronds, h } = palmGeometries(rng, x, z, scale);
    trunkParts.push(...trunk);
    frondParts.push(...fronds);
    colliders.push({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5, h: 3, thin: true });
  };

  // ---- palms: double row down the promenade, scattered across the sand, inland plazas ----
  for (let z = CITY.north + 20; z < CITY.south - 20; z += rng.range(8.5, 13)) {
    addPalm(CITY.landMaxX - 2.4 + rng.range(-0.5, 0.5), z + rng.range(-3, 3), rng.range(1.0, 1.35));
    if (rng.chance(0.75)) addPalm(CITY.landMaxX - 7.6 + rng.range(-1, 1), z + rng.range(-5, 5), rng.range(0.8, 1.15));
    if (rng.chance(0.35)) addPalm(CITY.landMaxX - 13 + rng.range(-1.5, 1.5), z + rng.range(-6, 6), rng.range(0.75, 1.0));
  }
  for (let i = 0; i < 180; i++) {
    const x = rng.range(CITY.landMaxX + 10, CITY.beachMaxX - 22);
    const z = rng.range(CITY.north + 40, CITY.south - 40);
    addPalm(x, z, rng.range(0.75, 1.4));
  }
  for (let i = 0; i < 110; i++) {
    const x = rng.range(50, 172);
    const z = rng.range(CITY.north + 30, CITY.south - 30);
    if (colliders.some((c) => !c.thin && x > c.x0 - 2 && x < c.x1 + 2 && z > c.z0 - 2 && z < c.z1 + 2)) continue;
    addPalm(x, z, rng.range(0.8, 1.25));
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

  // ---- pavement furniture along Ocean Drive and the cross streets ----
  const BUS_COLOURS = [0xff5f7a, 0x2ad1c9, 0xffc857, 0xf2f2f2];
  const addBench = (x, z, rotY) => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const put = (w, h, d, ox, oy, oz, col) => softParts.push(
      boxGeometry(w, h, d, x + ox * c + oz * s, oy, z - ox * s + oz * c, col),
    );
    put(2.4, 0.13, 0.72, 0, 0.62, 0, 0x9a7548);          // seat
    put(2.4, 0.62, 0.12, 0, 0.94, -0.30, 0x9a7548);      // back
    for (const ox of [-0.55, 0, 0.55]) put(0.14, 0.1, 0.7, ox, 0.6, 0, 0xb8905c); // slats
    for (const ox of [-1.05, 1.05]) put(0.16, 0.62, 0.6, ox, 0.31, 0, 0x33373d);  // legs
  };
  const addBin = (x, z) => {
    metalParts.push(boxGeometry(0.56, 0.92, 0.56, x, 0.46, z, 0x2e6b4f));
    metalParts.push(boxGeometry(0.62, 0.08, 0.62, x, 0.95, z, 0x1d4534));
    metalParts.push(boxGeometry(0.62, 0.06, 0.62, x, 0.66, z, 0x1d4534));
  };
  const addHydrant = (x, z) => {
    metalParts.push(boxGeometry(0.26, 0.62, 0.26, x, 0.31, z, 0xd42b2b));
    metalParts.push(boxGeometry(0.42, 0.12, 0.18, x, 0.46, z, 0xc02424));
    metalParts.push(boxGeometry(0.18, 0.12, 0.42, x, 0.46, z, 0xc02424));
    metalParts.push(boxGeometry(0.3, 0.1, 0.3, x, 0.66, z, 0xe8e2d4));
  };
  const addBollard = (x, z) => {
    for (const off of [-0.9, 0, 0.9]) {
      metalParts.push(boxGeometry(0.16, 0.9, 0.16, x, 0.45, z + off, 0x3a3f45));
      metalParts.push(boxGeometry(0.2, 0.07, 0.2, x, 0.9, z + off, 0xd8d2c4));
    }
  };
  const addNewsBox = (x, z, col) => {
    metalParts.push(boxGeometry(0.44, 0.9, 0.4, x, 0.45, z, col));
    metalParts.push(boxGeometry(0.36, 0.3, 0.02, x, 0.72, z + 0.21, 0x1c1c22));
    metalParts.push(boxGeometry(0.46, 0.1, 0.42, x, 0.93, z, 0x25252b));
  };
  const addCrates = (x, z) => {
    for (let i = 0; i < 3; i++) {
      const col = i === 1 ? 0xb4763c : 0x8f5a2c;
      softParts.push(boxGeometry(0.86, 0.42, 0.7, x + rng.range(-0.15, 0.15), 0.21 + i * 0.43, z + rng.range(-0.15, 0.15), col));
    }
    softParts.push(boxGeometry(0.9, 0.06, 0.74, x, 0.44, z, 0x6d4421));
    softParts.push(boxGeometry(0.9, 0.06, 0.74, x, 0.87, z, 0x6d4421));
  };
  const addPlanter = (x, z) => {
    softParts.push(boxGeometry(1.5, 0.66, 1.5, x, 0.33, z, 0xc9b79a));
    softParts.push(boxGeometry(1.62, 0.1, 1.62, x, 0.7, z, 0xe4d6bd));
    crowdParts.push(boxGeometry(1.2, 0.34, 1.2, x, 0.82, z, 0x4f6b35));
    for (let f = 0; f < 7; f++) {
      crowdParts.push(boxGeometry(0.22, rng.range(0.5, 1.15), 0.22,
        x + rng.range(-0.5, 0.5), 1.1, z + rng.range(-0.5, 0.5), rng.chance(0.4) ? 0xd8446a : 0x5d8a3c));
    }
  };
  const addUmbrella = (x, z, y = 0.3) => {
    const col = rng.pick([0xff5f7a, 0xffc857, 0x2ad1c9, 0xf2f2f2, 0xff8c42]);
    metalParts.push(boxGeometry(0.08, 2.5, 0.08, x, y + 1.25, z, 0xe8e2d4));
    const cone = new THREE.ConeGeometry(1.5, 0.5, 8);
    cone.translate(x, y + 2.5, z);
    crowdParts.push(cone.toNonIndexed());
    // colour the cone by pushing a tinted copy through boxGeometry-free path
    const uv = cone.getAttribute('position').count;
    const arr = new Float32Array(uv * 3);
    const cc = new THREE.Color(col);
    for (let i = 0; i < uv; i++) { arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b; }
    cone.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };
  const addScooter = (x, z, rotY) => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const put = (w, h, d, ox, oy, oz, col) => metalParts.push(
      boxGeometry(w, h, d, x + ox * c + oz * s, oy, z - ox * s + oz * c, col),
    );
    const col = rng.pick([0x2ac1d1, 0xd93b4a, 0xf0c94e, 0xe8e8e8]);
    put(0.34, 0.5, 1.3, 0, 0.52, 0, col);          // body
    put(0.28, 0.6, 0.3, 0, 0.95, -0.5, col);       // front shield
    put(0.56, 0.07, 0.07, 0, 1.16, -0.42, 0x2a2a30); // bars
    put(0.42, 0.14, 0.5, 0, 0.86, 0.34, 0x1b1b1f); // seat
    for (const oz of [-0.55, 0.55]) {
      const w = new THREE.CylinderGeometry(0.27, 0.27, 0.14, 10);
      w.rotateZ(Math.PI / 2);
      w.translate(x + oz * s, 0.28, z + oz * c);
      metalParts.push(w.toNonIndexed());
    }
  };
  const addBusStop = (x, z, rotY) => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const put = (w, h, d, ox, oy, oz, col) => softParts.push(
      boxGeometry(w, h, d, x + ox * c + oz * s, oy, z - ox * s + oz * c, col),
    );
    put(0.16, 2.6, 0.16, -1.5, 1.3, -0.7, 0x3a3f45);
    put(0.16, 2.6, 0.16, 1.5, 1.3, -0.7, 0x3a3f45);
    put(3.2, 0.14, 1.7, 0, 2.62, 0, 0x2f8f8a);       // roof
    put(3.0, 0.06, 0.06, 0, 1.9, -0.7, 0x3a3f45);
    put(1.5, 0.1, 0.45, 0.5, 0.55, -0.35, 0x9a7548); // bench
    put(1.9, 1.9, 0.08, -0.4, 1.5, -0.75, 0x9fd6e0); // glass back
  };

  // pavement strip on the sea side of Ocean Drive (x 183..188) and the kerb of each block
  for (let z = CITY.north + 30; z < CITY.south - 30; z += rng.range(14, 26)) {
    const px = 186.4 + rng.range(-0.4, 0.4);
    const kind = rng.next();
    if (kind < 0.22) addBench(px - 1.1, z, Math.PI / 2);
    else if (kind < 0.4) addBin(px - 0.6, z);
    else if (kind < 0.5) addNewsBox(px - 0.7, z, rng.pick([0xf0c94e, 0x2f7fd9, 0xd93b4a]));
    else if (kind < 0.62) addPlanter(px - 1.1, z);
    else if (kind < 0.72) addCrates(px - 1.2, z);
    else if (kind < 0.84) addBollard(px - 1.6, z);
    else addScooter(px - 1.3, z, Math.PI / 2 + rng.range(-0.2, 0.2));
  }
  // hydrants + bus stops: sparse, so they read as landmarks
  for (let z = CITY.north + 60; z < CITY.south - 60; z += 96) addHydrant(186.9, z + rng.range(-8, 8));
  for (let z = CITY.north + 150; z < CITY.south - 150; z += 210) addBusStop(185.5, z + rng.range(-10, 10), Math.PI / 2);

  // inland kerbs: bins, benches, planters, crates in the alleys
  for (let i = 0; i < 130; i++) {
    const gx = rng.pick([100, 100, 0, -100, -200, -300]);
    const gz = rng.range(CITY.north + 40, CITY.south - 40);
    const side = rng.chance(0.5) ? 1 : -1;
    const px = gx + side * (ROAD.halfWidth + rng.range(1.0, 3.2));
    const pz = gz;
    if (px > 176) continue;
    const k = rng.next();
    if (k < 0.3) addBin(px, pz);
    else if (k < 0.5) addBench(px, pz, rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    else if (k < 0.72) addPlanter(px, pz);
    else if (k < 0.86) addCrates(px, pz);
    else addBollard(px, pz);
  }

  // ---- beach: umbrellas, loungers, lifeguard towers ----
  for (let i = 0; i < 60; i++) {
    const x = CITY.landMaxX + rng.range(12, 80);
    const z = rng.range(CITY.north + 30, CITY.south - 30);
    const y = 0.18 - Math.min(1, (x - CITY.landMaxX) / (CITY.beachMaxX - CITY.landMaxX)) ** 1.7 * 0.55;
    if (rng.chance(0.6)) addUmbrella(x, z, y);
    else {
      // lounger: a low deck chair with a striped pad
      softParts.push(boxGeometry(1.7, 0.09, 0.66, x, y + 0.36, z, 0xd9b073));
      softParts.push(boxGeometry(0.7, 0.09, 0.62, x - 0.55, y + 0.6, z, rng.pick([0xff5f7a, 0x2ad1c9, 0xffc857])));
      for (const ox of [-0.7, 0.7]) softParts.push(boxGeometry(0.09, 0.36, 0.09, x + ox, y + 0.18, z, 0x8a8a8a));
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = CITY.landMaxX + rng.range(26, 64);
    const z = CITY.north + 50 + i * 88;
    const y = 0.18 - Math.min(1, (x - CITY.landMaxX) / (CITY.beachMaxX - CITY.landMaxX)) ** 2 * 0.6;
    for (const [dx, dz, w, h, d] of [[0, 0, 3.4, 0.3, 3.4], [-1.4, -1.4, 0.24, 3.1, 0.24], [1.4, -1.4, 0.24, 3.1, 0.24], [-1.4, 1.4, 0.24, 3.1, 0.24], [1.4, 1.4, 0.24, 3.1, 0.24], [0, 0, 4.6, 0.24, 4.6]]) {
      softParts.push(boxGeometry(w, h, d, x + dx, y + (h === 3.1 ? h / 2 : h === 0.24 && w === 4.6 ? 3.25 : 0.15), z + dz, h === 3.1 ? 0xe8e0cc : 0xf2ede0));
    }
    // the tower's flag, a bright silhouette against the sky
    crowdParts.push(boxGeometry(0.08, 1.2, 0.08, x + 2.3, y + 3.8, z, 0xe8e2d4));
    crowdParts.push(boxGeometry(0.9, 0.5, 0.06, x + 2.75, y + 4.2, z, 0xd93b4a));
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
    for (let i = 0; i < n; i++) { colors[i * 3] = 0.44; colors[i * 3 + 1] = 0.72; colors[i * 3 + 2] = 0.31; }
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
    map: glowTexture(), color: 0xffcf8a, transparent: true, opacity: 0.30,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glows = new THREE.Mesh(mergeGeometries(lightGlowGeom), glowMat);
  glows.name = 'streetlight-pools';
  group.add(glows);

  const softMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const soft = new THREE.Mesh(mergeGeometries(softParts), softMat);
  soft.name = 'street-furniture';
  soft.castShadow = true;
  soft.receiveShadow = true;
  group.add(soft);

  const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
  const metal = new THREE.Mesh(mergeGeometries(metalParts), metalMat);
  metal.name = 'street-metal';
  metal.castShadow = true;
  metal.receiveShadow = true;
  group.add(metal);

  const crowdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  const crowd = new THREE.Mesh(mergeGeometries(crowdParts), crowdMat);
  crowd.name = 'street-soft';
  crowd.castShadow = true;
  group.add(crowd);

  scene.add(group);
  return { group, glows };
}
