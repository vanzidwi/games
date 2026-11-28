import { ANSWERS, GAME_STATES, ROLES } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { PunishmentWheel } from '../gameplay/punishment-wheel.js';
import { socketClient } from '../socket.js';
import { escapeHtml } from '../utils/escape-html.js';
import { soundFX } from '../utils/sound.js';

function renderRecapHtml(history = []) {
  if (!history.length) return '';

  const itemsHtml = history
    .map((item) => {
      const ansClass =
        item.answer === ANSWERS.YES
          ? 'ans-yes'
          : item.answer === ANSWERS.NO
            ? 'ans-no'
            : 'ans-skip';

      const total = item.poll?.totalVotes || 0;
      let pollHtml = '';
      if (total > 0) {
        const honestPct = Math.round((item.poll.honestCount / total) * 100);
        const liePct = 100 - honestPct;
        pollHtml = `<div class="recap-poll">😇 Jujur ${honestPct}% · 😈 Bohong ${liePct}% (${total} suara)</div>`;
      }

      return `
        <li class="recap-item">
          <div class="recap-top">
            <span class="recap-player">#${item.turnNumber} · ${escapeHtml(item.playerName)}</span>
            <span class="recap-ans ${ansClass}">${escapeHtml(item.answer)}</span>
          </div>
          <div class="recap-q">${escapeHtml(item.question)}</div>
          ${pollHtml}
        </li>
      `;
    })
    .join('');

  return `
    <div class="recap-box">
      <div class="recap-title">Rekap Pertanyaan & Polling (${history.length})</div>
      <ul class="recap-list">${itemsHtml}</ul>
    </div>
  `;
}

export function renderResultScreen(container, { session, initialState, onExitToMenu }) {
  const isHost = session.role === ROLES.HOST;
  const hostWon =
    initialState.state === GAME_STATES.HOST_WON || initialState.state === GAME_STATES.FINISHED;
  const history = initialState.gameProgress?.questionHistory || [];

  if (hostWon) {
    soundFX.win();
    container.innerHTML = `
      <div class="result-overlay">
        <div class="result-card win-card">
          <div class="result-badge">SELAMAT!</div>
          <h1>HOST MENANG!</h1>
          <p>
            <strong>${escapeHtml(initialState.host.name)}</strong> berhasil menyelesaikan seluruh 10 pertanyaan
            dengan total LEWATI <strong>${initialState.gameProgress.skipCount}/${initialState.gameProgress.maxSkips}</strong>.
          </p>
          ${renderRecapHtml(history)}
          <button id="btn-back-home" class="btn-menu btn-gold" type="button">Kembali ke Main Menu</button>
        </div>
      </div>
    `;

    container.querySelector('#btn-back-home').addEventListener('click', () => {
      soundFX.click();
      socketClient.clearSession();
      onExitToMenu();
    });

    return { updateUI: () => {}, onWheelResult: () => {} };
  }

  soundFX.lose();
  container.innerHTML = `
    <div class="result-overlay">
      <div class="wheel-stage-card">
        <div class="result-badge badge-lose">HOST KALAH (LEWATI 2/2)</div>
        <h2>RODA HUKUMAN!</h2>

        <div class="wheel-wrapper">
          <canvas id="punishment-wheel-canvas" width="340" height="340"></canvas>
        </div>

        <div id="wheel-result-banner" class="wheel-result-banner hidden"></div>
        <div id="wheel-recap-container" class="hidden">${renderRecapHtml(history)}</div>

        <div class="wheel-actions">
          ${
            isHost
              ? `<button id="btn-spin-wheel" class="btn-menu btn-gold" type="button">PUTAR RODA HUKUMAN</button>`
              : `<p class="muted-note" id="wheel-wait-note">Menunggu Host memutar roda hukuman...</p>`
          }
          <button id="btn-wheel-home" class="btn-menu btn-ghost hidden" type="button">Kembali ke Main Menu</button>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector('#punishment-wheel-canvas');
  const wheel = new PunishmentWheel(canvas, initialState.punishments);
  const spinBtn = container.querySelector('#btn-spin-wheel');
  const waitNote = container.querySelector('#wheel-wait-note');
  const resultBanner = container.querySelector('#wheel-result-banner');
  const recapContainer = container.querySelector('#wheel-recap-container');
  const homeBtn = container.querySelector('#btn-wheel-home');

  if (spinBtn) {
    spinBtn.addEventListener('click', async () => {
      soundFX.click();
      spinBtn.disabled = true;
      await socketClient.emitAsync(SOCKET_EVENTS.WHEEL_SPIN);
    });
  }

  homeBtn.addEventListener('click', () => {
    soundFX.click();
    socketClient.clearSession();
    onExitToMenu();
  });

  let spunHandled = false;

  const showFinalResult = (text) => {
    resultBanner.innerHTML = `<span>HUKUMAN TERPILIH:</span><strong>${escapeHtml(text)}</strong>`;
    resultBanner.classList.remove('hidden');
    if (history.length) recapContainer.classList.remove('hidden');
    homeBtn.classList.remove('hidden');
    if (waitNote) waitNote.classList.add('hidden');
    if (spinBtn) spinBtn.classList.add('hidden');
  };

  const onWheelResult = async (result) => {
    if (spunHandled || !result) return;
    spunHandled = true;
    if (spinBtn) spinBtn.disabled = true;
    if (waitNote) waitNote.textContent = 'Roda sedang berputar...';
    await wheel.spinToIndex(result.index, 4500);
    soundFX.win();
    showFinalResult(result.text);
  };

  const updateUI = (state) => {
    if (state.gameProgress?.wheelResult && !spunHandled) {
      if (state.state === GAME_STATES.PUNISHMENT_RESULT) {
        spunHandled = true;
        showFinalResult(state.gameProgress.wheelResult.text);
      }
    }
  };

  if (initialState.gameProgress?.wheelResult) {
    updateUI(initialState);
  }

  return { updateUI, onWheelResult };
}
