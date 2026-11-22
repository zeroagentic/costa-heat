// Character bodies: a simple jointed humanoid built from merged, vertex-coloured meshes.
// One builder makes the player, pedestrians and police — palette swaps for skin, shirt,
// trousers and headgear. Each body is 5 draw calls (torso+head, 2 arms, 2 legs) instead
// of one per body part, which keeps crowds cheap.
import * as THREE from 'three';
import { mergeGeometries, boxGeometry, tintGeometry } from './geometry-utils.js';

const SKIN = [0xf2c9a0, 0xd9a97c, 0xa87450, 0x7a4f33, 0xe8bb95];
const SHIRT = [0xff5f8a, 0x2ad1c9, 0xffd166, 0xf2f6ff, 0x6a5acd, 0xff8c42, 0x3ddc84, 0xe4e4e4, 0x1f2f46, 0xd94f7a];
const PANTS = [0x2b3a55, 0x4a4036, 0xe9e2cf, 0x1b1b22, 0x3c5a74, 0xa8a29a];
const HAIR = [0x1b1512, 0x3a2a1a, 0x6a4a2a, 0xdedede, 0x120e0a];

/** One shared material for every character in the game (colours come from vertices). */
let characterMaterial = null;
export function getCharacterMaterial() {
  if (!characterMaterial) {
    characterMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.78, metalness: 0.02,
    });
  }
  return characterMaterial;
}

function mesh(geometries, material, castShadow = true) {
  const m = new THREE.Mesh(mergeGeometries(geometries), material);
  m.castShadow = castShadow;
  return m;
}

/**
 * Builds a humanoid. Returns { root, joints }. The root's origin is at the feet and the
 * body faces -Z. Limb pivots sit at the shoulder / hip so the animator can rotate them.
 */
export function buildCharacter(rng, opts = {}) {
  const skin = opts.skin ?? rng.pick(SKIN);
  const shirt = opts.uniform ? 0x22406e : opts.shirt ?? rng.pick(SHIRT);
  const pants = opts.uniform ? 0x16233c : opts.pants ?? rng.pick(PANTS);
  const hairColour = opts.hair ?? rng.pick(HAIR);
  const mat = getCharacterMaterial();
  const shadow = opts.shadows !== false;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // ---- torso, head, face, hat: one merged mesh at the body pivot ----
  const torsoParts = [
    tintGeometry(boxGeometry(0.52, 0.58, 0.3, 0, 1.18, 0), shirt),
    tintGeometry(boxGeometry(0.42, 0.22, 0.26, 0, 0.84, 0), pants),
    tintGeometry(boxGeometry(0.25, 0.27, 0.25, 0, 1.6, 0), skin),
    tintGeometry(boxGeometry(0.27, 0.09, 0.27, 0, 1.73, 0), hairColour),
  ];
  if (opts.shades) torsoParts.push(tintGeometry(boxGeometry(0.2, 0.045, 0.03, 0, 1.62, 0.13), 0x08090c));
  if (opts.uniform) {
    torsoParts.push(tintGeometry(boxGeometry(0.29, 0.1, 0.29, 0, 1.74, 0), 0x0d1730));
    torsoParts.push(tintGeometry(boxGeometry(0.09, 0.03, 0.02, 0, 1.71, 0.135), 0xffd166));
    torsoParts.push(tintGeometry(boxGeometry(0.12, 0.14, 0.02, -0.13, 1.24, 0.152), 0xffd166));
  }
  const torso = mesh(torsoParts, mat, shadow);
  body.add(torso);

  // ---- arms: shoulder pivot with a merged upper arm + hand ----
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, 1.4, 0);
    const parts = [
      tintGeometry(boxGeometry(0.15, 0.36, 0.16, 0, -0.17, 0), shirt),
      tintGeometry(boxGeometry(0.12, 0.1, 0.13, 0, -0.35, 0), skin),
      tintGeometry(boxGeometry(0.13, 0.32, 0.14, 0, -0.5, 0), skin),
    ];
    pivot.add(mesh(parts, mat, shadow));
    body.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // ---- legs: hip pivot with a merged thigh + shin + shoe ----
  const makeLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.82, 0);
    const parts = [
      tintGeometry(boxGeometry(0.19, 0.44, 0.2, 0, -0.22, 0), pants),
      tintGeometry(boxGeometry(0.17, 0.38, 0.18, 0, -0.62, 0), pants),
      tintGeometry(boxGeometry(0.19, 0.1, 0.29, 0, -0.82, 0.05), 0x15161a),
    ];
    pivot.add(mesh(parts, mat, shadow));
    body.add(pivot);
    return pivot;
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  return {
    root,
    joints: {
      body,
      torso,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
    },
  };
}

/**
 * Pose a character from a walk phase (radians), a speed ratio and an aim pose.
 * Also bobs the body, bobs the head and leans when sprinting.
 */
export function animateCharacter(joints, phase, speedRatio, opts = {}) {
  const swing = Math.min(1, speedRatio) * 0.95;
  const s = Math.sin(phase);
  joints.leftLeg.rotation.x = s * swing;
  joints.rightLeg.rotation.x = -s * swing;
  const armSwing = swing * 0.8;
  if (opts.aim) {
    joints.rightArm.rotation.x = -1.45;
    joints.rightArm.rotation.z = -0.08;
    joints.leftArm.rotation.x = -1.2;
    joints.leftArm.rotation.z = 0.34;
  } else {
    joints.rightArm.rotation.x = -s * armSwing;
    joints.rightArm.rotation.z = 0;
    joints.leftArm.rotation.x = s * armSwing;
    joints.leftArm.rotation.z = 0;
  }
  if (opts.flee) {
    joints.leftArm.rotation.x = -2.6 + Math.sin(phase * 1.3) * 0.4;
    joints.rightArm.rotation.x = -2.6 + Math.cos(phase * 1.3) * 0.4;
  }
  const bob = Math.abs(s) * 0.055 * Math.min(1, speedRatio);
  joints.body.position.y = bob - (opts.crouch ?? 0);
  joints.body.rotation.x = opts.lean ?? 0;
  joints.body.rotation.z = Math.sin(phase * 0.5) * 0.03 * Math.min(1, speedRatio);
}