import * as THREE from 'three';

export const PLAYER_RADIUS = 3.5;

/**
 * Menghitung posisi & sudut duduk melingkar untuk 5 Player mengelilingi meja bundar.
 */
export function getPlayerSlotTransform(slotIndex) {
  // Slot 1..5 tersebar merata melingkar, menghadap ke pusat meja (Host)
  const angle = ((slotIndex - 1) / 5) * Math.PI * 2 - Math.PI / 2;
  const x = Math.cos(angle) * PLAYER_RADIUS;
  const z = Math.sin(angle) * PLAYER_RADIUS;
  const rotY = Math.atan2(-x, -z);
  return { x, z, rotY, angle };
}

/**
 * Membangun lingkungan studio game show 3D stylized cartoon:
 * lantai panggung, meja bundar tengah, 6 kursi (1 Host + 5 Player), dan dekorasi studio.
 */
export function buildStudioEnvironment(scene) {
  const group = new THREE.Group();

  // Lantai studio
  const floorGeo = new THREE.CylinderGeometry(11, 11, 0.3, 48);
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#171c3a',
    roughness: 0.75,
    metalness: 0.15
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.15;
  floor.receiveShadow = true;
  group.add(floor);

  // Cincin neon panggung
  const ringGeo = new THREE.RingGeometry(4.6, 4.82, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  group.add(ring);

  // Meja bundar besar di tengah
  const tableTopGeo = new THREE.CylinderGeometry(2.15, 2.05, 0.18, 40);
  const tableTopMat = new THREE.MeshStandardMaterial({
    color: '#2d3561',
    roughness: 0.4,
    metalness: 0.2
  });
  const tableTop = new THREE.Mesh(tableTopGeo, tableTopMat);
  tableTop.position.y = 0.92;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  group.add(tableTop);

  // Trim emas di pinggir meja bundar
  const trimGeo = new THREE.TorusGeometry(2.14, 0.045, 12, 48);
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    roughness: 0.3,
    metalness: 0.6
  });
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.96;
  group.add(trim);

  // Pilar penyangga meja
  const baseGeo = new THREE.CylinderGeometry(0.55, 0.85, 0.9, 24);
  const baseMat = new THREE.MeshStandardMaterial({ color: '#1e2547', roughness: 0.5 });
  const tableBase = new THREE.Mesh(baseGeo, baseMat);
  tableBase.position.y = 0.45;
  tableBase.castShadow = true;
  group.add(tableBase);

  // Fungsi pembuat kursi stylized
  const createChair = (accentColor) => {
    const chair = new THREE.Group();
    const seatGeo = new THREE.BoxGeometry(0.75, 0.12, 0.72);
    const seatMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.55 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.y = 0.52;
    seat.castShadow = true;
    chair.add(seat);

    const backGeo = new THREE.BoxGeometry(0.75, 0.85, 0.12);
    const back = new THREE.Mesh(backGeo, seatMat);
    back.position.set(0, 0.96, -0.3);
    back.castShadow = true;
    chair.add(back);

    const legGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.5, 12);
    const legMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.5 });
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.y = 0.25;
    chair.add(leg);

    return chair;
  };

  // Kursi Host di tengah (sedikit lebih tinggi & aksen emas)
  const hostChair = createChair('#d97706');
  hostChair.position.set(0, 0.08, -0.35);
  group.add(hostChair);

  // 5 Kursi Player mengelilingi meja
  for (let slot = 1; slot <= 5; slot += 1) {
    const { x, z, rotY } = getPlayerSlotTransform(slot);
    const chair = createChair('#334155');
    chair.position.set(x, 0, z);
    chair.rotation.y = rotY;
    group.add(chair);
  }

  // Dekorasi studio ringan di belakang (pilar lampu)
  const pillarGeo = new THREE.CylinderGeometry(0.22, 0.22, 5.5, 12);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    emissive: '#1d4ed8',
    emissiveIntensity: 0.25
  });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(Math.cos(a) * 8.8, 2.75, Math.sin(a) * 8.8);
    group.add(pillar);
  }

  scene.add(group);
  return group;
}
