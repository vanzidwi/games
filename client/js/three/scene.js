import * as THREE from 'three';

export function createStudioScene({ transparent = false } = {}) {
  const scene = new THREE.Scene();

  if (!transparent) {
    scene.background = new THREE.Color('#0c1026');
    scene.fog = new THREE.FogExp2('#0c1026', 0.032);
  }

  // Pencahayaan sinematik studio game show
  const hemiLight = new THREE.HemisphereLight('#a5b4fc', '#1e1b4b', 0.9);
  hemiLight.position.set(0, 12, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight('#fff7ed', 1.35);
  keyLight.position.set(5, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 28;
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight('#38bdf8', 0.7);
  rimLight.position.set(-7, 6, -6);
  scene.add(rimLight);

  // Spotlight untuk menyorot Player yang sedang mendapat giliran
  const activeSpotlight = new THREE.SpotLight('#fde047', 0, 18, Math.PI / 7, 0.45, 1.2);
  activeSpotlight.position.set(0, 8.5, 0);
  scene.add(activeSpotlight);
  scene.add(activeSpotlight.target);

  return { scene, keyLight, activeSpotlight };
}
