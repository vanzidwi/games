import { ANSWERS, ENABLE_TEST_BOTS, GAME_CONFIG, GAME_STATES, POLL_OPTIONS, ROLES } from '../../shared/constants.js';
import { SOCKET_EVENTS } from '../../shared/event-names.js';
import { transitionGameState } from '../game/game-state.js';
import { scheduleBotQuestion } from '../game/test-bots.js';
import { getClientIp, RateLimiter, validateQuestion } from '../game/validators.js';
import { punishmentManager } from '../managers/punishment-manager.js';
import { roomManager } from '../managers/room-manager.js';
import { timerManager } from '../managers/timer-manager.js';
import { turnManager } from '../managers/turn-manager.js';

const actionLimiter = new RateLimiter();

export function startNextTurn(io, room) {
  if (
    room.state === GAME_STATES.HOST_LOST ||
    room.state === GAME_STATES.WHEEL_READY ||
    room.state === GAME_STATES.CANCELLED ||
    room.state === GAME_STATES.FINISHED
  ) {
    return;
  }

  timerManager.clearQuestionTimer(room.roomCode);
  room.gameProgress.pendingTurnAdvance = false;

  // Reset polling penonton setiap pergantian giliran
  room.gameProgress.poll = {
    active: false,
    honestCount: 0,
    lieCount: 0,
    voters: new Set(),
    voterIps: new Set()
  };

  const next = turnManager.advanceToNextValidTurn(room);
  if (next.done) {
    transitionGameState(room, GAME_STATES.HOST_WON);
    roomManager.markRoomFinished(room);
    room.gameProgress.questionDeadline = null;
    room.gameProgress.activePlayerId = null;
    room.gameProgress.activeSlot = null;

    io.to(room.roomCode).emit(SOCKET_EVENTS.GAME_OVER, {
      winner: 'HOST',
      reason: 'ALL_TURNS_COMPLETED',
      skipCount: room.gameProgress.skipCount
    });
    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    return;
  }

  const { meta } = next;
  transitionGameState(room, GAME_STATES.ASKING);
  room.gameProgress.answerLocked = false;

  const expectedTurnIndex = meta.turnIndex;
  const deadline = timerManager.startQuestionTimer(
    room.roomCode,
    GAME_CONFIG.QUESTION_TIME_LIMIT_MS,
    () => {
      if (
        room.state === GAME_STATES.ASKING &&
        room.gameProgress.currentTurnIndex === expectedTurnIndex &&
        !room.pausedByHostDisconnect
      ) {
        io.to(room.roomCode).emit(SOCKET_EVENTS.GAME_TURN_CHANGED, {
          reason: 'QUESTION_TIMEOUT',
          skippedPlayerId: meta.activePlayerId
        });
        startNextTurn(io, room);
      }
    }
  );

  room.gameProgress.questionDeadline = deadline;

  io.to(room.roomCode).emit(SOCKET_EVENTS.TURN_START, {
    round: meta.round,
    turnNumber: meta.turnNumber,
    slotIndex: meta.slotIndex,
    activePlayerId: meta.activePlayerId,
    deadline
  });

  io.to(room.roomCode).emit(SOCKET_EVENTS.CHARACTER_LOOK_AT, {
    targetPlayerId: meta.activePlayerId,
    slotIndex: meta.slotIndex
  });

  io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));

  const activePlayer = room.players[meta.slotIndex - 1];
  if (ENABLE_TEST_BOTS && activePlayer?.isBot) {
    scheduleBotQuestion(io, room, meta.turnIndex, roomManager);
  }
}

