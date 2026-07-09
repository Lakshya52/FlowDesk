import React, { useState } from "react";
import { Plus, Trash2, Receipt, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";

interface Expense {
  _id?: string;
  type: "travel" | "fuel" | "food" | "other";
  amount: number;
  description: string;
  receiptImage?: string;
}

interface Props {
  visitId: string;
  expenses?: Expense[];
  onUpdate: () => void;
}

const FieldVisitExpenses: React.FC<Props> = ({ visitId, expenses: initial = [], onUpdate }) => {
  const [expenses, setExpenses] = useState<Expense[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"travel" | "fuel" | "food" | "other">("travel");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("amount", amount);
      formData.append("description", description);
      if (receipt) formData.append("receipt", receipt);

      const res = await api.post(`/field-visits/${visitId}/expenses`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setExpenses(res.data.visit.expenses || []);
      setShowForm(false);
      setType("travel");
      setAmount("");
      setDescription("");
      setReceipt(null);
      onUpdate();
      toast.success("Expense added");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (expenseId: string) => {
    try {
      const res = await api.delete(`/field-visits/${visitId}/expenses/${expenseId}`);
      setExpenses(res.data.visit.expenses || []);
      onUpdate();
      toast.success("Expense removed");
    } catch {
      toast.error("Failed to remove expense");
    }
  };

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
          <Receipt size={16} /> Expenses {total > 0 && <span className="text-gray-500">(₹{total.toFixed(0)})</span>}
        </h4>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
          <div className="flex gap-2">
            {(["travel", "fuel", "food", "other"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-2 py-1 text-xs rounded capitalize ${
                  type === t ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            type="number"
            placeholder="Amount (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
          />
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setReceipt(e.target.files?.[0] || null)}
            className="text-xs"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={submitting}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}

      {expenses.map((exp) => (
        <div key={exp._id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 uppercase">{exp.type}</span>
              <span className="text-sm font-semibold text-gray-900">₹{exp.amount.toFixed(0)}</span>
            </div>
            {exp.description && <p className="text-xs text-gray-400">{exp.description}</p>}
          </div>
          <button onClick={() => exp._id && handleRemove(exp._id)} className="text-red-400 hover:text-red-600">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default FieldVisitExpenses;
