import React, { useState } from "react";
import { Loader2, Signature as SignatureIcon, Clock } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";
import SignaturePad from "../common/SignaturePad";

interface Props {
  visitId: string;
  onComplete: () => void;
  onCancel: () => void;
}

const FieldVisitCheckOut: React.FC<Props> = ({ visitId, onComplete, onCancel }) => {
  const now = new Date();
  const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [outcome, setOutcome] = useState<"completed" | "rescheduled" | "no_contact" | "met_other" | "">("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [signature, setSignature] = useState<string>("");
  const [showSignature, setShowSignature] = useState(false);
  const [checkOutTime, setCheckOutTime] = useState(localISO);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload: any = {};
      if (outcome) payload.outcome = outcome;
      if (meetingNotes) payload.meetingNotes = meetingNotes;
      if (followUpDate) payload.followUpDate = new Date(followUpDate).toISOString();
      if (signature) payload.digitalSignature = signature;
      if (checkOutTime) payload.checkOutTime = new Date(checkOutTime).toISOString();

      await api.post(`/field-visits/${visitId}/check-out`, payload);

      toast.success("Checked out successfully!");
      onComplete();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Check-out failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-(--color-surface) rounded-xl border border-(--color-border) p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold mb-4 text-(--color-text)">Check-Out</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-(--color-text-secondary) mb-1">
            <Clock size={14} className="inline mr-1" />
            Check-Out Time
          </label>
          <input
            type="datetime-local"
            value={checkOutTime}
            onChange={(e) => setCheckOutTime(e.target.value)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
          <p className="text-xs text-(--color-text-tertiary) mt-1">You can set any time for checkout, even later in the evening</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-(--color-text-secondary) mb-1">Outcome (optional)</label>
          <div className="flex gap-2">
            {(["completed", "rescheduled", "no_contact", "met_other"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOutcome(outcome === o ? "" : o)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border capitalize ${
                  outcome === o
                    ? "bg-(--color-primary-light) border-(--color-primary-light) text-(--color-primary-hover)"
                    : "border-(--color-border) text-(--color-text-secondary) hover:bg-(--color-surface-hover)"
                }`}
              >
                {o.replace("_", " ")}
              </button>
            ))}
          </div>
          <p className="text-xs text-(--color-text-tertiary) mt-1">You can add outcome later if needed</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-(--color-text-secondary) mb-1">Meeting Notes (optional)</label>
          <textarea
            value={meetingNotes}
            onChange={(e) => setMeetingNotes(e.target.value)}
            rows={3}
            placeholder="Describe how the visit went..."
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-(--color-text-secondary) mb-1">Follow-Up Date (optional)</label>
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-(--color-text-secondary) mb-1">Customer Signature (optional)</label>
          {signature ? (
            <div className="relative inline-block">
              <img src={signature} alt="Signature" className="h-16 border rounded" />
              <button
                onClick={() => setSignature("")}
                className="ml-2 text-xs text-(--color-danger) text-(--color-danger)"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSignature(true)}
              className="flex items-center gap-2 px-4 py-2 border border-(--color-border) rounded-lg text-sm text-(--color-text-secondary) hover:bg-(--color-surface-hover)"
            >
              <SignatureIcon size={16} /> Add Signature
            </button>
          )}
          {showSignature && (
            <SignaturePad
              onSave={(dataUrl) => {
                setSignature(dataUrl);
                setShowSignature(false);
              }}
              onClose={() => setShowSignature(false)}
            />
          )}
        </div>

        <div className="bg-(--color-warning-light) border border-(--color-warning) rounded-lg p-3 text-xs text-(--color-warning)">
          You can add remarks and meeting details anytime after check-out from the visit list.
        </div>

        <div className="flex justify-between pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-(--color-text-secondary) text-(--color-text-secondary)">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 text-sm bg-(--color-primary) text-white rounded-lg hover:bg-(--color-primary-hover) disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Complete Check-Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldVisitCheckOut;
