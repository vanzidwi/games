import * as THREE from 'three';
import { GRAPHICS_QUALITY } from '@shared/constants.js';
import { settingsManager } from '../utils/settings.js';

export function createStudioRenderer(container, { transparent = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: transparent,
    powerPreference: 'high-performance'
  });

  if (transparent) {
    renderer.setClearColor(0x000000, 0);
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const applyQuality = (quality) => {
    const maxDpr = window.devicePixelRatio || 1;
    if (quality === GRAPHICS_QUALITY.LOW) {
      renderer.setPixelRatio(Math.min(maxDpr, 1));
      renderer.shadowMap.enabled = false;
    } else if (quality === GRAPHICS_QUALITY.MEDIUM) {
      renderer.setPixelRatio(Math.min(maxDpr, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
    } else {
      renderer.setPixelRatio(Math.min(maxDpr, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  };

  applyQuality(settingsManager.get().graphicsQuality);
  const unsubscribe = settingsManager.onChange((cfg) => applyQuality(cfg.graphicsQuality));

  const resize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
  };

  resize();
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  return {
    renderer,
    resize,
    dispose: () => {
      unsubscribe();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
