import crypto from 'node:crypto';
import { GAME_CONFIG, GAME_STATES } from '../../shared/constants.js';

/**
 * Membuat kode room unik 6 karakter tanpa karakter ambigu (O, 0, I, 1).
 * @param {Set<string>} existingCodes
 * @returns {string}
 */
export function generateRoomCode(existingCodes) {
  const charset = GAME_CONFIG.ROOM_CODE_CHARSET;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let i = 0; i < GAME_CONFIG.ROOM_CODE_LENGTH; i += 1) {
      const idx = crypto.randomInt(0, charset.length);
      code += charset[idx];
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  throw new Error('Gagal membuat kode room unik.');
}

/**
 * Membuat token sesi acak yang aman.
 * @returns {string}
 */
export function generateSessionToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Memeriksa apakah Host boleh memulai permainan.
 * Syarat:
 * - State WAITING atau LOBBY_READY
 * - 5 Player sudah bergabung
 * - Seluruh 5 Player berstatus SIAP dan terhubung
 * - Minimal 2 hukuman sudah dibuat Host
 */
export function canStartGame(room) {
  if (!room) return { ok: false, reason: 'Room tidak ditemukan.' };
  if (room.state !== GAME_STATES.WAITING && room.state !== GAME_STATES.LOBBY_READY) {
    return { ok: false, reason: 'Permainan sudah dimulai.' };
  }
  if (!room.host.connected) {
    return { ok: false, reason: 'Host tidak terhubung.' };
  }

  const joinedPlayers = room.players.filter((p) => p !== null);
  if (joinedPlayers.length < GAME_CONFIG.MAX_PLAYERS) {
    return {
      ok: false,
      reason: `Menunggu ${GAME_CONFIG.MAX_PLAYERS - joinedPlayers.length} Player lagi.`
    };
  }

  const allReady = joinedPlayers.every((p) => p.ready && p.connected);
  if (!allReady) {
    return { ok: false, reason: 'Semua Player harus terhubung dan berstatus SIAP.' };
  }

  if (room.punishments.length < GAME_CONFIG.MIN_PUNISHMENTS) {
    return {
      ok: false,
      reason: `Minimal harus ada ${GAME_CONFIG.MIN_PUNISHMENTS} hukuman sebelum mulai.`
    };
  }

  return { ok: true };
}

/**
 * Menentukan apakah Host menang (10 giliran selesai dan LEWATI < 2).
 */
export function isHostWinConditionMet(room) {
  return (
    room.gameProgress.completedTurns >= GAME_CONFIG.TOTAL_QUESTIONS &&
    room.gameProgress.skipCount < GAME_CONFIG.MAX_SKIPS
  );
}
