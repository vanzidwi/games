import { GAME_CONFIG, GAME_STATES, ROLES } from '../../shared/constants.js';
import { SOCKET_EVENTS } from '../../shared/event-names.js';
import { playerManager } from '../managers/player-manager.js';
import { roomManager } from '../managers/room-manager.js';
import { timerManager } from '../managers/timer-manager.js';
import { startNextTurn } from './game-events.js';

export function registerConnectionEvents(io, socket) {
  console.log(`[SOCKET] Client terhubung: ${socket.id} (Total: ${io.engine.clientsCount})`);

  socket.on(SOCKET_EVENTS.SYSTEM_PING, (payload = {}, callback) => {
    const response = {
      serverTime: Date.now(),
      clientTime: typeof payload.clientTime === 'number' ? payload.clientTime : null,
      socketId: socket.id
    };
    if (typeof callback === 'function') callback(response);
    else socket.emit(SOCKET_EVENTS.SYSTEM_PONG, response);
  });

  // Reconnect sesi Host, Player, atau Spectator menggunakan sessionToken
  socket.on(SOCKET_EVENTS.SESSION_RECONNECT, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const { roomCode, sessionToken } = payload;

    const room = roomManager.getRoom(roomCode);
    if (!room || typeof sessionToken !== 'string') {
      return reply({ ok: false, error: 'Sesi atau room tidak ditemukan.' });
    }

    if (room.state === GAME_STATES.CANCELLED) {
      return reply({ ok: false, error: 'Pertandingan telah dibatalkan.' });
    }

    // Cek Host
    if (room.host.sessionToken === sessionToken) {
      room.host.socketId = socket.id;
      room.host.connected = true;
      roomManager.bindSocket(socket.id, room.roomCode, ROLES.HOST, 0, sessionToken);
      socket.join(room.roomCode);

      if (room.pausedByHostDisconnect) {
        timerManager.clearHostDisconnectTimer(room.roomCode);
        room.pausedByHostDisconnect = false;
        room.hostDisconnectDeadline = null;

        if (room.state === GAME_STATES.ASKING && room.pausedRemainingQuestionMs > 0) {
          const remaining = room.pausedRemainingQuestionMs;
          room.pausedRemainingQuestionMs = null;
          const expectedTurn = room.gameProgress.currentTurnIndex;
          room.gameProgress.questionDeadline = timerManager.startQuestionTimer(
            room.roomCode,
            remaining,
            () => {
              if (
                room.state === GAME_STATES.ASKING &&
                room.gameProgress.currentTurnIndex === expectedTurn &&
                !room.pausedByHostDisconnect
              ) {
                startNextTurn(io, room);
              }
            }
          );
        }

        io.to(room.roomCode).emit(SOCKET_EVENTS.HOST_RECONNECTED, {
          hostName: room.host.name
        });
      }

      const state = roomManager.serializeRoomState(room);
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, state);
      return reply({
        ok: true,
        role: ROLES.HOST,
        slotIndex: 0,
        roomCode: room.roomCode,
        overlayToken: room.overlayToken,
        state
      });
    }

    // Cek Player
    const player = playerManager.findPlayerByToken(room, sessionToken);
    if (player) {
      player.socketId = socket.id;
      player.connected = true;
      roomManager.bindSocket(socket.id, room.roomCode, ROLES.PLAYER, player.slotIndex, sessionToken);
      socket.join(room.roomCode);

      const state = roomManager.serializeRoomState(room);
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, state);
      return reply({
        ok: true,
        role: ROLES.PLAYER,
        slotIndex: player.slotIndex,
        roomCode: room.roomCode,
        state
      });
    }

    // Cek Spectator
    const spectator = room.spectators.get(sessionToken);
    if (spectator) {
      spectator.socketId = socket.id;
      spectator.connected = true;
      roomManager.bindSocket(socket.id, room.roomCode, ROLES.SPECTATOR, -1, sessionToken);
      socket.join(room.roomCode);

      const state = roomManager.serializeRoomState(room);
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, state);
      return reply({
        ok: true,
        role: ROLES.SPECTATOR,
        slotIndex: -1,
        roomCode: room.roomCode,
        state
      });
    }

    return reply({ ok: false, error: 'Token sesi tidak valid.' });
  });

  // Penanganan disconnect Host, Player, & Spectator
  socket.on('disconnect', (reason) => {
    console.log(`[SOCKET] Client terputus: ${socket.id} (${reason})`);
    const binding = roomManager.unbindSocket(socket.id);
    if (!binding) return;

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return;

    if (binding.role === ROLES.OVERLAY) {
      return;
    }

    if (binding.role === ROLES.SPECTATOR) {
      if (binding.sessionToken) {
        const spectator = room.spectators.get(binding.sessionToken);
        if (spectator) {
          spectator.connected = false;
          io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
        }
      }
      return;
    }

    if (binding.role === ROLES.HOST) {
      room.host.connected = false;

      if (room.state === GAME_STATES.WAITING || room.state === GAME_STATES.LOBBY_READY) {
        room.state = GAME_STATES.CANCELLED;
        io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
        roomManager.deleteRoom(room.roomCode);
        return;
      }

      room.pausedByHostDisconnect = true;
      if (room.state === GAME_STATES.ASKING && room.gameProgress.questionDeadline) {
        room.pausedRemainingQuestionMs = Math.max(
          1000,
          room.gameProgress.questionDeadline - Date.now()
        );
        timerManager.clearQuestionTimer(room.roomCode);
      }

      const deadline = timerManager.startHostDisconnectTimer(
        room.roomCode,
        GAME_CONFIG.HOST_RECONNECT_TIMEOUT_MS,
        () => {
          const latestRoom = roomManager.getRoom(room.roomCode);
          if (latestRoom && !latestRoom.host.connected) {
            latestRoom.state = GAME_STATES.CANCELLED;
            io.to(latestRoom.roomCode).emit(SOCKET_EVENTS.GAME_OVER, {
              winner: null,
              reason: 'HOST_DISCONNECT_TIMEOUT'
            });
            io.to(latestRoom.roomCode).emit(
              SOCKET_EVENTS.ROOM_STATE,
              roomManager.serializeRoomState(latestRoom)
            );
            roomManager.deleteRoom(latestRoom.roomCode);
          }
        }
      );

      room.hostDisconnectDeadline = deadline;
      io.to(room.roomCode).emit(SOCKET_EVENTS.HOST_DISCONNECTED, { deadline });
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
      return;
    }

    if (binding.role === ROLES.PLAYER) {
      const player = room.players[binding.slotIndex - 1];
      if (!player) return;

      if (room.state === GAME_STATES.WAITING || room.state === GAME_STATES.LOBBY_READY) {
        playerManager.removePlayerFromLobby(room, binding.slotIndex);
        roomManager.syncLobbyReadyState(room);
        io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
        return;
      }

      player.connected = false;
      io.to(room.roomCode).emit(SOCKET_EVENTS.PLAYER_DISCONNECTED, {
        slotIndex: player.slotIndex,
        playerId: player.id
      });

      if (
        room.state === GAME_STATES.ASKING &&
        room.gameProgress.activeSlot === player.slotIndex &&
        !room.pausedByHostDisconnect
      ) {
        player.spectatorOnly = true;
        room.gameProgress.currentQuestion = null;
        startNextTurn(io, room);
        return;
      }

      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    }
  });
}
