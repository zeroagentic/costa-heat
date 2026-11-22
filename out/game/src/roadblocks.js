// Roadblocks: at five stars the VCPD throws a barrier across the avenue ahead of the
// player. Each block is REAL geometry — a pair of parked cruisers angled across the lane,
// a striped steel barrier between them, cones and two officers behind it — and it is
// registered with the city's collider list so a car that hits it crumples instead of
// driving through. Blocks spawn ahead of the player's heading on the lane graph, expire
// after a while, and are cleaned up when the chase ends.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { buildCharacter, animateCharacter } from './characters.js';
import { nearestEdge, edgeYaw } from './roads.js';
import { clamp, damp, dampAngle, dist } from './config.js';
import { mergeGeometries, boxGeometry } from './geometry-utils.js';

const BLOCK_LIFETIME = 42;          // seconds before a block is towed away
const SPAWN_AHEAD_MIN = 55;         // metres in front of the player
const SPAWN_AHEAD_MAX = 130;
const MAX_BLOCKS = 3;

/** The striped steel barrier: a beam plus two trestles, with red/white hazard paint. */
function buildBarrier(width = 15.6) {
  const group = new THREE.Group();
  group.name = 'roadblock-barrier';

  const parts = [];
  // the beam, in alternating red/white panels so it reads at distance
  const panels = 10;
  const pw = width / panels;
  for (let i = 0; i < panels; i++) {
    parts.push(boxGeometry(pw, 0.6, 0.16, -width / 2 + pw * (i + 0.5), 1.02, 0, i % 2 ? 0xf2f2ee : 0xd61f36));
  }
  // a second lower rail and the trestle legs
  parts.push(boxGeometry(width, 0.12, 0.12, 0, 0.45, 0, 0x9aa0a6));
  for (const s of [-1, 1]) {
    parts.push(boxGeometry(0.14, 1.25, 0.5, s * (width / 2 - 0.3), 0.62, 0, 0x6b7378));
  }
  parts.push(boxGeometry(0.14, 1.25, 0.5, 0, 0.62, 0, 0x6b7378));
  // two amber beacons on top
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  const beam = new THREE.Mesh(mergeGeometries(parts), mat);
  beam.castShadow = true;
  beam.receiveShadow = true;
  group.add(beam);

  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff8a00, emissiveIntensity: 2.6, toneMapped: false });
  const beacons = [];
  for (const s of [-0.32, 0.32]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), beaconMat);
    b.position.set(s * width, 1.4, 0);
    group.add(b);
    beacons.push(b);
  }
  group.userData.beacons = beacons;
  return group;
}

/** Traffic cones in a taper leading into the barrier. */
function buildCones() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const s = i % 2 ? -1 : 1;
    const x = s * (2.2 + i * 0.55);
    const z = -2 - i * 1.7;
    parts.push(boxGeometry(0.4, 0.06, 0.4, x, 0.03, z, 0x24262a));
    parts.push(boxGeometry(0.24, 0.62, 0.24, x, 0.34, z, 0xff6a1a));
    parts.push(boxGeometry(0.27, 0.12, 0.27, x, 0.4, z, 0xf4f4f0));
  }
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  m.castShadow = true;
  m.name = 'roadblock-cones';
  return m;
}

