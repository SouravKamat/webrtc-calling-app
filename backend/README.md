# WebRTC Signaling Server

Simple Express + Socket.IO signaling server for 1:1 WebRTC calls.

Features:
- In-memory user list (no DB)
- Signaling for offer/answer and ICE candidates
- CORS-configurable via `FRONTEND_URL`

Run locally:

```bash
npm install
npm run dev
```

Deploy notes:
- Railway sets `PORT` automatically. Add `FRONTEND_URL` to Railway env vars to allow CORS from your Vercel app.
