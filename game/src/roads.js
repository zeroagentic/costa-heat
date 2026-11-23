// The road network: asphalt, pavements, lane markings, crosswalks and the lane graph
// that AI traffic, police and the mission planner all navigate.
import * as THREE from 'three';
import { GRID, ROAD, CITY, isRoadAt, groundHeightAt } from './config.js';
import { mergeGeometries, quadGeometry, boxGeometry } from './geometry-utils.js';
import { asphaltTexture, pavementTexture, crosswalkTexture } from './textures.js';

export const LANE = 4.4;              // lane centre offset from the road centre line
export const ROAD_TOP = 0.02;         // asphalt sits just above the terrain plane

const XS = GRID.xs;
const ZS = GRID.zs;

/** Range of the drivable/playable grid in world units. */
export const BOUNDS = {
  minX: XS[0] - ROAD.halfWidth - ROAD.sidewalk,
  maxX: CITY.landMaxX,
  minZ: ZS[0] - ROAD.halfWidth - ROAD.sidewalk,
  maxZ: ZS[ZS.length - 1] + ROAD.halfWidth + ROAD.sidewalk,
};

/**
 * Build all static road geometry and return { group, roadTexture }.
 * Everything merges into a handful of draw calls.
 */
export function buildRoadNetwork(rng) {
  const group = new THREE.Group();
  group.name = 'roads';

  // ---- asphalt slabs: one per road, split at intersections so junctions stay clean ----
  const asphaltParts = [];
  const markParts = [];
  const curbParts = [];
  const pavementParts = [];
  const crossParts = [];

  const pushAsphaltStrip = (x0, z0, x1, z1) => {
    const w = x1 - x0, d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(x0 + w / 2, ROAD_TOP, z0 + d / 2);
    // UVs are laid out in world metres, then divided by the tile size. Because the divisor
    // is a fixed 18, one pass of the asphalt texture always covers 18 m of road no matter how
    // wide or long the strip is: a six-lane avenue and a two-lane side street both get the
    // same size of aggregate and the same spacing of tar seams, so a lane marking painted
    // across them is the same width in the world either way. Stretching the texture to fit
    // the strip instead (the default UVs) would squeeze the grain on narrow roads and blow
    // it up on wide ones, and the markings would appear to change scale as you drive around.
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / 18, (z0 + uv.getY(i) * d) / 18);
    asphaltParts.push(g);
  };

  // horizontal roads (run east-west, at every z grid line)
  const xStart = XS[0] - ROAD.halfWidth;
  const xEnd = CITY.landMaxX + 0.5;
  for (const z of ZS) {
    pushAsphaltStrip(xStart, z - ROAD.halfWidth, xEnd, z + ROAD.halfWidth);
  }
  // vertical roads (run north-south)
  for (const x of XS) {
    pushAsphaltStrip(x - ROAD.halfWidth, ZS[0] - ROAD.halfWidth, x + ROAD.halfWidth, ZS[ZS.length - 1] + ROAD.halfWidth);
  }

  // ---- lane markings (dashed white) on every road, stopping short of junctions ----
  // Dash and gap are in metres along the road: 3.2 m of paint then 4.2 m of asphalt gives a
  // rhythm that still reads as broken lines from the chase camera at speed. markY lifts the
  // paint a hair over the asphalt so it never z-fights with the surface under it.
  const dashLen = 3.2, gap = 4.2, markY = ROAD_TOP + 0.012;
  const markGeom = (x, z, w, d) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, markY, z);
    return g;
  };
  // centre double-yellow on horizontal roads
  for (const z of ZS) {
    for (let x = xStart + 12; x < xEnd - 12; x += dashLen + gap) {
      if (XS.some((rx) => Math.abs(x - rx) < ROAD.halfWidth + 5)) continue;
      markParts.push(markGeom(x + dashLen / 2, z - 0.22, dashLen, 0.16));
      markParts.push(markGeom(x + dashLen / 2, z + 0.22, dashLen, 0.16));
    }
  }
  for (const x of XS) {
    for (let z = ZS[0] + 12; z < ZS[ZS.length - 1] - 12; z += dashLen + gap) {
      if (ZS.some((rz) => Math.abs(z - rz) < ROAD.halfWidth + 5)) continue;
      markParts.push(markGeom(x - 0.22, z + dashLen / 2, 0.16, dashLen));
      markParts.push(markGeom(x + 0.22, z + dashLen / 2, 0.16, dashLen));
    }
  }

  // ---- raised kerbs along every block edge, and pavements in the block collar ----
  const K = ROAD.curbHeight;
  const curb = 0.34;
  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const bx0 = XS[i] + ROAD.halfWidth;
      const bx1 = XS[i + 1] - ROAD.halfWidth;
      const bz0 = ZS[j] + ROAD.halfWidth;
      const bz1 = ZS[j + 1] - ROAD.halfWidth;
      const w = bx1 - bx0;
      const d = bz1 - bz0;
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      // pavement slab (whole block; buildings sit on top of it)
      const pg = new THREE.PlaneGeometry(w, d);
      pg.rotateX(-Math.PI / 2);
      pg.translate(cx, K, cz);
      const uv = pg.getAttribute('uv');
      // paving slabs tile every 4 m, tighter than the asphalt's 18 m: a pavement is read at
      // walking distance, so the joints have to be dense enough to show scale underfoot.
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (bx0 + uv.getX(k) * w) / 4, (bz0 + uv.getY(k) * d) / 4);
      pavementParts.push(pg);
      // kerb ring
      curbParts.push(boxGeometry(w, K + 0.14, curb, cx, (K + 0.14) / 2 - 0.07, bz0 + curb / 2));
      curbParts.push(boxGeometry(w, K + 0.14, curb, cx, (K + 0.14) / 2 - 0.07, bz1 - curb / 2));
      curbParts.push(boxGeometry(curb, K + 0.14, d, bx0 + curb / 2, (K + 0.14) / 2 - 0.07, cz));
      curbParts.push(boxGeometry(curb, K + 0.14, d, bx1 - curb / 2, (K + 0.14) / 2 - 0.07, cz));
      // crosswalk cards on the four road approaches
      const cwY = ROAD_TOP + 0.016;
      for (const [side, px, pz, ww, dd] of [
        ['w', bx0 - ROAD.halfWidth / 2 - 1, cz, ROAD.halfWidth * 0.8, Math.min(4.2, d * 0.4)],
        ['e', bx1 + ROAD.halfWidth / 2 + 1, cz, ROAD.halfWidth * 0.8, Math.min(4.2, d * 0.4)],
        ['n', cx, bz0 - ROAD.halfWidth / 2 - 1, Math.min(4.2, w * 0.4), ROAD.halfWidth * 0.8],
        ['s', cx, bz1 + ROAD.halfWidth / 2 + 1, Math.min(4.2, w * 0.4), ROAD.halfWidth * 0.8],
      ]) {
        const cg = new THREE.PlaneGeometry(ww, dd);
        cg.rotateX(-Math.PI / 2);
        if (side === 'w' || side === 'e') cg.rotateY(0);
        cg.translate(px, cwY, pz);
        const cuv = cg.getAttribute('uv');
        // 1.2 m per stripe tile, with u and v swapped on the east/west approaches so the
        // bars always run across the direction of travel rather than along it.
        for (let k = 0; k < cuv.count; k++) {
          const rotate = side === 'w' || side === 'e';
          const u = cuv.getX(k), v = cuv.getY(k);
          cuv.setXY(k, rotate ? u * ww / 1.2 : v * dd / 1.2, rotate ? v * dd / 1.2 : u * ww / 1.2);
        }
        crossParts.push(cg);
      }
    }
  }

  const roadTex = asphaltTexture(rng);
  // Asphalt is a matte dielectric. Roughness close to 1 scatters the incoming light in every
  // direction, so the surface shows almost no sharp reflection of the sky, and metalness 0
  // keeps it from behaving like a conductor with a coloured specular. Whatever warmth it
  // appears to have therefore comes from the light falling on it — the low sun and the fog —
  // rather than from a sheen of its own, which is exactly how a real road behaves at dusk.
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.94, metalness: 0.0, color: 0xffffff });
  const roads = new THREE.Mesh(mergeGeometries(asphaltParts), roadMat);
  roads.receiveShadow = true;
  roads.name = 'asphalt';
  group.add(roads);

  const paintMat = new THREE.MeshStandardMaterial({ color: 0xf2efe2, roughness: 0.72, emissive: 0x1a1712, emissiveIntensity: 0.3 });
  const paint = new THREE.Mesh(mergeGeometries(markParts), paintMat);
  paint.name = 'lane-paint';
  paint.receiveShadow = true;
  group.add(paint);

  const paveTex = pavementTexture(rng);
  const paveMat = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.88, metalness: 0.0 });
  const pavements = new THREE.Mesh(mergeGeometries(pavementParts), paveMat);
  pavements.name = 'pavement';
  pavements.receiveShadow = true;
  group.add(pavements);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c6, roughness: 0.8 });
  const curbs = new THREE.Mesh(mergeGeometries(curbParts), curbMat);
  curbs.name = 'kerb';
  curbs.castShadow = false;
  curbs.receiveShadow = true;
  group.add(curbs);

  const crossTex = crosswalkTexture();
  crossTex.repeat.set(1, 1);
  const crossMat = new THREE.MeshStandardMaterial({ map: crossTex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const crosswalks = new THREE.Mesh(mergeGeometries(crossParts), crossMat);
  crosswalks.name = 'crosswalk';
  crosswalks.receiveShadow = true;
  group.add(crosswalks);

  return { group, laneGraph: buildLaneGraph() };
}

/**
 * Lane graph on the road grid. Each road has two lanes per direction; nodes sit at
 * intersections with an incoming/outgoing lane offset so cars turn in a realistic arc.
 */
export function buildLaneGraph() {
  const nodes = [];
  const edges = [];
  for (let xi = 0; xi < XS.length; xi++) {
    for (let zi = 0; zi < ZS.length; zi++) {
      nodes.push({ id: nodes.length, x: XS[xi], z: ZS[zi], xi, zi });
    }
  }
  const idOf = (xi, zi) => nodes[xi * ZS.length + zi].id;
  // directed edges between neighbouring intersections, offset to the right-hand lane
  for (let xi = 0; xi < XS.length; xi++) {
    for (let zi = 0; zi < ZS.length; zi++) {
      const neighbours = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
      ];
      for (const [dx, dz] of neighbours) {
        const nx = xi + dx, nz = zi + dz;
        if (nx < 0 || nz < 0 || nx >= XS.length || nz >= ZS.length) continue;
        // right-hand traffic: a car heading +x keeps to z+L; heading -x keeps to z-L, etc.
        const ox = dz !== 0 ? LANE : 0;
        const oz = dx !== 0 ? -LANE : 0;
        edges.push({
          id: edges.length,
          from: idOf(xi, zi),
          to: idOf(nx, nz),
          x0: XS[xi] + ox, z0: ZS[zi] + oz,
          x1: XS[nx] + ox, z1: ZS[nz] + oz,
        });
      }
    }
  }
  return { nodes, edges };
}

