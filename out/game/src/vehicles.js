// Vehicles: procedural car bodies (coupe, sedan, police cruiser, van, pickup) with
// wheels, lights and a licence plate, plus arcade driving physics that stays stable at
// any frame rate. Cars collide with buildings and with each other.
import * as THREE from 'three';
import { VEHICLE, CITY, clamp, damp, angleDelta, dampAngle } from './config.js';
import { buildVehicleBody } from './vehicle-models.js';

export const CAR_KINDS = ['coupe', 'sedan', 'van', 'pickup', 'sports'];

const BODY_COLOURS = [
  0xd93b4a, 0x2f7fd9, 0xf2f2f2, 0x1a1d22, 0xf0c94e, 0x27b39a, 0x8a5cd6, 0xe8734a, 0x9fb4c4, 0x35408a,
];

export class Vehicle {
  constructor(scene, kind, options = {}) {
    this.kind = kind;
    this.scene = scene;
    const colour = options.colour ?? BODY_COLOURS[Math.floor(Math.random() * BODY_COLOURS.length)];
    this.bodyColour = colour;
    const built = buildVehicleBody(kind, colour, options);
    this.model = built.root;
    this.wheels = built.wheels;
    this.lights = built.lights;
    this.halfWidth = built.halfWidth;
    this.halfLength = built.halfLength;
    this.name = options.name ?? 'car';
    this.model.name = this.name;

    this.position = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.speed = 0;
    this.steer = 0;
    this.angular = 0;
    this.occupied = false;
    this.driver = null;          // 'player' | 'ai' | 'police'
    this.isPolice = options.isPolice ?? false;
    this.health = 100;
    this.destroyed = false;
    this.sirenOn = false;
    this.sirenPhase = 0;
    this.braking = false;
    this.wheelSpin = 0;
    this.stolen = false;
    this.engineOn = false;
    this.collisionCooldown = 0;
    scene.add(this.model);
  }

