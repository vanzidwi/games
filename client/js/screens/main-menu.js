import { GRAPHICS_QUALITY } from '@shared/constants.js';
import { settingsManager } from '../utils/settings.js';
import { soundFX } from '../utils/sound.js';

export function renderMainMenu(container, { onNavigate, socket }) {
  const cfg = settingsManager.get();

  container.innerHTML = `
    <div class="menu-overlay">
      <div class="menu-topbar">
        <div id="menu-conn-status" class="conn-pill ${socket?.connected ? 'is-online' : 'is-connecting'}">
          <span class="conn-dot"></span>
          <span class="conn-text">${socket?.connected ? 'Server Online' : 'Menghubungkan...'}</span>
        </div>

        <button id="btn-quick-mute" class="btn-topbar-icon" type="button" title="Suara On/Off">
          ${cfg.soundEnabled ? '🔊 Suara Aktif' : '🔇 Bisu'}
        </button>
      </div>

      <div class="menu-center-stage">
        <div class="menu-hero">
          <div class="hero-glow"></div>

          <div class="menu-badge">
            <span class="badge-spark">★</span>
            LIVE 3D PARTY GAME SHOW
            <span class="badge-spark">★</span>
          </div>

          <h1 class="menu-title">
            <span class="title-line-top">JAWAB ATAU</span>
            <span class="title-line-main">HUKUMAN!</span>
          </h1>

          <p class="menu-tagline">"Berani bertanya? Berani menjawab?"</p>

          <div class="menu-highlights">
            <div class="hl-chip">👥 <strong>6</strong> Pemain</div>
            <div class="hl-chip">❓ <strong>10</strong> Pertanyaan</div>
            <div class="hl-chip hl-warn">⚡ Maks <strong>2×</strong> Lewati</div>
          </div>

          <div class="menu-actions">
            <button id="btn-create-room" class="btn-arcade btn-arcade-gold" type="button">
              <span class="btn-arcade-icon">👑</span>
              <span class="btn-arcade-copy">
                <strong>BUAT ROOM</strong>
                <small>Jadi Host &amp; atur daftar hukuman</small>
              </span>
              <span class="btn-arcade-arrow">→</span>
            </button>

            <button id="btn-join-room" class="btn-arcade btn-arcade-cyan" type="button">
              <span class="btn-arcade-icon">🎮</span>
              <span class="btn-arcade-copy">
                <strong>JOIN ROOM</strong>
                <small>Masuk sebagai Player dengan kode 6 karakter</small>
              </span>
              <span class="btn-arcade-arrow">→</span>
            </button>

            <div class="menu-secondary-row">
              <button id="btn-how-to-play" class="btn-menu btn-ghost" type="button">
                📖 CARA MAIN
              </button>
              <button id="btn-settings" class="btn-menu btn-ghost" type="button">
                ⚙️ PENGATURAN
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer class="menu-bottom-hint">
        <span>💡 Geser layar untuk memutar kamera studio 3D</span>
      </footer>

      <!-- Modal Cara Main -->
      <div id="howto-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true">
        <div class="modal-card modal-rich">
          <div class="modal-header">
            <h2>Cara Bermain</h2>
            <button id="btn-close-howto" class="btn-icon" type="button" aria-label="Tutup">✕</button>
          </div>
          <ul class="howto-list">
            <li><strong>1 Host &amp; 5 Player:</strong> Host duduk di tengah meja bundar, 5 Player mengelilingi meja.</li>
            <li><strong>2 Ronde (10 Giliran):</strong> Tiap Player punya 2 kesempatan bertanya (maks. 60 detik per giliran).</li>
            <li><strong>3 Pilihan Host:</strong> Host wajib menjawab <strong>YA</strong>, <strong>TIDAK</strong>, atau <strong>LEWATI</strong>.</li>
            <li><strong>Batas LEWATI 2×:</strong> Jika Host memakai <strong>LEWATI ke-2</strong>, Host langsung kalah dan harus memutar <strong>Roda Hukuman</strong>!</li>
          </ul>
          <button id="btn-ok-howto" class="btn-menu btn-gold" type="button">Siap Main!</button>
        </div>
      </div>

      <!-- Modal Pengaturan -->
      <div id="settings-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true">
        <div class="modal-card modal-rich">
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

  const statusEl = container.querySelector('#menu-conn-status');
  const statusTextEl = statusEl?.querySelector('.conn-text');

  const setConnUI = (stateClass, label) => {
    if (!statusEl || !statusTextEl) return;
    statusEl.className = `conn-pill ${stateClass}`;
    statusTextEl.textContent = label;
  };

  const onConnect = () => setConnUI('is-online', 'Server Online');
  const onDisconnect = () => setConnUI('is-error', 'Terputus dari Server');
  const onConnectError = () => setConnUI('is-error', 'Gagal terhubung (Cek VITE_SERVER_URL)');

  socket?.on('connect', onConnect);
  socket?.on('disconnect', onDisconnect);
  socket?.on('connect_error', onConnectError);

  const bindBtnSound = (btn) => {
    btn.addEventListener('mouseenter', () => soundFX.hover());
    btn.addEventListener('click', () => soundFX.click());
  };

  const createBtn = container.querySelector('#btn-create-room');
  const joinBtn = container.querySelector('#btn-join-room');
  const settingsBtn = container.querySelector('#btn-settings');
  const howToBtn = container.querySelector('#btn-how-to-play');
  const quickMuteBtn = container.querySelector('#btn-quick-mute');

  const settingsModal = container.querySelector('#settings-modal');
  const closeSettingsBtn = container.querySelector('#btn-close-settings');
  const saveSettingsBtn = container.querySelector('#btn-save-settings');

  const howtoModal = container.querySelector('#howto-modal');
  const closeHowtoBtn = container.querySelector('#btn-close-howto');
  const okHowtoBtn = container.querySelector('#btn-ok-howto');

  [
    createBtn,
    joinBtn,
    settingsBtn,
    howToBtn,
    quickMuteBtn,
    closeSettingsBtn,
    saveSettingsBtn,
    closeHowtoBtn,
    okHowtoBtn
  ].forEach(bindBtnSound);

  createBtn.addEventListener('click', () => onNavigate('create-room'));
  joinBtn.addEventListener('click', () => onNavigate('join-room'));
  settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  saveSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

  howToBtn.addEventListener('click', () => howtoModal.classList.remove('hidden'));
  closeHowtoBtn.addEventListener('click', () => howtoModal.classList.add('hidden'));
  okHowtoBtn.addEventListener('click', () => howtoModal.classList.add('hidden'));

  const soundChk = container.querySelector('#set-sound-enabled');
  const volInput = container.querySelector('#set-volume');
  const volLabel = container.querySelector('#vol-label');
  const graphicsSelect = container.querySelector('#set-graphics');
  const sensInput = container.querySelector('#set-cam-sens');
  const sensLabel = container.querySelector('#sens-label');

  const syncMuteLabel = (enabled) => {
    quickMuteBtn.textContent = enabled ? '🔊 Suara Aktif' : '🔇 Bisu';
  };

  quickMuteBtn.addEventListener('click', () => {
    const next = !settingsManager.get().soundEnabled;
    settingsManager.update({ soundEnabled: next });
    soundChk.checked = next;
    syncMuteLabel(next);
  });

  soundChk.addEventListener('change', () => {
    settingsManager.update({ soundEnabled: soundChk.checked });
    syncMuteLabel(soundChk.checked);
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

  return {
    dispose: () => {
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDisconnect);
      socket?.off('connect_error', onConnectError);
    }
  };
}
