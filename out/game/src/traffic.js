// AI traffic: cars follow the lane graph, keep a safe distance from the car ahead,
// yield at junctions, and can be carjacked. Stolen AI cars become ambient scenery.
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { edgeYaw, edgeLength, nextEdge, randomLanePoint } from './roads.js';
import { clamp, damp, angleDelta } from './config.js';

export const TRAFFIC_COUNT = 26;

export class TrafficCar {
  constructor(scene, city, graph, rng, options = {}) {
    const kind = rng.weighted(['sedan', 'coupe', 'van', 'pickup', 'sports'], [5, 4, 2, 3, 2]);
    this.vehicle = new Vehicle(scene, kind, { name: 'traffic-car' });
    this.vehicle.attachCity(city);
    this.vehicle.driver = 'ai';
    const start = options.spawn ?? randomLanePoint(rng, graph);
    this.edge = start.edge;
    this.t = 0;
    this.lane = { x: start.x, z: start.z };
    this.yaw = edgeYaw(start.edge);
    this.vehicle.place(start.x, start.z, this.yaw);
    this.vehicle.health = 140;
    this.speed = rng.range(8, 13);
    this.cruise = rng.range(10, 15);
    this.stuck = 0;
    this.state = 'drive';
    this.stoppedFor = null;
    this.rng = rng;
    this.brakeTime = 0;
    this.honk = 0;
    this.wrecked = false;
    this.vehicle.onImpact = (mag) => {
      if (mag > 10) this.honk = 0.8;
    };
    this.vehicle.onDestroyed = () => {
      this.wrecked = true;
      this.state = 'dead';
    };
  }

  /** Advance along the edge, then pick the next edge at the intersection. */
  advanceAlongEdge(distance) {
    const graph = this.graph;
    if (!this.edge) return;
    let remaining = distance;
    while (remaining > 0 && this.edge) {
      const len = edgeLength(this.edge);
      const left = len - this.t;
      if (remaining < left) {
        this.t += remaining;
        remaining = 0;
      } else {
        remaining -= left;
        const next = nextEdge(graph, this.edge, edgeYaw(this.edge));
        if (!next) {
          this.edge = null;
          break;
        }
        this.edge = next;
        this.t = 0;
      }
    }
  }

  currentLanePoint() {
    const e = this.edge;
    if (!e) return { x: this.vehicle.position.x, z: this.vehicle.position.z, yaw: this.yaw };
    const len = edgeLength(e);
    const t = clamp(this.t / len, 0, 1);
    return {
      x: e.x0 + (e.x1 - e.x0) * t,
      z: e.z0 + (e.z1 - e.z0) * t,
      yaw: edgeYaw(e),
    };
  }

