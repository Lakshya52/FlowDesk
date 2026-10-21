import { io, Socket } from "socket.io-client";
import { SOCKET_BASE_URL } from "../lib/urls";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const url = SOCKET_BASE_URL;
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
