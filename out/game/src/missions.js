// Missions and story. Five chained jobs in Vista Mar, each handed out by a NAMED character
// with 2-4 lines of dialogue in the HUD box, ordered objectives, a location marker, a cash
// reward and a failure path. The mechanics deliberately vary:
//
//   1 WHEELS OF THE AVENIDA  Sal      driving       steal a car, deliver it undamaged
//   2 THE NORTHBOUND RUN     Tiny     driving/race  beat Tiny to Punta Norte under a clock
//   3 THE CHANDLERY LEDGER   Delia    on-foot       follow the marina, shoot the muscle
//   4 HARBOUR LIGHTS         Brisco?  survival      hold the pad against a police ambush
//   5 VEGA'S LAST RUN        Sal      heist         crew meet, alarm, 3 stars, escape car
//
// The ANTAGONIST ARC resolves at mission 5: Rourke sold Sol out, framed her for the marina
// killing, and is moving the cartel's money through Caleta Marina. Mission 5 is the crew
// taking it back — the last objective is losing the three stars and reaching the boat.
import * as THREE from 'three';
import { clamp, dist, AREA_NAMES } from './config.js';
import { buildCharacter, animateCharacter } from './characters.js';
import { buildMarker, MARKER_COLOUR } from './mission-marker.js';
import { CAST, castMember, speakerName } from './cast.js';

export { MARKER_COLOUR };

/** Dialogue helper: a line from a cast id. */
const line = (id, text) => ({
  speaker: id,
  name: speakerName(id),
  text,
  colour: castMember(id).colour,
});

