// Police response. Patrol cruisers spawn out of sight on road lanes and chase the player
// using simple seek steering. How many come, and whether officers deploy on foot, is
// read straight from the wanted system's RESPONSE table:
//
//   1 star   one cruiser rolls up and investigates (it does not ram, it watches)
//   2 stars  two cruisers pursue at full speed
//   3 stars  three cruisers, officers on foot, pistols from the windows
//   4 stars  four cruisers, more officers, helicopter (owned by helicopter.js)
//   5 stars  everything above plus roadblocks (owned by roadblocks.js)
//
// Arrest happens when an officer on foot stands next to a wanted player for a moment.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { buildCharacter, animateCharacter } from './characters.js';
import { randomLanePoint, nearestEdge } from './roads.js';
import { clamp, damp, dampAngle, angleDelta, groundHeightAt, isRoadAt } from './config.js';
import { RESPONSE } from './wanted.js';

const MAX_CRUISERS = 5;
const MAX_OFFICERS = 7;

class Cruiser {
  constructor(scene, city, graph, rng, spawn) {
    this.vehicle = new Vehicle(scene, 'police', { isPolice: true, name: 'police-cruiser' });
    this.vehicle.attachCity(city);
    this.vehicle.driver = 'police';
    this.vehicle.health = 220;
    this.vehicle.sirenOn = true;
    this.vehicle.place(spawn.x, spawn.z, spawn.yaw);
    this.yaw = spawn.yaw;
    this.speed = 0;
    this.fireCooldown = rng.range(0.5, 1.6);
    this.stuck = 0;
    this.rng = rng;
    this.destroyed = false;
    this.vehicle.onDestroyed = () => {
      this.destroyed = true;
      this.vehicle.driver = null;
      this.vehicle.sirenOn = false;
      if (this.onWreck) this.onWreck(this);
    };
    this.vehicle.onImpact = (mag) => {
      // ramming the player car is the point
    };
  }
}

class Officer {
  constructor(scene, city, rng, x, z) {
    const { root, joints } = buildCharacter(rng, { uniform: true, skin: 0xe8bb95 });
    this.model = root;
    this.joints = joints;
    this.model.name = 'police-officer';
    scene.add(root);
    this.city = city;
    this.rng = rng;
    this.position = new THREE.Vector3(x, groundHeightAt(x, z), z);
    this.yaw = 0;
    this.health = 90;
    this.alive = true;
    this.phase = 0;
    this.radius = 0.42;
    this.fireCooldown = rng.range(0.7, 2.0);
    this.weapon = this._gun();
    joints.rightArm.add(this.weapon);
    this.deadTimer = 0;
    this.state = 'chase';
    this.stepDistance = 0;
    this.stepSide = 0;
  }

