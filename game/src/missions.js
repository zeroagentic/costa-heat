// Missions and story. Three chained jobs for Sal, the fixer at the Ocean Drive motel:
// collect a car, deliver a package under a deadline, then survive a busted deal. Each
// mission has ordered objectives, a location marker, dialogue, a cash reward, and can
// fail (time out, get arrested, be killed).
import * as THREE from 'three';
import { clamp, dist } from './config.js';
import { glowTexture } from './textures.js';
import { buildCharacter, animateCharacter } from './characters.js';

const MARKER_COLOUR = { go: 0xffd166, hot: 0xff3d8b, done: 0x45f0ff };

/** A vertical beam of light with a glowing disc at its base, bobbing gently. */
export function buildMarker(scene, colour = 0xffd166) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 32),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.06;
  group.add(disc);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2.3, 16, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.18, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 8;
  group.add(beam);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: colour, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sprite.scale.set(6, 6, 1);
  sprite.position.y = 0.9;
  group.add(sprite);
  group.userData = { disc, beam, sprite };
  scene.add(group);
  return group;
}

const MISSIONS = [
  {
    id: 'wheels',
    title: 'Sunset Wheels',
    giver: 'SAL',
    startAt: { x: -10, z: 82 },
    reward: 850,
    intro: 'My courier got cold feet. There is a cherry-red sports car parked under the palms by the marina. Bring it to the motel lot — undamaged, or it comes out of your pay.',
    outro: 'Nice and clean. That is why I like you. Here is your cut — the next one is bigger.',
    objectives: [
      { id: 'find', text: 'Steal the sports car at the marina', kind: 'car' },
      { id: 'deliver', text: 'Deliver it to Sal at the Ocean Drive motel', kind: 'zone' },
    ],
    setup(ctx) {
      const carSpot = { x: 55, z: 318 };
      const car = ctx.spawnVehicle('sports', carSpot.x, carSpot.z, Math.PI * 0.5, 0xe83a5a);
      car.stolen = true;
      ctx.state.targetCar = car;
      ctx.markers.set('find', buildMarker(ctx.scene, MARKER_COLOUR.go));
      ctx.markers.get('find').position.set(carSpot.x, ctx.city.groundAt(carSpot.x, carSpot.z), carSpot.z);
      ctx.markers.set('deliver', buildMarker(ctx.scene, MARKER_COLOUR.go));
      const lot = { x: -6, z: 74 };
      ctx.markers.get('deliver').position.set(lot.x, ctx.city.groundAt(lot.x, lot.z), lot.z);
      ctx.state.zone = { ...lot, radius: 11 };
      ctx.state.timeLimit = 0;
    },
    tick(ctx, objectiveId) {
      if (objectiveId === 'find') {
        const car = ctx.state.targetCar;
        if (car && car.destroyed) return ctx.fail('The car was wrecked before you even moved it.');
        if (car && car.stolen && ctx.player.inVehicle === car) {
          ctx.completeObjective('find');
          ctx.state.timeLimit = 140;
          ctx.hud.showToast('DELIVER THE CAR TO SAL — 2:20');
          ctx.setObjective('deliver');
        }
      }
      if (objectiveId === 'deliver') {
        const car = ctx.state.targetCar;
        if (!car || car.destroyed) return ctx.fail('The car was wrecked. Sal is not amused.');
        if (ctx.state.timeLimit > 0) {
          ctx.state.timeLimit -= ctx.dt;
          if (ctx.state.timeLimit <= 0) return ctx.fail('Too slow. The buyer walked.');
        }
        const d = dist(car.position.x, car.position.z, ctx.state.zone.x, ctx.state.zone.z);
        if (d < ctx.state.zone.radius && Math.abs(car.speed) < 6) {
          ctx.completeObjective('deliver');
        }
      }
    },
  },
  {
    id: 'package',
    title: 'Hot Package',
    giver: 'SAL',
    startAt: { x: 2, z: 88 },
    reward: 1600,
    intro: 'A briefcase needs to reach the tattoo parlour on the north strip before the cops sniff it. Do not stop for anything. Two minutes, and the clock is already running.',
    outro: 'Briefcase delivered, hands clean. You are a natural at this. Word is the Colombians want a meet.',
    objectives: [
      { id: 'pickup', text: 'Pick up the briefcase at the marina', kind: 'zone' },
      { id: 'drop', text: 'Run the briefcase north to the tattoo parlour', kind: 'zone' },
    ],
    setup(ctx) {
      const pickup = { x: 168, z: 250 };
      const drop = { x: -176, z: -292 };
      ctx.state.pickup = { ...pickup, radius: 5 };
      ctx.state.zone = { ...drop, radius: 7 };
      ctx.state.timeLimit = 0;
      ctx.markers.set('pickup', buildMarker(ctx.scene, MARKER_COLOUR.go));
      ctx.markers.get('pickup').position.set(pickup.x, ctx.city.groundAt(pickup.x, pickup.z), pickup.z);
      ctx.markers.set('drop', buildMarker(ctx.scene, MARKER_COLOUR.hot));
      ctx.markers.get('drop').visible = false;
      ctx.markers.get('drop').position.set(drop.x, ctx.city.groundAt(drop.x, drop.z), drop.z);
    },
    tick(ctx, objectiveId) {
      const p = ctx.player.position;
      if (objectiveId === 'pickup') {
        if (dist(p.x, p.z, ctx.state.pickup.x, ctx.state.pickup.z) < ctx.state.pickup.radius) {
          ctx.completeObjective('pickup');
          ctx.state.timeLimit = 120;
          ctx.markers.get('pickup').visible = false;
          ctx.markers.get('drop').visible = true;
          ctx.setObjective('drop');
          ctx.hud.showToast('BRIEFCASE SECURED — GET NORTH, 2:00');
        } else if (ctx.state.timeLimit > 0) {
          ctx.state.timeLimit -= ctx.dt;
          if (ctx.state.timeLimit <= 0) return ctx.fail('The briefcase went cold. Sal hung up.');
        }
      }
      if (objectiveId === 'drop') {
        ctx.state.timeLimit -= ctx.dt;
        if (ctx.state.timeLimit <= 0) return ctx.fail('Too late. The buyer was already gone.');
        if (dist(p.x, p.z, ctx.state.zone.x, ctx.state.zone.z) < ctx.state.zone.radius) {
          ctx.completeObjective('drop');
        }
      }
    },
  },
  {
    id: 'deal',
    title: 'Costa Heat',
    giver: 'SAL',
    startAt: { x: -18, z: 96 },
    reward: 3200,
    intro: 'The meet is on the beach at sunset. The Colombians brought muscle, and the DEA brought a tail. Take your pistol, take a fast car, and if it goes loud — get out alive. This is the big one.',
    outro: 'You made it out. So this is what it feels like to win in this town. The Keys are yours, kid.',
    objectives: [
      { id: 'meet', text: 'Drive to the beach meet', kind: 'zone' },
      { id: 'survive', text: 'Survive the ambush — wanted level 4', kind: 'combat' },
      { id: 'escape', text: 'Lose the cops and get back to Sal', kind: 'zone' },
    ],
    setup(ctx) {
      const meet = { x: 215, z: 46 };
      const back = { x: -12, z: 84 };
      ctx.state.zone = { ...meet, radius: 9 };
      ctx.state.escape = { ...back, radius: 10 };
      ctx.markers.set('meet', buildMarker(ctx.scene, MARKER_COLOUR.go));
      ctx.markers.get('meet').position.set(meet.x, ctx.city.groundAt(meet.x, meet.z), meet.z);
      ctx.markers.set('survive', buildMarker(ctx.scene, MARKER_COLOUR.hot));
      ctx.markers.get('survive').visible = false;
      ctx.markers.get('survive').position.set(meet.x + 12, ctx.city.groundAt(meet.x + 12, meet.z + 8), meet.z + 8);
      ctx.markers.set('escape', buildMarker(ctx.scene, MARKER_COLOUR.done));
      ctx.markers.get('escape').visible = false;
      ctx.markers.get('escape').position.set(back.x, 0.18, back.z);
      ctx.state.surviveTimer = 0;
      ctx.state.ambushSpawned = false;
    },
    tick(ctx, objectiveId) {
      const p = ctx.player.position;
      if (objectiveId === 'meet') {
        if (dist(p.x, p.z, ctx.state.zone.x, ctx.state.zone.z) < ctx.state.zone.radius) {
          ctx.completeObjective('meet');
          ctx.hud.say('RAMON', 'You came alone. Smart. Now hand over the case and nobody gets hurt.', 4.5);
          ctx.wanted.commit('kill', 0.7);
          ctx.wanted.refresh(60);
          ctx.markers.get('meet').visible = false;
          ctx.markers.get('survive').visible = true;
          ctx.setObjective('survive');
          ctx.police.spawnOfficers(ctx.player, 2, { x: p.x + 14, z: p.z - 8 });
          ctx.state.ambushSpawned = true;
          ctx.hud.showToast('AMBUSH — SURVIVE THE SHOOTOUT');
        }
      }
      if (objectiveId === 'survive') {
        ctx.state.surviveTimer += ctx.dt;
        if (ctx.state.surviveTimer > 14) {
          ctx.completeObjective('survive');
          ctx.markers.get('survive').visible = false;
          ctx.markers.get('escape').visible = true;
          ctx.setObjective('escape');
          ctx.hud.showToast('LOSE THE COPS — BACK TO SAL');
        }
      }
      if (objectiveId === 'escape') {
        if (dist(p.x, p.z, ctx.state.escape.x, ctx.state.escape.z) < ctx.state.escape.radius) {
          ctx.completeObjective('escape');
        }
      }
    },
  },
];

