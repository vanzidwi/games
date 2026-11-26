import { GAME_CONFIG } from '../../shared/constants.js';

/**
 * Membersihkan teks dari karakter kontrol & spasi berlebih.
 * @param {unknown} input
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeText(input, maxLength) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Validasi nama Host atau Player (wajib diisi, maks 20 karakter).
 * @param {unknown} name
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
export function validateDisplayName(name) {
  const cleaned = sanitizeText(name, GAME_CONFIG.MAX_NAME_LENGTH);
  if (!cleaned) {
    return { valid: false, value: '', error: 'Nama wajib diisi.' };
  }
  return { valid: true, value: cleaned };
}

/**
 * Validasi kode room (6 karakter alfanumerik, case-insensitive).
 * @param {unknown} code
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
export function validateRoomCode(code) {
  if (typeof code !== 'string') {
    return { valid: false, value: '', error: 'Kode room tidak valid.' };
  }
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== GAME_CONFIG.ROOM_CODE_LENGTH) {
    return { valid: false, value: '', error: 'Kode room harus terdiri dari 6 karakter.' };
  }
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return { valid: false, value: '', error: 'Kode room hanya boleh berisi huruf dan angka.' };
  }
  return { valid: true, value: normalized };
}

/**
 * Validasi pertanyaan Player (tidak boleh kosong/whitespace, maks 300 karakter).
 * @param {unknown} text
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
export function validateQuestion(text) {
  if (typeof text !== 'string') {
    return { valid: false, value: '', error: 'Pertanyaan harus berupa teks.' };
  }
  const cleaned = text.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) {
    return { valid: false, value: '', error: 'Pertanyaan tidak boleh kosong.' };
  }
  if (cleaned.length > GAME_CONFIG.MAX_QUESTION_LENGTH) {
    return {
      valid: false,
      value: '',
      error: `Pertanyaan maksimal ${GAME_CONFIG.MAX_QUESTION_LENGTH} karakter.`
    };
  }
  return { valid: true, value: cleaned };
}

/**
 * Validasi daftar hukuman dari Host (2 - 12 item, masing-masing tidak kosong).
 * @param {unknown} list
 * @returns {{ valid: boolean, value: string[], error?: string }}
 */
export function validatePunishmentList(list) {
  if (!Array.isArray(list)) {
    return { valid: false, value: [], error: 'Daftar hukuman tidak valid.' };
  }

  const cleaned = list
    .map((item) => sanitizeText(item, GAME_CONFIG.MAX_PUNISHMENT_LENGTH))
    .filter((item) => item.length > 0);

  if (cleaned.length < GAME_CONFIG.MIN_PUNISHMENTS) {
    return {
      valid: false,
      value: cleaned,
      error: `Minimal harus ada ${GAME_CONFIG.MIN_PUNISHMENTS} hukuman.`
    };
  }

  if (cleaned.length > GAME_CONFIG.MAX_PUNISHMENTS) {
    return {
      valid: false,
      value: cleaned.slice(0, GAME_CONFIG.MAX_PUNISHMENTS),
      error: `Maksimal ${GAME_CONFIG.MAX_PUNISHMENTS} hukuman.`
    };
  }

  return { valid: true, value: cleaned };
}

/**
 * Rate limiter sederhana per socket dan nama event.
 */
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  /**
   * @param {string} key
   * @param {number} maxRequests
   * @param {number} windowMs
   * @returns {boolean} true jika diizinkan
   */
  allow(key, maxRequests = 10, windowMs = 5000) {
    const now = Date.now();
    const entries = this.buckets.get(key) || [];
    const recent = entries.filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      this.buckets.set(key, recent);
      return false;
    }
    recent.push(now);
    this.buckets.set(key, recent);
    return true;
  }

  clearPrefix(prefix) {
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        this.buckets.delete(key);
      }
    }
  }
}
