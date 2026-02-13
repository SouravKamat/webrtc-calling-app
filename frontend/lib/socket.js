import { io } from "socket.io-client";

// Production-ready socket wrapper. Use NEXT_PUBLIC_BACKEND_URL in Vercel env.
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;
if (!BACKEND) {
  // Fail fast in dev/build if env is missing
  console.error("NEXT_PUBLIC_BACKEND_URL is not set. Set it in .env.local or Vercel env vars.");
}

const socket = io(BACKEND, {
  path: "/socket.io",
  transports: ["polling", "websocket"], // start polling, upgrade to websocket
  withCredentials: true,
  secure: BACKEND && BACKEND.startsWith("https"),
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export default socket;