export class Missions {
  constructor(scene, city, hud, rng) {
    this.scene = scene;
    this.city = city;
    this.hud = hud;
    this.rng = rng;
    this.defs = MISSIONS;
    this.index = 0;
    this.state = 'idle';          // idle | offer | active | complete | failed
    this.active = null;
    this.markers = new Map();
    this.stageMarkers = [];
    this.failTimer = 0;
    this.completed = 0;
    this.earned = 0;
    this.giver = this._buildGiver();
    this.offerMarker = buildMarker(scene, MARKER_COLOUR.go);
    this.offerMarker.visible = false;
  }

  _buildGiver() {
    const { root, joints } = buildCharacter(this.rng, { shirt: 0x2b1d33, pants: 0xe8dcc0, skin: 0xd9a97c, hair: 0x2a2018, shades: true });
    root.name = 'mission-giver';
    this.scene.add(root);
    const def = this.defs[0];
    root.position.set(def.startAt.x, this.city.groundAt(def.startAt.x, def.startAt.z), def.startAt.z);
    root.rotation.y = Math.PI * 0.85;
    return { root, joints, phase: 0 };
  }

  get currentDef() {
    return this.defs[this.index] ?? null;
  }

  /** All world positions the minimap should draw a diamond for. */
  activeMarkers() {
    const out = [];
    if (this.state === 'offer' || this.state === 'idle') {
      const def = this.currentDef;
      if (def) out.push({ x: def.startAt.x, z: def.startAt.z, colour: '#ffd166' });
    }
    if (this.state === 'active' && this.active) {
      for (const [id, marker] of this.markers) {
        if (!marker.visible) continue;
        const obj = this.active.objectives.find((o) => o.id === id);
        if (obj && obj.state !== 'active') continue;
        out.push({ x: marker.position.x, z: marker.position.z, colour: '#ff3d8b' });
      }
    }
    return out;
  }

