import { io } from 'socket.io-client';

// Connect on the same path the server (and Caddy) expose. Because the page is
// always served under /poker/, this resolves correctly in dev and production.
export const socket = io({
  path: '/poker/socket.io',
  autoConnect: true,
});