  _gun() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.22), new THREE.MeshStandardMaterial({ color: 0x22242a, metalness: 0.7, roughness: 0.35 }));
    body.position.set(0, -0.7, 0.1);
    g.add(body);
    return g;
  }

  hit(amount, world) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
      this.state = 'dead';
      world.onOfficerDown?.(this);
      return true;
    }
    return false;
  }

  update(dt, world, mayFire = world.wanted.level >= 4) {
    if (!this.alive) {
      this.deadTimer += dt;
      this.model.rotation.z = damp(this.model.rotation.z, Math.PI / 2, 7, dt);
      this.position.y = damp(this.position.y, groundHeightAt(this.position.x, this.position.z) + 0.12, 10, dt);
      this.model.position.set(this.position.x, this.position.y, this.position.z);
      return;
    }
    this.model.rotation.z = damp(this.model.rotation.z, 0, 8, dt);

    const p = world.player;
    const dx = p.position.x - this.position.x;
    const dz = p.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const wantDist = 11;
    const targetYaw = Math.atan2(-dx, -dz);
    this.yaw = dampAngle(this.yaw, targetYaw, 7, dt);

    let moving = 0;
    if (!p.inVehicle && dist > wantDist * 1.1) {
      moving = 3.3;
    } else if (dist < 6.5) {
      moving = -1.8;
    } else if (p.inVehicle && dist > 14) {
      moving = 2.2;
    }
    if (moving !== 0) {
      const nx = this.position.x + Math.sin(-this.yaw) * moving * dt;
      const nz = this.position.z + Math.cos(-this.yaw) * moving * dt;
      const resolved = this.city.resolveCircle(nx, nz, this.radius, this.position.x, this.position.z);
      this.position.x = resolved.x;
      this.position.z = resolved.z;
      this.phase += dt * 7;
      this.stepDistance += Math.abs(moving) * dt;
    } else {
      this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 6, dt);
    }
    this.position.y = damp(this.position.y, groundHeightAt(this.position.x, this.position.z), 14, dt);

    animateCharacter(this.joints, this.phase, moving !== 0 ? 0.9 : 0, { aim: dist < 34, flee: false });
    this.model.position.set(this.position.x, this.position.y, this.position.z);
    this.model.rotation.y = this.yaw;

    // shooting: only at 4+ stars, from a stationary or walking stance, and with line of sight
    this.fireCooldown -= dt;
    if (mayFire && this.fireCooldown <= 0 && dist < 32 && hasLineOfSight(world, this.position, p)) {
      this.fireCooldown = this.rng.range(1.15, 2.1);
      this._shoot(world, p, dist);
    }
  }

  _shoot(world, p, dist) {
    const muzzle = new THREE.Vector3();
    const m = this.weapon.children[0];
    m.getWorldPosition(muzzle);
    world.audio?.gunshot('pistol', 0.55);
    world.combat?.muzzleFlashAt(muzzle, 0.7);
    world.combat?.tracer(muzzle, new THREE.Vector3(p.position.x, p.position.y + 1.15, p.position.z), 0x9fc0ff, 0.6);
    const hitting = this.rng.next() < clamp(0.7 - dist / 60, 0.14, 0.6);
    if (hitting) {
      const died = p.takeDamage(this.rng.range(4, 8));
      world.onPlayerHurt?.(died);
    }
    // nearby pedestrians scatter
    world.pedestrians.panicNear(this.position.x, this.position.z, 18, 6);
  }
}

function hasLineOfSight(world, from, player) {
  if (!world.city) return true;
  const dx = player.position.x - from.x;
  const dz = player.position.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const steps = Math.floor(len / 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    if (world.city.isInsideBuilding(x, 2.2, z)) return false;
  }
  return true;
}

export class Police {
  constructor(scene, city, graph, rng) {
    this.scene = scene;
    this.city = city;
    this.graph = graph;
    this.rng = rng;
    this.cruisers = [];
    this.officers = [];
    this.spawnTimer = 0;
    this.want = 0;
    this.onArrest = null;
    this.onBustedShot = null;
  }

  get vehicles() {
    return this.cruisers.filter((c) => !c.destroyed).map((c) => c.vehicle);
  }

  clearAll() {
    for (const c of this.cruisers) this.scene.remove(c.vehicle.model);
    for (const o of this.officers) this.scene.remove(o.model);
    this.cruisers = [];
    this.officers = [];
  }

  /** Spawn a cruiser on a lane far enough from the player that it does not appear. */
  spawnCruiser(player, minDist = 70) {
    if (this.cruisers.length >= MAX_CRUISERS) return null;
    let spawn = null;
    for (let i = 0; i < 40; i++) {
      const c = randomLanePoint(this.rng, this.graph);
      const d = Math.hypot(c.x - player.position.x, c.z - player.position.z);
      if (d > minDist && d < 260) { spawn = c; break; }
    }
    if (!spawn) return null;
    const cruiser = new Cruiser(this.scene, this.city, this.graph, this.rng, spawn);
    cruiser.onWreck = () => {
      this.spawnOfficers(player, 2);
    };
    this.cruisers.push(cruiser);
    return cruiser;
  }

