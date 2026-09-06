import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
    socket = io("http://localhost:3000", {
      auth: { token },
      transports: ["websocket"],
    });
    socket.on("bank_details_received", () => {});
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
