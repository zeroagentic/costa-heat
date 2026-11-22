// Pedestrians: crowds walking the pavements and the beach. They wander between waypoints,
// stop at kerbs, and switch to a panic state (run away from gunfire, speeding cars and
// cops) when violence or a wanted level appears nearby.
import * as THREE from 'three';
import { buildCharacter, animateCharacter } from './characters.js';
import { CITY, ROAD, GRID, clamp, damp, dampAngle, angleDelta, groundHeightAt, isRoadAt } from './config.js';

export const PED_COUNT = 64;

/** A walkable point: pavement or beach, never asphalt and never inside a building. */
function randomWalkable(rng, city, nearX = null, nearZ = null, radius = 0) {
  const local = nearX !== null && nearZ !== null && radius > 0;
  for (let i = 0; i < 40; i++) {
    let x, z;
    if (local) {
      x = nearX + rng.range(-radius, radius);
      z = nearZ + rng.range(-radius, radius);
    } else {
      x = rng.range(GRID.xs[0] - 6, CITY.landMaxX + 26);
      z = rng.range(GRID.zs[0] - 6, GRID.zs[GRID.zs.length - 1] + 6);
    }
    if (x > CITY.landMaxX + 30) continue;
    if (isRoadAt(x, z)) continue;
    if (!withinPlay(x, z)) continue;
    if (city && city.isInsideBuilding(x, 1, z)) continue;
    return { x, z };
  }
  return { x: CITY.landMaxX - 8, z: 100 };
}

function withinPlay(x, z) {
  return x > GRID.xs[0] - 6 && x < CITY.landMaxX + 26 && z > GRID.zs[0] - 6 && z < GRID.zs[GRID.zs.length - 1] + 6;
}

export class Pedestrian {
  constructor(scene, city, rng, spawn) {
    const flee = rng.chance(0.06);
    const { root, joints } = buildCharacter(rng, {
      shirt: flee ? 0xff5aa0 : undefined,
      hair: rng.pick([0x1b1512, 0x3a2a1a, 0x6a4a2a, 0xdedede]),
      shades: rng.chance(0.3),
    });
    this.model = root;
    this.joints = joints;
    this.model.name = 'pedestrian';
    scene.add(root);

    this.city = city;
    this.rng = rng;
    this.position = new THREE.Vector3(spawn.x, groundHeightAt(spawn.x, spawn.z), spawn.z);
    this.yaw = rng.range(0, Math.PI * 2);
    this.targetYaw = this.yaw;
    this.speed = 0;
    this.walkSpeed = rng.range(1.15, 1.65);
    this.phase = rng.range(0, 6.28);
    this.state = 'walk';
    this.panic = 0;
    this.panicDir = new THREE.Vector3();
    this.target = randomWalkable(rng, city, spawn.x, spawn.z, 45);
    this.waitTimer = 0;
    this.health = 100;
    this.alive = true;
    this.radius = 0.4;
    this.deadTimer = 0;
    this.downed = false;
    this.strideDistance = 0;
    this.stepSide = 0;
    this.shirt = rng.pick([0xff5f8a, 0x2ad1c9, 0xffd166, 0xf2f6ff, 0x6a5acd, 0xff8c42]);
    this.weaponHolder = false;
    this.model.rotation.y = this.yaw;
  }

  /** Switch to panic: run from the source point for a while. */
  panicFrom(x, z, seconds = 8) {
    if (!this.alive) return;
    this.panic = Math.max(this.panic, seconds);
    const dx = this.position.x - x;
    const dz = this.position.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.panicDir.set(dx / d, 0, dz / d);
    this.state = 'flee';
    this.target = randomWalkable(this.rng, this.city, this.position.x + this.panicDir.x * 30, this.position.z + this.panicDir.z * 30, 40);
  }

  hit(amount, byPlayer, world) {
    if (!this.alive) return false;
    this.health -= amount;
    this.panicFrom(world.player.position.x, world.player.position.z, 12);
    if (this.health <= 0) {
      this.alive = false;
      this.state = 'dead';
      this.downed = true;
      this.deadTimer = 0;
      return true;
    }
    return false;
  }

