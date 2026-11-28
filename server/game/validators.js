import { GAME_CONFIG } from '../../shared/constants.js';

export function sanitizeText(input, maxLength) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function validateDisplayName(name) {
  const cleaned = sanitizeText(name, GAME_CONFIG.MAX_NAME_LENGTH);
  if (!cleaned) {
    return { valid: false, value: '', error: 'Nama wajib diisi.' };
  }
  return { valid: true, value: cleaned };
}

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
 * Mengambil alamat IP client dari header proxy (Railway/Cloudflare) atau socket handshake.
 * @param {import('socket.io').Socket} socket
 * @returns {string}
 */
export function getClientIp(socket) {
  const forwarded = socket.handshake?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake?.address || socket.id;
}

/**
 * Rate limiter dengan pembersihan bucket kadaluarsa otomatis (mencegah memory leak).
 */
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.lastPrune = Date.now();
  }

  allow(key, maxRequests = 10, windowMs = 5000) {
    const now = Date.now();
    if (now - this.lastPrune > 60000 && this.buckets.size > 200) {
      this.prune(now, windowMs);
    }

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

  prune(now = Date.now(), maxAgeMs = 30000) {
    this.lastPrune = now;
    for (const [key, entries] of this.buckets.entries()) {
      const recent = entries.filter((ts) => now - ts < maxAgeMs);
      if (recent.length === 0) {
        this.buckets.delete(key);
      } else {
        this.buckets.set(key, recent);
      }
    }
  }

  clearPrefix(prefix) {
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        this.buckets.delete(key);
      }
    }
  }
}
