import {
    ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
    Tooltip as ReTooltip, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Activity, History, Trophy, Layers, Users, FolderKanban } from 'lucide-react';
import useReportQuery from '../../hooks/useReportQuery';
import { ReportError, ReportEmpty, chartTooltipStyle, axisTick, MiniBar } from './ReportStates';
import Avatar from '../common/Avatar';

interface ActivityReportProps {
    filters: any;
    onDrilldown: (title: string, data: any[]) => void;
}

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

const getActionLabel = (action: string) =>
    action ? action.charAt(0).toUpperCase() + action.slice(1) : 'Other';

const formatLastActive = (lastActive: string | null) =>
    lastActive
        ? new Date(lastActive).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'Never';

const ActivityReport = ({ filters, onDrilldown }: ActivityReportProps) => {
    const { data, isLoading, isError, refetch } = useReportQuery('/reports/activity', filters);

    if (isLoading) return <ActivitySkeleton />;
    if (isError) return <ReportError onRetry={() => refetch()} />;
    if (!data || !data.totalActivities) {
        return <ReportEmpty subtitle="No logged activity for the selected scope and time range." />;
    }

    const dist = data.activityDistribution || [];
    const contributors = data.topContributors || [];
    const projects = data.activeProjects || [];
    const members = data.memberActivity || [];
    const maxContrib = Math.max(...contributors.map((c: any) => c.count), 1);
    const maxProject = Math.max(...projects.map((p: any) => p.count), 1);
    const threshold = data.inactivityThresholdDays || 7;
    const nActive = members.filter((m: any) => m.status === 'active').length;
    const nInactive = members.filter((m: any) => m.status === 'inactive').length;
    const nNever = members.filter((m: any) => m.status === 'never').length;

    const STATUS_META: Record<string, string> = {
        active: 'bg-success/10 text-success',
        inactive: 'bg-warning/10 text-warning',
        never: 'bg-danger/10 text-danger',
    };
    const statusChip = (m: any) => {
        if (m.status === 'never') return 'Never active';
        if (m.daysInactive === 0) return 'Today';
        return `${m.daysInactive}d ago`;
    };

    return (
        <div className="space-y-6 pb-10">
            {/* Actions over time */}
            <div className="card p-8 border-border/60 bg-surface/50">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                            <Activity size={20} className="text-primary" />
                            Actions Over Time
                        </h3>
                        <p className="text-sm text-text-secondary mt-1">
                            {data.totalActivities.toLocaleString()} total actions in the selected period.
                        </p>
                    </div>
                    <button onClick={() => onDrilldown('Actions Over Time', data.actionsOverTime || [])} className="btn btn-secondary btn-sm rounded-lg">
                        View Data
                    </button>
                </div>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.actionsOverTime || []}>
                            <defs>
                                <linearGradient id="gradActions" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                            <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={axisTick}
                                tickFormatter={(val) => new Date(val + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={axisTick} allowDecimals={false} />
                            <ReTooltip contentStyle={chartTooltipStyle} formatter={(v: any) => [v, 'Actions']} />
                            <Area type="monotone" dataKey="count" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#gradActions)" name="actions" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Action mix donut */}
                <div className="card p-8 border-border/60 bg-surface/50 relative overflow-hidden group">
                    <div className="w-full mb-6 relative z-10">
                        <h3 className="text-lg font-bold tracking-tight text-text">Action Mix</h3>
                        <p className="text-xs text-text-tertiary mt-1 uppercase tracking-widest font-bold">What's happening</p>
                    </div>
                    <div className="h-64 w-full relative z-10 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={dist.map((d: any) => ({ ...d, label: getActionLabel(d._id) }))}
                                    cx="50%" cy="50%" innerRadius={62} outerRadius={92}
                                    paddingAngle={4} dataKey="count" nameKey="label" stroke="none"
                                >
                                    {dist.map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <ReTooltip contentStyle={chartTooltipStyle} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-3xl font-bold text-text tracking-tighter">{data.totalActivities}</span>
                            <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">Actions</span>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-2 w-full relative z-10">
                        {dist.map((item: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-hover/40 rounded-lg transition-all hover:bg-surface-hover cursor-pointer"
                                onClick={() => onDrilldown(`Action: ${getActionLabel(item._id)}`, [item])}>
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                <span className="text-[11px] font-bold text-text-secondary truncate">{getActionLabel(item._id)}</span>
                                <span className="text-[11px] font-bold text-text-tertiary ml-auto">{item.count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top contributors */}
                <div className="card p-8 border-border/60 bg-surface/50 flex flex-col lg:col-span-2 max-h-[35rem] h-full">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                                <Trophy size={20} className="text-warning" />
                                Top Contributors
                            </h3>
                            <p className="text-sm text-text-secondary mt-1">Most logged actions in the period.</p>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {contributors.map((c: any, i: number) => (
                            <div key={i} className="flex items-center gap-4 p-3 rounded-xl border border-transparent hover:border-border hover:bg-surface transition-all cursor-pointer"
                                onClick={() => onDrilldown(`${c.name} — Activity`, [c])}>
                                <span className={`w-6 text-center text-xs font-black ${i === 0 ? 'text-warning' : 'text-text-tertiary'}`}>{i + 1}</span>
                                <Avatar src={c.avatar} name={c.name} size={36} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-bold text-text truncate">{c.name}</span>
                                        <span className="text-xs font-bold text-text-secondary shrink-0 ml-2">{c.count} actions</span>
                                    </div>
                                    <MiniBar pct={(c.count / maxContrib) * 100} color={COLORS[i % COLORS.length]} />
                                    <p className="text-[11px] text-text-tertiary mt-1 font-medium">Last active {formatLastActive(c.lastActive)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Most active projects */}
                <div className="card p-8 border-border/60 bg-surface/50 flex flex-col max-h-[26rem]">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                            <FolderKanban size={18} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text">Most Active Projects</h3>
                            <p className="text-xs text-text-tertiary mt-0.5 font-medium">All logged actions per project</p>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {projects.map((proj: any, idx: number) => (
                            <div key={idx}
                                className="flex items-center justify-between gap-3 p-3.5 bg-surface/60 hover:bg-surface rounded-xl border border-transparent hover:border-border transition-all cursor-pointer"
                                onClick={() => onDrilldown(`Project: ${proj.title}`, [proj])}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <Layers size={16} className="text-text-tertiary shrink-0" />
                                    <span className="text-sm font-semibold text-text truncate max-w-52">{proj.title}</span>
                                </div>
                                <div className="shrink-0 w-32">
                                    <MiniBar pct={(proj.count / maxProject) * 100} color="var(--color-primary)" />
                                    <p className="text-[11px] text-text-tertiary mt-1 text-right font-bold">{proj.count} actions</p>
                                </div>
                            </div>
                        ))}
                        {!projects.length && (
                            <p className="py-12 text-center text-sm text-text-tertiary">No project-linked activity found.</p>
                        )}
                    </div>
                </div>

                {/* Member activity — full roster with engagement status */}
                <div className="card p-8 border-l-4 border-l-primary border-border/60 bg-surface/50 flex flex-col max-h-[34rem]">
                    <div className="flex items-start justify-between gap-3 mb-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                                <Users size={18} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold tracking-tight text-text">Member Activity</h3>
                                <p className="text-sm text-text-secondary mt-0.5">
                                    Last work action per member · inactive after {threshold}+ days
                                </p>
                            </div>
                        </div>
                        {members.length > 0 && (
                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-success/10 text-success">{nActive} active</span>
                                <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-warning/10 text-warning">{nInactive} inactive</span>
                                <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-danger/10 text-danger">{nNever} never</span>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2.5 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                        {members.map((m: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-3 p-3.5 bg-surface/60 hover:bg-surface rounded-xl border border-border transition-all">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Avatar src={m.avatar} name={m.name} size={34} />
                                    <span className="text-sm font-bold text-text truncate">{m.name}</span>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_META[m.status] || STATUS_META.never}`}>
                                        {statusChip(m)}
                                    </span>
                                    {m.lastActive && (
                                        <p className="text-[10px] font-semibold text-text-tertiary mt-1 whitespace-nowrap">
                                            Last activity {new Date(m.lastActive).toLocaleString(undefined, {
                                                month: 'short', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </p>
                                    )}
                                    {m.lastLogin && new Date(m.lastLogin) > new Date(m.lastActive || 0) && (
                                        <p className="text-[10px] font-medium text-text-tertiary/70 whitespace-nowrap">
                                            signed in {Math.floor((Date.now() - new Date(m.lastLogin).getTime()) / 86400000) === 0
                                                ? 'today'
                                                : `${Math.floor((Date.now() - new Date(m.lastLogin).getTime()) / 86400000)}d ago`}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {!members.length && (
                            <div className="py-14 text-center text-text-tertiary flex flex-col items-center gap-3">
                                <History size={28} className="opacity-40" />
                                <p className="text-sm font-medium">No members found for this scope.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ActivitySkeleton = () => (
    <div className="space-y-8 animate-pulse pb-10">
        <div className="card p-8 border-border/40 bg-surface/50 h-96">
            <div className="w-48 h-7 bg-surface-hover rounded-lg mb-8"></div>
            <div className="w-full h-64 bg-surface-hover rounded-2xl opacity-30"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="card p-8 border-border/40 bg-surface/50 h-96">
                <div className="w-36 h-6 bg-surface-hover rounded-lg mb-8"></div>
                <div className="w-48 h-48 mx-auto rounded-full bg-surface-hover opacity-40"></div>
            </div>
            <div className="lg:col-span-2 card p-8 border-border/40 bg-surface/50 h-96">
                <div className="w-40 h-6 bg-surface-hover rounded-lg mb-8"></div>
                {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-surface-hover/40 rounded-xl mb-3"></div>)}
            </div>
        </div>
    </div>
);

export default ActivityReport;
