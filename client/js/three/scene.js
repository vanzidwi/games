import * as THREE from 'three';

export function createStudioScene({ transparent = false } = {}) {
  const scene = new THREE.Scene();

  if (!transparent) {
    // Ruangan studio putih bersih
    scene.background = new THREE.Color('#f8fafc');
    scene.fog = new THREE.FogExp2('#f8fafc', 0.012);
  }

  // Pencahayaan studio putih yang cerah dan lembut
  const hemiLight = new THREE.HemisphereLight('#ffffff', '#cbd5e1', 1.55);
  hemiLight.position.set(0, 14, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight('#ffffff', 1.65);
  keyLight.position.set(5, 11, 7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 28;
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#ffffff', 0.9);
  fillLight.position.set(-6, 7, 5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight('#fffbeb', 0.6);
  rimLight.position.set(-5, 6, -7);
  scene.add(rimLight);

  // Spotlight untuk menyorot Player yang sedang mendapat giliran
  const activeSpotlight = new THREE.SpotLight('#fde047', 0, 18, Math.PI / 7, 0.45, 1.2);
  activeSpotlight.position.set(0, 8.5, 0);
  scene.add(activeSpotlight);
  scene.add(activeSpotlight.target);

  return { scene, keyLight, activeSpotlight };
}
