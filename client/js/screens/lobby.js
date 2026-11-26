import { GAME_CONFIG, ROLES } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderLobby(container, { session, initialState, onLeave }) {
  const isHost = session.role === ROLES.HOST;
  let localPunishments = [...(initialState.punishments || [])];

  container.innerHTML = `
    <div class="lobby-hud">
      <header class="hud-top-bar">
        <div class="hud-room-box">
          <span class="hud-label">KODE ROOM</span>
          <strong id="lobby-room-code" class="room-code-badge">${initialState.roomCode}</strong>
          <button id="btn-copy-code" class="btn-small" type="button">Salin</button>
          ${isHost && session.overlayToken ? `<button id="btn-copy-obs" class="btn-small btn-obs" type="button">Salin URL OBS</button>` : ''}
        </div>
        <button id="btn-leave-room" class="btn-small btn-danger" type="button">Keluar Room</button>
      </header>

      <div class="lobby-grid">
        <section class="lobby-card">
          <h3>Daftar Peserta (6 Slot)</h3>
          <div id="lobby-slots" class="slot-list"></div>
        </section>

        <section class="lobby-card">
          <h3>Daftar Hukuman (${GAME_CONFIG.MIN_PUNISHMENTS}–${GAME_CONFIG.MAX_PUNISHMENTS})</h3>
          ${
            isHost
              ? `
            <div class="punishment-input-row">
              <input id="punishment-input" type="text" maxlength="${GAME_CONFIG.MAX_PUNISHMENT_LENGTH}" placeholder="Tulis hukuman (misal: Menyanyi 30 detik)" />
              <button id="btn-add-punishment" class="btn-small btn-gold" type="button">Tambah</button>
            </div>
            <p id="punishment-error" class="error-text hidden"></p>
          `
              : `<p class="muted-note">Daftar hukuman diatur oleh Host sebelum permainan dimulai.</p>`
          }
          <ul id="punishment-list" class="punishment-list"></ul>
        </section>
      </div>

      <footer class="lobby-footer">
        ${
          isHost
            ? `
          <div id="start-blocker" class="blocker-text"></div>
          <button id="btn-start-game" class="btn-menu btn-gold" type="button" disabled>
            MULAI PERMAINAN
          </button>
        `
            : `
          <button id="btn-toggle-ready" class="btn-menu btn-cyan" type="button">
            SIAP BERMAIN
          </button>
        `
        }
      </footer>
    </div>
  `;

  const slotsEl = container.querySelector('#lobby-slots');
  const punishmentListEl = container.querySelector('#punishment-list');
  const copyCodeBtn = container.querySelector('#btn-copy-code');
  const copyObsBtn = container.querySelector('#btn-copy-obs');
  const leaveBtn = container.querySelector('#btn-leave-room');

  copyCodeBtn.addEventListener('click', () => {
    soundFX.click();
    navigator.clipboard?.writeText(initialState.roomCode).catch(() => {});
    copyCodeBtn.textContent = 'Tersalin!';
    setTimeout(() => (copyCodeBtn.textContent = 'Salin'), 1500);
  });

  if (copyObsBtn) {
    copyObsBtn.addEventListener('click', () => {
      soundFX.click();
      const url = `${window.location.origin}/overlay/${initialState.roomCode}?token=${session.overlayToken}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      copyObsBtn.textContent = 'URL Tersalin!';
      setTimeout(() => (copyObsBtn.textContent = 'Salin URL OBS'), 1500);
    });
  }

  leaveBtn.addEventListener('click', async () => {
    soundFX.click();
    await socketClient.emitAsync(SOCKET_EVENTS.ROOM_LEAVE);
    socketClient.clearSession();
    onLeave();
  });

  const syncPunishmentsToServer = async (nextList) => {
    const errEl = container.querySelector('#punishment-error');
    if (errEl) errEl.classList.add('hidden');
    const res = await socketClient.emitAsync(SOCKET_EVENTS.PUNISHMENT_UPDATE, {
      punishments: nextList
    });
    if (!res.ok && errEl) {
      errEl.textContent = res.error;
      errEl.classList.remove('hidden');
    }
  };

  if (isHost) {
    const input = container.querySelector('#punishment-input');
    const addBtn = container.querySelector('#btn-add-punishment');
    const startBtn = container.querySelector('#btn-start-game');

    const handleAdd = () => {
      const val = input.value.trim();
      if (!val) return;
      if (localPunishments.length >= GAME_CONFIG.MAX_PUNISHMENTS) return;
      soundFX.click();
      localPunishments.push(val);
      input.value = '';
      syncPunishmentsToServer(localPunishments);
    };

    addBtn.addEventListener('click', handleAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });

    startBtn.addEventListener('click', async () => {
      soundFX.click();
      startBtn.disabled = true;
      await socketClient.emitAsync(SOCKET_EVENTS.GAME_START);
    });
  } else {
    const readyBtn = container.querySelector('#btn-toggle-ready');
    let isReady = false;
    readyBtn.addEventListener('click', async () => {
      soundFX.click();
      isReady = !isReady;
      await socketClient.emitAsync(SOCKET_EVENTS.PLAYER_READY, { ready: isReady });
    });
  }

  const updateUI = (state) => {
    localPunishments = [...state.punishments];

    // Render 6 slot
    const hostHtml = `
      <div class="slot-row host-row">
        <span>👑 <strong>${state.host.name}</strong> (Host)</span>
        <span class="badge ${state.host.connected ? 'badge-ok' : 'badge-err'}">
          ${state.host.connected ? 'Terhubung' : 'Terputus'}
        </span>
      </div>
    `;
    const playersHtml = state.players
      .map((p) => {
        if (p.empty) {
          return `<div class="slot-row empty-row"><span>Slot ${p.slotIndex}: Menunggu Player...</span></div>`;
        }
        return `
          <div class="slot-row">
            <span>🎮 <strong>${p.name}</strong> (P${p.slotIndex})</span>
            <span class="badge ${p.ready ? 'badge-ok' : 'badge-warn'}">
              ${p.ready ? 'SIAP' : 'BELUM SIAP'}
            </span>
          </div>
        `;
      })
      .join('');
    slotsEl.innerHTML = hostHtml + playersHtml;

    // Render daftar hukuman
    punishmentListEl.innerHTML = state.punishments.length
      ? state.punishments
          .map(
            (text, idx) => `
          <li class="punishment-item">
            <span>${idx + 1}. ${text}</span>
            ${
              isHost
                ? `<span class="punishment-actions">
                    <button class="btn-tiny" data-edit="${idx}" type="button">Edit</button>
                    <button class="btn-tiny btn-danger" data-del="${idx}" type="button">Hapus</button>
                  </span>`
                : ''
            }
          </li>
        `
          )
          .join('')
      : `<li class="muted-note">Belum ada hukuman yang ditambahkan.</li>`;

    if (isHost) {
      punishmentListEl.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundFX.click();
          const idx = Number(btn.dataset.del);
          const next = localPunishments.filter((_, i) => i !== idx);
          syncPunishmentsToServer(next);
        });
      });

      punishmentListEl.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.edit);
          const updated = window.prompt('Edit hukuman:', localPunishments[idx]);
          if (updated && updated.trim()) {
            const next = [...localPunishments];
            next[idx] = updated.trim();
            syncPunishmentsToServer(next);
          }
        });
      });

      const startBtn = container.querySelector('#btn-start-game');
      const blockerEl = container.querySelector('#start-blocker');
      startBtn.disabled = !state.canStart;
      blockerEl.textContent = state.canStart ? 'Semua syarat terpenuhi. Siap dimulai!' : state.startBlockReason;
    } else {
      const me = state.players.find((p) => p.slotIndex === session.slotIndex);
      const readyBtn = container.querySelector('#btn-toggle-ready');
      if (me && readyBtn) {
        readyBtn.textContent = me.ready ? 'BATALKAN SIAP' : 'SIAP BERMAIN';
        readyBtn.className = `btn-menu ${me.ready ? 'btn-ghost' : 'btn-cyan'}`;
      }
    }
  };

  updateUI(initialState);
  return { updateUI };
}
