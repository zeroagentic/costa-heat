// Live circular minimap drawn on a 2D canvas: the road grid, the beach, the player's
// rotating arrow, traffic, pedestrians, police and mission markers. North-up, player
// centred, with a rotating arrow showing the player's facing.
import { GRID, ROAD, CITY } from './config.js';

const SIZE = 360;
const SCALE = 2.55;     // pixels per world metre at the map's edge... (world radius shown)

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
  }

  /** World -> minimap pixels, player centred, north up. */
  _project(x, z, px, pz, scale) {
    return {
      x: SIZE / 2 + (x - px) * scale,
      y: SIZE / 2 + (z - pz) * scale,
    };
  }

  draw(world) {
    const ctx = this.ctx;
    const p = world.player.position;
    const heading = world.player.inVehicle ? world.player.inVehicle.yaw : world.player.yaw;
    // world-to-pixel scale: show about 120 m across the disc
    const scale = SIZE / 190;
    const R = SIZE / 2;

    ctx.save();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();

    // water / sand backdrop
    ctx.fillStyle = '#123240';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const landX = this._project(CITY.landMaxX, 0, p.x, p.z, scale).x;
    const sandStartX = this._project(CITY.landMaxX, 0, p.x, p.z, scale).x;
    const waterX = this._project(CITY.beachMaxX, 0, p.x, p.z, scale).x;
    if (waterX > 0) {
      const grad = ctx.createLinearGradient(sandStartX, 0, waterX, 0);
      grad.addColorStop(0, '#c8ae7e');
      grad.addColorStop(0.75, '#b49a6c');
      grad.addColorStop(1, '#2a7f96');
      ctx.fillStyle = '#2b3a44';
      ctx.fillRect(0, 0, sandStartX, SIZE);
      ctx.fillStyle = grad;
      ctx.fillRect(sandStartX, 0, Math.max(0, waterX - sandStartX), SIZE);
      ctx.fillStyle = '#1d6a84';
      ctx.fillRect(waterX, 0, SIZE, SIZE);
    } else {
      ctx.fillStyle = '#26333b';
      ctx.fillRect(0, 0, SIZE, SIZE);
    }

    // roads as thick lines
    const half = ROAD.halfWidth;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#4d5a63';
    ctx.lineWidth = Math.max(2, half * 2 * scale);
    ctx.beginPath();
    for (const x of GRID.xs) {
      const a = this._project(x, -700, p.x, p.z, scale);
      const b = this._project(x, 700, p.x, p.z, scale);
      if (Math.abs(a.x - R) > SIZE) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (const z of GRID.zs) {
      const a = this._project(-700, z, p.x, p.z, scale);
      const b = this._project(700, z, p.x, p.z, scale);
      if (Math.abs(a.y - R) > SIZE) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // lane centre dashes
    ctx.strokeStyle = 'rgba(230,238,240,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    for (const x of GRID.xs) {
      const a = this._project(x, -700, p.x, p.z, scale);
      const b = this._project(x, 700, p.x, p.z, scale);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (const z of GRID.zs) {
      const a = this._project(-700, z, p.x, p.z, scale);
      const b = this._project(700, z, p.x, p.z, scale);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // buildings as pale blocks
    ctx.fillStyle = 'rgba(178,190,198,0.34)';
    for (const c of world.city.colliders) {
      if (Math.abs(c.x0 - p.x) > 140 || Math.abs(c.z0 - p.z) > 140) continue;
      const a = this._project(c.x0, c.z0, p.x, p.z, scale);
      const b = this._project(c.x1, c.z1, p.x, p.z, scale);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }

    // mission markers (diamonds) and the mission car
    if (world.missions) {
      for (const marker of world.missions.activeMarkers()) {
        const m = this._project(marker.x, marker.z, p.x, p.z, scale);
        this._diamond(ctx, m.x, m.y, 6, marker.colour ?? '#ffd166');
      }
    }

    // police
    for (const o of world.police.officers) {
      if (!o.alive) continue;
      const m = this._project(o.position.x, o.position.z, p.x, p.z, scale);
      this._dot(ctx, m.x, m.y, 2.6, '#4a7bff');
    }
    for (const c of world.police.cruisers) {
      if (c.destroyed) continue;
      const m = this._project(c.vehicle.position.x, c.vehicle.position.z, p.x, p.z, scale);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(c.vehicle.yaw);
      ctx.fillStyle = '#5b86ff';
      ctx.fillRect(-2.2, -4.4, 4.4, 8.8);
      ctx.restore();
    }

    // traffic
    for (const car of world.traffic.cars) {
      if (car.state === 'dead') continue;
      const v = car.vehicle;
      if (Math.abs(v.position.x - p.x) > 150 || Math.abs(v.position.z - p.z) > 150) continue;
      const m = this._project(v.position.x, v.position.z, p.x, p.z, scale);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(-v.yaw);
      ctx.fillStyle = 'rgba(230,235,240,0.82)';
      ctx.fillRect(-1.9, -3.3, 3.8, 6.6);
      ctx.restore();
    }

    // pedestrians: small warm dots
    for (const ped of world.pedestrians.peds) {
      if (!ped.alive) continue;
      if (Math.abs(ped.position.x - p.x) > 120 || Math.abs(ped.position.z - p.z) > 120) continue;
      const m = this._project(ped.position.x, ped.position.z, p.x, p.z, scale);
      this._dot(ctx, m.x, m.y, 1.6, ped.panic > 0 ? '#ff5a5a' : 'rgba(255,214,170,0.85)');
    }

    // stolen car marker when the player is on foot and the car was left behind
    if (world.stolenVehicle && !world.player.inVehicle) {
      const v = world.stolenVehicle;
      const m = this._project(v.position.x, v.position.z, p.x, p.z, scale);
      this._dot(ctx, m.x, m.y, 3, '#ff3d8b');
    }

    // player arrow, rotated by facing (world yaw: 0 faces -Z which is up on the map)
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(-heading);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#45f0ff';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();

    // N compass tick
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('N', R, 18);

    ctx.restore();

    // rim
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(69,240,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _dot(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  _diamond(ctx, x, y, r, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillRect(-r / 1.6, -r / 1.6, r * 1.25, r * 1.25);
    ctx.restore();
  }
}