import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "./useSocket";
import { useAuthStore } from '@/store/authStore';

export const useTaskSocket = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const socket = getSocket();
    const tenantId = typeof user?.tenantId === "object" ? user.tenantId._id : user?.tenantId;

    const joinTenant = () => {
      if (tenantId) {
        socket.emit("join_tenant", tenantId);
      }
    };

    if (socket.connected) {
      joinTenant();
    }
    socket.on("connect", joinTenant);

    const invalidateTasks = () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    };

    const invalidateBoards = () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
    };

    socket.on("task:created", invalidateTasks);
    socket.on("task:updated", invalidateTasks);
    socket.on("task:deleted", invalidateTasks);
    socket.on("board:created", invalidateBoards);
    socket.on("board:updated", invalidateBoards);
    socket.on("board:deleted", invalidateBoards);

    return () => {
      socket.off("task:created", invalidateTasks);
      socket.off("task:updated", invalidateTasks);
      socket.off("task:deleted", invalidateTasks);
      socket.off("board:created", invalidateBoards);
      socket.off("board:updated", invalidateBoards);
      socket.off("board:deleted", invalidateBoards);
      socket.off("connect", joinTenant);
    };
  }, [queryClient, user?.tenantId]);
};
