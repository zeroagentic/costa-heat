// Procedural audio with the Web Audio API only — no files. A shared output bus feeds a
// compressor and reverb-ish delay. Gunshots are noise bursts, the engine is a sawtooth
// whose pitch tracks speed, footsteps are short filtered clicks, and a small music loop
// plays a synthwave chord progression with a bass line and hi-hat.
import { clamp } from './config.js';

const LOOP_BPM = 96;

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
    this.engine = null;
    this.engineLevel = 0;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.lastFootstep = 0;
  }

  /** Must be called from a user gesture (click/keydown) before any sound is audible. */
  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);

    // stereo-ish echo for gunshots and the music lead
    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.19;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.24;
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.master);
    this.delay.connect(this.master);

    this.noiseBuffer = this._makeNoise(2.0);
    this._buildEngine();
    this.started = true;
    this.musicTimer = 0.6;
    this.resume();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    return this.muted;
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buf;
  }

  _now() {
    return this.ctx.currentTime;
  }

  /** Short noise burst with a filter sweep — the core of gunshots and impacts. */
  _noiseBurst({ duration = 0.12, gain = 0.5, freq = 1400, q = 0.9, type = 'lowpass', delay = 0 } = {}) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = this._now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.18), t + duration);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    g.connect(this.delay);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  /** Punchy pistol report: noise crack plus a low thump. */
  gunshot(kind = 'pistol', volume = 1, at = null) {
    if (!this.started) return;
    if (typeof kind === 'number') { volume = kind; kind = 'pistol'; }
    const v = clamp(volume, 0.1, 1.4);
    if (kind === 'shotgun') return this._shotgunReport(v);
    if (kind === 'smg') return this._smgReport(v);
    this._noiseBurst({ duration: 0.07, gain: 0.72 * v, freq: 5200, q: 0.5, type: 'highpass' });
    this._noiseBurst({ duration: 0.22, gain: 0.5 * v, freq: 1100, q: 1.1 });
    const ctx = this.ctx;
    const t = this._now();
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Shotgun: a wide low boom with a long tail — all body, no crack. */
  _shotgunReport(v) {
    this._noiseBurst({ duration: 0.34, gain: 0.92 * v, freq: 1900, q: 0.45 });
    this._noiseBurst({ duration: 0.5, gain: 0.42 * v, freq: 620, q: 0.8 });
    const ctx = this.ctx;
    const t = this._now();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.72 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  /** SMG: a short, dry, high crack — meant to be heard 10 times a second. */
  _smgReport(v) {
    this._noiseBurst({ duration: 0.045, gain: 0.58 * v, freq: 6400, q: 0.6, type: 'highpass' });
    this._noiseBurst({ duration: 0.09, gain: 0.32 * v, freq: 1600, q: 1.3 });
  }

  /** Magazine out, magazine in: two mechanical clicks. */
  reload() {
    if (!this.started) return;
    this._noiseBurst({ duration: 0.04, gain: 0.2, freq: 1800, q: 3, type: 'bandpass' });
    setTimeout(() => {
      if (!this.started) return;
      this._noiseBurst({ duration: 0.06, gain: 0.26, freq: 900, q: 2.4, type: 'bandpass' });
    }, 340);
  }

  /** Weapon swap: a cloth-and-metal shuffle. */
  weaponSwitch() {
    if (!this.started) return;
    this._noiseBurst({ duration: 0.09, gain: 0.16, freq: 2400, q: 1.6, type: 'bandpass' });
  }

  /** The chopper's door gun: louder and flatter than a pistol, far away. */
  helicopterShot(volume = 0.5) {
    if (!this.started) return;
    this._noiseBurst({ duration: 0.11, gain: 0.4 * volume, freq: 2600, q: 0.7 });
    this._noiseBurst({ duration: 0.2, gain: 0.22 * volume, freq: 500, q: 0.9 });
  }

  /** Rotor wash: a low thudding pulse whose rate tracks how close the chopper is. */
  updateRotor(level, dt) {
    if (!this.started) return;
    if (!this._rotor) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 26;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 9;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      filter.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.sfxGain);
      osc.start();
      lfo.start();
      this._rotor = { osc, lfo, gain: g, filter };
    }
    const target = clamp(level, 0, 1) * 0.16;
    this._rotor.gain.gain.setTargetAtTime(target, this._now(), 0.25);
    this._rotor.lfo.frequency.setTargetAtTime(9 + level * 7, this._now(), 0.3);
  }

  dryFire() {
    if (!this.started) return;
    this._noiseBurst({ duration: 0.03, gain: 0.22, freq: 2600, q: 2, type: 'bandpass' });
  }

  impact() {
    if (!this.started) return;
    this._noiseBurst({ duration: 0.09, gain: 0.32, freq: 900, q: 1.4 });
  }

  footstep(volume = 0.3, position = null, side = 0) {
    if (!this.started) return;
    const now = this._now();
    if (now - this.lastFootstep < 0.11) return;
    this.lastFootstep = now;
    this._noiseBurst({ duration: 0.055, gain: 0.14 * volume + 0.05, freq: 620 + side * 90, q: 2.4, type: 'bandpass' });
  }

  crash(intensity = 1) {
    if (!this.started) return;
    this._noiseBurst({ duration: 0.35, gain: clamp(0.5 * intensity, 0.1, 0.8), freq: 700, q: 0.7 });
    this._noiseBurst({ duration: 0.14, gain: 0.3 * intensity, freq: 3800, q: 0.6, type: 'highpass' });
  }

  carHorn() {
    if (!this.started) return;
    this.resume();
    const ctx = this.ctx;
    const t = this._now();
    for (const freq of [392, 494]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.setValueAtTime(0.12, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.36);
    }
  }

  pickup() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = this._now();
    [660, 880, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.06 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.22);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.24);
    });
  }

  sirenOn() {
    if (!this.started) return;
    if (this.siren) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 720;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 0.8);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    lfo.start();
    this.siren = { osc, lfo, gain: g };
  }

  sirenOff() {
    if (!this.siren) return;
    const { osc, lfo, gain } = this.siren;
    try {
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
      osc.stop(this.ctx.currentTime + 0.45);
      lfo.stop(this.ctx.currentTime + 0.45);
    } catch { /* already stopped */ }
    this.siren = null;
  }

  /** Engine: two detuned saws through a lowpass, pitch and gain follow speed. */
  _buildEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 27.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 3.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, filter, gain: g };
  }

  /** Called every frame with the player's car speed (m/s); 0 when on foot. */
  updateEngine(speed, dt, throttle = 0) {
    if (!this.engine || !this.started) return;
    const target = clamp(Math.abs(speed) / 30, 0, 1);
    this.engineLevel += (target - this.engineLevel) * clamp(dt * 6, 0, 1);
    const base = 52 + this.engineLevel * 235 + Math.abs(throttle) * 18;
    const t = this._now();
    this.engine.osc.frequency.setTargetAtTime(base, t, 0.06);
    this.engine.osc2.frequency.setTargetAtTime(base * 0.5, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(420 + this.engineLevel * 2100, t, 0.08);
    const gain = clamp(0.012 + this.engineLevel * 0.2, 0, 0.22);
    this.engine.gain.gain.setTargetAtTime(gain, t, 0.1);
  }

  /** A short synthwave loop: Am - F - C - G, arpeggio, bass and hat. */
  updateMusic(dt, active = true) {
    if (!this.started || !this.ctx) return;
    if (!active) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const beat = 60 / LOOP_BPM / 2;
    this.musicTimer = beat;
    const step = this.musicStep++;
    const bar = Math.floor(step / 8) % 4;
    const chords = [
      [220.0, 261.63, 329.63],   // Am
      [174.61, 220.0, 261.63],   // F
      [130.81, 164.81, 196.0],   // C
      [196.0, 246.94, 293.66],   // G
    ];
    const chord = chords[bar];
    const arpIndex = step % 4;
    const note = chord[arpIndex === 3 ? 1 : arpIndex] * (arpIndex === 2 ? 2 : 1);
    this._playNote(note, beat * 0.9, 0.055, 'triangle');
    if (step % 2 === 0) this._playNote(chord[0] / 2, beat * 1.5, 0.09, 'sawtooth');
    if (step % 2 === 1) {
      this._noiseBurst({ duration: 0.045, gain: 0.06, freq: 8400, q: 1.2, type: 'highpass' });
    }
    if (step % 8 === 0) this._playNote(chord[0], beat * 3.4, 0.05, 'sine');
  }

  _playNote(freq, dur, gain, type) {
    const ctx = this.ctx;
    const t = this._now();
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}