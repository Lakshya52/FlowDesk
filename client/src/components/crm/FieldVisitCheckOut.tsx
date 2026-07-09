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

  const [outcome, setOutcome] = useState<"completed" | "rescheduled" | "no_show" | "">("");
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold mb-4 text-gray-900">Check-Out</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Clock size={14} className="inline mr-1" />
            Check-Out Time
          </label>
          <input
            type="datetime-local"
            value={checkOutTime}
            onChange={(e) => setCheckOutTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">You can set any time for checkout, even later in the evening</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Outcome (optional)</label>
          <div className="flex gap-2">
            {(["completed", "rescheduled", "no_show"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOutcome(outcome === o ? "" : o)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border capitalize ${
                  outcome === o
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {o.replace("_", " ")}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">You can add outcome later if needed</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Notes (optional)</label>
          <textarea
            value={meetingNotes}
            onChange={(e) => setMeetingNotes(e.target.value)}
            rows={3}
            placeholder="Describe how the visit went..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Follow-Up Date (optional)</label>
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer Signature (optional)</label>
          {signature ? (
            <div className="relative inline-block">
              <img src={signature} alt="Signature" className="h-16 border rounded" />
              <button
                onClick={() => setSignature("")}
                className="ml-2 text-xs text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSignature(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
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

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          You can add remarks and meeting details anytime after check-out from the visit list.
        </div>

        <div className="flex justify-between pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
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
