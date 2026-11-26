/**
 * Mengatur animasi prosedural karakter:
 * idle breathing, blinking, ask (angkat tangan), nod (YA), shake (TIDAK), nervous (LEWATI), defeat.
 */
export class CharacterAnimationController {
  constructor(characterManager) {
    this.characterManager = characterManager;
    this.activeAnimations = new Map(); // charId -> { type, elapsed, duration }
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
      const breathSpeed = char.id === 'HOST' && this.isHostPanicking ? 5.2 : 2.1;
      const breathAmp = char.id === 'HOST' && this.isHostPanicking ? 0.035 : 0.018;
      torso.position.y = (char.id === 'HOST' ? 0.85 : 0.72) + Math.sin(elapsedTotal * breathSpeed + offset) * breathAmp;

      // Blinking
      const eyeScaleY = isBlinking ? 0.1 : 1;
      char.eyes.forEach((eye) => {
        eye.scale.y = eyeScaleY;
      });

      // Reset lengan secara halus ke posisi duduk idle
      leftArm.rotation.x += (0 - leftArm.rotation.x) * Math.min(1, dt * 6);
      rightArm.rotation.x += (0 - rightArm.rotation.x) * Math.min(1, dt * 6);

      const anim = this.activeAnimations.get(char.id);
      if (anim) {
        anim.elapsed += dt;
        const t = anim.elapsed;

        if (anim.type === 'ask') {
          // Mengangkat tangan kanan saat bertanya
          rightArm.rotation.x = -Math.PI * 0.65 + Math.sin(t * 6) * 0.12;
        } else if (anim.type === 'nod') {
          // Mengangguk (YA)
          head.rotation.x = Math.sin(t * 14) * 0.28;
        } else if (anim.type === 'shake') {
          // Menggeleng (TIDAK)
          head.rotation.y = Math.sin(t * 16) * 0.35;
        } else if (anim.type === 'nervous') {
          // Ragu / gugup (LEWATI)
          torso.rotation.z = Math.sin(t * 18) * 0.06;
          head.rotation.z = Math.sin(t * 10) * 0.12;
        } else if (anim.type === 'defeat') {
          // Animasi kalah
          torso.rotation.x = 0.25;
          head.rotation.x = 0.38;
        }

        if (anim.elapsed >= anim.duration && anim.type !== 'defeat') {
          torso.rotation.z = 0;
          torso.rotation.x = 0;
          head.rotation.x = 0;
          head.rotation.z = 0;
          this.activeAnimations.delete(char.id);
        }
      }
    }
  }
}
