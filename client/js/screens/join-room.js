import { GAME_CONFIG } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderJoinRoom(container, { onNavigate, onRoomEntered }) {
  container.innerHTML = `
    <div class="menu-overlay menu-minimal">
      <header class="menu-topbar">
        <button id="btn-back" class="btn-topbar-icon" type="button">← Kembali</button>
        <div class="conn-pill is-online"><span>🎮 Gabung Room</span></div>
      </header>

      <div class="menu-title-header">
        <h2 class="minimal-title" style="font-size: clamp(1.5rem, 4.5vw, 2.2rem);">
          GABUNG <span>ROOM</span>
        </h2>
        <p class="minimal-tagline">Masuk sebagai Player (maks. 5) atau Penonton (polling)</p>
      </div>

      <div class="menu-spacer"></div>

      <form id="join-room-form" class="menu-bottom-dock dock-form" novalidate>
        <div class="dock-input-grid">
          <div class="form-group" style="margin-bottom: 0;">
            <label for="player-name">Nama</label>
            <input
              id="player-name"
              type="text"
              maxlength="${GAME_CONFIG.MAX_NAME_LENGTH}"
              placeholder="Nama Anda..."
              required
              autocomplete="off"
            />
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label for="room-code">Kode Room</label>
            <input
              id="room-code"
              type="text"
              maxlength="${GAME_CONFIG.ROOM_CODE_LENGTH}"
              placeholder="A7K9P2"
              style="text-transform: uppercase; letter-spacing: 0.14em; font-weight: 800; text-align: center;"
              required
              autocomplete="off"
            />
          </div>
        </div>

        <p id="join-error" class="error-text hidden" style="margin-top: 8px;"></p>

        <div class="dock-buttons" style="margin-top: 10px;">
          <button id="btn-submit-join" class="btn-dock btn-dock-dark" type="submit">
            <span>🎮</span>
            <span>PLAYER</span>
          </button>
          <button id="btn-submit-spectate" class="btn-dock btn-ghost" style="border-radius:14px;" type="button">
            <span>👁️</span>
            <span>PENONTON</span>
          </button>
        </div>
      </form>
    </div>
  `;

  const form = container.querySelector('#join-room-form');
  const backBtn = container.querySelector('#btn-back');
  const nameInput = container.querySelector('#player-name');
  const codeInput = container.querySelector('#room-code');
  const errorEl = container.querySelector('#join-error');
  const submitBtn = container.querySelector('#btn-submit-join');
  const spectateBtn = container.querySelector('#btn-submit-spectate');

  backBtn.addEventListener('click', () => {
    soundFX.click();
    onNavigate('main-menu');
  });

  const joinWithEvent = async (eventName, triggerBtn, defaultHtml) => {
    soundFX.click();
    errorEl.classList.add('hidden');

    const playerName = nameInput.value.trim();
    const roomCode = codeInput.value.trim().toUpperCase();

    if (!playerName) {
      errorEl.textContent = 'Nama wajib diisi.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (roomCode.length !== GAME_CONFIG.ROOM_CODE_LENGTH) {
      errorEl.textContent = 'Kode room harus terdiri dari 6 karakter.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    spectateBtn.disabled = true;
    triggerBtn.textContent = 'Menghubungkan...';

    const res = await socketClient.emitAsync(eventName, { playerName, roomCode });

    if (!res.ok) {
      errorEl.textContent = res.error || 'Gagal bergabung ke room.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      spectateBtn.disabled = false;
      triggerBtn.innerHTML = defaultHtml;
      return;
    }

    socketClient.saveSession({
      roomCode: res.roomCode,
      role: res.role,
      slotIndex: res.slotIndex,
      sessionToken: res.sessionToken
    });

    onRoomEntered(res);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    joinWithEvent(SOCKET_EVENTS.ROOM_JOIN, submitBtn, '<span>🎮</span><span>PLAYER</span>');
  });

  spectateBtn.addEventListener('click', () => {
    joinWithEvent(
      SOCKET_EVENTS.SPECTATOR_JOIN,
      spectateBtn,
      '<span>👁️</span><span>PENONTON</span>'
    );
  });
}
