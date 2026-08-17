import * as React from 'react';
import { useEffect, useState } from 'react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
    CartesianGrid, Tooltip as ReTooltip, Cell 
} from 'recharts';
import api from '@/lib/api';
import { AlertTriangle, Users, Calendar, BarChart3, Info } from 'lucide-react';

interface WorkloadReportProps {
    filters: any;
    onDrilldown: (title: string, data: any[]) => void;
}

const WorkloadReport = ({ filters, onDrilldown }: WorkloadReportProps): React.JSX.Element | null => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [hoveredDay, setHoveredDay] = useState<number | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: reportData } = await api.get('/reports/workload', { params: filters });
                setData(reportData.data);
            } catch (err) {
                console.error('Failed to fetch workload report', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [filters]);

    if (loading) return (
        <div className="space-y-8 animate-pulse">
            {/* Main Distribution Chart Skeleton */}
            <div style={{ marginBottom: "20px" }} className="card p-8 border-border/40 bg-surface/50 h-125">
                <div className="flex justify-between mb-12">
                    <div className="space-y-3">
                        <div className="w-56 h-7 bg-surface-hover rounded-lg"></div>
                        <div className="w-72 h-4 bg-surface-hover rounded-lg opacity-60"></div>
                    </div>
                </div>
                <div className="w-full h-80 bg-surface-hover rounded-2xl opacity-40"></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Intensity Heatmap Skeleton */}
                <div className="card p-8 border-border/40 bg-surface/50 h-100">
                    <div className="w-48 h-6 bg-surface-hover rounded-lg mb-10"></div>
                    <div className="grid grid-cols-7 gap-3">
                        {[...Array(28)].map((_, i) => (
                            <div key={i} className="h-12 bg-surface-hover rounded-lg border border-border opacity-60"></div>
                        ))}
                    </div>
                </div>

                {/* Capacity Alerts Skeleton */}
                <div className="card p-8 border-border/40 bg-surface/50 h-100 border-l-4 border-l-border">
                    <div className="flex gap-3 mb-10">
                        <div className="w-10 h-10 rounded-lg bg-surface-hover"></div>
                        <div className="space-y-2">
                             <div className="w-32 h-6 bg-surface-hover rounded-lg"></div>
                             <div className="w-48 h-4 bg-surface-hover rounded-lg opacity-60"></div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-surface-hover/40 rounded-xl border border-border opacity-50"></div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    if (!data) return (
        <div className="card p-20 flex flex-col items-center justify-center text-center opacity-60">
            <Info size={48} className="text-text-tertiary mb-4" />
            <h3 className="text-lg font-bold">No data found</h3>
            <p className="text-sm text-text-secondary max-w-sm mt-2">Adjust your filters to see metrics for different teams or time periods.</p>
        </div>
    );

    const today = new Date();
    today.setHours(0,0,0,0);
    const last28Dates = Array.from({ length: 28 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (27 - i));
        return d;
    });

    const maxTasks = data?.heatmapRaw?.reduce((max: number, current: any) => Math.max(max, current.tasks), 1) || 1;

    const heatmapDays = last28Dates.map((date, i) => {
        const dateStr = date.toISOString().split('T')[0];
        const dayData = (data?.heatmapRaw || []).find((h: any) => h._id === dateStr);
        const tasks = dayData ? dayData.tasks : 0;
        return {
            date: dateStr,
            day: i + 1,
            tasks,
            intensity: tasks / maxTasks
        };
    });

    const startingDayOfWeek = last28Dates[0].getDay(); // 0 is Sun, 1 is Mon
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekHeaders = Array.from({length: 7}, (_, i) => dayNames[(startingDayOfWeek + i) % 7]);

    const COLORS = ['#f8fafc', '#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6'];

    return (
        <div className="space-y-8 pb-10">
            {/* Workload Distribution */}
            <div style={{
                marginBottom:"20px"
            }} className="card p-8 border-border/60 bg-surface/50">
                <div className="flex items-center justify-between mb-12">
                    <div>
                        <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                            <Users size={20} className="text-primary" />
                            Team Load Balancing
                        </h3>
                        <p className="text-sm text-text-secondary mt-1">Comparing task volumes per team member.</p>
                    </div>
                    <button 
                        onClick={() => onDrilldown('Workload Distribution', data.workloadDistribution || [])}
                        className="btn btn-secondary btn-sm rounded-lg"
                    >
                        View Details
                    </button>
                </div>

                <div className="h-100">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.workloadDistribution || []} margin={{ left: 20, right: 30, top: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.4} />
                            <XAxis 
                                dataKey="name" 
                                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-tertiary)' }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-tertiary)' }} />
                            <ReTooltip 
                                cursor={{fill: 'var(--color-primary)', opacity: 0.05}}
                                contentStyle={{ 
                                    backgroundColor: 'var(--color-surface)', 
                                    borderRadius: '12px', 
                                    border: '1px solid var(--color-border)',
                                    boxShadow: 'var(--shadow-xl)',
                                    fontSize: '13px'
                                }}
                            />
                            <Bar 
                                dataKey="taskCount" 
                                radius={[8, 8, 0, 0]} 
                                barSize={40}
                                fill="var(--color-primary)"
                                name="Active Tasks"
                            >
                                {(data.workloadDistribution || []).map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={entry.taskCount > 8 ? 'var(--color-danger)' : 'var(--color-primary)'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Intensity Matrix */}
                <div className="card p-8 border-border/60 bg-surface/50 overflow-hidden relative group">
                    <div className="absolute -top-10 -right-10 p-10 opacity-[0.03] text-primary group-hover:scale-110 transition-transform duration-700">
                        <Calendar size={180} />
                    </div>
                    <div className="flex items-center justify-between mb-10 relative z-10">
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                                <BarChart3 size={20} className="text-info" />
                                Activity Intensity
                            </h3>
                            <p className="text-sm text-text-secondary mt-1">Temporal task concentration matrix.</p>
                        </div>
                        <div className="flex items-center gap-1">
                             {COLORS.map((c, i) => (
                                 <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }}></div>
                             ))}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-2 relative z-10">
                        {weekHeaders.map(day => (
                            <div key={day} className="text-[10px] font-bold text-text-tertiary text-center mb-1 uppercase tracking-widest">{day}</div>
                        ))}
                        {heatmapDays.map((d, i) => (
                            <div 
                                key={i}
                                onMouseEnter={() => setHoveredDay(i)}
                                onMouseLeave={() => setHoveredDay(null)}
                                className={`h-12 rounded-lg cursor-pointer transition-all duration-300 ${
                                    hoveredDay === i ? 'scale-110 z-10 shadow-lg ring-2 ring-primary/40' : 'scale-100'
                                }`}
                                style={{ 
                                    backgroundColor: COLORS[Math.min(Math.floor(d.intensity * COLORS.length), COLORS.length - 1)],
                                    border: '1px solid var(--color-border)'
                                }}
                                title={`${d.date}: ${d.tasks} focused checkpoints`}
                            />
                        ))}
                    </div>
                </div>

                {/* Overload Alert Matrix */}
                <div className="card p-8 border-l-4 border-l-danger border-border/60 bg-surface/50">
                    <div className="flex items-center gap-3 mb-10">
                        <AlertTriangle className="text-danger" size={24} />
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-danger">Capacity Alerts</h3>
                            <p className="text-sm text-text-secondary mt-1">Personnel exceeding standard task ratios.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {(data.workloadDistribution || []).filter((e: any) => e.taskCount > 8).slice(0, 4).map((emp: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-surface/60 hover:bg-surface rounded-xl border border-border shadow-sm transition-all group cursor-pointer">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center font-bold text-danger text-sm border border-danger/20 group-hover:scale-110 transition-transform">
                                        {emp.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-text">{emp.name}</p>
                                        <p className="text-xs text-text-tertiary">Critical Utilization</p>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <p className="text-base font-bold text-danger">{emp.taskCount} Tasks</p>
                                    <div className="w-24 h-1.5 bg-surface-hover rounded-full overflow-hidden mt-1.5 border border-border">
                                        <div className="w-full h-full bg-danger rounded-full shadow-sm"></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!data.workloadDistribution || data.workloadDistribution.filter((e: any) => e.taskCount > 8).length === 0) && (
                            <div className="py-12 text-center text-text-tertiary flex flex-col items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-success">
                                    <CheckCircle size={24} />
                                </div>
                                <p className="text-sm font-medium">All personnel are within capacity limits.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const CheckCircle = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

export default WorkloadReport;