/** One roadblock: geometry, colliders and the officers standing behind it. */
export class RoadBlock {
  constructor(scene, city, x, z, yaw) {
    this.scene = scene;
    this.city = city;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.life = BLOCK_LIFETIME;
    this.dead = false;
    this.hits = 0;

    this.group = new THREE.Group();
    this.group.name = 'roadblock';
    const ground = city.groundAt(x, z);
    this.group.position.set(x, ground, z);
    this.group.rotation.y = yaw;
    scene.add(this.group);

    // the barrier across the road, with a gap on the far lane so it is a choice, not a wall
    const barrier = buildBarrier(15.6);
    barrier.position.set(-3.2, 0, 0);
    this.group.add(barrier);

    // two cruisers angled inward, nose-to-nose, headlights on
    this.cars = [];
    for (const [sx, sz, syaw] of [[-7.6, 1.2, yaw + 0.42], [6.4, -1.4, yaw - 0.5]]) {
      const v = new Vehicle(scene, 'police', { isPolice: true, name: 'roadblock-cruiser' });
      v.attachCity(city);
      v.driver = 'police';
      v.health = 260;
      v.sirenOn = true;
      v.place(x + Math.cos(yaw) * sx + Math.sin(yaw) * sz, z - Math.sin(yaw) * sx + Math.cos(yaw) * sz, syaw);
      v.engineOn = true;
      v.syncModel();
      this.cars.push(v);
    }

    // cones tapering off the barrier
    const cones = buildCones();
    this.group.add(cones);

    // officers standing behind the barrier, guns up
    this.officers = [];
    for (const [ox, oz] of [[-5.2, 2.6], [2.4, 3.4]]) {
      const { root, joints } = buildCharacter({ next: () => 0.4, pick: (a) => a[0] }, { uniform: true, skin: 0xe8bb95 });
      root.name = 'roadblock-officer';
      const wx = x + Math.cos(yaw) * ox + Math.sin(yaw) * oz;
      const wz = z - Math.sin(yaw) * ox + Math.cos(yaw) * oz;
      root.position.set(wx, ground, wz);
      root.rotation.y = yaw + Math.PI;
      scene.add(root);
      this.officers.push({ root, joints, phase: 0, x: wx, z: wz });
    }

    // real collision: the barrier body and both cruisers become city colliders
    this.colliders = [];
    const pushCollider = (cx, cz, halfW, halfL, cyaw, height, tag) => {
      // approximate the rotated box with an axis-aligned one wide enough to stop a car
      const c = Math.abs(Math.cos(cyaw));
      const s = Math.abs(Math.sin(cyaw));
      const ew = halfW * c + halfL * s;
      const el = halfW * s + halfL * c;
      const col = { x0: cx - ew, x1: cx + ew, z0: cz - el, z1: cz + el, h: height, roadblock: tag };
      this.colliders.push(col);
      city.colliders.push(col);
    };
    const bcx = x + Math.cos(yaw) * -3.2;
    const bcz = z - Math.sin(yaw) * -3.2;
    pushCollider(bcx, bcz, 7.8, 0.4, yaw, 1.5, this);
    for (const v of this.cars) pushCollider(v.position.x, v.position.z, 1.05, 2.5, v.yaw, 1.7, this);
  }

  /** Spark the beacons and wave the officers; called each step. */
  update(dt, world) {
    if (this.dead) return;
    this.life -= dt;
    const blink = Math.sin(world.time * 9 + this.x) > 0;
    this.group.userData.beacons?.forEach((b) => { b.visible = blink; });
    for (const v of this.cars) {
      v.sirenPhase = (v.sirenPhase + dt * 9) % (Math.PI * 2);
      v.syncModel();
    }
    for (const o of this.officers) {
      o.phase += dt * 2.2;
      // weapon up, scanning the road: a slow side-to-side sweep
      animateCharacter(o.joints, 0, 0, { aim: true, headTurn: Math.sin(o.phase) * 0.4 });
      o.joints.rightArm.rotation.x = -1.45 + Math.sin(o.phase * 1.6) * 0.08;
    }
    if (this.life <= 0) this.dispose(world);
  }

  /** A vehicle crashed into this block. */
  registerHit(vehicle) {
    this.hits++;
    return this;
  }

  dispose(world) {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    for (const v of this.cars) this.scene.remove(v.model);
    for (const o of this.officers) this.scene.remove(o.root);
    for (const c of this.colliders) {
      const i = this.city.colliders.indexOf(c);
      if (i >= 0) this.city.colliders.splice(i, 1);
    }
    this.colliders.length = 0;
  }
}

