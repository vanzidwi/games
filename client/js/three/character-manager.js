import * as THREE from 'three';
import { getPlayerSlotTransform } from './environment.js';

const PLAYER_PALETTES = [
  { suit: '#3b82f6', accent: '#93c5fd', skin: '#fcd34d' },
  { suit: '#ec4899', accent: '#f9a8d4', skin: '#fed7aa' },
  { suit: '#10b981', accent: '#6ee7b7', skin: '#fde68a' },
  { suit: '#8b5cf6', accent: '#c4b5fd', skin: '#fecaca' },
  { suit: '#f97316', accent: '#fdba74', skin: '#fde047' }
];

/**
 * Membuat rig karakter 3D stylized cartoon dengan hierarki bone:
 * root -> torso -> neck -> head (termasuk mata & headAnchor untuk speech bubble).
 */
function createStylizedCharacter({ isHost = false, palette }) {
  const root = new THREE.Group();

  const torso = new THREE.Group();
  torso.position.y = isHost ? 0.85 : 0.72;
  root.add(torso);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: isHost ? '#dc2626' : palette.suit,
    roughness: 0.45
  });
  const bodyGeo = new THREE.CapsuleGeometry(isHost ? 0.34 : 0.28, isHost ? 0.48 : 0.4, 8, 16);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.35;
  bodyMesh.castShadow = true;
  torso.add(bodyMesh);

  // Dasi / aksen panggung
  const tieMat = new THREE.MeshStandardMaterial({
    color: isHost ? '#fbbf24' : palette.accent,
    roughness: 0.35
  });
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.08), tieMat);
  tie.position.set(0, 0.38, isHost ? 0.33 : 0.27);
  torso.add(tie);

  // Lengan kiri & kanan
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.32, 6, 10);
  const leftArm = new THREE.Group();
  leftArm.position.set(isHost ? -0.42 : -0.35, 0.56, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, bodyMat);
  leftArmMesh.position.y = -0.18;
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  torso.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(isHost ? 0.42 : 0.35, 0.56, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, bodyMat);
  rightArmMesh.position.y = -0.18;
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  torso.add(rightArm);

  // Neck bone (untuk animasi rotasi halus Host Auto-Look)
  const neck = new THREE.Group();
  neck.position.set(0, isHost ? 0.72 : 0.62, 0);
  torso.add(neck);

  // Head bone
  const head = new THREE.Group();
  head.position.set(0, 0.16, 0);
  neck.add(head);

  const skinMat = new THREE.MeshStandardMaterial({
    color: isHost ? '#fde68a' : palette.skin,
    roughness: 0.5
  });
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(isHost ? 0.28 : 0.24, 20, 20), skinMat);
  headMesh.position.y = 0.14;
  headMesh.castShadow = true;
  head.add(headMesh);

  // Mata (untuk animasi blinking)
  const eyeGeo = new THREE.SphereGeometry(0.036, 10, 10);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.09, 0.17, isHost ? 0.24 : 0.21);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.09, 0.17, isHost ? 0.24 : 0.21);
  head.add(leftEye, rightEye);

  // Mahkota kecil untuk Host atau topi/aksen untuk Player
  if (isHost) {
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.12, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.6, roughness: 0.3 })
    );
    crown.position.y = 0.43;
    head.add(crown);
  }

  // Anchor di atas kepala untuk Speech Bubble & Name Tag (tidak menutupi wajah)
  const headAnchor = new THREE.Object3D();
  headAnchor.position.set(0, isHost ? 0.65 : 0.56, 0);
  head.add(headAnchor);

  // Ring highlight di lantai saat giliran aktif
  const highlightRing = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.72, 32),
    new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    })
  );
  highlightRing.rotation.x = -Math.PI / 2;
  highlightRing.position.y = 0.03;
  root.add(highlightRing);

  return {
    root,
    bones: { torso, neck, head, leftArm, rightArm },
    eyes: [leftEye, rightEye],
    headAnchor,
    highlightRing
  };
}

export class CharacterManager {
  constructor(scene, activeSpotlight) {
    this.scene = scene;
    this.activeSpotlight = activeSpotlight;
    this.characters = new Map();

    // Buat Host di tengah meja (sedikit mundur agar menghadap Player)
    const hostRig = createStylizedCharacter({ isHost: true, palette: PLAYER_PALETTES[0] });
    hostRig.root.position.set(0, 0, -0.35);
    scene.add(hostRig.root);
    this.characters.set('HOST', { id: 'HOST', slotIndex: 0, visible: true, ...hostRig });

    // Buat 5 Player mengelilingi meja
    for (let slot = 1; slot <= 5; slot += 1) {
      const { x, z, rotY } = getPlayerSlotTransform(slot);
      const rig = createStylizedCharacter({
        isHost: false,
        palette: PLAYER_PALETTES[slot - 1]
      });
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = rotY;
      rig.root.visible = false; // Hanya terlihat jika slot terisi
      scene.add(rig.root);

      this.characters.set(`P${slot}`, {
        id: `P${slot}`,
        slotIndex: slot,
        visible: false,
        ...rig
      });
    }
  }

  syncFromRoomState(roomState) {
    if (!roomState) return;

    const activeId = roomState.gameProgress?.activePlayerId || null;

    roomState.players.forEach((p) => {
      const char = this.characters.get(p.id);
      if (!char) return;

      const shouldShow = !p.empty;
      char.visible = shouldShow;
      char.root.visible = shouldShow;

      const isActive = shouldShow && p.id === activeId;
      char.highlightRing.material.opacity = isActive ? 0.9 : 0;

      if (isActive && this.activeSpotlight) {
        this.activeSpotlight.target.position.copy(char.root.position);
        this.activeSpotlight.intensity = 45;
      }
    });

    if (!activeId && this.activeSpotlight) {
      this.activeSpotlight.intensity = 0;
    }
  }

  /**
   * Menampilkan semua 6 karakter di Main Menu sebagai preview studio.
   */
  showAllPreview() {
    for (const char of this.characters.values()) {
      char.visible = true;
      char.root.visible = true;
      char.highlightRing.material.opacity = 0;
    }
    if (this.activeSpotlight) {
      this.activeSpotlight.intensity = 0;
    }
  }

  getCharacter(id) {
    return this.characters.get(id) || null;
  }

  getAllCharacters() {
    return Array.from(this.characters.values());
  }
}
