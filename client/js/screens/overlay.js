import { GAME_CONFIG, GAME_STATES } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';

/**
 * OBS Browser Source Overlay (/overlay/ROOMCODE?token=...)
 * Read-only, latar belakang transparan, tanpa tombol kontrol gameplay.
 */
export function renderObsOverlay(container, { roomCode, overlayToken, stage }) {
  document.body.classList.add('obs-transparent');

  container.innerHTML = `
    <div class="obs-overlay-root">
      <header class="obs-top">
        <div class="obs-brand">PASTI GUA JAWAB!</div>
        <div class="obs-stats">
          <span id="obs-round" class="obs-pill">Ronde 1/2</span>
          <span id="obs-progress" class="obs-pill">Pertanyaan 0/10</span>
          <span id="obs-skip" class="obs-pill obs-skip">LEWATI: 0/${GAME_CONFIG.MAX_SKIPS}</span>
        </div>
      </header>

      <div id="obs-status-banner" class="obs-status-banner hidden"></div>

      <footer class="obs-players-bar" id="obs-players-bar"></footer>
    </div>
  `;

  const roundEl = container.querySelector('#obs-round');
  const progressEl = container.querySelector('#obs-progress');
  const skipEl = container.querySelector('#obs-skip');
  const bannerEl = container.querySelector('#obs-status-banner');
  const playersBarEl = container.querySelector('#obs-players-bar');

  const socket = socketClient.connect();

  const renderState = (state) => {
    stage.characterManager.syncFromRoomState(state);
    stage.speechOverlay.syncNameplates(state, false);
    stage.hostLookController.setTargetPlayer(state.gameProgress?.activePlayerId || null);

    const gp = state.gameProgress;
    roundEl.textContent = `Ronde ${gp.round}/${gp.totalRounds}`;
    progressEl.textContent = `Pertanyaan ${gp.turnNumber}/${gp.totalQuestions}`;
    skipEl.textContent = `LEWATI: ${gp.skipCount}/${gp.maxSkips}`;

    playersBarEl.innerHTML = `
      <div class="obs-participant obs-host">👑 ${state.host.name}</div>
      ${state.players
        .map((p) =>
          p.empty
            ? `<div class="obs-participant empty">Slot ${p.slotIndex}</div>`
            : `<div class="obs-participant ${gp.activePlayerId === p.id ? 'active' : ''}">${p.name}</div>`
        )
        .join('')}
    `;

    if (state.state === GAME_STATES.HOST_WON) {
      bannerEl.textContent = `HOST MENANG! (LEWATI ${gp.skipCount}/2)`;
      bannerEl.classList.remove('hidden');
    } else if (state.state === GAME_STATES.PUNISHMENT_RESULT && gp.wheelResult) {
      bannerEl.textContent = `HUKUMAN HOST: ${gp.wheelResult.text}`;
      bannerEl.classList.remove('hidden');
    } else if (state.state === GAME_STATES.HOST_LOST || state.state === GAME_STATES.WHEEL_READY) {
      bannerEl.textContent = 'HOST KALAH! Roda Hukuman Siap Diputar...';
      bannerEl.classList.remove('hidden');
    } else {
      bannerEl.classList.add('hidden');
    }
  };

  socket.on('connect', async () => {
    const res = await socketClient.emitAsync('overlay:join', { roomCode, overlayToken });
    if (res.ok && res.state) {
      renderState(res.state);
    } else {
      bannerEl.textContent = res.error || 'Gagal menghubungkan OBS Overlay.';
      bannerEl.classList.remove('hidden');
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_STATE, renderState);
  socket.on(SOCKET_EVENTS.QUESTION_RECEIVED, ({ activePlayerId, question }) => {
    stage.speechOverlay.showQuestion(activePlayerId, activePlayerId, question);
  });
  socket.on(SOCKET_EVENTS.ANSWER_RESULT, () => {
    stage.speechOverlay.hideQuestion();
  });
  socket.on(SOCKET_EVENTS.CHARACTER_ANIMATION, ({ targetId, animation }) => {
    stage.animController.triggerAnimation(targetId, animation);
  });
}
