// HUD: cash, health, wanted stars, mission checklist, weapon/ammo, prompts, dialogue,
// toasts and the damage vignette. Reads world state each frame; owns only DOM.
//
// Dialogue is a QUEUE of scripted lines: a mission hands over 2-4 {speaker, name, text}
// entries and they play one after another in the box at the bottom of the screen, each
// with its speaker's name painted in that character's colour.
import { AREA_NAMES, CITY_NAME, districtAt } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.cashEl = $('cash');
    this.healthFill = $('health-fill');
    this.wantedEl = $('wanted');
    this.missionPanel = $('mission-panel');
    this.missionTitle = $('mission-title');
    this.missionGiver = $('mission-giver');
    this.missionList = $('mission-objectives');
    this.weaponName = $('weapon-name');
    this.ammoEl = $('ammo');
    this.promptEl = $('prompt');
    this.crosshair = $('crosshair');
    this.hitmarker = $('hitmarker');
    this.dialogue = $('dialogue');
    this.dialogueName = $('dialogue-name');
    this.dialogueText = $('dialogue-text');
    this.toast = $('toast');
    this.banner = $('banner');
    this.vignette = $('vignette');
    this.speedo = $('speedo');
    this.speedValue = $('speed-value');
    this.areaEl = $('area-name');
    this.districtEl = $('district-name');
    this.wantedLabel = $('wanted-label');
    this.garageEl = $('garage-count');
    this.subRow = this.garageEl?.closest('.row') ?? null;

    this.stars = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      s.textContent = '★';
      this.wantedEl.appendChild(s);
      this.stars.push(s);
    }
    this.toastTimer = 0;
    this.bannerTimer = 0;
    this.dialogueTimer = 0;
    this.dialogueQueue = [];
    this.lastCash = -1;
    this.lastHealth = -1;
    this.lastStars = -1;
    this.lastAmmo = '';
    this.lastArea = '';
    this.objectiveSignature = '';
    this.hurt = 0;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  setCash(value) {
    if (value === this.lastCash) return;
    this.lastCash = value;
    this.cashEl.textContent = `$${value.toLocaleString('en-US')}`;
  }

  setHealth(value, max) {
    const pct = Math.max(0, Math.min(1, value / max));
    const rounded = Math.round(pct * 100);
    if (rounded === this.lastHealth) return;
    this.lastHealth = rounded;
    this.healthFill.style.width = `${pct * 100}%`;
    this.healthFill.classList.toggle('low', pct < 0.3);
  }

  setWanted(level) {
    if (level === this.lastStars) return;
    this.lastStars = level;
    this.stars.forEach((s, i) => s.classList.toggle('lit', i < level));
    this.vignette.classList.toggle('cop', level >= 4);
    if (this.wantedLabel) {
      const words = ['', 'INVESTIGATING', 'PURSUIT', 'ARMED RESPONSE', 'AIR SUPPORT', 'CITY LOCKDOWN'];
      this.wantedLabel.textContent = words[level] ?? '';
      this.wantedLabel.classList.toggle('on', level > 0);
    }
  }

  setWeapon(name, ammo, reserve, reloading = false) {
    const sig = `${name}|${ammo}|${reserve}|${reloading}`;
    if (sig === this.lastAmmo) return;
    this.lastAmmo = sig;
    this.weaponName.textContent = reloading ? `${name} · RELOAD` : name;
    this.ammoEl.textContent = reloading ? '— / —' : `${ammo} / ${reserve}`;
    this.ammoEl.classList.toggle('low', !reloading && ammo <= 3);
  }

  setMission(mission) {
    if (!mission) {
      this.missionPanel.style.display = 'none';
      return;
    }
    this.missionPanel.style.display = 'block';
    this.missionTitle.textContent = mission.title;
    if (this.missionGiver) {
      this.missionGiver.textContent = mission.giver ? `FOR ${mission.giver}` : '';
      this.missionGiver.style.color = mission.giverColour ?? '#ff3d8b';
    }
    const sig = mission.objectives.map((o) => `${o.text}:${o.state}`).join('|');
    if (sig !== this.objectiveSignature) {
      this.objectiveSignature = sig;
      this.missionList.innerHTML = '';
      for (const obj of mission.objectives) {
        const li = document.createElement('li');
        li.textContent = obj.text;
        if (obj.state === 'done') li.className = 'done';
        if (obj.state === 'active') li.className = 'active';
        this.missionList.appendChild(li);
      }
    }
  }

  setPrompt(text) {
    if (!text) {
      this.promptEl.classList.remove('on');
      return;
    }
    if (this.promptEl.dataset.text !== text) {
      this.promptEl.dataset.text = text;
      this.promptEl.innerHTML = text;
    }
    this.promptEl.classList.add('on');
  }

  setCrosshair(on) {
    this.crosshair.classList.toggle('on', on);
  }

  flashHit() {
    this.hitmarker.classList.remove('on');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('on');
  }

  showToast(text, seconds = 2.4) {
    this.toast.textContent = text;
    this.toast.classList.add('on');
    this.toastTimer = seconds;
  }

  showBanner(text, seconds = 2.6) {
    this.banner.textContent = text;
    this.banner.classList.add('on');
    this.bannerTimer = seconds;
  }

  /** One line, immediate. `colour` paints the speaker's name. */
  say(name, text, seconds = 4, colour = null) {
    this.dialogueQueue.length = 0;
    this._showLine({ name, text, colour });
    this.dialogueTimer = seconds;
  }

  /**
   * A scripted run of lines from a mission: [{speaker, name, text, colour}, ...].
   * Each line holds for `perLine` seconds and the next follows automatically, so the
   * box always carries a named speaker and a full sentence.
   */
  sayLines(script, perLine = 4.2) {
    const lines = (script ?? []).filter(Boolean);
    if (!lines.length) return;
    this.dialogueQueue = lines.slice(1).map((l) => ({ ...l, hold: perLine }));
    this._showLine(lines[0]);
    this.dialogueTimer = perLine;
    this.lineHold = perLine;
  }

  _showLine(line) {
    this.dialogueName.textContent = line.name ?? '—';
    this.dialogueName.style.color = line.colour ?? '#45f0ff';
    this.dialogueText.textContent = line.text ?? '';
    this.dialogue.classList.add('on');
  }

  get dialogueOpen() {
    return this.dialogueTimer > 0 || this.dialogueQueue.length > 0;
  }

  setSpeed(visible, mph) {
    this.speedo.classList.toggle('on', visible);
    if (visible) this.speedValue.textContent = String(Math.round(mph));
  }

  setArea(x, z) {
    const name = AREA_NAMES[districtAt(x, z)] ?? AREA_NAMES.beach;
    if (name === this.lastArea) return;
    const first = this.lastArea === '';
    this.lastArea = name;
    this.areaEl.textContent = name;
    this.districtEl.textContent = `${CITY_NAME} · ${name}`;
    // the district line lives at 0.35 opacity so it stays out of the scene; crossing into a
    // new district lifts it long enough to read, then it settles back
    if (!first) this._flash(this.districtEl, 'flash', 2.5);
  }

  setGarage(count, capacity) {
    if (!this.garageEl) return;
    const text = `GARAGE ${count}/${capacity}`;
    // the row is hidden while nothing changes, so only a real change earns a flash; the
    // first paint at boot is not news
    const changed = this._lastGarage !== undefined && this._lastGarage !== text;
    this._lastGarage = text;
    this.garageEl.textContent = text;
    this.garageEl.classList.toggle('full', count >= capacity);
    if (changed) this._flash(this.subRow, 'flash', 2.5);
  }

  /**
   * Bring a low-opacity HUD element up for `seconds`, then let CSS ease it back down. Used
   * by the district line and the garage/key-hint row, which have to stay in the DOM and keep
   * updating but must not hold screen space in the standing HUD. Re-flashing restarts the
   * clock instead of stacking timers.
   */
  _flash(el, cls, seconds) {
    if (!el) return;
    el.classList.add(cls);
    this.flashTimers ??= new Map();
    clearTimeout(this.flashTimers.get(el));
    this.flashTimers.set(el, setTimeout(() => {
      el.classList.remove(cls);
      this.flashTimers.delete(el);
    }, seconds * 1000));
  }

  setHurt(on) {
    this.vignette.classList.toggle('hurt', on);
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('on');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('on');
    }
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) {
        const next = this.dialogueQueue.shift();
        if (next) {
          this._showLine(next);
          this.dialogueTimer = next.hold ?? 4.2;
        } else {
          this.dialogue.classList.remove('on');
        }
      }
    }
  }
}