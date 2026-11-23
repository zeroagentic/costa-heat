// Car bodies. Each kind is a distinct silhouette built from merged, vertex-coloured
// geometry: glass cabin, bonnet, boot, bumpers, wheel wells, mirrors, lights and plate.
// A car is a handful of draw calls (body, glass, trim, 4 wheels) so a full street of
// traffic stays cheap.
import * as THREE from 'three';
import { mergeGeometries, boxGeometry, tintGeometry } from './geometry-utils.js';
import { getCharacterMaterial } from './characters.js';

const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.95 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.85, roughness: 0.28 });
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x2a4356, roughness: 0.1, metalness: 0.7, transparent: true, opacity: 0.9,
});

/** One shared vertex-coloured material for every car body and trim. */
// Paint is where metalness and roughness have to be balanced against each other rather than
// driven to an extreme. Metalness sets how much of the surface behaves like bare metal: at
// zero the body answers only to diffuse light and looks like moulded plastic, with a dull
// flat flank that ignores the sky. At one it becomes a conductor that mirrors its
// surroundings and reads as chrome. Halfway between, the panels take a coloured metallic
// response and pick up the environment enough to look like paint over steel. Roughness then
// sets how tight that reflection is: high values smear the highlight into a soft sheen, very
// low values collapse it to a mirror point. Set low-but-not-lowest, the specular stays a
// broad band that travels along the flank as the car turns — which is precisely the surface
// the low sun rakes across, so the body catches a moving warm streak instead of a hard dot.
let carMaterial = null;
export function getCarMaterial() {
  if (!carMaterial) {
    carMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,      // one material serves every body colour; the tint lives in the geometry
      metalness: 0.45,         // enough metallic response to read as painted metal, not grey plastic
      roughness: 0.34,         // glossy paint: a tight highlight, short of the mirror sharpness of chrome
    });
  }
  return carMaterial;
}

let wheelGeometry = null;
function wheel() {
  const g = new THREE.Group();
  if (!wheelGeometry) {
    const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
    tyre.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(0.19, 0.19, 0.272, 8);
    rim.rotateZ(Math.PI / 2);
    wheelGeometry = {
      tyre: tyre.toNonIndexed(),
      rim: rim.toNonIndexed(),
    };
  }
  const t = new THREE.Mesh(wheelGeometry.tyre, tyreMat);
  t.castShadow = true;
  g.add(t);
  const r = new THREE.Mesh(wheelGeometry.rim, rimMat);
  g.add(r);
  return g;
}

function addLightBar(root, x, y, z, width, colour) {
  const mat = new THREE.MeshStandardMaterial({
    color: colour, emissive: colour, emissiveIntensity: 1.5, roughness: 0.3,
  });
  const lights = [];
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.06), mat);
    m.position.set(x + s * width * 0.92, y, z);
    root.add(m);
    lights.push(m);
  }
  return lights;
}

/**
 * Build a car of the given kind. The model faces -Z (forward), origin at ground level.
 * Returns { root, wheels, lights, halfWidth, halfLength }.
 */
