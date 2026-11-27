import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getPlayerSlotTransform } from './environment.js';

const PLAYER_PALETTES = [
  { suit: '#3b82f6', accent: '#93c5fd', skin: '#fcd34d' },
  { suit: '#ec4899', accent: '#f9a8d4', skin: '#fed7aa' },
  { suit: '#10b981', accent: '#6ee7b7', skin: '#fde68a' },
  { suit: '#8b5cf6', accent: '#c4b5fd', skin: '#fecaca' },
  { suit: '#f97316', accent: '#fdba74', skin: '#fde047' }
];

function createStylizedFallback({ isHost = false, palette }) {
  const modelGroup = new THREE.Group();

  const torso = new THREE.Group();
  torso.position.y = 0.05;
  modelGroup.add(torso);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: isHost ? '#dc2626' : palette.suit,
    roughness: 0.45
  });
  const bodyMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(isHost ? 0.34 : 0.28, isHost ? 0.48 : 0.4, 8, 16),
    bodyMat
  );
  bodyMesh.position.y = 0.35;
  bodyMesh.castShadow = true;
  torso.add(bodyMesh);

  const armGeo = new THREE.CapsuleGeometry(0.08, 0.32, 6, 10);
  const leftArm = new THREE.Group();
  leftArm.position.set(isHost ? -0.42 : -0.35, 0.56, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, bodyMat);
  leftArmMesh.position.y = -0.18;
  leftArm.add(leftArmMesh);
  torso.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(isHost ? 0.42 : 0.35, 0.56, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, bodyMat);
  rightArmMesh.position.y = -0.18;
  rightArm.add(rightArmMesh);
  torso.add(rightArm);

  const neck = new THREE.Group();
  neck.position.set(0, isHost ? 0.72 : 0.62, 0);
  torso.add(neck);

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

  const eyeGeo = new THREE.SphereGeometry(0.036, 10, 10);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.09, 0.17, isHost ? 0.24 : 0.21);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.09, 0.17, isHost ? 0.24 : 0.21);
  head.add(leftEye, rightEye);

  return {
    modelGroup,
    bones: { torso, neck, head, leftArm, rightArm },
    eyes: [leftEye, rightEye]
  };
}

function findBoneByKeywords(root, keywords) {
  let found = null;
  root.traverse((obj) => {
    if (found) return;
    const name = (obj.name || '').toLowerCase();
    if (keywords.some((k) => name.includes(k))) {
      found = obj;
    }
  });
  return found;
}

function normalizeCharacterGLB(model, targetHeight, yBase = 0) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const scale = targetHeight / Math.max(0.001, size.y);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  model.position.x -= scaledCenter.x;
  model.position.z -= scaledCenter.z;
  model.position.y += yBase - scaledBox.min.y;

  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model);
}

function saveRestPose(bones) {
  Object.values(bones).forEach((b) => {
    if (b) {
      b.userData.restQuaternion = b.quaternion.clone();
      b.userData.restPositionY = b.position.y;
    }
  });
}

function loadWithFallbackPaths(loader, paths, onSuccess, onFail) {
  const tryIndex = (idx) => {
    if (idx >= paths.length) {
      onFail?.(new Error(`Semua path gagal: ${paths.join(', ')}`));
      return;
    }
    loader.load(paths[idx], onSuccess, undefined, () => tryIndex(idx + 1));
  };
  tryIndex(0);
}

export class CharacterManager {
  constructor(scene, activeSpotlight) {
    this.scene = scene;
    this.activeSpotlight = activeSpotlight;
    this.characters = new Map();

    const initialTableY = scene.userData.tableTopY || 1.25;
    const initialChairY = scene.userData.chairTopY || 0.37;

    // Host di atas permukaan meja
    this.initCharacterSlot({
      id: 'HOST',
      slotIndex: 0,
      isHost: true,
      position: new THREE.Vector3(0, initialTableY, 0),
      rotY: 0,
      visible: true
    });

    // 5 Player di atas masing-masing kursi
    for (let slot = 1; slot <= 5; slot += 1) {
      const { x, z, rotY } = getPlayerSlotTransform(slot);
      this.initCharacterSlot({
        id: `P${slot}`,
        slotIndex: slot,
        isHost: false,
        position: new THREE.Vector3(x, initialChairY, z),
        rotY,
        visible: false
      });
    }

    this.loadCustomModels();
  }