  update(dt, world) {
    if (!this.alive) {
      this.deadTimer += dt;
      // collapse
      this.model.rotation.z = damp(this.model.rotation.z, Math.PI / 2, 7, dt);
      const g = groundHeightAt(this.position.x, this.position.z);
      this.position.y = damp(this.position.y, g + 0.12, 10, dt);
      this.model.position.set(this.position.x, this.position.y, this.position.z);
      return;
    }
    this.model.rotation.z = damp(this.model.rotation.z, 0, 8, dt);

    // while panicking, steer away from the player and run instead of idling
    if (this.panic > 0) {
      this.panic -= dt;
      this.state = 'flee';
      if (this.panic <= 0) this.state = 'walk';
    } else if (this.state === 'flee') {
      this.state = 'walk';
    }

    // distance from the player and the nearest threat
    const p = world.player.position;
    const distToPlayer = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    if (world.threatLevel > 0 && distToPlayer < 26 && this.panic <= 0) {
      if (world.rngPeds.chance(dt * 0.9)) this.panicFrom(p.x, p.z, 5 + world.threatLevel * 1.5);
    }
    // a speeding car nearby scares them
    if (world.player.inVehicle && distToPlayer < 9 && Math.abs(world.player.inVehicle.speed) > 6) {
      this.panicFrom(p.x, p.z, 3.5);
    }

    let moveSpeed = 0;
    if (this.state === 'flee') {
      // run directly away from the threat, turning along the street when blocked
      const awayYaw = Math.atan2(-this.panicDir.x, -this.panicDir.z);
      this.targetYaw = awayYaw;
      moveSpeed = 4.2;
      this.panicRun = (this.panicRun ?? 0) + dt;
    } else if (this.state === 'walk') {
      if (this.waitTimer > 0) {
        // idling at a shop window or waiting to cross: stand still, then pick a new target
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) {
          this.target = randomWalkable(this.rng, this.city, this.position.x, this.position.z, 26);
          this.targetYaw = Math.atan2(-(this.target.x - this.position.x), -(this.target.z - this.position.z));
        }
        moveSpeed = 0;
      } else {
        const dx = this.target.x - this.position.x;
        const dz = this.target.z - this.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.6) {
          this.waitTimer = this.rng.range(0.3, 2.2);
          moveSpeed = 0;
        } else {
          this.targetYaw = Math.atan2(-dx, -dz);
          moveSpeed = this.walkSpeed;
        }
      }
    }

    // don't walk onto asphalt casually: probe a few headings and take the first that
    // stays off the road, so pedestrians follow the pavement instead of jittering
    this.yaw = dampAngle(this.yaw, this.targetYaw, this.state === 'flee' ? 9 : 4, dt);
    if (moveSpeed > 0 && this.state !== 'flee') {
      const look = 1.4;
      let chosen = null;
      for (const offset of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, Math.PI]) {
        const a = this.yaw + offset;
        const tx = this.position.x - Math.sin(a) * look;
        const tz = this.position.z - Math.cos(a) * look;
        if (!isRoadAt(tx, tz)) { chosen = a; break; }
      }
      if (chosen === null) {
        // boxed in: stand for a moment and pick a reachable target
        moveSpeed = 0;
        this.waitTimer = 0.5;
        this.target = randomWalkable(this.rng, this.city, this.position.x, this.position.z, 14);
      } else {
        this.yaw = chosen;
      }
    }
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let nx = this.position.x + fx * moveSpeed * dt;
    let nz = this.position.z + fz * moveSpeed * dt;
    if (nx > CITY.beachMaxX - 2) nx = CITY.beachMaxX - 2;
    const resolved = this.city.resolveCircle(nx, nz, this.radius, this.position.x, this.position.z);
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    // separation from other pedestrians (soft, cheap)
    for (const other of world.pedestrians.peds) {
      if (other === this || !other.alive) continue;
      const dx = this.position.x - other.position.x;
      const dz = this.position.z - other.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.62 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (0.8 - d) * 0.5;
        this.position.x += (dx / d) * push;
        this.position.z += (dz / d) * push;
      }
    }

    const g = groundHeightAt(this.position.x, this.position.z);
    this.position.y = damp(this.position.y, g, 14, dt);

    if (moveSpeed > 0.1) {
      this.phase += dt * (3.4 + moveSpeed * 1.5);
      this.strideDistance += moveSpeed * dt;
      if (this.strideDistance > 1.25) {
        this.strideDistance = 0;
        this.stepSide ^= 1;
        if (distToPlayer < 22) world.audio?.footstep(0.12, this.position, this.stepSide);
      }
    } else {
      this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 5, dt);
    }
    animateCharacter(this.joints, this.phase, moveSpeed / 2.2, { flee: this.state === 'flee' });
    this.model.position.set(this.position.x, this.position.y, this.position.z);
    this.model.rotation.y = this.yaw;
  }
}

export class PedestrianCrowd {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
  }

  populate(count = PED_COUNT) {
    for (let i = 0; i < count; i++) {
      // cluster near the beach promenade so the crowd reads on screen
      const beach = i % 3 !== 0;
      let spawn;
      for (let tries = 0; tries < 12; tries++) {
        spawn = beach
          ? randomWalkable(this.rng, this.city, this.rng.range(120, CITY.landMaxX + 22), this.rng.range(-260, 320), 40)
          : randomWalkable(this.rng, this.city);
        if (!isRoadAt(spawn.x, spawn.z)) break;
      }
      this.peds.push(new Pedestrian(this.scene, this.city, this.rng, spawn));
    }
  }

  update(dt, world) {
    const cam = world.camera?.position ?? world.player.position;
    for (const p of this.peds) {
      if (!p.alive) continue;
      // distance LOD: hide far-away bodies (they still simulate), drop shadows sooner
      const d = Math.hypot(p.position.x - cam.x, p.position.z - cam.z);
      const visible = d < 160;
      if (p.model.visible !== visible) {
        p.model.visible = visible;
      }
      if (visible && p._shadowLod !== (d < 40)) {
        p._shadowLod = d < 40;
        p.model.traverse((o) => { if (o.isMesh) o.castShadow = p._shadowLod; });
      }
      p.update(dt, world);
    }
  }

  /** Panic every pedestrian within radius of a point. */
  panicNear(x, z, radius, seconds) {
    for (const p of this.peds) {
      if (!p.alive) continue;
      if (Math.hypot(p.position.x - x, p.position.z - z) < radius) p.panicFrom(x, z, seconds);
    }
  }

  nearest(x, z, maxDist = 60) {
    let best = null;
    let bd = maxDist * maxDist;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const d = (p.position.x - x) ** 2 + (p.position.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}