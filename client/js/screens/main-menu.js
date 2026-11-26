import { GRAPHICS_QUALITY } from '@shared/constants.js';
import { settingsManager } from '../utils/settings.js';
import { soundFX } from '../utils/sound.js';

export function renderMainMenu(container, { onNavigate }) {
  const cfg = settingsManager.get();

  container.innerHTML = `
    <div class="menu-overlay">
      <div class="menu-hero">
        <div class="menu-badge">3D MULTIPLAYER PARTY GAME</div>
        <h1 class="menu-title">JAWAB ATAU HUKUMAN!</h1>
        <p class="menu-tagline">"Berani bertanya? Berani menjawab?"</p>

        <div class="menu-actions">
          <button id="btn-create-room" class="btn-menu btn-gold" type="button">
            BUAT ROOM (HOST)
          </button>
          <button id="btn-join-room" class="btn-menu btn-cyan" type="button">
            JOIN ROOM (PLAYER)
          </button>
          <button id="btn-settings" class="btn-menu btn-ghost" type="button">
            PENGATURAN
          </button>
        </div>
      </div>

      <div id="settings-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true">
        <div class="modal-card">
          <div class="modal-header">
            <h2>Pengaturan</h2>
            <button id="btn-close-settings" class="btn-icon" type="button" aria-label="Tutup">✕</button>
          </div>

          <div class="form-group">
            <label class="toggle-row">
              <span>Efek Suara</span>
              <input id="set-sound-enabled" type="checkbox" ${cfg.soundEnabled ? 'checked' : ''} />
            </label>
          </div>

          <div class="form-group">
            <label for="set-volume">Volume Suara (<span id="vol-label">${Math.round(cfg.volume * 100)}%</span>)</label>
            <input id="set-volume" type="range" min="0" max="1" step="0.05" value="${cfg.volume}" />
          </div>

          <div class="form-group">
            <label for="set-graphics">Kualitas Grafis &amp; Resolusi</label>
            <select id="set-graphics">
              <option value="${GRAPHICS_QUALITY.LOW}" ${cfg.graphicsQuality === GRAPHICS_QUALITY.LOW ? 'selected' : ''}>Low (Hemat Baterai / HP Menengah)</option>
              <option value="${GRAPHICS_QUALITY.MEDIUM}" ${cfg.graphicsQuality === GRAPHICS_QUALITY.MEDIUM ? 'selected' : ''}>Medium (Seimbang)</option>
              <option value="${GRAPHICS_QUALITY.HIGH}" ${cfg.graphicsQuality === GRAPHICS_QUALITY.HIGH ? 'selected' : ''}>High (Maksimal / PC)</option>
            </select>
          </div>

          <div class="form-group">
            <label for="set-cam-sens">Sensitivitas Kamera (<span id="sens-label">${cfg.cameraSensitivity.toFixed(1)}x</span>)</label>
            <input id="set-cam-sens" type="range" min="0.4" max="2.0" step="0.1" value="${cfg.cameraSensitivity}" />
          </div>

          <button id="btn-save-settings" class="btn-menu btn-gold" type="button">Selesai</button>
        </div>
      </div>
    </div>
  `;

  const bindBtnSound = (btn) => {
    btn.addEventListener('mouseenter', () => soundFX.hover());
    btn.addEventListener('click', () => soundFX.click());
  };

  const createBtn = container.querySelector('#btn-create-room');
  const joinBtn = container.querySelector('#btn-join-room');
  const settingsBtn = container.querySelector('#btn-settings');
  const modal = container.querySelector('#settings-modal');
  const closeSettingsBtn = container.querySelector('#btn-close-settings');
  const saveSettingsBtn = container.querySelector('#btn-save-settings');

  [createBtn, joinBtn, settingsBtn, closeSettingsBtn, saveSettingsBtn].forEach(bindBtnSound);

  createBtn.addEventListener('click', () => onNavigate('create-room'));
  joinBtn.addEventListener('click', () => onNavigate('join-room'));
  settingsBtn.addEventListener('click', () => modal.classList.remove('hidden'));
  closeSettingsBtn.addEventListener('click', () => modal.classList.add('hidden'));
  saveSettingsBtn.addEventListener('click', () => modal.classList.add('hidden'));

  const soundChk = container.querySelector('#set-sound-enabled');
  const volInput = container.querySelector('#set-volume');
  const volLabel = container.querySelector('#vol-label');
  const graphicsSelect = container.querySelector('#set-graphics');
  const sensInput = container.querySelector('#set-cam-sens');
  const sensLabel = container.querySelector('#sens-label');

  soundChk.addEventListener('change', () => {
    settingsManager.update({ soundEnabled: soundChk.checked });
  });

  volInput.addEventListener('input', () => {
    const volume = Number(volInput.value);
    volLabel.textContent = `${Math.round(volume * 100)}%`;
    settingsManager.update({ volume });
  });

  graphicsSelect.addEventListener('change', () => {
    settingsManager.update({ graphicsQuality: graphicsSelect.value });
  });

  sensInput.addEventListener('input', () => {
    const cameraSensitivity = Number(sensInput.value);
    sensLabel.textContent = `${cameraSensitivity.toFixed(1)}x`;
    settingsManager.update({ cameraSensitivity });
  });
}
