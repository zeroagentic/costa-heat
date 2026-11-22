// Save and load. One localStorage slot holds cash, position, health, wanted level,
// mission progress, the stolen car (kind, colour, transform, damage) and play time.
// No network, no cookies, and failures (private mode, quota) degrade to no-op.

const KEY = 'costa-heat-save-v1';
const VERSION = 1;

export function saveGame(world) {
  try {
    const p = world.player;
    const car = world.stolenVehicle;
    const data = {
      version: VERSION,
      savedAt: Date.now(),
      cash: world.cash,
      health: p.health,
      position: { x: p.position.x, y: p.position.y, z: p.position.z },
      yaw: p.yaw,
      wanted: { heat: world.wanted.heat, level: world.wanted.level },
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
      stats: { kills: world.stats.kills, arrests: world.stats.arrests, distance: world.stats.distance },
      playTime: world.playTime,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Apply a loaded save to a freshly built world. */
export function applySave(world, data) {
  if (!data) return false;
  world.cash = data.cash ?? 0;
  world.player.position.set(data.position.x, data.position.y ?? 0, data.position.z);
  world.player.yaw = data.yaw ?? 0;
  world.player.health = data.health ?? 100;
  world.player.alive = true;
  world.wanted.heat = data.wanted?.heat ?? 0;
  world.wanted.level = data.wanted?.level ?? 0;
  world.missions.restore(data.missions ?? { index: 0 });
  world.stats = Object.assign(world.stats, data.stats ?? {});
  world.playTime = data.playTime ?? 0;

  if (data.vehicle) {
    const v = world.spawnStolenVehicle(data.vehicle);
    if (data.inVehicle) {
      world.enterVehicle(v, true);
      v.position.set(data.vehicle.x, world.city.groundAt(data.vehicle.x, data.vehicle.z), data.vehicle.z);
      v.yaw = data.vehicle.yaw;
      v.syncModel();
    }
  }
  return true;
}