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
      timerManager.clearLobbyDisconnectTimer(room.roomCode, 'HOST');
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

        // Jika Host putus tepat setelah menjawab (dalam jeda 1.8s), lanjutkan giliran yang tertunda
        if (room.state === GAME_STATES.ANSWERING && room.gameProgress.pendingTurnAdvance) {
          startNextTurn(io, room);
        }
      }

      roomManager.syncLobbyReadyState(room);
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
      timerManager.clearLobbyDisconnectTimer(room.roomCode, `P${player.slotIndex}`);
      timerManager.clearLobbyDisconnectTimer(room.roomCode, `TURN_P${player.slotIndex}`);
      player.socketId = socket.id;
      player.connected = true;
      roomManager.bindSocket(socket.id, room.roomCode, ROLES.PLAYER, player.slotIndex, sessionToken);
      socket.join(room.roomCode);

      roomManager.syncLobbyReadyState(room);
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

      // Di Lobby: beri masa tenggang 45 detik sebelum room dibatalkan
      if (room.state === GAME_STATES.WAITING || room.state === GAME_STATES.LOBBY_READY) {
        roomManager.syncLobbyReadyState(room);
        io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));

        timerManager.startLobbyDisconnectTimer(
          room.roomCode,
          'HOST',
          GAME_CONFIG.LOBBY_RECONNECT_TIMEOUT_MS,
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

      // Di Lobby: beri masa tenggang 45 detik sebelum slot dikosongkan
      if (room.state === GAME_STATES.WAITING || room.state === GAME_STATES.LOBBY_READY) {
        player.connected = false;
        roomManager.syncLobbyReadyState(room);
        io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));

        const slotIdx = player.slotIndex;
        timerManager.startLobbyDisconnectTimer(
          room.roomCode,
          `P${slotIdx}`,
          GAME_CONFIG.LOBBY_RECONNECT_TIMEOUT_MS,
          () => {
            const latestRoom = roomManager.getRoom(room.roomCode);
            if (!latestRoom) return;
            const latestPlayer = latestRoom.players[slotIdx - 1];
            if (
              latestPlayer &&
              !latestPlayer.connected &&
              (latestRoom.state === GAME_STATES.WAITING ||
                latestRoom.state === GAME_STATES.LOBBY_READY)
            ) {
              playerManager.removePlayerFromLobby(latestRoom, slotIdx);
              roomManager.syncLobbyReadyState(latestRoom);
              io.to(latestRoom.roomCode).emit(
                SOCKET_EVENTS.ROOM_STATE,
                roomManager.serializeRoomState(latestRoom)
              );
            }
          }
        );
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
        const slotIdx = player.slotIndex;
        const expectedTurn = room.gameProgress.currentTurnIndex;
        timerManager.startLobbyDisconnectTimer(
          room.roomCode,
          `TURN_P${slotIdx}`,
          10000,
          () => {
            const latestRoom = roomManager.getRoom(room.roomCode);
            if (!latestRoom || latestRoom.pausedByHostDisconnect) return;
            const latestPlayer = latestRoom.players[slotIdx - 1];
            if (
              latestPlayer &&
              !latestPlayer.connected &&
              latestRoom.state === GAME_STATES.ASKING &&
              latestRoom.gameProgress.activeSlot === slotIdx &&
              latestRoom.gameProgress.currentTurnIndex === expectedTurn
            ) {
              latestPlayer.spectatorOnly = true;
              latestRoom.gameProgress.currentQuestion = null;
              startNextTurn(io, latestRoom);
            }
          }
        );
      }

      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    }
  });
}
