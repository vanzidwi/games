import { GAME_CONFIG, ROLES } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderLobby(container, { session, initialState, onLeave }) {
  const isHost = session.role === ROLES.HOST;
  const isSpectator = session.role === ROLES.SPECTATOR;
  let localPunishments = [...(initialState.punishments || [])];
  let activeTab = isHost ? 'punishments' : 'players';

  container.innerHTML = `
    <div class="lobby-hud lobby-minimal">
      <header class="lobby-topbar">
        <div class="hud-room-box">
          <span class="hud-label">KODE</span>
          <strong id="lobby-room-code" class="room-code-badge">${initialState.roomCode}</strong>
          <button id="btn-copy-code" class="btn-pill-mini" type="button">Salin</button>
          <span id="lobby-spectator-badge" class="btn-pill-mini">👁️ ${initialState.spectatorCount || 0}</span>
          ${isHost && session.overlayToken ? `<button id="btn-copy-obs" class="btn-pill-mini btn-obs" type="button">OBS</button>` : ''}
        </div>
        <button id="btn-leave-room" class="btn-pill-mini btn-danger" type="button">Keluar</button>
      </header>

      <div class="lobby-spacer"></div>

      <section class="lobby-bottom-dock">
        <div class="lobby-tabs">
          <button id="tab-players" class="lobby-tab ${activeTab === 'players' ? 'active' : ''}" type="button">
            👥 Peserta (<span id="tab-players-count">0/5</span>)
          </button>
          <button id="tab-punishments" class="lobby-tab ${activeTab === 'punishments' ? 'active' : ''}" type="button">
            🎯 Hukuman (<span id="tab-punish-count">0</span>)
          </button>
        </div>

        <div id="panel-players" class="lobby-tab-panel ${activeTab === 'players' ? '' : 'hidden'}">
          <div id="lobby-slots" class="slot-list"></div>
        </div>

        <div id="panel-punishments" class="lobby-tab-panel ${activeTab === 'punishments' ? '' : 'hidden'}">
          ${
            isHost
              ? `
            <div class="punishment-input-row">
              <input id="punishment-input" type="text" maxlength="${GAME_CONFIG.MAX_PUNISHMENT_LENGTH}" placeholder="Tambah hukuman (min. 2)..." />
              <button id="btn-add-punishment" class="btn-small btn-gold" type="button">+</button>
            </div>
            <p id="punishment-error" class="error-text hidden"></p>
          `
              : `<p class="muted-note" style="margin-bottom:6px;">Diatur oleh Host sebelum permainan dimulai.</p>`
          }
          <ul id="punishment-list" class="punishment-list"></ul>
        </div>

        <div class="lobby-dock-footer">
          ${
            isHost
              ? `
            <div id="start-blocker" class="blocker-text"></div>
            <button id="btn-start-game" class="btn-dock btn-dock-gold" style="width:100%;" type="button" disabled>
              MULAI PERMAINAN
            </button>
          `
              : isSpectator
              ? `
            <div class="blocker-text">👁️ Anda masuk sebagai <strong>PENONTON</strong> — menunggu Host memulai.</div>
          `
              : `
            <button id="btn-toggle-ready" class="btn-dock btn-dock-dark" style="width:100%;" type="button">
              SIAP BERMAIN
            </button>
          `
          }
        </div>
      </section>
    </div>
  `;

  const slotsEl = container.querySelector('#lobby-slots');
  const punishmentListEl = container.querySelector('#punishment-list');
  const copyCodeBtn = container.querySelector('#btn-copy-code');
  const copyObsBtn = container.querySelector('#btn-copy-obs');
  const leaveBtn = container.querySelector('#btn-leave-room');
  const spectatorBadgeEl = container.querySelector('#lobby-spectator-badge');

  const tabPlayersBtn = container.querySelector('#tab-players');
  const tabPunishBtn = container.querySelector('#tab-punishments');
  const panelPlayers = container.querySelector('#panel-players');
  const panelPunish = container.querySelector('#panel-punishments');
  const playersCountEl = container.querySelector('#tab-players-count');
  const punishCountEl = container.querySelector('#tab-punish-count');

  const switchTab = (tab) => {
    activeTab = tab;
    soundFX.click();
    tabPlayersBtn.classList.toggle('active', tab === 'players');
    tabPunishBtn.classList.toggle('active', tab === 'punishments');
    panelPlayers.classList.toggle('hidden', tab !== 'players');
    panelPunish.classList.toggle('hidden', tab !== 'punishments');
  };

  tabPlayersBtn.addEventListener('click', () => switchTab('players'));
  tabPunishBtn.addEventListener('click', () => switchTab('punishments'));

  copyCodeBtn.addEventListener('click', () => {
    soundFX.click();
    navigator.clipboard?.writeText(initialState.roomCode).catch(() => {});
    copyCodeBtn.textContent = '✓';
    setTimeout(() => (copyCodeBtn.textContent = 'Salin'), 1500);
  });

  if (copyObsBtn) {
    copyObsBtn.addEventListener('click', () => {
      soundFX.click();
      const url = `${window.location.origin}/overlay/${initialState.roomCode}?token=${session.overlayToken}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      copyObsBtn.textContent = '✓ OBS';
      setTimeout(() => (copyObsBtn.textContent = 'OBS'), 1500);
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
  } else if (!isSpectator) {
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

    if (spectatorBadgeEl) {
      spectatorBadgeEl.textContent = `👁️ ${state.spectatorCount || 0}`;
    }

    const joinedCount = state.players.filter((p) => !p.empty).length;
    playersCountEl.textContent = `${joinedCount}/5`;
    punishCountEl.textContent = String(state.punishments.length);

    const hostHtml = `
      <div class="slot-row host-row">
        <span>👑 <strong>${state.host.name}</strong></span>
        <span class="badge ${state.host.connected ? 'badge-ok' : 'badge-err'}">
          ${state.host.connected ? 'Online' : 'Putus'}
        </span>
      </div>
    `;
    const playersHtml = state.players
      .map((p) => {
        if (p.empty) {
          return `<div class="slot-row empty-row"><span>P${p.slotIndex}: Kosong</span></div>`;
        }
        return `
          <div class="slot-row">
            <span>🎮 <strong>${p.name}</strong></span>
            <span class="badge ${p.ready ? 'badge-ok' : 'badge-warn'}">
              ${p.ready ? 'SIAP' : 'BELUM'}
            </span>
          </div>
        `;
      })
      .join('');
    slotsEl.innerHTML = hostHtml + playersHtml;

    punishmentListEl.innerHTML = state.punishments.length
      ? state.punishments
          .map(
            (text, idx) => `
          <li class="punishment-item">
            <span>${idx + 1}. ${text}</span>
            ${
              isHost
                ? `<span class="punishment-actions">
                    <button class="btn-tiny" data-edit="${idx}" type="button">✎</button>
                    <button class="btn-tiny btn-danger" data-del="${idx}" type="button">✕</button>
                  </span>`
                : ''
            }
          </li>
        `
          )
          .join('')
      : `<li class="muted-note">Belum ada hukuman.</li>`;

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
      blockerEl.textContent = state.canStart
        ? 'Semua siap! Tekan Mulai untuk bermain.'
        : state.startBlockReason;
    } else if (!isSpectator) {
      const me = state.players.find((p) => p.slotIndex === session.slotIndex);
      const readyBtn = container.querySelector('#btn-toggle-ready');
      if (me && readyBtn) {
        readyBtn.textContent = me.ready ? 'BATALKAN SIAP' : 'SIAP BERMAIN';
        readyBtn.className = `btn-dock ${me.ready ? 'btn-ghost' : 'btn-dock-dark'}`;
      }
    }
  };

  updateUI(initialState);
  return { updateUI };
}
