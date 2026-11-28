import { AVATAR_COLORS, GAME_CONFIG } from '../../shared/constants.js';
import { generateSessionToken } from '../game/game-rules.js';

export class PlayerManager {
  /**
   * Menempatkan Player baru ke slot kosong pertama (slot 1..5).
   * @param {object} room
   * @param {string} name
   * @param {string} socketId
   * @returns {{ ok: boolean, player?: object, error?: string }}
   */
  addPlayer(room, name, socketId) {
    const emptyIndex = room.players.findIndex((p) => p === null);
    if (emptyIndex === -1) {
      return { ok: false, error: 'Room sudah penuh (maksimal 5 Player).' };
    }

    const slotNumber = emptyIndex + 1;
    const player = {
      id: `P${slotNumber}`,
      slotIndex: slotNumber,
      name,
      sessionToken: generateSessionToken(),
      socketId,
      ready: false,
      connected: true,
      spectatorOnly: false,
      avatar: {
        color: AVATAR_COLORS[(slotNumber % (AVATAR_COLORS.length - 1)) + 1] || '#3b82f6',
        accessory: 'none'
      }
    };

    room.players[emptyIndex] = player;
    return { ok: true, player };
  }

  /**
   * Menghapus Player saat keluar di Lobby.
   */
  removePlayerFromLobby(room, slotIndex) {
    const idx = slotIndex - 1;
    if (idx >= 0 && idx < GAME_CONFIG.MAX_PLAYERS) {
      room.players[idx] = null;
    }
  }

  /**
   * Mengubah status SIAP/BELUM SIAP Player di Lobby.
   */
  setPlayerReady(room, slotIndex, ready) {
    const player = room.players[slotIndex - 1];
    if (!player) return null;
    player.ready = Boolean(ready);
    return player;
  }

  findPlayerByToken(room, token) {
    return room.players.find((p) => p && p.sessionToken === token) || null;
  }

  findPlayerBySocket(room, socketId) {
    return room.players.find((p) => p && p.socketId === socketId) || null;
  }
}

export const playerManager = new PlayerManager();
