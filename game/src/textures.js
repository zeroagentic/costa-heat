// Procedural textures painted into <canvas> at boot. No image files, no network:
// every surface in the city (asphalt, pavement, facades, signs, sand) comes from here.
import * as THREE from 'three';

function canvas(size = 256, h = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  return c;
}

function finish(c, { repeatX = 1, repeatY = 1, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function speckle(ctx, size, count, alpha, rng, light = true) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rng.next() * 60);
    ctx.fillStyle = light ? `rgba(255,255,255,${alpha * rng.next()})` : `rgba(0,0,0,${alpha * rng.next()})`;
    ctx.fillRect(rng.next() * size, rng.next() * size, 1 + v / 24, 1 + v / 24);
  }
}

/** Dark asphalt with tar seams and a faint centre stripe. Tiles every 18 m of road. */
export function asphaltTexture(rng) {
  const c = canvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2f33';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const g = 32 + Math.floor(rng.next() * 34);
    ctx.fillStyle = `rgb(${g},${g + 2},${g + 3})`;
    ctx.fillRect(rng.next() * 256, rng.next() * 256, 1 + rng.next() * 3, 1 + rng.next() * 3);
  }
  // tar seams
  ctx.strokeStyle = 'rgba(16,18,20,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    let x = rng.next() * 256;
    let y = rng.next() * 256;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += rng.next() * 60 - 30;
      y += rng.next() * 60 - 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  speckle(ctx, 256, 700, 0.12, rng, true);
  return finish(c, { repeatX: 1, repeatY: 1 });
}

/** Light concrete slabs with joints, for pavements. */
export function pavementTexture(rng) {
  const c = canvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b7b1a6';
  ctx.fillRect(0, 0, 256, 256);
  for (let gx = 0; gx < 4; gx++) {
    for (let gy = 0; gy < 4; gy++) {
      const g = 176 + Math.floor(rng.next() * 22);
      ctx.fillStyle = `rgb(${g},${g - 5},${g - 12})`;
      ctx.fillRect(gx * 64 + 1, gy * 64 + 1, 62, 62);
    }
  }
  ctx.strokeStyle = 'rgba(110,104,96,0.85)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
  }
  speckle(ctx, 256, 1400, 0.1, rng, false);
  return finish(c);
}

/** Warm sand with wind ripples. */
export function sandTexture(rng) {
  const c = canvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e6cfa4';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2000; i++) {
    const g = 206 + Math.floor(rng.next() * 36);
    ctx.fillStyle = `rgba(${g},${g - 18},${g - 60},0.5)`;
    ctx.fillRect(rng.next() * 256, rng.next() * 256, 2, 1);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const y = i * 28 + rng.next() * 12;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.09 + i) * 4);
    ctx.stroke();
  }
  return finish(c);
}

/**
 * Facade tile: one 4x4 window module repeated. `style` chooses art-deco vertical
 * bands, shuttered balconies, or plain office glass. Returned ready to tile.
 */
export function facadeTexture(rng, style) {
  const c = canvas(256);
  const ctx = c.getContext('2d');
  const base = style === 'glass' ? '#5d7488' : style === 'stucco' ? '#e8dcc8' : style === 'pink' ? '#f0b7a8' : style === 'cream' ? '#f2e6cf' : '#d9cdb8';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  const cols = 4;
  const rows = 4;
  const cw = 256 / cols;
  const ch = 256 / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw;
      const y = row * ch;
      const gx = x + cw * 0.18;
      const gy = y + ch * 0.2;
      const gw = cw * 0.64;
      const gh = ch * 0.55;
      if (style === 'glass') {
        const grad = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
        const tint = 120 + Math.floor(rng.next() * 50);
        grad.addColorStop(0, `rgb(${tint - 40},${tint},${tint + 26})`);
        grad.addColorStop(0.55, `rgb(${tint - 70},${tint - 30},${tint + 4})`);
        grad.addColorStop(1, `rgb(${tint + 10},${tint + 30},${tint + 44})`);
        ctx.fillStyle = grad;
        ctx.fillRect(gx, gy, gw, gh);
        ctx.strokeStyle = 'rgba(20,32,40,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(gx, gy, gw, gh);
        ctx.fillStyle = 'rgba(20,32,40,0.45)';
        ctx.fillRect(gx, gy + gh / 2 - 1, gw, 2);
      } else {
        // recessed window with a lit or dark interior
        ctx.fillStyle = 'rgba(70,60,50,0.24)';
        ctx.fillRect(gx - 2, gy - 2, gw + 4, gh + 4);
        const lit = rng.next() < 0.24;
        ctx.fillStyle = lit ? '#f6d79a' : `rgba(${38 + Math.floor(rng.next() * 30)},${52 + Math.floor(rng.next() * 20)},${64 + Math.floor(rng.next() * 20)},0.95)`;
        ctx.fillRect(gx, gy, gw, gh);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(gx, gy, gw, Math.max(2, gh * 0.16));
        // shutters / mullions
        ctx.fillStyle = 'rgba(40,34,28,0.45)';
        ctx.fillRect(gx + gw / 2 - 1, gy, 2, gh);
        if (style === 'stucco' || style === 'pink') {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(gx - 4, gy + gh + 3, gw + 8, 3);
        }
      }
    }
    // floor band
    ctx.fillStyle = style === 'glass' ? 'rgba(24,36,46,0.5)' : 'rgba(120,104,84,0.32)';
    ctx.fillRect(0, row * ch, 256, 3);
  }
  if (style === 'deco') {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const x of [0, 128]) ctx.fillRect(x, 0, 5, 256);
  }
  speckle(ctx, 256, 500, 0.06, rng, false);
  return finish(c);
}

