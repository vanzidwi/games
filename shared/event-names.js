export const SOCKET_EVENTS = Object.freeze({
  // Event sistem & koneksi dasar (Fase 1)
  SYSTEM_PING: 'system:ping',
  SYSTEM_PONG: 'system:pong',
  SYSTEM_ERROR: 'system:error',

  // Event room
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  SPECTATOR_JOIN: 'spectator:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_STATE: 'room:state',
  PLAYER_READY: 'player:ready',
  PUNISHMENT_UPDATE: 'punishment:update',
  GAME_START: 'game:start',

  // Event gameplay
  TURN_START: 'turn:start',
  QUESTION_SUBMIT: 'question:submit',
  QUESTION_RECEIVED: 'question:received',
  ANSWER_SUBMIT: 'answer:submit',
  ANSWER_RESULT: 'answer:result',
  SKIP_UPDATE: 'skip:update',
  GAME_OVER: 'game:over',

  // Event polling penonton
  POLL_VOTE: 'poll:vote',
  POLL_UPDATE: 'poll:update',

  // Event roda hukuman
  WHEEL_SPIN: 'wheel:spin',
  WHEEL_RESULT: 'wheel:result',

  // Event koneksi & reconnect
  SESSION_RECONNECT: 'session:reconnect',
  PLAYER_DISCONNECTED: 'player:disconnected',
  HOST_DISCONNECTED: 'host:disconnected',
  HOST_RECONNECTED: 'host:reconnected',

  // Event karakter dan visual
  CHARACTER_LOOK_AT: 'character:look_at',
  CHARACTER_ANIMATION: 'character:animation',
  PLAYER_QUESTIONING: 'player:questioning',
  GAME_TURN_CHANGED: 'game:turn_changed'
});
