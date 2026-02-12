/**
 * Simple Express + Socket.IO signaling server for 1:1 WebRTC calls.
 *
 * Events:
 * - client -> server:
 *   - 'join' { username }
 *   - 'call-user' { to, offer }
 *   - 'accept-call' { to, answer }
 *   - 'reject-call' { to }
 *   - 'ice-candidate' { to, candidate }
 *   - 'end-call' { to }
 *
 * - server -> client:
 *   - 'users' [ { socketId, username } ]
 *   - 'incoming-call' { from, offer, callerName }
 *   - 'call-accepted' { from, answer }
 *   - 'call-rejected' { from }
 *   - 'ice-candidate' { from, candidate }
 *   - 'call-ended' { from }
 *   - 'user-disconnected' { socketId }
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());

// Allow CORS from frontend (e.g., Vercel) or default to all for local dev.
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
app.use(cors({ origin: FRONTEND_URL }));

app.get("/health", (req, res) => res.json({ status: "ok" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"]
  }
});

// In-memory map: socketId -> username
const users = {};

// Helper to produce users array
function getUsersList() {
  return Object.entries(users).map(([socketId, username]) => ({ socketId, username }));
}

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  // user joins with a username
  socket.on("join", ({ username }) => {
    if (!username) return;
    users[socket.id] = username;
    // Broadcast updated users list
    io.emit("users", getUsersList());
    console.log("user joined:", username, socket.id);
  });

  // Caller sends call request with SDP offer to server to forward to callee
  socket.on("call-user", ({ to, offer }) => {
    if (!to || !offer) return;
    const callerName = users[socket.id] || "Unknown";
    io.to(to).emit("incoming-call", { from: socket.id, offer, callerName });
    console.log(`${socket.id} calling ${to}`);
  });

  // Callee accepts and sends answer back to caller
  socket.on("accept-call", ({ to, answer }) => {
    if (!to || !answer) return;
    io.to(to).emit("call-accepted", { from: socket.id, answer });
    console.log(`${socket.id} accepted call from ${to}`);
  });

  // Callee rejects call
  socket.on("reject-call", ({ to }) => {
    if (!to) return;
    io.to(to).emit("call-rejected", { from: socket.id });
    console.log(`${socket.id} rejected call from ${to}`);
  });

  // ICE candidates exchange
  socket.on("ice-candidate", ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  // End call notify
  socket.on("end-call", ({ to }) => {
    if (!to) return;
    io.to(to).emit("call-ended", { from: socket.id });
  });

  // Socket disconnect
  socket.on("disconnect", () => {
    console.log("socket disconnected", socket.id);
    const username = users[socket.id];
    delete users[socket.id];
    io.emit("users", getUsersList());
    io.emit("user-disconnected", { socketId: socket.id });
    console.log("removed user:", username);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
  console.log(`Allowed frontend origin: ${FRONTEND_URL}`);
});
