import { GAME_STATES, ROLES } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { PunishmentWheel } from '../gameplay/punishment-wheel.js';
import { socketClient } from '../socket.js';
import { soundFX } from '../utils/sound.js';

export function renderResultScreen(container, { session, initialState, onExitToMenu }) {
  const isHost = session.role === ROLES.HOST;
  const hostWon =
    initialState.state === GAME_STATES.HOST_WON || initialState.state === GAME_STATES.FINISHED;

  if (hostWon) {
    soundFX.win();
    container.innerHTML = `
      <div class="result-overlay">
        <div class="result-card win-card">
          <div class="result-badge">SELAMAT!</div>
          <h1>HOST MENANG!</h1>
          <p>
            <strong>${initialState.host.name}</strong> berhasil menyelesaikan seluruh 10 pertanyaan
            dengan total LEWATI <strong>${initialState.gameProgress.skipCount}/${initialState.gameProgress.maxSkips}</strong>.
          </p>
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

  // Host Kalah -> Tampilkan Roda Hukuman
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
    resultBanner.innerHTML = `<span>HUKUMAN TERPILIH:</span><strong>${text}</strong>`;
    resultBanner.classList.remove('hidden');
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