  /** Called by main.js when the player is near the giver and presses E. */
  canStart(world) {
    if (this.state === 'active' || this.state === 'complete') return false;
    if (!this.currentDef) return false;
    const p = world.player.position;
    if (world.player.inVehicle) return false;
    return dist(p.x, p.z, this.currentDef.startAt.x, this.currentDef.startAt.z) < 6;
  }

  begin(world) {
    const def = this.currentDef;
    if (!def) return;
    this._clearMarkers();
    this.state = 'active';
    this.active = {
      def,
      title: def.title,
      objectives: def.objectives.map((o) => ({ ...o, state: 'pending' })),
      failReason: null,
    };
    this.active.objectives[0].state = 'active';
    const ctx = this._ctx(world);
    def.setup(ctx);
    this.offerMarker.visible = false;
    this.hud.setMission(this.active);
    this.hud.say(def.giver, def.intro, 7);
    this.hud.showBanner(def.title, 3.2);
    world.audio?.pickup();
    world.onMissionStarted?.(def);
  }

  /** Progress helper handed to mission definitions. */
  _ctx(world) {
    const self = this;
    const ctx = {
      scene: this.scene,
      city: this.city,
      player: world.player,
      hud: this.hud,
      wanted: world.wanted,
      police: world.police,
      state: this.active ? this.activeState : {},
      markers: this.markers,
      dt: 0,
      get wantedLevel() { return world.wanted.level; },
      spawnVehicle(kind, x, z, yaw, colour) {
        return world.spawnMissionVehicle(kind, x, z, yaw, colour);
      },
      setObjective(id) {
        const obj = self.active.objectives.find((o) => o.id === id);
        if (obj) obj.state = 'active';
        self.hud.setMission(self.active);
      },
      completeObjective(id) {
        const obj = self.active.objectives.find((o) => o.id === id);
        if (!obj || obj.state === 'done') return;
        obj.state = 'done';
        const next = self.active.objectives.find((o) => o.state !== 'done');
        if (next) next.state = 'active';
        self.hud.setMission(self.active);
        world.audio?.pickup();
        if (!next) self.completeActive(world);
      },
      fail(reason) {
        self.failActive(world, reason);
      },
    };
    return ctx;
  }

