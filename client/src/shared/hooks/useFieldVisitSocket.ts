import { useEffect } from "react";
import { getSocket } from "./useSocket";
import { useAuthStore } from '@/store/authStore';
import toast from "react-hot-toast";

interface UseFieldVisitSocketOptions {
  tenantId?: string;
  onRefresh: () => void;
}

export const useFieldVisitSocket = ({ tenantId, onRefresh }: UseFieldVisitSocketOptions) => {
  useEffect(() => {
    if (!tenantId) return;

    const socket = getSocket();

    const handleConnect = () => {
      socket.emit("join_tenant", tenantId);
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on("connect", handleConnect);

    socket.on("field-visit:checked-in", () => { onRefresh(); });
    socket.on("field-visit:checked-out", () => { onRefresh(); });
    socket.on("field-visit:created", () => { onRefresh(); });
    socket.on("field-visit:updated", () => { onRefresh(); });
    socket.on("field-visit:cancelled", () => { onRefresh(); });

    socket.on("field-visit:geo-breached", (data: { visitId: string; employeeName: string }) => {
      onRefresh();
      toast.error(`Geo-fence breached by ${data.employeeName}!`, { duration: 5000 });
    });

    socket.on("field-visit:tracking-lost", (data: { visitId: string; employeeName: string }) => {
      onRefresh();
      toast.error(`Tracking lost: ${data.employeeName}`, { duration: 4000 });
    });

    socket.on("field-visit:tracking-restored", (data: { employeeName: string }) => {
      onRefresh();
      toast.success(`Tracking restored for ${data.employeeName}`, { duration: 3000 });
    });

    socket.on("field-visit:completed", (data: { clientName: string; employeeName: string }) => {
      onRefresh();
      const user = useAuthStore.getState().user;
      if (user?.role === "admin" || user?.role === "manager") {
        toast.success(`Visit completed: ${data.clientName} by ${data.employeeName}`, { duration: 5000 });
      }
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("field-visit:checked-in");
      socket.off("field-visit:checked-out");
      socket.off("field-visit:created");
      socket.off("field-visit:updated");
      socket.off("field-visit:cancelled");
      socket.off("field-visit:geo-breached");
      socket.off("field-visit:tracking-lost");
      socket.off("field-visit:tracking-restored");
      socket.off("field-visit:completed");
    };
  }, [tenantId, onRefresh]);
};
