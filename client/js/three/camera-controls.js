import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA_PRESETS } from '@shared/constants.js';
import { settingsManager } from '../utils/settings.js';
import { CAMERA_PRESET_TARGETS } from './camera.js';

/**
 * Kontrol kamera manual lokal (PC mouse + Mobile touch).
 * Terpisah sepenuhnya dari arah pandang Host dan tidak pernah disinkronkan ke server.
 */
export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Orbit 360 derajat horizontal, batasi sudut vertikal agar tidak menembus lantai
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;

    // Batasi jarak zoom
    this.controls.minDistance = 4.0;
    this.controls.maxDistance = 16.5;

    // Dukungan sentuh mobile: 1 jari orbit, 2 jari zoom/pan
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };

    this.maxPanRadius = 4.2;
    this.applySensitivity(settingsManager.get().cameraSensitivity);
    this.unsubSettings = settingsManager.onChange((cfg) =>
      this.applySensitivity(cfg.cameraSensitivity)
    );

    this.setPreset(CAMERA_PRESETS.FREE);

    this.onKeyDown = (e) => {
      if (
        (e.key === 'r' || e.key === 'R') &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'INPUT'
      ) {
        this.reset();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  applySensitivity(sens = 1.0) {
    this.controls.rotateSpeed = 0.75 * sens;
    this.controls.zoomSpeed = 0.9 * sens;
    this.controls.panSpeed = 0.7 * sens;
  }

  setPreset(presetName) {
    const preset =
      CAMERA_PRESET_TARGETS[presetName] || CAMERA_PRESET_TARGETS[CAMERA_PRESETS.FREE];
    this.camera.position.copy(preset.position);
    this.controls.target.copy(preset.target);
    this.controls.update();
  }

  reset() {
    this.setPreset(CAMERA_PRESETS.FREE);
  }

  update() {
    this.controls.update();
    // Batasi pan agar kamera tidak keluar terlalu jauh dari area studio
    const t = this.controls.target;
    const radial = Math.hypot(t.x, t.z);
    if (radial > this.maxPanRadius) {
      const scale = this.maxPanRadius / radial;
      t.x *= scale;
      t.z *= scale;
    }
    t.y = THREE.MathUtils.clamp(t.y, 0.5, 2.8);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.unsubSettings();
    this.controls.dispose();
  }
}
