import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '@shared/event-names.js';

const SESSION_KEY = 'jah_active_session_v1';

class SocketClient {
  constructor() {
    this.socket = null;
  }

  connect() {
    if (this.socket) return this.socket;

    // Jika di-deploy di Vercel, set VITE_SERVER_URL ke URL backend WebSocket (Render/Railway/Fly)
    const serverUrl = import.meta.env.VITE_SERVER_URL || undefined;

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    return this.socket;
  }

  emitAsync(event, payload = {}) {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Koneksi socket belum siap.' });
        return;
      }
      this.socket.timeout(8000).emit(event, payload, (err, res) => {
        if (err) {
          resolve({ ok: false, error: 'Server tidak merespons (timeout).' });
          return;
        }
        resolve(res || { ok: false, error: 'Respons server kosong.' });
      });
    });
  }

  saveSession(data) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {
      // Abaikan
    }
  }

  getSavedSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Abaikan
    }
  }

  pingServer() {
    return this.emitAsync(SOCKET_EVENTS.SYSTEM_PING, { clientTime: Date.now() });
  }
}

export const socketClient = new SocketClient();
