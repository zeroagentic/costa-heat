// The World: owns every system, runs the fixed simulation step, and exposes the small
// API the missions, shots and menus need. main.js drives it; nothing here touches the DOM
// except through the HUD passed in.
import * as THREE from 'three';
import { City } from './city.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Traffic, TrafficCar } from './traffic.js';
import { PedestrianCrowd, Pedestrian } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Wanted } from './wanted.js';
import { Missions } from './missions.js';
import { Vehicle } from './vehicles.js';
import { AudioSystem } from './audio.js';
import { streamRng } from './random.js';
import { CITY, GRID, PLAYER, ROAD, clamp, dist, damp } from './config.js';
import { randomLanePoint, nearestEdge } from './roads.js';

export class World {
  constructor({ scene, camera, hud, audio, minimap, seed }) {
    this.scene = scene;
    this.camera = camera;
    this.hud = hud;
    this.audio = audio;
    this.minimap = minimap;
    this.seed = seed;
    this.time = 0;
    this.playTime = 0;
    this.cash = 500;
    this.stats = { kills: 0, arrests: 0, distance: 0, carsStolen: 0 };
    this.threatLevel = 0;
    this.controlsActive = false;
    this.deterministic = false;
    this.stolenVehicle = null;
    this.scriptedDrive = null;
    this.paused = false;
    this.explosions = [];
    this.debris = [];
    this.rngPeds = streamRng(seed, 'peds');
    this.onViolence = (x, z, kind) => this._handleViolence(x, z, kind);
    this.onPlayerHurt = (died) => this._handlePlayerHurt(died);
    this.onVehicleDestroyed = (v) => this._explodeVehicle(v);
    this.onKill = (victim) => { this.stats.kills++; };
    this.onOfficerDown = () => { this.stats.kills++; };
    this.timeOfDay = 'sunset';
  }

