import * as THREE from 'three';

/**
 * Mengatur arah pandang karakter Host menggunakan rotasi bone neck & head secara lokal
 * relatif terhadap restQuaternion bone agar kompatibel dengan model GLB (CC_Base/Mixamo)
 * maupun rig stylized. Tidak pernah memutar keseluruhan tubuh Host.
 */
export class HostLookController {
  constructor(characterManager) {
    this.characterManager = characterManager;
    this.targetPlayerId = null;
    this.targetWorldPos = new THREE.Vector3();
    this.hostHeadWorld = new THREE.Vector3();
    this.currentYaw = 0;
    this.currentPitch = 0;
  }

  setTargetPlayer(playerId) {
    this.targetPlayerId = playerId || null;
  }

  update(dt) {
    const host = this.characterManager.getCharacter('HOST');
    if (!host) return;

    let desiredYaw = 0;
    let desiredPitch = 0;

    if (this.targetPlayerId) {
      const targetChar = this.characterManager.getCharacter(this.targetPlayerId);
      if (targetChar && targetChar.visible) {
        targetChar.headAnchor.getWorldPosition(this.targetWorldPos);
        host.headAnchor.getWorldPosition(this.hostHeadWorld);

        const dx = this.targetWorldPos.x - this.hostHeadWorld.x;
        const dy = this.targetWorldPos.y - this.hostHeadWorld.y;
        const dz = this.targetWorldPos.z - this.hostHeadWorld.z;

        desiredYaw = Math.atan2(dx, dz);
        const horizDist = Math.max(0.1, Math.hypot(dx, dz));
        desiredPitch = -Math.atan2(dy, horizDist);

        desiredYaw = THREE.MathUtils.clamp(desiredYaw, -1.15, 1.15);
        desiredPitch = THREE.MathUtils.clamp(desiredPitch, -0.3, 0.3);
      }
    }

    const lerpFactor = Math.min(1, dt * 5.5);
    this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, desiredYaw, lerpFactor);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, desiredPitch, lerpFactor);

    const { neck, head } = host.bones;

    if (neck && neck !== head) {
      const neckRest = neck.userData.restQuaternion || new THREE.Quaternion();
      const neckDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.currentPitch * 0.4, this.currentYaw * 0.4, 0, 'YXZ')
      );
      neck.quaternion.copy(neckRest).multiply(neckDelta);
    }

    if (head) {
      const headRest = head.userData.restQuaternion || new THREE.Quaternion();
      const weight = neck && neck !== head ? 0.6 : 1.0;
      const headDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.currentPitch * weight, this.currentYaw * weight, 0, 'YXZ')
      );
      head.quaternion.copy(headRest).multiply(headDelta);
    }
  }
}
