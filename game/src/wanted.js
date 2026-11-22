// Wanted level 1-5: stars rise from crimes and cool down when the player hides.
// The rank gates how many police cars spawn and whether officers on foot shoot.
import { clamp } from './config.js';

const CRIME_HEAT = { assault: 26, kill: 55, cop: 45, carjack: 22, gun: 9, speeding: 2 };
const DECAY_PER_SECOND = 0.62;
const COOLDOWN_BEFORE_DECAY = 9;

export class Wanted {
  constructor() {
    this.heat = 0;
    this.level = 0;
    this.lastCrimeAt = -99;
    this.time = 0;
    this.history = [];
    this.onChange = null;
    this.maxLevel = 5;
  }

  get stars() {
    if (this.heat < 8) return 0;
    if (this.heat < 28) return 1;
    if (this.heat < 55) return 2;
    if (this.heat < 85) return 3;
    if (this.heat < 120) return 4;
    return 5;
  }

  /** Add heat for a crime type. Returns the new star count. */
  commit(crime, amount = 1) {
    const base = CRIME_HEAT[crime] ?? 10;
    const before = this.level;
    this.heat = clamp(this.heat + base * amount, 0, 160);
    this.lastCrimeAt = this.time;
    this.level = this.stars;
    if (this.level !== before) this.onChange?.(this.level, before);
    return this.level;
  }

  /** Police are looking: keep the meter topped up while they see you. */
  refresh(amount) {
    this.heat = clamp(this.heat + amount, 0, 160);
    this.lastCrimeAt = this.time;
    const before = this.level;
    this.level = this.stars;
    if (this.level !== before) this.onChange?.(this.level, before);
  }

  /** Force a star level (used by staged scenes and by the save loader). */
  setLevel(level) {
    const bands = [0, 16, 40, 70, 100, 140];
    this.heat = bands[Math.max(0, Math.min(5, level))];
    const before = this.level;
    this.level = this.stars;
    if (before !== this.level) this.onChange?.(this.level, before);
    return this.level;
  }

  clear() {
    const before = this.level;
    this.heat = 0;
    this.level = 0;
    if (before !== 0) this.onChange?.(0, before);
  }

  update(dt, hidden) {
    this.time += dt;
    const since = this.time - this.lastCrimeAt;
    if (since > COOLDOWN_BEFORE_DECAY) {
      const rate = DECAY_PER_SECOND * (hidden ? 2.4 : 1);
      this.heat = Math.max(0, this.heat - rate * dt);
      const before = this.level;
      this.level = this.stars;
      if (this.level !== before) this.onChange?.(this.level, before);
    }
  }
}