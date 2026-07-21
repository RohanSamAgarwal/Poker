import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is served under /poker/ in every environment (see server/config.js),
// so assets are built with that base. During local dev, proxy the Socket.IO
// endpoint to the Node server on :3003.
export default defineConfig({
  base: '/poker/',
  plugins: [react()],
  server: {
    proxy: {
      '/poker/socket.io': {
        target: 'http://localhost:3003',
        ws: true,
      },
    },
  },
});
