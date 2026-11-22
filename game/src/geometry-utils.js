// Small geometry helpers: merge many quads into a single mesh, and build boxes whose
// wall UVs repeat in world units so one tiling facade texture fits every building size.
import * as THREE from 'three';

/** Merge any mix of indexed/non-indexed geometries that share position/normal/uv[/color]. */
export function mergeGeometries(geometries) {
  const parts = geometries.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'uv', 'color'];
  const used = names.filter((n) => parts.every((g) => g.getAttribute(n)));
  const totals = [];
  for (const n of used) {
    let count = 0;
    for (const g of parts) count += g.getAttribute(n).count;
    totals.push(count);
  }
  const out = new THREE.BufferGeometry();
  used.forEach((n, i) => {
    const itemSize = parts[0].getAttribute(n).itemSize;
    const array = new Float32Array(totals[i] * itemSize);
    let offset = 0;
    for (const g of parts) {
      const attr = g.getAttribute(n);
      array.set(attr.array, offset);
      offset += attr.array.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(array, itemSize));
  });
  out.computeBoundingSphere();
  return out;
}

/** Quad from four corner points; normal is derived from the winding. */
export function quadGeometry(a, b, c, d, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  const positions = new Float32Array([
    a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
    a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z,
  ]);
  const uvsFlat = new Float32Array([
    uvs[0][0], uvs[0][1], uvs[1][0], uvs[1][1], uvs[2][0], uvs[2][1],
    uvs[0][0], uvs[0][1], uvs[2][0], uvs[2][1], uvs[3][0], uvs[3][1],
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvsFlat, 2));
  g.computeVertexNormals();
  return g;
}

/** Axis-aligned box centred at (x,y,z) with optional per-face vertex colour. */
export function boxGeometry(w, h, d, x = 0, y = 0, z = 0, color = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  if (color) {
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

export function planeGeometry(w, h, x = 0, y = 0, z = 0, rotX = -Math.PI / 2) {
  const g = new THREE.PlaneGeometry(w, h);
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  return g;
}

/**
 * Four walls of a box with UVs measured in metres (u = horizontal metres / tileW,
 * v = vertical metres / tileH) so a facade texture tiles identically on every face.
 */
export function wallGeometry(w, h, d, x, z, tileW = 12.8, tileH = 14.4) {
  const hw = w / 2, hd = d / 2;
  const y0 = 0, y1 = h;
  const quads = [];
  const V = (px, py, pz) => new THREE.Vector3(px, py, pz);
  // +Z (south) face
  quads.push(quadGeometry(
    V(x - hw, y0, z + hd), V(x + hw, y0, z + hd), V(x + hw, y1, z + hd), V(x - hw, y1, z + hd),
    [[0, 0], [w / tileW, 0], [w / tileW, h / tileH], [0, h / tileH]],
  ));
  // -Z (north) face
  quads.push(quadGeometry(
    V(x + hw, y0, z - hd), V(x - hw, y0, z - hd), V(x - hw, y1, z - hd), V(x + hw, y1, z - hd),
    [[0, 0], [w / tileW, 0], [w / tileW, h / tileH], [0, h / tileH]],
  ));
  // +X (east) face
  quads.push(quadGeometry(
    V(x + hw, y0, z + hd), V(x + hw, y0, z - hd), V(x + hw, y1, z - hd), V(x + hw, y1, z + hd),
    [[0, 0], [d / tileW, 0], [d / tileW, h / tileH], [0, h / tileH]],
  ));
  // -X (west) face
  quads.push(quadGeometry(
    V(x - hw, y0, z - hd), V(x - hw, y0, z + hd), V(x - hw, y1, z + hd), V(x - hw, y1, z - hd),
    [[0, 0], [d / tileW, 0], [d / tileW, h / tileH], [0, h / tileH]],
  ));
  return mergeGeometries(quads);
}

/** Flat roof quad, plus a raised parapet ring for silhouette detail. */
export function roofGeometry(w, d, h, x, z, colour) {
  const parts = [planeGeometry(w, d, x, h, z, -Math.PI / 2)];
  const t = 0.45;
  const y = h + 0.35;
  parts.push(boxGeometry(w + t, 0.7, t, x, y, z + d / 2, colour));
  parts.push(boxGeometry(w + t, 0.7, t, x, y, z - d / 2, colour));
  parts.push(boxGeometry(t, 0.7, d, x + w / 2, y, z, colour));
  parts.push(boxGeometry(t, 0.7, d, x - w / 2, y, z, colour));
  return mergeGeometries(parts);
}

/** Rotate a geometry around its own centre and translate it, returning a new geometry. */
export function placed(geometry, x, y, z, rotY = 0) {
  const g = geometry.clone();
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** Give every vertex of a geometry the same colour (for per-building tinting). */
export function tintGeometry(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}