import { useState, useCallback } from 'react';
import {
  startOfWeek, endOfWeek, format, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths,
  startOfYear, endOfYear, addYears, subYears,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Download, FileText, AlertCircle, Inbox, TrendingUp, TrendingDown, Users, RefreshCw, MapPin, LogIn, CheckCircle, XCircle, CalendarDays, User } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useCrmSocket } from '../../hooks/useCrmSocket';

type Scope = 'weekly' | 'monthly' | 'yearly';

interface StatusBreakdown {
  new: number; attempted: number; connected: number; interested: number;
  callbackScheduled: number; meetingScheduled: number;
  notInterested: number; notReachable: number; doNotCall: number;
  closedWon: number; closedLost: number;
}
interface LeadsData {
  total: number; contacted: number; won: number;
  callDuration: number; callDurationLabel: string; callCount: number;
  contactedTrend: number | null; wonTrend: number | null;
  statusBreakdown: StatusBreakdown;
}
interface EventsData { total: number; trend: number | null }
interface ChartItem { name: string; contacted: number; won: number }
interface SummaryData {
  scope: Scope; dateRange: { start: string; end: string };
  leads: LeadsData; events: EventsData; conversionRate: number;
  chartData: ChartItem[];
}

interface UserItem { _id: string; name: string; role: string }

interface VisitReport {
  totalVisits: number;
  byStatus: { _id: string; count: number }[];
  byOutcome: { _id: string; count: number }[];
  byEmployee: { _id: string; total: number; completed: number; checkedIn: number; employeeName?: string }[];
}

const SCOPE_TABS: { key: Scope; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: 'var(--color-primary)', bg: 'var(--color-primary-light)' },
  checked_in: { label: 'Checked In', color: 'var(--color-success)', bg: 'var(--color-success-light)' },
  checked_out: { label: 'Checked Out', color: 'var(--color-text-secondary)', bg: 'var(--color-surface-hover)' },
  cancelled: { label: 'Cancelled', color: 'var(--color-danger)', bg: 'var(--color-danger-light)' },
};

const OUTCOME_MAP: Record<string, { label: string; color: string; bg: string }> = {
  completed: { label: 'Completed', color: 'var(--color-success)', bg: 'var(--color-success-light)' },
  rescheduled: { label: 'Rescheduled', color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  no_contact: { label: 'No Contact', color: 'var(--color-danger)', bg: 'var(--color-danger-light)' },
  met_other: { label: 'Met Other', color: 'var(--color-primary-hover)', bg: 'var(--color-primary-light)' },
};

const Trend = ({ v }: { v: number | null }) => {
  if (v === null) return <span className="text-(--color-text-tertiary) text-xs">{'\u2014'}</span>;
  if (v === 0) return <span className="text-(--color-text-tertiary) text-xs">0%</span>;
  const up = v > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-(--color-success)' : 'text-(--color-danger)'}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{up ? '+' : ''}{v}%
    </span>
  );
};

const StatItem = ({ label, value, trend, sub }: { label: string; value: string | number; trend?: number | null; sub?: string }) => (
  <div className="border-r border-(--color-border) px-3 sm:px-5 first:pl-0 last:pr-0 last:border-r-0 min-w-0">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-(--color-text-tertiary) mb-0.5 truncate">
      {label}
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-xl sm:text-2xl font-bold text-(--color-text) tabular-nums">{value}</span>
      {trend !== undefined && <Trend v={trend ?? null} />}
    </div>
    {sub && <div className="text-xs text-(--color-text-secondary) mt-0.5">{sub}</div>}
  </div>
);