export class Roadblocks {
  constructor(scene, city, graph, rng) {
    this.scene = scene;
    this.city = city;
    this.graph = graph;
    this.rng = rng;
    this.blocks = [];
    this.spawnTimer = 1.2;
    this.spawnedThisChase = 0;
  }

  /** Called by the police system every step. Only 5 stars gets blocks. */
  update(dt, world) {
    const active = world.wanted.level >= 5;
    if (!active) {
      if (this.blocks.length) this.clear(world);
      this.spawnTimer = 1.2;
      this.spawnedThisChase = 0;
      return;
    }
    for (const b of this.blocks) b.update(dt, world);
    this.blocks = this.blocks.filter((b) => !b.dead);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.blocks.length < MAX_BLOCKS) {
      this.spawnTimer = 7.5;
      this.spawnAhead(world);
    }
    this._checkCollisions(world);
  }

  /** Put a block on the road ahead of the player, on their side of the street. */
  spawnAhead(world) {
    const p = world.player;
    const anchor = p.inVehicle ? p.inVehicle.position : p.position;
    const heading = p.inVehicle ? p.inVehicle.yaw : p.yaw;
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);

    // walk forward in steps and take the first point on a lane that is far enough away
    let best = null;
    for (let ahead = SPAWN_AHEAD_MAX; ahead >= SPAWN_AHEAD_MIN; ahead -= 8) {
      const tx = anchor.x + fx * ahead;
      const tz = anchor.z + fz * ahead;
      const near = nearestEdge(this.graph, tx, tz);
      if (!near) continue;
      const d = dist(near.x, near.z, anchor.x, anchor.z);
      if (d < SPAWN_AHEAD_MIN || d > SPAWN_AHEAD_MAX) continue;
      // must be far enough from existing blocks
      if (this.blocks.some((b) => dist(b.x, b.z, near.x, near.z) < 40)) continue;
      best = { x: near.x, z: near.z, yaw: edgeYaw(near.edge) + Math.PI / 2 };
      break;
    }
    // fall back: drop one on the current lane regardless of distance
    if (!best) {
      const near = nearestEdge(this.graph, anchor.x + fx * 70, anchor.z + fz * 70);
      if (near) best = { x: near.x, z: near.z, yaw: edgeYaw(near.edge) + Math.PI / 2 };
    }
    if (!best) return null;

    const block = new RoadBlock(this.scene, this.city, best.x, best.z, best.yaw);
    this.blocks.push(block);
    this.spawnedThisChase++;
    world.hud?.showToast('ROADBLOCK AHEAD');
    world.audio?.pickup?.();
    return block;
  }

  /** Cars that run a barrier take damage and lose speed; the block records the hit. */
  _checkCollisions(world) {
    for (const block of this.blocks) {
      for (const v of world.allVehicles()) {
        if (v.destroyed) continue;
        for (const c of block.colliders) {
          const nx = clamp(v.position.x, c.x0, c.x1);
          const nz = clamp(v.position.z, c.z0, c.z1);
          const d = Math.hypot(v.position.x - nx, v.position.z - nz);
          if (d < 1.5 && Math.abs(v.speed) > 5) {
            v.impact(Math.abs(v.speed) * 1.2);
            block.registerHit(v);
            world.rig.addShake(0.35);
            world.audio?.crash(0.8);
            if (v.isPlayerVehicle) world.onViolence?.(v.position.x, v.position.z, 'gun');
            break;
          }
        }
      }
    }
  }

  clear(world) {
    for (const b of this.blocks) b.dispose(world);
    this.blocks = [];
  }

  state() {
    return {
      count: this.blocks.length,
      positions: this.blocks.map((b) => ({ x: +b.x.toFixed(1), z: +b.z.toFixed(1), hits: b.hits })),
      colliders: this.city.colliders.filter((c) => c.roadblock).length,
    };
  }
}