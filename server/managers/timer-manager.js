export class TimerManager {
  constructor() {
    this.questionTimers = new Map();
    this.hostDisconnectTimers = new Map();
    this.lobbyDisconnectTimers = new Map(); // key: `${roomCode}:${participantId}`
  }

  startQuestionTimer(roomCode, durationMs, onTimeout) {
    this.clearQuestionTimer(roomCode);
    const deadline = Date.now() + durationMs;
    const handle = setTimeout(() => {
      this.questionTimers.delete(roomCode);
      onTimeout();
    }, durationMs);
    this.questionTimers.set(roomCode, handle);
    return deadline;
  }

  clearQuestionTimer(roomCode) {
    const handle = this.questionTimers.get(roomCode);
    if (handle) {
      clearTimeout(handle);
      this.questionTimers.delete(roomCode);
    }
  }

  startHostDisconnectTimer(roomCode, durationMs, onExpire) {
    this.clearHostDisconnectTimer(roomCode);
    const deadline = Date.now() + durationMs;
    const handle = setTimeout(() => {
      this.hostDisconnectTimers.delete(roomCode);
      onExpire();
    }, durationMs);
    this.hostDisconnectTimers.set(roomCode, handle);
    return deadline;
  }

  clearHostDisconnectTimer(roomCode) {
    const handle = this.hostDisconnectTimers.get(roomCode);
    if (handle) {
      clearTimeout(handle);
      this.hostDisconnectTimers.delete(roomCode);
    }
  }

  startLobbyDisconnectTimer(roomCode, participantId, durationMs, onExpire) {
    const key = `${roomCode}:${participantId}`;
    this.clearLobbyDisconnectTimer(roomCode, participantId);
    const handle = setTimeout(() => {
      this.lobbyDisconnectTimers.delete(key);
      onExpire();
    }, durationMs);
    this.lobbyDisconnectTimers.set(key, handle);
  }

  clearLobbyDisconnectTimer(roomCode, participantId) {
    const key = `${roomCode}:${participantId}`;
    const handle = this.lobbyDisconnectTimers.get(key);
    if (handle) {
      clearTimeout(handle);
      this.lobbyDisconnectTimers.delete(key);
    }
  }

  clearAllForRoom(roomCode) {
    this.clearQuestionTimer(roomCode);
    this.clearHostDisconnectTimer(roomCode);
    const prefix = `${roomCode}:`;
    for (const [key, handle] of this.lobbyDisconnectTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(handle);
        this.lobbyDisconnectTimers.delete(key);
      }
    }
  }
}

export const timerManager = new TimerManager();
