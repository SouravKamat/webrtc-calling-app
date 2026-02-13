import { io } from "socket.io-client";

let socket = null;

export function initSocket() {
  if (socket) return socket;
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!BACKEND) {
    console.error("NEXT_PUBLIC_BACKEND_URL is not set. Set it in .env.local or Vercel env vars.");
    return null;
  }
  socket = io(BACKEND, {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    withCredentials: true,
    secure: BACKEND.startsWith("https"),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    try { socket.disconnect(); } catch (e) {}
    socket = null;
  }
}

export default { initSocket, getSocket, disconnectSocket };
