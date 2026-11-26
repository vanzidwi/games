import { GAME_STATES } from '../../shared/constants.js';

const ALLOWED_TRANSITIONS = new Map([
  [GAME_STATES.WAITING, new Set([GAME_STATES.LOBBY_READY, GAME_STATES.CANCELLED])],
  [GAME_STATES.LOBBY_READY, new Set([GAME_STATES.WAITING, GAME_STATES.ASKING, GAME_STATES.CANCELLED])],
  [GAME_STATES.ASKING, new Set([GAME_STATES.ANSWERING, GAME_STATES.ASKING, GAME_STATES.HOST_WON, GAME_STATES.CANCELLED])],
  [GAME_STATES.ANSWERING, new Set([GAME_STATES.ASKING, GAME_STATES.HOST_LOST, GAME_STATES.HOST_WON, GAME_STATES.CANCELLED])],
  [GAME_STATES.HOST_LOST, new Set([GAME_STATES.WHEEL_READY, GAME_STATES.CANCELLED])],
  [GAME_STATES.WHEEL_READY, new Set([GAME_STATES.WHEEL_SPINNING, GAME_STATES.CANCELLED])],
  [GAME_STATES.WHEEL_SPINNING, new Set([GAME_STATES.PUNISHMENT_RESULT, GAME_STATES.CANCELLED])],
  [GAME_STATES.PUNISHMENT_RESULT, new Set([GAME_STATES.FINISHED, GAME_STATES.CANCELLED])],
  [GAME_STATES.HOST_WON, new Set([GAME_STATES.FINISHED, GAME_STATES.CANCELLED])],
  [GAME_STATES.FINISHED, new Set([])],
  [GAME_STATES.CANCELLED, new Set([])]
]);

/**
 * Memvalidasi dan menerapkan transisi state permainan.
 * @param {object} room
 * @param {string} nextState
 * @returns {boolean}
 */
export function transitionGameState(room, nextState) {
  if (room.state === nextState) return true;
  const allowed = ALLOWED_TRANSITIONS.get(room.state);
  if (!allowed || !allowed.has(nextState)) {
    return false;
  }
  room.state = nextState;
  return true;
}
