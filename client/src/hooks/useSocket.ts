import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const url = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
    // Function form re-reads the (refreshed) token on every reconnect —
    // the server rejects unauthenticated sockets.
    socket = io(url, {
      auth: (cb) => cb({ token: localStorage.getItem("flowdesk_token") }),
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
