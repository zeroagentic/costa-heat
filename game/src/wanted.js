// The five-tier wanted system: the single place that decides WHAT answers a given star
// level. The police, helicopter, roadblock and radio systems all read this table, so a
// level always means the same thing everywhere in the game:
//
//   1 star   INVESTIGATING   1 patrol car rolls up and looks for you
//   2 stars  PURSUIT         2 cruisers chase, sirens on
//   3 stars  ARMED RESPONSE  3 cruisers + officers on foot, sidearms out
//   4 stars  AIR SUPPORT     4 cruisers + officers + VCPD Air One overhead
//   5 stars  CITY LOCKDOWN   4 cruisers + officers + Air One + roadblocks on the roads ahead
//
// Heat rises from crimes, decays only after the player has been out of sight of every
// cop for `COOLDOWN_BEFORE_DECAY` seconds, and decays much faster once they are truly
// hidden. Dropping to zero prints "YOU LOST THE COPS" and the response stands down.
import { clamp } from './config.js';

export const RESPONSE = [
  { level: 0, key: 'clear', label: '', cruisers: 0, officers: 0, helicopter: false, roadblocks: false },
  { level: 1, key: 'investigating', label: 'INVESTIGATING', cruisers: 1, officers: 0, helicopter: false, roadblocks: false },
  { level: 2, key: 'pursuit', label: 'PURSUIT', cruisers: 2, officers: 0, helicopter: false, roadblocks: false },
  { level: 3, key: 'armed', label: 'ARMED RESPONSE', cruisers: 3, officers: 2, helicopter: false, roadblocks: false },
  { level: 4, key: 'air', label: 'AIR SUPPORT', cruisers: 4, officers: 3, helicopter: true, roadblocks: false },
  { level: 5, key: 'lockdown', label: 'CITY LOCKDOWN', cruisers: 4, officers: 4, helicopter: true, roadblocks: true },
];

/** Heat added by each crime. A kill alone is not enough for two stars; a cop-killing is. */
const CRIME_HEAT = {
  assault: 26,
  kill: 55,
  cop: 62,
  carjack: 22,
  gun: 9,
  speeding: 2,
  heist: 120,      // the alarm at the marina: instant four stars
  pursuit: 18,     // evading on a live chase keeps the meter hot
};

const BANDS = [0, 8, 28, 55, 85, 120];   // lower bound of each star count in heat
const HEAT_MAX = 160;
const DECAY_PER_SECOND = 0.62;
const HIDDEN_DECAY_MULT = 3.1;
const COOLDOWN_BEFORE_DECAY = 7.5;

export class Wanted {
  constructor() {
    this.heat = 0;
    this.level = 0;
    this.lastCrimeAt = -99;
    this.time = 0;
    this.history = [];
    this.onChange = null;
    this.onResponse = null;       // (level, response) when the response *shape* changes
    this.maxLevel = 5;
    this.heatRate = 0;
    this.hiddenFor = 0;
    this.inSight = false;
    this.escapedAt = -99;
  }

  /** Star count for the current heat. */
  get stars() {
    for (let i = BANDS.length - 1; i >= 0; i--) {
      if (this.heat >= BANDS[i]) return i;
    }
    return 0;
  }

  /** The response table row for the current level. */
  get response() {
    return RESPONSE[clamp(this.level, 0, 5)];
  }

  /** Which systems should currently be awake, for the HUD and the verification harness. */
  get profile() {
    const r = this.response;
    return {
      level: r.level,
      label: r.label,
      cruisers: r.cruisers,
      officers: r.officers,
      helicopter: r.helicopter,
      roadblocks: r.roadblocks,
      heat: +this.heat.toFixed(1),
    };
  }

  _refresh(announce = true) {
    const before = this.level;
    this.level = this.stars;
    if (this.level !== before) {
      if (announce) this.onChange?.(this.level, before);
      this.onResponse?.(this.level, RESPONSE[this.level]);
    }
    return this.level;
  }

  /** Add heat for a crime type. Returns the new star count. */
  commit(crime, amount = 1) {
    const base = CRIME_HEAT[crime] ?? 10;
    this.heat = clamp(this.heat + base * amount, 0, HEAT_MAX);
    this.lastCrimeAt = this.time;
    this.hiddenFor = 0;
    this.history.push({ at: +this.time.toFixed(1), crime, heat: Math.round(this.heat) });
    if (this.history.length > 40) this.history.shift();
    return this._refresh();
  }

  /** Police are looking: keep the meter topped up while they can see you. */
  refresh(amount) {
    this.heat = clamp(this.heat + amount, 0, HEAT_MAX);
    this.lastCrimeAt = this.time;
    this.hiddenFor = 0;
    return this._refresh();
  }

  /** Force a star level (staged scenes, save restore). */
  setLevel(level) {
    const l = clamp(level, 0, 5);
    // sit just above the band's lower bound so the level is stable at the edges
    this.heat = l === 0 ? 0 : BANDS[l] + 0.5;
    this.lastCrimeAt = this.time;
    return this._refresh(false);
  }

  clear() {
    const before = this.level;
    this.heat = 0;
    this.level = 0;
    if (before !== 0) {
      this.onChange?.(0, before);
      this.onResponse?.(0, RESPONSE[0]);
    }
  }

  /**
   * `nearCop` is the distance to the closest cop hull. Passing > 55 means "out of sight".
   * Decay is gated on a cooldown since the last crime so a brief break does not erase a
   * whole chase, and then accelerates once the player has genuinely gone to ground.
   */
  update(dt, hidden) {
    this.time += dt;
    const since = this.time - this.lastCrimeAt;

    if (hidden) this.hiddenFor += dt;
    else this.hiddenFor = 0;

    if (since > COOLDOWN_BEFORE_DECAY) {
      const hiddenNow = hidden || this.hiddenFor > 2.5;
      const rate = DECAY_PER_SECOND * (hiddenNow ? HIDDEN_DECAY_MULT : 1);
      this.heat = Math.max(0, this.heat - rate * dt);
      this.heatRate = -rate;
      const before = this.level;
      this.level = this.stars;
      if (this.level !== before) {
        if (this.level === 0 && before > 0) this.escapedAt = this.time;
        this.onChange?.(this.level, before);
        this.onResponse?.(this.level, RESPONSE[this.level]);
      }
    } else {
      this.heatRate = 0;
    }
  }

  /** Seconds still to wait before decay begins (for the HUD ring / debug output). */
  get cooldownRemaining() {
    return Math.max(0, COOLDOWN_BEFORE_DECAY - (this.time - this.lastCrimeAt));
  }

  serialise() {
    return { heat: this.heat, level: this.level, time: this.time, hiddenFor: this.hiddenFor };
  }

  restore(data) {
    if (!data) return;
    this.heat = clamp(data.heat ?? 0, 0, HEAT_MAX);
    this.level = this.stars;
    this.time = data.time ?? 0;
    this.hiddenFor = data.hiddenFor ?? 0;
    this.lastCrimeAt = this.time;
    this.onResponse?.(this.level, RESPONSE[this.level]);
  }
}