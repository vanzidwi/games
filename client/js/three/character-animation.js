import * as THREE from 'three';

/**
 * Mengatur animasi prosedural karakter (kompatibel dengan model GLB maupun fallback):
 * idle breathing, blinking, ask, nod (YA), shake (TIDAK), nervous (LEWATI), defeat.
 */
export class CharacterAnimationController {
  constructor(characterManager) {
    this.characterManager = characterManager;
    this.activeAnimations = new Map();
    this.blinkTimer = 0;
    this.nextBlinkAt = 2.5;
    this.isHostPanicking = false;
  }

  triggerAnimation(charId, type, duration = 1.4) {
    this.activeAnimations.set(charId, { type, elapsed: 0, duration });
  }

  setHostPanic(panic) {
    this.isHostPanicking = Boolean(panic);
  }

  applyAdditiveEuler(bone, rx, ry, rz) {
    if (!bone) return;
    const rest = bone.userData.restQuaternion || new THREE.Quaternion();
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    bone.quaternion.copy(rest).multiply(delta);
  }

  update(dt, elapsedTotal) {
    this.blinkTimer += dt;
    const isBlinking =
      this.blinkTimer >= this.nextBlinkAt && this.blinkTimer <= this.nextBlinkAt + 0.14;
    if (this.blinkTimer > this.nextBlinkAt + 0.14) {
      this.blinkTimer = 0;
      this.nextBlinkAt = 2.2 + Math.random() * 2.5;
    }

    for (const char of this.characterManager.getAllCharacters()) {
      if (!char.visible) continue;

      const { torso, head, leftArm, rightArm } = char.bones;
      const offset = char.slotIndex * 0.85;

      // Idle breathing
      if (torso) {
        const baseY = torso.userData.restPositionY ?? 0;
        const breathSpeed = char.id === 'HOST' && this.isHostPanicking ? 5.2 : 2.1;
        const breathAmp = char.id === 'HOST' && this.isHostPanicking ? 0.03 : 0.015;
        torso.position.y = baseY + Math.sin(elapsedTotal * breathSpeed + offset) * breathAmp;
      }

      // Blinking (untuk rig stylized)
      if (char.eyes?.length) {
        const eyeScaleY = isBlinking ? 0.1 : 1;
        char.eyes.forEach((eye) => {
          eye.scale.y = eyeScaleY;
        });
      }

      const anim = this.activeAnimations.get(char.id);
      if (anim) {
        anim.elapsed += dt;
        const t = anim.elapsed;

        if (anim.type === 'ask') {
          if (rightArm) {
            this.applyAdditiveEuler(rightArm, -Math.PI * 0.55 + Math.sin(t * 6) * 0.12, 0, 0);
          } else if (torso) {
            torso.position.y += Math.abs(Math.sin(t * 6)) * 0.08;
          }
        } else if (anim.type === 'nod') {
          this.applyAdditiveEuler(head, Math.sin(t * 14) * 0.25, 0, 0);
        } else if (anim.type === 'shake') {
          this.applyAdditiveEuler(head, 0, Math.sin(t * 16) * 0.32, 0);
        } else if (anim.type === 'nervous') {
          this.applyAdditiveEuler(torso, 0, 0, Math.sin(t * 18) * 0.05);
          this.applyAdditiveEuler(head, 0, 0, Math.sin(t * 10) * 0.1);
        } else if (anim.type === 'defeat') {
          this.applyAdditiveEuler(torso, 0.22, 0, 0);
          this.applyAdditiveEuler(head, 0.32, 0, 0);
        }

        if (anim.elapsed >= anim.duration && anim.type !== 'defeat') {
          this.applyAdditiveEuler(torso, 0, 0, 0);
          this.applyAdditiveEuler(leftArm, 0, 0, 0);
          this.applyAdditiveEuler(rightArm, 0, 0, 0);
          this.activeAnimations.delete(char.id);
        }
      }
    }
  }
}
