import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONFIG, GAME_STATES } from '../../shared/constants.js';
import { canStartGame, isHostWinConditionMet } from '../game/game-rules.js';
import { transitionGameState } from '../game/game-state.js';
import { validateQuestion, validateRoomCode } from '../game/validators.js';
import { playerManager } from '../managers/player-manager.js';
import { punishmentManager } from '../managers/punishment-manager.js';
import { roomManager } from '../managers/room-manager.js';
import { turnManager } from '../managers/turn-manager.js';

test('Room creation, 5-player capacity, and no ambiguous code chars', () => {
  const { room } = roomManager.createRoom('HostTest', 'sock-host');
  assert.equal(room.roomCode.length, 6);
  assert.equal(/[O0I1]/.test(room.roomCode), false);
  assert.equal(validateRoomCode(room.roomCode.toLowerCase()).value, room.roomCode);

  for (let i = 1; i <= 5; i += 1) {
    const res = playerManager.addPlayer(room, `Player${i}`, `sock-${i}`);
    assert.equal(res.ok, true);
    assert.equal(res.player.slotIndex, i);
  }

  const extra = playerManager.addPlayer(room, 'Player6', 'sock-6');
  assert.equal(extra.ok, false);

  roomManager.deleteRoom(room.roomCode);
});

test('Lobby start requirements & punishment validation', () => {
  const { room } = roomManager.createRoom('HostStart', 'sock-h');
  for (let i = 1; i <= 5; i += 1) {
    playerManager.addPlayer(room, `P${i}`, `sock-${i}`);
    playerManager.setPlayerReady(room, i, true);
  }

  // Belum ada hukuman -> gagal start
  assert.equal(canStartGame(room).ok, false);

  // Tambah 1 hukuman -> masih kurang (minimal 2)
  const badPunish = punishmentManager.updatePunishments(room, ['Nyanyi']);
  assert.equal(badPunish.ok, false);

  // Tambah 2 hukuman -> siap start
  const goodPunish = punishmentManager.updatePunishments(room, ['Nyanyi 30 detik', 'Baca pantun']);
  assert.equal(goodPunish.ok, true);
  roomManager.syncLobbyReadyState(room);
  assert.equal(room.state, GAME_STATES.LOBBY_READY);
  assert.equal(canStartGame(room).ok, true);

  roomManager.deleteRoom(room.roomCode);
});

test('Revisi LEWATI maksimal 2 kali & 10 giliran dalam 2 ronde', () => {
  const { room } = roomManager.createRoom('HostPlay', 'sock-h2');
  for (let i = 1; i <= 5; i += 1) {
    playerManager.addPlayer(room, `P${i}`, `sock-${i}`);
    playerManager.setPlayerReady(room, i, true);
  }
  punishmentManager.updatePunishments(room, ['Joget', 'Pantun']);
  roomManager.syncLobbyReadyState(room);

  // Cek urutan 10 giliran
  const seenSlots = [];
  for (let t = 0; t < GAME_CONFIG.TOTAL_QUESTIONS; t += 1) {
    const res = turnManager.advanceToNextValidTurn(room);
    assert.equal(res.done, false);
    seenSlots.push(res.meta.slotIndex);
    room.gameProgress.completedTurns += 1;
  }
  assert.deepEqual(seenSlots, [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
  assert.equal(turnManager.advanceToNextValidTurn(room).done, true);

  // 1 LEWATI masih menang setelah 10 giliran
  room.gameProgress.skipCount = 1;
  assert.equal(isHostWinConditionMet(room), true);

  // LEWATI ke-2 -> langsung kalah (MAX_SKIPS = 2)
  room.gameProgress.skipCount = 2;
  assert.equal(isHostWinConditionMet(room), false);

  // Uji transisi state HOST_LOST -> WHEEL_READY
  room.state = GAME_STATES.ANSWERING;
  assert.equal(transitionGameState(room, GAME_STATES.HOST_LOST), true);
  assert.equal(transitionGameState(room, GAME_STATES.WHEEL_READY), true);

  const picked = punishmentManager.pickRandomPunishment(room);
  assert.ok(picked.index >= 0 && picked.index < 2);

  // Validasi pertanyaan maks 300 karakter & tidak boleh whitespace saja
  assert.equal(validateQuestion('   ').valid, false);
  assert.equal(validateQuestion('a'.repeat(301)).valid, false);
  assert.equal(validateQuestion('Apakah kamu pernah bohong?').valid, true);

  roomManager.deleteRoom(room.roomCode);
});
