import React, { useState, useEffect } from "react";
import { Loader2, Save, Plus, User, Building2, CalendarDays, X, Clock, LayoutList,AlignJustify } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";
import {useAuthStore} from "../../store/authStore";



interface Visit {
  _id: string;
  clientName: string;
  clientType: string;
  clientId: string;
  scheduledDate?: string;
  scheduledTime?: string;
  visitOrder?: number;
  status: string;
}

interface Employee {
  _id: string;
  name: string;
  email: string;
  employeeId: string;
  avatar?: string;
}

interface Lead {
  _id: string;
  name?: string;
  companyName?: string;
  phone?: string;
  city?: string;
  state?: string;
}

const FieldVisitRoutePlanner: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "timeline">("cards");

  const [showAdd, setShowAdd] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split("T")[0]);
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [adding, setAdding] = useState(false);

  const [editingTime, setEditingTime] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchEmployees();
  }, [refreshKey]);

  useEffect(() => {
    if (selectedEmployee) {
      fetchScheduledVisits();
    }
  }, [selectedEmployee, refreshKey]);

  const fetchEmployees = async () => {
    try {
      const res = await api.get("/users");
      setEmployees(res.data.users || []);
    } catch {
      toast.error("Failed to load employees");
    }
  };

  const fetchScheduledVisits = async () => {
    try {
      setLoading(true);
      const res = await api.get("/field-visits", {
        params: {
          employeeId: selectedEmployee,
          visitType: 'scheduled',
        },
      });
      const sorted = (res.data.visits || []).sort(
        (a: Visit, b: Visit) => (a.visitOrder || 999) - (b.visitOrder || 999)
      );
      setVisits(sorted);

      const times: Record<string, string> = {};
      sorted.forEach((v: Visit) => {
        if (v.scheduledTime) times[v._id] = v.scheduledTime;
      });
      setEditingTime(times);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await api.get("/leads", { params: { limit: 100000 } });
      setLeads(res.data.leads || []);
    } catch {
      toast.error("Failed to load leads");
    }
  };

  const moveVisit = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= visits.length) return;
    const copy = [...visits];
    [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
    setVisits(copy);
  };

  const updateVisitTime = async (visitId: string, time: string) => {
    setEditingTime((prev) => ({ ...prev, [visitId]: time }));
    try {
      await api.put(`/field-visits/${visitId}`, { scheduledTime: time });
      toast.success("Time updated");
    } catch {
      toast.error("Failed to update time");
    }
  };

  const saveRoute = async () => {
    setSaving(true);
    try {
      const visitIds = visits.map((v) => v._id);
      await api.post("/field-visits/optimize-route", { visitIds });
      toast.success("Route order saved!");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save route");
    } finally {
      setSaving(false);
    }
  };

  const handleAddVisit = async () => {
    if (!selectedEmployee || !selectedLead) return;
    setAdding(true);
    try {
      await api.post("/field-visits", {
        clientId: selectedLead._id,
        clientType: "lead",
        clientName: selectedLead.name || selectedLead.companyName || "",
        employeeId: selectedEmployee,
        scheduledDate: new Date(scheduledDate).toISOString(),
        scheduledTime,
      });
      toast.success("Visit scheduled");
      setShowAdd(false);
      setSelectedLead(null);
      setLeadSearch("");
      fetchScheduledVisits();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to schedule visit");
    } finally {
      setAdding(false);
    }
  };

  const filteredLeads = leads.filter((c) => {
    if (!leadSearch) return true;
    const q = leadSearch.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.companyName || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.city || "").toLowerCase().includes(q)
    );
  });

  const selectedEmployeeData = employees.find((e) => e._id === selectedEmployee);
  const selectedEmployeeName = selectedEmployeeData?.name;
  console.log("Selected Employee Data:", selectedEmployeeData);

  const sortedByTime = [...visits].sort((a, b) => {
    const aTime = a.scheduledTime || "00:00";
    const bTime = b.scheduledTime || "00:00";
    return aTime.localeCompare(bTime);
  });

  const { user } = useAuthStore();

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Employee</label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select employee...</option>
            {employees.map((emp) => (
              <option key={emp._id} value={emp._id}>
                {emp.name}
                  {user?._id === emp._id && <span className="text-xs text-(--color-primary) ml-1"> (You)</span>}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            setShowAdd(true);
            fetchLeads();
          }}
          disabled={!selectedEmployee}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Plus size={16} /> Schedule Visit
        </button>
      </div>

      {!selectedEmployee ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <User size={40} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">Select an employee to plan their route</p>
        </div>
      ) : loading ? (
        <div className="text-center py-8 text-gray-500">Loading visits...</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <CalendarDays size={40} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">
            No scheduled visits for {selectedEmployeeName}
          </p>
          <button
            onClick={() => {
              setShowAdd(true);
              fetchLeads();
            }}
            className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus size={14} /> Schedule their first visit
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {visits.length} visit{visits.length > 1 ? "s" : ""} for <strong>{selectedEmployeeName}</strong>
            </p>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("cards")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  viewMode === "cards" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                }`}
                title="Card view"
              >
                <LayoutList size={16} />
              </button>
              <button
                onClick={() => setViewMode("timeline")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  viewMode === "timeline" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                }`}
                title="Timeline view"
              >
                <AlignJustify size={16} />
              </button>
            </div>
          </div>

          {viewMode === "cards" ? (
            <div className="space-y-2">
              {visits.map((visit, index) => (
                <div
                  key={visit._id}
                  className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveVisit(index, -1)}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                    >
                      ▲
                    </button>
                    <span className="text-xs font-mono text-center text-gray-500">{index + 1}</span>
                    <button
                      onClick={() => moveVisit(index, 1)}
                      disabled={index === visits.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {visit.clientName || "Unnamed Client"}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{visit.clientType}</p>
                  </div>
                  <div className="min-w-[120px]">
                    <div className="flex items-center gap-1">
                      <Clock size={12} className="text-gray-400 shrink-0" />
                      <input
                        type="time"
                        value={editingTime[visit._id] || ""}
                        onChange={(e) => updateVisitTime(visit._id, e.target.value)}
                        className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    visit.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                    visit.status === "checked_in" ? "bg-green-100 text-green-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {visit.status.replace("_", " ")}
                  </span>
                  {index < visits.length - 1 && (
                    <span className="text-gray-300 shrink-0 text-lg">→</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-blue-200 rounded" />
              <div className="space-y-4">
                {sortedByTime.map((visit, index) => (
                  <div key={visit._id} className="relative pl-10">
                    <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" />
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-blue-500" />
                          <span className="text-xs font-semibold text-blue-700">
                            {visit.scheduledTime || "--:--"}
                          </span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          visit.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                          visit.status === "checked_in" ? "bg-green-100 text-green-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {visit.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {visit.clientName || "Unnamed Client"}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-xs text-gray-500 capitalize">{visit.clientType}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400">#{index + 1}</span>
                          <input
                            type="time"
                            value={editingTime[visit._id] || ""}
                            onChange={(e) => updateVisitTime(visit._id, e.target.value)}
                            className="w-20 px-1 py-0.5 text-[10px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={saveRoute}
            disabled={saving || visits.length < 2}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Route Order
          </button>
        </>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Schedule Visit</h3>
              <button onClick={() => { setShowAdd(false); setSelectedLead(null); }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {selectedEmployeeData && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                {selectedEmployeeData.avatar ? (
                  <img src={`${import.meta.env.VITE_SOCKET_URL || 'https://flowdesk-backend-l5tt.onrender.com'}${selectedEmployeeData.avatar}`} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <User size={18} className="text-blue-600" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-blue-900">{selectedEmployeeData.name}</p>
                  <p className="text-xs text-blue-600">{selectedEmployeeData.employeeId} {selectedEmployeeData.email}</p>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 size={14} className="text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Select Lead</span>
              </div>
              <input
                type="text"
                placeholder="Search leads by name, company, phone..."
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1">
              {filteredLeads.map((c) => (
                <button
                  key={c._id}
                  onClick={() => setSelectedLead(c)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedLead?._id === c._id
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50 border border-transparent"
                  }`}
                >
                  <p className="font-medium text-gray-900">{c.name || c.companyName || "Unnamed"}</p>
                  <p className="text-xs text-gray-500">
                    {c.companyName && `${c.companyName}`}{c.city ? ` - ${c.city}` : ""}{c.phone ? ` | ${c.phone}` : ""}
                  </p>
                </button>
              ))}
              {filteredLeads.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No leads found</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                <CalendarDays size={12} className="inline mr-1" /> Scheduled Date
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                <Clock size={12} className="inline mr-1" /> Scheduled Time
              </label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                step="60"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowAdd(false); setSelectedLead(null); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddVisit}
                disabled={!selectedLead || adding}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                {adding && <Loader2 size={14} className="animate-spin" />}
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldVisitRoutePlanner;
