// HUD: cash, health, wanted stars, mission checklist, weapon/ammo, prompts, dialogue,
// toasts and the damage vignette. Reads world state each frame; owns only DOM.
import { AREA_NAMES, districtAt } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.cashEl = $('cash');
    this.healthFill = $('health-fill');
    this.wantedEl = $('wanted');
    this.missionPanel = $('mission-panel');
    this.missionTitle = $('mission-title');
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
    this.lastCash = -1;
    this.lastHealth = -1;
    this.lastStars = -1;
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
  }

  setWeapon(name, ammo, reserve) {
    this.weaponName.textContent = name;
    this.ammoEl.textContent = `${ammo} / ${reserve}`;
  }

  setMission(mission) {
    if (!mission) {
      this.missionPanel.style.display = 'none';
      return;
    }
    this.missionPanel.style.display = 'block';
    this.missionTitle.textContent = mission.title;
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

  say(name, text, seconds = 4) {
    this.dialogueName.textContent = name;
    this.dialogueText.textContent = text;
    this.dialogue.classList.add('on');
    this.dialogueTimer = seconds;
  }

  setSpeed(visible, mph) {
    this.speedo.classList.toggle('on', visible);
    if (visible) this.speedValue.textContent = String(Math.round(mph));
  }

  setArea(x, z) {
    const name = AREA_NAMES[districtAt(x, z)] ?? 'VICE BEACH';
    if (name === this.lastArea) return;
    this.lastArea = name;
    this.areaEl.textContent = name;
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
      if (this.dialogueTimer <= 0) this.dialogue.classList.remove('on');
    }
  }
}