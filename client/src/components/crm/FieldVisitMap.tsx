import React, { useState, useEffect } from "react";
import { MapPin, User, Clock, AlertTriangle, RefreshCw, ExternalLink, Phone, Building2 } from "lucide-react";
import io from "socket.io-client";
import toast from "react-hot-toast";
import api from "../../lib/api";

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
    <div className="relative w-full h-36 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
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
        className="absolute bottom-1.5 right-1.5 bg-white/90 backdrop-blur rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 shadow-sm flex items-center gap-1 z-10"
      >
        <ExternalLink size={12} /> Google Maps
      </a>
    </div>
  );
};

const FieldVisitMap: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const [visits, setVisits] = useState<ActiveVisit[]>([]);
  const [locations, setLocations] = useState<Record<string, LocationUpdate>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveVisits();
    const socket = io(import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000");
    const userData = JSON.parse(localStorage.getItem("flowdesk_user") || "{}");

    socket.on("connect", () => {
      if (userData?._id) {
        socket.emit("join_user", userData._id);
      }
    });

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

    return () => {
      socket.disconnect();
    };
  }, [refreshKey]);

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
          <h3 className="font-semibold text-gray-900">Live Field Visit Tracking</h3>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            {visits.length} active
          </span>
        </div>
        <button
          onClick={fetchActiveVisits}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading active visits...</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <MapPin size={40} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">No active field visits right now</p>
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
                className={`bg-white rounded-xl border overflow-hidden ${
                  visit.geoFenceBreached ? "border-red-300" : "border-gray-200"
                }`}
              >
                <div className="p-3 pb-0">
                  <div className="flex items-center gap-2 mb-2">
                    {visit.employeeId?.avatar ? (
                      <img src={visit.employeeId.avatar} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <User size={14} className="text-blue-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {visit.employeeId?.name || "Unknown"}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500">{visit.employeeId?.employeeId}</p>
                        <span className="text-[10px] text-gray-300">•</span>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock size={10} />
                          <span>{visit.checkInTime ? formatTime(visit.checkInTime) : ""}</span>
                        </div>
                      </div>
                    </div>
                    {visit.geoFenceBreached && <AlertTriangle size={16} className="text-red-500 shrink-0" />}
                  </div>

                  {lead ? (
                    <div className="mb-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-xs font-medium text-blue-800 truncate">
                        {lead.name || "Unnamed Lead"}
                      </p>
                      {lead.companyName && (
                        <p className="text-[10px] text-blue-600 flex items-center gap-1 mt-0.5">
                          <Building2 size={10} /> {lead.companyName}
                        </p>
                      )}
                      {lead.phone && (
                        <p className="text-[10px] text-blue-600 flex items-center gap-1">
                          <Phone size={10} /> {lead.phone}
                        </p>
                      )}
                      {lead.city && (
                        <p className="text-[10px] text-blue-600">{lead.city}{lead.state ? `, ${lead.state}` : ""}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600 mb-2">
                      <span className="font-medium">Client:</span> {visit.clientName || "N/A"}
                    </p>
                  )}
                </div>

                {lat !== 0 && lng !== 0 && <MiniMap lat={lat} lng={lng} label={visit.employeeId?.name || ""} />}

                {(loc || visit.checkInLocation?.address) && (
                  <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
                    <p className="text-[11px] text-gray-400 leading-tight line-clamp-2">
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
