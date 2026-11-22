// VCPD Air One: a police helicopter that answers a four-star call. It lifts off out of
// sight, swings in above and behind the player, follows at a fixed standoff, and its
// rotor never stops turning. At five stars the door gunner opens up. At night a
// searchlight cone tracks whatever the player is driving, which is most of the reason
// anyone remembers the chase.
//
// Everything is built from merged low-poly geometry so the whole aircraft is ~6 draw
// calls; the rotor, tail rotor and searchlight are separate so they can animate.
import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDelta } from './config.js';
import { mergeGeometries, boxGeometry, tintGeometry } from './geometry-utils.js';

const CRUISE_ALTITUDE = 42;
const STANDOFF_BEHIND = 26;
const STANDOFF_SIDE = 8;
const MAX_RANGE = 340;

/** The airframe: fuselage, tail boom, skids, canopy and a VCPD stripe. */
function buildAirframe() {
  const root = new THREE.Group();
  root.name = 'police-helicopter';

  const hull = [];
  // cabin: a squat box with a sloped nose
  hull.push(boxGeometry(2.3, 1.7, 3.6, 0, 0, 0.2, 0x1b2740));
  hull.push(boxGeometry(2.0, 1.1, 1.3, 0, -0.18, -2.1, 0x1b2740));
  // belly
  hull.push(boxGeometry(1.9, 0.5, 3.0, 0, -0.95, 0.3, 0x141d30));
  // tail boom
  hull.push(boxGeometry(0.52, 0.5, 5.2, 0, 0.22, 3.9, 0x1b2740));
  // tail fin
  hull.push(boxGeometry(0.18, 1.5, 1.0, 0, 0.9, 6.1, 0x1b2740));
  // VCPD livery: white stripe + door marking
  hull.push(boxGeometry(2.36, 0.32, 3.2, 0, -0.28, 0.25, 0xeef2f7));
  hull.push(boxGeometry(2.36, 0.06, 3.2, 0, -0.4, 0.25, 0x2a5fd0));
  // skids
  for (const s of [-1, 1]) {
    hull.push(boxGeometry(0.14, 0.14, 3.4, s * 0.95, -1.5, 0.2, 0x232830));
    hull.push(boxGeometry(0.1, 0.62, 0.1, s * 0.95, -1.2, -0.9, 0x232830));
    hull.push(boxGeometry(0.1, 0.62, 0.1, s * 0.95, -1.2, 1.1, 0x232830));
  }
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 });
  const body = new THREE.Mesh(mergeGeometries(hull), bodyMat);
  body.castShadow = true;
  body.receiveShadow = false;
  root.add(body);

  // canopy glass, slightly transparent so the pilot silhouette reads
  const canopy = new THREE.Mesh(
    boxGeometry(1.86, 0.92, 1.5, 0, 0.34, -1.75),
    new THREE.MeshStandardMaterial({ color: 0x8fc4e8, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.72 }),
  );
  root.add(canopy);

  // the pilot: a helmeted head and shoulders behind the glass
  const pilot = new THREE.Mesh(
    mergeGeometries([
      boxGeometry(0.42, 0.36, 0.3, 0, 0.6, -1.7, 0x1a2333),
      boxGeometry(0.3, 0.3, 0.28, 0, 0.92, -1.72, 0xe8bb95),
      boxGeometry(0.32, 0.16, 0.3, 0, 1.06, -1.72, 0x101828),
    ]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  );
  root.add(pilot);

  return root;
}

/** Rotor: a hub and four blades, spun by rotating the group about its own Y axis. */
function buildRotor(radius = 4.6) {
  const g = new THREE.Group();
  g.name = 'helicopter-rotor';
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = boxGeometry(radius * 2, 0.09, 0.42, 0, 0, 0, 0x1a1f26);
    blade.rotateY(a);
    parts.push(blade);
  }
  parts.push(boxGeometry(0.7, 0.26, 0.7, 0, 0, 0, 0x2c333d));
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  mesh.castShadow = true;
  g.add(mesh);
  // the disc the blades sweep, a faint additive card so it always reads as spinning
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.9, 24),
    new THREE.MeshBasicMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  g.add(disc);
  return g;
}

