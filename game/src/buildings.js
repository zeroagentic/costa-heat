// Procedural buildings. Each block of the grid is subdivided into lots; lots get a
// building whose style follows the district. Walls merge into one mesh per facade style,
// roofs and rooftop clutter merge into a second mesh, and every building registers an
// axis-aligned collider so the player, cars and bullets cannot pass through it.
import * as THREE from 'three';
import { GRID, ROAD, CITY, districtAt } from './config.js';
import { mergeGeometries, wallGeometry, roofGeometry, boxGeometry, planeGeometry, tintGeometry } from './geometry-utils.js';
import { facadeTexture, signTexture, shopSignTexture } from './textures.js';

export const FACADE_TILE = { w: 12.8, h: 14.4 };

const STYLE_COLOURS = {
  glass: [0x9fc4d8, 0x8fb0c8, 0xb6d4e2, 0xa8c0d0],
  deco: [0xf7e6cf, 0xf3d9c4, 0xffe9c9, 0xe8d7bd],
  stucco: [0xf5e3cc, 0xf7d9c2, 0xefe2c8, 0xf9e8d4],
  pink: [0xf6bfae, 0xf2a894, 0xf8cbb8, 0xeda18f],
  cream: [0xfdf1d8, 0xf6e7c6, 0xfff4de, 0xf0e0bd],
  coral: [0xef8f7c, 0xf2a08a, 0xe98274, 0xf4b09a],
};

const SIGN_WORDS = ['HOTEL', 'BAR', 'CLUB', 'MOTEL', 'SURF', 'TIKI', 'CASINO', 'DINER', 'LIQUOR', 'VICE', 'PALMS', 'NEON'];
const SHOP_WORDS = ['CAFE SOL', 'TIKI BAR', 'SURF SHACK', 'PAWN', 'LIQUOR', 'TATTOO', 'MOTEL', 'DINER', 'GUNS', 'CLUB 84'];
const SIGN_HUES = [330, 190, 45, 280, 12, 160];

