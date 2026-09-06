import { io } from 'socket.io-client';
import { BASE_URL } from './api';

let socket = null;

export const connectSocket = (token) => {
  if (socket?.connected) return socket;
  if (socket) { socket.disconnect(); socket = null; }
  socket = io(BASE_URL, {
    auth:                { token },
    transports:          ['websocket'],
    reconnection:        true,
    reconnectionAttempts: 10,
    reconnectionDelay:   2000,
  });
  return socket;
};

export const getSocket        = () => socket;
export const disconnectSocket = () => {
  if (socket) { socket.disconnect(); socket = null; }
};