  /** Deploy officers on foot at a point near the player (used by cruisers). */
  spawnOfficers(player, count = 2, near = null) {
    for (let i = 0; i < count; i++) {
      const alive = this.officers.filter((o) => o.alive);
      if (alive.length >= MAX_OFFICERS) return;
      let base = near;
      if (!base) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(16, 26);
        base = { x: player.position.x + Math.cos(a) * r, z: player.position.z + Math.sin(a) * r };
      }
      if (isRoadAt(base.x, base.z)) {
        // step onto the nearest pavement
        base.x += 11;
      }
      const x = clamp(base.x, -430, 260);
      const z = clamp(base.z, -430, 430);
      const officer = new Officer(this.scene, this.city, this.rng, x, z);
      this.officers.push(officer);
    }
  }

  /** Outputs the HUD and systems want: nearest active threat info. */
  nearestDistance(player) {
    let best = Infinity;
    for (const c of this.cruisers) {
      if (c.destroyed) continue;
      const d = Math.hypot(c.vehicle.position.x - player.position.x, c.vehicle.position.z - player.position.z);
      if (d < best) best = d;
    }
    for (const o of this.officers) {
      if (!o.alive) continue;
      const d = Math.hypot(o.position.x - player.position.x, o.position.z - player.position.z);
      if (d < best) best = d;
    }
    return best;
  }

  update(dt, world) {
    const level = world.wanted.level;
    this.want = level;
    const response = RESPONSE[clamp(level, 0, 5)];

    // spawn to match the response table: 1 car investigating, up to 4 in a lockdown
    const wantedCruisers = response.cruisers;
    this.spawnTimer -= dt;
    if (this.cruisers.length < wantedCruisers && this.spawnTimer <= 0) {
      this.spawnTimer = level >= 4 ? 1.4 : level === 3 ? 2.2 : 3.4;
      // an investigating patrol rolls up slowly and close; a pursuit comes in hot
      const c = this.spawnCruiser(world.player, level === 1 ? 42 : level >= 4 ? 58 : 80);
      if (c) c.investigating = level === 1;
    }
    // officers on foot deploy from three stars up, scaled by the response table
    const wantedOfficers = response.officers;
    const aliveOfficers = this.officers.filter((o) => o.alive).length;
    if (wantedOfficers > 0 && aliveOfficers < wantedOfficers) {
      this.officerTimer = (this.officerTimer ?? 0) - dt;
      if (this.officerTimer <= 0) {
        this.officerTimer = 2.6;
        this.spawnOfficers(world.player, 1);
      }
    }

    // decay: at 0 stars, cruisers give up and disappear one by one
    if (level === 0) {
      if (this.cruisers.length && this.rng.chance(dt * 0.75)) {
        const c = this.cruisers.shift();
        this.scene.remove(c.vehicle.model);
      }
      if (this.officers.length && this.rng.chance(dt * 0.9)) {
        const o = this.officers.shift();
        this.scene.remove(o.model);
      }
    }

    const p = world.player;
    for (const c of this.cruisers) {
      if (c.destroyed) continue;
      this._driveCruiser(c, dt, world, level);
    }
    // officers open fire from 3 stars up; the two nearest shoot so a shootout stays survivable
    const armed = this.officers
      .filter((o) => o.alive)
      .sort((a, b) => (
        Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) -
        Math.hypot(b.position.x - p.position.x, b.position.z - p.position.z)
      ))
      .slice(0, level >= 5 ? 4 : 2);
    for (const o of this.officers) o.update(dt, world, armed.includes(o) && level >= 3);

    this._checkArrest(dt, world);
  }

  _driveCruiser(c, dt, world, level) {
    const p = world.player;
    const target = p.inVehicle ? p.inVehicle.position : p.position;
    const v = c.vehicle;
    const dx = target.x - v.position.x;
    const dz = target.z - v.position.z;
    const dist = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(-dx, -dz);
    let diff = angleDelta(c.yaw, desiredYaw);

    // Far away: follow the lane graph so the cruiser comes down real streets instead of
    // driving through buildings. Close in: steer straight at the player.
    let navYaw = desiredYaw;
    let usingLane = false;
    if (dist > 34 && c.edge) {
      const graph = this.graph;
      const e = c.edge;
      const len = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
      c.laneT = (c.laneT ?? 0) + Math.abs(v.speed) * dt;
      if (c.laneT >= len) {
        const nextE = graph.edges.find((n) => n.from === e.to && Math.abs(angleDelta(
          Math.atan2(-(e.x1 - e.x0), -(e.z1 - e.z0)),
          Math.atan2(-(n.x1 - n.x0), -(n.z1 - n.z0)),
        )) < 2.5);
        c.edge = nextE ?? null;
        c.laneT = 0;
      }
      if (c.edge) {
        navYaw = Math.atan2(-(e.x1 - e.x0), -(e.z1 - e.z0));
        usingLane = true;
      }
    } else if (!c.edge && dist > 34) {
      // rejoin the graph at the nearest lane
      const near = nearestEdge(this.graph, v.position.x, v.position.z);
      if (near) { c.edge = near.edge; c.laneT = 0; }
    }

    c.yaw = dampAngle(c.yaw, usingLane ? navYaw : desiredYaw, usingLane ? 3.4 : 2.4 + level * 0.25, dt);
    v.yaw = c.yaw;
    diff = angleDelta(c.yaw, usingLane ? navYaw : desiredYaw);

    // target speed: fast pursuit, slow to a stop alongside a player on foot
    let wantedSpeed = clamp(dist * 0.75, 0, 26 + level * 2.4);
    if (dist < 7 && !p.inVehicle) wantedSpeed = 0;
    if (dist < 12 && p.inVehicle) wantedSpeed = Math.max(p.inVehicle.speed + 3, 8);
    // a one-star patrol investigates instead of ramming: it closes to a watching distance
    if (level === 1) {
      wantedSpeed = clamp(dist - 14, 0, 14);
      if (dist < 16 && dist > 9) wantedSpeed = 0;
    }
    c.speed = damp(c.speed, wantedSpeed, 2.4, dt);

    const throttle = c.speed > v.speed + 0.5 ? 1 : c.speed < v.speed - 1 ? -1 : 0;
    v.drive(dt, {
      throttle,
      steerInput: clamp(diff * 2.4, -1, 1),
      handbrake: false,
      brake: Math.abs(diff) > 1.1 && Math.abs(v.speed) > 8,
    });

    // unstick: reverse briefly then resume
    if (Math.abs(v.speed) < 0.6 && c.speed > 2) {
      c.stuck += dt;
      if (c.stuck > 1.6) {
        c.stuck = 0;
        const nx = v.position.x - Math.sin(c.yaw) * 2.4;
        const nz = v.position.z - Math.cos(c.yaw) * 2.4;
        const r = this.city.resolveCircle(nx, nz, 1.4, v.position.x, v.position.z);
        v.position.x = r.x;
        v.position.z = r.z;
        c.yaw += Math.PI * 0.5;
      }
    } else c.stuck = 0;

    // shooting from the cruiser at 3+ stars
    c.fireCooldown -= dt;
    if (level >= 3 && c.fireCooldown <= 0 && dist < 34 && hasLineOfSight(world, v.position, p)) {
      c.fireCooldown = this.rng.range(1.6, 3.2) * (level >= 5 ? 0.75 : 1);
      const muzzle = new THREE.Vector3(v.position.x, v.position.y + 1.3, v.position.z);
      world.audio?.gunshot('pistol', 0.6);
      world.combat?.muzzleFlashAt(muzzle, 0.8);
      world.combat?.tracer(muzzle, new THREE.Vector3(p.position.x, p.position.y + 1.1, p.position.z), 0x9fc0ff, 0.7);
      if (this.rng.next() < 0.35) {
        const died = p.takeDamage(this.rng.range(3, 7));
        world.onPlayerHurt?.(died);
      }
      world.pedestrians.panicNear(v.position.x, v.position.z, 20, 6);
    }
  }

  _checkArrest(dt, world) {
    const p = world.player;
    if (p.inVehicle || !p.alive || world.wanted.level === 0) {
      this.arrestTimer = 0;
      return;
    }
    // only an officer on foot can put cuffs on; a cruiser parked nearby does not count
    let near = Infinity;
    for (const o of this.officers) {
      if (!o.alive) continue;
      near = Math.min(near, Math.hypot(o.position.x - p.position.x, o.position.z - p.position.z));
    }
    if (near < 2.6) {
      this.arrestTimer = (this.arrestTimer ?? 0) + dt;
      if (this.arrestTimer > 1.15) {
        this.arrestTimer = 0;
        this.onArrest?.();
      }
    } else {
      this.arrestTimer = Math.max(0, (this.arrestTimer ?? 0) - dt * 1.5);
    }
  }
}