/** Direction of travel for a graph edge, as a yaw in radians (0 = +Z). */
export const edgeYaw = (e) => Math.atan2(e.x1 - e.x0, e.z1 - e.z0);
export const edgeLength = (e) => Math.hypot(e.x1 - e.x0, e.z1 - e.z0);

/** Random point in a lane, useful for spawning traffic and roadblocks. */
export function randomLanePoint(rng, graph, { minX = BOUNDS.minX, maxX = BOUNDS.maxX, minZ = BOUNDS.minZ, maxZ = BOUNDS.maxZ } = {}) {
  for (let tries = 0; tries < 40; tries++) {
    const e = rng.pick(graph.edges);
    const t = rng.next();
    const x = e.x0 + (e.x1 - e.x0) * t;
    const z = e.z0 + (e.z1 - e.z0) * t;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    return { x, z, yaw: edgeYaw(e), edge: e };
  }
  const e = graph.edges[0];
  return { x: e.x0, z: e.z0, yaw: edgeYaw(e), edge: e };
}

/** True when a point is on asphalt (used for traffic spawning and shot cameras). */
export const onRoad = isRoadAt;
export { groundHeightAt };

/** The nearest lane edge to a world point, for spawning a cop car onto the grid. */
export function nearestEdge(graph, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const e of graph.edges) {
    const dx = e.x1 - e.x0, dz = e.z1 - e.z0;
    const len2 = dx * dx + dz * dz;
    let t = ((x - e.x0) * dx + (z - e.z0) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = e.x0 + dx * t, pz = e.z0 + dz * t;
    const d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < bestD) { bestD = d; best = { edge: e, t, x: px, z: pz }; }
  }
  return best;
}

/** Follow an edge to its end and pick the next edge that best continues the direction. */
export function nextEdge(graph, current, heading) {
  const candidates = graph.edges.filter((e) => e.from === current.to);
  if (!candidates.length) return null;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const e of candidates) {
    const yaw = edgeYaw(e);
    let d = yaw - heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    // prefer straight, then gentle turns; U-turns only if nothing else
    const score = Math.cos(d) * 2 - Math.abs(d) + (Math.abs(d) > 2.2 ? -3 : 0);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}