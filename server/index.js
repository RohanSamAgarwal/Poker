// =============================================================================
//  index.js — Express + Socket.IO server.
// =============================================================================
//  Serves the built React client and hosts the realtime game connection on a
//  single port. Room/game wiring is added in Phase 3; for now this is the
//  runnable skeleton with a health endpoint and a hello round-trip.
// =============================================================================

import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { PORT, BASE_PATH, SOCKET_PATH, ALLOWED_ORIGIN } from './config.js';
import { attachSocketHandlers } from './socketHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  path: SOCKET_PATH,
  cors: { origin: ALLOWED_ORIGIN },
});

// --- Health check (used by deploy/monitoring) --------------------------------
app.get(`${BASE_PATH}/health`, (_req, res) => {
  res.json({ ok: true, service: 'poker', time: new Date().toISOString() });
});

// --- Static client -----------------------------------------------------------
app.use(BASE_PATH, express.static(clientDist));
// SPA fallback: any non-asset path under the base serves index.html.
app.get(`${BASE_PATH}/*`, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// --- Realtime ----------------------------------------------------------------
attachSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`[poker] listening on :${PORT} (base ${BASE_PATH}, socket ${SOCKET_PATH})`);
});
