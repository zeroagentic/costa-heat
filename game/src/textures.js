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
 * Facade tile: one 6x6 window module repeated at 512px so window frames, sills, balcony
 * rails, awnings and AC boxes all survive screenshot distance. `style` chooses art-deco
 * vertical bands, shuttered balconies or plain office glass. Returned ready to tile.
 */
export function facadeTexture(rng, style) {
  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const base = style === 'glass' ? '#4a6275' : style === 'stucco' ? '#dccdb4' : style === 'pink' ? '#e0a394' : style === 'cream' ? '#e6d7ba' : '#c8b9a2';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // plaster / panel grain so a wall is never one flat colour
  for (let i = 0; i < 2600; i++) {
    const v = rng.next();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${rng.next() * 0.10})` : `rgba(60,44,30,${rng.next() * 0.11})`;
    ctx.fillRect(rng.next() * S, rng.next() * S, 1 + rng.next() * 5, 1 + rng.next() * 4);
  }

  const cols = 6;
  const rows = 6;
  const cw = S / cols;
  const ch = S / rows;

  for (let row = 0; row < rows; row++) {
    // floor slab shadow line, thicker on every third floor
    ctx.fillStyle = style === 'glass' ? 'rgba(10,20,30,0.62)' : 'rgba(96,74,52,0.42)';
    ctx.fillRect(0, row * ch, S, row % 3 === 0 ? 5 : 2);
    ctx.fillStyle = style === 'glass' ? 'rgba(180,210,230,0.13)' : 'rgba(255,246,228,0.24)';
    ctx.fillRect(0, row * ch + (row % 3 === 0 ? 5 : 2), S, 2);

    for (let col = 0; col < cols; col++) {
      const x = col * cw;
      const y = row * ch;
      const gx = x + cw * 0.14;
      const gy = y + ch * 0.20;
      const gw = cw * 0.72;
      const gh = ch * 0.50;

      // recessed reveal around every window
      ctx.fillStyle = 'rgba(48,38,28,0.30)';
      ctx.fillRect(gx - 4, gy - 4, gw + 8, gh + 8);

      const lit = rng.next() < 0.30;
      if (style === 'glass') {
        const grad = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
        const tint = 96 + Math.floor(rng.next() * 56);
        grad.addColorStop(0, `rgb(${tint - 34},${tint + 14},${tint + 46})`);
        grad.addColorStop(0.42, `rgb(${tint - 62},${tint - 14},${tint + 16})`);
        grad.addColorStop(0.72, `rgb(${tint + 22},${tint + 52},${tint + 68})`);
        grad.addColorStop(1, `rgb(${tint - 20},${tint + 26},${tint + 58})`);
        ctx.fillStyle = grad;
        ctx.fillRect(gx, gy, gw, gh);
        // mullion grid: 2 across, 2 down
        ctx.fillStyle = 'rgba(14,24,34,0.66)';
        ctx.fillRect(gx, gy + gh / 2 - 1, gw, 2);
        ctx.fillRect(gx + gw / 2 - 1, gy, 2, gh);
        ctx.strokeStyle = 'rgba(12,22,32,0.80)';
        ctx.lineWidth = 3;
        ctx.strokeRect(gx, gy, gw, gh);
        // spandrel band under the glass
        ctx.fillStyle = `rgba(${34 + tint / 6},${52 + tint / 6},${66 + tint / 6},0.92)`;
        ctx.fillRect(x, gy + gh + 5, cw, ch * 0.16);
      } else {
        // interior: a lit room or a dark one, never a pure flat block
        if (lit) {
          const warm = ctx.createLinearGradient(gx, gy, gx, gy + gh);
          warm.addColorStop(0, '#ffe0a8');
          warm.addColorStop(0.6, '#f2b96e');
          warm.addColorStop(1, '#c98a4a');
          ctx.fillStyle = warm;
        } else {
          const dark = ctx.createLinearGradient(gx, gy, gx + 8, gy + gh);
          dark.addColorStop(0, `rgba(${26 + Math.floor(rng.next() * 22)},${38 + Math.floor(rng.next() * 18)},${50 + Math.floor(rng.next() * 18)},0.97)`);
          dark.addColorStop(1, `rgba(${14 + Math.floor(rng.next() * 14)},${22 + Math.floor(rng.next() * 12)},${34 + Math.floor(rng.next() * 12)},0.97)`);
          ctx.fillStyle = dark;
        }
        ctx.fillRect(gx, gy, gw, gh);

        // top reveal highlight (the sun catches the head of the opening)
        ctx.fillStyle = 'rgba(255,252,240,0.34)';
        ctx.fillRect(gx, gy, gw, 3);
        // centre mullion + one transom
        ctx.fillStyle = 'rgba(34,28,22,0.55)';
        ctx.fillRect(gx + gw / 2 - 1.5, gy, 3, gh);
        ctx.fillRect(gx, gy + gh * 0.42, gw, 2);
        // frame
        ctx.strokeStyle = 'rgba(28,24,20,0.72)';
        ctx.lineWidth = 3;
        ctx.strokeRect(gx, gy, gw, gh);

        // shutters on the deco/pink/cream houses
        if (style !== 'glass' && rng.next() < 0.4) {
          const sw = gw * 0.22;
          ctx.fillStyle = rng.next() < 0.5 ? 'rgba(46,74,58,0.92)' : 'rgba(120,62,46,0.92)';
          ctx.fillRect(gx - sw - 3, gy, sw, gh);
          ctx.fillRect(gx + gw + 3, gy, sw, gh);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          for (let sl = 0; sl < 6; sl++) {
            ctx.fillRect(gx - sw - 3, gy + (sl / 6) * gh + 2, sw, 1.6);
            ctx.fillRect(gx + gw + 3, gy + (sl / 6) * gh + 2, sw, 1.6);
          }
        }

        // sill + drip stain under every window
        ctx.fillStyle = 'rgba(255,250,236,0.55)';
        ctx.fillRect(gx - 6, gy + gh + 2, gw + 12, 3);
        ctx.fillStyle = 'rgba(70,56,40,0.10)';
        ctx.fillRect(gx - 5, gy + gh + 5, gw + 10, 7);
      }

      // ---- balcony: a slab under the window with a rail, on the non-glass houses ----
      if (style !== 'glass' && rng.next() < 0.42) {
        const bx = x + 3;
        const by = gy + gh + 6;
        ctx.fillStyle = 'rgba(30,26,22,0.34)';
        ctx.fillRect(bx + 3, by + 4, cw - 6, 6);
        ctx.fillStyle = 'rgba(248,242,228,0.86)';
        ctx.fillRect(bx, by, cw - 6, 4);
        // balusters
        ctx.fillStyle = 'rgba(52,46,38,0.62)';
        for (let b = 0; b < 7; b++) ctx.fillRect(bx + 3 + b * ((cw - 12) / 7), by - 12, 2, 12);
        ctx.fillRect(bx, by - 14, cw - 6, 3);
        // a plant pot on some of them
        if (rng.next() < 0.5) {
          ctx.fillStyle = 'rgba(150,72,48,0.9)';
          ctx.fillRect(bx + cw * 0.62, by - 22, 9, 8);
          ctx.fillStyle = 'rgba(70,120,58,0.95)';
          for (let f = 0; f < 6; f++) {
            ctx.fillRect(bx + cw * 0.62 + rng.next() * 8, by - 30 - rng.next() * 6, 4, 8);
          }
        }
      }

      // ---- window AC unit bolted to the sill ----
      if (rng.next() < 0.22) {
        const ax = gx + gw * 0.42;
        const ay = gy + gh - 15;
        ctx.fillStyle = 'rgba(184,182,172,0.95)';
        ctx.fillRect(ax, ay, 26, 15);
        ctx.fillStyle = 'rgba(112,110,102,0.95)';
        ctx.fillRect(ax + 2, ay + 2, 22, 11);
        ctx.fillStyle = 'rgba(58,56,52,0.9)';
        for (let g = 0; g < 4; g++) ctx.fillRect(ax + 4, ay + 4 + g * 2.4, 18, 1);
        ctx.fillStyle = 'rgba(40,38,34,0.7)';
        ctx.fillRect(ax, ay + 15, 26, 2);
      }
    }
  }

  if (style === 'deco') {
    // vertical fluted pilasters, the signature of the strip's hotels
    for (const x of [0, S / 2]) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillRect(x, 0, 10, S);
      ctx.fillStyle = 'rgba(120,96,70,0.30)';
      ctx.fillRect(x + 8, 0, 4, S);
      ctx.fillStyle = 'rgba(255,255,255,0.36)';
      ctx.fillRect(x + 4, 0, 2, S);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(0, 0, S, 6);
  }
  if (style === 'glass') {
    // continuous vertical mullion ribs between the window bays
    ctx.fillStyle = 'rgba(24,38,50,0.55)';
    for (let col = 1; col < cols; col++) ctx.fillRect(col * cw - 2, 0, 4, S);
  }

  speckle(ctx, S, 900, 0.07, rng, false);
  return finish(c, { aniso: 8 });
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

/**
 * Golden-hour sky for the dome. The whole vertical fall is painted as a ladder of discrete
 * colour bands rather than a single gradient stretched from top to bottom: a deep blue cap
 * overhead, a run of blues and cyans down the upper half, then a short and very steep climb
 * through orange into a hot peach that sits exactly on the horizon (canvas v = 0.5), then a
 * dark warm ground below it. Cloud streets are stamped into the same canvas, three copies
 * offset by one width each so the wrap seam never shows, which keeps the whole dome at one
 * texture and zero extra draw calls.
 */
export function skyTexture(seed = 11) {
  const W = 1024, H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');

  // canvas y = 0 is the zenith, y = H/2 is the horizon.
  // The stops below are placed like rungs, not like a blend: each pair of neighbours is a
  // short, deliberate step, and the gap between them stays wide across the top of the dome
  // and closes up hard in the last few centimetres before the horizon. That uneven spacing
  // is the whole trick. A single two-colour blend from zenith to horizon spends its whole
  // length averaging the two, so the warm end in the source gets smeared up the dome and the
  // cool end dragged down, and the boundary where sky meets sea turns into a muddy brown-grey
  // wash with no line to it. Keeping the warm bands compressed into a narrow strip leaves the
  // blues overhead deep and unbroken, so at the horizon there is a crisp change of value the
  // eye can actually find — a sunset reads by that contrast, not by the amount of orange.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.000, '#041c52');
  g.addColorStop(0.070, '#062a63');
  g.addColorStop(0.150, '#0a3d7c');
  g.addColorStop(0.240, '#10508f');
  g.addColorStop(0.320, '#19679d');
  g.addColorStop(0.380, '#2a7fa8');
  g.addColorStop(0.425, '#4a94ab');
  g.addColorStop(0.455, '#b8794f');
  g.addColorStop(0.475, '#f0641e');
  g.addColorStop(0.492, '#ff7420');
  g.addColorStop(0.505, '#ffa446');
  g.addColorStop(0.530, '#e88b3c');
  g.addColorStop(0.580, '#a8603a');
  g.addColorStop(0.700, '#5a3826');
  g.addColorStop(1.000, '#241812');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // deterministic little PRNG so the sky is identical every run
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  const blob = (x, y, rx, ry, r, gg, b, a) => {
    for (const dx of [-W, 0, W]) {
      ctx.save();
      ctx.translate(x + dx, y);
      ctx.scale(1, ry / rx);
      const rad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      rad.addColorStop(0.0, `rgba(${r},${gg},${b},${a})`);
      rad.addColorStop(0.45, `rgba(${r},${gg},${b},${a * 0.62})`);
      rad.addColorStop(1.0, `rgba(${r},${gg},${b},0)`);
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  // ---- high cloud streets: long, cool, barely there ----
  for (let i = 0; i < 22; i++) {
    const y = H * (0.05 + rnd() * 0.20);
    const x = rnd() * W;
    const rx = 90 + rnd() * 170;
    blob(x, y, rx, rx * (0.16 + rnd() * 0.12), 226, 232, 240, 0.10 + rnd() * 0.10);
  }

  // ---- mid clouds: brighter cores, warm grey undersides ----
  for (let i = 0; i < 34; i++) {
    const t = rnd();
    const y = H * (0.15 + t * 0.24);          // 0.15 .. 0.39
    const x = rnd() * W;
    const rx = 55 + rnd() * 130;
    const ry = rx * (0.20 + rnd() * 0.16);
    blob(x, y, rx, ry * 1.15, 246, 226, 206, 0.16 + rnd() * 0.12);
    blob(x + rx * 0.18, y - ry * 0.35, rx * 0.72, ry * 0.8, 255, 244, 228, 0.18 + rnd() * 0.14);
  }

  // ---- low cloud bank sitting on the horizon: hot rim, dusky belly ----
  for (let i = 0; i < 30; i++) {
    const y = H * (0.398 + rnd() * 0.058);
    const x = rnd() * W;
    const rx = 46 + rnd() * 120;
    const ry = rx * (0.10 + rnd() * 0.09);
    blob(x, y, rx, ry * 1.4, 150, 132, 132, 0.16 + rnd() * 0.12);
    blob(x, y + ry * 0.9, rx * 0.94, ry * 0.8, 255, 186, 128, 0.22 + rnd() * 0.16);
  }

  // ---- a few long stratus streaks for structure near the horizon ----
  for (let i = 0; i < 14; i++) {
    const y = H * (0.36 + rnd() * 0.10);
    const x = rnd() * W;
    const rx = 200 + rnd() * 260;
    blob(x, y, rx, 5 + rnd() * 9, 255, 214, 176, 0.10 + rnd() * 0.10);
  }

  // ---- sun haze baked into the band the sun rises through ----
  const glow = ctx.createLinearGradient(0, H * 0.40, 0, H * 0.53);
  glow.addColorStop(0, 'rgba(255,200,140,0)');
  glow.addColorStop(0.55, 'rgba(255,186,120,0.30)');
  glow.addColorStop(1, 'rgba(255,232,190,0.16)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, H * 0.40, W, H * 0.13);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Big rooftop billboard face: bold poster type on a saturated ground. */
export function billboardTexture(rng, title, sub, hue) {
  const c = canvas(512, 216);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 216);
  g.addColorStop(0, `hsl(${hue}, 78%, 30%)`);
  g.addColorStop(0.55, `hsl(${hue + 18}, 82%, 44%)`);
  g.addColorStop(1, `hsl(${hue - 14}, 74%, 22%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 216);
  // diagonal sun-ray bands
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#ffffff';
  for (let i = -6; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 46, 216);
    ctx.lineTo(i * 46 + 22, 216);
    ctx.lineTo(i * 46 + 132, 0);
    ctx.lineTo(i * 46 + 110, 0);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = `hsl(${(hue + 160) % 360}, 95%, 70%)`;
  ctx.fillRect(0, 150, 512, 8);
  ctx.font = 'bold 104px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(title, 27, 89);
  ctx.fillStyle = '#fff8e8';
  ctx.fillText(title, 24, 84);
  ctx.font = 'bold 30px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,244,214,0.95)';
  ctx.fillText(sub, 28, 140);
  // frame
  ctx.strokeStyle = 'rgba(12,8,6,0.85)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 208);
  return finish(c, { aniso: 8 });
}

/** Soft vertical haze gradient: hot at the horizon, transparent above and below. */
export function hazeTexture() {
  const c = canvas(4, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, 'rgba(255,190,130,0)');
  g.addColorStop(0.30, 'rgba(255,178,112,0.35)');
  g.addColorStop(0.52, 'rgba(255,196,142,0.72)');
  g.addColorStop(0.62, 'rgba(246,170,116,0.60)');
  g.addColorStop(0.84, 'rgba(214,140,96,0.18)');
  g.addColorStop(1.00, 'rgba(190,120,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
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