import { GAME_CONFIG } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderJoinRoom(container, { onNavigate, onRoomEntered }) {
  container.innerHTML = `
    <div class="menu-overlay">
      <form id="join-room-form" class="card-panel" novalidate>
        <button id="btn-back" class="btn-back" type="button">← Kembali</button>
        <h2 class="panel-title">Gabung Room (Player)</h2>
        <p class="panel-desc">Masukkan nama dan kode room 6 karakter dari Host.</p>

        <div class="form-group">
          <label for="player-name">Nama Player (maks. ${GAME_CONFIG.MAX_NAME_LENGTH} karakter)</label>
          <input
            id="player-name"
            type="text"
            maxlength="${GAME_CONFIG.MAX_NAME_LENGTH}"
            placeholder="Contoh: Budi"
            required
            autocomplete="off"
          />
        </div>

        <div class="form-group">
          <label for="room-code">Kode Room (6 karakter)</label>
          <input
            id="room-code"
            type="text"
            maxlength="${GAME_CONFIG.ROOM_CODE_LENGTH}"
            placeholder="Contoh: A7K9P2"
            style="text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700;"
            required
            autocomplete="off"
          />
        </div>

        <p id="join-error" class="error-text hidden"></p>

        <button id="btn-submit-join" class="btn-menu btn-cyan" type="submit">
          GABUNG ROOM
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
      submitBtn.textContent = 'GABUNG ROOM';
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
