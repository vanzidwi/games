import { GAME_CONFIG } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderCreateRoom(container, { onNavigate, onRoomEntered }) {
  container.innerHTML = `
    <div class="menu-overlay">
      <form id="create-room-form" class="card-panel" novalidate>
        <button id="btn-back" class="btn-back" type="button">← Kembali</button>
        <h2 class="panel-title">Buat Room (Host)</h2>
        <p class="panel-desc">Anda akan duduk di tengah meja bundar sebagai Host.</p>

        <div class="form-group">
          <label for="host-name">Nama Host (maks. ${GAME_CONFIG.MAX_NAME_LENGTH} karakter)</label>
          <input
            id="host-name"
            type="text"
            maxlength="${GAME_CONFIG.MAX_NAME_LENGTH}"
            placeholder="Contoh: StreamerGanteng"
            required
            autocomplete="off"
          />
        </div>

        <p id="create-error" class="error-text hidden"></p>

        <button id="btn-submit-create" class="btn-menu btn-gold" type="submit">
          BUAT ROOM
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
      submitBtn.textContent = 'BUAT ROOM';
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
