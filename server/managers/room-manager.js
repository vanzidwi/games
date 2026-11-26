import { GAME_CONFIG, GAME_STATES, ROLES } from '../../shared/constants.js';
import { canStartGame, generateRoomCode, generateSessionToken } from '../game/game-rules.js';
import { timerManager } from './timer-manager.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.socketIndex = new Map(); // socketId -> { roomCode, role, slotIndex }
  }

  createRoom(hostName, hostSocketId) {
    const existingCodes = new Set(this.rooms.keys());
    const roomCode = generateRoomCode(existingCodes);
    const hostToken = generateSessionToken();
    const overlayToken = generateSessionToken();

    const room = {
      roomCode,
      state: GAME_STATES.WAITING,
      createdAt: Date.now(),
      overlayToken,
      pausedByHostDisconnect: false,
      hostDisconnectDeadline: null,
      pausedRemainingQuestionMs: null,
      host: {
        id: 'HOST',
        name: hostName,
        sessionToken: hostToken,
        socketId: hostSocketId,
        connected: true
      },
      players: Array(GAME_CONFIG.MAX_PLAYERS).fill(null),
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
        wheelResult: null,
        wheelSpun: false
      }
    };

    this.rooms.set(roomCode, room);
    this.bindSocket(hostSocketId, roomCode, ROLES.HOST, 0);

    return { room, sessionToken: hostToken };
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(String(roomCode).trim().toUpperCase()) || null;
  }

  bindSocket(socketId, roomCode, role, slotIndex = 0) {
    this.socketIndex.set(socketId, { roomCode, role, slotIndex });
  }

  unbindSocket(socketId) {
    const info = this.socketIndex.get(socketId) || null;
    this.socketIndex.delete(socketId);
    return info;
  }

  getSocketBinding(socketId) {
    return this.socketIndex.get(socketId) || null;
  }

  deleteRoom(roomCode) {
    timerManager.clearAllForRoom(roomCode);
    const room = this.rooms.get(roomCode);
    if (room) {
      if (room.host.socketId) this.socketIndex.delete(room.host.socketId);
      for (const p of room.players) {
        if (p?.socketId) this.socketIndex.delete(p.socketId);
      }
    }
    this.rooms.delete(roomCode);
  }

  /**
   * Memperbarui state lobby antara WAITING dan LOBBY_READY secara otomatis.
   */
  syncLobbyReadyState(room) {
    if (room.state !== GAME_STATES.WAITING && room.state !== GAME_STATES.LOBBY_READY) {
      return;
    }
    const check = canStartGame(room);
    room.state = check.ok ? GAME_STATES.LOBBY_READY : GAME_STATES.WAITING;
  }

  /**
   * Menyusun state publik room yang aman dikirim ke semua client (tanpa sessionToken).
   */
  serializeRoomState(room) {
    const startCheck = canStartGame(room);

    return {
      roomCode: room.roomCode,
      state: room.state,
      pausedByHostDisconnect: room.pausedByHostDisconnect,
      hostDisconnectDeadline: room.hostDisconnectDeadline,
      canStart: startCheck.ok,
      startBlockReason: startCheck.ok ? null : startCheck.reason,
      host: {
        id: room.host.id,
        name: room.host.name,
        connected: room.host.connected
      },
      players: room.players.map((p, idx) =>
        p
          ? {
              id: p.id,
              slotIndex: p.slotIndex,
              name: p.name,
              ready: p.ready,
              connected: p.connected,
              spectatorOnly: p.spectatorOnly
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
        wheelSpun: room.gameProgress.wheelSpun
      }
    };
  }
}

export const roomManager = new RoomManager();
