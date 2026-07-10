import React, { useState, useEffect } from "react";
import { Search, MapPin, User, Building2, CheckCircle, LogIn, LogOut, X, Plus, MessageSquareText, CalendarDays, Loader2,MapPinned, ShieldAlert, Timer, DollarSign, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import FieldVisitCheckIn from "./FieldVisitCheckIn";

interface Location {
  type: string;
  coordinates: number[];
  address?: string;
}

interface Visit {
  _id: string;
  employeeId: { _id: string; name: string; email: string; avatar?: string; employeeId: string };
  clientId: string;
  clientType: "company" | "lead";
  clientName: string;
  scheduledDate?: string;
  scheduledTime?: string;
  checkInTime?: string;
  checkOutTime?: string;
  checkInSelfie?: string;
  checkInLocation?: Location;
  checkOutLocation?: Location;
  status: "scheduled" | "checked_in" | "checked_out" | "cancelled";
  outcome?: "completed" | "rescheduled" | "no_show";
  meetingNotes?: string;
  remarks?: string;
  remarksAddedAt?: string;
  geoFenceBreached?: boolean;
  geoFenceRadius?: number;
  trackingStartedAt?: string;
  trackingEndedAt?: string;
  expenses?: any[];
  createdAt?: string;
}

interface Props {
  onAddRemarks: (id: string) => void;
  onCheckInComplete?: (visitId: string) => void;
  refreshKey?: number;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  checked_in: "bg-green-100 text-green-800",
  checked_out: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

const OUTCOME_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  rescheduled: "bg-amber-100 text-amber-700",
  no_show: "bg-red-100 text-red-700",
};

const FieldVisitList: React.FC<Props> = ({ onAddRemarks, onCheckInComplete, refreshKey }) => {
  const { user } = useAuthStore();
  const currentUserId = user?._id;
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [checkingInVisitId, setCheckingInVisitId] = useState<string | null>(null);
  const [showNewVisit, setShowNewVisit] = useState(false);

  const fetchVisits = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/field-visits", { params });
      setVisits(res.data.visits || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisits();
  }, [statusFilter, refreshKey]);

  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const handleQuickCheckOut = async (visitId: string) => {
    setCheckingOut(visitId);
    try {
      await api.post(`/field-visits/${visitId}/check-out`, {});
      toast.success("Checked out successfully");
      fetchVisits();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Check-out failed");
    } finally {
      setCheckingOut(null);
    }
  };

  const handleCheckinComplete = (newVisitId?: string) => {
    setCheckingInVisitId(null);
    setShowNewVisit(false);
    fetchVisits();
    if (newVisitId && onCheckInComplete) { onCheckInComplete(newVisitId); }
  };

  const filtered = visits.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.clientName?.toLowerCase().includes(q) ||
      v.employeeId?.name?.toLowerCase().includes(q) ||
      v.meetingNotes?.toLowerCase().includes(q)
    );
  });

  const formatTime = (t?: string) => {
    if (!t) return "";
    return new Date(t).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search visits..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="checked_in">Checked In</option>
            <option value="checked_out">Checked Out</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => setShowNewVisit(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Mark Your Visit
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading visits...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No field visits found</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((visit) => {
              return (
                <div
                  key={visit._id}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {visit.employeeId?.avatar ? (
                        <img src={`${import.meta.env.VITE_SOCKET_URL || 'https://flowdesk-backend-l5tt.onrender.com'}${visit.employeeId.avatar}`} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <User size={14} className="text-blue-600" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{visit.employeeId?.name || "Unknown"}</p>
                        <p className="text-xs text-gray-500">{visit.employeeId?.employeeId}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[visit.status] || ""}`}>
                      {visit.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm text-gray-700 mb-1.5">
                    <Building2 size={14} className="text-gray-400" />
                    <span>{visit.clientName || visit.clientType}</span>
                  </div>

                  {(visit.scheduledDate || visit.scheduledTime) && !visit.checkInTime && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <CalendarDays size={12} />
                      <span>Scheduled: {visit.scheduledDate ? formatTime(visit.scheduledDate) : ""}{visit.scheduledTime ? ` at ${visit.scheduledTime}` : ""}</span>
                    </div>
                  )}

                  {visit.createdAt && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                      <Timer size={12} />
                      <span>Created: {formatTime(visit.createdAt)}</span>
                    </div>
                  )}

                  {visit.checkInTime && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <MapPin size={12} className="text-green-500" />
                      <span>Checked in: {formatTime(visit.checkInTime)}</span>
                    </div>
                  )}
                  {visit.checkInLocation?.address && (
                    <div className="ml-5 mb-1 flex items-start gap-1">
                      <p className="text-[10px] text-gray-400 line-clamp-1 flex-1">{visit.checkInLocation.address}</p>
                      {visit.checkInLocation?.coordinates?.length === 2 && (
                        <a
                          href={`https://www.google.com/maps?q=${visit.checkInLocation.coordinates[1]},${visit.checkInLocation.coordinates[0]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-blue-500 hover:text-blue-700"
                          title="View on map"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  )}
                  {visit.checkInSelfie && (
                    <div className="mb-2 ml-5">
                      <img
                        src={`${import.meta.env.VITE_SOCKET_URL || 'https://flowdesk-backend-l5tt.onrender.com'}/uploads/${visit.checkInSelfie}`}
                        className="w-full max-h-40 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(`${import.meta.env.VITE_SOCKET_URL || 'https://flowdesk-backend-l5tt.onrender.com'}/uploads/${visit.checkInSelfie}`, '_blank')}
                      />
                    </div>
                  )}

                  {visit.checkOutTime && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <CheckCircle size={12} className="text-blue-500" />
                      <span>Checked out: {formatTime(visit.checkOutTime)}</span>
                    </div>
                  )}
                  {visit.checkOutLocation?.address && (
                    <div className="ml-5 mb-1 flex items-start gap-1">
                      <p className="text-[10px] text-gray-400 line-clamp-1 flex-1">{visit.checkOutLocation.address}</p>
                      {visit.checkOutLocation?.coordinates?.length === 2 && (
                        <a
                          href={`https://www.google.com/maps?q=${visit.checkOutLocation.coordinates[1]},${visit.checkOutLocation.coordinates[0]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-blue-500 hover:text-blue-700"
                          title="View on map"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  )}

                  {isAdminOrManager && visit.trackingStartedAt && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                      <MapPinned size={12} className="text-purple-400" />
                      <span>Tracking: {formatTime(visit.trackingStartedAt)}{visit.trackingEndedAt ? ` - ${formatTime(visit.trackingEndedAt)}` : " (active)"}</span>
                    </div>
                  )}

                  {isAdminOrManager && visit.geoFenceBreached !== undefined && (
                    <div className={`flex items-center gap-1.5 text-xs mb-1 ${visit.geoFenceBreached ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                      <ShieldAlert size={12} className={visit.geoFenceBreached ? 'text-red-500' : ''} />
                      <span>Geo-fence: {visit.geoFenceBreached ? '⚠ Breached' : `Within ${visit.geoFenceRadius || 100}m`}</span>
                    </div>
                  )}

                  {visit.expenses && visit.expenses.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <DollarSign size={12} className="text-green-500" />
                      <span>{visit.expenses.length} expense{visit.expenses.length !== 1 ? 's' : ''} recorded</span>
                    </div>
                  )}

                  {visit.meetingNotes && (
                    <p className="text-xs text-gray-400 mt-2 line-clamp-2">{visit.meetingNotes}</p>
                  )}

                  {visit.remarks && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-center gap-1 mb-1">
                        <MessageSquareText size={11} className="text-gray-400" />
                        <span className="text-[10px] text-gray-400 font-medium">Remarks</span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">{visit.remarks}</p>
                    </div>
                  )}

                  {visit.outcome && visit.status === "checked_out" && (
                    <div className="mt-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${OUTCOME_COLORS[visit.outcome] || ""}`}>
                        {visit.outcome.replace("_", " ")}
                      </span>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                    {visit.employeeId?._id === currentUserId && visit.status === "scheduled" && (
                      <button
                        onClick={() => setCheckingInVisitId(visit._id)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <LogIn size={13} /> Check In
                      </button>
                    )}
                    {visit.employeeId?._id === currentUserId && visit.status === "checked_in" && (
                      <button
                        onClick={() => handleQuickCheckOut(visit._id)}
                        disabled={checkingOut === visit._id}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                      >
                        {checkingOut === visit._id ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                        {checkingOut === visit._id ? "Checking out..." : "Check Out"}
                      </button>
                    )}
                    {visit.employeeId?._id === currentUserId && visit.status === "checked_out" && (
                      <button
                        onClick={() => onAddRemarks(visit._id)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-600 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        <MessageSquareText size={13} /> {visit.remarks ? "Edit Remarks" : "Add Remarks"}
                      </button>
                    )}
                    {visit.employeeId?._id !== currentUserId && (
                      <span className="flex-1 text-center text-xs text-gray-400 py-1.5">
                        Assigned to {visit.employeeId?.name}
                      </span>
                    )}
                    {(visit.status === "cancelled") && visit.employeeId?._id === currentUserId && (
                      <span className="flex-1 text-center text-xs text-gray-400 py-1.5">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(checkingInVisitId !== null || showNewVisit) && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setCheckingInVisitId(null); setShowNewVisit(false); }}
              className="absolute top-3 right-3 z-10 bg-white/80 rounded-full p-1 text-gray-500 hover:text-gray-700"
            >
              <X size={18} />
            </button>
            <FieldVisitCheckIn
              visitId={showNewVisit ? "" : checkingInVisitId}
              onComplete={handleCheckinComplete}
              onCancel={() => { setCheckingInVisitId(null); setShowNewVisit(false); }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default FieldVisitList;