const MISSIONS = [
  // ------------------------------------------------------------------ 1. driving
  {
    id: 'wheels',
    title: 'Wheels of the Avenida',
    giver: 'sal',
    startAt: { x: -10, z: 82 },
    reward: 850,
    mechanic: 'driving',
    intro: [
      line('sal', 'Three years, Vega. You owe me for the lawyer that kept you at county instead of Raiford.'),
      line('sol', 'You sent me to that job, Sal. I drove the car. I did not know what was in the trunk.'),
      line('sal', 'Nobody knows what is in the trunk. That is the business. There is a cherry-red sports car under the palms at Caleta Marina. Bring it to the motel lot, undamaged.'),
      line('sol', 'And if it comes back with a scratch?'),
      line('sal', 'Then it comes out of your pay. You do not have any pay yet. Think about that.'),
    ],
    outro: [
      line('sal', 'Clean. Not a scratch. Maybe county taught you something after all.'),
      line('sol', 'County taught me not to trust a man with a ledger.'),
      line('sal', 'Good. Then you are ready for the next one.'),
    ],
    objectives: [
      { id: 'find', text: `Steal the sports car at ${AREA_NAMES.marina}`, kind: 'car' },
      { id: 'deliver', text: 'Deliver it to Sal at the Vista Mar Motel', kind: 'zone' },
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

  // ------------------------------------------------------------------ 2. race
  {
    id: 'northbound',
    title: 'The Northbound Run',
    giver: 'tiny',
    startAt: { x: 6, z: 92 },
    reward: 1400,
    mechanic: 'race',
    intro: [
      line('tiny', 'Cousin! You look like county chewed you up and spat you on the sand.'),
      line('sol', 'Tiny. You got fat.'),
      line('tiny', 'I got a tow truck. Same thing. Listen — Delia needs a crate up at Punta Norte before the shift change, and I bet myself fifty you cannot beat me there.'),
      line('sol', 'In what?'),
      line('tiny', 'In anything with wheels. That is the game. Go.'),
    ],
    outro: [
      line('tiny', 'You cheated. There is no way a sedan does that.'),
      line('sol', 'A sedan does exactly that when nobody taught it to be afraid.'),
      line('tiny', 'Fifty bucks. I want it in singles.'),
    ],
    objectives: [
      { id: 'race', text: `Beat Tiny to ${AREA_NAMES.north}`, kind: 'race' },
    ],
    setup(ctx) {
      // the destination, and Tiny's tow truck beside the start line
      const finish = { x: -70, z: -352 };
      ctx.state.finish = { ...finish, radius: 13 };
      ctx.markers.set('race', buildMarker(ctx.scene, MARKER_COLOUR.hot));
      ctx.markers.get('race').position.set(finish.x, ctx.city.groundAt(finish.x, finish.z), finish.z);
      const rival = ctx.spawnVehicle('pickup', 10, 96, 0, 0x2ad1c9);
      rival.name = 'tiny-tow-truck';
      ctx.state.rival = rival;
      ctx.state.rivalProgress = 0;
      ctx.state.limit = 165;
      ctx.state.heat = 0;
      ctx.hud.showToast('RACE TINY TO PUNTA NORTE — 2:45');
    },
    tick(ctx, objectiveId) {
      if (objectiveId !== 'race') return;
      const p = ctx.player.position;
      ctx.state.limit -= ctx.dt;
      if (ctx.state.limit <= 0) {
        if (!ctx.player.inVehicle) return ctx.fail('You never even got in a car.');
        return ctx.fail('Tiny got there first. He will be insufferable about it.');
      }

      // the rival drives itself up the island: an invisible tow truck on a timer, with a
      // visible model that follows the same lane the player is using
      const rival = ctx.state.rival;
      if (rival) {
        ctx.state.rivalProgress += ctx.dt * 0.62;
        const t = clamp(ctx.state.rivalProgress, 0, 1);
        rival.position.z = 96 - t * 440;
        rival.position.x = 10 - Math.sin(t * 3.1) * 14;
        rival.position.y = ctx.city.groundAt(rival.position.x, rival.position.z);
        rival.yaw = Math.PI;
        rival.speed = 22;
        rival.syncModel();
      }
      // wrecking the tow truck is a legitimate win, and is very satisfying
      if (rival && rival.destroyed) {
        ctx.hud.showToast('TINY IS OUT — GET TO PUNTA NORTE');
        ctx.state.rival = null;
      }

      const d = dist(p.x, p.z, ctx.state.finish.x, ctx.state.finish.z);
      if (d < ctx.state.finish.radius) {
        if (rival && ctx.state.rivalProgress < 1) {
          ctx.completeObjective('race');
        } else if (!rival) {
          ctx.completeObjective('race');
        }
      }
    },
  },

  // ------------------------------------------------------------------ 3. on foot
  {
    id: 'ledger',
    title: 'The Chandlery Ledger',
    giver: 'delia',
    startAt: { x: 30, z: 300 },
    reward: 1900,
    mechanic: 'on-foot',
    intro: [
      line('delia', 'Sol. You still walk like a cop is behind you. Sit down, you are making the tourists nervous.'),
      line('sol', 'Delia. You are still counting trucks for a living.'),
      line('delia', 'Three vans went into Rourke\'s yard last night. Only one came out. That is Rourke\'s arithmetic — she is skimming, and she is using Sal\'s name on the manifests.'),
      line('sol', 'So we take the ledger.'),
      line('delia', 'The chandlery up the marina keeps a copy. Three of her boys are on it. I marked the back door. Do not make a scene I have to clean.'),
    ],
    outro: [
      line('delia', 'You got it. Every crate, every date, every name. Look at the bottom line — that is Rourke\'s signature, not Sal\'s.'),
      line('sol', 'She framed him. She framed me too, three years ago. Same hand.'),
      line('delia', 'Then go and be angry somewhere with fewer cameras.'),
    ],
    objectives: [
      { id: 'reach', text: `Reach the chandlery at ${AREA_NAMES.marina}`, kind: 'zone' },
      { id: 'clear', text: 'Take out Rourke\'s muscle', kind: 'combat' },
      { id: 'ledger', text: 'Grab the ledger and get clear', kind: 'zone' },
    ],
    setup(ctx) {
      const shop = { x: 118, z: 322 };
      const getAway = { x: 60, z: 372 };
      ctx.state.zone = { ...shop, radius: 8 };
      ctx.state.getAway = { ...getAway, radius: 9 };
      ctx.markers.set('reach', buildMarker(ctx.scene, MARKER_COLOUR.go));
      ctx.markers.get('reach').position.set(shop.x, ctx.city.groundAt(shop.x, shop.z), shop.z);
      ctx.markers.set('clear', buildMarker(ctx.scene, MARKER_COLOUR.hot));
      ctx.markers.get('clear').visible = false;
      ctx.markers.get('clear').position.set(shop.x + 4, ctx.city.groundAt(shop.x + 4, shop.z), shop.z);
      ctx.markers.set('ledger', buildMarker(ctx.scene, MARKER_COLOUR.done));
      ctx.markers.get('ledger').visible = false;
      ctx.markers.get('ledger').position.set(getAway.x, ctx.city.groundAt(getAway.x, getAway.z), getAway.z);
      ctx.state.muscle = [];
      ctx.state.spawned = false;
    },
    tick(ctx, objectiveId) {
      const p = ctx.player.position;
      if (objectiveId === 'reach') {
        if (dist(p.x, p.z, ctx.state.zone.x, ctx.state.zone.z) < ctx.state.zone.radius) {
          ctx.completeObjective('reach');
          ctx.markers.get('reach').visible = false;
          ctx.markers.get('clear').visible = true;
          ctx.setObjective('clear');
          if (!ctx.state.spawned) {
            ctx.state.spawned = true;
            // three of Rourke's boys, on foot, armed
            for (let i = 0; i < 3; i++) {
              const a = i * 2.1;
              const m = ctx.police.spawnOfficers(ctx.player, 1, {
                x: ctx.state.zone.x + Math.cos(a) * 9,
                z: ctx.state.zone.z + Math.sin(a) * 9,
              });
              if (m) {
                m.crew = true;
                m.fireCooldown = 1.4 + i * 0.3;
                ctx.state.muscle.push(m);
              }
            }
            ctx.hud.sayLines([
              line('rourke', 'Vega. You are standing in my inventory.'),
              line('sol', 'You are standing in my three lost years, Ivy.'),
              line('rourke', 'Boys. The wheelman.'),
            ], 3.2);
            ctx.hud.showToast('ROURKE\'S MUSCLE — 3 ON FOOT');
          }
        }
      }
      if (objectiveId === 'clear') {
        const alive = ctx.state.muscle.filter((m) => m.alive).length;
        if (ctx.state.muscle.length && alive === 0) {
          ctx.completeObjective('clear');
          ctx.markers.get('clear').visible = false;
          ctx.markers.get('ledger').visible = true;
          ctx.setObjective('ledger');
          ctx.hud.showToast('CLEAR — TAKE THE LEDGER TO THE BOAT');
        }
      }
      if (objectiveId === 'ledger') {
        if (dist(p.x, p.z, ctx.state.getAway.x, ctx.state.getAway.z) < ctx.state.getAway.radius) {
          ctx.completeObjective('ledger');
        }
      }
    },
  },

  // ------------------------------------------------------------------ 4. survival
  {
    id: 'harbour',
    title: 'Harbour Lights',
    giver: 'sal',
    startAt: { x: -22, z: 96 },
    reward: 2600,
    mechanic: 'survival',
    intro: [
      line('sal', 'Rourke knows we have the ledger. She is coming to the motel tonight to take it back, and she is not coming alone.'),
      line('sol', 'Then we are not here tonight.'),
      line('sal', 'We are exactly here tonight. The ledger is in my safe and my safe is in my office. If they burn this place I have nothing.'),
      line('sol', 'How long?'),
      line('sal', 'However long it takes a captain to get a warrant and a helicopter. Hold the lot, Vega.'),
    ],
    outro: [
      line('sal', 'They broke off. Brisco called them off himself — he does not want a body on my pavement with an election coming.'),
      line('sol', 'Rourke will not stop because a captain blinked.'),
      line('sal', 'No. Which is why we go to her marina and take it out from under her. Tomorrow. All of us.'),
    ],
    objectives: [
      { id: 'hold', text: 'Hold the Vista Mar Motel lot', kind: 'combat' },
      { id: 'survive', text: 'Survive the VCPD response — 90 seconds', kind: 'survival' },
    ],
    setup(ctx) {
      const lot = { x: -10, z: 84 };
      ctx.state.zone = { ...lot, radius: 17 };
      ctx.state.holdTimer = 0;
      ctx.state.wave = 0;
      ctx.markers.set('hold', buildMarker(ctx.scene, MARKER_COLOUR.hot));
      ctx.markers.get('hold').position.set(lot.x, ctx.city.groundAt(lot.x, lot.z), lot.z);
      ctx.markers.set('survive', buildMarker(ctx.scene, MARKER_COLOUR.go));
      ctx.markers.get('survive').visible = false;
      ctx.markers.get('survive').position.set(lot.x, ctx.city.groundAt(lot.x, lot.z), lot.z);
      ctx.state.surviveTimer = 0;
      ctx.state.officerCount = 0;
    },
    tick(ctx, objectiveId) {
      if (objectiveId === 'hold') {
        ctx.state.holdTimer += ctx.dt;
        if (ctx.state.holdTimer > 4 && !ctx.state.triggered) {
          ctx.state.triggered = true;
          ctx.wanted.setLevel(3);
          ctx.wanted.refresh(40);
          ctx.hud.showBanner('HOLD THE LOT', 2.6);
          ctx.hud.sayLines([
            line('brisco', 'Vega. Put the weapon down and walk out with your hands where I can see them.'),
            line('sol', 'You brought a warrant to a motel, Captain? Sal will be flattered.'),
            line('brisco', 'I brought three cars. The warrant is for after.'),
          ], 3.6);
          ctx.police.spawnOfficers(ctx.player, 2, { x: ctx.state.zone.x + 12, z: ctx.state.zone.z - 6 });
          ctx.hud.showToast('SURVIVE 90 SECONDS — 3 STARS');
          ctx.markers.get('hold').visible = false;
          ctx.markers.get('survive').visible = true;
          ctx.setObjective('survive');
        }
      }
      if (objectiveId === 'survive') {
        ctx.state.surviveTimer += ctx.dt;
        // keep the pressure on: a fresh cruiser every 18 s while the hold lasts
        if (ctx.state.surviveTimer > 18 * (ctx.state.wave + 1) && ctx.state.wave < 3) {
          ctx.state.wave++;
          ctx.wanted.refresh(18);
          ctx.police.spawnOfficers(ctx.player, 1);
        }
        if (ctx.state.surviveTimer >= 90) {
          ctx.completeObjective('survive');
        }
        // being in a car during a "hold the lot" mission is not holding anything
        if (ctx.player.inVehicle && ctx.state.surviveTimer > 6) {
          ctx.hud.showToast('GET OUT OF THE CAR AND HOLD THE LOT');
        }
      }
    },
  },

  // ------------------------------------------------------------------ 5. heist
  {
    id: 'lastrun',
    title: "Vega's Last Run",
    giver: 'sal',
    startAt: { x: -26, z: 100 },
    reward: 9500,
    mechanic: 'heist',
    intro: [
      line('sal', 'This is the one, Vega. Rourke moves the cartel money through my marina on the midnight freighter. Twelve crates, two guards, one window.'),
      line('delia', 'I marked the roof. The window is on the chandlery side, forty seconds wide.'),
      line('tiny', 'I brought the tow truck. If a crate does not fit, the crate gets smaller.'),
      line('sol', 'And when the alarm goes?'),
      line('sal', 'Then you are the most wanted woman in Vista Mar and the boat at the end of the pier is the only door out. Do not miss the boat.'),
    ],
    outro: [
      line('rourke', 'You think this money buys you a way off this island? I own the water, Vega.'),
      line('sol', 'You owned a marina and a bad signature. The money is on the boat, the ledger is with Delia, and Brisco is reading both.'),
      line('sal', 'It is done. Vista Mar is ours — and it is yours, kid. Go and be somebody else for a while.'),
      line('sol', 'No. Somebody is going to have to run this strip. It might as well be somebody who got sold out.'),
    ],
    objectives: [
      { id: 'meet', text: `Meet the crew at the ${AREA_NAMES.marina} garage`, kind: 'zone' },
      { id: 'crates', text: 'Load the crates before the window closes', kind: 'timer' },
      { id: 'alarm', text: 'The alarm — reach the escape boat', kind: 'zone' },
      { id: 'escape', text: 'Lose the 3-star response at sea', kind: 'escape' },
    ],
    setup(ctx) {
      const crewAt = { x: 168, z: 178 };
      const boat = { x: 262, z: 366 };
      ctx.state.crewAt = { ...crewAt, radius: 12 };
      ctx.state.boat = { ...boat, radius: 10 };
      ctx.markers.set('meet', buildMarker(ctx.scene, MARKER_COLOUR.go));
      ctx.markers.get('meet').position.set(crewAt.x, ctx.city.groundAt(crewAt.x, crewAt.z), crewAt.z);
      ctx.markers.set('crates', buildMarker(ctx.scene, MARKER_COLOUR.hot));
      ctx.markers.get('crates').visible = false;
      ctx.markers.get('crates').position.set(140, 0, 300);
      ctx.markers.set('alarm', buildMarker(ctx.scene, MARKER_COLOUR.hot));
      ctx.markers.get('alarm').visible = false;
      ctx.markers.get('alarm').position.set(190, 0, 330);
      ctx.markers.set('escape', buildMarker(ctx.scene, MARKER_COLOUR.done));
      ctx.markers.get('escape').visible = false;
      ctx.markers.get('escape').position.set(boat.x, ctx.city.groundAt(boat.x, boat.z), boat.z);
      ctx.state.crateTimer = 0;
      ctx.state.alarmOn = false;
      ctx.state.escapeCar = null;
    },
    tick(ctx, objectiveId) {
      const p = ctx.player.position;
      if (objectiveId === 'meet') {
        if (dist(p.x, p.z, ctx.state.crewAt.x, ctx.state.crewAt.z) < ctx.state.crewAt.radius) {
          ctx.completeObjective('meet');
          ctx.markers.get('meet').visible = false;
          // everybody meets at the pad
          ctx.garage.callCrew([
            { x: ctx.state.crewAt.x - 2, z: ctx.state.crewAt.z + 2 },
            { x: ctx.state.crewAt.x + 2, z: ctx.state.crewAt.z + 3 },
            { x: ctx.state.crewAt.x + 0.5, z: ctx.state.crewAt.z + 5 },
          ]);
          ctx.hud.sayLines([
            line('tiny', 'Crates are on the dock. Guards change in four minutes.'),
            line('delia', 'Window opens now. Forty seconds, Sol. Not forty-one.'),
          ], 3.4);
          ctx.markers.get('crates').visible = true;
          ctx.setObjective('crates');
          ctx.state.crateTimer = 40;
          ctx.hud.showToast('LOAD THE CRATES — 0:40');
        }
      }
      if (objectiveId === 'crates') {
        ctx.state.crateTimer -= ctx.dt;
        const t = Math.max(0, Math.ceil(ctx.state.crateTimer));
        const crates = ctx.markers.get('crates');
        if (crates) crates.position.y = ctx.city.groundAt(crates.position.x, crates.position.z) + Math.sin(ctx.time * 2) * 0.2;
        if (ctx.state.crateTimer <= 0) {
          return ctx.fail('The window closed. The freighter sailed with the crates on it.');
        }
        if (dist(p.x, p.z, 140, 300) < 11) {
          ctx.completeObjective('crates');
          ctx.markers.get('crates').visible = false;
          ctx.state.alarmOn = true;
          // THE ALARM: instant three stars and a full response
          ctx.wanted.setLevel(3);
          ctx.wanted.commit('heist', 0.4);
          ctx.hud.showBanner('ALARM', 2);
          ctx.hud.sayLines([
            line('rourke', 'That is my freight, Vega. Every guard in Caleta is about to be very interested in you.'),
            line('sol', 'Then I had better be somewhere else.'),
          ], 3.4);
          ctx.markers.get('alarm').visible = true;
          ctx.setObjective('alarm');
          ctx.police.spawnOfficers(ctx.player, 2, { x: p.x + 10, z: p.z - 8 });
          ctx.hud.showToast('GET TO THE ESCAPE BOAT — 3 STARS');
        }
      }
      if (objectiveId === 'alarm') {
        // keep it at three stars while running for the boat, and give the player a ride
        if (ctx.wanted.level < 3) ctx.wanted.refresh(30);
        if (!ctx.state.escapeCar && ctx.state.alarmOn) {
          // the escape vehicle: a fast boat-side car waiting at the pier road
          const car = ctx.spawnVehicle('sports', 236, 340, Math.PI * 0.85, 0x151a24);
          car.name = 'escape-car';
          car.stolen = true;
          ctx.state.escapeCar = car;
          ctx.hud.showToast('ESCAPE CAR WAITING AT THE PIER');
        }
        if (dist(p.x, p.z, ctx.state.boat.x, ctx.state.boat.z) < ctx.state.boat.radius) {
          ctx.completeObjective('alarm');
          ctx.markers.get('alarm').visible = false;
          ctx.markers.get('escape').visible = true;
          ctx.setObjective('escape');
          ctx.hud.showToast('ON THE BOAT — LOSE THE COPS');
        }
      }
      if (objectiveId === 'escape') {
        // the climax: three stars must be gone before the arc resolves
        if (ctx.wanted.level === 0) {
          ctx.completeObjective('escape');
        } else {
          const left = Math.max(1, Math.ceil(ctx.wanted.heat / 8));
          if (Math.floor(ctx.time) % 12 === 0) ctx.hud.showToast(`LOSE THE COPS — HEAT ${left}`);
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
    this.failTimer = 0;
    this.completed = 0;
    this.earned = 0;
    this.time = 0;
    this.giver = this._buildGiver();
    this.offerMarker = buildMarker(scene, MARKER_COLOUR.go);
    this.offerMarker.visible = false;
  }

  _buildGiver() {
    const { root, joints } = buildCharacter(this.rng, { shirt: 0x2b1d33, pants: 0xe8dcc0, skin: 0xd9a97c, hair: 0x2a2018, shades: true });
    root.name = 'mission-giver-sal';
    this.scene.add(root);
    const def = this.defs[0];
    root.position.set(def.startAt.x, this.city.groundAt(def.startAt.x, def.startAt.z), def.startAt.z);
    root.rotation.y = Math.PI * 0.85;
    return { root, joints, phase: 0 };
  }

  get currentDef() {
    return this.defs[this.index] ?? null;
  }

  get giverId() {
    return this.currentDef?.giver ?? 'sal';
  }

  get giverName() {
    return speakerName(this.giverId);
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
      giver: speakerName(def.giver),
      giverColour: castMember(def.giver).colour,
      giverId: def.giver,
      objectives: def.objectives.map((o) => ({ ...o, state: 'pending' })),
      failReason: null,
    };
    this.active.objectives[0].state = 'active';
    const ctx = this._ctx(world);
    def.setup(ctx);
    this.offerMarker.visible = false;
    this.hud.setMission(this.active);
    this.hud.sayLines(def.intro, 4.6);
    this.hud.showBanner(def.title, 3.2);
    this.hud.showToast(`${speakerName(def.giver)} — ${def.mechanic.toUpperCase()}`);
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
      garage: world.garage,
      time: world.time,
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
    this.time += dt;
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
      const timeLeft = this.activeState.timeLimit > 0 ? this.activeState.timeLimit
        : this.activeState.crateTimer > 0 ? this.activeState.crateTimer
        : 0;
      if (timeLeft > 0) {
        const activeObj = this.active.objectives.find((o) => o.state === 'active');
        if (activeObj) {
          const t = Math.max(0, Math.ceil(timeLeft));
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
    this.failTimer = 5.2;
    this._advanceOnReset = true;
    this.completed++;
    this.earned += def.reward;
    world.addCash(def.reward);
    this.hud.sayLines(def.outro, 4.4);
    this.hud.showBanner(this.isFinalOffer ? 'VISTA MAR IS YOURS' : 'MISSION COMPLETE', 3);
    this.hud.showToast(`+$${def.reward.toLocaleString('en-US')}`);
    world.audio?.pickup();
    // the story pays out in ammo too, so the heist is survivable
    world.combat?.refill(this.isFinalOffer ? 1 : 0.75);
    world.onMissionComplete?.(def, def.reward);
    if (this.completed === this.defs.length) {
      this.hud.showBanner('COSTA HEAT — COMPLETE', 5);
    }
  }

  get isFinalOffer() {
    return this.active?.def?.id === 'lastrun';
  }

  failActive(world, reason) {
    if (this.state !== 'active') return;
    this.state = 'failed';
    this.failTimer = 3.8;
    this._advanceOnReset = false;
    this.hud.say(this.active.def.giver ? speakerName(this.active.def.giver) : 'SAL', reason, 5, castMember(this.active.def.giver).colour);
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
      giver: speakerName(def.giver),
      giverColour: castMember(def.giver).colour,
      giverId: def.giver,
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
      time: this.time,
    };
  }

  restore(data) {
    this._clearMarkers();
    this.active = null;
    this.index = clamp(data.index ?? 0, 0, this.defs.length);
    this.completed = data.completed ?? 0;
    this.earned = data.earned ?? 0;
    this.time = data.time ?? 0;
    this.state = this.index >= this.defs.length ? 'complete' : 'idle';
    this.hud.setMission(null);
  }

  /** For verification: the mission list as titles/mechanics/givers. */
  catalogue() {
    return this.defs.map((d, i) => ({
      index: i,
      id: d.id,
      title: d.title,
      giver: speakerName(d.giver),
      giverId: d.giver,
      mechanic: d.mechanic,
      reward: d.reward,
      objectives: d.objectives.map((o) => o.text),
      introLines: d.intro.length,
      outroLines: d.outro.length,
    }));
  }
}