  setHostHeight(tableTopY) {
    const host = this.characters.get('HOST');
    if (host && typeof tableTopY === 'number') {
      host.root.position.y = tableTopY;
    }
  }

  setPlayerHeight(chairTopY) {
    if (typeof chairTopY !== 'number') return;
    for (let slot = 1; slot <= 5; slot += 1) {
      const char = this.characters.get(`P${slot}`);
      if (char) {
        char.root.position.y = chairTopY;
      }
    }
  }

  initCharacterSlot({ id, slotIndex, isHost, position, rotY, visible }) {
    const root = new THREE.Group();
    root.position.copy(position);
    root.rotation.y = rotY;
    root.visible = visible;

    const palette = PLAYER_PALETTES[Math.max(0, slotIndex - 1)];
    const fallback = createStylizedFallback({ isHost, palette });
    root.add(fallback.modelGroup);
    saveRestPose(fallback.bones);

    const headAnchor = new THREE.Object3D();
    headAnchor.position.set(0, isHost ? 1.4 : 1.35, 0);
    root.add(headAnchor);

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

    this.scene.add(root);
    this.characters.set(id, {
      id,
      slotIndex,
      isHost,
      visible,
      root,
      fallbackGroup: fallback.modelGroup,
      bones: fallback.bones,
      eyes: fallback.eyes,
      headAnchor,
      highlightRing
    });
  }

  loadCustomModels() {
    const loader = new GLTFLoader();

    loadWithFallbackPaths(
      loader,
      ['/characters/host.glb', '/environment/host.glb'],
      (gltf) => {
        const hostChar = this.characters.get('HOST');
        if (!hostChar) return;

        const model = gltf.scene;
        const box = normalizeCharacterGLB(model, 1.55, 0);

        const lArm = findBoneByKeywords(model, ['l_upperarm', 'leftarm', 'left_arm']);
        const rArm = findBoneByKeywords(model, ['r_upperarm', 'rightarm', 'right_arm']);
        if (lArm) lArm.rotation.z += 1.1;
        if (rArm) rArm.rotation.z -= 1.1;

        const neck = findBoneByKeywords(model, ['neck']) || findBoneByKeywords(model, ['spine02']);
        const head = findBoneByKeywords(model, ['head']) || neck || model;
        const torso = findBoneByKeywords(model, ['spine01', 'hip', 'pelvis']) || model;

        hostChar.bones = { torso, neck, head, leftArm: lArm, rightArm: rArm };
        saveRestPose(hostChar.bones);
        hostChar.eyes = [];
        hostChar.headAnchor.position.set(0, box.max.y - 0.15, 0);

        hostChar.fallbackGroup.visible = false;
        hostChar.root.add(model);
      },
      (err) => console.warn('[3D] Gagal memuat host.glb:', err)
    );

    loadWithFallbackPaths(
      loader,
      ['/characters/player.glb', '/environment/player.glb'],
      (gltf) => {
        for (let slot = 1; slot <= 5; slot += 1) {
          const char = this.characters.get(`P${slot}`);
          if (!char) continue;

          const model = SkeletonUtils.clone(gltf.scene);
          const box = normalizeCharacterGLB(model, 1.35, 0);

          const neck = findBoneByKeywords(model, ['neck']);
          const head = findBoneByKeywords(model, ['head']) || model;
          const torso = model;

          char.bones = { torso, neck, head, leftArm: null, rightArm: null };
          saveRestPose(char.bones);
          char.eyes = [];
          char.headAnchor.position.set(0, box.max.y + 0.15, 0);

          char.fallbackGroup.visible = false;
          char.root.add(model);
        }
      },
      (err) => console.warn('[3D] Gagal memuat player.glb:', err)
    );
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
