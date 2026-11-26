export class TimerManager {
  constructor() {
    this.questionTimers = new Map();
    this.hostDisconnectTimers = new Map();
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

  clearAllForRoom(roomCode) {
    this.clearQuestionTimer(roomCode);
    this.clearHostDisconnectTimer(roomCode);
  }
}

export const timerManager = new TimerManager();
