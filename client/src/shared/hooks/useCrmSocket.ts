import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "./useSocket";
import { useAuthStore } from '@/store/authStore';

export const useCrmSocket = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const socket = getSocket();
    const tenantId = typeof user?.tenantId === 'object' ? user.tenantId._id : user?.tenantId;

    const joinTenant = () => {
      if (tenantId) {
        socket.emit("join_tenant", tenantId);
      }
    };

    if (socket.connected) {
      joinTenant();
    }

    socket.on("connect", joinTenant);

    const invalidateLeads = () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    };

    const invalidateCampaigns = () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    };

    socket.on("crm:lead:created", invalidateLeads);
    socket.on("crm:lead:updated", invalidateLeads);
    socket.on("crm:lead:deleted", invalidateLeads);
    socket.on("crm:campaign:created", invalidateCampaigns);
    socket.on("crm:campaign:updated", invalidateCampaigns);
    socket.on("crm:campaign:deleted", invalidateCampaigns);

    const invalidateFieldVisitReports = () => {
      queryClient.invalidateQueries({ queryKey: ["field-visit-reports"] });
    };

    socket.on("field-visit:created", invalidateFieldVisitReports);
    socket.on("field-visit:updated", invalidateFieldVisitReports);
    socket.on("field-visit:checked-in", invalidateFieldVisitReports);
    socket.on("field-visit:checked-out", invalidateFieldVisitReports);
    socket.on("field-visit:cancelled", invalidateFieldVisitReports);
    socket.on("field-visit:completed", invalidateFieldVisitReports);

    return () => {
      socket.off("crm:lead:created", invalidateLeads);
      socket.off("crm:lead:updated", invalidateLeads);
      socket.off("crm:lead:deleted", invalidateLeads);
      socket.off("crm:campaign:created", invalidateCampaigns);
      socket.off("crm:campaign:updated", invalidateCampaigns);
      socket.off("crm:campaign:deleted", invalidateCampaigns);
      socket.off("field-visit:created", invalidateFieldVisitReports);
      socket.off("field-visit:updated", invalidateFieldVisitReports);
      socket.off("field-visit:checked-in", invalidateFieldVisitReports);
      socket.off("field-visit:checked-out", invalidateFieldVisitReports);
      socket.off("field-visit:cancelled", invalidateFieldVisitReports);
      socket.off("field-visit:completed", invalidateFieldVisitReports);
      socket.off("connect", joinTenant);
    };
  }, [queryClient, user?.tenantId]);
};
