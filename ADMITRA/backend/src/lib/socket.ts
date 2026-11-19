import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env';
import type { AccessPayload } from '../middleware/auth';
import { logger } from './logger';

let io: Server | null = null;

/** NOTIF-1: live notifications over WebSocket, authenticated with the access token. */
export function initSocket(server: HttpServer) {
  io = new Server(server, { path: '/api/v1/socket', cors: { origin: env.WEB_URL, credentials: true } });
  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'admitra' }) as AccessPayload;
      socket.data.userId = p.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    void socket.join(`user:${socket.data.userId}`);
  });
  logger.info('Socket.IO ready on /api/v1/socket');
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}
