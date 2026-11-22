// The player on foot: movement in camera space, sprint, jump with gravity, collision
// against buildings and kerbs, water refusal, health and the walk cycle. Also owns the
// pistol model and the aim pose; combat.js does the shooting.
import * as THREE from 'three';
import { PLAYER, CITY, clamp, damp, dampAngle, angleDelta } from './config.js';
import { buildCharacter, animateCharacter } from './characters.js';
import { movementAxis } from './input.js';

export class Player {
  constructor(scene, city, camera) {
    this.city = city;
    this.camera = camera;
    this.scene = scene;

    const { root, joints } = buildCharacter({ next: () => 0.3, pick: (a) => a[0] }, {
      shirt: 0xf4f2ec, pants: 0x2b3550, skin: 0xe8bb95, hair: 0x1b1512, shades: true,
    });
    this.model = root;
    this.joints = joints;
    root.name = 'player';
    scene.add(root);

    // pistol held in the right hand group
    this.weapon = this._buildPistol();
    joints.rightArm.add(this.weapon);
    this.weaponModels = { pistol: this.weapon };
    this.weaponModels.shotgun = this._buildShotgun();
    this.weaponModels.smg = this._buildSmg();
    for (const [id, model] of Object.entries(this.weaponModels)) {
      if (id === 'pistol') continue;
      model.visible = false;
      joints.rightArm.add(model);
    }
    this.currentWeapon = 'pistol';
    this.muzzlePoints = {};
    for (const [id, model] of Object.entries(this.weaponModels)) {
      this.muzzlePoints[id] = model.userData.muzzle;
    }
    this.muzzlePoint = this.muzzlePoints.pistol;

    this.position = new THREE.Vector3(PLAYER.startX, 0, PLAYER.startZ);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.phase = 0;
    this.speedRatio = 0;
    this.onGround = true;
    this.health = PLAYER.maxHealth;
    this.alive = true;
    this.aiming = false;
    this.inVehicle = null;
    this.hurtFlash = 0;
    this.lastDamageAt = -99;
    this.strideDistance = 0;
    this.stepSide = 0;
    this.radius = PLAYER.radius;
    this.visible = true;
    this.deathTimer = 0;
  }

