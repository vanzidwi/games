import * as THREE from 'three';
import { CAMERA_PRESETS } from '@shared/constants.js';

export function createStudioCamera(aspect = 16 / 9) {
  const camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 80);
  camera.position.set(0, 6.2, 10.5);
  return camera;
}

export const CAMERA_PRESET_TARGETS = Object.freeze({
  [CAMERA_PRESETS.FREE]: {
    position: new THREE.Vector3(0, 6.2, 10.5),
    target: new THREE.Vector3(0, 1.2, 0)
  },
  [CAMERA_PRESETS.OVERVIEW]: {
    position: new THREE.Vector3(0, 10.2, 9.2),
    target: new THREE.Vector3(0, 0.8, 0)
  },
  [CAMERA_PRESETS.HOST_VIEW]: {
    position: new THREE.Vector3(0, 3.0, 5.2),
    target: new THREE.Vector3(0, 1.5, 0)
  },
  [CAMERA_PRESETS.PLAYER_VIEW]: {
    position: new THREE.Vector3(-4.8, 3.6, 5.8),
    target: new THREE.Vector3(0, 1.4, 0)
  }
});
