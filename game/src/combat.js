// Gunplay. Two weapons the player can swap with Q:
//   PISTOL  — 9 rounds, one shot per click, tight spread, 34 damage, hitscan
//   SHOTGUN — 6 shells, eight pellets per trigger pull, wide cone, 16 damage a pellet
//   SMG     — 30 rounds, full auto, loose spread, 15 damage
// Both are hitscan against pedestrians, police, cops on foot, cars and building walls.
// Visuals: a pooled tracer streak per bullet, a muzzle flash sprite + point light, impact
// sparks that fly out of whatever was hit, blood for bodies, and a crosshair hit marker.
// Damage taken feedback (vignette + camera shake) lives here too.
import * as THREE from 'three';
import { clamp, damp } from './config.js';
import { glowTexture } from './textures.js';

/**
 * Weapon table. `pellets` > 1 means one trigger pull fires a cone of that many rays.
 * Each entry carries its own sound cue so the three guns are audibly different.
 */
export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'PISTOL',
    mag: 9,
    reserveMax: 72,
    interval: 0.26,
    reload: 1.1,
    damage: 34,
    pellets: 1,
    spread: 0.012,
    range: 95,
    auto: false,
    kick: 1.0,
    sound: 'pistol',
    tracer: 0xffe6a8,
  },
  shotgun: {
    id: 'shotgun',
    name: 'SHOTGUN',
    mag: 6,
    reserveMax: 30,
    interval: 0.78,
    reload: 1.9,
    damage: 16,
    pellets: 8,
    spread: 0.075,
    range: 42,
    auto: false,
    kick: 2.4,
    sound: 'shotgun',
    tracer: 0xffc46a,
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    mag: 30,
    reserveMax: 180,
    interval: 0.085,
    reload: 1.6,
    damage: 15,
    pellets: 1,
    spread: 0.038,
    range: 70,
    auto: true,
    kick: 0.55,
    sound: 'smg',
    tracer: 0xfff0c0,
  },
};

export const WEAPON_ORDER = ['pistol', 'shotgun', 'smg'];

const TRACER_POOL = 24;
const SPARK_POOL = 40;

export class Combat {
  constructor(scene, camera, player, world) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.world = world;

    this.weapons = {};
    for (const id of WEAPON_ORDER) {
      const def = WEAPONS[id];
      this.weapons[id] = { def, ammo: def.mag, reserve: def.reserveMax };
    }
    this.weaponIndex = 0;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.recoil = 0;
    this.kick = 0;
    this.hitMarker = 0;
    this.shotsFired = 0;
    this.hits = 0;
    this.pelletsFired = 0;
    this.triggerHeld = false;

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

