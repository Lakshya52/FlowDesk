import React, { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { MapPin, BarChart3, Route, Map } from "lucide-react";
import FieldVisitList from "./FieldVisitList";
import FieldVisitRemarks from "./FieldVisitRemarks";
import FieldVisitMap from "./FieldVisitMap";
import FieldVisitReports from "./FieldVisitReports";
import FieldVisitRoutePlanner from "./FieldVisitRoutePlanner";
import { useLocationTracking } from "../../hooks/useLocationTracking";

type AdminTab = "visits" | "map" | "reports" | "route";

const ADMIN_TABS: { key: AdminTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "visits", label: "Visits", icon: MapPin },
  { key: "map", label: "Live Map", icon: Map },
  { key: "route", label: "Route Planner", icon: Route },
  { key: "reports", label: "Reports", icon: BarChart3 },
];

const FieldVisits: React.FC = () => {
  const { user } = useAuthStore();
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const [adminTab, setAdminTab] = useState<AdminTab>("visits");
  const [remarksVisitId, setRemarksVisitId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTrackingId, setActiveTrackingId] = useState<string | null>(null);

  useLocationTracking({
    visitId: activeTrackingId,
    enabled: !!activeTrackingId,
    intervalMs: 30000,
    durationMs: 60 * 60 * 1000,
  });

  const handleAddRemarks = (id: string) => {
    setRemarksVisitId(id);
  };

  const handleRemarksComplete = () => {
    setRemarksVisitId(null);
    setRefreshKey((k) => k + 1);
  };

  if (remarksVisitId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <FieldVisitRemarks
          visitId={remarksVisitId}
          onComplete={handleRemarksComplete}
          onCancel={() => setRemarksVisitId(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={24} className="text-blue-600" />
            Field Visits
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">View & manage your field visits</p>
        </div>
      </div>

      {isAdminOrManager && (
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {ADMIN_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setAdminTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  adminTab === tab.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
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

      {isAdminOrManager && adminTab === "map" && <FieldVisitMap />}
      {isAdminOrManager && adminTab === "reports" && <FieldVisitReports />}
      {isAdminOrManager && adminTab === "route" && <FieldVisitRoutePlanner />}
    </div>
  );
};

export default FieldVisits;
