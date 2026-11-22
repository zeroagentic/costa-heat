// Save and load, two slots. A slot holds everything the game can rebuild from:
//   cash, position + yaw + health, the wanted meter, mission progress, the vehicle the
//   player was driving (kind, colour, transform, damage), the garage's stored car list,
//   every weapon's ammo and reserve, the stat counters and the play clock.
//
// Storage is localStorage only: no network, no cookies, and every failure (private mode,
// quota, corrupt JSON) degrades to a no-op so a broken slot can never wedge the game.
//
// Slot keys are versioned, and a load of a slot written by an older version is refused
// rather than half-applied.

const VERSION = 2;
export const SLOT_KEYS = {
  1: 'costa-heat-save-v2-slot1',
  2: 'costa-heat-save-v2-slot2',
};
const DEFAULT_SLOT = 1;

function keyFor(slot) {
  return SLOT_KEYS[slot] ?? SLOT_KEYS[DEFAULT_SLOT];
}

/** Build the plain-data snapshot of a live world. Pure: no side effects. */
export function snapshot(world) {
  const p = world.player;
  const car = p.inVehicle ?? world.stolenVehicle;
  return {
    version: VERSION,
    savedAt: Date.now(),
    slotLabel: `${world.missions.completed}/${world.missions.defs.length}`,
    cash: world.cash,
    health: p.health,
    position: { x: p.position.x, y: p.position.y, z: p.position.z },
    yaw: p.yaw,
    wanted: world.wanted.serialise(),
    missions: world.missions.serialise(),
    inVehicle: Boolean(p.inVehicle),
    vehicle: car && !car.destroyed
      ? {
        kind: car.kind,
        colour: car.bodyColour ?? 0xe83a5a,
        x: car.position.x,
        z: car.position.z,
        yaw: car.yaw,
        health: car.health,
        stolen: Boolean(car.stolen),
      }
      : null,
    garage: world.garage ? world.garage.serialise() : { stored: [] },
    weapons: world.combat ? world.combat.serialise() : null,
    stats: { ...world.stats },
    playTime: world.playTime,
    time: world.time,
  };
}

export function saveGame(world, slot = DEFAULT_SLOT) {
  try {
    localStorage.setItem(keyFor(slot), JSON.stringify(snapshot(world)));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot = DEFAULT_SLOT) {
  try {
    const raw = localStorage.getItem(keyFor(slot));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION) return null;
    if (!data.position || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave(slot = DEFAULT_SLOT) {
  try {
    return Boolean(localStorage.getItem(keyFor(slot)));
  } catch {
    return false;
  }
}

export function clearSave(slot = DEFAULT_SLOT) {
  try {
    localStorage.removeItem(keyFor(slot));
  } catch {
    /* ignore */
  }
}

/** Metadata for the title screen's slot list. */
export function slotInfo(slot) {
  const data = loadGame(slot);
  if (!data) return { slot, empty: true };
  return {
    slot,
    empty: false,
    cash: data.cash,
    wanted: data.wanted?.level ?? 0,
    mission: data.slotLabel ?? '',
    playTime: Math.round(data.playTime ?? 0),
    savedAt: data.savedAt ?? 0,
    garage: data.garage?.stored?.length ?? 0,
    inVehicle: Boolean(data.inVehicle),
  };
}

/**
 * Apply a loaded save to a freshly built world. Every field is restored: cash, position,
 * wanted meter, mission index and counters, weapons, garage, stats, clock, and the car
 * (re-spawned at its saved transform, with the player back in the driver's seat).
 */
export function applySave(world, data) {
  if (!data) return false;
  world.cash = data.cash ?? 0;
  world.player.position.set(data.position.x, data.position.y ?? 0, data.position.z);
  world.player.yaw = data.yaw ?? 0;
  world.player.health = data.health ?? 100;
  world.player.alive = true;
  world.wanted.restore(data.wanted ?? {});
  world.missions.restore(data.missions ?? { index: 0 });
  world.stats = Object.assign(world.stats, data.stats ?? {});
  world.playTime = data.playTime ?? 0;
  if (data.time) world.time = data.time;
  if (world.combat) world.combat.restore(data.weapons ?? null);
  if (world.garage) world.garage.restore(data.garage ?? { stored: [] });

  if (data.vehicle) {
    const v = world.spawnStolenVehicle(data.vehicle);
    v.position.set(data.vehicle.x, world.city.groundAt(data.vehicle.x, data.vehicle.z), data.vehicle.z);
    v.yaw = data.vehicle.yaw;
    v.health = data.vehicle.health ?? 100;
    v.syncModel();
    if (data.inVehicle) world.enterVehicle(v, true);
  }
  world.hud?.setCash(world.cash);
  world.hud?.setGarage?.(world.garage?.count ?? 0, world.garage?.capacity ?? 4);
  return true;
}

/** A field-by-field comparison of a snapshot against a live world, for the test harness. */
export function verifyRoundTrip(snapshotData, world) {
  const fresh = snapshot(world);
  const checks = {
    cash: fresh.cash === snapshotData.cash,
    position: Math.abs(fresh.position.x - snapshotData.position.x) < 0.01
      && Math.abs(fresh.position.z - snapshotData.position.z) < 0.01,
    health: Math.abs(fresh.health - snapshotData.health) < 0.01,
    wanted: Math.abs((fresh.wanted?.heat ?? 0) - (snapshotData.wanted?.heat ?? 0)) < 0.01,
    missions: fresh.missions.index === snapshotData.missions.index
      && fresh.missions.completed === snapshotData.missions.completed,
    garage: (fresh.garage?.stored?.length ?? 0) === (snapshotData.garage?.stored?.length ?? 0),
    weapons: fresh.weapons?.index === snapshotData.weapons?.index
      && (fresh.weapons?.weapons?.[0]?.ammo ?? 0) === (snapshotData.weapons?.weapons?.[0]?.ammo ?? 0),
    stats: fresh.stats.kills === snapshotData.stats.kills,
    playTime: Math.abs(fresh.playTime - snapshotData.playTime) < 0.01,
  };
  const ok = Object.values(checks).every(Boolean);
  return { ok, checks };
}