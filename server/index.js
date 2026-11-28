import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { registerConnectionEvents } from './socket/connection-events.js';
import { registerGameEvents } from './socket/game-events.js';
import { roomManager } from './managers/room-manager.js';
import { registerRoomEvents } from './socket/room-events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Izinkan origin Vercel / frontend eksternal via env CLIENT_ORIGIN (dipisah koma)
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Izinkan preview & production domain Vercel secara otomatis jika diaktifkan
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: 15000,
  pingTimeout: 25000
});

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    game: 'JAWAB ATAU HUKUMAN!',
    timestamp: Date.now(),
    connectedClients: io.engine.clientsCount
  });
});

if (IS_PRODUCTION) {
  const distPath = path.join(ROOT_DIR, 'dist');
  app.use(express.static(distPath));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

setInterval(() => roomManager.cleanupExpiredRooms(io), 60000);

io.on('connection', (socket) => {
  registerConnectionEvents(io, socket);
  registerRoomEvents(io, socket);
  registerGameEvents(io, socket);
});

httpServer.listen(PORT, () => {
  console.log(`[SERVER] JAWAB ATAU HUKUMAN! berjalan di port ${PORT}`);
  console.log(`[SERVER] Mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
});
