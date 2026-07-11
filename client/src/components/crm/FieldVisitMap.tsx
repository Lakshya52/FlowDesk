import React, { useState, useEffect } from "react";
import { MapPin, User, Clock, AlertTriangle,  ExternalLink, Phone, Building2, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";
import { getSocket } from "../../hooks/useSocket";
import { useAuthStore } from "../../store/authStore";

interface ClientInfo {
  _id: string;
  name?: string;
  phone?: string;
  companyName?: string;
  city?: string;
  state?: string;
}

interface ActiveVisit {
  _id: string;
  employeeId: { _id: string; name: string; email: string; avatar?: string; employeeId: string };
  clientId: ClientInfo;
  clientName: string;
  clientType: string;
  checkInTime: string;
  checkInLocation?: { coordinates: [number, number]; address: string };
  geoFenceBreached: boolean;
  trackingLost?: boolean;
  scheduledDate?: string;
}

interface LocationUpdate {
  visitId: string;
  employeeId: string;
  lat: number;
  lng: number;
  timestamp: string;
}

function mapEmbedUrl(lat: number, lng: number): string {
  const bbox = `${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

const MiniMap: React.FC<{ lat: number; lng: number; label: string }> = ({ lat, lng, label }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative w-full h-36 rounded-lg overflow-hidden bg-(--color-surface-hover) border border-(--color-border)">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-(--color-text-tertiary)">
          Loading map...
        </div>
      )}
      <iframe
        src={mapEmbedUrl(lat, lng)}
        title={`Map for ${label}`}
        className="w-full h-full border-0"
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />
      <a
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-1.5 right-1.5 bg-(--color-surface)/90 backdrop-blur rounded-md px-2 py-1 text-xs font-medium text-(--color-primary) hover:text-(--color-primary-hover) shadow-sm flex items-center gap-1 z-10"
      >
        <ExternalLink size={12} /> Google Maps
      </a>
    </div>
  );
};

const FieldVisitMap: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const { user } = useAuthStore();
  const [visits, setVisits] = useState<ActiveVisit[]>([]);
  const [locations, setLocations] = useState<Record<string, LocationUpdate>>({});
  const [loading, setLoading] = useState(true);

  const tenantId = typeof user?.tenantId === "object" ? (user.tenantId as any)?._id : user?.tenantId;

  useEffect(() => {
    fetchActiveVisits();
  }, [refreshKey]);

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

    socket.on("field-visit:checked-in", (visit: ActiveVisit) => {
      setVisits((prev) => {
        const exists = prev.find((v) => v._id === visit._id);
        if (exists) return prev.map((v) => (v._id === visit._id ? visit : v));
        return [...prev, visit];
      });
    });

    socket.on("field-visit:checked-out", (data: { _id: string }) => {
      setVisits((prev) => prev.filter((v) => v._id !== data._id));
    });

    socket.on("field-visit:location", (data: LocationUpdate) => {
      setLocations((prev) => ({ ...prev, [data.visitId]: data }));
    });

    socket.on("field-visit:geo-breached", (data: { visitId: string; employeeName: string }) => {
      toast.error(`Geo-fence breached by ${data.employeeName}!`, { duration: 5000 });
    });

    socket.on("field-visit:tracking-lost", (data: { visitId: string; employeeName: string }) => {
      setVisits((prev) => prev.map((v) => v._id === data.visitId ? { ...v, trackingLost: true } : v));
      toast.error(`Tracking lost: ${data.employeeName}`, { duration: 4000 });
    });

    socket.on("field-visit:tracking-restored", (data: { visitId: string; employeeName: string }) => {
      setVisits((prev) => prev.map((v) => v._id === data.visitId ? { ...v, trackingLost: false } : v));
      toast.success(`Tracking restored for ${data.employeeName}`, { duration: 3000 });
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("field-visit:checked-in");
      socket.off("field-visit:checked-out");
      socket.off("field-visit:location");
      socket.off("field-visit:geo-breached");
      socket.off("field-visit:tracking-lost");
      socket.off("field-visit:tracking-restored");
    };
  }, [tenantId]);

  const fetchActiveVisits = async () => {
    try {
      const res = await api.get("/field-visits/active");
      setVisits(res.data.visits || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (t: string) => {
    const diff = Date.now() - new Date(t).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  const getLeadInfo = (visit: ActiveVisit) => {
    if (typeof visit.clientId === 'object' && visit.clientId) {
      return visit.clientId;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-(--color-text)">Live Field Visit Tracking</h3>
          <span className="text-xs bg-(--color-primary-light) text-(--color-primary-hover) px-2 py-0.5 rounded-full font-medium">
            {visits.length} active
          </span>
        </div>
        {/* <button
          onClick={fetchActiveVisits}
          className="flex items-center gap-1 text-sm text-(--color-primary) hover:text-(--color-primary-hover)"
        >
          <RefreshCw size={14} /> Refresh
        </button> */}
      </div>

      {loading ? (
        <div className="text-center py-8 text-(--color-text-tertiary)">Loading active visits...</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-12 bg-(--color-surface-hover) rounded-xl border border-(--color-border)">
          <MapPin size={40} className="mx-auto text-(--color-text-tertiary) mb-2" />
          <p className="text-(--color-text-tertiary)">No active field visits right now</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visits.map((visit) => {
            const loc = locations[visit._id];
            const lat = loc?.lat ?? visit.checkInLocation?.coordinates[1] ?? 0;
            const lng = loc?.lng ?? visit.checkInLocation?.coordinates[0] ?? 0;
            const lead = getLeadInfo(visit);
            return (
              <div
                key={visit._id}
                className={`bg-(--color-surface) rounded-xl border overflow-hidden ${
                  visit.geoFenceBreached ? "border-(--color-danger)" : visit.trackingLost ? "border-(--color-warning)" : "border-(--color-border)"
                }`}
              >
                <div className="p-3 pb-0">
                  <div className="flex items-center gap-2 mb-2">
                    {visit.employeeId?.avatar ? (
                      <img src={visit.employeeId.avatar} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-(--color-primary-light) flex items-center justify-center">
                        <User size={14} className="text-(--color-primary)" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-(--color-text) truncate">
                        {visit.employeeId?.name || "Unknown"}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-(--color-text-tertiary)">{visit.employeeId?.employeeId}</p>
                        <span className="text-[10px] text-(--color-text-tertiary)">•</span>
                        <div className="flex items-center gap-1 text-xs text-(--color-text-tertiary)">
                          <Clock size={10} />
                          <span>{visit.checkInTime ? formatTime(visit.checkInTime) : ""}</span>
                        </div>
                      </div>
                      {visit.trackingLost && (
                        <span className="text-[10px] text-(--color-warning) font-medium flex items-center gap-1 mt-0.5">
                          <WifiOff size={10} /> Tracking lost — GPS/internet off
                        </span>
                      )}
                    </div>
                    {visit.trackingLost && <WifiOff size={16} className="text-(--color-warning) shrink-0" aria-label="Tracking lost" />}
                    {visit.geoFenceBreached && <AlertTriangle size={16} className="text-(--color-danger) shrink-0" />}
                  </div>

                  {lead ? (
                    <div className="mb-2 p-2 bg-(--color-primary-light) rounded-lg border border-(--color-primary-light)">
                      <p className="text-xs font-medium text-(--color-primary-hover) truncate">
                        {lead.name || "Unnamed Lead"}
                      </p>
                      {lead.companyName && (
                        <p className="text-[10px] text-(--color-primary) flex items-center gap-1 mt-0.5">
                          <Building2 size={10} /> {lead.companyName}
                        </p>
                      )}
                      {lead.phone && (
                        <p className="text-[10px] text-(--color-primary) flex items-center gap-1">
                          <Phone size={10} /> {lead.phone}
                        </p>
                      )}
                      {lead.city && (
                        <p className="text-[10px] text-(--color-primary)">{lead.city}{lead.state ? `, ${lead.state}` : ""}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-(--color-text-secondary) mb-2">
                      <span className="font-medium">Client:</span> {visit.clientName || "N/A"}
                    </p>
                  )}
                </div>

                {lat !== 0 && lng !== 0 && <MiniMap lat={lat} lng={lng} label={visit.employeeId?.name || ""} />}

                {(loc || visit.checkInLocation?.address) && (
                  <div className="px-3 py-2 border-t border-(--color-border) bg-(--color-surface-hover)/50">
                    <p className="text-[11px] text-(--color-text-tertiary) leading-tight line-clamp-2">
                      {(loc && `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`) || visit.checkInLocation?.address}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FieldVisitMap;
