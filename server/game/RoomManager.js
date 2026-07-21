// =============================================================================
//  RoomManager.js — owns all live rooms; creates unique join codes; cleans up.
// =============================================================================

import { randomInt } from 'node:crypto';
import { Room } from './Room.js';

// Unambiguous alphabet (no O/0, I/1) for spoken/typed share codes.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 4;

export class RoomManager {
  constructor(opts = {}) {
    this.rooms = new Map(); // code → Room
    this.roomOpts = opts.roomOpts || {}; // passed through to each Room (timing hooks)
    this.emptyGraceMs = opts.emptyGraceMs ?? 60_000;
  }

  _generateCode() {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a unique room code');
  }

  createRoom(opts = {}) {
    const code = this._generateCode();
    const room = new Room(code, { ...this.roomOpts, ...opts });
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(String(code || '').toUpperCase());
  }

  removeRoom(code) {
    const room = this.rooms.get(code);
    if (room) { room.destroy(); this.rooms.delete(code); }
  }

  /**
   * Schedule cleanup of a room once it looks empty. Re-checks after a grace
   * period so a brief mass-disconnect (page reload) doesn't nuke the table.
   */
  scheduleCleanup(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    setTimeout(() => {
      const r = this.rooms.get(code);
      if (r && r.isEmpty()) this.removeRoom(code);
    }, this.emptyGraceMs).unref?.();
  }

  count() {
    return this.rooms.size;
  }
}
