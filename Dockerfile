# =============================================================================
#  Poker — multi-stage build. Stage 1 builds the React client; stage 2 runs the
#  Node server (Express + Socket.IO) serving the built client on one port.
# =============================================================================

# --- Stage 1: build the client ----------------------------------------------
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Stage 2: server runtime -------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3003
CMD ["node", "server/index.js"]
