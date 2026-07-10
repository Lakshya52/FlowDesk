import React, { useState, useEffect } from "react";
import { BarChart3, Users, CheckCircle, XCircle, TrendingUp } from "lucide-react";
import api from "../../lib/api";

interface Reports {
  totalVisits: number;
  byStatus: { _id: string; count: number }[];
  byOutcome: { _id: string; count: number }[];
  byEmployee: { _id: string; total: number; completed: number; checkedIn: number; employeeName?: string }[];
}

const FieldVisitReports: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const [reports, setReports] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("week");

  useEffect(() => {
    fetchReports();
  }, [period, refreshKey]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (period === "week") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.startDate = d.toISOString();
      } else if (period === "month") {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        params.startDate = d.toISOString();
      } else if (period === "year") {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        params.startDate = d.toISOString();
      }
      const res = await api.get("/field-visits/reports", { params });
      setReports(res.data.reports);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const statusCount = (status: string) => {
    return reports?.byStatus?.find((s) => s._id === status)?.count || 0;
  };

  const outcomeCount = (outcome: string) => {
    return reports?.byOutcome?.find((o) => o._id === outcome)?.count || 0;
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading reports...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="year">Last Year</option>
          <option value="all">All Time</option>
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <BarChart3 size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">Total</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{reports?.totalVisits || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <TrendingUp size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">Checked In</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{statusCount("checked_in")}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <CheckCircle size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">Completed</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{outcomeCount("completed")}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <XCircle size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">No Show</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{outcomeCount("no_show")}</p>
        </div>
      </div>

      {reports?.byEmployee && reports.byEmployee.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Users size={16} /> Per Employee
          </h3>
          <div className="space-y-2">
            {reports.byEmployee.map((emp) => (
              <div key={emp._id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-700">{emp.employeeName || "Unknown"}</span>
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-500">{emp.total} visits</span>
                  <span className="text-green-600">{emp.completed} done</span>
                  {emp.checkedIn > 0 && <span className="text-blue-600">{emp.checkedIn} active</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldVisitReports;
