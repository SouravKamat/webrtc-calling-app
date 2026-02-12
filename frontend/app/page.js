"use client";

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

let socket = null;

export default function Page() {
  const [joined, setJoined] = useState(false);
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState([]);
  const [mySocketId, setMySocketId] = useState(null);

  const [incomingCall, setIncomingCall] = useState(null);
  const [inCallWith, setInCallWith] = useState(null);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pcRef = useRef(null);
  const videoEnabledRef = useRef(false);

  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
      // Optional TURN server example:
      // { urls: "turn:your.turn.server:3478", username: "u", credential: "p" }
    ]
  };

  function initSocket() {
    if (socket) return;
    const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
    socket = io(BACKEND);

    socket.on("connect", () => {
      setMySocketId(socket.id);
    });

    socket.on("users", (list) => {
      setUsers(list.filter((u) => u.socketId !== socket.id));
    });

    socket.on("incoming-call", (data) => {
      setIncomingCall(data);
    });

    socket.on("call-accepted", async ({ from, answer }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(answer);
        setInCallWith(from);
      } catch (err) {
        console.error("Error applying remote answer:", err);
      }
    });

    socket.on("call-rejected", ({ from }) => {
      alert("Call rejected by user.");
      cleanupCall();
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      if (pcRef.current && candidate) {
        try {
          await pcRef.current.addIceCandidate(candidate);
        } catch (err) {
          console.warn("Failed to add ICE candidate:", err);
        }
      }
    });

    socket.on("call-ended", ({ from }) => {
      alert("Call ended by remote.");
      cleanupCall();
    });

    socket.on("user-disconnected", ({ socketId }) => {
      if (inCallWith === socketId) {
        alert("Peer disconnected.");
        cleanupCall();
      }
    });
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!username) return;
    initSocket();
    socket.emit("join", { username });
    setJoined(true);
  }

  async function getLocalMedia({ audio = true, video = false } = {}) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error("getUserMedia error:", err);
      throw err;
    }
  }

  function createPeerConnection(peerSocketId) {
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("ice-candidate", { to: peerSocketId, candidate: event.candidate });
      }
    };

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    pc.ontrack = (event) => {
      event.streams?.[0] && event.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
    };

    return pc;
  }

  async function callUser(targetSocketId) {
    if (!targetSocketId) return;
    try {
      await getLocalMedia({ audio: true, video: videoEnabledRef.current });
      const pc = createPeerConnection(targetSocketId);

      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call-user", { to: targetSocketId, offer: pc.localDescription });
    } catch (err) {
      console.error("callUser error:", err);
    }
  }

  async function acceptCall() {
    if (!incomingCall) return;
    const { from, offer } = incomingCall;
    try {
      await getLocalMedia({ audio: true, video: videoEnabledRef.current });
      const pc = createPeerConnection(from);

      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));

      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("accept-call", { to: from, answer: pc.localDescription });

      setInCallWith(from);
      setIncomingCall(null);
    } catch (err) {
      console.error("acceptCall error:", err);
    }
  }

  function rejectCall() {
    if (!incomingCall) return;
    socket.emit("reject-call", { to: incomingCall.from });
    setIncomingCall(null);
  }

  function endCall() {
    if (inCallWith && socket) {
      socket.emit("end-call", { to: inCallWith });
    }
    cleanupCall();
  }

  function cleanupCall() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      try {
        remoteStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      remoteStreamRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }

    setInCallWith(null);
    setIncomingCall(null);
  }

  function toggleVideo() {
    videoEnabledRef.current = !videoEnabledRef.current;
    alert("Video for future calls: " + (videoEnabledRef.current ? "ON" : "OFF"));
  }

  function toggleMute() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
  }

  useEffect(() => {
    const localEl = document.getElementById("localVideo");
    const remoteEl = document.getElementById("remoteVideo");

    if (localEl && localStreamRef.current) {
      localEl.srcObject = localStreamRef.current;
    }
    if (remoteEl && remoteStreamRef.current) {
      remoteEl.srcObject = remoteStreamRef.current;
    }
  });

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Private 1:1 Calling (WebRTC)</h1>

      {!joined ? (
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            className="border p-2 rounded flex-1"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Join</button>
        </form>
      ) : (
        <div className="flex gap-6">
          <div className="w-1/3 bg-white p-4 rounded shadow">
            <div className="mb-2">
              <strong>You:</strong> {username} <br />
              <small>Socket: {mySocketId}</small>
            </div>

            <div className="mb-2">
              <button onClick={toggleVideo} className="text-sm underline">Toggle Video for future calls</button>
            </div>

            <h3 className="font-medium">Online Users</h3>
            <ul className="space-y-2 mt-2">
              {users.length === 0 && <li className="text-sm text-gray-500">No one online</li>}
              {users.map((u) => (
                <li key={u.socketId} className="flex justify-between items-center">
                  <span>{u.username}</span>
                  <div className="space-x-2">
                    <button
                      className="bg-green-500 text-white px-2 py-1 rounded text-sm"
                      onClick={() => callUser(u.socketId)}
                    >
                      Call
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 bg-white p-4 rounded shadow">
            <h3 className="font-medium mb-2">Call Area</h3>

            {incomingCall && (
              <div className="mb-4 p-3 border rounded bg-yellow-50">
                <div><strong>{incomingCall.callerName}</strong> is calling you.</div>
                <div className="mt-2 space-x-2">
                  <button onClick={acceptCall} className="bg-blue-600 text-white px-3 py-1 rounded">Accept</button>
                  <button onClick={rejectCall} className="bg-gray-200 px-3 py-1 rounded">Reject</button>
                </div>
              </div>
            )}

            {inCallWith ? (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div>
                    <div className="text-sm text-gray-500">Local</div>
                    <video id="localVideo" autoPlay muted playsInline className="w-48 h-36 bg-black" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Remote</div>
                    <video id="remoteVideo" autoPlay playsInline className="w-48 h-36 bg-black" />
                  </div>
                </div>

                <div className="space-x-2">
                  <button onClick={toggleMute} className="bg-yellow-400 px-3 py-1 rounded">Mute/Unmute</button>
                  <button onClick={endCall} className="bg-red-600 text-white px-3 py-1 rounded">End Call</button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Not in a call</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