  async build(progress) {
    this.city = new City(this.seed);
    await this.city.build(progress);
    this.scene = this.city.scene;
    this.laneGraph = this.city.laneGraph;
    this.player = new Player(this.scene, this.city, this.camera);
    this.rig = new CameraRig(this.camera, this.city);
    this.wanted = new Wanted();
    this.wanted.onChange = (level) => this._onWantedChange(level);
    this.traffic = new Traffic(this.scene, this.city, this.laneGraph, streamRng(this.seed, 'traffic'));
    this.traffic.populate();
    this.pedestrians = new PedestrianCrowd(this.scene, this.city, streamRng(this.seed, 'pedestrians'));
    this.pedestrians.populate();
    this.police = new Police(this.scene, this.city, this.laneGraph, streamRng(this.seed, 'police'));
    this.police.onArrest = () => this.arrestPlayer();
    this.combat = new Combat(this.scene, this.camera, this.player, this);
    this.missions = new Missions(this.scene, this.city, this.hud, streamRng(this.seed, 'missions'));
    this.missions.onMissionStarted = (def) => { this.onMissionStarted?.(def); };
    this.onMissionComplete = (def, reward) => this._handleMissionComplete(def, reward);
    this.onMissionFailed = (def, reason) => this._handleMissionFailed(def, reason);
    this.rig.setMode('foot');
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health, PLAYER.maxHealth);
    return this;
  }

  get wantedLevel() {
    return this.wanted.level;
  }

  setDeterministic(on) {
    this.deterministic = on;
    if (on) {
      // deterministic shots must not depend on Math.random anywhere in the sim
      this._rng = streamRng(this.seed, 'world');
      this._origRandom = Math.random;
      Math.random = () => this._rng.next();
    } else if (this._origRandom) {
      Math.random = this._origRandom;
    }
  }

  allVehicles() {
    const policeCars = this.police.vehicles;
    const stolen = this.stolenVehicle && !this.stolenVehicle.destroyed ? [this.stolenVehicle] : [];
    return this.traffic.vehicles.filter((v) => !v.destroyed).concat(policeCars, stolen);
  }

  // ------------------------------------------------------------- main step
  /** One deterministic simulation step. No rendering, no DOM beyond HUD state updates. */
  stepSimulation(dt, opts = {}) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const input = opts.input ?? this.input;
    const control = !this.deterministic || opts.scripted;
    this.controlsActive = control;

    // player: on foot or driving
    if (this.player.inVehicle) {
      this.player.inVehicle.updateChase?.(dt);
      const v = this.player.inVehicle;
      const drive = opts.drive ?? (this.scriptedDrive && opts.scripted ? this.scriptedDrive : null);
      let controls;
      if (drive) {
        controls = { throttle: drive.throttle, steerInput: drive.steer ?? 0, handbrake: Boolean(drive.handbrake), brake: false };
      } else if (input) {
        controls = {
          throttle: (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0),
          steerInput: (input.isDown('left') ? 1 : 0) - (input.isDown('right') ? 1 : 0),
          handbrake: input.isDown('jump'),
          brake: input.isDown('back'),
        };
      } else {
        controls = { throttle: 0, steerInput: 0 };
      }
      v.drive(dt, controls);
      this.player.position.set(v.position.x, v.position.y, v.position.z);
      this.player.yaw = v.yaw;
      this.audio?.updateEngine(v.speed, dt, controls.throttle);
      if (Math.abs(v.speed) > 1) this.stats.distance += Math.abs(v.speed) * dt;
      // running over pedestrians
      this._checkRunOvers(v);
      // chase camera anchor
      const anchor = { x: v.position.x, y: v.position.y, z: v.position.z };
      if (!opts.skipCamera) this.rig.update(dt, anchor, { speed: Math.abs(v.speed) });
    } else {
      if (input) this.player.update(dt, input, this.rig, this);
      else this.player.update(dt, this._nullInput(), this.rig, this);
      this.audio?.updateEngine(0, dt, 0);
      const anchor = { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z };
      if (!opts.skipCamera) this.rig.update(dt, anchor, { speed: 0 });
    }

    // AI
    this.traffic.update(dt, this);
    this.pedestrians.update(dt, this);
    this.police.update(dt, this);
    this.combat.update(dt, input ?? this._nullInput());

    // wanted decay (hidden = out of sight of any cop)
    const nearCop = this.police.nearestDistance(this.player);
    this.wanted.update(dt, nearCop > 55);

    // threat level for peds: stars plus nearby violence
    this.threatLevel = this.wanted.level;

    // missions
    this.missions.update(dt, this);

    // respawn countdown (busted / wasted) runs on simulation time
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnTimer = 0;
        if (this.respawnTo === 'revive') {
          this.player.reset(PLAYER.startX, PLAYER.startZ);
          this.player.health = PLAYER.maxHealth;
          this.player.alive = true;
          this.player.model.rotation.z = 0;
          this.state = 'play';
          this.rig.setMode('foot');
          this.onRespawn?.('revive');
        } else {
          this.state = 'play';
          this.onRespawn?.('release');
        }
      }
    }

    // world upkeep
    this.city.update(dt, this.time, this.camera, this.player.position);
    this._updateExplosions(dt);
    this.playTime += dt;

    // HUD sync
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health, PLAYER.maxHealth);
    this.hud.setWanted(this.wanted.level);
    this.hud.setWeapon('PISTOL', this.combat.ammo, this.combat.reserveAmmo);
    this.hud.setHurt(this.player.hurtFlash > 0.15);
    const inCar = Boolean(this.player.inVehicle);
    this.hud.setSpeed(inCar, inCar ? this.player.inVehicle.speedMph : 0);
    this.hud.setCrosshair(!inCar && this.player.alive && this.player.aiming);
    this.hud.setArea(this.player.position.x, this.player.position.z);
    this.audio?.updateMusic(dt, true);
    if (this.wanted.level > 0 && !this.audio?.siren) this.audio?.sirenOn();
    if (this.wanted.level === 0 && this.audio?.siren) this.audio?.sirenOff();
  }

  _nullInput() {
    if (!this._null) {
      this._null = {
        mouse: { dx: 0, dy: 0, down: false, clickedThisFrame: false, rightDown: false },
        isDown: () => false,
        wasPressed: () => false,
      };
    }
    return this._null;
  }

  /** Render-side per frame work (camera for cinematic shots, minimap, flashes). */
  renderFrame(dt, director) {
    if (director) director.update(dt, this);
    this.minimap.draw(this);
    this.hud.update(dt);
  }

  _checkRunOvers(car) {
    if (car.collisionCooldown > 0) return;
    if (Math.abs(car.speed) < 5) return;
    const f = car.forward;
    for (const ped of this.pedestrians.peds) {
      if (!ped.alive) continue;
      const dx = ped.position.x - car.position.x;
      const dz = ped.position.z - car.position.z;
      const along = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (along > 0 && along < 3.6 && side < 1.5) {
        const died = ped.hit(65 + Math.abs(car.speed) * 2, true, this);
        ped.panicFrom(car.position.x, car.position.z, 10);
        car.speed *= 0.82;
        this.audio?.impact();
        if (car.driver === 'player') this.wanted.commit('kill', 0.8);
        if (died) this.stats.kills++;
      }
    }
    // hitting other cars is a crime too
    for (const other of this.allVehicles()) {
      if (other === car) continue;
      const d = Math.hypot(other.position.x - car.position.x, other.position.z - car.position.z);
      if (d < 3.4 && Math.abs(car.speed) > 8 && car.driver === 'player') {
        other.applyDamage(12);
        if (Math.random() < 0.2) this.wanted.commit('gun', 1);
      }
    }
  }

  // ---------------------------------------------------------------- crimes
  _handleViolence(x, z, kind) {
    if (kind === 'kill') this.wanted.commit('kill', 1);
    else if (kind === 'assault') this.wanted.commit('assault', 1);
    else if (kind === 'cop') this.wanted.commit('cop', 1);
    else this.wanted.commit('gun', 1);
    this.pedestrians.panicNear(x, z, 26, 8);
    this.rig.addShake(0.12);
  }

  _handlePlayerHurt(died) {
    this.rig.addShake(0.3);
    if (died) this.onPlayerDeath();
  }

  _onWantedChange(level, before) {
    if (level > before) this.hud.showToast(`WANTED LEVEL ${level}`);
    if (level === 0 && before > 0) this.hud.showToast('YOU LOST THE COPS');
    if (level >= 3) this.police.spawnOfficers(this.player, 1);
    if (level === 0) this.audio?.sirenOff();
  }

  addCash(amount) {
    this.cash += amount;
    this.hud.setCash(this.cash);
  }

  // ---------------------------------------------------------------- vehicles
  spawnStolenVehicle(data) {
    const v = new Vehicle(this.scene, data.kind, { colour: data.colour, name: 'stolen-car' });
    v.attachCity(this.city);
    v.position.set(data.x, this.city.groundAt(data.x, data.z), data.z);
    v.yaw = data.yaw ?? 0;
    v.health = data.health ?? 100;
    v.stolen = data.stolen ?? true;
    v.isPlayerVehicle = true;
    v.syncModel();
    this.stolenVehicle = v;
    return v;
  }

  spawnMissionVehicle(kind, x, z, yaw, colour) {
    const v = new Vehicle(this.scene, kind, { colour, name: 'mission-car' });
    v.attachCity(this.city);
    v.position.set(x, this.city.groundAt(x, z), z);
    v.yaw = yaw;
    v.syncModel();
    this.missionVehicles = this.missionVehicles ?? [];
    this.missionVehicles.push(v);
    return v;
  }

  enterVehicle(v, silent = false) {
    if (!v || v.destroyed) return false;
    const p = this.player;
    p.inVehicle = v;
    v.driver = 'player';
    v.ownedByPlayerSide = true;
    v.isPlayerVehicle = true;
    v.engineOn = true;
    v.sirenOn = false;
    if (!v.stolen) {
      v.stolen = true;
      this.stats.carsStolen++;
      this.stolenVehicle = v;
      if (!silent) {
        this.wanted.commit('carjack', 1);
        this.audio?.crash(0.4);
        const prior = v.traffic ? this.traffic.cars.find((c) => c.vehicle === v) : null;
        if (prior) {
          prior.state = 'hijacked';
          if (prior.driverPanic) prior.driverPanic();
          this.hud.showToast('CARJACKED — WANTED');
          this.pedestrians.panicNear(v.position.x, v.position.z, 20, 7);
        } else {
          this.hud.showToast('VEHICLE STOLEN');
        }
      }
    }
    this.rig.setMode('car');
    this.rig.yaw = v.yaw;
    this.player.setVisible(false);
    this.hud.showBanner('');
    this.audio?.resume();
    return true;
  }

  exitVehicle() {
    const v = this.player.inVehicle;
    if (!v) return false;
    const door = v.doorPosition();
    const resolved = this.city.resolveCircle(door.x, door.z, 0.5, v.position.x, v.position.z);
    this.player.position.set(resolved.x, this.city.groundAt(resolved.x, resolved.z), resolved.z);
    this.player.inVehicle = null;
    this.player.setVisible(true);
    this.player.yaw = v.yaw + Math.PI * 0.5;
    v.driver = null;
    v.engineOn = false;
    v.speed *= 0.2;
    this.rig.setMode('foot');
    this.rig.yaw = v.yaw + Math.PI * 0.5;
    return true;
  }

  // ---------------------------------------------------------------- spawning
  spawnTrafficAt(x, z, yaw) {
    const car = new TrafficCar(this.scene, this.city, this.laneGraph, this.rngPeds, {
      spawn: { x, z, yaw, edge: nearestEdge(this.laneGraph, x, z)?.edge ?? this.laneGraph.edges[0] },
    });
    car.graph = this.laneGraph;
    car.vehicle.place(x, z, yaw);
    car.yaw = yaw;
    car.speed = 6;
    car.cruise = 10;
    this.traffic.cars.push(car);
    this.traffic.vehicles.push(car.vehicle);
    return car;
  }

  removeTrafficNear(x, z, radius) {
    for (const car of this.traffic.cars) {
      if (Math.hypot(car.vehicle.position.x - x, car.vehicle.position.z - z) < radius) {
        car.state = 'dead';
        car.vehicle.destroyed = true;
        car.vehicle.model.visible = false;
      }
    }
  }

  addPedestrianAt(x, z) {
    const ped = new Pedestrian(this.scene, this.city, this.rngPeds, { x, z });
    this.pedestrians.peds.push(ped);
    return ped;
  }

  spawnPoliceCar(x, z, yaw) {
    const cruiser = this.police.spawnCruiser(this.player, 0);
    // spawnCruiser picks its own lane; override so the shot controls the staging
    for (const c of this.police.cruisers) {
      if (c === cruiser || !cruiser) {
        const target = c ?? this.police.cruisers[this.police.cruisers.length - 1];
        if (!target) return null;
        if (Math.hypot(target.vehicle.position.x - this.player.position.x, target.vehicle.position.z - this.player.position.z) > 60) {
          target.vehicle.place(x, z, yaw);
          target.yaw = yaw;
          target.vehicle.sirenOn = true;
        }
        return target;
      }
    }
    return null;
  }

  spawnOfficerAt(x, z) {
    this.police.spawnOfficers(this.player, 1, { x, z });
    return this.police.officers[this.police.officers.length - 1];
  }

  // ---------------------------------------------------------------- consequences
  arrestPlayer() {
    if (this.state === 'arrested') return;
    this.state = 'arrested';
    this.stats.arrests++;
    this.wanted.clear();
    this.police.clearAll();
    const bribe = Math.min(this.cash * 0.1, 500);
    this.cash -= bribe;
    this.player.inVehicle = null;
    this.player.reset(PLAYER.startX, PLAYER.startZ);
    this.rig.setMode('foot');
    this.missions.failForPlayerDeath(this, 'Busted. The deal is off.');
    this.hud.showBanner('BUSTED', 3.5);
    this.hud.showToast(`BAIL PAID: $${Math.round(bribe)}`);
    this.audio?.sirenOff();
    this.onArrested?.();
    // simulation-timed, not a DOM timer, so it behaves the same in a staged frame
    this.respawnTimer = 2.4;
    this.respawnTo = 'play';
  }

  onPlayerDeath() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.wanted.clear();
    this.police.clearAll();
    this.missions.failForPlayerDeath(this, 'You went down. Nobody finishes the job.');
    this.hud.showBanner('WASTED', 4);
    this.audio?.sirenOff();
    this.onDied?.();
    this.respawnTimer = 2.6;
    this.respawnTo = 'revive';
  }

  _explodeVehicle(v) {
    if (v.destroyed && v.exploded) return;
    v.exploded = true;
    const pos = v.position.clone();
    this._spawnExplosion(pos);
    if (v.isPlayerVehicle) {
      // the player is thrown clear
      this.player.inVehicle = null;
      this.player.setVisible(true);
      this.player.position.set(pos.x + 2, this.city.groundAt(pos.x + 2, pos.z), pos.z + 2);
      this.player.health = Math.max(10, this.player.health - 35);
      this.rig.setMode('foot');
    }
    if (v.traffic) v.traffic.state = 'dead';
    this.hud.showToast('VEHICLE DESTROYED');
  }

  _spawnExplosion(pos) {
    const light = new THREE.PointLight(0xffa040, 60, 40, 2);
    light.position.copy(pos);
    light.position.y += 2;
    this.scene.add(light);
    const geo = new THREE.SphereGeometry(1.6, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const ball = new THREE.Mesh(geo, mat);
    ball.position.copy(light.position);
    this.scene.add(ball);
    this.explosions.push({ light, ball, life: 0.9, max: 0.9 });
    this.audio?.crash(1.4);
    this.rig.addShake(0.6);
    this.pedestrians.panicNear(pos.x, pos.z, 40, 10);
  }

  _updateExplosions(dt) {
    for (const e of this.explosions) {
      e.life -= dt;
      const t = 1 - e.life / e.max;
      e.ball.scale.setScalar(1 + t * 4.5);
      e.ball.material.opacity = Math.max(0, 1 - t) * 0.9;
      e.light.intensity = Math.max(0, 60 * (1 - t));
      if (e.life <= 0) {
        this.scene.remove(e.ball);
        this.scene.remove(e.light);
        e.dead = true;
      }
    }
    this.explosions = this.explosions.filter((e) => !e.dead);
  }

  _handleMissionComplete(def, reward) {
    this.addCash(0);
  }

  _handleMissionFailed(def, reason) {
    this.hud.showToast('MISSION FAILED');
  }
}