export function registerGameEvents(io, socket) {
  // Player mengirim pertanyaan pada gilirannya
  socket.on(SOCKET_EVENTS.QUESTION_SUBMIT, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!actionLimiter.allow(`${socket.id}:question`, 5, 3000)) {
      return reply({ ok: false, error: 'Terlalu banyak permintaan. Coba lagi.' });
    }

    const binding = roomManager.getSocketBinding(socket.id);
    if (!binding || binding.role !== ROLES.PLAYER) {
      return reply({ ok: false, error: 'Hanya Player yang dapat mengirim pertanyaan.' });
    }

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return reply({ ok: false, error: 'Room tidak ditemukan.' });
    if (room.pausedByHostDisconnect) {
      return reply({ ok: false, error: 'Permainan dijeda karena Host terputus.' });
    }
    if (room.state !== GAME_STATES.ASKING) {
      return reply({ ok: false, error: 'Bukan fase mengirim pertanyaan.' });
    }
    if (room.gameProgress.activeSlot !== binding.slotIndex) {
      return reply({ ok: false, error: 'Bukan giliran Anda untuk bertanya.' });
    }

    const validation = validateQuestion(payload.question);
    if (!validation.valid) {
      return reply({ ok: false, error: validation.error });
    }

    timerManager.clearQuestionTimer(room.roomCode);
    room.gameProgress.questionDeadline = null;
    room.gameProgress.currentQuestion = validation.value;
    room.gameProgress.answerLocked = false;
    room.gameProgress.pendingTurnAdvance = false;

    room.gameProgress.poll = {
      active: true,
      honestCount: 0,
      lieCount: 0,
      voters: new Set(),
      voterIps: new Set()
    };

    transitionGameState(room, GAME_STATES.ANSWERING);

    io.to(room.roomCode).emit(SOCKET_EVENTS.QUESTION_RECEIVED, {
      activePlayerId: room.gameProgress.activePlayerId,
      slotIndex: room.gameProgress.activeSlot,
      question: validation.value
    });

    io.to(room.roomCode).emit(SOCKET_EVENTS.CHARACTER_ANIMATION, {
      targetId: room.gameProgress.activePlayerId,
      animation: 'ask'
    });

    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    return reply({ ok: true });
  });

  // Penonton mengirim vote Jujur/Bohong
  socket.on(SOCKET_EVENTS.POLL_VOTE, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!actionLimiter.allow(`${socket.id}:poll`, 4, 3000)) {
      return reply({ ok: false, error: 'Terlalu cepat.' });
    }

    const binding = roomManager.getSocketBinding(socket.id);
    if (!binding) return reply({ ok: false, error: 'Tidak terhubung ke room.' });

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return reply({ ok: false, error: 'Room tidak ditemukan.' });

    const isSpectator = binding.role === ROLES.SPECTATOR;
    const isSpectatorPlayer =
      binding.role === ROLES.PLAYER && room.players[binding.slotIndex - 1]?.spectatorOnly;

    if (!isSpectator && !isSpectatorPlayer) {
      return reply({ ok: false, error: 'Polling hanya untuk Penonton.' });
    }

    const poll = room.gameProgress.poll;
    if (!poll.active) {
      return reply({ ok: false, error: 'Polling belum dibuka.' });
    }

    const clientIp = getClientIp(socket);
    const voterKey = binding.sessionToken || socket.id;
    if (poll.voters.has(voterKey) || (clientIp !== 'unknown' && poll.voterIps.has(clientIp))) {
      return reply({ ok: false, error: 'Anda sudah memilih pada pertanyaan ini.' });
    }

    if (payload.option === POLL_OPTIONS.HONEST) {
      poll.honestCount += 1;
    } else if (payload.option === POLL_OPTIONS.LIE) {
      poll.lieCount += 1;
    } else {
      return reply({ ok: false, error: 'Pilihan polling tidak valid.' });
    }

    poll.voters.add(voterKey);
    if (clientIp !== 'unknown') poll.voterIps.add(clientIp);
    roomManager.touchRoom(room);

    const summary = {
      active: poll.active,
      honestCount: poll.honestCount,
      lieCount: poll.lieCount,
      totalVotes: poll.honestCount + poll.lieCount
    };

    io.to(room.roomCode).emit(SOCKET_EVENTS.POLL_UPDATE, summary);
    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
    return reply({ ok: true, poll: summary });
  });

  // Host mengirim jawaban (YA / TIDAK / LEWATI)
  socket.on(SOCKET_EVENTS.ANSWER_SUBMIT, (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!actionLimiter.allow(`${socket.id}:answer`, 5, 2000)) {
      return reply({ ok: false, error: 'Terlalu cepat. Tunggu sebentar.' });
    }

    const binding = roomManager.getSocketBinding(socket.id);
    if (!binding || binding.role !== ROLES.HOST) {
      return reply({ ok: false, error: 'Hanya Host yang dapat menjawab pertanyaan.' });
    }

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return reply({ ok: false, error: 'Room tidak ditemukan.' });
    if (room.pausedByHostDisconnect) {
      return reply({ ok: false, error: 'Permainan sedang dijeda.' });
    }
    if (room.state !== GAME_STATES.ANSWERING || room.gameProgress.answerLocked) {
      return reply({ ok: false, error: 'Tidak ada pertanyaan aktif yang menunggu jawaban.' });
    }

    const answer = payload.answer;
    if (![ANSWERS.YES, ANSWERS.NO, ANSWERS.SKIP].includes(answer)) {
      return reply({ ok: false, error: 'Pilihan jawaban tidak valid.' });
    }

    roomManager.touchRoom(room);
    room.gameProgress.answerLocked = true;
    room.gameProgress.lastAnswer = answer;

    const activePlayer = room.players[(room.gameProgress.activeSlot || 1) - 1];
    const currentPoll = room.gameProgress.poll || { honestCount: 0, lieCount: 0 };
    room.gameProgress.questionHistory.push({
      turnNumber: room.gameProgress.currentTurnIndex + 1,
      playerName: activePlayer?.name || room.gameProgress.activePlayerId || '-',
      question: room.gameProgress.currentQuestion || '-',
      answer,
      poll: {
        honestCount: currentPoll.honestCount,
        lieCount: currentPoll.lieCount,
        totalVotes: currentPoll.honestCount + currentPoll.lieCount
      }
    });

    const animMap = {
      [ANSWERS.YES]: 'nod',
      [ANSWERS.NO]: 'shake',
      [ANSWERS.SKIP]: 'nervous'
    };

    io.to(room.roomCode).emit(SOCKET_EVENTS.CHARACTER_ANIMATION, {
      targetId: 'HOST',
      animation: animMap[answer]
    });

    if (answer === ANSWERS.SKIP) {
      room.gameProgress.skipCount += 1;

      io.to(room.roomCode).emit(SOCKET_EVENTS.SKIP_UPDATE, {
        skipCount: room.gameProgress.skipCount,
        maxSkips: GAME_CONFIG.MAX_SKIPS
      });

      if (room.gameProgress.skipCount >= GAME_CONFIG.MAX_SKIPS) {
        room.gameProgress.currentQuestion = null;
        room.gameProgress.poll.active = false;
        room.gameProgress.pendingTurnAdvance = false;
        transitionGameState(room, GAME_STATES.HOST_LOST);
        transitionGameState(room, GAME_STATES.WHEEL_READY);

        io.to(room.roomCode).emit(SOCKET_EVENTS.CHARACTER_ANIMATION, {
          targetId: 'HOST',
          animation: 'defeat'
        });

        io.to(room.roomCode).emit(SOCKET_EVENTS.ANSWER_RESULT, {
          answer,
          skipCount: room.gameProgress.skipCount,
          hostLost: true
        });

        io.to(room.roomCode).emit(SOCKET_EVENTS.GAME_OVER, {
          winner: 'PLAYERS',
          reason: 'MAX_SKIPS_REACHED',
          skipCount: room.gameProgress.skipCount
        });

        io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));
        return reply({ ok: true, hostLost: true });
      }
    }

    room.gameProgress.completedTurns += 1;
    room.gameProgress.currentQuestion = null;
    // Tandai bahwa giliran berikutnya menunggu dieksekusi (agar tidak macet jika Host putus di jeda 1.8s)
    room.gameProgress.pendingTurnAdvance = true;

    io.to(room.roomCode).emit(SOCKET_EVENTS.ANSWER_RESULT, {
      answer,
      activePlayerId: room.gameProgress.activePlayerId,
      skipCount: room.gameProgress.skipCount,
      hostLost: false
    });

    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));

    setTimeout(() => {
      const latestRoom = roomManager.getRoom(room.roomCode);
      if (
        latestRoom &&
        latestRoom.state === GAME_STATES.ANSWERING &&
        latestRoom.gameProgress.pendingTurnAdvance &&
        !latestRoom.pausedByHostDisconnect
      ) {
        startNextTurn(io, latestRoom);
      }
    }, 1800);

    return reply({ ok: true, hostLost: false });
  });

  // Host memutar roda hukuman
  socket.on(SOCKET_EVENTS.WHEEL_SPIN, (_payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const binding = roomManager.getSocketBinding(socket.id);
    if (!binding || binding.role !== ROLES.HOST) {
      return reply({ ok: false, error: 'Hanya Host yang dapat memutar roda hukuman.' });
    }

    const room = roomManager.getRoom(binding.roomCode);
    if (!room) return reply({ ok: false, error: 'Room tidak ditemukan.' });
    if (room.state !== GAME_STATES.WHEEL_READY || room.gameProgress.wheelSpun) {
      return reply({ ok: false, error: 'Roda hukuman belum siap atau sudah diputar.' });
    }

    room.gameProgress.wheelSpun = true;
    transitionGameState(room, GAME_STATES.WHEEL_SPINNING);

    const result = punishmentManager.pickRandomPunishment(room);
    room.gameProgress.wheelResult = {
      index: result.index,
      text: result.text,
      totalSectors: room.punishments.length
    };

    io.to(room.roomCode).emit(SOCKET_EVENTS.WHEEL_RESULT, room.gameProgress.wheelResult);
    io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(room));

    setTimeout(() => {
      const latestRoom = roomManager.getRoom(room.roomCode);
      if (latestRoom && latestRoom.state === GAME_STATES.WHEEL_SPINNING) {
        transitionGameState(latestRoom, GAME_STATES.PUNISHMENT_RESULT);
        roomManager.markRoomFinished(latestRoom);
        io.to(latestRoom.roomCode).emit(
          SOCKET_EVENTS.ROOM_STATE,
          roomManager.serializeRoomState(latestRoom)
        );
      }
    }, 4800);

    return reply({ ok: true, result: room.gameProgress.wheelResult });
  });
}
