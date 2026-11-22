// The objective marker: a vertical beam of light with a glowing disc at its base, bobbing
// gently, plus a halo sprite. Shared by mission objectives and the garage pad so every
// marker in the world looks and behaves the same.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

export const MARKER_COLOUR = {
  go: 0xffd166,
  hot: 0xff3d8b,
  done: 0x45f0ff,
  garage: 0xffb020,
};

export function buildMarker(scene, colour = MARKER_COLOUR.go) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 32),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.06;
  group.add(disc);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2.3, 16, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.18, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 8;
  group.add(beam);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: colour, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sprite.scale.set(6, 6, 1);
  sprite.position.y = 0.9;
  group.add(sprite);
  group.userData = { disc, beam, sprite };
  scene.add(group);
  return group;
}