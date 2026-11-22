// Sol's lock-up: a garage on the Avenida Costa where stolen cars can be stored and pulled
// back out later. It is a real building with an open door, a neon "VEGA" sign, a lit bay,
// a marker column and a floor pad; driving a stolen car onto the pad and pressing G banks
// it (kind + colour + damage, no money), and pressing G while on the pad with an empty bay
// pulls the last car out again. Four bays.
//
// The garage also owns the heist CREW: the three crew characters stand around the door and
// walk onto the pad when a mission needs them.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { buildCharacter, animateCharacter } from './characters.js';
import { mergeGeometries, boxGeometry } from './geometry-utils.js';
import { glowTexture } from './textures.js';
import { damp, dampAngle, dist } from './config.js';
import { buildMarker } from './mission-marker.js';

export const GARAGE_CAPACITY = 4;
/** On the promenade block just south of the motel, on the pavement side. */
export const GARAGE_SITE = { x: 168, z: 178, yaw: Math.PI * 0.5 };

/** The building: a concrete shell with an open roller door and a neon sign. */
function buildGarageShell(scene) {
  const group = new THREE.Group();
  group.name = 'garage-shell';
  const { x, z, yaw } = GARAGE_SITE;

  const shell = [];
  // side walls and back wall (the front is the open door)
  shell.push(boxGeometry(0.6, 5.2, 13, 0, 2.6, -6.2, 0x8d8578));
  shell.push(boxGeometry(0.6, 5.2, 13, 0, 2.6, 6.2, 0x8d8578));
  shell.push(boxGeometry(12.4, 5.2, 0.6, 0, 2.6, 0, 0x8d8578));
  // roof slab
  shell.push(boxGeometry(12.4, 0.5, 13, 0, 5.45, 0, 0x6e675c));
  // door lintel and two open-leaf panels folded back
  shell.push(boxGeometry(12.6, 1.3, 0.7, 0, 4.5, -6.2, 0x4c463d));
  shell.push(boxGeometry(0.3, 3.6, 2.8, -5.4, 1.9, -5.4, 0x3f3a33));
  shell.push(boxGeometry(0.3, 3.6, 2.8, 5.4, 1.9, -5.4, 0x3f3a33));
  // hazard stripes on the floor lip
  for (let i = 0; i < 9; i++) {
    shell.push(boxGeometry(1.1, 0.02, 0.9, -5.4 + i * 1.35, 0.2, -6.0, i % 2 ? 0xf2c200 : 0x23262b));
  }
  // workbench and a wall of tyres inside
  shell.push(boxGeometry(9.6, 0.9, 1.1, 0, 0.65, -9.6, 0x5a4632));
  for (let i = 0; i < 7; i++) {
    shell.push(boxGeometry(0.34, 0.72, 0.72, -4.6 + i * 1.5, 0.36, -11.4, 0x16171b));
  }
  const mesh = new THREE.Mesh(mergeGeometries(shell), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // the lit bay floor, so the garage reads as open at night
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(11.2, 11.6),
    new THREE.MeshBasicMaterial({ color: 0x2c3138, transparent: true, opacity: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.21, -5.4);
  group.add(floor);

  // the bay's own light
  const lamp = new THREE.PointLight(0xffd9a0, 26, 26, 2);
  lamp.position.set(0, 4.4, -5.0);
  group.add(lamp);
  const tube = new THREE.Mesh(
    boxGeometry(5.4, 0.12, 0.3, 0, 4.3, -5.0, 0xfff3d0),
    new THREE.MeshBasicMaterial({ color: 0xfff3d0, toneMapped: false }),
  );
  group.add(tube);

  // neon "VEGA" style sign over the door: three glowing bars, no font needed
  const neonMat = () => new THREE.MeshBasicMaterial({ color: 0x45f0ff, toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.26, 0.1), neonMat());
    bar.position.set(-2.6 + i * 2.6, 4.9, -6.55);
    group.add(bar);
  }
  const signGlow = new THREE.PointLight(0x45f0ff, 9, 14, 2);
  signGlow.position.set(0, 4.9, -7.2);
  group.add(signGlow);

  group.position.set(x, 0.18, z);
  group.rotation.y = yaw;
  scene.add(group);
  return group;
}

/** One garage bay: the marker column, the pad and the label. */
function bayMarker(scene, offsetX, offsetZ) {
  const marker = buildMarker(scene, 0xffd166);
  const { x, z, yaw } = GARAGE_SITE;
  const wx = x + Math.cos(yaw) * offsetX + Math.sin(yaw) * offsetZ;
  const wz = z - Math.sin(yaw) * offsetX + Math.cos(yaw) * offsetZ;
  marker.position.set(wx, 0.18, wz);
  marker.scale.setScalar(0.7);
  return { marker, x: wx, z: wz };
}

export class Garage {
  constructor(scene, city, hud, rng) {
    this.scene = scene;
    this.city = city;
    this.hud = hud;
    this.rng = rng;
    this.stored = [];              // [{kind, colour, health}]
    this.spawned = [];             // live Vehicle objects currently in the yard
    this.position = { x: GARAGE_SITE.x, z: GARAGE_SITE.z };
    this.capacity = GARAGE_CAPACITY;
    this.lastAction = '';

    this.shell = buildGarageShell(scene);
    const bay = bayMarker(scene, 0, 0);
    this.pad = { x: bay.x, z: bay.z, radius: 11 };
    this.marker = bay.marker;

    // a flare sprite so the garage is findable from across the map
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffd166, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(14, 14, 1);
    halo.position.set(bay.x, 3.2, bay.z);
    scene.add(halo);
    this.halo = halo;

    // the crew, standing by the door until a mission calls them
    this.crew = [];
    this._buildCrew();
    this.parkStoredCars();
  }

  get count() {
    return this.stored.length + this.spawned.length;
  }

  get full() {
    return this.count >= this.capacity;
  }

  /** True if a world point is close enough to the pad to interact. */
  nearPad(x, z, radius = this.pad.radius) {
    return dist(x, z, this.pad.x, this.pad.z) < radius;
  }

  /** Store the car the player is currently driving. Returns true if it went in. */
  store(world) {
    const v = world.player.inVehicle;
    if (!v) {
      this.lastAction = 'no-car';
      return false;
    }
    if (!v.stolen) {
      this.lastAction = 'not-stolen';
      world.hud?.showToast('NOTHING TO STORE — THIS CAR IS NOT HOT');
      return false;
    }
    if (this.full) {
      this.lastAction = 'full';
      world.hud?.showToast('GARAGE FULL — 4 BAYS OCCUPIED');
      return false;
    }
    const entry = {
      kind: v.kind,
      colour: v.bodyColour ?? 0xe83a5a,
      health: Math.round(v.health),
      name: v.kind.toUpperCase(),
    };
    this.stored.push(entry);
    world.exitVehicle();
    v.destroyed = true;
    v.model.visible = false;
    this.scene.remove(v.model);
    if (world.stolenVehicle === v) world.stolenVehicle = null;
    this.lastAction = 'stored';
    world.hud?.showToast(`STORED — ${entry.name} BANKED (${this.count}/${this.capacity})`);
    world.audio?.pickup?.();
    this.syncHud();
    return true;
  }

  /** Pull the most recent stored car back onto the pad. */
  retrieve(world) {
    if (!this.stored.length) {
      this.lastAction = 'empty';
      world.hud?.showToast('GARAGE EMPTY');
      return null;
    }
    const entry = this.stored.pop();
    const car = this.spawnCar(entry);
    // park it facing out of the door
    car.yaw = GARAGE_SITE.yaw;
    car.syncModel();
    this.lastAction = 'retrieved';
    world.hud?.showToast(`ROLLED OUT — ${entry.name} (${this.count}/${this.capacity})`);
    world.audio?.carHorn?.();
    this.syncHud();
    return car;
  }

  spawnCar(entry) {
    const { x, z } = this.pad;
    const car = new Vehicle(this.scene, entry.kind, { colour: entry.colour, name: 'garage-car' });
    car.attachCity(this.city);
    car.position.set(x, this.city.groundAt(x, z), z);
    car.yaw = GARAGE_SITE.yaw;
    car.health = entry.health ?? 100;
    car.stolen = true;
    car.isPlayerVehicle = true;
    car.syncModel();
    this.spawned.push(car);
    return car;
  }

  /** Re-create every stored car as parked geometry (used on load / shot staging). */
  parkStoredCars() {
    for (const car of this.spawned) this.scene.remove(car.model);
    this.spawned = [];
    const { x, z, yaw } = GARAGE_SITE;
    this.stored.forEach((entry, i) => {
      const car = new Vehicle(this.scene, entry.kind, { colour: entry.colour, name: 'garage-car' });
      car.attachCity(this.city);
      const ox = (i - (this.stored.length - 1) / 2) * 2.6;
      car.position.set(x + Math.cos(yaw) * ox, this.city.groundAt(x, z), z - Math.sin(yaw) * ox);
      car.yaw = yaw + Math.PI;
      car.health = entry.health ?? 100;
      car.stolen = true;
      car.syncModel();
      this.spawned.push(car);
    });
    this.syncHud();
  }

  syncHud() {
    this.hud?.setGarage?.(this.count, this.capacity);
  }

  serialise() {
    return {
      stored: this.stored.map((e) => ({ kind: e.kind, colour: e.colour, health: e.health })),
    };
  }

  restore(data) {
    this.stored = (data?.stored ?? []).slice(0, this.capacity).map((e) => ({
      kind: e.kind ?? 'sedan',
      colour: e.colour ?? 0xe83a5a,
      health: e.health ?? 100,
    }));
    this.parkStoredCars();
  }

  // ------------------------------------------------------------------ crew
  _buildCrew() {
    const { x, z, yaw } = GARAGE_SITE;
    const spots = [
      { id: 'tiny', dx: -3.4, dz: 7.4, shirt: 0x2ad1c9, pants: 0x1b1b22 },
      { id: 'delia', dx: 2.2, dz: 7.0, shirt: 0xff8c42, pants: 0x2b3a55 },
      { id: 'rourke', dx: 5.4, dz: 3.2, shirt: 0xb03050, pants: 0x14161c },
    ];
    for (const s of spots) {
      const { root, joints } = buildCharacter(this.rng, { shirt: s.shirt, pants: s.pants, skin: 0xd9a97c, shades: s.id === 'rourke' });
      root.name = `crew-${s.id}`;
      const wx = x + Math.cos(yaw) * s.dx + Math.sin(yaw) * s.dz;
      const wz = z - Math.sin(yaw) * s.dx + Math.cos(yaw) * s.dz;
      root.position.set(wx, this.city.groundAt(wx, wz), wz);
      root.rotation.y = yaw + Math.PI;
      this.scene.add(root);
      this.crew.push({
        id: s.id, root, joints, phase: this.rng.range(0, 6),
        home: { x: wx, z: wz }, position: { x: wx, z: wz },
        target: null, alive: true, health: 100,
        hit: (amount) => { this.health = Math.max(0, (this.health ?? 100) - amount); if (this.health <= 0) this.alive = false; return this.alive === false; },
      });
    }
  }

  /** Called each step: idle animation, and walking to a target if one is set. */
  update(dt, world) {
    const t = world.time;
    this.marker.userData.sprite.position.y = 0.9 + Math.sin(t * 2.4) * 0.22;
    this.marker.userData.disc.material.opacity = 0.3 + Math.abs(Math.sin(t * 1.8)) * 0.26;
    this.halo.material.opacity = 0.4 + Math.abs(Math.sin(t * 0.9)) * 0.18;

    for (const c of this.crew) {
      c.phase += dt * 1.4;
      if (c.target) {
        const dx = c.target.x - c.position.x;
        const dz = c.target.z - c.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) {
          const step = Math.min(d, 3.4 * dt);
          c.position.x += (dx / d) * step;
          c.position.z += (dz / d) * step;
          c.root.rotation.y = dampAngle(c.root.rotation.y, Math.atan2(-dx, -dz), 6, dt);
          animateCharacter(c.joints, c.phase * 5, 0.7, {});
        } else {
          c.target = null;
        }
      } else if (c.alive) {
        animateCharacter(c.joints, c.phase, 0, { headTurn: Math.sin(c.phase * 0.7) * 0.3 });
      }
      c.root.position.set(c.position.x, this.city.groundAt(c.position.x, c.position.z), c.position.z);
    }
  }

  /** Walk the crew to a set of world spots (the heist uses this to meet at the pad). */
  callCrew(spots) {
    this.crew.forEach((c, i) => {
      const s = spots[i % spots.length];
      if (s) c.target = s;
    });
  }

  resetCrew() {
    for (const c of this.crew) {
      c.target = null;
      c.position = { ...c.home };
      c.alive = true;
    }
  }

  state() {
    return {
      count: this.count,
      stored: this.stored.map((e) => `${e.kind}:${e.health}`),
      spawned: this.spawned.length,
      pad: { x: +this.pad.x.toFixed(1), z: +this.pad.z.toFixed(1) },
      lastAction: this.lastAction,
    };
  }
}