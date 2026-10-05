import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "./useSocket";
import { useAuthStore } from "../store/authStore";

/** Live calendar updates: refetch calendars/events when anyone in the
 * tenant creates, updates, or deletes them (mirrors useTaskSocket). */
export const useCalendarSocket = () => {
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

    const invalidateEvents = () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    };

    const invalidateCalendars = () => {
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
    };

    socket.on("calendar-event:created", invalidateEvents);
    socket.on("calendar-event:updated", invalidateEvents);
    socket.on("calendar-event:deleted", invalidateEvents);
    socket.on("calendar:created", invalidateCalendars);
    socket.on("calendar:updated", invalidateCalendars);
    socket.on("calendar:deleted", invalidateCalendars);

    return () => {
      socket.off("calendar-event:created", invalidateEvents);
      socket.off("calendar-event:updated", invalidateEvents);
      socket.off("calendar-event:deleted", invalidateEvents);
      socket.off("calendar:created", invalidateCalendars);
      socket.off("calendar:updated", invalidateCalendars);
      socket.off("calendar:deleted", invalidateCalendars);
      socket.off("connect", joinTenant);
    };
  }, [queryClient, user?.tenantId]);
};
