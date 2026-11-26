import * as THREE from 'three';

/**
 * Mengatur arah pandang karakter Host menggunakan rotasi bone neck & head secara lokal
 * dengan interpolasi halus (Quaternion.slerp) dan pembatasan sudut alami.
 * Tidak pernah memutar keseluruhan tubuh Host.
 */
export class HostLookController {
  constructor(characterManager) {
    this.characterManager = characterManager;
    this.targetPlayerId = null;
    this.targetWorldPos = new THREE.Vector3();
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
        targetChar.bones.head.getWorldPosition(this.targetWorldPos);
        const hostHeadWorld = new THREE.Vector3();
        host.bones.head.getWorldPosition(hostHeadWorld);

        const dx = this.targetWorldPos.x - hostHeadWorld.x;
        const dy = this.targetWorldPos.y - hostHeadWorld.y;
        const dz = this.targetWorldPos.z - hostHeadWorld.z;

        // Hitung yaw & pitch relatif terhadap arah depan Host (+Z)
        desiredYaw = Math.atan2(dx, dz);
        const horizDist = Math.max(0.1, Math.hypot(dx, dz));
        desiredPitch = -Math.atan2(dy, horizDist);

        // Batasi sudut agar gerakan leher & kepala tetap natural
        desiredYaw = THREE.MathUtils.clamp(desiredYaw, -1.25, 1.25);
        desiredPitch = THREE.MathUtils.clamp(desiredPitch, -0.35, 0.35);
      }
    }

    const lerpFactor = Math.min(1, dt * 5.5);
    this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, desiredYaw, lerpFactor);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, desiredPitch, lerpFactor);

    // Bagi rotasi secara natural antara bone neck (40%) dan bone head (60%)
    const neckQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(this.currentPitch * 0.4, this.currentYaw * 0.4, 0, 'YXZ')
    );
    const headQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(this.currentPitch * 0.6, this.currentYaw * 0.6, 0, 'YXZ')
    );

    host.bones.neck.quaternion.slerp(neckQuat, 0.85);
    host.bones.head.quaternion.slerp(headQuat, 0.85);
  }
}