export function buildVehicleBody(kind, colour, opts = {}) {
  const root = new THREE.Group();
  const mat = getCarMaterial();
  const bodyParts = [];
  const trimParts = [];
  const wheels = [];
  const lights = { headlights: [], brake: [], siren: null };
  let halfWidth = 0.95;
  let halfLength = 2.3;

  const glassParts = [];
  const wheelPositionList = [];

  const addWheels = (wx, wz) => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        wheelPositionList.push({ x: sx * wx, z: sz * wz, steer: sz < 0 });
      }
    }
  };

  if (kind === 'sedan') {
    halfWidth = 0.94; halfLength = 2.36;
    bodyParts.push(boxGeometry(1.84, 0.52, 4.5, 0, 0.62, 0));
    bodyParts.push(boxGeometry(1.76, 0.42, 3.3, 0, 0.42, 0));
    bodyParts.push(boxGeometry(1.62, 0.62, 2.1, 0, 1.15, -0.1));
    glassParts.push([1.55, 0.44, 1.9, 0, 1.16, -0.1]);
    addWheels(0.9, 1.5);
  } else if (kind === 'coupe') {
    halfWidth = 0.98; halfLength = 2.42;
    bodyParts.push(boxGeometry(1.92, 0.46, 4.6, 0, 0.58, 0));
    bodyParts.push(boxGeometry(1.84, 0.34, 3.6, 0, 0.4, 0));
    bodyParts.push(boxGeometry(1.56, 0.5, 1.9, 0, 1.06, -0.32));
    bodyParts.push(boxGeometry(1.6, 0.2, 0.9, 0, 1.0, 1.42));
    glassParts.push([1.5, 0.42, 1.75, 0, 1.08, -0.32]);
    addWheels(0.95, 1.52);
  } else if (kind === 'sports') {
    halfWidth = 1.02; halfLength = 2.3;
    bodyParts.push(boxGeometry(2.0, 0.38, 4.4, 0, 0.5, 0));
    bodyParts.push(boxGeometry(1.9, 0.26, 3.2, 0, 0.3, 0));
    bodyParts.push(boxGeometry(1.5, 0.4, 1.55, 0, 0.88, -0.18));
    bodyParts.push(boxGeometry(1.42, 0.14, 0.7, 0, 0.74, 1.9));
    bodyParts.push(boxGeometry(1.3, 0.08, 0.34, 0, 1.14, 1.9));
    glassParts.push([1.44, 0.34, 1.42, 0, 0.9, -0.18]);
    addWheels(1.0, 1.42);
  } else if (kind === 'van') {
    halfWidth = 1.08; halfLength = 2.8;
    bodyParts.push(boxGeometry(2.12, 1.55, 5.4, 0, 1.06, 0));
    bodyParts.push(boxGeometry(2.0, 0.85, 1.5, 0, 0.6, -2.05));
    bodyParts.push(boxGeometry(1.9, 0.45, 3.6, 0, 0.42, 0));
    glassParts.push([1.96, 0.6, 0.12, 0, 1.42, -2.72]);
    glassParts.push([2.14, 0.5, 1.0, 0, 1.42, -1.2]);
    addWheels(1.02, 1.8);
  } else if (kind === 'pickup') {
    halfWidth = 1.0; halfLength = 2.6;
    bodyParts.push(boxGeometry(1.96, 0.62, 5.2, 0, 0.68, 0));
    bodyParts.push(boxGeometry(1.86, 0.7, 1.9, 0, 1.26, -0.7));
    bodyParts.push(boxGeometry(1.94, 0.42, 1.9, 0, 1.24, 1.4));
    glassParts.push([1.78, 0.5, 1.6, 0, 1.28, -0.7]);
    addWheels(0.96, 1.7);
  } else if (kind === 'police') {
    halfWidth = 0.98; halfLength = 2.42;
    bodyParts.push(boxGeometry(1.92, 0.5, 4.6, 0, 0.62, 0));
    bodyParts.push(boxGeometry(1.8, 0.38, 3.4, 0, 0.42, 0));
    bodyParts.push(boxGeometry(1.62, 0.6, 2.2, 0, 1.1, -0.05));
    glassParts.push([1.55, 0.44, 2.0, 0, 1.1, -0.05]);
    // livery stripes and roof panel
    trimParts.push(boxGeometry(0.05, 0.36, 2.9, 0.968, 0.62, 0.1, 0x0b1220));
    trimParts.push(boxGeometry(0.05, 0.36, 2.9, -0.968, 0.62, 0.1, 0x0b1220));
    trimParts.push(boxGeometry(1.64, 0.06, 0.85, 0, 1.42, 0.2, 0x0b1220));
    trimParts.push(boxGeometry(0.09, 0.03, 0.02, 0.99, 0.98, -0.35, 0xffd166));
    addWheels(0.94, 1.5);

    // light bar with separate materials so the siren can alternate
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: 0x22262c }));
    bar.position.set(0, 1.47, -0.1);
    root.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.13, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff0022, emissiveIntensity: 2.4, toneMapped: false }),
    );
    red.position.set(-0.3, 1.57, -0.1);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.13, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 2.4, toneMapped: false }),
    );
    blue.position.set(0.3, 1.57, -0.1);
    root.add(red, blue);
    const glow = new THREE.PointLight(0x4466ff, 0, 22, 2);
    glow.position.set(0, 1.7, -0.1);
    glow.visible = false;
    root.add(glow);
    lights.siren = { left: blue, right: red, glow };
  }

  // body shell
  if (bodyParts.length) {
    const body = new THREE.Mesh(mergeGeometries(bodyParts.map((g) => tintGeometry(g, colour))), mat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.name = 'car-body';
    root.add(body);
  }

  // glass cabin
  const glassGeoms = glassParts.map(([w, h, d, x, y, z]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  });
  if (glassGeoms.length) {
    const glass = new THREE.Mesh(mergeGeometries(glassGeoms), glassMat);
    glass.castShadow = true;
    root.add(glass);
  }

  // bumpers, mirrors, plate, exhaust — all one trim mesh
  const bumperColour = 0x2a2c31;
  trimParts.push(boxGeometry(halfWidth * 2.02, 0.22, 0.24, 0, 0.42, -halfLength + 0.06, bumperColour));
  trimParts.push(boxGeometry(halfWidth * 2.02, 0.22, 0.24, 0, 0.42, halfLength - 0.06, bumperColour));
  for (const s of [-1, 1]) {
    trimParts.push(boxGeometry(0.2, 0.1, 0.1, s * (halfWidth + 0.06), 1.12, -0.75, colour));
  }
  trimParts.push(boxGeometry(0.44, 0.13, 0.02, 0, 0.4, halfLength + 0.02, 0xf2e9c8));
  trimParts.push(boxGeometry(0.12, 0.12, 0.2, halfWidth * 0.55, 0.3, halfLength + 0.04, 0x9aa0a6));
  if (trimParts.length) {
    const trim = new THREE.Mesh(mergeGeometries(trimParts), mat);
    trim.castShadow = true;
    root.add(trim);
  }

  // wheels
  for (const w of wheelPositionList) {
    const wh = wheel();
    wh.position.set(w.x, 0.34, w.z);
    wh.userData.steer = w.steer;
    root.add(wh);
    wheels.push(wh);
  }

  lights.headlights = addLightBar(root, 0, 0.58, -halfLength - 0.01, kind === 'van' ? 0.26 : 0.3, 0xfff2cc);
  lights.brake = addLightBar(root, 0, 0.6, halfLength + 0.01, 0.26, 0xff3040);

  return { root, wheels, lights, halfWidth, halfLength };
}