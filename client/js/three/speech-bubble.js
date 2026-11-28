import * as THREE from 'three';

/**
 * Mengelola proyeksi 3D -> 2D untuk:
 * 1. Speech Bubble pertanyaan tepat di atas kepala Player aktif.
 * 2. Nameplate nama & status di atas kepala seluruh karakter.
 */
export class SpeechBubbleOverlay {
  constructor(overlayContainer, characterManager, camera) {
    this.container = overlayContainer;
    this.characterManager = characterManager;
    this.camera = camera;
    this.worldPos = new THREE.Vector3();

    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'speech-bubble-3d hidden';
    this.bubbleEl.innerHTML = `
      <div class="speech-bubble-author"></div>
      <div class="speech-bubble-text"></div>
      <div class="speech-bubble-tail"></div>
    `;
    this.container.appendChild(this.bubbleEl);

    this.authorEl = this.bubbleEl.querySelector('.speech-bubble-author');
    this.textEl = this.bubbleEl.querySelector('.speech-bubble-text');

    this.activeBubble = null;

    this.nameplates = new Map();
    for (const char of this.characterManager.getAllCharacters()) {
      const el = document.createElement('div');
      el.className = 'char-nameplate hidden';
      this.container.appendChild(el);
      this.nameplates.set(char.id, el);
    }
  }

  showQuestion(playerId, playerName, text) {
    this.activeBubble = { playerId, playerName, text };
    this.authorEl.textContent = playerName;
    this.textEl.textContent = text;
    this.bubbleEl.classList.remove('hidden', 'fade-out');
    this.bubbleEl.classList.add('fade-in');
  }

  hideQuestion() {
    if (!this.activeBubble) return;
    this.activeBubble = null;
    this.bubbleEl.classList.remove('fade-in');
    this.bubbleEl.classList.add('fade-out');
    setTimeout(() => {
      if (!this.activeBubble) {
        this.bubbleEl.classList.add('hidden');
      }
    }, 260);
  }

  syncNameplates(roomState, showReadyBadges = false) {
    if (!roomState) {
      for (const el of this.nameplates.values()) {
        el.innerHTML = '';
        el.classList.add('hidden');
      }
      return;
    }

    const hostEl = this.nameplates.get('HOST');
    if (hostEl) {
      hostEl.innerHTML = `
        <span class="np-name">👑 ${this.escapeHtml(roomState.host.name)}</span>
        <span class="np-dot ${roomState.host.connected ? 'on' : 'off'}"></span>
      `;
    }

    roomState.players.forEach((p) => {
      const el = this.nameplates.get(p.id);
      if (!el) return;
      if (p.empty) {
        el.innerHTML = '';
        el.classList.add('hidden');
        return;
      }
      const badge = showReadyBadges
        ? `<span class="np-ready ${p.ready ? 'ready' : 'wait'}">${p.ready ? 'SIAP' : 'BELUM'}</span>`
        : '';
      const activeClass = roomState.gameProgress?.activePlayerId === p.id ? 'active-turn' : '';
      el.className = `char-nameplate ${activeClass}`;
      el.innerHTML = `
        <span class="np-dot ${p.connected ? 'on' : 'off'}"></span>
        <span class="np-name">${this.escapeHtml(p.name)}</span>
        ${badge}
      `;
    });
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  projectToScreen(object3d, yOffset = 0) {
    object3d.getWorldPosition(this.worldPos);
    this.worldPos.y += yOffset;
    const projected = this.worldPos.clone().project(this.camera);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    const visible = projected.z < 1 && projected.z > -1;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    return { x, y, visible };
  }

  update() {
    for (const char of this.characterManager.getAllCharacters()) {
      const el = this.nameplates.get(char.id);
      if (!el || !char.visible || !el.innerHTML.trim()) {
        if (el) el.classList.add('hidden');
        continue;
      }
      if (this.activeBubble && this.activeBubble.playerId === char.id) {
        el.classList.add('hidden');
        continue;
      }
      const pos = this.projectToScreen(char.headAnchor, 0.12);
      if (!pos.visible) {
        el.classList.add('hidden');
        continue;
      }
      el.classList.remove('hidden');
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -100%)`;
    }

    if (this.activeBubble) {
      const targetChar = this.characterManager.getCharacter(this.activeBubble.playerId);
      if (targetChar && targetChar.visible) {
        const pos = this.projectToScreen(targetChar.headAnchor, 0.25);
        if (pos.visible) {
          this.bubbleEl.classList.remove('hidden');
          const viewW = this.container.clientWidth || window.innerWidth;
          const halfW = Math.min(320, viewW * 0.78) / 2 + 10;
          const clampedX = Math.max(halfW, Math.min(viewW - halfW, pos.x));
          const clampedY = Math.max(90, pos.y);
          this.bubbleEl.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0) translate(-50%, -100%)`;
        } else {
          this.bubbleEl.classList.add('hidden');
        }
      }
    }
  }

  dispose() {
    this.bubbleEl.remove();
    for (const el of this.nameplates.values()) {
      el.remove();
    }
  }
}
