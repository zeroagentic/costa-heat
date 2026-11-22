// Procedural buildings. Each block of the grid is subdivided into lots; lots get a
// building whose style follows the district. Walls merge into one mesh per facade style,
// roofs and rooftop clutter merge into a second mesh, and every building registers an
// axis-aligned collider so the player, cars and bullets cannot pass through it.
import * as THREE from 'three';
import { GRID, ROAD, CITY, districtAt } from './config.js';
import { mergeGeometries, wallGeometry, roofGeometry, boxGeometry, planeGeometry, tintGeometry } from './geometry-utils.js';
import { facadeTexture, signTexture, shopSignTexture, billboardTexture } from './textures.js';

export const FACADE_TILE = { w: 12.8, h: 14.4 };

const BILLBOARD_ADS = [
  ['VICE', 'EVERY NIGHT', 330], ['SURF', 'BOARDS · WAX', 190], ['PALMS', 'RESORT HOTEL', 45],
  ['NEON', 'CLUB 84', 280], ['TIKI', 'RUM · 24H', 12], ['COSTA', 'HEAT', 160],
];

const STYLE_COLOURS = {
  glass: [0x7fa8c4, 0x6f93b0, 0x92b8cf, 0x80a0bc, 0x5f8299],
  deco: [0xffe6c4, 0xfad0b2, 0xffecc9, 0xe9cbaa, 0xf7d6b4],
  stucco: [0xf7e2c2, 0xf6d0b0, 0xefd9b8, 0xfbe4c6, 0xe8cba6],
  pink: [0xf9b49c, 0xf29a80, 0xfcc0a6, 0xe08a74, 0xf7a98d],
  cream: [0xfff0cc, 0xf8e2b8, 0xfff6da, 0xf0d8ae, 0xfae7c0],
  coral: [0xf5805f, 0xf79070, 0xe96f52, 0xf9a483, 0xd9634a],
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
  const windowParts = [];       // lit shopfront glass, one emissive mesh

  // ---- shared facade materials: one per style family ----
  const styleDefs = [
    ['glass', 'glass'], ['deco', 'deco'], ['stucco', 'stucco'], ['pink', 'pink'], ['cream', 'cream'], ['coral', 'pink'],
  ];
  const styleMaterials = new Map();
  for (const [name, art] of styleDefs) {
    const tex = facadeTexture(rng, art);
    const glass = art === 'glass';
    styleMaterials.set(name, new THREE.MeshStandardMaterial({
      map: tex,
      vertexColors: true,
      // real glass: low roughness + high metalness so the dome and sun smear across it.
      // Stucco/pink/cream stay dead matte so the key light rakes rather than glares.
      roughness: glass ? 0.18 : 0.94,
      metalness: glass ? 0.62 : 0.02,
      envMapIntensity: glass ? 1.35 : 0.35,
      emissiveMap: tex,
      emissive: glass ? 0x9fd0ff : 0xffc078,
      emissiveIntensity: glass ? 0.10 : 0.30,
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
  // big rooftop billboards: a different, poster-shaped texture per advert
  const billboardTextures = [];
  for (let i = 0; i < BILLBOARD_ADS.length; i++) {
    const [title, sub, hue] = BILLBOARD_ADS[i];
    billboardTextures.push(billboardTexture(rng, title, sub, hue));
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

  /** Add a single building: 1-3 stacked tiers, roof clutter, optional neon/shop sign. */
  const addBuilding = (x, z, w, d, h, district) => {
    const style = pickStyle(district);
    const palette = STYLE_COLOURS[style];
    // per-instance tint variation, so no two neighbours are the same flat colour
    const tint = rng.pick(palette);
    const bucket = styleBuckets.get(style);

    // ---- tiers: tall lots get a genuine setback cascade (podium, shaft, crown) ----
    const tiers = [];
    const tall = district === 'downtown' || h > 34;
    const tierCount = tall ? (rng.chance(0.55) ? 3 : 2) : (h > 20 && rng.chance(0.4) ? 2 : 1);
    let cursorH = 0;
    let tw = w;
    let td = d;
    let tx = x;
    let tz = z;
    for (let i = 0; i < tierCount; i++) {
      const last = i === tierCount - 1;
      const segH = last ? h - cursorH : (h - cursorH) * rng.range(0.42, 0.68);
      if (segH < 2.2) break;
      tiers.push({ w: tw, d: td, x: tx, z: tz, y0: cursorH, h: segH });
      cursorH += segH;
      // step in for the next tier: a real setback on at least two sides
      const sIn = rng.range(0.72, 0.9);
      tw = Math.max(6, tw * sIn);
      td = Math.max(6, td * sIn);
      tx = x + rng.range(-1, 1) * (w - tw) * 0.35;
      tz = z + rng.range(-1, 1) * (d - td) * 0.35;
    }

    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      bucket.push(tintGeometry(wallGeometry(t.w, t.h, t.d, t.x, t.y0 === 0 ? 0 : 0, t.z, FACADE_TILE.w, FACADE_TILE.h), tint));
      // note: wallGeometry builds from y=0, so a raised tier is lifted afterwards
      if (t.y0 > 0) {
        const g = bucket[bucket.length - 1];
        g.translate(0, t.y0, 0);
      }
      roofParts.push(tintGeometry(roofGeometry(t.w, t.d, t.y0 + t.h, t.x, t.z, 0x2a2a2a), 0x3a352e));

      // string course: a projecting ledge at every tier junction — pure silhouette detail
      if (i < tiers.length - 1) {
        const ly = t.y0 + t.h;
        const lt = 0.42;
        const overhang = 0.5;
        roofParts.push(tintGeometry(boxGeometry(t.w + overhang, lt, t.d + overhang, t.x, ly - lt / 2, t.z), 0x8f7f68));
      }
    }

    // ---- vertical deco ribs on the street faces of taller buildings ----
    if (h > 18 && (style === 'deco' || style === 'cream' || style === 'glass') && rng.chance(0.75)) {
      const ribs = Math.max(3, Math.floor(w / 3.4));
      const ribCol = style === 'glass' ? 0x40596e : 0xd8c6ab;
      for (let r = 0; r < ribs; r++) {
        const rx = x - w / 2 + (w / ribs) * (r + 0.5);
        const rh = Math.min(h * 0.92, h - 1.5);
        for (const face of [-1, 1]) {
          roofParts.push(tintGeometry(
            boxGeometry(0.34, rh, 0.34, rx, rh / 2, z + face * (d / 2 + 0.16)), ribCol,
          ));
        }
      }
    }

    // ---- rooftop clutter: AC plant, stair hut, water tank, antennas, billboard ----
    const topH = tiers.length ? tiers[tiers.length - 1].y0 + tiers[tiers.length - 1].h : h;
    const topW = tiers.length ? tiers[tiers.length - 1].w : w;
    const topD = tiers.length ? tiers[tiers.length - 1].d : d;
    const topX = tiers.length ? tiers[tiers.length - 1].x : x;
    const topZ = tiers.length ? tiers[tiers.length - 1].z : z;

    const clutter = rng.int(2, 5);
    for (let i = 0; i < clutter; i++) {
      const cw = rng.range(1.2, 4.4);
      const cd = rng.range(1.2, 4.4);
      const cx = topX + rng.range(-topW * 0.34, topW * 0.34);
      const cz = topZ + rng.range(-topD * 0.34, topD * 0.34);
      const ch = rng.range(0.5, 2.4);
      roofParts.push(tintGeometry(boxGeometry(cw, ch, cd, cx, topH + ch / 2, cz), rng.chance(0.5) ? 0x5b564c : 0x484339));
      // fan housing on some of them
      if (rng.chance(0.4)) {
        roofParts.push(tintGeometry(boxGeometry(cw * 0.6, 0.3, cd * 0.6, cx, topH + ch + 0.15, cz), 0x2e2c28));
      }
    }

    // stair hut, a boxy silhouette that breaks the roofline
    if (rng.chance(0.6)) {
      const hw2 = rng.range(2.2, Math.max(2.4, topW * 0.3));
      const hd2 = rng.range(2.2, Math.max(2.4, topD * 0.3));
      roofParts.push(tintGeometry(
        boxGeometry(hw2, rng.range(2.4, 3.6), hd2, topX + rng.range(-topW * 0.2, topW * 0.2), topH + 1.6, topZ + rng.range(-topD * 0.2, topD * 0.2)),
        0x6a6255,
      ));
    }

    // classic rooftop water tank on a steel frame — the strongest skyline silhouette
    if (h > 14 && rng.chance(topW > 12 ? 0.5 : 0.22)) {
      const tankR = rng.range(1.1, 1.9);
      const tankH = rng.range(2.2, 3.6);
      const tankX = topX + rng.range(-topW * 0.26, topW * 0.26);
      const tankZ = topZ + rng.range(-topD * 0.26, topD * 0.26);
      const legH = rng.range(1.6, 3.0);
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        roofParts.push(tintGeometry(
          boxGeometry(0.16, legH, 0.16, tankX + ox * tankR * 0.62, topH + legH / 2, tankZ + oz * tankR * 0.62),
          0x3c3a35,
        ));
      }
      const tank = new THREE.CylinderGeometry(tankR, tankR, tankH, 10, 1);
      tank.translate(tankX, topH + legH + tankH / 2, tankZ);
      roofParts.push(tintGeometry(tank, rng.chance(0.5) ? 0x8a7a63 : 0x6f6455));
      const cap = new THREE.ConeGeometry(tankR * 1.06, tankR * 0.7, 10);
      cap.translate(tankX, topH + legH + tankH + tankR * 0.35, tankZ);
      roofParts.push(tintGeometry(cap, 0x4a4640));
    }

    // antenna mast / comms array
    if (h > 40 || rng.chance(0.3)) {
      const mastH = rng.range(5, 15);
      antennaParts.push(tintGeometry(boxGeometry(0.2, mastH, 0.2, topX, topH + mastH / 2, topZ), 0x8b8b8b));
      const bars = rng.int(1, 3);
      for (let b = 0; b < bars; b++) {
        const by = topH + mastH * (0.45 + b * 0.2);
        antennaParts.push(tintGeometry(boxGeometry(2.6 - b * 0.5, 0.14, 0.14, topX, by, topZ), 0x9a9a9a));
      }
    }

    // ---- billboard on the roof of mid-rise blocks: big, readable, adds colour ----
    if (h > 10 && h < 62 && topW > 13 && rng.chance(district === 'ocean' ? 0.34 : 0.18)) {
      const bw = Math.min(topW * 0.68, 12);
      const bh = bw * 0.42;
      const bX = topX;
      const bZ = topZ - topD / 2 - 0.5;
      const bY = topH + bh / 2 + 1.6;
      // frame legs
      for (const ox of [-bw * 0.32, bw * 0.32]) {
        roofParts.push(tintGeometry(boxGeometry(0.18, 1.8 + bh, 0.18, bX + ox, topH + (1.8 + bh) / 2, bZ), 0x4a4a4a));
      }
      const board = new THREE.PlaneGeometry(bw, bh);
      board.rotateY(Math.PI);
      board.translate(bX, bY, bZ - 0.12);
      const tex = rng.pick(billboardTextures);
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
      if (!signGroups.has(tex)) signGroups.set(tex, { mat, geoms: [] });
      signGroups.get(tex).geoms.push(board);
      // the board's back panel, so it is not a paper-thin silhouette from behind
      roofParts.push(tintGeometry(boxGeometry(bw, bh, 0.16, bX, bY, bZ), 0x33312c));
    }

    // ---- storefront band at street level: glowing sign + awning + lit shop glass ----
    const facingWest = x < 179;
    const sides = [];
    if (facingWest) sides.push({ axis: 'x', sign: -1 });     // faces the avenue to the west
    sides.push({ axis: 'z', sign: rng.chance(0.5) ? 1 : -1 });
    for (const side of sides) {
      if (!rng.chance(district === 'ocean' ? 0.85 : district === 'downtown' ? 0.3 : 0.55)) continue;
      const along = side.axis === 'x' ? d : w;
      const sw = Math.min(along * 0.82, 15);
      const sh = 1.6;
      let sx = x, sz = z, rot = 0;
      if (side.axis === 'z') {
        sz = z + side.sign * (d / 2 + 0.07);
        rot = side.sign > 0 ? 0 : Math.PI;
      } else {
        sx = x + side.sign * (w / 2 + 0.07);
        rot = side.sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      const shopTex = rng.pick(shopTextures);
      const mat = new THREE.MeshBasicMaterial({ map: shopTex, toneMapped: false });
      const g = new THREE.PlaneGeometry(sw, sh);
      g.rotateY(rot);
      g.translate(sx, 3.6, sz);
      if (!signGroups.has(shopTex)) signGroups.set(shopTex, { mat, geoms: [] });
      signGroups.get(shopTex).geoms.push(g);

      // awning: a coloured slab projecting over the pavement, with a valance
      const aw = rng.pick([0xff4f6e, 0x1fc9be, 0xffc23a, 0xf6f1e2, 0xe0632f]);
      const outX = side.axis === 'x' ? side.sign * 1.1 : 0;
      const outZ = side.axis === 'z' ? side.sign * 1.1 : 0;
      awningParts.push(tintGeometry(
        boxGeometry(side.axis === 'x' ? 2.2 : sw, 0.22, side.axis === 'x' ? sw : 2.2,
          sx + outX, 2.95, sz + outZ), aw,
      ));
      awningParts.push(tintGeometry(
        boxGeometry(side.axis === 'x' ? 0.16 : sw, 0.5, side.axis === 'x' ? sw : 0.16,
          sx + outX * 2.05, 2.6, sz + outZ * 2.05), aw,
      ));
      // shop glazing: a warm lit window under the awning
      const glassG = new THREE.PlaneGeometry(sw * 0.94, 2.2);
      glassG.rotateY(rot);
      glassG.translate(sx + outX * 0.06, 1.4, sz + outZ * 0.06);
      windowParts.push(tintGeometry(glassG, rng.pick([0xffcf8f, 0xffb968, 0xffd9a8, 0xffa95c])));
    }

    // ---- vertical neon blade sign on a corner ----
    if (h > 12 && rng.chance(district === 'ocean' ? 0.6 : 0.32)) {
      const tex = rng.pick(signTextures);
      const faceX = rng.chance(0.5) ? x + w / 2 + 0.9 : x - w / 2 - 0.9;
      const faceZ = rng.chance(0.5) ? z + d / 2 : z - d / 2 + rng.range(-d * 0.3, d * 0.3);
      const g = new THREE.PlaneGeometry(1.5, 7);
      g.translate(faceX, Math.min(h - 3.5, rng.range(8, 18)), faceZ);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
      if (!signGroups.has(tex)) signGroups.set(tex, { mat, geoms: [] });
      signGroups.get(tex).geoms.push(g);
      // the blade's mounting arm, so it reads as attached
      awningParts.push(tintGeometry(boxGeometry(1.1, 0.1, 0.1, faceX + (faceX > x ? -0.5 : 0.5), Math.min(h - 3.5, rng.range(8, 18)) + 3.2, faceZ), 0x2a2a2a));
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

  // lit shopfront glass: emissive so the street level glows at golden hour
  if (windowParts.length) {
    const lit = new THREE.Mesh(mergeGeometries(windowParts), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.35, metalness: 0.1,
      emissive: 0xffb96a, emissiveIntensity: 0.85, side: THREE.DoubleSide,
    }));
    lit.name = 'shop-glass';
    group.add(lit);
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