/** The searchlight: a cone plus a hot spot where it lands. */
function buildSearchlight() {
  const g = new THREE.Group();
  g.name = 'helicopter-searchlight';
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7.5, 34, 22, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2cf, transparent: true, opacity: 0.14, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  // cone points down: apex at the lamp, base on the ground
  cone.position.y = -17;
  cone.rotation.x = Math.PI;
  g.add(cone);
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(7.0, 26),
    new THREE.MeshBasicMaterial({
      color: 0xfff6dd, transparent: true, opacity: 0.34, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = -34;
  g.add(spot);
  const lamp = new THREE.PointLight(0xfff0c8, 0, 40, 2);
  lamp.position.y = -2;
  g.add(lamp);
  g.userData = { cone, spot, lamp };
  return g;
}

export class Helicopter {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.active = false;
    this.spawnTimer = 0;
    this.rotorSpeed = 0;
    this.position = new THREE.Vector3(0, CRUISE_ALTITUDE, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.root = buildAirframe();
    this.root.visible = false;
    scene.add(this.root);

    this.rotor = buildRotor(4.6);
    this.rotor.position.set(0, 1.05, 0.1);
    this.root.add(this.rotor);

    this.tailRotor = new THREE.Group();
    const tailBlade = new THREE.Mesh(
      mergeGeometries([
        boxGeometry(0.06, 1.9, 0.16, 0, 0, 0, 0x1a1f26),
        boxGeometry(0.06, 0.16, 1.9, 0, 0, 0, 0x1a1f26),
      ]),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    );
    this.tailRotor.add(tailBlade);
    this.tailRotor.position.set(0.34, 0.9, 6.2);
    this.root.add(this.tailRotor);

    this.searchlight = buildSearchlight();
    this.searchlight.position.set(0, -1.0, 1.2);
    this.root.add(this.searchlight);
    this.searchlightOn = false;

    // siren strobes on the belly
    this.strobes = [];
    const strobeMat = () => new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff0022, emissiveIntensity: 3, toneMapped: false });
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3), strobeMat());
      m.position.set(s * 0.7, -1.25, -1.2);
      this.root.add(m);
      this.strobes.push(m);
    }
    this.strobePhase = 0;

    this.fireCooldown = 2.4;
    this.shots = 0;
    this.searchlightTrack = new THREE.Vector3();
  }

  /** Called by the police system when the wanted level changes. */
  setWantedLevel(level) {
    const shouldFly = level >= 4;
    if (shouldFly && !this.active) this.deploy();
    else if (!shouldFly && this.active) this.retire();
  }

  deploy(spawnAt = null) {
    if (this.active) return;
    const p = this.position;
    if (spawnAt) {
      p.set(spawnAt.x, spawnAt.y ?? CRUISE_ALTITUDE, spawnAt.z);
    } else {
      // come in from the seaward side, well outside the player's eyeline
      p.set(260, CRUISE_ALTITUDE + 12, 300);
    }
    this.active = true;
    this.root.visible = true;
    this.rotorSpeed = 12;
    this.fireCooldown = 3.2;
    this.yaw = Math.PI;
    this.syncModel();
  }

  retire() {
    this.active = false;
    this.root.visible = false;
    this.searchlightOn = false;
    this.searchlight.visible = false;
  }

  /** Where the chopper wants to sit: above and behind the player's heading. */
  _station(world) {
    const p = world.player;
    const heading = p.inVehicle ? p.inVehicle.yaw : p.yaw;
    const back = { x: Math.sin(heading), z: Math.cos(heading) };
    const side = { x: Math.cos(heading), z: -Math.sin(heading) };
    const anchor = p.inVehicle ? p.inVehicle.position : p.position;
    return {
      x: anchor.x + back.x * STANDOFF_BEHIND + side.x * STANDOFF_SIDE,
      y: anchor.y + CRUISE_ALTITUDE,
      z: anchor.z + back.z * STANDOFF_BEHIND + side.z * STANDOFF_SIDE,
      anchor,
    };
  }

  update(dt, world) {
    this.strobePhase += dt * 7;
    for (const [i, s] of this.strobes.entries()) {
      s.visible = this.active && Math.sin(this.strobePhase + i * Math.PI) > 0;
    }
    if (!this.active) {
      this.rotorSpeed = damp(this.rotorSpeed, 0, 2, dt);
      this.rotor.rotation.y += this.rotorSpeed * dt;
      return;
    }

    const level = world.wanted.level;
    if (level < 4) { this.retire(); return; }

    const station = this._station(world);
    // fly toward the station at a rotorcraft's pace, banking into the turn
    const dx = station.x - this.position.x;
    const dz = station.z - this.position.z;
    const distToStation = Math.hypot(dx, dz);
    const speed = clamp(distToStation * 0.9, 0, 46);
    const desiredYaw = Math.atan2(-dx, -dz);
    this.yaw = dampAngle(this.yaw, desiredYaw, 2.2, dt);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.position.x += fx * speed * dt;
    this.position.z += fz * speed * dt;
    this.position.y = damp(this.position.y, station.y + Math.sin(world.time * 0.6) * 0.7, 1.6, dt);

    // never let it drift out of the world
    const dPlayer = Math.hypot(this.position.x - station.anchor.x, this.position.z - station.anchor.z);
    if (dPlayer > MAX_RANGE) {
      this.position.x = station.x;
      this.position.z = station.z;
    }

    this.rotorSpeed = damp(this.rotorSpeed, 34 + (level >= 5 ? 6 : 0), 3, dt);
    this.rotor.rotation.y += this.rotorSpeed * dt;
    this.tailRotor.rotation.x += this.rotorSpeed * 2.4 * dt;

    // body attitude: nose-down when moving, bank in the turn
    this.root.rotation.set(
      clamp(speed / 46, 0, 1) * 0.16,
      this.yaw,
      clamp(angleDelta(this.yaw, desiredYaw) * 0.6, -0.34, 0.34),
      'YXZ',
    );
    this.position.y = Math.max(this.position.y, this.city.groundAt(this.position.x, this.position.z) + 22);
    this.root.position.copy(this.position);

    // searchlight: on at night, or always at five stars so the beam is part of the threat
    const night = world.timeOfDay === 'night' || level >= 5;
    this.searchlightOn = night;
    this.searchlight.visible = night;
    if (night) {
      const target = world.player.inVehicle ? world.player.inVehicle.position : world.player.position;
      const beamX = target.x + Math.sin(world.time * 1.7) * 1.2;
      const beamZ = target.z + Math.cos(world.time * 1.3) * 1.2;
      const beamY = this.city.groundAt(beamX, beamZ);
      this.searchlightTrack.set(beamX, beamY, beamZ);
      const dxb = beamX - this.position.x;
      const dzb = beamZ - this.position.z;
      const dyb = beamY - (this.position.y - 1.0);
      // the beam hangs from the belly, so tilt the whole cone at the target
      const horiz = Math.hypot(dxb, dzb);
      const pitch = Math.atan2(horiz, -dyb);
      this.searchlight.rotation.set(pitch * Math.cos(this.yaw + Math.PI), -this.yaw, pitch * Math.sin(this.yaw + Math.PI), 'YXZ');
      const lean = clamp(1 - horiz / 60, 0.4, 1);
      this.searchlight.userData.cone.material.opacity = 0.11 + lean * 0.06;
      this.searchlight.userData.spot.material.opacity = 0.26 + lean * 0.12;
      this.searchlight.userData.lamp.intensity = 22;
    }

    // door gunner: five stars only, and only when it has a clean angle
    if (level >= 5) {
      this.fireCooldown -= dt;
      if (this.fireCooldown <= 0) {
        this.fireCooldown = this.rng.range(1.5, 2.6);
        this._fire(world, station.anchor);
      }
    } else {
      this.fireCooldown = Math.max(this.fireCooldown, 1.2);
    }

    this.syncModel();
  }

  _fire(world, anchor) {
    if (!world.player.alive) return;
    const muzzle = new THREE.Vector3(this.position.x, this.position.y - 0.4, this.position.z + 1.6);
    world.audio?.helicopterShot?.(0.5, muzzle);
    world.combat?.muzzleFlashAt(muzzle, 1.4);
    world.combat?.tracer(muzzle, new THREE.Vector3(anchor.x, anchor.y + 1.2, anchor.z), 0xffd08a, 0.9);
    this.shots++;
    // a burst is scary but survivable: it stitches the road around the player
    const hitChance = 0.34;
    if (this.rng.next() < hitChance) {
      const died = world.player.takeDamage(this.rng.range(3, 6));
      world.onPlayerHurt?.(died);
    }
    world.pedestrians.panicNear(anchor.x, anchor.z, 30, 8);
    world.rig.addShake(0.12);
  }

  syncModel() {
    if (!this.active) return;
    this.root.position.copy(this.position);
  }

  /** Serialisable state for shots/verification. */
  state() {
    return {
      active: this.active,
      x: +this.position.x.toFixed(1),
      y: +this.position.y.toFixed(1),
      z: +this.position.z.toFixed(1),
      rotor: +this.rotor.rotation.y.toFixed(2),
      rotorSpeed: +this.rotorSpeed.toFixed(1),
      searchlight: this.searchlightOn,
      shots: this.shots,
    };
  }
}