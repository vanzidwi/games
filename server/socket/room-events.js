import { GAME_STATES, ROLES } from '../../shared/constants.js';
import { SOCKET_EVENTS } from '../../shared/event-names.js';
import { canStartGame } from '../game/game-rules.js';
import { RateLimiter, validateDisplayName, validateRoomCode } from '../game/validators.js';
import { playerManager } from '../managers/player-manager.js';
import { punishmentManager } from '../managers/punishment-manager.js';
import { roomManager } from '../managers/room-manager.js';
import { startNextTurn } from './game-events.js';

const roomLimiter = new RateLimiter();

export function registerRoomEvents(io, socket) {
  // Buat Room (Host)
  socket.on(SOCKET_EVENTS.ROOM_CREATE, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!roomLimiter.allow(`${socket.id}:create`, 4, 10000)) {
      return reply({ ok: false, error: 'Terlalu sering membuat room. Tunggu sebentar.' });
    }

    const nameCheck = validateDisplayName(payload.hostName);
    if (!nameCheck.valid) {
      return reply({ ok: false, error: nameCheck.error });
    }

    const { room, sessionToken } = roomManager.createRoom(nameCheck.value, socket.id);
    socket.join(room.roomCode);

    const state = roomManager.serializeRoomState(room);
    socket.emit(SOCKET_EVENTS.ROOM_STATE, state);

    return reply({
      ok: true,
      roomCode: room.roomCode,
      role: ROLES.HOST,
      slotIndex: 0,
      sessionToken,
      overlayToken: room.overlayToken,
      state
    });
  });

  // Gabung Room (Player)
  socket.on(SOCKET_EVENTS.ROOM_JOIN, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!roomLimiter.allow(`${socket.id}:join`, 6, 10000)) {
      return reply({ ok: false, error: 'Terlalu banyak percobaan bergabung.' });
    }

    const nameCheck = validateDisplayName(payload.playerName);
    if (!nameCheck.valid) {
      return reply({ ok: false, error: nameCheck.error });
    }

    const codeCheck = validateRoomCode(payload.roomCode);
    if (!codeCheck.valid) {
      return reply({ ok: false, error: codeCheck.error });
    }

    const room = roomManager.getRoom(codeCheck.value);
    if (!room) {
      return reply({ ok: false, error: 'Room tidak ditemukan. Periksa kembali kode room.' });
    }

    if (room.state !== GAME_STATES.WAITING && room.state !== GAME_STATES.LOBBY_READY) {
      return reply({ ok: false, error: 'Pertandingan sudah dimulai. Tidak dapat bergabung.' });
    }

    const added = playerManager.addPlayer(room, nameCheck.value, socket.id);
    if (!added.ok) {
      return reply({ ok: false, error: added.error });
    }

    roomManager.bindSocket(socket.id, room.roomCode, ROLES.PLAYER, added.player.slotIndex);
    socket.join(room.roomCode);
    roomManager.syncLobbyReadyState(room);

    const state = roomManager.serializeRoomState(room);
    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, state);

    return reply({
      ok: true,
      roomCode: room.roomCode,
      role: ROLES.PLAYER,
      slotIndex: added.player.slotIndex,
      sessionToken: added.player.sessionToken,
      state
    });
  });

  // Gabung sebagai OBS Overlay (read-only)
  socket.on('overlay:join', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const codeCheck = validateRoomCode(payload.roomCode);
    if (!codeCheck.valid) {
      return reply({ ok: false, error: codeCheck.error });
    }

    const room = roomManager.getRoom(codeCheck.value);
    if (!room) {
      return reply({ ok: false, error: 'Room tidak ditemukan.' });
    }

    if (typeof payload.overlayToken !== 'string' || payload.overlayToken !== room.overlayToken) {
      return reply({ ok: false, error: 'Token overlay tidak valid.' });
    }

    roomManager.bindSocket(socket.id, room.roomCode, ROLES.OVERLAY, -1);
    socket.join(room.roomCode);

    return reply({
      ok: true,
      role: ROLES.OVERLAY,
      state: roomManager.serializeRoomState(room)
    });
  });

  // Keluar Room
  socket.on(SOCKET_EVENTS.ROOM_LEAVE, (_payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const binding = roomManager.unbindSocket(socket.id);
    if (!binding) return reply({ ok: true });

    const room = roomManager.getRoom(binding.roomCode);
    socket.leave(binding.roomCode);

    if (!room) return reply({ ok: true });

    if (binding.role === ROLES.HOST) {
      room.state = GAME_STATES.CANCELLED;
      io.to(room.roomCode).emit(SOCKET_EVENTS.GAME_OVER, {
        winner: null,
        reason: 'HOST_LEFT'
      });
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
      roomManager.deleteRoom(room.roomCode);
    } else if (binding.role === ROLES.PLAYER) {
      if (room.state === GAME_STATES.WAITING || room.state === GAME_STATES.LOBBY_READY) {
        playerManager.removePlayerFromLobby(room, binding.slotIndex);
        roomManager.syncLobbyReadyState(room);
        io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
      } else {
        const player = room.players[binding.slotIndex - 1];
        if (player) {
          player.connected = false;
          player.spectatorOnly = true;
          io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
        }
      }
    }

    return reply({ ok: true });
  });

  // Player toggle status SIAP
  socket.on(SOCKET_EVENTS.PLAYER_READY, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const binding = roomManager.getSocketBinding(socket.id);
    if (!binding || binding.role !== ROLES.PLAYER) {
      return reply({ ok: false, error: 'Hanya Player yang dapat mengubah status siap.' });
    }

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return reply({ ok: false, error: 'Room tidak ditemukan.' });
    if (room.state !== GAME_STATES.WAITING && room.state !== GAME_STATES.LOBBY_READY) {
      return reply({ ok: false, error: 'Permainan sudah dimulai.' });
    }

    playerManager.setPlayerReady(room, binding.slotIndex, Boolean(payload.ready));
    roomManager.syncLobbyReadyState(room);

    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    return reply({ ok: true });
  });

  // Host memperbarui daftar hukuman (2..12)
  socket.on(SOCKET_EVENTS.PUNISHMENT_UPDATE, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const binding = roomManager.getSocketBinding(socket.id);
    if (!binding || binding.role !== ROLES.HOST) {
      return reply({ ok: false, error: 'Hanya Host yang dapat mengatur daftar hukuman.' });
    }

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return reply({ ok: false, error: 'Room tidak ditemukan.' });

    const res = punishmentManager.updatePunishments(room, payload.punishments);
    if (!res.ok) {
      return reply({ ok: false, error: res.error });
    }

    roomManager.syncLobbyReadyState(room);
    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    return reply({ ok: true, punishments: res.punishments });
  });

  // Host memulai pertandingan
  socket.on(SOCKET_EVENTS.GAME_START, (_payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const binding = roomManager.getSocketBinding(socket.id);
    if (!binding || binding.role !== ROLES.HOST) {
      return reply({ ok: false, error: 'Hanya Host yang dapat memulai permainan.' });
    }

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return reply({ ok: false, error: 'Room tidak ditemukan.' });

    const check = canStartGame(room);
    if (!check.ok) {
      return reply({ ok: false, error: check.reason });
    }

    startNextTurn(io, room);
    return reply({ ok: true });
  });
}