  _buildPistol() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.26), new THREE.MeshStandardMaterial({ color: 0x22242a, metalness: 0.75, roughness: 0.32 }));
    body.position.set(0, -0.72, 0.12);
    g.add(body);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.07), new THREE.MeshStandardMaterial({ color: 0x2d2118, roughness: 0.8 }));
    grip.position.set(0, -0.79, 0.01);
    g.add(grip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, -0.72, 0.26);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    return g;
  }

  /** Pump-action shotgun: long barrel, wooden stock, wide receiver. */
  _buildShotgun() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x1c2026, metalness: 0.82, roughness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.72 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.66, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.7, 0.32);
    g.add(barrel);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.52, 8), metal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.76, 0.28);
    g.add(tube);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.24), metal);
    receiver.position.set(0, -0.7, 0.02);
    g.add(receiver);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.3), wood);
    stock.position.set(0, -0.76, -0.2);
    stock.rotation.x = -0.08;
    g.add(stock);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 0.18), wood);
    pump.position.set(0, -0.76, 0.2);
    g.add(pump);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, -0.7, 0.66);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    return g;
  }

  /** Compact SMG: stubby receiver, stick magazine, folding stock. */
  _buildSmg() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x24272d, metalness: 0.78, roughness: 0.36 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.11, 0.34), metal);
    body.position.set(0, -0.7, 0.1);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.68, 0.36);
    g.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.07), dark);
    mag.position.set(0, -0.84, 0.08);
    mag.rotation.x = 0.18;
    g.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), dark);
    grip.position.set(0, -0.8, -0.04);
    g.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), metal);
    stock.position.set(0, -0.7, -0.2);
    g.add(stock);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, -0.68, 0.48);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    return g;
  }

  /** Called by combat when the weapon swaps: show one model, hide the rest. */
  setWeaponModel(id) {
    if (!this.weaponModels || !this.weaponModels[id]) return;
    this.currentWeapon = id;
    for (const [key, model] of Object.entries(this.weaponModels)) model.visible = key === id;
    this.muzzlePoint = this.muzzlePoints[id] ?? this.muzzlePoints.pistol;
    this.weapon = this.weaponModels[id];
    this.weaponSwapTimer = 0.25;
  }

  /** Recoil kick for the camera and the gun hand. */
  recoilPulse(amount = 1) {
    this.recoil = Math.min(1.4, (this.recoil ?? 0) + 0.35 * amount);
  }

  reset(x = PLAYER.startX, z = PLAYER.startZ) {
    this.position.set(x, this.city.groundAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.health = PLAYER.maxHealth;
    this.alive = true;
    this.deathTimer = 0;
    this.onGround = true;
    this.phase = 0;
  }

  setVisible(v) {
    this.visible = v;
    this.model.visible = v;
  }

  get eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + PLAYER.eyeHeight, this.position.z);
  }

  get aimingEnabled() {
    return !this.inVehicle && this.alive;
  }

  /** World-space muzzle position and forward direction for gunfire. */
  aimRay() {
    const dir = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const up = (this.camera?.pitch ?? 0);
    dir.y = Math.sin(-up) * 0.5;
    dir.normalize();
    const origin = this.eyePosition.clone();
    origin.x += dir.x * 0.45;
    origin.z += dir.z * 0.45;
    origin.y -= 0.14;
    return { origin, dir };
  }

  takeDamage(amount, source = 'gunfire') {
    if (!this.alive) return false;
    this.health = clamp(this.health - amount, 0, PLAYER.maxHealth);
    this.hurtFlash = 1;
    this.lastDamageAt = 0;
    if (this.health <= 0) {
      this.alive = false;
      this.deathTimer = 0;
      return true;
    }
    return false;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, PLAYER.maxHealth);
  }

  update(dt, input, rig, world) {
    if (!this.alive) {
      this.deathTimer += dt;
      this.model.rotation.z = damp(this.model.rotation.z, Math.PI / 2.1, 4, dt);
      this.model.position.set(this.position.x, this.city.groundAt(this.position.x, this.position.z), this.position.z);
      return;
    }
    this.model.rotation.z = damp(this.model.rotation.z, 0, 8, dt);

    if (this.inVehicle) {
      // seated: hidden, position rides the car
      this.model.visible = false;
      return;
    }
    this.model.visible = this.visible;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    this.lastDamageAt += dt;

    const axis = movementAxis(input);
    const sprint = input.isDown('sprint');
    const aiming = input.mouse.down || input.mouse.rightDown || this.forcedAim;
    this.aiming = aiming;
    const speed = sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const moveSpeed = aiming ? speed * 0.55 : speed;

    // direction in camera space: yaw follows the camera, so W is always "into the screen"
    const camYaw = rig.yaw;
    const fwdX = -Math.sin(camYaw);
    const fwdZ = -Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);
    let wishX = fwdX * axis.z + rightX * axis.x;
    let wishZ = fwdZ * axis.z + rightZ * axis.x;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.001) {
      wishX /= wishLen;
      wishZ /= wishLen;
      this.targetYaw = Math.atan2(-wishX, -wishZ);
    }

    if (aiming) {
      // strafing while aiming: face the camera, not the movement
      this.targetYaw = camYaw + Math.PI;
    }

    const accel = this.onGround ? 46 : 14;
    const targetVX = wishX * moveSpeed * (wishLen > 0.001 ? 1 : 0);
    const targetVZ = wishZ * moveSpeed * (wishLen > 0.001 ? 1 : 0);
    this.velocity.x = damp(this.velocity.x, targetVX, accel / 3, dt);
    this.velocity.z = damp(this.velocity.z, targetVZ, accel / 3, dt);

    // gravity + jump
    if (this.onGround && input.wasPressed('jump')) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.onGround = false;
      world.audio?.footstep(0.6, this.position);
    }
    this.velocity.y -= PLAYER.gravity * dt;

    // horizontal step with collision
    const prevX = this.position.x;
    const prevZ = this.position.z;
    let nx = this.position.x + this.velocity.x * dt;
    let nz = this.position.z + this.velocity.z * dt;
    // refuse to walk into the sea
    if (nx > CITY.beachMaxX - 1.2) {
      nx = CITY.beachMaxX - 1.2;
      this.velocity.x *= -0.2;
    }
    const resolved = this.city.resolveCircle(nx, nz, this.radius, prevX, prevZ);
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    const ground = this.city.groundAt(this.position.x, this.position.z);
    this.position.y += this.velocity.y * dt;
    if (this.position.y <= ground) {
      if (this.velocity.y < -9) world.audio?.footstep(0.5, this.position);
      this.position.y = ground;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.position.y > ground + 0.02) {
      this.onGround = false;
    }
    // step up kerbs smoothly
    if (this.onGround) this.position.y = damp(this.position.y, ground, 18, dt);

    // yaw damping toward travel or aim direction
    const turnRate = aiming ? 22 : 12;
    this.yaw = dampAngle(this.yaw, this.targetYaw, turnRate, dt);

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.speedRatio = damp(this.speedRatio, horizSpeed / PLAYER.runSpeed, 8, dt);

    // walk cycle + footsteps
    if (horizSpeed > 0.35 && this.onGround) {
      this.phase += dt * (4.2 + horizSpeed * 0.85);
      this.strideDistance += horizSpeed * dt;
      if (this.strideDistance > (sprint ? 1.5 : 1.1)) {
        this.strideDistance = 0;
        this.stepSide ^= 1;
        world.audio?.footstep(sprint ? 0.55 : 0.32, this.position, this.stepSide);
      }
    } else {
      this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 6, dt);
    }
    const lean = clamp(horizSpeed / PLAYER.runSpeed, 0, 1) * 0.12;
    animateCharacter(this.joints, this.phase, Math.min(1.2, horizSpeed / PLAYER.walkSpeed), {
      aim: aiming, lean, flee: false,
    });
    this.weapon.visible = aiming || this.combatReady === true;
    // recoil kicks the gun hand back and bleeds off
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 5.5);
      this.joints.rightArm.rotation.x -= this.recoil * 0.5;
      this.model.position.z += this.recoil * 0.05;
    }

    this.model.position.set(this.position.x, this.position.y, this.position.z);
    this.model.rotation.y = this.yaw;
    this.model.rotation.z = Math.sin(this.phase * 0.5) * 0.02;

    // decay the forced-aim flag set by shots
    if (this.forcedAim) this.forcedAimHold = (this.forcedAimHold ?? 0) + dt;
  }
}

export function playerAnchor(player) {
  return { x: player.position.x, y: player.position.y, z: player.position.z };
}