import { AVATAR_ACCESSORIES, AVATAR_COLORS, ENABLE_TEST_BOTS, GAME_STATES, ROLES } from '../../shared/constants.js';
import { SOCKET_EVENTS } from '../../shared/event-names.js';
import { canStartGame } from '../game/game-rules.js';
import { fillRoomWithBots } from '../game/test-bots.js';
import {
  getClientIp,
  RateLimiter,
  validateDisplayName,
  validateRoomCode
} from '../game/validators.js';
import { playerManager } from '../managers/player-manager.js';
import { punishmentManager } from '../managers/punishment-manager.js';
import { ROOM_LIMITS, roomManager } from '../managers/room-manager.js';
import { startNextTurn } from './game-events.js';

const roomLimiter = new RateLimiter();

export function registerRoomEvents(io, socket) {
  const clientIp = getClientIp(socket);

  // Buat Room (Host)
  socket.on(SOCKET_EVENTS.ROOM_CREATE, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!roomLimiter.allow(`ip:${clientIp}:create`, 5, 60000)) {
      return reply({ ok: false, error: 'Terlalu sering membuat room. Coba lagi 1 menit.' });
    }

    if (roomManager.rooms.size >= ROOM_LIMITS.MAX_TOTAL_ROOMS) {
      return reply({ ok: false, error: 'Server sedang penuh. Coba lagi beberapa saat.' });
    }

    if (roomManager.countRoomsByIp(clientIp) >= ROOM_LIMITS.MAX_ROOMS_PER_IP) {
      return reply({
        ok: false,
        error: `Maksimal ${ROOM_LIMITS.MAX_ROOMS_PER_IP} room aktif per jaringan.`
      });
    }

    const nameCheck = validateDisplayName(payload.hostName);
    if (!nameCheck.valid) {
      return reply({ ok: false, error: nameCheck.error });
    }

    const { room, sessionToken } = roomManager.createRoom(nameCheck.value, socket.id, clientIp);
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
    if (!roomLimiter.allow(`ip:${clientIp}:join`, 10, 30000)) {
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
      return reply({
        ok: false,
        canSpectate: true,
        error: 'Pertandingan sudah dimulai. Anda bisa masuk sebagai Penonton.'
      });
    }

    const added = playerManager.addPlayer(room, nameCheck.value, socket.id);
    if (!added.ok) {
      return reply({
        ok: false,
        canSpectate: true,
        error: `${added.error} Anda bisa masuk sebagai Penonton.`
      });
    }

    roomManager.touchRoom(room);
    roomManager.bindSocket(
      socket.id,
      room.roomCode,
      ROLES.PLAYER,
      added.player.slotIndex,
      added.player.sessionToken
    );
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

  // Gabung Room sebagai Penonton (Spectator)
  socket.on(SOCKET_EVENTS.SPECTATOR_JOIN, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!roomLimiter.allow(`ip:${clientIp}:spectate`, 10, 30000)) {
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
    if (!room || room.state === GAME_STATES.CANCELLED || room.state === GAME_STATES.FINISHED) {
      return reply({ ok: false, error: 'Room tidak ditemukan atau sudah berakhir.' });
    }

    if (room.spectators.size >= ROOM_LIMITS.MAX_SPECTATORS_PER_ROOM) {
      return reply({ ok: false, error: 'Kapasitas penonton di room ini sudah penuh.' });
    }

    roomManager.touchRoom(room);
    const spectator = roomManager.addOrReuseSpectator(room, nameCheck.value, socket.id, clientIp);
    socket.join(room.roomCode);

    const state = roomManager.serializeRoomState(room);
    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, state);

    return reply({
      ok: true,
      roomCode: room.roomCode,
      role: ROLES.SPECTATOR,
      slotIndex: -1,
      sessionToken: spectator.sessionToken,
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
    } else if (binding.role === ROLES.SPECTATOR && binding.sessionToken) {
      room.spectators.delete(binding.sessionToken);
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
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

    roomManager.touchRoom(room);
    playerManager.setPlayerReady(room, binding.slotIndex, Boolean(payload.ready));
    roomManager.syncLobbyReadyState(room);

    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    return reply({ ok: true });
  });

  // Host atau Player mengubah warna & aksesori karakter di Lobby
  socket.on(SOCKET_EVENTS.AVATAR_UPDATE, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const binding = roomManager.getSocketBinding(socket.id);
    if (!binding || (binding.role !== ROLES.HOST && binding.role !== ROLES.PLAYER)) {
      return reply({ ok: false, error: 'Hanya Host atau Player yang dapat mengubah karakter.' });
    }

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return reply({ ok: false, error: 'Room tidak ditemukan.' });
    if (room.state !== GAME_STATES.WAITING && room.state !== GAME_STATES.LOBBY_READY) {
      return reply({ ok: false, error: 'Karakter hanya bisa diubah di Lobby.' });
    }

    const target = binding.role === ROLES.HOST ? room.host : room.players[binding.slotIndex - 1];
    if (!target) return reply({ ok: false, error: 'Peserta tidak ditemukan.' });

    const nextAvatar = { ...(target.avatar || { color: '#3b82f6', accessory: 'none' }) };
    if (typeof payload.color === 'string' && AVATAR_COLORS.includes(payload.color)) {
      nextAvatar.color = payload.color;
    }
    if (
      typeof payload.accessory === 'string' &&
      AVATAR_ACCESSORIES.some((a) => a.id === payload.accessory)
    ) {
      nextAvatar.accessory = payload.accessory;
    }

    target.avatar = nextAvatar;
    roomManager.touchRoom(room);
    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    return reply({ ok: true, avatar: nextAvatar });
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

    roomManager.touchRoom(room);
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

    roomManager.touchRoom(room);
    startNextTurn(io, room);
    return reply({ ok: true });
  });
}
