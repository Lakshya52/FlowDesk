import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageSquareText, Clock, CheckCircle, XCircle, CalendarDays, User, Phone } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";

interface Props {
  visitId: string;
  onComplete: () => void;
  onCancel: () => void;
}

type OutcomeType = "completed" | "rescheduled" | "no_contact" | "met_other" | "";

const FieldVisitRemarks: React.FC<Props> = ({ visitId, onComplete, onCancel }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState("");
  const [existingRemarks, setExistingRemarks] = useState("");
  const [remarksAddedAt, setRemarksAddedAt] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OutcomeType>("");

  const [rescheduledDate, setRescheduledDate] = useState("");
  const [rescheduledTime, setRescheduledTime] = useState("");

  const [otherPersonName, setOtherPersonName] = useState("");
  const [otherPersonContact, setOtherPersonContact] = useState("");
  const [otherPersonNotes, setOtherPersonNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientType, setClientType] = useState("lead");

  useEffect(() => {
    fetchVisit();
  }, [visitId]);

  const fetchVisit = async () => {
    try {
      const res = await api.get(`/field-visits/${visitId}`);
      const visit = res.data.visit;
      setClientName(visit.clientName || "Visit");
      setClientId(visit.clientId?._id || visit.clientId || "");
      setClientType(visit.clientType || "lead");
      if (visit.remarks) {
        setExistingRemarks(visit.remarks);
        setRemarks(visit.remarks);
      }
      if (visit.remarksAddedAt) {
        setRemarksAddedAt(visit.remarksAddedAt);
      }
      if (visit.outcome) {
        setOutcome(visit.outcome);
      }
      if (visit.rescheduledDate) {
        setRescheduledDate(new Date(visit.rescheduledDate).toISOString().split("T")[0]);
      }
      if (visit.rescheduledTime) {
        setRescheduledTime(visit.rescheduledTime);
      }
      if (visit.otherPersonName) {
        setOtherPersonName(visit.otherPersonName);
      }
      if (visit.otherPersonContact) {
        setOtherPersonContact(visit.otherPersonContact);
      }
      if (visit.otherPersonNotes) {
        setOtherPersonNotes(visit.otherPersonNotes);
      }
    } catch {
      toast.error("Failed to load visit details");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!remarks.trim()) {
      toast.error("Please enter some remarks");
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = { remarks: remarks.trim() };
      if (outcome) payload.outcome = outcome;

      if (outcome === "rescheduled") {
        if (rescheduledDate) payload.rescheduledDate = new Date(rescheduledDate).toISOString();
        if (rescheduledTime) payload.rescheduledTime = rescheduledTime;
      }

      if (outcome === "met_other") {
        if (otherPersonName) payload.otherPersonName = otherPersonName;
        if (otherPersonContact) payload.otherPersonContact = otherPersonContact;
        if (otherPersonNotes) payload.otherPersonNotes = otherPersonNotes;
      }

      await api.post(`/field-visits/${visitId}/remarks`, payload);

      let noteText = "";

      if (outcome === "completed") {
        noteText = `Visit completed: ${remarks.trim()}`;
      } else if (outcome === "rescheduled") {
        const dateStr = rescheduledDate ? new Date(rescheduledDate).toLocaleDateString("en-IN") : "";
        const timeStr = rescheduledTime || "";
        noteText = `Visit rescheduled to ${dateStr} at ${timeStr}: ${remarks.trim()}`;
        if (clientId) {
          await api.post("/field-visits", {
            clientId,
            clientType,
            clientName: clientName || "Visit",
            scheduledDate: rescheduledDate ? new Date(rescheduledDate).toISOString() : undefined,
            scheduledTime: rescheduledTime || undefined,
          });
        }
      } else if (outcome === "no_contact") {
        noteText = `No contact: ${remarks.trim()}`;
      } else if (outcome === "met_other") {
        let metText = `Met with ${otherPersonName || "Unknown"}`;
        if (otherPersonContact) metText += ` (${otherPersonContact})`;
        if (otherPersonNotes) metText += ` - ${otherPersonNotes}`;
        noteText = metText;
      }

      if (noteText && clientId) {
        await api.post(`/leads/${clientId}/notes`, { text: noteText });
      }

      toast.success("Saved successfully!");
      onComplete();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-(--color-surface) p-6 text-center">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-(--color-primary)" />
        <p className="text-sm text-(--color-text-tertiary)">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-(--color-surface) p-6">
      <h2 className="text-lg font-semibold mb-1 text-(--color-text)">Visit Details</h2>
      <p className="text-sm mb-4">
        <button onClick={() => clientId && navigate(`/crm/dial?leadId=${clientId}`)} className={`${clientId ? "text-(--color-primary) hover:text-(--color-primary-hover) hover:underline" : "text-(--color-text-tertiary)"}`}>
          {clientName}
        </button>
      </p>

      <div className="space-y-4">
        {remarksAddedAt && (
          <div className="flex items-center gap-1.5 text-xs text-(--color-text-tertiary)">
            <Clock size={12} />
            <span>Previously added: {new Date(remarksAddedAt).toLocaleString("en-IN")}</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-(--color-text-secondary) mb-2">Outcome *</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOutcome(outcome === "completed" ? "" : "completed")}
              className={`flex cursor-pointer  items-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium border ${
                outcome === "completed" ? "bg-(--color-success-light) border-(--color-success) text-(--color-success)" : "border-(--color-border) text-(--color-text-secondary) hover:bg-(--color-surface-hover)"
              }`}
            >
              <CheckCircle size={15} /> Success
            </button>
            <button
              onClick={() => setOutcome(outcome === "rescheduled" ? "" : "rescheduled")}
              className={`flex cursor-pointer  items-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium border ${
                outcome === "rescheduled" ? "bg-(--color-warning-light) border-(--color-warning) text-(--color-warning)" : "border-(--color-border) text-(--color-text-secondary) hover:bg-(--color-surface-hover)"
              }`}
            >
              <CalendarDays size={15} /> Rescheduled
            </button>
            <button
              onClick={() => setOutcome(outcome === "no_contact" ? "" : "no_contact")}
              className={`flex cursor-pointer  items-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium border ${
                outcome === "no_contact" ? "bg-(--color-danger-light) border-(--color-danger) text-(--color-danger)" : "border-(--color-border) text-(--color-text-secondary) hover:bg-(--color-surface-hover)"
              }`}
            >
              <XCircle size={15} /> No Contact
            </button>
            <button
              onClick={() => setOutcome(outcome === "met_other" ? "" : "met_other")}
              className={`flex cursor-pointer  items-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium border ${
                outcome === "met_other" ? "bg-(--color-primary-light) border-(--color-primary) text-(--color-primary)" : "border-(--color-border) text-(--color-text-secondary) hover:bg-(--color-surface-hover)"
              }`}
            >
              <User size={15} /> Met Other
            </button>
          </div>
        </div>

        {outcome === "rescheduled" && (
          <div className="p-3 bg-(--color-warning-light) rounded-lg border border-(--color-warning) space-y-3">
            <p className="text-xs font-medium text-(--color-warning)">New scheduled date & time</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Date</label>
                <input
                  type="date"
                  value={rescheduledDate}
                  onChange={(e) => setRescheduledDate(e.target.value)}
                  className="w-full px-3 py-2 bg-(--color-surface) text-(--color-text) border border-(--color-border) rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Time</label>
                <input
                  type="time"
                  value={rescheduledTime}
                  onChange={(e) => setRescheduledTime(e.target.value)}
                  className="w-full px-3 py-2 bg-(--color-surface) text-(--color-text) border border-(--color-border) rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {outcome === "no_contact" && (
          <div className="p-3 bg-(--color-danger-light) rounded-lg border border-(--color-danger)">
            <div className="flex items-start gap-2">
              <XCircle size={16} className="text-(--color-danger) mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-(--color-danger)">Person not available</p>
                <p className="text-xs text-(--color-danger)">Visit happened but the person was not available. A retry will be scheduled.</p>
              </div>
            </div>
          </div>
        )}

        {outcome === "met_other" && (
          <div className="p-3 bg-(--color-primary-light) rounded-lg border border-(--color-primary-light) space-y-3">
            <p className="text-xs font-medium text-(--color-primary-hover)">Person met details</p>
            <div>
              <label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">
                <User size={11} className="inline mr-1" /> Name *
              </label>
              <input
                type="text"
                value={otherPersonName}
                onChange={(e) => setOtherPersonName(e.target.value)}
                placeholder="Person's name"
                className="w-full px-3 py-2 bg-(--color-surface) text-(--color-text) border border-(--color-border) rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">
                <Phone size={11} className="inline mr-1" /> Contact (optional)
              </label>
              <input
                type="text"
                value={otherPersonContact}
                onChange={(e) => setOtherPersonContact(e.target.value)}
                placeholder="Phone or email"
                className="w-full px-3 py-2 bg-(--color-surface) text-(--color-text) border border-(--color-border) rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-(--color-text-tertiary) mb-1">Meeting outcome (optional)</label>
              <input
                type="text"
                value={otherPersonNotes}
                onChange={(e) => setOtherPersonNotes(e.target.value)}
                placeholder="Brief outcome of the meeting"
                className="w-full px-3 py-2 bg-(--color-surface) text-(--color-text) border border-(--color-border) rounded-lg text-sm"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-(--color-text-secondary) mb-1">
            <MessageSquareText size={14} className="inline mr-1" />
            Remarks *
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={5}
            placeholder="Add your remarks about this visit..."
            className="w-full px-3 py-2 bg-(--color-surface) text-(--color-text) border border-(--color-border) rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>

        <div className="flex justify-between pt-2">
          <button onClick={onCancel} className="px-4 cursor-pointer py-2 text-sm text-(--color-text-secondary)">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !remarks.trim()}
            className="px-6 py-2 text-sm bg-(--color-primary) cursor-pointer  text-white rounded-lg hover:bg-(--color-primary-hover) disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {existingRemarks ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldVisitRemarks;
