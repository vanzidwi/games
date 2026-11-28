import { AVATAR_ACCESSORIES, AVATAR_COLORS, GAME_CONFIG, GAME_STATES } from '../../shared/constants.js';
import { SOCKET_EVENTS } from '../../shared/event-names.js';
import { transitionGameState } from './game-state.js';
import { generateSessionToken } from './game-rules.js';
import { timerManager } from '../managers/timer-manager.js';

const BOT_NAMES = ['Bot Andi', 'Bot Budi', 'Bot Citra', 'Bot Doni', 'Bot Eka'];

const BOT_QUESTIONS = [
  'Apakah kamu pernah ketiduran pas lagi meeting atau kelas online?',
  'Apakah kamu tim bubur ayam diaduk?',
  'Apakah kamu pernah pura-pura sibuk biar nggak disuruh-suruh?',
  'Apakah kamu pernah salah kirim chat ke grup keluarga?',
  'Apakah kamu suka makan mi instan pakai nasi?',
  'Apakah kamu pernah lupa nama orang yang baru saja kenalan?',
  'Apakah kamu pernah stalking mantan pakai akun kedua?',
  'Apakah kamu sering bilang "OTW" padahal baru bangun tidur?',
  'Apakah kamu pernah ketawa padahal nggak ngerti ceritanya?',
  'Apakah kamu pernah nyanyi keras-keras pas lagi mandi?'
];

export function fillRoomWithBots(room) {
  let added = 0;
  for (let i = 0; i < GAME_CONFIG.MAX_PLAYERS; i += 1) {
    if (room.players[i] === null) {
      const slotNumber = i + 1;
      const acc = AVATAR_ACCESSORIES[slotNumber % AVATAR_ACCESSORIES.length]?.id || 'none';
      const color = AVATAR_COLORS[slotNumber % AVATAR_COLORS.length] || '#3b82f6';
      room.players[i] = {
        id: `P${slotNumber}`,
        slotIndex: slotNumber,
        name: BOT_NAMES[i] || `Bot ${slotNumber}`,
        sessionToken: generateSessionToken(),
        socketId: `bot-socket-${room.roomCode}-${slotNumber}`,
        ready: true,
        connected: true,
        spectatorOnly: false,
        isBot: true,
        avatar: { color, accessory: acc }
      };
      added += 1;
    } else if (room.players[i] && !room.players[i].ready) {
      room.players[i].ready = true;
    }
  }

  if (room.punishments.length < GAME_CONFIG.MIN_PUNISHMENTS) {
    const defaults = ['Push up 5 kali', 'Nyanyi lagu anak-anak 10 detik'];
    for (const item of defaults) {
      if (room.punishments.length < GAME_CONFIG.MIN_PUNISHMENTS) {
        room.punishments.push(item);
      }
    }
  }

  return added;
}

export function scheduleBotQuestion(io, room, expectedTurnIndex, roomManager) {
  setTimeout(() => {
    const latestRoom = roomManager.getRoom(room.roomCode);
    if (
      !latestRoom ||
      latestRoom.state !== GAME_STATES.ASKING ||
      latestRoom.gameProgress.currentTurnIndex !== expectedTurnIndex ||
      latestRoom.pausedByHostDisconnect
    ) {
      return;
    }

    const question = BOT_QUESTIONS[expectedTurnIndex % BOT_QUESTIONS.length];
    timerManager.clearQuestionTimer(latestRoom.roomCode);
    latestRoom.gameProgress.questionDeadline = null;
    latestRoom.gameProgress.currentQuestion = question;
    latestRoom.gameProgress.answerLocked = false;
    latestRoom.gameProgress.pendingTurnAdvance = false;

    latestRoom.gameProgress.poll = {
      active: true,
      honestCount: 0,
      lieCount: 0,
      voters: new Set(),
      voterIps: new Set()
    };

    transitionGameState(latestRoom, GAME_STATES.ANSWERING);

    io.to(latestRoom.roomCode).emit(SOCKET_EVENTS.QUESTION_RECEIVED, {
      activePlayerId: latestRoom.gameProgress.activePlayerId,
      slotIndex: latestRoom.gameProgress.activeSlot,
      question
    });

    io.to(latestRoom.roomCode).emit(SOCKET_EVENTS.CHARACTER_ANIMATION, {
      targetId: latestRoom.gameProgress.activePlayerId,
      animation: 'ask'
    });

    io.to(latestRoom.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.serializeRoomState(latestRoom));
  }, 1500);
}
