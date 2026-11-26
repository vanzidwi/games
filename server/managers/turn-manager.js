import { GAME_CONFIG } from '../../shared/constants.js';

export class TurnManager {
  /**
   * Mendapatkan slot Player (1..5) dan nomor ronde (1..2) berdasarkan turnIndex (0..9).
   * @param {number} turnIndex
   */
  getTurnMeta(turnIndex) {
    const round = Math.floor(turnIndex / GAME_CONFIG.MAX_PLAYERS) + 1;
    const slotIndex = (turnIndex % GAME_CONFIG.MAX_PLAYERS) + 1;
    return {
      turnIndex,
      turnNumber: turnIndex + 1,
      round,
      slotIndex,
      activePlayerId: `P${slotIndex}`
    };
  }

  /**
   * Mencari giliran berikutnya yang memiliki Player terhubung, atau menandai selesai jika 10 giliran habis.
   * Player yang terputus saat gilirannya tiba otomatis dilewati (spectatorOnly = true) tanpa menambah LEWATI Host.
   * @param {object} room
   * @returns {{ done: boolean, meta?: object, skippedSlots: number[] }}
   */
  advanceToNextValidTurn(room) {
    const skippedSlots = [];

    while (room.gameProgress.nextTurnIndex < GAME_CONFIG.TOTAL_QUESTIONS) {
      const idx = room.gameProgress.nextTurnIndex;
      const meta = this.getTurnMeta(idx);
      const player = room.players[meta.slotIndex - 1];

      room.gameProgress.nextTurnIndex += 1;

      if (!player || !player.connected) {
        if (player) {
          player.spectatorOnly = true;
        }
        room.gameProgress.completedTurns += 1;
        skippedSlots.push(meta.slotIndex);
        continue;
      }

      room.gameProgress.currentTurnIndex = idx;
      room.gameProgress.round = meta.round;
      room.gameProgress.activeSlot = meta.slotIndex;
      room.gameProgress.activePlayerId = meta.activePlayerId;
      room.gameProgress.currentQuestion = null;
      room.gameProgress.lastAnswer = null;
      return { done: false, meta, skippedSlots };
    }

    return { done: true, skippedSlots };
  }
}

export const turnManager = new TurnManager();
