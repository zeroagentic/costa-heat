// Camera rig. Two modes share one orbit: on foot the camera sits behind the player's
// shoulder, driving it pulls back and widens. Pitch is clamped and the rig slides up
// when the boom would sink into the ground or clip a building.
import * as THREE from 'three';
import { clamp, damp, lerp } from './config.js';

export class CameraRig {
  constructor(camera, city) {
    this.camera = camera;
    this.city = city;
    this.yaw = Math.PI * 0.5;
    this.pitch = -0.12;
    this.mode = 'foot';
    this.distance = 1.0;
    this.currentDistance = 1.0;
    this.shoulder = 0.62;
    this.fovTarget = 68;
    this.position = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.orbit = 0;
  }

  setMode(mode) {
    this.mode = mode;
    this.distance = mode === 'car' ? 1.85 : mode === 'shot' ? 3.2 : 1.0;
    this.fovTarget = mode === 'car' ? 66 : mode === 'shot' ? 58 : 68;
    this.shoulder = mode === 'car' ? 0 : 0.72;
  }

  addShake(amount) {
    this.shakeAmount = Math.min(0.9, this.shakeAmount + amount);
  }

  /** Apply mouse look. */
  look(dx, dy) {
    this.yaw += dx;
    if (this.mode !== 'shot') {
      this.pitch = clamp(this.pitch + dy, -1.05, 0.62);
    }
  }

  /** Free-fly orbit used by the cinematic city shot. */
  setOrbit(yaw, pitch, distance) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.distance = distance;
    this.currentDistance = distance;
    this.fovTarget = 56;
  }

  update(dt, anchor, extra = {}) {
    const c = this.camera;
    this.currentDistance = damp(this.currentDistance, this.distance, 4.5, dt);
    const moveSpeed = Math.abs(extra.speed ?? 0);
    const baseFov = extra.fovBoost ? this.fovTarget : this.fovTarget;
    const fov = baseFov + Math.min(7, moveSpeed * 0.22);
    if (Math.abs(c.fov - fov) > 0.05) {
      c.fov = damp(c.fov, fov, 3.2, dt);
      c.updateProjectionMatrix();
    }

    const dist = this.currentDistance;
    const anchorY = anchor.y;
    // shoulder offset perpendicular to the look direction
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp,
    );
    const desiredTarget = new THREE.Vector3(
      anchor.x + right.x * this.shoulder,
      anchorY + (this.mode === 'car' ? 1.55 : 1.5),
      anchor.z + right.z * this.shoulder,
    );
    const carCam = this.mode === 'car';
    const desiredPos = carCam
      ? new THREE.Vector3(
        desiredTarget.x + Math.sin(this.yaw) * 8.6,
        desiredTarget.y + 3.15,
        desiredTarget.z + Math.cos(this.yaw) * 8.6,
      )
      : desiredTarget.clone().addScaledVector(dir, -dist * 4.3);

    // keep the camera out of the ground and out of buildings
    const ground = this.city.groundAt(desiredPos.x, desiredPos.z) + 0.75;
    if (desiredPos.y < ground) desiredPos.y = ground;
    if (this.city.isInsideBuilding(desiredPos.x, desiredPos.y, desiredPos.z)) {
      desiredPos.y = Math.min(anchorY + 26, desiredPos.y + 9);
      // pull toward the anchor as well
      desiredPos.lerp(desiredTarget, 0.55);
    }
    // the anchor itself must never be under the terrain either
    const aGround = this.city.groundAt(desiredTarget.x, desiredTarget.z) + 0.4;
    if (desiredTarget.y < aGround) desiredTarget.y = aGround;

    const posRate = this.mode === 'car' ? 9.5 : 16;
    this.position.x = damp(this.position.x, desiredPos.x, posRate, dt);
    this.position.y = damp(this.position.y, desiredPos.y, posRate, dt);
    this.position.z = damp(this.position.z, desiredPos.z, posRate, dt);
    this.target.x = damp(this.target.x, desiredTarget.x, 15, dt);
    this.target.y = damp(this.target.y, desiredTarget.y, 15, dt);
    this.target.z = damp(this.target.z, desiredTarget.z, 15, dt);

    c.position.copy(this.position);
    if (this.shakeAmount > 0.001) {
      this.shakeTime += dt;
      const s = this.shakeAmount * 0.32;
      c.position.x += Math.sin(this.shakeTime * 61) * s;
      c.position.y += Math.sin(this.shakeTime * 83) * s * 0.8;
      c.position.z += Math.cos(this.shakeTime * 53) * s;
      this.shakeAmount = damp(this.shakeAmount, 0, 7, dt);
    }
    c.lookAt(this.target);
    return { position: this.position, target: this.target };
  }

  /** Snap without smoothing, used when a scene is staged. */
  snap(anchor, yaw, pitch, distance) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.distance = distance;
    this.currentDistance = distance;
    this.update(1, anchor);
    this.update(1, anchor);
  }
}