export function buildBuildings(rng, scene) {
  const colliders = [];
  const styleBuckets = new Map();
  const roofParts = [];
  const signGroups = new Map(); // texture -> planes
  const awningParts = [];
  const antennaParts = [];

  // ---- shared facade materials: one per style family ----
  const styleDefs = [
    ['glass', 'glass'], ['deco', 'deco'], ['stucco', 'stucco'], ['pink', 'pink'], ['cream', 'cream'], ['coral', 'pink'],
  ];
  const styleMaterials = new Map();
  for (const [name, art] of styleDefs) {
    const tex = facadeTexture(rng, art);
    styleMaterials.set(name, new THREE.MeshStandardMaterial({
      map: tex,
      vertexColors: true,
      roughness: art === 'glass' ? 0.34 : 0.82,
      metalness: art === 'glass' ? 0.32 : 0.02,
      emissiveMap: tex,
      emissive: 0xffd9a6,
      emissiveIntensity: 0.14,
    }));
  }
  for (const name of styleMaterials.keys()) styleBuckets.set(name, []);

  // ---- neon sign textures reused across many signs ----
  const signTextures = [];
  for (let i = 0; i < 8; i++) {
    const hue = SIGN_HUES[i % SIGN_HUES.length];
    signTextures.push(signTexture(rng, SIGN_WORDS[i % SIGN_WORDS.length], hue));
  }
  const shopTextures = [];
  for (let i = 0; i < 6; i++) {
    shopTextures.push(shopSignTexture(
      rng, SHOP_WORDS[i % SHOP_WORDS.length],
      ['#1b1220', '#101a22', '#221018', '#0f1a18', '#1a1420', '#201410'][i],
      [`hsl(${SIGN_HUES[i % SIGN_HUES.length]}, 95%, 68%)`][0],
    ));
  }

  const pickStyle = (district) => {
    const r = rng.next();
    if (district === 'downtown') return r < 0.42 ? 'glass' : r < 0.72 ? 'deco' : 'cream';
    if (district === 'ocean') return r < 0.4 ? 'pink' : r < 0.66 ? 'cream' : r < 0.86 ? 'coral' : 'deco';
    if (district === 'marina') return r < 0.5 ? 'stucco' : r < 0.75 ? 'cream' : 'glass';
    if (district === 'north') return r < 0.45 ? 'stucco' : r < 0.7 ? 'cream' : 'pink';
    return r < 0.34 ? 'stucco' : r < 0.6 ? 'cream' : r < 0.8 ? 'deco' : 'pink';
  };

  const heightFor = (district, style) => {
    if (district === 'downtown') return rng.range(48, 132) * (style === 'glass' ? 1.1 : 0.85);
    if (district === 'ocean') return rng.range(9, 24);
    if (district === 'marina') return rng.range(10, 30);
    if (district === 'north') return rng.range(14, 44);
    return rng.range(16, 48);
  };

  /** Add a single building: 1-2 stacked tiers, roof clutter, optional neon/shop sign. */
  const addBuilding = (x, z, w, d, h, district) => {
    const style = pickStyle(district);
    const palette = STYLE_COLOURS[style];
    const tint = rng.pick(palette);
    const bucket = styleBuckets.get(style);

    const tierSplit = (district === 'downtown' || h > 40) && rng.chance(0.62) && w > 12 && d > 12;
    const lowerH = tierSplit ? h * rng.range(0.55, 0.78) : h;
    const upperScale = tierSplit ? rng.range(0.62, 0.84) : 1;

    bucket.push(tintGeometry(wallGeometry(w, lowerH, d, x, z, FACADE_TILE.w, FACADE_TILE.h), tint));
    roofParts.push(tintGeometry(roofGeometry(w, d, lowerH, x, z, 0x2a2a2a), 0x33322e));

    if (tierSplit) {
      const uw = w * upperScale;
      const ud = d * upperScale;
      const ux = x + rng.range(-1, 1) * (w - uw) * 0.3;
      const uz = z + rng.range(-1, 1) * (d - ud) * 0.3;
      bucket.push(tintGeometry(wallGeometry(uw, h - lowerH, ud, ux, uz, FACADE_TILE.w, FACADE_TILE.h), tint));
      roofParts.push(tintGeometry(roofGeometry(uw, ud, h, ux, uz, 0x2a2a2a), 0x33322e));
      // rooftop plant room
      roofParts.push(tintGeometry(boxGeometry(uw * 0.34, 3.2, ud * 0.3, ux + uw * 0.1, h + 1.6, uz), 0x4a4a44));
    }

    // rooftop clutter: AC boxes, stair hut, water tank, antennas on tall towers
    const clutter = rng.int(1, 3);
    for (let i = 0; i < clutter; i++) {
      const cw = rng.range(1.4, 4.2);
      const cd = rng.range(1.4, 4.2);
      const cx = x + rng.range(-w * 0.32, w * 0.32);
      const cz = z + rng.range(-d * 0.32, d * 0.32);
      roofParts.push(tintGeometry(boxGeometry(cw, rng.range(0.6, 2.1), cd, cx, h + 0.9, cz), 0x55524a));
    }
    if (h > 58) {
      antennaParts.push(tintGeometry(boxGeometry(0.22, rng.range(6, 16), 0.22, x, h + 5, z), 0x777777));
      if (rng.chance(0.5)) antennaParts.push(tintGeometry(boxGeometry(2.4, 0.18, 0.18, x, h + 8, z), 0x777777));
    }

    // storefront: coloured band at street level with an awning on street-facing sides
    const frontSign = rng.chance(district === 'ocean' ? 0.78 : district === 'downtown' ? 0.12 : 0.34) && district !== 'downtown';
    if (frontSign) {
      const isEastFacing = x < 0;
      const faceZ = isEastFacing ? z + d / 2 + 0.06 : z - d / 2 - 0.06;
      const sw = Math.min(w * 0.7, 13);
      const sh = 1.5;
      const shopTex = rng.pick(shopTextures);
      const mat = new THREE.MeshBasicMaterial({ map: shopTex, toneMapped: false });
      const g = new THREE.PlaneGeometry(sw, sh);
      g.rotateY(isEastFacing ? 0 : Math.PI);
      g.translate(x, 3.5, faceZ);
      if (!signGroups.has(shopTex)) signGroups.set(shopTex, { mat, geoms: [] });
      signGroups.get(shopTex).geoms.push(g);
      // awning slab
      awningParts.push(tintGeometry(
        boxGeometry(sw, 0.24, 1.7, x, 3.1, faceZ + (isEastFacing ? 0.85 : -0.85)),
        rng.pick([0xff5f7a, 0x2ad1c9, 0xffc857, 0xf2f2f2]),
      ));
    }
    // vertical neon blade sign on a corner
    if (h > 12 && rng.chance(district === 'ocean' ? 0.55 : 0.3)) {
      const tex = rng.pick(signTextures);
      const faceX = rng.chance(0.5) ? x + w / 2 + 0.9 : x - w / 2 - 0.9;
      const faceZ = rng.chance(0.5) ? z + d / 2 : z - d / 2 + rng.range(-d * 0.3, d * 0.3);
      const g = new THREE.PlaneGeometry(1.5, 7);
      g.translate(faceX, Math.min(h - 3.5, rng.range(8, 18)), faceZ);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
      if (!signGroups.has(tex)) signGroups.set(tex, { mat, geoms: [] });
      signGroups.get(tex).geoms.push(g);
    }

    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
  };

  // ---- lay out every block ----
  for (let i = 0; i < GRID.xs.length - 1; i++) {
    for (let j = 0; j < GRID.zs.length - 1; j++) {
      const bx0 = GRID.xs[i] + ROAD.halfWidth;
      const bx1 = GRID.xs[i + 1] - ROAD.halfWidth;
      const bz0 = GRID.zs[j] + ROAD.halfWidth;
      const bz1 = GRID.zs[j + 1] - ROAD.halfWidth;
      const inset = ROAD.sidewalk + 1.6;
      const ix0 = bx0 + inset, ix1 = bx1 - inset;
      const iz0 = bz0 + inset, iz1 = bz1 - inset;
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      const district = districtAt(cx, cz);

      // the strip east of Ocean Drive is open promenade, no buildings
      if (ix0 > 179) continue;

      const bw = ix1 - ix0;
      const bd = iz1 - iz0;
      if (bw < 8 || bd < 8) continue;

      // choose a lot grid: 1, 2 or 3 lots across, each lot padded by an alley
      const lotsX = bw > 60 ? (rng.chance(0.5) ? 3 : 2) : bw > 34 ? 2 : 1;
      const lotsZ = bd > 60 ? (rng.chance(0.45) ? 3 : 2) : bd > 34 ? 2 : 1;
      const lotW = bw / lotsX;
      const lotD = bd / lotsZ;

      for (let lx = 0; lx < lotsX; lx++) {
        for (let lz = 0; lz < lotsZ; lz++) {
          // a few empty lots become plazas (left clear for props and pedestrians)
          if (rng.chance(departmentForEmptyLot(district))) continue;
          const pad = rng.range(1.2, 3.4);
          const w = Math.max(7, lotW - pad * 2);
          const d = Math.max(7, lotD - pad * 2);
          if (w < 7 || d < 7) continue;
          const x = ix0 + lotW * (lx + 0.5);
          const z = iz0 + lotD * (lz + 0.5);
          const h = heightFor(district, pickStyle(district));
          addBuilding(x, z, w, d, h, district);
        }
      }
    }
  }

  // ---- merge and add meshes ----
  const group = new THREE.Group();
  group.name = 'buildings';

  for (const [style, geoms] of styleBuckets) {
    if (!geoms.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geoms), styleMaterials.get(style));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `facades-${style}`;
    group.add(mesh);
  }

  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  if (roofParts.length) {
    const roofs = new THREE.Mesh(mergeGeometries(roofParts), roofMat);
    roofs.castShadow = true;
    roofs.receiveShadow = true;
    roofs.name = 'roofs';
    group.add(roofs);
  }

  if (awningParts.length) {
    const awn = new THREE.Mesh(mergeGeometries(awningParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    awn.castShadow = true;
    group.add(awn);
  }

  if (antennaParts.length) {
    const ant = new THREE.Mesh(mergeGeometries(antennaParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
    group.add(ant);
  }

  for (const [, entry] of signGroups) {
    if (!entry.geoms.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(entry.geoms), entry.mat);
    mesh.name = 'signs';
    group.add(mesh);
  }

  scene.add(group);
  return { group, colliders };
}

/** Probability an individual lot is left empty (plaza, parking, lot). */
function departmentForEmptyLot(district) {
  if (district === 'downtown') return 0.1;
  if (district === 'ocean') return 0.14;
  if (district === 'marina') return 0.22;
  return 0.16;
}

/**
 * Building-aware ground query used by the mission planner and props: is this spot
 * free of any building footprint?
 */
export function isSpotFree(colliders, x, z, radius = 2) {
  for (const c of colliders) {
    if (x + radius > c.x0 && x - radius < c.x1 && z + radius > c.z0 && z - radius < c.z1) return false;
  }
  return true;
}