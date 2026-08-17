import React, { useState, useCallback, useEffect } from "react";
import { useAuthStore } from '@/store/authStore';
import { MapPin, Route, Map, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import FieldVisitList from "./FieldVisitList";
import FieldVisitRemarks from "./FieldVisitRemarks";
import FieldVisitMap from "./FieldVisitMap";
// import FieldVisitReports from "./FieldVisitReports";
import FieldVisitRoutePlanner from "./FieldVisitRoutePlanner";
import { useLocationTracking } from '@/shared/hooks/useLocationTracking';
import { useFieldVisitSocket } from '@/shared/hooks/useFieldVisitSocket';

type AdminTab = "visits" | "map" | "reports" | "route";

const ADMIN_TABS: { key: AdminTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "visits", label: "Visits", icon: MapPin },
  { key: "map", label: "Live Map", icon: Map },
  { key: "route", label: "Route Planner", icon: Route },
  // { key: "reports", label: "Reports", icon: BarChart3 },
];

const FieldVisits: React.FC = () => {
  const { user } = useAuthStore();
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const [adminTab, setAdminTab] = useState<AdminTab>("visits");
  const [remarksVisitId, setRemarksVisitId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTrackingId, setActiveTrackingId] = useState<string | null>(null);

  useLocationTracking({
    visitId: activeTrackingId,
    enabled: !!activeTrackingId,
    intervalMs: 30000,
    durationMs: 60 * 60 * 1000,
  });

  const tenantId = typeof user?.tenantId === "object" ? (user.tenantId as any)?._id : user?.tenantId;

  const handleSocketRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useFieldVisitSocket({
    tenantId,
    onRefresh: handleSocketRefresh,
  });

  useEffect(() => {
    if (!remarksVisitId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRemarksVisitId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [remarksVisitId]);

  const handleAddRemarks = (id: string) => {
    setRemarksVisitId(id);
  };

  const handleRemarksComplete = () => {
    setRemarksVisitId(null);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-350 mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-(--color-text) flex items-center gap-2">
            <MapPin size={24} className="text-(--color-primary)" />
            Field Visits
          </h1>
          <p className="text-sm text-(--color-text-tertiary) mt-0.5">View & manage your field visits</p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            setRefreshKey((k) => k + 1);
            setTimeout(() => {
              setRefreshing(false);
              toast.success("Refreshed");
            }, 500);
          }}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 border border-(--color-border) cursor-pointer text-sm font-medium rounded-lg hover:bg-(--color-surface-hover) disabled:opacity-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {isAdminOrManager && (
        <div className="flex gap-1 border-b border-(--color-border) mb-4">
          {ADMIN_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setAdminTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  adminTab === tab.key
                    ? "border-(--color-primary) text-(--color-primary)"
                    : "border-transparent text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {(!isAdminOrManager || adminTab === "visits") && (
        <FieldVisitList
          onAddRemarks={handleAddRemarks}
          onCheckInComplete={(id) => setActiveTrackingId(id)}
          refreshKey={refreshKey}
        />
      )}

      {isAdminOrManager && adminTab === "map" && <FieldVisitMap refreshKey={refreshKey} />}
      {/* {isAdminOrManager && adminTab === "reports" && <FieldVisitReports refreshKey={refreshKey} />} */}
      {isAdminOrManager && adminTab === "route" && <FieldVisitRoutePlanner refreshKey={refreshKey} />}

      {remarksVisitId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="relative bg-(--color-surface) rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <FieldVisitRemarks
              visitId={remarksVisitId}
              onComplete={handleRemarksComplete}
              onCancel={() => setRemarksVisitId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldVisits;
