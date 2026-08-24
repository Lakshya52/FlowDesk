import {
    ResponsiveContainer, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend
} from 'recharts';
import {
    Users, TrendingUp, Target, Zap,
    CalendarClock, AlertTriangle
} from 'lucide-react';
import useReportQuery from '../../hooks/useReportQuery';
import { ReportError, ReportEmpty, StatCard, MiniBar, chartTooltipStyle, axisTick } from './ReportStates';
import Avatar from '../common/Avatar';

interface EmployeeTrackingReportProps {
    filters: any;
    onDrilldown: (title: string, data: any[]) => void;
}

const EmployeeTrackingReport = ({ filters, onDrilldown }: EmployeeTrackingReportProps) => {
    const { data, isLoading, isError, refetch } = useReportQuery('/reports/employee-tracking', filters);

    if (isLoading) return <TrackingSkeleton />;
    if (isError) return <ReportError onRetry={() => refetch()} />;
    if (!data || !data.employeeStats?.length) {
        return <ReportEmpty subtitle="Adjust your filters to see metrics for different personnel or time periods." />;
    }

    const s = data.overallStats || {};
    const stats = [
        { label: 'Completion Rate', value: `${s.completionRate ?? 0}%`, sub: `${s.completedTasks ?? 0} of ${s.totalTasks ?? 0} tasks done`, icon: <Target size={22} />, color: 'var(--color-success)' },
        { label: 'Overdue Tasks', value: s.overdueTasks ?? 0, sub: 'past due & unfinished', icon: <AlertTriangle size={22} />, color: 'var(--color-danger)' },
        { label: 'Avg Completion', value: `${s.avgCompletionDays ?? 0}d`, sub: 'from creation to done', icon: <CalendarClock size={22} />, color: 'var(--color-info)' },
        { label: 'Active People', value: s.totalEmployees ?? 0, sub: 'with assigned tasks', icon: <Users size={22} />, color: 'var(--color-primary)' },
        { label: 'Total Tasks', value: s.totalTasks ?? 0, sub: 'in selected period', icon: <Zap size={22} />, color: 'var(--color-warning)' },
    ];

    const employeeChart = data.employeeStats.slice(0, 12);

    return (
        <div className="space-y-6 pb-10">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
                {stats.map((stat, i) => <StatCard key={i} {...stat} />)}
            </div>

            {/* Daily Trend */}
            <div className="card p-8 border-border/60 bg-surface/50">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                            <TrendingUp size={20} className="text-primary" />
                            Created vs Completed
                        </h3>
                        <p className="text-sm text-text-secondary mt-1">Daily task flow across the selected period.</p>
                    </div>
                    <button onClick={() => onDrilldown('Task Flow', data.dailyTrends || [])} className="btn btn-secondary btn-sm rounded-lg">
                        View Data
                    </button>
                </div>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.dailyTrends || []}>
                            <defs>
                                <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                            <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={axisTick}
                                tickFormatter={(val) => new Date(val + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={axisTick} allowDecimals={false} />
                            <ReTooltip contentStyle={chartTooltipStyle}
                                formatter={((value: any, name: string): [any, string] => [value, name === 'created' ? 'Created' : 'Completed']) as any} />
                            <Legend formatter={(v: string) => <span style={{ fontSize: 12, fontWeight: 600 }}>{v === 'created' ? 'Created' : 'Completed'}</span>} />
                            <Area type="monotone" dataKey="completed" stroke="var(--color-success)" strokeWidth={2.5} fill="url(#gradCompleted)" />
                            <Area type="monotone" dataKey="created" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#gradCreated)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Completed vs Open per person */}
                <div className="card p-8 bg-surface/50 border-border/60">
                    <div className="mb-8">
                        <h3 className="text-lg font-bold tracking-tight text-text">Delivery per Person</h3>
                        <p className="text-sm text-text-secondary mt-1">Completed vs still-open tasks (top 12).</p>
                    </div>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={employeeChart} layout="vertical" margin={{ left: 10, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.4} />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={axisTick} allowDecimals={false} />
                                <YAxis type="category" dataKey="name" width={90} axisLine={false} tickLine={false}
                                    tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-secondary)' }}
                                    tickFormatter={(val: string) => val.length > 12 ? val.substring(0, 11) + '…' : val} />
                                <ReTooltip cursor={{ fill: 'var(--color-primary)', opacity: 0.05 }} contentStyle={chartTooltipStyle} />
                                <Legend formatter={(v: string) => <span style={{ fontSize: 12, fontWeight: 600 }}>{v === 'completedCount' ? 'Completed' : 'Open'}</span>} />
                                <Bar dataKey="openCount" name="openCount" stackId="a" fill="var(--color-surface-hover)" radius={[0, 0, 0, 0]} barSize={16} />
                                <Bar dataKey="completedCount" name="completedCount" stackId="a" fill="var(--color-success)" radius={[0, 4, 4, 0]} barSize={16} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Leaderboard */}
                <div className="card p-8 bg-surface/50 border-border/60 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text">People Snapshot</h3>
                            <p className="text-sm text-text-secondary mt-1">Sorted by overdue load.</p>
                        </div>
                        <button onClick={() => onDrilldown('Employee Performance', data.employeeStats || [])} className="btn btn-secondary btn-sm rounded-lg">
                            View All
                        </button>
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {data.employeeStats.map((e: any) => (
                            <div key={e._id} className="flex items-center gap-4 p-3 rounded-xl border border-transparent hover:border-border hover:bg-surface transition-all cursor-pointer"
                                onClick={() => onDrilldown(`${e.name} — Details`, [e])}>
                                <Avatar src={e.avatar} name={e.name} size={36} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-sm font-bold text-text truncate">{e.name}</span>
                                        {e.overdueCount > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-danger/10 text-danger shrink-0">
                                                {e.overdueCount} overdue
                                            </span>
                                        )}
                                    </div>
                                    <MiniBar pct={e.completionRate} color={e.completionRate >= 70 ? 'var(--color-success)' : e.completionRate >= 40 ? 'var(--color-warning)' : 'var(--color-danger)'} />
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-[11px] text-text-tertiary font-medium">{e.completedCount}/{e.assignedCount} done</span>
                                        <span className="text-[11px] font-bold text-text-secondary">{e.completionRate}%</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const TrackingSkeleton = () => (
    <div className="space-y-8 animate-pulse pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="card p-6 border-border/40 h-32">
                    <div className="w-12 h-12 rounded-xl bg-surface-hover"></div>
                    <div className="mt-4 w-20 h-7 bg-surface-hover rounded-lg"></div>
                </div>
            ))}
        </div>
        <div className="card p-8 border-border/40 bg-surface/50 h-96">
            <div className="w-48 h-6 bg-surface-hover rounded-lg mb-8"></div>
            <div className="w-full h-64 bg-surface-hover rounded-2xl opacity-40"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map(i => (
                <div key={i} className="card p-8 border-border/40 bg-surface/50 h-96">
                    <div className="w-40 h-6 bg-surface-hover rounded-lg mb-8"></div>
                    <div className="w-full h-64 bg-surface-hover rounded-2xl opacity-40"></div>
                </div>
            ))}
        </div>
    </div>
);

export default EmployeeTrackingReport;
