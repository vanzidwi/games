import { GAME_CONFIG, GAME_STATES, ROLES } from '../../shared/constants.js';
import { SOCKET_EVENTS } from '../../shared/event-names.js';
import { canStartGame, generateRoomCode, generateSessionToken } from '../game/game-rules.js';
import { timerManager } from './timer-manager.js';

export const ROOM_LIMITS = Object.freeze({
  MAX_TOTAL_ROOMS: 200,
  MAX_ROOMS_PER_IP: 3,
  MAX_SPECTATORS_PER_ROOM: 100,
  ROOM_IDLE_TTL_MS: 30 * 60 * 1000, // 30 menit tidak aktif -> dihapus
  FINISHED_ROOM_TTL_MS: 5 * 60 * 1000 // 5 menit setelah selesai -> dihapus
});

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.socketIndex = new Map();
  }

  countRoomsByIp(ip) {
    if (!ip) return 0;
    let count = 0;
    for (const room of this.rooms.values()) {
      if (room.creatorIp === ip) count += 1;
    }
    return count;
  }

  createRoom(hostName, hostSocketId, creatorIp = 'unknown') {
    const existingCodes = new Set(this.rooms.keys());
    const roomCode = generateRoomCode(existingCodes);
    const hostToken = generateSessionToken();
    const overlayToken = generateSessionToken();
    const now = Date.now();

    const room = {
      roomCode,
      creatorIp,
      state: GAME_STATES.WAITING,
      createdAt: now,
      lastActivityAt: now,
      finishedAt: null,
      overlayToken,
      pausedByHostDisconnect: false,
      hostDisconnectDeadline: null,
      pausedRemainingQuestionMs: null,
      host: {
        id: 'HOST',
        name: hostName,
        sessionToken: hostToken,
        socketId: hostSocketId,
        connected: true,
        avatar: { color: '#dc2626', accessory: 'crown' }
      },
      players: Array(GAME_CONFIG.MAX_PLAYERS).fill(null),
      spectators: new Map(),
      punishments: [],
      gameProgress: {
        round: 1,
        currentTurnIndex: 0,
        nextTurnIndex: 0,
        completedTurns: 0,
        activeSlot: null,
        activePlayerId: null,
        currentQuestion: null,
        questionDeadline: null,
        skipCount: 0,
        lastAnswer: null,
        answerLocked: false,
        pendingTurnAdvance: false,
        wheelResult: null,
        wheelSpun: false,
        poll: {
          active: false,
          honestCount: 0,
          lieCount: 0,
          voters: new Set(),
          voterIps: new Set()
        }
      }
    };

    this.rooms.set(roomCode, room);
    this.bindSocket(hostSocketId, roomCode, ROLES.HOST, 0, hostToken);

    return { room, sessionToken: hostToken };
  }

  touchRoom(room) {
    if (room) room.lastActivityAt = Date.now();
  }

  markRoomFinished(room) {
    if (room && !room.finishedAt) {
      room.finishedAt = Date.now();
    }
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(String(roomCode).trim().toUpperCase()) || null;
  }

  bindSocket(socketId, roomCode, role, slotIndex = 0, sessionToken = null) {
    this.socketIndex.set(socketId, { roomCode, role, slotIndex, sessionToken });
  }

  unbindSocket(socketId) {
    const info = this.socketIndex.get(socketId) || null;
    this.socketIndex.delete(socketId);
    return info;
  }

  getSocketBinding(socketId) {
    return this.socketIndex.get(socketId) || null;
  }

  /**
   * Menambahkan penonton atau menggunakan kembali sesi penonton dari IP yang sama
   * agar tidak bisa memanipulasi polling dengan membuka tab berulang.
   */
  addOrReuseSpectator(room, name, socketId, ip = 'unknown') {
    for (const existing of room.spectators.values()) {
      if (existing.ip === ip && ip !== 'unknown') {
        if (existing.socketId && existing.socketId !== socketId) {
          this.socketIndex.delete(existing.socketId);
        }
        existing.name = name;
        existing.socketId = socketId;
        existing.connected = true;
        this.bindSocket(socketId, room.roomCode, ROLES.SPECTATOR, -1, existing.sessionToken);
        return existing;
      }
    }

    const sessionToken = generateSessionToken();
    const spectator = {
      name,
      ip,
      sessionToken,
      socketId,
      connected: true
    };
    room.spectators.set(sessionToken, spectator);
    this.bindSocket(socketId, room.roomCode, ROLES.SPECTATOR, -1, sessionToken);
    return spectator;
  }

  getConnectedSpectatorCount(room) {
    let count = 0;
    for (const s of room.spectators.values()) {
      if (s.connected) count += 1;
    }
    return count;
  }

  deleteRoom(roomCode) {
    timerManager.clearAllForRoom(roomCode);
    const room = this.rooms.get(roomCode);
    if (room) {
      if (room.host.socketId) this.socketIndex.delete(room.host.socketId);
      for (const p of room.players) {
        if (p?.socketId) this.socketIndex.delete(p.socketId);
      }
      for (const s of room.spectators.values()) {
        if (s.socketId) this.socketIndex.delete(s.socketId);
      }
      room.spectators.clear();
    }
    this.rooms.delete(roomCode);
  }

  /**
   * Membersihkan room yang sudah selesai atau idle terlalu lama untuk mencegah memory leak.
   */
  cleanupExpiredRooms(io) {
    const now = Date.now();
    for (const [roomCode, room] of this.rooms.entries()) {
      const isTerminal =
        room.state === GAME_STATES.HOST_WON ||
        room.state === GAME_STATES.PUNISHMENT_RESULT ||
        room.state === GAME_STATES.FINISHED ||
        room.state === GAME_STATES.CANCELLED;

      const finishedExpired =
        isTerminal &&
        (room.finishedAt || room.lastActivityAt) + ROOM_LIMITS.FINISHED_ROOM_TTL_MS < now;

      const idleExpired = now - room.lastActivityAt > ROOM_LIMITS.ROOM_IDLE_TTL_MS;

      if (finishedExpired || idleExpired) {
        if (idleExpired && !isTerminal && io) {
          room.state = GAME_STATES.CANCELLED;
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, this.serializeRoomState(room));
        }
        this.deleteRoom(roomCode);
        console.log(`[CLEANUP] Room ${roomCode} dihapus (TTL kadaluarsa).`);
      }
    }
  }

  syncLobbyReadyState(room) {
    if (room.state !== GAME_STATES.WAITING && room.state !== GAME_STATES.LOBBY_READY) {
      return;
    }
    const check = canStartGame(room);
    room.state = check.ok ? GAME_STATES.LOBBY_READY : GAME_STATES.WAITING;
  }

  serializeRoomState(room) {
    const startCheck = canStartGame(room);
    const poll = room.gameProgress.poll;
    const totalVotes = poll.honestCount + poll.lieCount;

    return {
      roomCode: room.roomCode,
      state: room.state,
      pausedByHostDisconnect: room.pausedByHostDisconnect,
      hostDisconnectDeadline: room.hostDisconnectDeadline,
      canStart: startCheck.ok,
      startBlockReason: startCheck.ok ? null : startCheck.reason,
      spectatorCount: this.getConnectedSpectatorCount(room),
      host: {
        id: room.host.id,
        name: room.host.name,
        connected: room.host.connected,
        avatar: room.host.avatar
      },
      players: room.players.map((p, idx) =>
        p
          ? {
              id: p.id,
              slotIndex: p.slotIndex,
              name: p.name,
              ready: p.ready,
              connected: p.connected,
              spectatorOnly: p.spectatorOnly,
              avatar: p.avatar
            }
          : {
              id: `P${idx + 1}`,
              slotIndex: idx + 1,
              empty: true
            }
      ),
      punishments: [...room.punishments],
      gameProgress: {
        round: room.gameProgress.round,
        turnNumber: room.gameProgress.currentTurnIndex + 1,
        totalQuestions: GAME_CONFIG.TOTAL_QUESTIONS,
        totalRounds: GAME_CONFIG.TOTAL_ROUNDS,
        completedTurns: room.gameProgress.completedTurns,
        activeSlot: room.gameProgress.activeSlot,
        activePlayerId: room.gameProgress.activePlayerId,
        currentQuestion: room.gameProgress.currentQuestion,
        questionDeadline: room.gameProgress.questionDeadline,
        skipCount: room.gameProgress.skipCount,
        maxSkips: GAME_CONFIG.MAX_SKIPS,
        lastAnswer: room.gameProgress.lastAnswer,
        wheelResult: room.gameProgress.wheelResult,
        wheelSpun: room.gameProgress.wheelSpun,
        poll: {
          active: poll.active,
          honestCount: poll.honestCount,
          lieCount: poll.lieCount,
          totalVotes
        }
      }
    };
  }
}

export const roomManager = new RoomManager();
