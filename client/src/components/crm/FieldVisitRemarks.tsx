import React, { useState, useEffect } from "react";
import { Loader2, MessageSquareText, Clock } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";

interface Props {
  visitId: string;
  onComplete: () => void;
  onCancel: () => void;
}

const FieldVisitRemarks: React.FC<Props> = ({ visitId, onComplete, onCancel }) => {
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState("");
  const [existingRemarks, setExistingRemarks] = useState("");
  const [remarksAddedAt, setRemarksAddedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    fetchVisit();
  }, [visitId]);

  const fetchVisit = async () => {
    try {
      const res = await api.get(`/field-visits/${visitId}`);
      const visit = res.data.visit;
      setClientName(visit.clientName || "Visit");
      if (visit.remarks) {
        setExistingRemarks(visit.remarks);
        setRemarks(visit.remarks);
      }
      if (visit.remarksAddedAt) {
        setRemarksAddedAt(visit.remarksAddedAt);
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
      await api.post(`/field-visits/${visitId}/remarks`, { remarks: remarks.trim() });
      toast.success("Remarks saved successfully!");
      onComplete();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save remarks");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto text-center">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-600" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold mb-1 text-gray-900">Visit Remarks</h2>
      <p className="text-sm text-gray-500 mb-4">{clientName}</p>

      <div className="space-y-4">
        {remarksAddedAt && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={12} />
            <span>Previously added: {new Date(remarksAddedAt).toLocaleString("en-IN")}</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <MessageSquareText size={14} className="inline mr-1" />
            Remarks
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={5}
            placeholder="Add your remarks about this visit. You can add or edit this anytime..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Remarks can be added or edited anytime after check-out
          </p>
        </div>

        <div className="flex justify-between pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !remarks.trim()}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {existingRemarks ? "Update Remarks" : "Save Remarks"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldVisitRemarks;
