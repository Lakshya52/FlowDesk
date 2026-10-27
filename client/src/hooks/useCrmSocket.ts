import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "./useSocket";
import { useAuthStore } from "../store/authStore";

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
      // Partner cards show live lead counts and the detail panel lists
      // referred leads — keep them in sync whenever a lead changes.
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      queryClient.invalidateQueries({ queryKey: ["partner"] });
      queryClient.invalidateQueries({ queryKey: ["partner-leads"] });
      // Files show the lead's current name/company/phone, so a lead edit must
      // refresh the file tracker too.
      queryClient.invalidateQueries({ queryKey: ["case-files"] });
      queryClient.invalidateQueries({ queryKey: ["case-file-stats"] });
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
    };

    const invalidateDatabases = () => {
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
    };

    const invalidatePartners = () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      queryClient.invalidateQueries({ queryKey: ["partner"] });
      queryClient.invalidateQueries({ queryKey: ["partner-leads"] });
      // Renaming/deleting a partner also affects its leads (source label,
      // partnerId unlink), so refresh those views too.
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
    };

    socket.on("crm:lead:created", invalidateLeads);
    socket.on("crm:lead:updated", invalidateLeads);
    socket.on("crm:lead:deleted", invalidateLeads);
    socket.on("crm:database:created", invalidateDatabases);
    socket.on("crm:database:updated", invalidateDatabases);
    socket.on("crm:database:deleted", invalidateDatabases);
    socket.on("crm:partner:created", invalidatePartners);
    socket.on("crm:partner:updated", invalidatePartners);
    socket.on("crm:partner:deleted", invalidatePartners);

    const invalidateCaseFiles = () => {
      queryClient.invalidateQueries({ queryKey: ["case-files"] });
      queryClient.invalidateQueries({ queryKey: ["case-file-stats"] });
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
      // CaseFiles mirror won leads — keep lead views in sync too.
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    };

    const invalidateCaseFilesStructure = () => {
      queryClient.invalidateQueries({ queryKey: ["case-files"] });
      queryClient.invalidateQueries({ queryKey: ["case-file-stats"] });
      queryClient.invalidateQueries({ queryKey: ["loan-products"] });
      queryClient.invalidateQueries({ queryKey: ["doc-statuses"] });
    };

    socket.on("crm:case-file:created", invalidateCaseFiles);
    socket.on("crm:case-file:updated", invalidateCaseFiles);
    socket.on("crm:case-file:deleted", invalidateCaseFiles);
    socket.on("crm:loan-product:created", invalidateCaseFilesStructure);
    socket.on("crm:loan-product:updated", invalidateCaseFilesStructure);
    socket.on("crm:loan-product:deleted", invalidateCaseFilesStructure);
    socket.on("crm:doc-status:changed", invalidateCaseFilesStructure);

    const invalidateFieldVisitReports = () => {
      queryClient.invalidateQueries({ queryKey: ["field-visit-reports"] });
      // CRM Overview shows a live "active now" field-visits tile.
      queryClient.invalidateQueries({ queryKey: ["field-visits"] });
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
      socket.off("crm:database:created", invalidateDatabases);
      socket.off("crm:database:updated", invalidateDatabases);
      socket.off("crm:database:deleted", invalidateDatabases);
      socket.off("crm:partner:created", invalidatePartners);
      socket.off("crm:partner:updated", invalidatePartners);
      socket.off("crm:partner:deleted", invalidatePartners);
      socket.off("crm:case-file:created", invalidateCaseFiles);
      socket.off("crm:case-file:updated", invalidateCaseFiles);
      socket.off("crm:case-file:deleted", invalidateCaseFiles);
      socket.off("crm:loan-product:created", invalidateCaseFilesStructure);
      socket.off("crm:loan-product:updated", invalidateCaseFilesStructure);
      socket.off("crm:loan-product:deleted", invalidateCaseFilesStructure);
      socket.off("crm:doc-status:changed", invalidateCaseFilesStructure);
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
