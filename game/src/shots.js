// Staged screenshot scenes. `?shot=<name>&seed=<n>` boots the game into a hands-off
// state: no title screen, HUD on, a deterministic seed, and a fixed camera. Every state
// is reached by running the real systems forward, exactly like normal play, so what the
// screenshot shows is what the game does.
import * as THREE from 'three';
import { streamRng } from './random.js';
import { nearestEdge, edgeYaw } from './roads.js';
import { CITY, clamp } from './config.js';
import { castMember } from './cast.js';

export const SHOT_NAMES = ['drive', 'chase', 'mission', 'city'];

/** Read `?shot=` and `?seed=` from the URL. */
export function parseShotParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  const shot = params.get('shot');
  if (!shot || !SHOT_NAMES.includes(shot)) return null;
  const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
  return { shot, seed };
}

/** The north-south avenue nearest a given x, heading north. */
function northAvenue(graph, wantX) {
  let best = null;
  let bestD = Infinity;
  for (const e of graph.edges) {
    if (e.x0 !== e.x1) continue;
    if (edgeYaw(e) > 0) continue;            // heading north (-Z)
    const d = Math.abs(e.x0 - wantX);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best ?? graph.edges[0];
}

/** Run fixed simulation steps so the world settles before the frame is captured. */
function settle(world, steps, dt = 1 / 60, drive = null) {
  for (let i = 0; i < steps; i++) world.stepSimulation(dt, { scripted: true, drive });
}

export class ShotDirector {
  constructor(world) {
    this.world = world;
    this.name = null;
    this.seed = 1;
    this.time = 0;
    this.cameraPose = null;
    this.cameraFn = null;
    this.scripted = { throttle: 0, steer: 0, handbrake: false };
  }

  /**
   * Set up a shot. Everything happens before the first rendered frame: this is why the
   * screenshots are reproducible — no wall-clock time, no user input, one stream per shot.
   */
  stage(name, seed) {
    this.name = name;
    this.seed = seed;
    const world = this.world;
    const rng = streamRng(seed, `shot-${name}`);
    world.setDeterministic(true);

    if (name === 'drive') return this._stageDrive(rng);
    if (name === 'chase') return this._stageChase(rng);
    if (name === 'mission') return this._stageMission(rng);
    return this._stageCity(rng);
  }

  // ---------------------------------------------------------------- drive
  // Stolen car heading north up Ocean Drive at speed: sea and sun on the right,
  // traffic ahead, palms along the promenade, two stars on the HUD.
  _stageDrive(rng) {
    const world = this.world;
    const p = world.player;
    const avenue = northAvenue(world.laneGraph, 180);
    const laneX = avenue.x0 + 4.4;
    const laneZ = 250;

    p.position.set(laneX, 0, laneZ);
    p.yaw = 0;

    const car = world.spawnStolenVehicle({ kind: 'coupe', colour: 0xff3f6f, x: laneX, z: laneZ, yaw: 0 });
    car.stolen = true;
    world.enterVehicle(car, true);
    car.speed = 24;
    car.yaw = 0;
    car.position.set(laneX, 0.02, laneZ);

    // traffic ahead in both directions and one close behind
    world.removeTrafficNear(laneX, laneZ, 40);
    world.spawnTrafficAt(laneX, laneZ - 26, 0);
    world.spawnTrafficAt(laneX - 8.8, laneZ - 58, Math.PI);
    world.spawnTrafficAt(laneX, laneZ - 84, 0);
    world.spawnTrafficAt(laneX - 8.8, laneZ - 120, Math.PI);
    world.spawnTrafficAt(laneX - 8.8, laneZ + 24, Math.PI);
    world.spawnTrafficAt(laneX, laneZ + 58, 0);

    // pedestrians on the promenade and the beach side
    world.addPedestrianAt(CITY.landMaxX - 3, laneZ - 14);
    world.addPedestrianAt(CITY.landMaxX - 8, laneZ - 26);
    world.addPedestrianAt(CITY.landMaxX + 7, laneZ - 40);
    world.addPedestrianAt(CITY.landMaxX + 4, laneZ - 60);

    world.cash = 12450;
    world.missions.beginSilent(0, world);
    world.missions.completeObjectiveSilent('find');
    world.wanted.setLevel(2);

    world.rig.setMode('shot');

    settle(world, 50);
    // drive forwards for real: throttle held, wheels turning, speed climbing
    settle(world, 70, 1 / 60, { throttle: 1, steer: 0 });
    car.speed = Math.max(car.speed, 25);
    world.wanted.setLevel(2);

    // Three-quarter cinematic rig built from the car's ACTUAL final position after the
    // settle. The pose has to be anchored there rather than fixed in world space: the
    // car keeps accelerating through the shot, so a static camera would be left behind.
    // Low and close, so the stolen coupe fills the left of frame while the avenue,
    // palms and sunset recede to the right.
    const anchor = car.position;
    const heading = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
    const right = new THREE.Vector3(heading.z, 0, -heading.x);
    const camPos = anchor.clone()
      .addScaledVector(heading, 5.6)  // forward of the car, giving us its front quarter
      .addScaledVector(right, 4.6)    // offset across the road
      .setY(1.85);                    // near bonnet height
    const aimAt = anchor.clone().addScaledVector(heading, 0.4).setY(1.05);
    this.cameraPose = { eye: camPos, target: aimAt };
    this.cameraFn = () => {
      world.camera.position.copy(this.cameraPose.eye);
      world.camera.lookAt(this.cameraPose.target.x, this.cameraPose.target.y, this.cameraPose.target.z);
      world.camera.fov = 56;
      world.camera.updateProjectionMatrix();
    };
    this.cameraFn();

    // the right-hand kerb was a flat wash: queue traffic and pedestrians along it so the
    // bottom-right of frame carries detail at the near distance
    for (let i = 0; i < 5; i++) {
      world.spawnTrafficAt(laneX + 8.8, laneZ - 12 - i * 14, Math.PI);
    }
    for (let i = 0; i < 6; i++) {
      world.addPedestrianAt(laneX + 11.5 + (i % 2) * 2.4, laneZ - 8 - i * 7.5);
    }

    world.hud.say(castMember('sal').name, castMember('sal').lines.return, 6);
    world.hud.showToast('OCEAN DRIVE  ·  MARISOL');
    return { hud: true, freezeInput: true };
  }

  // ---------------------------------------------------------------- chase
  // Four stars, three cruisers on the player's tail, officers on the kerb firing. The
  // camera sits ahead of the player looking back so the pursuit is visible.
  _stageChase(rng) {
    const world = this.world;
    const p = world.player;
    const avenue = northAvenue(world.laneGraph, -20);
    const laneX = avenue.x0 + 4.4;
    const laneZ = -40;

    p.position.set(laneX, 0, laneZ);
    const car = world.spawnStolenVehicle({ kind: 'sports', colour: 0x1b1f2a, x: laneX, z: laneZ, yaw: 0 });
    car.stolen = true;
    world.enterVehicle(car, true);
    car.speed = 20;
    car.yaw = 0;

    world.wanted.heat = 0;
    world.wanted.level = 0;
    world.wanted.setLevel(4);
    world.cash = 38200;
    world.missions.beginSilent(2, world);

    // three cruisers behind, staggered across both northbound lanes
    for (let i = 0; i < 3; i++) {
      const z = laneZ + 9 + i * 9;
      const x = laneX + (i % 2 === 0 ? 0 : 8.8);
      const cruiser = world.spawnPoliceCar(x, z, 0);
      if (cruiser) {
        cruiser.vehicle.place(x, z, 0);
        cruiser.yaw = 0;
        cruiser.vehicle.sirenOn = true;
        cruiser.vehicle.speed = 18 - i * 2;
        cruiser.speed = 18 - i * 2;
      }
    }
    // officers on the east kerb, weapons up, between the player and the pursuit
    world.spawnOfficerAt(laneX + 11, laneZ + 4);
    world.spawnOfficerAt(laneX + 12.5, laneZ + 15);

    // traffic on the far lane and panicking pedestrians
    world.spawnTrafficAt(laneX - 8.8, laneZ - 34, Math.PI);
    world.spawnTrafficAt(laneX - 8.8, laneZ + 46, Math.PI);
    world.addPedestrianAt(laneX + 10, laneZ - 8);
    world.addPedestrianAt(laneX + 9, laneZ + 24);

    const rig = world.rig;
    rig.setMode('car');
    rig.yaw = 0;
    rig.pitch = -0.03;

    settle(world, 50);
    settle(world, 40, 1 / 60, { throttle: 0.75, steer: 0 });

    // freeze a muzzle flash from a shooting officer for the frame
    const officer = world.police.officers.find((o) => o.alive);
    if (officer) {
      const m = new THREE.Vector3();
      officer.weapon.children[0].getWorldPosition(m);
      world.combat.muzzleFlashAt(m, 1.2);
      officer.joints.rightArm.rotation.x = -1.45;
      officer.joints.leftArm.rotation.x = -1.2;
      officer.joints.leftArm.rotation.z = 0.34;
    }
    // camera: ahead of the player's car and low, looking back down the avenue at the pursuit
    this.cameraFn = () => {
      const v = world.player.inVehicle;
      const f = v.forward;
      const r = v.right;
      const eye = new THREE.Vector3(
        v.position.x + f.x * 15 + r.x * 3.4,
        v.position.y + 3.0,
        v.position.z + f.z * 15 + r.z * 3.4,
      );
      const look = new THREE.Vector3(v.position.x - f.x * 12, v.position.y + 1.4, v.position.z - f.z * 12);
      const g = world.city.groundAt(eye.x, eye.z) + 0.9;
      if (eye.y < g) eye.y = g;
      world.camera.position.copy(eye);
      world.camera.lookAt(look);
      world.camera.fov = 46;
      world.camera.updateProjectionMatrix();
    };
    // five stars: the helicopter is up (Air One) and a roadblock stands on the road ahead,
    // so this one frame shows the pursuit, the air unit and the blockade at once.
    world.wanted.setLevel(5);
    world.wanted.refresh(0);

    // Air One overhead and just ahead, rotors turning, searchlight on the player
    world.helicopter.deploy({ x: world.player.position.x + 6, y: 26, z: world.player.position.z - 26 });
    for (let i = 0; i < 12; i++) world.helicopter.update(1 / 60, world);
    if (world.helicopter.searchlight) world.helicopter.searchlight.visible = true;

    // a real roadblock on the road ahead: update() spawns blocks only at 5 stars, so drive
    // the system forward until one stands in front of the player
    if (world.roadblocks) {
      for (let i = 0; i < 240 && world.roadblocks.blocks.length === 0; i++) {
        world.roadblocks.update(1 / 60, world);
      }
    }

    world.hud.say(castMember('brisco').name, castMember('brisco').lines.l5, 6);
    world.hud.showToast('WANTED — 5 STARS  ·  CITY LOCKDOWN');
    return { hud: true, freezeInput: true };
  }

  // ---------------------------------------------------------------- mission
  // On foot, pistol drawn, mission marker ahead on the pavement, crowd around.
  _stageMission(rng) {
    const world = this.world;
    const p = world.player;
    const x = CITY.landMaxX - 5;
    const z = 128;
    p.position.set(x, 0.18, z);
    p.yaw = 0;
    p.targetYaw = 0;
    p.forcedAim = true;
    p.combatReady = true;
    p.weapon.visible = true;

    world.cash = 6800;
    world.wanted.refresh(18);   // 1 star
    world.missions.beginSilent(1, world);
    world.missions.setObjectiveSilent('drop');
    world.missions.placeShotMarker('drop', x - 1, z - 30);

    // pedestrians walking the pavement, two of them close enough to fill the frame
    for (let i = 0; i < 7; i++) {
      world.addPedestrianAt(x + (i % 4) * 2.2 - 3.4, z - 7 - i * 2.6);
    }
    world.addPedestrianAt(x + 4, z - 13);
    world.addPedestrianAt(x - 5, z - 17);

    // traffic on Ocean Drive behind and ahead
    world.spawnTrafficAt(x - 12, z - 24, 0);
    world.spawnTrafficAt(x - 12, z + 16, Math.PI);
    world.spawnTrafficAt(x - 20, z - 46, 0);
    // fill the right-hand third: the frame was empty there, so push life and parked metal
    // onto the beach side to give the eye something at every depth plane
    for (let i = 0; i < 6; i++) {
      world.addPedestrianAt(x + 9 + (i % 3) * 3.1, z - 10 - i * 5.4);
    }
    for (let i = 0; i < 4; i++) {
      world.spawnTrafficAt(x - 4, z - 34 - i * 17, Math.PI);
    }
    world.addPedestrianAt(x + 13, z - 30);
    world.addPedestrianAt(x + 16, z - 44);

    const rig = world.rig;
    rig.setMode('foot');
    rig.yaw = 0.2;
    rig.pitch = -0.02;
    rig.shoulder = 0.75;
    rig.distance = 0.68;

    settle(world, 40);
    world.hud.say(castMember('sal').name, castMember('sal').lines.arcWarn, 6);
    world.hud.showToast('BRIEFCASE  ·  1:38');
    return { hud: true, freezeInput: true };
  }

  // ---------------------------------------------------------------- city
  // The wide one: from over the water, looking west-north-west along the beach at the
  // downtown skyline, with palms, Ocean Drive traffic and the warm sun behind the lens.
  _stageCity(rng) {
    const world = this.world;
    const p = world.player;
    p.position.set(120, 0.18, 120);
    p.yaw = 0;
    world.cash = 21400;
    world.wanted.clear();

    // busy avenue: cars in both directions along Ocean Drive
    for (let i = 0; i < 7; i++) {
      const z = 60 + i * 40;
      world.spawnTrafficAt(180 + 4.4, z, 0);
      world.spawnTrafficAt(180 - 4.4, z + 20, Math.PI);
    }
    world.spawnTrafficAt(-20, 140, Math.PI);
    world.spawnTrafficAt(-120, 60, 0);

    // a crowd on the sand so the beach reads at distance
    for (let i = 0; i < 16; i++) {
      world.addPedestrianAt(CITY.landMaxX + 5 + (i % 4) * 6, 20 + i * 11);
      if (i % 2 === 0) world.addPedestrianAt(CITY.landMaxX - 3 - (i % 3) * 4, -40 + i * 9);
    }

    this.cameraPose = {
      eye: new THREE.Vector3(300, 34, 268),
      target: new THREE.Vector3(-215, 20, 10),
    };
    world.rig.setMode('shot');
    world.player.setVisible(false);

    settle(world, 70);
    this.cameraFn = () => {
      const { eye, target } = this.cameraPose;
      const sway = Math.sin(this.time * 0.16) * 1.2;
      world.camera.position.set(eye.x + sway, eye.y + Math.sin(this.time * 0.2) * 0.5, eye.z);
      world.camera.lookAt(target.x, target.y, target.z);
      world.camera.fov = 54;
      world.camera.updateProjectionMatrix();
    };
    this.cameraFn();
    return { hud: true, freezeInput: true, cinematic: true };
  }

  /** Pose the camera for the final frame; called after staging, no further simulation. */
  poseFinal() {
    this.time = 0.6;
    if (this.cameraFn) this.cameraFn(0);
  }

  /** Per-frame work while a staged shot is live. */
  update(dt, world) {
    this.time += dt;
    if (this.cameraFn) this.cameraFn(dt);
    if (this.name === 'drive') {
      // keep the car rolling down the avenue under its own power
      world.scriptedDrive = { throttle: 0.8, steer: 0 };
    }
    if (this.name === 'chase') {
      world.scriptedDrive = { throttle: 0.85, steer: 0 };
    }
  }
}