/** One vertical sign strip (neon lettering on dark), returned as a material map. */
export function signTexture(rng, text, hue) {
  const c = canvas(128, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#120d18';
  ctx.fillRect(0, 0, 128, 512);
  ctx.strokeStyle = `hsl(${hue}, 90%, 68%)`;
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, 118, 502);
  ctx.save();
  ctx.translate(64, 256);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = `hsl(${hue}, 95%, 72%)`;
  ctx.font = 'bold 66px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
  ctx.shadowBlur = 24;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return finish(c);
}

/** Broad horizontal shop sign. */
export function shopSignTexture(rng, text, bg, fg) {
  const c = canvas(512, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 104, 512, 24);
  ctx.font = 'bold 64px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.shadowColor = fg;
  ctx.shadowBlur = 14;
  ctx.fillText(text, 256, 60);
  return finish(c);
}

/** Palm frond card: a feathered leaf with an alpha channel. */
export function frondTexture(rng) {
  const c = canvas(64, 256);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 256);
  for (let i = 0; i < 44; i++) {
    const t = i / 44;
    const y = 8 + t * 236;
    const w = Math.sin(t * Math.PI) * 26 + 2;
    const g = 60 + Math.floor(rng.next() * 50);
    ctx.strokeStyle = `rgb(${g - 20},${g + 40},${g - 10})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.quadraticCurveTo(32 - w * 0.7, y + 8, 32 - w, y + 16);
    ctx.moveTo(32, y);
    ctx.quadraticCurveTo(32 + w * 0.7, y + 8, 32 + w, y + 16);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(96,120,50,0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(32, 252);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft round glow used for streetlight pools, muzzle flash and sun haze. */
export function glowTexture() {
  const c = canvas(128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,240,190,0.75)');
  g.addColorStop(0.55, 'rgba(255,190,120,0.22)');
  g.addColorStop(1, 'rgba(255,160,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertical sky gradient strip for the sunset dome. */
export function skyTexture() {
  const c = canvas(8, 512);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#2a3f86');
  g.addColorStop(0.32, '#4f6fb8');
  g.addColorStop(0.55, '#9d8fc0');
  g.addColorStop(0.72, '#e8a48e');
  g.addColorStop(0.86, '#ffb07a');
  g.addColorStop(1.0, '#ffd39a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Water surface normal-ish detail: faint ripple streaks, used as a bump-less colour map. */
export function waterTexture(rng) {
  const c = canvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f7189';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(${140 + rng.next() * 80},${210 + rng.next() * 40},${225 + rng.next() * 30},${0.05 + rng.next() * 0.16})`;
    ctx.lineWidth = 1 + rng.next() * 2;
    const y = rng.next() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 5);
    ctx.stroke();
  }
  return finish(c);
}

/** Checker + stripe crosswalk strip drawn as a tileable card. */
export function crosswalkTexture() {
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(238,238,232,0.88)';
  for (let i = 0; i < 8; i++) ctx.fillRect(i * 16, 0, 9, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}