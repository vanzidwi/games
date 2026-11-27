import { GAME_CONFIG } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderJoinRoom(container, { onNavigate, onRoomEntered }) {
  container.innerHTML = `
    <div class="menu-overlay menu-minimal">
      <header class="menu-topbar">
        <button id="btn-back" class="btn-topbar-icon" type="button">← Kembali</button>
        <div class="conn-pill is-online"><span>🎮 Mode Player</span></div>
      </header>

      <div class="menu-title-header">
        <h2 class="minimal-title" style="font-size: clamp(1.5rem, 4.5vw, 2.2rem);">
          GABUNG <span>ROOM</span>
        </h2>
        <p class="minimal-tagline">Masukkan nama dan kode 6 karakter dari Host</p>
      </div>

      <div class="menu-spacer"></div>

      <form id="join-room-form" class="menu-bottom-dock dock-form" novalidate>
        <div class="dock-input-grid">
          <div class="form-group" style="margin-bottom: 0;">
            <label for="player-name">Nama Player</label>
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

        <button id="btn-submit-join" class="btn-dock btn-dock-dark" style="width:100%; margin-top: 10px;" type="submit">
          <span>🎮</span>
          <span>GABUNG ROOM</span>
        </button>
      </form>
    </div>
  `;

  const form = container.querySelector('#join-room-form');
  const backBtn = container.querySelector('#btn-back');
  const nameInput = container.querySelector('#player-name');
  const codeInput = container.querySelector('#room-code');
  const errorEl = container.querySelector('#join-error');
  const submitBtn = container.querySelector('#btn-submit-join');

  backBtn.addEventListener('click', () => {
    soundFX.click();
    onNavigate('main-menu');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    soundFX.click();
    errorEl.classList.add('hidden');

    const playerName = nameInput.value.trim();
    const roomCode = codeInput.value.trim().toUpperCase();

    if (!playerName) {
      errorEl.textContent = 'Nama Player wajib diisi.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (roomCode.length !== GAME_CONFIG.ROOM_CODE_LENGTH) {
      errorEl.textContent = 'Kode room harus terdiri dari 6 karakter.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Bergabung...';

    const res = await socketClient.emitAsync(SOCKET_EVENTS.ROOM_JOIN, {
      playerName,
      roomCode
    });

    if (!res.ok) {
      errorEl.textContent = res.error || 'Gagal bergabung ke room.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🎮</span><span>GABUNG ROOM</span>';
      return;
    }

    socketClient.saveSession({
      roomCode: res.roomCode,
      role: res.role,
      slotIndex: res.slotIndex,
      sessionToken: res.sessionToken
    });

    onRoomEntered(res);
  });
}