  update(dt, world) {
    if (this.state === 'dead') {
      this.vehicle.drive(dt, { throttle: 0, handbrake: true });
      return;
    }
    this.graph = world.laneGraph;

    // look ahead along the lane for the car in front
    const ahead = this.vehicle.forward;
    let blockDist = Infinity;
    for (const other of world.traffic.cars) {
      if (other === this || other.state === 'dead') continue;
      const dx = other.vehicle.position.x - this.vehicle.position.x;
      const dz = other.vehicle.position.z - this.vehicle.position.z;
      const along = dx * ahead.x + dz * ahead.z;
      if (along <= 0 || along > 14) continue;
      const sideways = Math.abs(dx * ahead.z - dz * ahead.x);
      if (sideways < 2.4 && along < blockDist) blockDist = along;
    }
    // and for the player, who is not on the lane graph
    const p = world.player;
    if (!p.inVehicle) {
      const dx = p.position.x - this.vehicle.position.x;
      const dz = p.position.z - this.vehicle.position.z;
      const along = dx * ahead.x + dz * ahead.z;
      const sideways = Math.abs(dx * ahead.z - dz * ahead.x);
      if (along > 0 && along < 7 && sideways < 2.0) blockDist = Math.min(blockDist, along);
    }

    const lane = this.currentLanePoint();
    // steer back onto the lane
    const laneYaw = lane.yaw;
    const targetYaw = laneYaw;
    this.yaw = damp(this.yaw, targetYaw, 3.2, dt);
    this.vehicle.yaw = this.yaw;

    // target speed: cruise, reduced by curves and obstacles
    let target = this.cruise;
    if (blockDist < 12) target = Math.min(target, Math.max(0, (blockDist - 4.2) * 1.5));
    if (world.wanted >= 3 && this.fleePolice) target += 4;
    this.brakeTime = blockDist < 6 ? this.brakeTime + dt : 0;

    // command throttle from the car's ACTUAL speed, not the AI's own idea of it
    const actual = this.vehicle.speed;
    const throttle = target > actual + 0.4 ? 1 : target < actual - 1.2 ? -1 : 0;
    this.stuck = actual < 0.5 && target > 1 ? this.stuck + dt : Math.max(0, this.stuck - dt * 2);
    this.speed = actual;

    this.vehicle.drive(dt, {
      throttle,
      steerInput: clamp(angleDelta(this.yaw, targetYaw) * 1.7, -1, 1),
      handbrake: false,
      brake: target < actual - 4,
    });

    // advance along the lane by however far we actually travelled
    this.advanceAlongEdge(Math.abs(this.vehicle.speed) * dt);

    // if wedged for a long time, respawn further along the graph
    if (this.stuck > 8) {
      const p2 = randomLanePoint(this.rng, world.laneGraph);
      this.edge = p2.edge;
      this.t = 0;
      this.vehicle.place(p2.x, p2.z, p2.yaw);
      this.yaw = p2.yaw;
      this.stuck = 0;
      this.speed = 4;
    }

    // keep clear of the player's car
    if (world.player.inVehicle) {
      const car = world.player.inVehicle;
      const dx = car.position.x - this.vehicle.position.x;
      const dz = car.position.z - this.vehicle.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.5) {
        const push = (4.5 - d) * 0.5;
        this.vehicle.position.x -= (dx / (d || 1)) * push * dt * 6;
        this.vehicle.position.z -= (dz / (d || 1)) * push * dt * 6;
      }
    }
  }
}

/**
 * Traffic pool: spawns the cars, updates them and exposes helpers the wanted system
 * and combat use (hit a car, find the nearest traffic car to steal).
 */
export class Traffic {
  constructor(scene, city, graph, rng) {
    this.scene = scene;
    this.city = city;
    this.graph = graph;
    this.rng = rng;
    this.cars = [];
    this.vehicles = [];
  }

  populate(count = TRAFFIC_COUNT) {
    const used = [];
    for (let i = 0; i < count; i++) {
      let spawn = null;
      for (let tries = 0; tries < 24; tries++) {
        const candidate = randomLanePoint(this.rng, this.graph);
        if (used.every((u) => Math.hypot(u.x - candidate.x, u.z - candidate.z) > 22)) {
          spawn = candidate;
          break;
        }
      }
      if (!spawn) continue;
      used.push(spawn);
      const car = new TrafficCar(this.scene, this.city, this.graph, this.rng, { spawn });
      car.graph = this.graph;
      car.vehicle.traffic = this;
      this.cars.push(car);
      this.vehicles.push(car.vehicle);
    }
  }

  get allVehicles() {
    return this.vehicles;
  }

  update(dt, world) {
    const cam = world.camera?.position ?? world.player.position;
    for (const car of this.cars) {
      if (car.state === 'dead') continue;
      const d = Math.hypot(car.vehicle.position.x - cam.x, car.vehicle.position.z - cam.z);
      const visible = d < 200;
      if (car.vehicle.model.visible !== visible) {
        car.vehicle.model.visible = visible;
        car.vehicle.model.traverse((o) => { if (o.isMesh) o.castShadow = d < 90; });
      }
      car.update(dt, world);
    }
    // recycle wrecks: every street should stay populated
    this.recycleTimer = (this.recycleTimer ?? 0) - dt;
    if (this.recycleTimer <= 0) {
      this.recycleTimer = 2.5;
      const dead = this.cars.filter((c) => c.state === 'dead');
      if (dead.length > 3) {
        const victim = dead[0];
        const spawn = randomLanePoint(this.rng, this.graph);
        victim.state = 'drive';
        victim.wrecked = false;
        victim.stuck = 0;
        victim.edge = spawn.edge;
        victim.t = 0;
        victim.speed = 6;
        victim.yaw = spawn.yaw;
        victim.vehicle.destroyed = false;
        victim.vehicle.exploded = false;
        victim.vehicle.health = 140;
        victim.vehicle.model.visible = true;
        victim.vehicle.place(spawn.x, spawn.z, spawn.yaw);
      }
    }
  }
}