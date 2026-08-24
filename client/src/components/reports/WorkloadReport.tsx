import * as React from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip as ReTooltip, Cell, ReferenceLine
} from 'recharts';
import { AlertTriangle, Users, CalendarClock, BarChart3, Gauge, Flame } from 'lucide-react';
import useReportQuery from '../../hooks/useReportQuery';
import { ReportError, ReportEmpty, StatCard, MiniBar, chartTooltipStyle, axisTick } from './ReportStates';
import Avatar from '../common/Avatar';

interface WorkloadReportProps {
    filters: any;
    onDrilldown: (title: string, data: any[]) => void;
}

/** Heatmap color scale driven by CSS vars so it adapts to dark mode. */
const heatColor = (intensity: number) => {
    if (intensity <= 0.02) return 'var(--color-surface-hover)';
    if (intensity <= 0.25) return 'color-mix(in srgb, var(--color-primary) 25%, transparent)';
    if (intensity <= 0.5) return 'color-mix(in srgb, var(--color-primary) 50%, transparent)';
    if (intensity <= 0.75) return 'color-mix(in srgb, var(--color-primary) 75%, transparent)';
    return 'var(--color-primary)';
};

const WorkloadReport = ({ filters, onDrilldown }: WorkloadReportProps) => {
    const [hoveredDay, setHoveredDay] = React.useState<number | null>(null);
    const { data, isLoading, isError, refetch } = useReportQuery('/reports/workload', filters);

    const dist = data?.workloadDistribution || [];

    if (isLoading) return <WorkloadSkeleton />;
    if (isError) return <ReportError onRetry={() => refetch()} />;
    if (!data || !dist.length) {
        return <ReportEmpty subtitle="No open tasks found for the selected scope. Adjust your filters to compare team load." />;
    }

    const summary = data.summary || {};
    const hoursPerWeek = data.hoursPerWeek || 40;
    const heat = data.heatmapSeries || [];

    // Build week-rows for the heatmap (7 columns, starting weekday of first day)
    const startDow = heat.length ? new Date(heat[0]._id + 'T00:00:00Z').getUTCDay() : 0;
    const paddedCells: (null | any)[] = [...Array(startDow).fill(null), ...heat];
    const maxHeatTasks = Math.max(...heat.map((h: any) => h.tasks), 1);

    const stats = [
        { label: 'Open Tasks', value: summary.totalOpenTasks ?? 0, sub: 'not yet completed', icon: <BarChart3 size={22} />, color: 'var(--color-info)' },
        { label: 'Estimated Hours', value: `${summary.totalEstimatedHours ?? 0}h`, sub: 'queued across the team', icon: <Gauge size={22} />, color: 'var(--color-primary)' },
        { label: 'Over Capacity', value: summary.overloadedMembers ?? 0, sub: `above ${hoursPerWeek}h / week`, icon: <AlertTriangle size={22} />, color: 'var(--color-danger)' },
        { label: 'Stale Tasks', value: summary.staleTotal ?? 0, sub: 'untouched for 7+ days', icon: <CalendarClock size={22} />, color: 'var(--color-warning)' },
        { label: 'People Loaded', value: data.totalMembers ?? dist.length, sub: 'with active work', icon: <Users size={22} />, color: 'var(--color-success)' },
    ];

    return (
        <div className="space-y-6 pb-10">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
                {stats.map((stat, i) => <StatCard key={i} {...stat} />)}
            </div>

            {/* Estimated-hours load chart */}
            <div className="card p-8 border-border/60 bg-surface/50">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                            <Gauge size={20} className="text-primary" />
                            Estimated Load per Person
                        </h3>
                        <p className="text-sm text-text-secondary mt-1">Summed time estimates of open tasks. Red line = weekly capacity ({hoursPerWeek}h).</p>
                    </div>
                    <button onClick={() => onDrilldown('Workload Distribution', dist)} className="btn btn-secondary btn-sm rounded-lg">
                        View Details
                    </button>
                </div>
                <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dist} layout="vertical" margin={{ left: 10, right: 30 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.4} />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={axisTick} unit="h" />
                            <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false}
                                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-secondary)' }}
                                tickFormatter={(val: string) => val.length > 12 ? val.substring(0, 11) + '…' : val} />
                            <ReTooltip cursor={{ fill: 'var(--color-primary)', opacity: 0.05 }} contentStyle={chartTooltipStyle}
                                formatter={((value: any, name: string): [any, string] => {
                                    if (name === 'estimatedHours') return [`${value}h`, 'Estimated'];
                                    return [value, name === 'urgentHighCount' ? 'Urgent/High' : String(name)];
                                }) as any} />
                            <ReferenceLine x={hoursPerWeek} stroke="var(--color-danger)" strokeDasharray="5 4"
                                label={{ value: `Capacity ${hoursPerWeek}h`, position: 'top', fontSize: 11, fontWeight: 700, fill: 'var(--color-danger)' }} />
                            <Bar dataKey="estimatedHours" radius={[0, 6, 6, 0]} barSize={18}
                                onClick={(entry: any) => entry?.payload && onDrilldown(`${entry.payload.name} — Tasks`, [entry.payload])}>
                                {dist.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`}
                                        fill={entry.capacityPct > 150 ? 'var(--color-danger)' : entry.capacityPct > 90 ? 'var(--color-warning)' : 'var(--color-primary)'}
                                        cursor="pointer" />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Heatmap */}
                <div className="card p-8 border-border/60 bg-surface/50 relative overflow-hidden group">
                    <div className="flex items-center justify-between mb-8 relative z-10">
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                                <Flame size={20} className="text-warning" />
                                Activity Intensity
                            </h3>
                            <p className="text-sm text-text-secondary mt-1">Task updates per day in the selected window.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 gap-x-2 gap-y-2 relative z-10">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-[10px] font-bold text-text-tertiary text-center mb-1 uppercase tracking-widest">{day}</div>
                        ))}
                        {paddedCells.map((d, i) => d === null ? (
                            <div key={`pad-${i}`} />
                        ) : (
                            <div
                                key={i}
                                onMouseEnter={() => setHoveredDay(i)}
                                onMouseLeave={() => setHoveredDay(null)}
                                onClick={() => onDrilldown(`Activity — ${d._id}`, [d])}
                                className={`h-11 rounded-lg cursor-pointer transition-all duration-200 ${
                                    hoveredDay === i ? 'scale-110 z-10 shadow-lg ring-2 ring-primary/40' : ''
                                }`}
                                style={{
                                    backgroundColor: heatColor(d.tasks / maxHeatTasks),
                                    border: '1px solid var(--color-border)',
                                }}
                                title={`${new Date(d._id + 'T00:00:00').toLocaleDateString()}: ${d.tasks} task updates`}
                            />
                        ))}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-6 relative z-10">
                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mr-1">Less</span>
                        {[0.02, 0.25, 0.5, 0.75, 1].map(v => (
                            <div key={v} className="w-2.5 h-2.5 rounded-sm border border-border" style={{ backgroundColor: heatColor(v) }}></div>
                        ))}
                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider ml-1">More</span>
                    </div>
                </div>

                {/* Capacity alerts */}
                <div className="card p-8 border-l-4 border-l-danger border-border/60 bg-surface/50 flex flex-col max-h-[26rem]">
                    <div className="flex items-center gap-3 mb-6">
                        <AlertTriangle className="text-danger" size={24} />
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-danger">Capacity Alerts</h3>
                            <p className="text-sm text-text-secondary mt-1">Members above weekly capacity or carrying urgent work.</p>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                        {dist.filter((e: any) => e.capacityPct > 90 || e.staleCount > 0).slice(0, 8).map((emp: any, i: number) => {
                            const over = emp.capacityPct > 90;
                            return (
                                <div key={i} className="flex items-center justify-between p-4 bg-surface/60 hover:bg-surface rounded-xl border border-border shadow-sm transition-all cursor-pointer"
                                    onClick={() => onDrilldown(`${emp.name} — Load`, [emp])}>
                                    <div className="flex items-center gap-4 min-w-0">
                                        <Avatar src={emp.avatar} name={emp.name} size={40} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-text truncate">{emp.name}</p>
                                            <p className={`text-xs font-medium ${over ? 'text-danger' : 'text-text-tertiary'}`}>
                                                {over ? 'Over capacity' : 'Has stale tasks'} · {emp.urgentHighCount} urgent/high
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 ml-3 w-28">
                                        <p className={`text-sm font-bold ${over ? 'text-danger' : 'text-warning'}`}>{emp.estimatedHours}h · {emp.capacityPct}%</p>
                                        <MiniBar pct={Math.max(emp.capacityPct / 2, 8)} color={over ? 'var(--color-danger)' : 'var(--color-warning)'} />
                                    </div>
                                </div>
                            );
                        })}
                        {dist.filter((e: any) => e.capacityPct > 90 || e.staleCount > 0).length === 0 && (
                            <div className="py-14 text-center text-text-tertiary flex flex-col items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-success">
                                    <Users size={24} />
                                </div>
                                <p className="text-sm font-medium">Everyone is within capacity limits.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const WorkloadSkeleton = () => (
    <div className="space-y-8 animate-pulse pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="card p-6 border-border/40 h-32">
                    <div className="w-12 h-12 rounded-xl bg-surface-hover"></div>
                    <div className="mt-4 w-20 h-7 bg-surface-hover rounded-lg"></div>
                </div>
            ))}
        </div>
        <div className="card p-8 border-border/40 bg-surface/50 h-[26rem]">
            <div className="w-56 h-7 bg-surface-hover rounded-lg mb-10"></div>
            <div className="w-full h-64 bg-surface-hover rounded-2xl opacity-40"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[1, 2].map(i => (
                <div key={i} className="card p-8 border-border/40 bg-surface/50 h-80">
                    <div className="w-48 h-6 bg-surface-hover rounded-lg mb-10"></div>
                    <div className="grid grid-cols-7 gap-3">
                        {[...Array(28)].map((_, j) => (
                            <div key={j} className="h-11 bg-surface-hover rounded-lg opacity-60"></div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export default WorkloadReport;
