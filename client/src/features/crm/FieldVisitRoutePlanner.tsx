import React, { useState, useEffect } from "react";
import { Loader2, Save, Plus, User, Building2, CalendarDays, X, Clock, LayoutList,AlignJustify } from "lucide-react";
import toast from "react-hot-toast";
import api from '@/lib/api';
import {useAuthStore} from '@/store/authStore';



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
  const [loadingLeads, setLoadingLeads] = useState(false);

  const [editingTime, setEditingTime] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchEmployees();
  }, [refreshKey]);

  useEffect(() => {
    if (selectedEmployee) {
      fetchScheduledVisits();
    }
  }, [selectedEmployee, refreshKey]);

  useEffect(() => {
    if (!showAdd) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAdd(false);
        setSelectedLead(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAdd]);

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
    setLoadingLeads(true);
    try {
      const res = await api.get("/leads", { params: { limit: 100000 } });
      setLeads(res.data.leads || []);
    } catch {
      toast.error("Failed to load leads");
    } finally {
      setLoadingLeads(false);
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
        <div className="flex-1 min-w-50">
          <label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Employee</label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
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
          className="flex items-center gap-1.5 px-4 py-2 bg-(--color-primary) text-white text-sm font-medium rounded-lg hover:bg-(--color-primary-hover) disabled:opacity-50 transition-colors"
        >
          <Plus size={16} /> Schedule Visit
        </button>
      </div>

      {!selectedEmployee ? (
        <div className="text-center py-12 bg-(--color-surface-hover) rounded-xl border border-(--color-border)">
          <User size={40} className="mx-auto text-(--color-text-tertiary) mb-2" />
          <p className="text-(--color-text-tertiary)">Select an employee to plan their route</p>
        </div>
      ) : loading ? (
        <div className="text-center py-8 text-(--color-text-tertiary)">Loading visits...</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-12 bg-(--color-surface-hover) rounded-xl border border-(--color-border)">
          <CalendarDays size={40} className="mx-auto text-(--color-text-tertiary) mb-2" />
          <p className="text-(--color-text-tertiary)">
            No scheduled visits for {selectedEmployeeName}
          </p>
          <button
            onClick={() => {
              setShowAdd(true);
              fetchLeads();
            }}
            className="mt-3 inline-flex items-center gap-1 text-sm text-(--color-primary) hover:text-(--color-primary-hover)"
          >
            <Plus size={14} /> Schedule their first visit
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-(--color-text-secondary)">
              {visits.length} visit{visits.length > 1 ? "s" : ""} for <strong>{selectedEmployeeName}</strong>
            </p>
            <div className="flex items-center gap-1 bg-(--color-surface-hover) rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("cards")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  viewMode === "cards" ? "bg-(--color-surface) shadow-sm text-(--color-primary)" : "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
                }`}
                title="Card view"
              >
                <LayoutList size={16} />
              </button>
              <button
                onClick={() => setViewMode("timeline")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  viewMode === "timeline" ? "bg-(--color-surface) shadow-sm text-(--color-primary)" : "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
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
                  className="bg-(--color-surface) rounded-lg border border-(--color-border) p-3 flex items-center gap-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveVisit(index, -1)}
                      disabled={index === 0}
                      className="text-(--color-text-tertiary) hover:text-(--color-text-secondary) disabled:opacity-30 text-xs leading-none"
                    >
                      ▲
                    </button>
                    <span className="text-xs font-mono text-center text-(--color-text-tertiary)">{index + 1}</span>
                    <button
                      onClick={() => moveVisit(index, 1)}
                      disabled={index === visits.length - 1}
                      className="text-(--color-text-tertiary) hover:text-(--color-text-secondary) disabled:opacity-30 text-xs leading-none"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--color-text) truncate">
                      {visit.clientName || "Unnamed Client"}
                    </p>
                    <p className="text-xs text-(--color-text-tertiary) capitalize">{visit.clientType}</p>
                  </div>
                  <div className="min-w-30">
                    <div className="flex items-center gap-1">
                      <Clock size={12} className="text-(--color-text-tertiary) shrink-0" />
                      <input
                        type="time"
                        value={editingTime[visit._id] || ""}
                        onChange={(e) => updateVisitTime(visit._id, e.target.value)}
                        className="w-full px-1.5 py-1 text-xs border border-(--color-border) rounded focus:outline-none focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    visit.status === "scheduled" ? "bg-(--color-primary-light) text-(--color-primary-hover)" :
                    visit.status === "checked_in" ? "bg-(--color-success-light) text-(--color-success)" :
                    "bg-(--color-surface-hover) text-(--color-text-secondary)"
                  }`}>
                    {visit.status.replace("_", " ")}
                  </span>
                  {index < visits.length - 1 && (
                    <span className="text-(--color-text-tertiary) shrink-0 text-lg">→</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-(--color-primary-light) rounded" />
              <div className="space-y-4">
                {sortedByTime.map((visit, index) => (
                  <div key={visit._id} className="relative pl-10">
                    <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-(--color-primary) border-2 border-(--color-surface) shadow" />
                    <div className="bg-(--color-surface) rounded-lg border border-(--color-border) p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-(--color-primary)" />
                          <span className="text-xs font-semibold text-(--color-primary-hover)">
                            {visit.scheduledTime || "--:--"}
                          </span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          visit.status === "scheduled" ? "bg-(--color-primary-light) text-(--color-primary-hover)" :
                          visit.status === "checked_in" ? "bg-(--color-success-light) text-(--color-success)" :
                          "bg-(--color-surface-hover) text-(--color-text-secondary)"
                        }`}>
                          {visit.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-(--color-text)">
                        {visit.clientName || "Unnamed Client"}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-xs text-(--color-text-tertiary) capitalize">{visit.clientType}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-(--color-text-tertiary)">#{index + 1}</span>
                          <input
                            type="time"
                            value={editingTime[visit._id] || ""}
                            onChange={(e) => updateVisitTime(visit._id, e.target.value)}
                            className="w-20 px-1 py-0.5 text-[10px] border border-(--color-border) rounded focus:outline-none focus:ring-1 focus:ring-(--color-primary)"
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
            className="w-full py-2.5 bg-(--color-primary) text-white rounded-lg text-sm font-medium hover:bg-(--color-primary-hover) disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Route Order
          </button>
        </>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-(--color-surface) rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-(--color-text)">Schedule Visit</h3>
              <button onClick={() => { setShowAdd(false); setSelectedLead(null); }} className="text-(--color-text-tertiary) hover:text-(--color-text-secondary)">
                <X size={18} />
              </button>
            </div>

            {selectedEmployeeData && (
              <div className="flex items-center gap-3 p-3 bg-(--color-primary-light) rounded-lg border border-(--color-primary-light)">
                {selectedEmployeeData.avatar ? (
                  <img src={`${import.meta.env.VITE_SOCKET_URL || 'https://flowdesk-backend-l5tt.onrender.com'}${selectedEmployeeData.avatar}`} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-(--color-primary-light) flex items-center justify-center">
                    <User size={18} className="text-(--color-primary)" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-(--color-primary-hover)">{selectedEmployeeData.name}</p>
                  <p className="text-xs text-(--color-primary)">{selectedEmployeeData.employeeId} {selectedEmployeeData.email}</p>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 size={14} className="text-(--color-primary)" />
                <span className="text-sm font-medium text-(--color-text-secondary)">Select Lead</span>
              </div>
              <input
                type="text"
                placeholder="Search leads by name, company, phone..."
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
              />
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1">
              {loadingLeads ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-(--color-primary)" />
                </div>
              ) : (
                filteredLeads.map((c) => (
                  <button
                    key={c._id}
                    onClick={() => setSelectedLead(c)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedLead?._id === c._id
                        ? "bg-(--color-primary-light) border border-(--color-primary-light)"
                        : "hover:bg-(--color-surface-hover) border border-transparent"
                    }`}
                  >
                    <p className="font-medium text-(--color-text)">{c.name || c.companyName || "Unnamed"}</p>
                    <p className="text-xs text-(--color-text-tertiary)">
                      {c.companyName && `${c.companyName}`}{c.city ? ` - ${c.city}` : ""}{c.phone ? ` | ${c.phone}` : ""}
                    </p>
                  </button>
                ))
              )}
              {!loadingLeads && filteredLeads.length === 0 && (
                <p className="text-xs text-(--color-text-tertiary) text-center py-4">No leads found</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">
                <CalendarDays size={12} className="inline mr-1" /> Scheduled Date
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">
                <Clock size={12} className="inline mr-1" /> Scheduled Time
              </label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                step="60"
                className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowAdd(false); setSelectedLead(null); }}
                className="px-4 py-2 text-sm text-(--color-text-secondary) border border-(--color-border) rounded-lg hover:bg-(--color-surface-hover)"
              >
                Cancel
              </button>
              <button
                onClick={handleAddVisit}
                disabled={!selectedLead || adding}
                className="px-4 py-2 text-sm bg-(--color-primary) text-white rounded-lg hover:bg-(--color-primary-hover) disabled:opacity-50 flex items-center gap-1"
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