  get forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  get right() {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  get speedMph() {
    return Math.abs(this.speed) * 2.237;
  }

  place(x, z, yaw = 0) {
    this.position.set(x, this.city ? this.city.groundAt(x, z) : 0, z);
    this.yaw = yaw;
    this.speed = 0;
    this.syncModel();
  }

  attachCity(city) {
    this.city = city;
  }

  syncModel() {
    this.model.position.set(this.position.x, this.position.y, this.position.z);
    this.model.rotation.set(this.pitch ?? 0, this.yaw, this.roll ?? 0, 'YXZ');
    const spin = this.wheelSpin;
    for (const w of this.wheels) {
      if (w.userData.steer) w.rotation.y = this.steer * 0.55;
      w.rotation.x = spin;
    }
    if (this.lights?.headlights) {
      for (const l of this.lights.headlights) l.visible = this.engineOn || this.driver === 'player';
    }
    if (this.isPolice && this.lights?.siren) {
      const phase = this.sirenPhase;
      this.lights.siren.left.visible = this.sirenOn && phase < Math.PI;
      this.lights.siren.right.visible = this.sirenOn && phase >= Math.PI;
      if (this.lights.siren.glow.isPointLight) {
        this.lights.siren.glow.color.setHex(this.sirenOn && phase < Math.PI ? 0x3355ff : 0xff3333);
        this.lights.siren.glow.intensity = this.sirenOn ? 14 : 0;
      }
      this.lights.siren.glow.visible = this.sirenOn;
    }
    if (this.lights?.brake) {
      for (const b of this.lights.brake) b.visible = this.braking || this.speed < -0.4;
    }
  }

  /** Accelerate / steer this frame from normalised controls. */
  drive(dt, controls) {
    if (this.destroyed) return;
    const { throttle = 0, steerInput = 0, handbrake = false, brake = false } = controls;
    this.engineOn = this.driver === 'player';

    // steering only bites when moving, and less at speed
    const speedFactor = clamp(Math.abs(this.speed) / 12, 0, 1);
    const maxSteer = VEHICLE.steerRate * (1 - clamp(Math.abs(this.speed) / (VEHICLE.maxSpeed * 1.9), 0, 0.55));
    this.steer = damp(this.steer, steerInput * maxSteer, 9, dt);

    const accel = VEHICLE.acceleration * 2.6;
    let target = this.speed;

    if (throttle > 0) {
      const t = Math.abs(this.speed) / (VEHICLE.maxSpeed * (this.boosting ? 1.25 : 1));
      target += accel * throttle * dt * (1 - t * t);
    } else if (throttle < 0) {
      if (this.speed > 1) target -= VEHICLE.brakeForce * dt;           // brake first
      else target -= accel * 0.5 * dt;                                // then reverse
    }
    if (brake || handbrake) target -= VEHICLE.brakeForce * 1.5 * dt * Math.sign(this.speed || 1);

    // rolling drag and idle deceleration
    const drag = VEHICLE.drag * this.speed * dt + 0.8 * dt * Math.sign(this.speed);
    if (throttle === 0) target -= drag;
    this.speed = clamp(target, -VEHICLE.reverseSpeed, VEHICLE.maxSpeed);

    this.braking = brake || handbrake || (throttle < 0 && this.speed > 0.5);

    // heading integration: yaw rate proportional to speed and steer
    const grip = handbrake ? VEHICLE.grip * 1.35 : VEHICLE.grip;
    const yawRate = this.steer * clamp(this.speed / 6, -2.2, 2.2) * (handbrake ? 1.35 : 1);
    this.yaw += yawRate * dt;
    this.angular = yawRate;

    // drift: lateral velocity bleed
    const f = this.forward;
    const moveX = f.x * this.speed * dt;
    const moveZ = f.z * this.speed * dt;
    this.wheelSpin += (this.speed / 0.34) * dt;

    this.integratePosition(moveX, moveZ, grip, dt);
    const ground = this.city ? this.city.groundAt(this.position.x, this.position.z) : 0;
    this.position.y = damp(this.position.y, ground + 0.02, 12, dt);
    // body roll and pitch: lean out of turns, squat under braking
    const targetRoll = clamp(-this.steer * this.speed * 0.014, -0.12, 0.12);
    const targetPitch = clamp(-(this.braking ? 0.06 : 0) + Math.max(0, this.speed) * 0.0008, -0.08, 0.08);
    this.roll = damp(this.roll ?? 0, targetRoll, 6, dt);
    this.pitch = damp(this.pitch ?? 0, targetPitch, 6, dt);
    this.sirenPhase = (this.sirenPhase + dt * (this.sirenOn ? 9 : 2)) % (Math.PI * 2);
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.syncModel();
  }

  integratePosition(moveX, moveZ, grip, dt) {
    if (!this.city) {
      this.position.x += moveX;
      this.position.z += moveZ;
      return;
    }
    const nx = this.position.x + moveX;
    const nz = this.position.z + moveZ;
    const radius = Math.max(this.halfWidth, 1.05);
    const resolved = this.city.resolveCircle(nx, nz, radius, this.position.x, this.position.z);
    const blocked = Math.abs(resolved.x - nx) > 0.001 || Math.abs(resolved.z - nz) > 0.001;
    this.position.x = resolved.x;
    this.position.z = resolved.z;
    if (blocked) {
      this.impact(-this.speed * 0.9);
    }
    // sea refusal
    if (this.position.x > CITY.beachMaxX - 3) {
      this.position.x = CITY.beachMaxX - 3;
      this.impact(-this.speed * 0.8);
    }
  }

  /** A collision: lose speed, take damage, tell the world. */
  impact(force) {
    const magnitude = Math.abs(force);
    if (magnitude < 2.5) return;
    if (this.collisionCooldown > 0) {
      // already reeling from a hit: keep bleeding speed but do not stack damage
      this.speed *= 0.35;
      return;
    }
    this.speed *= 0.25;
    this.health -= Math.min(28, magnitude * 0.5);
    this.collisionCooldown = 0.55;
    if (this.onImpact) this.onImpact(magnitude, this);
    if (this.health <= 0 && !this.destroyed) {
      this.destroyed = true;
      if (this.onDestroyed) this.onDestroyed(this);
    }
  }

  applyDamage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.destroyed) {
      this.destroyed = true;
      if (this.onDestroyed) this.onDestroyed(this);
    }
  }

  /** Distance from a world point to the car's body, roughly. */
  distanceTo(x, z) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    return Math.hypot(dx, dz);
  }

  /** Door position on the left side, where the player gets in and out. */
  doorPosition() {
    const r = this.right;
    return {
      x: this.position.x + r.x * (this.halfWidth + 1.2),
      z: this.position.z + r.z * (this.halfWidth + 1.2),
    };
  }

  dispose() {
    this.scene.remove(this.model);
  }
}

/** Closest car a player on foot could walk up to and drive away. */
export function nearestVehicle(vehicles, x, z, radius = 5) {
  let best = null;
  let bestD = radius * radius;
  for (const v of vehicles) {
    if (v.destroyed) continue;
    // a car with a driver can still be carjacked: that is the point of the game
    const d = v.distanceTo(x, z) ** 2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}