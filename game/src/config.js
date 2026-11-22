// Tunable constants and small maths helpers shared by every system.
// World axis: +X is east (toward the sea), +Z is south. One unit is one metre.

export const ROAD = {
  halfWidth: 9,          // asphalt half width, 18 m road (two lanes each way)
  sidewalk: 4.5,         // raised pavement on both sides of every road
  cell: 100,             // distance between road centre lines
  curbHeight: 0.18,
};

export const GRID = {
  xs: [-420, -320, -220, -120, -20, 80, 180],
  zs: [-400, -300, -200, -100, 0, 100, 200, 300, 400],
};

export const CITY = {
  landMaxX: 193.5,       // last metre of pavement before the sand
  beachMaxX: 300,        // waterline
  seaLevel: -0.55,
  south: 400,
  north: -400,
};

export const PLAYER = {
  radius: 0.42,
  eyeHeight: 1.62,
  walkSpeed: 4.4,
  runSpeed: 8.2,
  jumpSpeed: 6.4,
  gravity: 21,
  maxHealth: 100,
  startX: -20,
  startZ: 120,
};

export const VEHICLE = {
  radius: 1.35,
  maxSpeed: 34,
  reverseSpeed: 9,
  acceleration: 15,
  brakeForce: 26,
  steerRate: 1.85,
  grip: 7.2,
  drag: 0.34,
};

export const SHOT = { width: 1280, height: 720 };

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
/** Shortest signed angle difference in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dampAngle = (a, b, rate, dt) => a + angleDelta(a, b) * (1 - Math.exp(-rate * dt));
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

/** 0 on the road, curb height on pavement, sloping sand on the beach, water below. */
export function groundHeightAt(x, z) {
  if (x > CITY.landMaxX) {
    const t = clamp((x - CITY.landMaxX) / (CITY.beachMaxX - CITY.landMaxX), 0, 1);
    return 0.18 - Math.pow(t, 1.7) * 1.9;
  }
  if (isPavementAt(x, z)) return ROAD.curbHeight;
  return 0;
}

export function isRoadAt(x, z) {
  for (const rx of GRID.xs) if (Math.abs(x - rx) <= ROAD.halfWidth) return true;
  for (const rz of GRID.zs) if (Math.abs(z - rz) <= ROAD.halfWidth) return true;
  return false;
}

/** Pavement is the 4.5 m collar around every block (roads excluded). */
export function isPavementAt(x, z) {
  if (x > CITY.landMaxX) return false;
  if (isRoadAt(x, z)) return false;
  return withinCity(x, z);
}

export function withinCity(x, z) {
  return x >= GRID.xs[0] - ROAD.halfWidth - ROAD.sidewalk - 4 &&
    x <= CITY.landMaxX &&
    z >= GRID.zs[0] - ROAD.halfWidth - ROAD.sidewalk - 6 &&
    z <= GRID.zs[GRID.zs.length - 1] + ROAD.halfWidth + ROAD.sidewalk + 6;
}

/** Which district a point belongs to; drives building heights and HUD area name. */
export function districtAt(x, z) {
  if (x > CITY.landMaxX) return 'beach';
  if (x < -240 && Math.abs(z) < 240) return 'downtown';
  if (x > 110) return 'ocean';
  if (z > 240) return 'marina';
  if (z < -240) return 'north';
  return 'midtown';
}

export const AREA_NAMES = {
  beach: 'VICE BEACH',
  ocean: 'OCEAN DRIVE',
  downtown: 'DOWNTOWN',
  midtown: 'MIDTOWN',
  marina: 'MARINA DISTRICT',
  north: 'NORTH SHORE',
};