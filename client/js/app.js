import { ANSWERS, GAME_STATES } from '@shared/constants.js';
import { SOCKET_EVENTS } from '@shared/event-names.js';
import { renderCreateRoom } from './screens/create-room.js';
import { renderGameplay } from './screens/gameplay.js';
import { renderJoinRoom } from './screens/join-room.js';
import { renderLobby } from './screens/lobby.js';
import { renderMainMenu } from './screens/main-menu.js';
import { renderObsOverlay } from './screens/overlay.js';
import { renderResultScreen } from './screens/result-screen.js';
import { socketClient } from './socket.js';
import { StudioStage } from './three/studio-stage.js';
import { soundFX } from './utils/sound.js';

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

function parseOverlayRoute() {
  const match = window.location.pathname.match(/^\/overlay\/([A-Za-z0-9]{6})\/?$/);
  if (!match) return null;
  const params = new URLSearchParams(window.location.search);
  return {
    roomCode: match[1].toUpperCase(),
    overlayToken: params.get('token') || ''
  };
}

function initApp() {
  const threeContainer = document.getElementById('three-container');
  const speechLayer = document.getElementById('speech-layer');
  const uiRoot = document.getElementById('ui-root');
  const webglWarning = document.getElementById('webgl-warning');

  if (!checkWebGLSupport()) {
    webglWarning.classList.remove('hidden');
    return;
  }

  const overlayRoute = parseOverlayRoute();
  const stage = new StudioStage(threeContainer, speechLayer, {
    transparent: Boolean(overlayRoute),
    interactive: !overlayRoute
  });

  if (overlayRoute) {
    renderObsOverlay(uiRoot, { ...overlayRoute, stage });
    return;
  }

  const socket = socketClient.connect();
  let currentSession = null;
  let currentScreenName = 'main-menu';
  let activeScreenController = null;

  const clearScreen = () => {
    if (activeScreenController?.dispose) {
      activeScreenController.dispose();
    }
    activeScreenController = null;
    uiRoot.innerHTML = '';
  };

  const navigate = (screenName, extra = {}) => {
    clearScreen();
    currentScreenName = screenName;

    if (screenName === 'main-menu') {
      stage.characterManager.showAllPreview();
      stage.speechOverlay.syncNameplates(null);
      stage.speechOverlay.hideQuestion();
      stage.hostLookController.setTargetPlayer(null);
      activeScreenController = renderMainMenu(uiRoot, {
        onNavigate: navigate,
        socket
      });
      return;
    }

    if (screenName === 'create-room') {
      renderCreateRoom(uiRoot, {
        onNavigate: navigate,
        onRoomEntered: (res) => {
          currentSession = {
            roomCode: res.roomCode,
            role: res.role,
            slotIndex: res.slotIndex,
            sessionToken: res.sessionToken,
            overlayToken: res.overlayToken
          };
          navigate('lobby', { initialState: res.state });
        }
      });
      return;
    }

    if (screenName === 'join-room') {
      renderJoinRoom(uiRoot, {
        onNavigate: navigate,
        onRoomEntered: (res) => {
          currentSession = {
            roomCode: res.roomCode,
            role: res.role,
            slotIndex: res.slotIndex,
            sessionToken: res.sessionToken
          };
          navigate('lobby', { initialState: res.state });
        }
      });
      return;
    }

    if (screenName === 'lobby') {
      stage.characterManager.syncFromRoomState(extra.initialState);
      stage.speechOverlay.syncNameplates(extra.initialState, true);
      activeScreenController = renderLobby(uiRoot, {
        session: currentSession,
        initialState: extra.initialState,
        onLeave: () => {
          currentSession = null;
          navigate('main-menu');
        }
      });
      return;
    }

    if (screenName === 'gameplay') {
      activeScreenController = renderGameplay(uiRoot, {
        session: currentSession,
        initialState: extra.initialState,
        stage
      });
      return;
    }

    if (screenName === 'result') {
      activeScreenController = renderResultScreen(uiRoot, {
        session: currentSession,
        initialState: extra.initialState,
        onExitToMenu: () => {
          currentSession = null;
          navigate('main-menu');
        }
      });
    }
  };

  // Tampilkan Main Menu segera tanpa menunggu event connect socket
  navigate('main-menu');

  // Sinkronisasi state real-time dari server
  socket.on(SOCKET_EVENTS.ROOM_STATE, (state) => {
    if (!currentSession || state.roomCode !== currentSession.roomCode) return;

    stage.characterManager.syncFromRoomState(state);
    const inLobby =
      state.state === GAME_STATES.WAITING || state.state === GAME_STATES.LOBBY_READY;
    stage.speechOverlay.syncNameplates(state, inLobby);
    stage.hostLookController.setTargetPlayer(state.gameProgress?.activePlayerId || null);
    stage.animController.setHostPanic(state.gameProgress?.skipCount >= 1);

    if (inLobby) {
      if (currentScreenName !== 'lobby') navigate('lobby', { initialState: state });
      else activeScreenController?.updateUI?.(state);
    } else if (
      state.state === GAME_STATES.ASKING ||
      state.state === GAME_STATES.ANSWERING
    ) {
      if (currentScreenName !== 'gameplay') navigate('gameplay', { initialState: state });
      else activeScreenController?.updateUI?.(state);
    } else if (
      state.state === GAME_STATES.HOST_WON ||
      state.state === GAME_STATES.HOST_LOST ||
      state.state === GAME_STATES.WHEEL_READY ||
      state.state === GAME_STATES.WHEEL_SPINNING ||
      state.state === GAME_STATES.PUNISHMENT_RESULT ||
      state.state === GAME_STATES.FINISHED
    ) {
      stage.speechOverlay.hideQuestion();
      if (currentScreenName !== 'result') navigate('result', { initialState: state });
      else activeScreenController?.updateUI?.(state);
    } else if (state.state === GAME_STATES.CANCELLED) {
      stage.speechOverlay.hideQuestion();
      socketClient.clearSession();
      currentSession = null;
      window.alert('Pertandingan dibatalkan karena Host keluar atau tidak kembali tepat waktu.');
      navigate('main-menu');
    }
  });

  socket.on(SOCKET_EVENTS.QUESTION_RECEIVED, ({ activePlayerId, question }) => {
    soundFX.question();
    stage.speechOverlay.showQuestion(activePlayerId, activePlayerId, question);
  });

  socket.on(SOCKET_EVENTS.ANSWER_RESULT, ({ answer }) => {
    if (answer === ANSWERS.YES) soundFX.answerYes();
    else if (answer === ANSWERS.NO) soundFX.answerNo();
    else soundFX.answerSkip();

    stage.speechOverlay.hideQuestion();
  });

  socket.on(SOCKET_EVENTS.GAME_TURN_CHANGED, () => {
    stage.speechOverlay.hideQuestion();
  });

  socket.on(SOCKET_EVENTS.CHARACTER_ANIMATION, ({ targetId, animation }) => {
    stage.animController.triggerAnimation(targetId, animation);
  });

  socket.on(SOCKET_EVENTS.WHEEL_RESULT, (result) => {
    activeScreenController?.onWheelResult?.(result);
  });

  // Coba reconnect otomatis jika user refresh browser di tengah room
  socket.on('connect', async () => {
    const saved = socketClient.getSavedSession();
    if (saved && saved.roomCode && saved.sessionToken) {
      const res = await socketClient.emitAsync(SOCKET_EVENTS.SESSION_RECONNECT, {
        roomCode: saved.roomCode,
        sessionToken: saved.sessionToken
      });
      if (res.ok && res.state) {
        currentSession = {
          roomCode: res.roomCode,
          role: res.role,
          slotIndex: res.slotIndex,
          sessionToken: saved.sessionToken,
          overlayToken: res.overlayToken || saved.overlayToken
        };
        const st = res.state.state;
        if (st === GAME_STATES.WAITING || st === GAME_STATES.LOBBY_READY) {
          navigate('lobby', { initialState: res.state });
        } else if (st === GAME_STATES.ASKING || st === GAME_STATES.ANSWERING) {
          navigate('gameplay', { initialState: res.state });
          if (res.state.gameProgress?.currentQuestion) {
            stage.speechOverlay.showQuestion(
              res.state.gameProgress.activePlayerId,
              res.state.gameProgress.activePlayerId,
              res.state.gameProgress.currentQuestion
            );
          }
        } else {
          navigate('result', { initialState: res.state });
        }
        return;
      }
      socketClient.clearSession();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