    // tracer streaks: a thin additive quad stretched between two points
    this.tracers = [];
    const tracerGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < TRACER_POOL; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
        color: 0xffe6a8, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, maxLife: 0.07 });
    }
    this.tracerIndex = 0;

    // impact sparks: tiny additive quads that fly out of a hit
    this.sparks = [];
    for (let i = 0; i < SPARK_POOL; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshBasicMaterial({
        color: 0xfff0b0, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.visible = false;
      scene.add(m);
      this.sparks.push({
        mesh: m, life: 0, maxLife: 0.3,
        vx: 0, vy: 0, vz: 0,
      });
    }
    this.sparkIndex = 0;
  }

  // ------------------------------------------------------------ weapon state
  get current() {
    return this.weapons[WEAPON_ORDER[this.weaponIndex]];
  }

  get def() {
    return this.current.def;
  }

  get ammo() {
    return this.current.ammo;
  }

  set ammo(v) {
    this.current.ammo = v;
  }

  get reserveAmmo() {
    return this.current.reserve;
  }

  set reserveAmmo(v) {
    this.current.reserve = v;
  }

  get magSize() {
    return this.def.mag;
  }

  get weaponName() {
    return this.def.name;
  }

  get busy() {
    return this.reloadTimer > 0 || this.cooldown > 0;
  }

  get reloading() {
    return this.reloadTimer > 0;
  }

  /** Swap to the next weapon; cancels a reload and gives the player a beat to re-aim. */
  switchWeapon() {
    this.weaponIndex = (this.weaponIndex + 1) % WEAPON_ORDER.length;
    this.reloadTimer = 0;
    this.cooldown = Math.max(this.cooldown, 0.28);
    this.world.audio?.weaponSwitch?.();
    this.world.hud?.showToast(this.def.name);
    this.world.player.setWeaponModel?.(this.def.id);
    return this.def.id;
  }

  startReload() {
    if (this.reloadTimer > 0) return false;
    if (this.current.ammo >= this.def.mag) return false;
    if (this.current.reserve <= 0) return false;
    this.reloadTimer = this.def.reload;
    this.world.audio?.reload?.();
    return true;
  }

  finishReload() {
    const w = this.current;
    const need = w.def.mag - w.ammo;
    const take = Math.min(need, w.reserve);
    w.ammo += take;
    w.reserve -= take;
  }

  /** Refill both weapons — used when a mission pays out or the player respawns. */
  refill(fraction = 1) {
    for (const w of Object.values(this.weapons)) {
      w.reserve = Math.round(w.def.reserveMax * fraction);
    }
  }

  serialise() {
    return {
      index: this.weaponIndex,
      weapons: WEAPON_ORDER.map((id) => ({ id, ammo: this.weapons[id].ammo, reserve: this.weapons[id].reserve })),
      shots: this.shotsFired,
      hits: this.hits,
    };
  }

  restore(data) {
    if (!data) return;
    this.weaponIndex = clamp(data.index ?? 0, 0, WEAPON_ORDER.length - 1);
    for (const entry of data.weapons ?? []) {
      const w = this.weapons[entry.id];
      if (!w) continue;
      w.ammo = clamp(entry.ammo ?? w.def.mag, 0, w.def.mag);
      w.reserve = clamp(entry.reserve ?? w.def.reserveMax, 0, w.def.reserveMax);
    }
    this.shotsFired = data.shots ?? 0;
    this.hits = data.hits ?? 0;
    this.world.player.setWeaponModel?.(this.def.id);
  }

  // ---------------------------------------------------------------- hit tests
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
    for (const crew of this.world.garage?.crew ?? []) {
      if (!crew.alive) continue;
      list.push({
        kind: 'crew',
        ref: crew,
        center: new THREE.Vector3(crew.position.x, crew.position.y + 1.05, crew.position.z),
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

  // -------------------------------------------------------------------- fire
  /**
   * One trigger pull. High rate weapons (the SMG) can be held; everything else is
   * click-per-shot. Returns the array of hit descriptions.
   */
  fire() {
    if (this.player.inVehicle || !this.player.alive) return null;
    if (this.cooldown > 0 || this.reloadTimer > 0) return null;
    if (this.current.ammo <= 0) {
      if (!this.startReload()) this.world.audio?.dryFire();
      return null;
    }
    const def = this.def;
    this.current.ammo--;
    this.shotsFired++;
    this.cooldown = def.interval;
    this.kick = def.kick;
    this.world.audio?.gunshot(def.sound);

    const cam = this.camera;
    const baseDir = new THREE.Vector3();
    cam.getWorldDirection(baseDir);
    const origin = cam.position.clone();

    // muzzle flash at the gun
    const muzzle = new THREE.Vector3();
    this.player.muzzlePoint.getWorldPosition(muzzle);
    this.muzzleFlashAt(muzzle, def.kick > 1.5 ? 1.5 : 1);

    const results = [];
    for (let p = 0; p < def.pellets; p++) {
      const dir = baseDir.clone();
      const spread = def.spread + this.player.speedRatio * 0.02;
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();
      results.push(this._trace(origin, dir, def));
    }
    this.pelletsFired += def.pellets;
    this.world.player.recoilPulse?.(def.kick);
    return results;
  }

  /** March one pellet and resolve what it hits. */
  _trace(origin, dir, def) {
    let best = { t: def.range, kind: 'none' };
    for (const target of this._targets()) {
      const t = this._rayCylinder(origin, dir, target.center, target.radius, target.height);
      if (t !== null && t < best.t) best = { t, kind: target.kind, target };
    }
    // building walls stop bullets
    const wall = this._rayWalls(origin, dir, best.t);
    if (wall < best.t) best = { t: wall, kind: 'wall' };

    const hitPoint = origin.clone().addScaledVector(dir, Math.min(best.t, def.range));
    // a tracer from the barrel toward the impact
    const muzzle = new THREE.Vector3();
    this.player.muzzlePoint.getWorldPosition(muzzle);
    this.tracer(muzzle, hitPoint, def.tracer, 1);

    if (best.kind === 'ped') {
      this.hits++;
      const died = best.target.ref.hit(def.damage, true, this.world);
      this._puff(hitPoint, 0xd23a4a, 1.0);
      this.spark(hitPoint, 0xd23a4a, 4);
      this.hitMarker = 1;
      this.world.audio?.impact();
      this.world.hud?.flashHit();
      this.world.onViolence?.(best.target.ref.position.x, best.target.ref.position.z, died ? 'kill' : 'assault');
      if (died) this.world.onKill?.(best.target.ref);
      return { kind: 'ped', target: best.target.ref, died, point: hitPoint };
    }
    if (best.kind === 'cop') {
      this.hits++;
      const died = best.target.ref.hit(def.damage, this.world);
      this._puff(hitPoint, 0x4a6ad2, 0.9);
      this.spark(hitPoint, 0x9fc0ff, 4);
      this.hitMarker = 1;
      this.world.audio?.impact();
      this.world.hud?.flashHit();
      this.world.onViolence?.(this.player.position.x, this.player.position.z, 'cop');
      return { kind: 'cop', target: best.target.ref, died, point: hitPoint };
    }
    if (best.kind === 'crew') {
      this.hits++;
      const died = best.target.ref.hit(def.damage, this.world);
      this._puff(hitPoint, 0xd23a4a, 0.9);
      this.spark(hitPoint, 0xffa0a0, 4);
      this.hitMarker = 1;
      this.world.hud?.flashHit();
      return { kind: 'crew', target: best.target.ref, died, point: hitPoint };
    }
    if (best.kind === 'car') {
      this.hits++;
      const car = best.target.ref;
      car.applyDamage(def.damage * 0.55);
      this._puff(hitPoint, 0xffd090, 0.8);
      this.spark(hitPoint, 0xffe28a, 6);
      this.hitMarker = 1;
      this.world.audio?.impact();
      this.world.hud?.flashHit();
      if (car.isPlayerVehicle) this.world.onViolence?.(this.player.position.x, this.player.position.z, 'gun');
      if (car.destroyed) this.world.onVehicleDestroyed?.(car);
      return { kind: 'car', target: car, point: hitPoint };
    }
    if (best.kind === 'wall') {
      this.spark(hitPoint, 0xffeccc, 5);
      this._puff(hitPoint, 0xe8e0d0, 0.45);
      return { kind: 'wall', point: hitPoint };
    }
    this._puff(hitPoint, 0xcfcfcf, 0.4);
    return { kind: 'none', point: hitPoint };
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

  // ----------------------------------------------------------------- effects
  /** Public: another actor (a cop, a chopper) fires, so light the scene at their barrel. */
  muzzleFlashAt(position, size = 1) {
    this.flashSprite.position.copy(position);
    this.flashSprite.material.opacity = 1;
    this.flashSprite.scale.setScalar((0.9 + Math.random() * 0.5) * size);
    this.flashLight.position.copy(position);
    this.flashLight.intensity = 26 * size;
    this.flashTimer = 0.06;
  }

  /** A stretched additive quad from `from` to `to`, fading in ~70 ms. */
  tracer(from, to, colour = 0xffe6a8, width = 1) {
    const t = this.tracers[this.tracerIndex];
    this.tracerIndex = (this.tracerIndex + 1) % this.tracers.length;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.3) return;
    const mid = from.clone().addScaledVector(dir, 0.5);
    t.mesh.position.copy(mid);
    t.mesh.scale.set(Math.max(0.05, 0.022 * width), len, 1);
    t.mesh.material.color.setHex(colour);
    t.mesh.material.opacity = 0.95;
    t.mesh.visible = true;
    // orient the quad so its long axis runs along the bullet path
    t.mesh.lookAt(to);
    t.life = 0.07;
    t.maxLife = 0.07;
  }

  /** A burst of little hot quads flying out of an impact point. */
  spark(position, colour = 0xfff0b0, count = 5) {
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.sparkIndex];
      this.sparkIndex = (this.sparkIndex + 1) % this.sparks.length;
      s.mesh.position.copy(position);
      s.mesh.material.color.setHex(colour);
      s.mesh.material.opacity = 1;
      s.mesh.visible = true;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 3 + 1.2;
      const out = Math.random() * 3.4 + 1;
      s.vx = Math.cos(a) * out;
      s.vy = up;
      s.vz = Math.sin(a) * out;
      s.life = 0.22 + Math.random() * 0.14;
      s.maxLife = 0.3;
      s.mesh.scale.setScalar(0.6 + Math.random() * 1.4);
    }
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

  // ------------------------------------------------------------------ update
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
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / t.maxLife) * 0.95;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const s of this.sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.vy -= 14 * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.mesh.material.opacity = Math.max(0, s.life / s.maxLife);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }

    // trigger
    if (this.world.controlsActive && this.player.alive && !this.player.inVehicle) {
      const pressed = input.wasPressed('fire') || input.mouse?.clickedThisFrame;
      const held = input.mouse?.down || input.isDown('fire');
      if (this.def.auto) {
        // SMG: hold the button and it keeps talking
        if (held && this.player.aiming) this.fire();
      } else if (pressed && this.player.aiming) {
        this.fire();
      }
      if (input.wasPressed('reload')) this.startReload();
      if (input.wasPressed('weapon')) this.switchWeapon();
    }
    // auto-reload when the magazine runs out and the trigger is still down
    if (this.current.ammo === 0 && this.reloadTimer <= 0 && this.current.reserve > 0) this.startReload();
  }

  /** Verification helper: totals across every weapon, for the dossier/report. */
  stats() {
    return {
      weapon: this.def.id,
      name: this.def.name,
      ammo: this.current.ammo,
      reserve: this.current.reserve,
      mag: this.def.mag,
      shots: this.shotsFired,
      pellets: this.pelletsFired,
      hits: this.hits,
      accuracy: this.pelletsFired ? +(this.hits / this.pelletsFired).toFixed(3) : 0,
      weapons: WEAPON_ORDER.map((id) => ({
        id,
        ammo: this.weapons[id].ammo,
        reserve: this.weapons[id].reserve,
        mag: WEAPONS[id].mag,
        damage: WEAPONS[id].damage,
        pellets: WEAPONS[id].pellets,
        interval: WEAPONS[id].interval,
      })),
    };
  }
}