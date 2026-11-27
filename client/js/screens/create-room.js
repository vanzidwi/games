import { GAME_CONFIG } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderCreateRoom(container, { onNavigate, onRoomEntered }) {
  container.innerHTML = `
    <div class="menu-overlay menu-minimal">
      <header class="menu-topbar">
        <button id="btn-back" class="btn-topbar-icon" type="button">← Kembali</button>
        <div class="conn-pill is-online"><span>👑 Mode Host</span></div>
      </header>

      <div class="menu-title-header">
        <h2 class="minimal-title" style="font-size: clamp(1.5rem, 4.5vw, 2.2rem);">
          BUAT <span>ROOM</span>
        </h2>
        <p class="minimal-tagline">Anda akan memimpin meja sebagai Host</p>
      </div>

      <div class="menu-spacer"></div>

      <form id="create-room-form" class="menu-bottom-dock dock-form" novalidate>
        <div class="form-group" style="margin-bottom: 10px;">
          <label for="host-name">Nama Host (maks. ${GAME_CONFIG.MAX_NAME_LENGTH} karakter)</label>
          <input
            id="host-name"
            type="text"
            maxlength="${GAME_CONFIG.MAX_NAME_LENGTH}"
            placeholder="Masukkan nama Anda..."
            required
            autocomplete="off"
          />
        </div>

        <p id="create-error" class="error-text hidden"></p>

        <button id="btn-submit-create" class="btn-dock btn-dock-gold" style="width:100%;" type="submit">
          <span>👑</span>
          <span>BUAT ROOM</span>
        </button>
      </form>
    </div>
  `;

  const form = container.querySelector('#create-room-form');
  const backBtn = container.querySelector('#btn-back');
  const nameInput = container.querySelector('#host-name');
  const errorEl = container.querySelector('#create-error');
  const submitBtn = container.querySelector('#btn-submit-create');

  backBtn.addEventListener('click', () => {
    soundFX.click();
    onNavigate('main-menu');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    soundFX.click();
    errorEl.classList.add('hidden');

    const hostName = nameInput.value.trim();
    if (!hostName) {
      errorEl.textContent = 'Nama Host wajib diisi.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Membuat Room...';

    const res = await socketClient.emitAsync(SOCKET_EVENTS.ROOM_CREATE, { hostName });
    if (!res.ok) {
      errorEl.textContent = res.error || 'Gagal membuat room.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>👑</span><span>BUAT ROOM</span>';
      return;
    }

    socketClient.saveSession({
      roomCode: res.roomCode,
      role: res.role,
      slotIndex: res.slotIndex,
      sessionToken: res.sessionToken,
      overlayToken: res.overlayToken
    });

    onRoomEntered(res);
  });
}
