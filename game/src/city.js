// The city assembler: builds the road network, buildings, props and terrain from one
// seeded RNG, then answers spatial queries (ground height, collision) for every actor.
import * as THREE from 'three';
import { GRID, ROAD, CITY, groundHeightAt, isPavementAt, withinCity } from './config.js';
import { buildRoadNetwork } from './roads.js';
import { buildBuildings } from './buildings.js';
import { buildProps } from './props.js';
import { buildTerrain } from './terrain.js';
import { streamRng } from './random.js';

export class City {
  constructor(seed) {
    this.seed = seed;
    this.colliders = [];
    this.palms = [];
    this.scene = new THREE.Scene();
    // Exponential fog is doing the colour grading for distance, and because it covers every
    // surface out to the horizon its tint is effectively the scene's clock. Warm it and the
    // whole city is late afternoon; cool it and the same geometry turns overcast. It is set
    // here to the same warm family as the sunset haze so receding streets dissolve into the
    // sky instead of into a grey wall. Density is the other half of the choice: light enough
    // that the far towers keep their edges and their silhouettes (a heavier value erases the
    // skyline the wide shots depend on), heavy enough that the near blocks and the far ones
    // sit at visibly different depths. It is what keeps distance readable rather than blank.
    this.scene.fog = new THREE.FogExp2(0xe8a878, 0.00092);
  }

  async build(progress = () => {}) {
    const rng = streamRng(this.seed, 'city');
    progress(0.1, 'Paving the streets');
    const roads = buildRoadNetwork(rng);
    this.roads = roads.group;
    this.laneGraph = roads.laneGraph;
    this.scene.add(roads.group);

    progress(0.35, 'Pouring concrete');
    const terrain = buildTerrain(rng, this.scene);
    this.terrain = terrain;

    progress(0.6, 'Raising the skyline');
    const buildings = buildBuildings(rng, this.scene);
    this.colliders.push(...buildings.colliders);

    progress(0.85, 'Planting palms');
    const props = buildProps(rng, this.scene, this.colliders);
    this.palms = props.palms;

    this.group = new THREE.Group();
    this.group.name = 'city';
    progress(1, 'Ready');
  }

  /** Ground height at a point, including kerbs and the beach slope. */
  groundAt(x, z) {
    return groundHeightAt(x, z);
  }

  /**
   * Push a circle out of every building footprint it overlaps. Returns the corrected
   * position; actors call it after they move.
   */
  resolveCircle(x, z, radius, previousX, previousZ) {
    let px = x, pz = z;
    for (const c of this.colliders) {
      const nx = px < c.x0 ? c.x0 : px > c.x1 ? c.x1 : px;
      const nz = pz < c.z0 ? c.z0 : pz > c.z1 ? c.z1 : pz;
      if (px > c.x0 && px < c.x1 && pz > c.z0 && pz < c.z1) {
        // inside: push out along the shallowest axis, favouring where we came from
        const dl = px - c.x0, dr = c.x1 - px, dn = pz - c.z0, ds = c.z1 - pz;
        const m = Math.min(dl, dr, dn, ds);
        if (m === dl) px = c.x0 - radius;
        else if (m === dr) px = c.x1 + radius;
        else if (m === dn) pz = c.z0 - radius;
        else pz = c.z1 + radius;
      } else {
        const dx = px - nx, dz = pz - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          px = nx + (dx / d) * radius;
          pz = nz + (dz / d) * radius;
        }
      }
    }
    // stay on land, inside the grid, and out of the sea
    px = Math.min(px, CITY.beachMaxX - 1);
    pz = Math.max(Math.min(pz, CITY.south + 20), CITY.north - 20);
    px = Math.max(px, GRID.xs[0] - ROAD.halfWidth - ROAD.sidewalk);
    return { x: px, z: pz };
  }

  /** True if a point is inside a building footprint (used by bullets and cameras). */
  isInsideBuilding(x, y, z) {
    if (y > 140) return false;
    for (const c of this.colliders) {
      if (y < c.h && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true;
    }
    return false;
  }

  /** Bounds of the buildable city, for HUD and camera framing. */
  staticBounds() {
    return {
      minX: GRID.xs[0] - ROAD.halfWidth - ROAD.sidewalk,
      maxX: CITY.landMaxX,
      minZ: GRID.zs[0] - ROAD.halfWidth - ROAD.sidewalk,
      maxZ: GRID.zs[GRID.zs.length - 1] + ROAD.halfWidth + ROAD.sidewalk,
    };
  }

  update(dt, elapsed, camera, playerPos) {
    this.terrain.update(dt, elapsed, camera, playerPos);
  }
}

export { isPavementAt, withinCity, groundHeightAt };