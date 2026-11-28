import {
  ANSWERS,
  CAMERA_PRESETS,
  GAME_CONFIG,
  GAME_STATES,
  POLL_OPTIONS,
  ROLES
} from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderGameplay(container, { session, initialState, stage }) {
  const isHost = session.role === ROLES.HOST;
  const isSpectatorRole = session.role === ROLES.SPECTATOR;
  let timerInterval = null;
  let latestState = initialState;
  let votedTurnNumber = null;

  container.innerHTML = `
    <div class="gameplay-hud">
      <header class="gp-top-bar">
        <div class="gp-meta">
          <span class="pill">Room: <strong>${initialState.roomCode}</strong></span>
          <span id="gp-round" class="pill">Ronde 1/2</span>
          <span id="gp-progress" class="pill">Pertanyaan 1/10</span>
          <span id="gp-skip" class="pill pill-warn">LEWATI: 0/${GAME_CONFIG.MAX_SKIPS}</span>
          <span id="gp-spectators" class="pill">👁️ 0</span>
        </div>

        <div class="gp-camera-bar">
          <button class="btn-cam active" data-preset="${CAMERA_PRESETS.FREE}" type="button">Free</button>
          <button class="btn-cam" data-preset="${CAMERA_PRESETS.OVERVIEW}" type="button">Overview</button>
          <button class="btn-cam" data-preset="${CAMERA_PRESETS.HOST_VIEW}" type="button">Host</button>
          <button class="btn-cam" data-preset="${CAMERA_PRESETS.PLAYER_VIEW}" type="button">Player</button>
          <button id="btn-reset-cam" class="btn-cam" type="button" title="Reset Kamera (R)">Reset</button>
        </div>
      </header>

      <div class="gp-top-notices">
        <div id="gp-turn-banner" class="gp-turn-banner">Memulai pertandingan...</div>
        <div id="gp-poll-bar" class="gp-poll-bar hidden">
          <div class="poll-labels">
            <span id="poll-honest-label">😇 Jujur 0%</span>
            <span id="poll-total-label">0 suara</span>
            <span id="poll-lie-label">😈 Bohong 0%</span>
          </div>
          <div class="poll-track">
            <div id="poll-fill-honest" class="poll-fill honest" style="width: 50%"></div>
            <div id="poll-fill-lie" class="poll-fill lie" style="width: 50%"></div>
          </div>
        </div>
      </div>

      <div id="host-pause-overlay" class="pause-overlay hidden">
        <div class="pause-card">
          <h2>HOST TERPUTUS</h2>
          <p>Menunggu Host kembali dalam <strong id="pause-countdown">60</strong> detik...</p>
        </div>
      </div>

      <footer id="gp-bottom-area" class="gp-bottom-area"></footer>
    </div>
  `;

  const roundEl = container.querySelector('#gp-round');
  const progressEl = container.querySelector('#gp-progress');
  const skipEl = container.querySelector('#gp-skip');
  const spectatorsEl = container.querySelector('#gp-spectators');
  const turnBannerEl = container.querySelector('#gp-turn-banner');
  const pollBarEl = container.querySelector('#gp-poll-bar');
  const pollHonestLabel = container.querySelector('#poll-honest-label');
  const pollLieLabel = container.querySelector('#poll-lie-label');
  const pollTotalLabel = container.querySelector('#poll-total-label');
  const pollFillHonest = container.querySelector('#poll-fill-honest');
  const pollFillLie = container.querySelector('#poll-fill-lie');
  const bottomArea = container.querySelector('#gp-bottom-area');
  const pauseOverlay = container.querySelector('#host-pause-overlay');
  const pauseCountdownEl = container.querySelector('#pause-countdown');

  container.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      soundFX.click();
      container.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      stage.setCameraPreset(btn.dataset.preset);
    });
  });

  container.querySelector('#btn-reset-cam').addEventListener('click', () => {
    soundFX.click();
    stage.resetCamera();
  });

  const renderPollBar = (poll) => {
    if (!poll || (!poll.active && poll.totalVotes === 0)) {
      pollBarEl.classList.add('hidden');
      return;
    }
    pollBarEl.classList.remove('hidden');
    const total = poll.totalVotes || 0;
    const honestPct = total ? Math.round((poll.honestCount / total) * 100) : 50;
    const liePct = total ? 100 - honestPct : 50;

    pollHonestLabel.textContent = `😇 Jujur ${total ? `${honestPct}%` : '0%'}`;
    pollLieLabel.textContent = `😈 Bohong ${total ? `${liePct}%` : '0%'}`;
    pollTotalLabel.textContent = `${total} suara`;
    pollFillHonest.style.width = `${honestPct}%`;
    pollFillLie.style.width = `${liePct}%`;
  };

  const renderHostControls = (state) => {
    const canAnswer = state.state === GAME_STATES.ANSWERING && !state.pausedByHostDisconnect;

    bottomArea.innerHTML = `
      <div class="host-answer-bar">
        <button id="btn-ans-yes" class="btn-answer btn-yes" type="button" ${canAnswer ? '' : 'disabled'}>
          <span class="ans-icon">✔</span>
          <span>YA</span>
        </button>
        <button id="btn-ans-no" class="btn-answer btn-no" type="button" ${canAnswer ? '' : 'disabled'}>
          <span class="ans-icon">✕</span>
          <span>TIDAK</span>
        </button>
        <button id="btn-ans-skip" class="btn-answer btn-skip" type="button" ${canAnswer ? '' : 'disabled'}>
          <span class="ans-icon">⏭</span>
          <span>LEWATI</span>
        </button>
      </div>
    `;

    const lockAndSend = async (answer) => {
      bottomArea.querySelectorAll('button').forEach((b) => (b.disabled = true));
      soundFX.click();
      await socketClient.emitAsync(SOCKET_EVENTS.ANSWER_SUBMIT, { answer });
    };

    bottomArea.querySelector('#btn-ans-yes')?.addEventListener('click', () => lockAndSend(ANSWERS.YES));
    bottomArea.querySelector('#btn-ans-no')?.addEventListener('click', () => lockAndSend(ANSWERS.NO));
    bottomArea.querySelector('#btn-ans-skip')?.addEventListener('click', () => lockAndSend(ANSWERS.SKIP));
  };

  const renderSpectatorControls = (state) => {
    const gp = state.gameProgress;
    const poll = gp.poll;
    const alreadyVoted = votedTurnNumber === gp.turnNumber;

    if (state.state === GAME_STATES.ANSWERING && poll?.active) {
      bottomArea.innerHTML = `
        <div class="spectator-poll-box">
          <div class="sp-title">${alreadyVoted ? 'Suara Anda tercatat! Menunggu jawaban Host...' : 'Menurut Anda, Host akan menjawab:'}</div>
          <div class="spectator-vote-row">
            <button id="btn-vote-honest" class="btn-vote btn-vote-honest" type="button" ${alreadyVoted ? 'disabled' : ''}>
              😇 JUJUR!
            </button>
            <button id="btn-vote-lie" class="btn-vote btn-vote-lie" type="button" ${alreadyVoted ? 'disabled' : ''}>
              😈 BOHONG!
            </button>
          </div>
        </div>
      `;

      const sendVote = async (option) => {
        bottomArea.querySelectorAll('button').forEach((b) => (b.disabled = true));
        soundFX.click();
        const res = await socketClient.emitAsync(SOCKET_EVENTS.POLL_VOTE, { option });
        if (res.ok) {
          votedTurnNumber = gp.turnNumber;
          renderSpectatorControls(latestState);
        }
      };

      bottomArea.querySelector('#btn-vote-honest')?.addEventListener('click', () =>
        sendVote(POLL_OPTIONS.HONEST)
      );
      bottomArea.querySelector('#btn-vote-lie')?.addEventListener('click', () =>
        sendVote(POLL_OPTIONS.LIE)
      );
      return;
    }

    bottomArea.innerHTML = `
      <div class="status-pill-bar">
        👁️ <strong>Mode Penonton</strong> — Menunggu pertanyaan dikirim untuk ikut polling!
      </div>
    `;
  };

  const renderPlayerControls = (state) => {
    const me = state.players.find((p) => p.slotIndex === session.slotIndex);
    if (isSpectatorRole || me?.spectatorOnly) {
      renderSpectatorControls(state);
      return;
    }

    const isMyTurn = state.gameProgress.activeSlot === session.slotIndex;
    const activePlayer = state.players.find((p) => p.slotIndex === state.gameProgress.activeSlot);
    const activeName = activePlayer?.name || '-';

    if (isMyTurn && state.state === GAME_STATES.ASKING && !state.pausedByHostDisconnect) {
      if (!bottomArea.querySelector('#question-input')) {
        bottomArea.innerHTML = `
          <form id="question-form" class="player-question-box">
            <div class="pq-header">
              <span>Giliran Anda Bertanya!</span>
              <span id="pq-timer" class="pq-timer">60s</span>
            </div>
            <textarea
              id="question-input"
              maxlength="${GAME_CONFIG.MAX_QUESTION_LENGTH}"
              rows="2"
              placeholder="Tulis pertanyaan untuk Host (maks. 300 karakter)..."
              required
            ></textarea>
            <div class="pq-footer">
              <span id="pq-char-count" class="char-count">0/${GAME_CONFIG.MAX_QUESTION_LENGTH}</span>
              <button id="btn-send-question" class="btn-menu btn-gold" type="submit">KIRIM</button>
            </div>
            <p id="pq-error" class="error-text hidden"></p>
          </form>
        `;

        const form = bottomArea.querySelector('#question-form');
        const textarea = bottomArea.querySelector('#question-input');
        const charCount = bottomArea.querySelector('#pq-char-count');
        const sendBtn = bottomArea.querySelector('#btn-send-question');
        const errEl = bottomArea.querySelector('#pq-error');

        textarea.addEventListener('input', () => {
          charCount.textContent = `${textarea.value.length}/${GAME_CONFIG.MAX_QUESTION_LENGTH}`;
        });

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          errEl.classList.add('hidden');
          const question = textarea.value.trim();
          if (!question) {
            errEl.textContent = 'Pertanyaan tidak boleh kosong.';
            errEl.classList.remove('hidden');
            return;
          }
          soundFX.click();
          sendBtn.disabled = true;
          sendBtn.textContent = 'Mengirim...';

          const res = await socketClient.emitAsync(SOCKET_EVENTS.QUESTION_SUBMIT, { question });
          if (!res.ok) {
            errEl.textContent = res.error || 'Gagal mengirim pertanyaan.';
            errEl.classList.remove('hidden');
            sendBtn.disabled = false;
            sendBtn.textContent = 'KIRIM';
          }
        });
      }
      return;
    }

    if (isMyTurn && state.state === GAME_STATES.ANSWERING) {
      bottomArea.innerHTML = `
        <div class="status-pill-bar">
          Pertanyaan terkirim! <strong>MENUNGGU JAWABAN HOST...</strong>
        </div>
      `;
      return;
    }

    bottomArea.innerHTML = `
      <div class="status-pill-bar">
        ${
          state.state === GAME_STATES.ANSWERING
            ? `<strong>${activeName}</strong> sudah bertanya — Menunggu jawaban Host...`
            : `Giliran bertanya: <strong>${activeName}</strong>`
        }
      </div>
    `;
  };

  const updateTimers = () => {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const pqTimer = container.querySelector('#pq-timer');
      if (pqTimer && latestState.gameProgress?.questionDeadline) {
        const sec = Math.max(
          0,
          Math.ceil((latestState.gameProgress.questionDeadline - Date.now()) / 1000)
        );
        pqTimer.textContent = `${sec}s`;
      }
      if (latestState.pausedByHostDisconnect && latestState.hostDisconnectDeadline) {
        const sec = Math.max(
          0,
          Math.ceil((latestState.hostDisconnectDeadline - Date.now()) / 1000)
        );
        pauseCountdownEl.textContent = String(sec);
      }
    }, 250);
  };
  updateTimers();

  const updateUI = (state) => {
    latestState = state;
    const gp = state.gameProgress;

    roundEl.textContent = `Ronde ${gp.round}/${gp.totalRounds}`;
    progressEl.textContent = `Pertanyaan ${gp.turnNumber}/${gp.totalQuestions}`;
    skipEl.textContent = `LEWATI: ${gp.skipCount}/${gp.maxSkips}`;
    skipEl.className = `pill ${gp.skipCount >= 1 ? 'pill-danger' : 'pill-warn'}`;
    spectatorsEl.textContent = `👁️ ${state.spectatorCount || 0}`;

    const activePlayer = state.players.find((p) => p.slotIndex === gp.activeSlot);
    const activeName = activePlayer?.name || '-';
    turnBannerEl.textContent =
      state.state === GAME_STATES.ANSWERING
        ? `${activeName} bertanya kepada ${state.host.name}`
        : `Giliran ${activeName} mengetik pertanyaan...`;

    renderPollBar(gp.poll);

    if (state.pausedByHostDisconnect) {
      pauseOverlay.classList.remove('hidden');
    } else {
      pauseOverlay.classList.add('hidden');
    }

    if (isHost) {
      renderHostControls(state);
    } else {
      renderPlayerControls(state);
    }
  };

  updateUI(initialState);

  return {
    updateUI,
    dispose: () => {
      if (timerInterval) clearInterval(timerInterval);
    }
  };
}
