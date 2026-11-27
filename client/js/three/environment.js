import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const PLAYER_RADIUS = 3.5;

/**
 * Menghitung posisi & sudut duduk melingkar untuk 5 Player mengelilingi meja bundar.
 */
export function getPlayerSlotTransform(slotIndex) {
  const angle = ((slotIndex - 1) / 5) * Math.PI * 2 - Math.PI / 2;
  const x = Math.cos(angle) * PLAYER_RADIUS;
  const z = Math.sin(angle) * PLAYER_RADIUS;
  const rotY = Math.atan2(-x, -z);
  return { x, z, rotY, angle };
}

/**
 * Menyesuaikan skala & posisi model GLB agar bagian bawah tepat di y=0 dan terpusat di XZ.
 */
function normalizeModel(root, targetSize, targetAxis = 'maxXZ') {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const refDim =
    targetAxis === 'y'
      ? Math.max(0.001, size.y)
      : Math.max(0.001, size.x, size.z);
  const scale = targetSize / refDim;

  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(root);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  root.position.x -= scaledCenter.x;
  root.position.z -= scaledCenter.z;
  root.position.y -= scaledBox.min.y;

  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

/**
 * Membangun lingkungan studio game show 3D stylized cartoon yang terang & cerah,
 * serta memuat aset custom Meja.glb & Kursi.glb dengan fallback otomatis.
 */
export function buildStudioEnvironment(scene) {
  const group = new THREE.Group();

  // Lantai studio terang
  const floorGeo = new THREE.CylinderGeometry(11, 11, 0.3, 48);
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#3b4f8c',
    roughness: 0.65,
    metalness: 0.1
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.15;
  floor.receiveShadow = true;
  group.add(floor);

  // Cincin neon panggung
  const ringGeo = new THREE.RingGeometry(4.6, 4.86, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#67e8f9',
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  group.add(ring);

  // Meja bundar fallback
  const tableFallback = new THREE.Group();
  const tableTop = new THREE.Mesh(
    new THREE.CylinderGeometry(2.15, 2.05, 0.18, 40),
    new THREE.MeshStandardMaterial({ color: '#4f65b8', roughness: 0.35, metalness: 0.15 })
  );
  tableTop.position.y = 0.92;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  tableFallback.add(tableTop);

  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(2.14, 0.045, 12, 48),
    new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.25, metalness: 0.55 })
  );
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.96;
  tableFallback.add(trim);

  const tableBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.85, 0.9, 24),
    new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45 })
  );
  tableBase.position.y = 0.45;
  tableBase.castShadow = true;
  tableFallback.add(tableBase);
  group.add(tableFallback);

  // Pembuat kursi fallback
  const createFallbackChair = (accentColor) => {
    const chair = new THREE.Group();
    const seatMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.72), seatMat);
    seat.position.y = 0.52;
    seat.castShadow = true;
    chair.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.12), seatMat);
    back.position.set(0, 0.96, -0.3);
    back.castShadow = true;
    chair.add(back);

    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.4 })
    );
    leg.position.y = 0.25;
    chair.add(leg);
    return chair;
  };

  const chairSlots = [];
  const hostChairSlot = new THREE.Group();
  hostChairSlot.position.set(0, 0, -0.55);
  const hostFallbackChair = createFallbackChair('#f59e0b');
  hostChairSlot.add(hostFallbackChair);
  group.add(hostChairSlot);
  chairSlots.push({ container: hostChairSlot, fallback: hostFallbackChair });

  for (let slot = 1; slot <= 5; slot += 1) {
    const { x, z, rotY } = getPlayerSlotTransform(slot);
    const slotGroup = new THREE.Group();
    slotGroup.position.set(x, 0, z);
    slotGroup.rotation.y = rotY;
    const fbChair = createFallbackChair('#475569');
    slotGroup.add(fbChair);
    group.add(slotGroup);
    chairSlots.push({ container: slotGroup, fallback: fbChair });
  }

  // Dekorasi pilar lampu studio yang cerah
  const pillarGeo = new THREE.CylinderGeometry(0.22, 0.22, 5.5, 12);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: '#60a5fa',
    emissive: '#38bdf8',
    emissiveIntensity: 0.45
  });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(Math.cos(a) * 8.8, 2.75, Math.sin(a) * 8.8);
    group.add(pillar);
  }

  // Muat custom Meja.glb & Kursi.glb secara asinkron
  const loader = new GLTFLoader();

  loader.load(
    '/environment/Meja.glb',
    (gltf) => {
      const meja = gltf.scene;
      normalizeModel(meja, 4.2, 'maxXZ');
      tableFallback.visible = false;
      group.add(meja);
    },
    undefined,
    () => {
      // Tetap gunakan meja fallback jika Meja.glb belum tersedia
    }
  );

  loader.load(
    '/environment/Kursi.glb',
    (gltf) => {
      chairSlots.forEach(({ container, fallback }) => {
        const kursi = gltf.scene.clone(true);
        normalizeModel(kursi, 1.05, 'maxXZ');
        fallback.visible = false;
        container.add(kursi);
      });
    },
    undefined,
    () => {
      // Tetap gunakan kursi fallback jika Kursi.glb belum tersedia
    }
  );

  scene.add(group);
  return group;
}