  update(dt, world) {
    this.giver.phase += dt;
    const g = this.giver.root;
    g.position.y = this.city.groundAt(g.position.x, g.position.z);
    animateCharacter(this.giver.joints, Math.sin(this.giver.phase * 0.6) * 0.2, 0.02, { headTurn: Math.sin(this.giver.phase * 0.4) * 0.35 });

    if (this.state === 'idle' || this.state === 'offer') {
      const def = this.currentDef;
      if (def) {
        this.state = 'offer';
        this.offerMarker.visible = true;
        const y = this.city.groundAt(def.startAt.x, def.startAt.z);
        this.offerMarker.position.set(def.startAt.x, y, def.startAt.z);
        const s = 1 + Math.sin(this.giver.phase * 2) * 0.08;
        this.offerMarker.userData.sprite.scale.set(6 * s, 6 * s, 1);
      }
    }

    if (this.state === 'active' && this.active) {
      for (const m of this.markers.values()) {
        if (!m.visible) continue;
        m.userData.sprite.position.y = 0.9 + Math.sin(this.giver.phase * 2.2) * 0.25;
        m.userData.disc.material.opacity = 0.3 + Math.abs(Math.sin(this.giver.phase * 1.7)) * 0.28;
      }
      const ctx = this._ctx(world);
      ctx.dt = dt;
      // objective text = its definition, with a ticking clock when a timer runs
      for (const obj of this.active.objectives) {
        const defObj = this.active.def.objectives.find((o) => o.id === obj.id);
        obj.text = defObj ? defObj.text : obj.text;
      }
      if (this.activeState.timeLimit > 0) {
        const activeObj = this.active.objectives.find((o) => o.state === 'active');
        if (activeObj) {
          const t = Math.max(0, Math.ceil(this.activeState.timeLimit));
          activeObj.text += ` — ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        }
      }
      this.hud.setMission(this.active);
      const activeObj = this.active.objectives.find((o) => o.state === 'active');
      if (activeObj) {
        const def = this.active.def;
        def.tick(ctx, activeObj.id);
      }
    }

    if (this.state === 'complete' || this.state === 'failed') {
      this.failTimer -= dt;
      if (this.failTimer <= 0) {
        this._clearMarkers();
        this.active = null;
        this.state = 'idle';
        this.hud.setMission(null);
        // advance only after a completion; a failure replays the same mission
        if (this._advanceOnReset) {
          this.index++;
          this._advanceOnReset = false;
        }
      }
    }
  }

  /** The player was killed or busted during a mission: that mission fails. */
  failForPlayerDeath(world, reason = 'You did not make it out.') {
    if (this.state === 'active') this.failActive(world, reason);
  }

  get activeState() {
    if (!this._state) this._state = {};
    return this._state;
  }

  completeActive(world) {
    const def = this.active.def;
    this.state = 'complete';
    this.failTimer = 3.6;
    this._advanceOnReset = true;
    this.completed++;
    this.earned += def.reward;
    world.addCash(def.reward);
    this.hud.say(def.giver, def.outro, 6);
    this.hud.showBanner('MISSION COMPLETE', 3);
    this.hud.showToast(`+$${def.reward.toLocaleString('en-US')}`);
    world.audio?.pickup();
    world.onMissionComplete?.(def, def.reward);
    if (this.completed === this.defs.length) {
      this.hud.showBanner('COSTA HEAT — COMPLETE', 5);
    }
  }

  failActive(world, reason) {
    if (this.state !== 'active') return;
    this.state = 'failed';
    this.failTimer = 3.4;
    this._advanceOnReset = false;
    this.hud.say(this.active.def.giver, reason, 5);
    this.hud.showBanner('MISSION FAILED', 3);
    world.audio?.dryFire();
    world.onMissionFailed?.(this.active.def, reason);
  }

  _clearMarkers() {
    for (const m of this.markers.values()) this.scene.remove(m);
    this.markers.clear();
    this._state = {};
  }

  /** Kick off a mission without the dialogue/notification path, for staged scenes. */
  beginSilent(index, world) {
    this._clearMarkers();
    this.index = clamp(index, 0, this.defs.length - 1);
    const def = this.currentDef;
    this.state = 'active';
    this.active = {
      def,
      title: def.title,
      objectives: def.objectives.map((o, i) => ({ ...o, state: i === 0 ? 'active' : 'pending' })),
      failReason: null,
    };
    const ctx = this._ctx(world);
    def.setup(ctx);
    this.hud.setMission(this.active);
  }

  completeObjectiveSilent(id) {
    if (!this.active) return;
    const obj = this.active.objectives.find((o) => o.id === id);
    if (!obj) return;
    obj.state = 'done';
    const next = this.active.objectives.find((o) => o.state === 'pending');
    if (next) next.state = 'active';
    this.hud.setMission(this.active);
  }

  setObjectiveSilent(id) {
    for (const obj of this.active?.objectives ?? []) obj.state = obj.id === id ? 'active' : 'pending';
    this.hud.setMission(this.active);
  }

  /** Move a stage marker so the shot frames the objective in front of the player. */
  placeShotMarker(id, x, z) {
    const marker = this.markers.get(id);
    if (!marker) return;
    marker.visible = true;
    marker.position.set(x, this.city.groundAt(x, z), z);
  }

  /** Serialise progress for the save file. */
  serialise() {
    return {
      index: this.index,
      state: this.state === 'active' ? 'offer' : this.state,
      completed: this.completed,
      earned: this.earned,
    };
  }

  restore(data) {
    this._clearMarkers();
    this.active = null;
    this.index = clamp(data.index ?? 0, 0, this.defs.length);
    this.completed = data.completed ?? 0;
    this.earned = data.earned ?? 0;
    this.state = this.index >= this.defs.length ? 'complete' : 'idle';
    this.hud.setMission(null);
  }
}