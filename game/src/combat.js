// Gunplay. A hitscan pistol: raycast against pedestrians, police, cops on foot, cars and
// building walls; muzzle flash light and sprite; blood/debris puffs; recoil, spread and
// reload. Also handles damage taken feedback (vignette + camera shake).
import * as THREE from 'three';
import { clamp, damp } from './config.js';
import { glowTexture } from './textures.js';

const MAG_SIZE = 12;
const FIRE_INTERVAL = 0.28;
const RANGE = 95;

export class Combat {
  constructor(scene, camera, player, world) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.world = world;
    this.ammo = MAG_SIZE;
    this.magSize = MAG_SIZE;
    this.reserveAmmo = 96;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.recoil = 0;
    this.kick = 0;
    this.hitMarker = 0;
    this.shotsFired = 0;
    this.hits = 0;

    // muzzle flash: a sprite and a short-lived point light at the barrel
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0,
    }));
    this.flashSprite.scale.set(1.5, 1.5, 1);
    scene.add(this.flashSprite);
    this.flashLight = new THREE.PointLight(0xffd8a0, 0, 18, 2);
    scene.add(this.flashLight);
    this.flashTimer = 0;

    // impact puffs pooled
    this.puffs = [];
    const puffTex = glowTexture();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, color: 0xffb0a0, transparent: true, opacity: 0, depthWrite: false,
      }));
      s.scale.set(0.7, 0.7, 1);
      s.visible = false;
      scene.add(s);
      this.puffs.push({ sprite: s, life: 0, maxLife: 0.4 });
    }
    this.puffIndex = 0;
  }

  get busy() {
    return this.reloadTimer > 0 || this.cooldown > 0;
  }

  startReload() {
    if (this.reloadTimer > 0 || this.ammo === this.magSize) return false;
    if (this.reserveAmmo <= 0) return false;
    this.reloadTimer = 1.15;
    return true;
  }

  finishReload() {
    const need = this.magSize - this.ammo;
    const take = Math.min(need, this.reserveAmmo);
    this.ammo += take;
    this.reserveAmmo -= take;
  }

  /** All shootable targets, each with a hit test and a damage callback. */
  _targets() {
    const list = [];
    for (const ped of this.world.pedestrians.peds) {
      if (!ped.alive) continue;
      list.push({
        kind: 'ped',
        ref: ped,
        center: new THREE.Vector3(ped.position.x, ped.position.y + 1.05, ped.position.z),
        radius: 0.55,
        height: 1.9,
      });
    }
    for (const cop of this.world.police.officers) {
      if (!cop.alive) continue;
      list.push({
        kind: 'cop',
        ref: cop,
        center: new THREE.Vector3(cop.position.x, cop.position.y + 1.05, cop.position.z),
        radius: 0.55,
        height: 1.9,
      });
    }
    for (const v of this.world.allVehicles()) {
      if (v.destroyed) continue;
      list.push({
        kind: 'car',
        ref: v,
        center: new THREE.Vector3(v.position.x, v.position.y + 0.8, v.position.z),
        radius: Math.max(v.halfWidth, 1.1) * 1.1,
        height: 1.7,
      });
    }
    return list;
  }

  /** Ray vs a vertical capsule-ish cylinder. Returns distance or null. */
  _rayCylinder(origin, dir, center, radius, height) {
    const cx = center.x, cz = center.z;
    const ox = origin.x - cx, oz = origin.z - cz;
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a < 1e-6) return null;
    const b = 2 * (ox * dir.x + oz * dir.z);
    const c = ox * ox + oz * oz - radius * radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0.5) t = (-b + sq) / (2 * a);
    if (t < 0.5) return null;
    const y = origin.y + dir.y * t;
    const base = center.y - 1.05;
    if (y < base || y > base + height) return null;
    return t;
  }

  /** Fire one round from the player's aim ray. Returns the hit description. */
  fire() {
    if (this.player.inVehicle || !this.player.alive) return null;
    if (this.cooldown > 0 || this.reloadTimer > 0) return null;
    if (this.ammo <= 0) {
      this.startReload();
      this.world.audio?.dryFire();
      return null;
    }
    this.ammo--;
    this.shotsFired++;
    this.cooldown = FIRE_INTERVAL;
    this.kick = 1;
    this.world.audio?.gunshot();

    // aim from the camera centre for accuracy, plus a little spread
    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const spread = 0.012 + this.player.speedRatio * 0.02;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    const origin = cam.position.clone();

    // muzzle flash at the gun
    const muzzle = new THREE.Vector3();
    this.player.muzzlePoint.getWorldPosition(muzzle);
    this._flash(muzzle, dir);

    let best = { t: RANGE, kind: 'none' };
    for (const target of this._targets()) {
      const t = this._rayCylinder(origin, dir, target.center, target.radius, target.height);
      if (t !== null && t < best.t) best = { t, kind: target.kind, target };
    }
    // building walls stop bullets
    const wall = this._rayWalls(origin, dir, best.t);
    if (wall < best.t) best = { t: wall, kind: 'wall' };

    const hitPoint = origin.clone().addScaledVector(dir, Math.min(best.t, RANGE));
    if (best.kind === 'ped') {
      this.hits++;
      const died = best.target.ref.hit(48, true, this.world);
      this._puff(hitPoint, 0xd23a4a, 1.0);
      this.hitMarker = 1;
      this.world.audio?.impact();
      this.world.onViolence?.(best.target.ref.position.x, best.target.ref.position.z, died ? 'kill' : 'assault');
      if (died) this.world.onKill?.(best.target.ref);
      return { kind: 'ped', target: best.target.ref, died, point: hitPoint };
    }
    if (best.kind === 'cop') {
      this.hits++;
      const died = best.target.ref.hit(40, this.world);
      this._puff(hitPoint, 0x4a6ad2, 0.9);
      this.hitMarker = 1;
      this.world.audio?.impact();
      this.world.onViolence?.(this.player.position.x, this.player.position.z, 'cop');
      return { kind: 'cop', target: best.target.ref, died, point: hitPoint };
    }
    if (best.kind === 'car') {
      this.hits++;
      const car = best.target.ref;
      car.applyDamage(18);
      this._puff(hitPoint, 0xffd090, 0.8);
      this.hitMarker = 1;
      this.world.audio?.impact();
      if (car.isPlayerVehicle) this.world.onViolence?.(this.player.position.x, this.player.position.z, 'gun');
      if (car.destroyed) this.world.onVehicleDestroyed?.(car);
      return { kind: 'car', target: car, point: hitPoint };
    }
    this._puff(hitPoint, 0xcfcfcf, 0.5);
    return { kind: best.kind, point: hitPoint };
  }

  /** March the ray through building footprints; returns the nearest wall distance. */
  _rayWalls(origin, dir, limit) {
    const city = this.world.city;
    let t = 0;
    const step = 1.4;
    while (t < limit) {
      t += step;
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (city.isInsideBuilding(x, y, z)) return t;
    }
    return limit;
  }

  _flash(position, dir) {
    this.muzzleFlashAt(position, 1);
  }

  /** Public: another actor (a cop) fires, so light the scene at their barrel too. */
  muzzleFlashAt(position, size = 1) {
    this.flashSprite.position.copy(position);
    this.flashSprite.material.opacity = 1;
    this.flashSprite.scale.setScalar((0.9 + Math.random() * 0.5) * size);
    this.flashLight.position.copy(position);
    this.flashLight.intensity = 26 * size;
    this.flashTimer = 0.06;
  }

  _puff(position, colour, size) {
    const p = this.puffs[this.puffIndex];
    this.puffIndex = (this.puffIndex + 1) % this.puffs.length;
    p.sprite.position.copy(position);
    p.sprite.material.color.setHex(colour);
    p.sprite.material.opacity = 0.9;
    p.sprite.scale.setScalar(size);
    p.sprite.visible = true;
    p.life = 0.35;
    p.maxLife = 0.35;
  }

  update(dt, input) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
    this.kick = damp(this.kick, 0, 14, dt);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 2.5);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flashSprite.material.opacity = 0;
        this.flashLight.intensity = 0;
      }
    }
    for (const p of this.puffs) {
      if (p.life > 0) {
        p.life -= dt;
        p.sprite.material.opacity = Math.max(0, p.life / p.maxLife) * 0.9;
        p.sprite.scale.multiplyScalar(1 + dt * 3.4);
        if (p.life <= 0) p.sprite.visible = false;
      }
    }
    // trigger
    if (this.world.controlsActive && this.player.alive && !this.player.inVehicle) {
      if (input.mouse.down && this.world.player.aiming) this.fire();
      if (input.wasPressed('reload')) this.startReload();
    }
  }
}