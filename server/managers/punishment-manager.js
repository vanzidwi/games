import crypto from 'node:crypto';
import { GAME_STATES } from '../../shared/constants.js';
import { validatePunishmentList } from '../game/validators.js';

export class PunishmentManager {
  /**
   * Memperbarui daftar hukuman (hanya boleh sebelum permainan dimulai).
   */
  updatePunishments(room, list) {
    if (room.state !== GAME_STATES.WAITING && room.state !== GAME_STATES.LOBBY_READY) {
      return { ok: false, error: 'Daftar hukuman sudah dikunci karena permainan telah dimulai.' };
    }

    const validation = validatePunishmentList(list);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }

    room.punishments = validation.value;
    return { ok: true, punishments: room.punishments };
  }

  /**
   * Memilih satu hukuman secara acak di server (cryptographically secure).
   * @param {object} room
   * @returns {{ index: number, text: string }}
   */
  pickRandomPunishment(room) {
    const total = room.punishments.length;
    if (total === 0) {
      throw new Error('Daftar hukuman kosong.');
    }
    const index = crypto.randomInt(0, total);
    const text = room.punishments[index];
    return { index, text };
  }
}

export const punishmentManager = new PunishmentManager();