const Summary = () => {
  useCrmSocket();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('weekly');
  const [refDate, setRefDate] = useState(() => new Date());
  const [exporting, setExporting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const { user } = useAuthStore();

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canSelectUser = isAdmin || isManager;

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["users", "members"],
    queryFn: async () => {
      if (!canSelectUser) return [];
      const { data: res } = await api.get('/auth/users');
      return (res.users || []).filter((u: any) => u.role === 'member' || u.role === 'manager');
    },
    enabled: canSelectUser,
  });

  const getPeriodLabel = useCallback(() => {
    if (scope === 'weekly') {
      const s = startOfWeek(refDate, { weekStartsOn: 1 });
      const e = endOfWeek(refDate, { weekStartsOn: 1 });
      return `${format(s, 'MMM d')} \u2013 ${format(e, 'MMM d, yyyy')}`;
    }
    if (scope === 'monthly') return format(refDate, 'MMMM yyyy');
    return format(refDate, 'yyyy');
  }, [scope, refDate]);

  const navigate = useCallback((dir: -1 | 1) => {
    setRefDate(prev => {
      if (scope === 'weekly') return dir === -1 ? subWeeks(prev, 1) : addWeeks(prev, 1);
      if (scope === 'monthly') return dir === -1 ? subMonths(prev, 1) : addMonths(prev, 1);
      return dir === -1 ? subYears(prev, 1) : addYears(prev, 1);
    });
  }, [scope]);

  const getDateParam = useCallback(() => {
    if (scope === 'weekly') return format(startOfWeek(refDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (scope === 'monthly') return format(startOfMonth(refDate), 'yyyy-MM-dd');
    return format(startOfYear(refDate), 'yyyy-MM-dd');
  }, [scope, refDate]);

  const { data, isLoading: loading, error } = useQuery<SummaryData>({
    queryKey: ["crm-summary", scope, getDateParam(), selectedUserId],
    queryFn: async () => {
      const params: any = { scope, date: getDateParam() };
      if (selectedUserId) params.userId = selectedUserId;
      const { data: res } = await api.get('/crm-summary', { params });
      return res;
    },
  });

  const getEndDateParam = useCallback(() => {
    if (scope === 'weekly') return format(endOfWeek(refDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (scope === 'monthly') return format(endOfMonth(refDate), 'yyyy-MM-dd');
    return format(endOfYear(refDate), 'yyyy-MM-dd');
  }, [scope, refDate]);

  const { data: visitReports } = useQuery<{ reports: VisitReport }>({
    queryKey: ["field-visit-reports", scope, getDateParam(), getEndDateParam(), selectedUserId],
    queryFn: async () => {
      const params: any = { startDate: getDateParam(), endDate: getEndDateParam() };
      if (selectedUserId) params.employeeId = selectedUserId;
      const { data: res } = await api.get('/field-visits/reports', { params });
      return res;
    },
  });

  const queryError = error ? (error as any)?.response?.data?.message || 'Failed to load summary' : null;

  const handleScopeChange = (s: Scope) => { setScope(s); setRefDate(new Date()); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: any = { scope, date: getDateParam() };
      if (selectedUserId) params.userId = selectedUserId;
      const res = await api.get('/crm-summary/export', {
        params,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm_reports_${scope}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally { setExporting(false); }
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col gap-5">
        <div className="skeleton h-9 w-60 rounded-lg" />
        <div className="skeleton h-4 w-80 rounded-md" />
        <div className="flex gap-4">
          <div className="skeleton h-9 w-52 rounded-lg" />
          <div className="skeleton h-9 w-40 rounded-lg" />
        </div>
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-72 rounded-2xl" />
        <div className="skeleton h-52 rounded-2xl" />
      </div>
    );
  }

  if (queryError && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col items-center justify-center gap-4 py-16 px-5 text-center">
          <AlertCircle size={36} className="text-(--color-danger)" />
          <p className="text-sm font-medium text-(--color-text-secondary)">{queryError}</p>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ["crm-summary"] })} className="btn btn-primary btn-sm"><RefreshCw size={14} /> Try Again</button>
        </div>
      </div>
    );
  }

  const hasChartData = data && data.chartData && data.chartData.length > 0 && data.chartData.some(d => d.contacted > 0 || d.won > 0);
  const isReloading = loading && !!data;

  const reports = visitReports?.reports;
  const statusCounts = (reports?.byStatus || []).reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {} as Record<string, number>);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-(--color-text)">
            Summary
          </h1>
          <p className="text-sm text-(--color-text-secondary) mt-0.5">
            CRM performance overview for the selected period
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ["crm-summary"] })} disabled={loading} className="btn btn-secondary px-3 py-2" title="Refresh data">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleExport} disabled={exporting} className="btn btn-primary">
            <Download size={14} />
            {exporting ? 'Exporting\u2026' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* ── Scope tabs + period navigation + user selector ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 mb-6">
        <div className="flex gap-8 border-b border-(--color-border)">
          {SCOPE_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => handleScopeChange(t.key)}
              className={`pb-2 text-sm font-semibold border-b-2 transition-all duration-150 cursor-pointer ${
                scope === t.key
                  ? 'text-(--color-primary) border-(--color-primary)'
                  : 'text-(--color-text-tertiary) border-transparent'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {canSelectUser && (
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-(--color-text-tertiary)" />
            <select
              className="select text-xs py-1 px-2 min-w-32.5"
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
            >
              <option value="">All Users</option>
              {users.map(u => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 sm:ml-auto">
          {isReloading && (
            <RefreshCw size={14} className="animate-spin text-(--color-primary)" />
          )}
          <button
            onClick={() => setRefDate(new Date())}
            disabled={loading}
            className="btn btn-ghost px-2.5 py-1 text-xs font-semibold"
          >
            Today
          </button>
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-(--color-surface-hover)">
            <button
              onClick={() => navigate(-1)}
              className="btn btn-ghost btn-sm p-0.5 rounded cursor-pointer"
              aria-label="Previous"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold text-(--color-text) min-w-35 sm:min-w-40 text-center">
              {getPeriodLabel()}
            </span>
            <button
              onClick={() => navigate(1)}
              className="btn btn-ghost btn-sm p-0.5 rounded cursor-pointer"
              aria-label="Next"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Error banner (reload failure with existing data) ── */}
      {queryError && data && (
        <div className="flex items-center gap-2 px-4 py-2 mb-4 rounded-lg bg-(--color-danger-light) text-(--color-danger) text-xs font-medium">
          <AlertCircle size={14} />
          <span>{queryError}</span>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ["crm-summary"] })} className="ml-auto bg-none border-none text-(--color-danger) font-semibold cursor-pointer text-xs underline">Retry</button>
        </div>
      )}

      {/* ── Stats row ── */}
      {data ? (
        <div className="card animate-fade-in p-4 sm:py-4 sm:px-5 mb-6 overflow-x-auto">
          <div className="flex items-stretch min-w-max gap-0">
            <StatItem label="Leads Total" value={data.leads.total} />
            <StatItem label="Leads Contacted" value={data.leads.contacted} trend={data.leads.contactedTrend} sub={`${data.leads.won} won`} />
            <StatItem label="Calls" value={data.leads.callCount} sub={data.leads.callDurationLabel} />
            <StatItem label="Leads Won" value={data.leads.won} trend={data.leads.wonTrend} />
            <StatItem label="Conversion Rate" value={`${data.conversionRate}%`} sub={`${data.leads.statusBreakdown.new} new`} />
            <StatItem label="Meetings" value={data.events.total} trend={data.events.trend} />
          </div>
        </div>
      ) : (
        <div className="card p-5 mb-6 text-center text-(--color-text-tertiary) text-sm">No data</div>
      )}

      {/* ── Status Breakdown ── */}
      {data && (
        <div className="card animate-fade-in p-4 sm:p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={14} className="text-(--color-text-tertiary)" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-text-tertiary)">Lead Status Breakdown</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {[
              { key: 'new', label: 'New', color: '#6366f1' },
              { key: 'attempted', label: 'Attempted', color: '#8b5cf6' },
              { key: 'connected', label: 'Connected', color: '#3b82f6' },
              { key: 'interested', label: 'Interested', color: '#0ea5e9' },
              { key: 'callbackScheduled', label: 'Callback Scheduled', color: '#06b6d4' },
              { key: 'meetingScheduled', label: 'Meeting Scheduled', color: '#10b981' },
              { key: 'notInterested', label: 'Not Interested', color: '#f59e0b' },
              { key: 'notReachable', label: 'Not Reachable', color: '#f97316' },
              { key: 'doNotCall', label: 'Do Not Call', color: '#ef4444' },
              { key: 'closedWon', label: 'Closed / Won', color: '#22c55e' },
              { key: 'closedLost', label: 'Closed / Lost', color: '#dc2626' },
            ].map(s => {
              const val = (data.leads.statusBreakdown as any)[s.key] ?? 0;
              const pct = data.leads.total > 0 ? Math.round((val / data.leads.total) * 100) : 0;
              return (
                <div key={s.key} className="flex flex-col gap-1 p-2.5 sm:p-3 rounded-lg bg-(--color-surface-hover)">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="text-[11px] font-medium text-(--color-text-secondary) truncate">{s.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg sm:text-xl font-bold text-(--color-text) tabular-nums">{val}</span>
                    <span className="text-xs text-(--color-text-tertiary)">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Field Visit Reports ── */}
      <div className="card animate-fade-in p-4 sm:p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={14} className="text-(--color-primary)" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-text-tertiary)">Field Visit Reports</span>
        </div>

        {reports ? (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-(--color-text) tabular-nums">{reports.totalVisits}</span>
              <span className="text-sm text-(--color-text-secondary)">total visits</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(STATUS_MAP).map(([key, cfg]) => {
                const val = statusCounts[key] || 0;
                const pct = reports.totalVisits > 0 ? Math.round((val / reports.totalVisits) * 100) : 0;
                return (
                  <div key={key} className="flex flex-col gap-1 p-3 rounded-lg" style={{ background: cfg.bg }}>
                    <div className="flex items-center gap-1.5">
                      {key === 'checked_in' && <LogIn size={12} style={{ color: cfg.color }} />}
                      {key === 'checked_out' && <CheckCircle size={12} style={{ color: cfg.color }} />}
                      {key === 'cancelled' && <XCircle size={12} style={{ color: cfg.color }} />}
                      {key === 'scheduled' && <CalendarDays size={12} style={{ color: cfg.color }} />}
                      <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                    </div>
                    <span className="text-lg font-bold text-(--color-text) tabular-nums">{val}</span>
                    <span className="text-[10px] text-(--color-text-tertiary)">{pct}% of total</span>
                  </div>
                );
              })}
            </div>

            {reports.byOutcome.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-(--color-text-tertiary)">By Outcome</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {reports.byOutcome.map((o) => {
                    const cfg = OUTCOME_MAP[o._id];
                    if (!cfg) return null;
                    return (
                      <div key={o._id} className="flex flex-col gap-1 p-3 rounded-lg" style={{ background: cfg.bg }}>
                        <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                        <span className="text-lg font-bold text-(--color-text) tabular-nums">{o.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {reports.byEmployee.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User size={13} className="text-(--color-text-tertiary)" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-(--color-text-tertiary)">By Employee</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-(--color-border)">
                        <th className="text-left py-2 pr-4 font-semibold text-[10px] uppercase tracking-wider text-(--color-text-tertiary)">Employee</th>
                        <th className="text-right py-2 px-4 font-semibold text-[10px] uppercase tracking-wider text-(--color-text-tertiary)">Total</th>
                        <th className="text-right py-2 px-4 font-semibold text-[10px] uppercase tracking-wider text-(--color-text-tertiary)">Checked In</th>
                        <th className="text-right py-2 pl-4 font-semibold text-[10px] uppercase tracking-wider text-(--color-text-tertiary)">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.byEmployee.map((emp) => (
                        <tr key={emp._id} className="border-b border-(--color-border) hover:bg-(--color-surface-hover)">
                          <td className="py-2 pr-4 font-medium text-(--color-text)">{emp.employeeName || 'Unknown'}</td>
                          <td className="py-2 px-4 text-right tabular-nums text-(--color-text-secondary)">{emp.total}</td>
                          <td className="py-2 px-4 text-right tabular-nums text-(--color-text-secondary)">{emp.checkedIn}</td>
                          <td className="py-2 pl-4 text-right tabular-nums text-(--color-success) font-medium">{emp.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-(--color-text-tertiary) text-sm">{!isAdmin && !isManager ? 'Field visit reports are not available for your role' : 'Loading field visit reports...'}</div>
        )}
      </div>

      {/* ── Chart ── */}
      <div className="card animate-fade-in p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h3 className="text-sm font-semibold text-(--color-text)">
            CRM Activity
            <span className="text-(--color-text-tertiary) font-normal ml-1.5">
              ({scope === 'weekly' ? 'per day' : scope === 'monthly' ? 'per week' : 'per month'})
            </span>
          </h3>
          <div className="flex items-center gap-4 text-xs font-medium text-(--color-text-secondary)">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-(--color-primary)" />
              Contacted
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-(--color-success)" />
              Won
            </span>
          </div>
        </div>

        {hasChartData ? (
          <div className="h-60 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chartData} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    fontSize: '0.8125rem',
                    boxShadow: 'var(--shadow-md)',
                  }}
                  cursor={{ fill: 'var(--color-surface-hover)' }}
                />
                <Bar dataKey="contacted" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="won" fill="var(--color-success)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-60 flex flex-col items-center justify-center gap-2">
            <Inbox size={32} className="text-(--color-text-tertiary)" />
            <p className="text-sm font-medium text-(--color-text-tertiary)">No activity this period</p>
            <p className="text-xs text-(--color-text-tertiary)">Try a different time range or scope</p>
          </div>
        )}
      </div>

      {/* ── Breakdown table ── */}
      <div className="card animate-fade-in overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-(--color-border) flex items-center gap-2">
          <FileText size={14} className="text-(--color-text-tertiary)" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-text-tertiary)">Period Breakdown</span>
        </div>

        <div className="overflow-x-auto min-h-40">
          {data && data.chartData && data.chartData.length > 0 ? (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-(--color-border)">
                  {['Period', 'Contacted', 'Won', 'Conversion'].map(h => (
                    <th
                      key={h}
                      className={`py-2.5 px-4 sm:px-5 font-semibold text-[10px] uppercase tracking-wider text-(--color-text-tertiary) ${h === 'Period' ? 'text-left' : 'text-right'}`}
                    >{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.chartData.map((row, i) => {
                  const rate = row.contacted > 0 ? Math.round((row.won / row.contacted) * 100) : 0;
                  const rateColor =
                    rate >= 50 ? 'var(--color-success)' :
                    rate >= 25 ? 'var(--color-warning)' :
                    rate > 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)';
                  const rateBg =
                    rate >= 50 ? 'var(--color-success-light)' :
                    rate >= 25 ? 'var(--color-warning-light)' :
                    rate > 0 ? 'var(--color-danger-light)' : 'var(--color-surface-hover)';
                  return (
                    <tr key={i} className="border-b border-(--color-border) hover:bg-(--color-surface-hover)">
                      <td className="py-2.5 px-4 sm:px-5 font-medium text-(--color-text)">{row.name}</td>
                      <td className="py-2.5 px-4 sm:px-5 text-right tabular-nums text-(--color-text-secondary)">{row.contacted || '\u2014'}</td>
                      <td className="py-2.5 px-4 sm:px-5 text-right tabular-nums text-(--color-text-secondary)">{row.won || '\u2014'}</td>
                      <td className="py-2.5 px-4 sm:px-5 text-right">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={{ color: rateColor, background: rateBg }}>{rate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-8 px-5 text-center text-(--color-text-tertiary) text-xs">No data to display</div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-2 border-t border-(--color-border) text-[10px] text-(--color-text-tertiary) text-right">
          Generated {format(new Date(), 'MMM d, yyyy h:mm a')} {'\u2014'} {user?.name || 'Current User'}
        </div>
      </div>
    </div>
  );
};

export default Summary;
