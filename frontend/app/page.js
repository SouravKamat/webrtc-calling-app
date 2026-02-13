"use client";

import { useEffect, useRef, useState } from "react";
import socket from "../lib/socket";

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
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // ---------------- SOCKET (attach listeners) ----------------
  useEffect(() => {
    if (!socket) return;

    const onConnect = () => {
      console.log("✅ connected:", socket.id);
      setMySocketId(socket.id);
    };

    const onJoinedRoom = ({ roomId, participants }) => {
      setUsers(participants.filter((u) => u.socketId !== socket.id));
    };

    const onUserJoined = ({ socketId, username }) => {
      setUsers((prev) => [...prev, { socketId, username }]);
    };

    const onUserLeft = ({ socketId }) => {
      setUsers((prev) => prev.filter((u) => u.socketId !== socketId));
      if (inCallWith === socketId) {
        alert("Peer disconnected");
        cleanupCall();
      }
    };

    const onOffer = (data) => {
      const { from, offer } = data;
      setIncomingCall({ from, offer });
    };

    const onAnswer = async ({ from, answer }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(answer);
      setInCallWith(from);
    };

    const onIce = async ({ from, candidate }) => {
      if (pcRef.current && candidate) {
        await pcRef.current.addIceCandidate(candidate);
      }
    };

    const onConnectError = (err) => {
      console.error("❌ socket error:", err.message);
    };

    socket.on("connect", onConnect);
    socket.on("joined-room", onJoinedRoom);
    socket.on("user-joined", onUserJoined);
    socket.on("user-left", onUserLeft);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("ice-candidate", onIce);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("joined-room", onJoinedRoom);
      socket.off("user-joined", onUserJoined);
      socket.off("user-left", onUserLeft);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("ice-candidate", onIce);
      socket.off("connect_error", onConnectError);
    };
  }, []);

  // ---------------- JOIN ----------------
  function handleJoin(e) {
    e.preventDefault();
    if (!username) return;

    // Use a single global room for discovery; replace with dynamic rooms as needed
    const ROOM_ID = "global";
    socket.emit("join-room", { roomId: ROOM_ID, username });
    setJoined(true);
  }

  // ---------------- MEDIA ----------------
  async function getLocalMedia({ audio = true, video = false }) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
    localStreamRef.current = stream;
    return stream;
  }

  function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", {
          to: peerId,
          candidate: e.candidate,
        });
      }
    };

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
    };

    return pc;
  }

  // ---------------- CALL ----------------
  async function callUser(peerId) {
    await getLocalMedia({ audio: true, video: videoEnabledRef.current });
    const pc = createPeerConnection(peerId);

    localStreamRef.current.getTracks().forEach((t) =>
      pc.addTrack(t, localStreamRef.current)
    );

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("offer", { to: peerId, offer: pc.localDescription });
  }

  async function acceptCall() {
    const { from, offer } = incomingCall;

    await getLocalMedia({ audio: true, video: videoEnabledRef.current });
    const pc = createPeerConnection(from);

    localStreamRef.current.getTracks().forEach((t) =>
      pc.addTrack(t, localStreamRef.current)
    );

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", { to: from, answer: pc.localDescription });

    setIncomingCall(null);
    setInCallWith(from);
  }

  function rejectCall() {
    socket.emit("leave-room");
    setIncomingCall(null);
  }

  function endCall() {
    // Notify others in room that we left (optional)
    socket.emit("leave-room");
    cleanupCall();
  }

  function cleanupCall() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();

    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pcRef.current = null;

    setInCallWith(null);
    setIncomingCall(null);
  }

  function toggleVideo() {
    videoEnabledRef.current = !videoEnabledRef.current;
    alert(`Video ${videoEnabledRef.current ? "ON" : "OFF"} for next call`);
  }

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach(
      (t) => (t.enabled = !t.enabled)
    );
  }

  // ---------------- CLEANUP ----------------
  useEffect(() => {
    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, []);

  // ---------------- UI ----------------
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">WebRTC 1:1 Calling</h1>

      {!joined ? (
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            className="border p-2 rounded flex-1"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-4 rounded">Join</button>
        </form>
      ) : (
        <div className="flex gap-6">
          <div className="w-1/3 bg-white p-4 rounded shadow">
            <div className="mb-2">
              <strong>{username}</strong>
              <br />
              <small>{mySocketId}</small>
            </div>

            <button onClick={toggleVideo} className="underline text-sm">
              Toggle Video
            </button>

            <ul className="mt-4 space-y-2">
              {users.map((u) => (
                <li key={u.socketId} className="flex justify-between">
                  {u.username}
                  <button
                    onClick={() => callUser(u.socketId)}
                    className="bg-green-500 text-white px-2 rounded"
                  >
                    Call
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 bg-white p-4 rounded shadow">
            {incomingCall && (
              <div className="mb-3">
                <strong>{users.find((u) => u.socketId === incomingCall.from)?.username || incomingCall.from}</strong> calling
                <div className="space-x-2 mt-2">
                  <button onClick={acceptCall} className="bg-blue-600 text-white px-3 rounded">
                    Accept
                  </button>
                  <button onClick={rejectCall} className="bg-gray-300 px-3 rounded">
                    Reject
                  </button>
                </div>
              </div>
            )}

            {inCallWith ? (
              <>
                <video autoPlay muted ref={(v) => v && (v.srcObject = localStreamRef.current)} />
                <video autoPlay ref={(v) => v && (v.srcObject = remoteStreamRef.current)} />
                <div className="space-x-2 mt-2">
                  <button onClick={toggleMute}>Mute</button>
                  <button onClick={endCall} className="bg-red-600 text-white px-3 rounded">
                    End
                  </button>
                </div>
              </>
            ) : (
              <p>Not in a call</p>
            )}
          </div>
        </div>
        )}
      </div>
    );
  }