import * as React from 'react';
import { useEffect, useState } from 'react';
import { 
    ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
    XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip 
} from 'recharts';
import api from '../../lib/api';
import { Clock, TrendingUp, Target, Zap, Activity, Info } from 'lucide-react';

interface TimeTrackingReportProps {
    filters: any;
    onDrilldown: (title: string, data: any[]) => void;
}

const TimeTrackingReport = ({ filters, onDrilldown }: TimeTrackingReportProps): React.JSX.Element | null => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: reportData } = await api.get('/reports/time-tracking', { params: filters });
                setData(reportData.data);
            } catch (err) {
                console.error('Failed to fetch time tracking report', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [filters]);

    if (loading) return (
        <div className="space-y-8 animate-pulse">
            {/* Stats Grid Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" style={{ marginBottom: "20px" }}>
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="card p-6 border-border/40">
                        <div className="flex items-start justify-between">
                            <div className="w-12 h-12 rounded-xl bg-surface-hover"></div>
                            <div className="w-20 h-3 bg-surface-hover rounded-full"></div>
                        </div>
                        <div className="mt-4 w-16 h-8 bg-surface-hover rounded-lg"></div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ marginBottom: "20px" }}>
                {/* Trend Chart Skeleton */}
                <div className="lg:col-span-2 card p-8 border-border/40 bg-surface/50 h-112.5">
                    <div className="flex justify-between mb-8">
                        <div className="space-y-3">
                            <div className="w-48 h-6 bg-surface-hover rounded-lg"></div>
                            <div className="w-64 h-4 bg-surface-hover rounded-lg opacity-60"></div>
                        </div>
                        <div className="w-24 h-9 bg-surface-hover rounded-lg"></div>
                    </div>
                    <div className="w-full h-75 bg-surface-hover rounded-2xl opacity-40"></div>
                </div>

                {/* Precision List Skeleton */}
                <div className="card p-8 border-border/40 bg-surface/50 h-112.5">
                    <div className="w-32 h-6 bg-surface-hover rounded-lg mb-2"></div>
                    <div className="w-40 h-3 bg-surface-hover rounded-full mb-10 opacity-60"></div>
                    <div className="space-y-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="space-y-3">
                                <div className="flex justify-between">
                                    <div className="w-24 h-4 bg-surface-hover rounded-full"></div>
                                    <div className="w-16 h-3 bg-surface-hover rounded-full opacity-60"></div>
                                </div>
                                <div className="w-full h-2.5 bg-surface-hover rounded-full"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Comparison Skeleton */}
            <div className="card p-10 border-border/40 bg-surface/50 h-125">
                <div className="w-64 h-7 bg-surface-hover rounded-lg mb-4"></div>
                <div className="w-96 h-4 bg-surface-hover rounded-lg mb-12 opacity-60"></div>
                <div className="w-full h-80 bg-surface-hover rounded-2xl opacity-40"></div>
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

    const stats = [
        { label: 'Total Hours', value: `${data.totalTimeSpent || 0}h`, icon: <Clock size={22} />, color: 'var(--color-primary)' },
        { label: 'Forecasted', value: `${data.totalEstimatedTime || 0}h`, icon: <Target size={22} />, color: 'var(--color-info)' },
        { label: 'Efficiency', value: `${data.efficiency || 0}%`, icon: <Zap size={22} />, color: 'var(--color-success)' },
        { label: 'Utilization', value: `${Math.round((data.totalTimeSpent || 0) / 160 * 100)}%`, icon: <Activity size={22} />, color: 'var(--color-warning)' },
    ];

    return (
        <div className="space-y-8 pb-10 " >
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" style={{
                marginBottom:"20px"
            }} >
                {stats.map((stat, i) => (
                    <div key={i} className="card p-6 flex flex-col justify-between hover:shadow-lg transition-all group border-border/60 m">
                        <div className="flex items-start justify-between">
                            <div className="p-3 rounded-xl bg-surface-hover group-hover:bg-primary-light transition-colors duration-300" style={{ color: stat.color }}>
                                {stat.icon}
                            </div>
                            <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mt-1">{stat.label}</span>
                        </div>
                        <div className="mt-4">
                            <h3 className="text-3xl font-bold text-text tracking-tight">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{
                marginBottom:"20px"
            }} >
                {/* Daily Trend */}
                <div className="lg:col-span-2 card p-8 border-border/60 bg-surface/50">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                                <TrendingUp size={20} className="text-primary" />
                                Working Hours Trend
                            </h3>
                            <p className="text-sm text-text-secondary mt-1">Timeline of actual time spent across the organization.</p>
                        </div>
                        <button 
                            onClick={() => onDrilldown('Working Hours Trend', data.dailyTrends || [])}
                            className="btn btn-secondary btn-sm rounded-lg"
                        >
                            View Data
                        </button>
                    </div>
                    <div className="h-87.5">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailyTrends || []}>
                                <defs>
                                    <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                                <XAxis 
                                    dataKey="_id" 
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-tertiary)' }}
                                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    dy={10}
                                />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-tertiary)' }} />
                                <ReTooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'var(--color-surface)', 
                                        borderRadius: '12px', 
                                        border: '1px solid var(--color-border)',
                                        boxShadow: 'var(--shadow-xl)',
                                        padding: '12px',
                                        fontSize: '13px'
                                    }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="totalHours" 
                                    stroke="var(--color-primary)" 
                                    strokeWidth={3}
                                    fill="url(#colorTime)" 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Estimate precision Ratio */}
                <div className="card p-8 border-border/60 flex flex-col bg-surface/50">
                    <div className="mb-8">
                        <h3 className="text-lg font-bold tracking-tight text-text">Estimate Precision</h3>
                        <p className="text-sm text-text-secondary mt-1">Actual vs Forecast accuracy.</p>
                    </div>
                    <div className="space-y-6 overflow-y-auto pr-2 flex-1 scrollbar-hide">
                        {(data.projectComparison || []).slice(0, 8).map((proj: any, idx: number) => {
                            const ratio = Math.min((proj.actualTime / proj.estimatedTime) * 100, 100) || 0;
                            const isOver = proj.actualTime > proj.estimatedTime;
                            return (
                                <div key={idx} className="space-y-2 cursor-pointer group" onClick={() => onDrilldown(`Accuracy: ${proj.title}`, [proj])}>
                                    <div className="flex justify-between items-end">
                                        <span className="text-sm font-semibold text-text truncate pr-4 group-hover:text-primary transition-colors">{proj.title}</span>
                                        <span className={`text-xs font-bold ${isOver ? 'text-danger' : 'text-text-tertiary'}`}>{proj.actualTime}h / {proj.estimatedTime}h</span>
                                    </div>
                                    <div className="h-2.5 bg-surface-hover rounded-full overflow-hidden shadow-inner flex">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-1000 ${isOver ? 'bg-danger/80' : 'bg-primary/80'}`}
                                            style={{ width: `${ratio}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Project Comparison */}
            <div className="card p-10 bg-surface/50 border-border/60">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <h3 className="text-xl font-bold tracking-tight text-text">Allocation Intelligence</h3>
                        <p className="text-sm text-text-secondary mt-2">Comprehensive comparison of total actualized hours versus initial forecasts per project.</p>
                    </div>
                </div>
                <div className="h-100">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.projectComparison || []} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.4} />
                            <XAxis 
                                dataKey="title" 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-tertiary)' }}
                                tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
                                dy={15}
                            />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-tertiary)' }} />
                            <ReTooltip 
                                cursor={{ fill: 'var(--color-primary)', opacity: 0.05 }}
                                contentStyle={{ 
                                    backgroundColor: 'var(--color-surface)', 
                                    borderRadius: '12px', 
                                    border: '1px solid var(--color-border)',
                                    boxShadow: 'var(--shadow-lg)',
                                    padding: '16px',
                                    fontSize: '13px'
                                }}
                            />
                            <Bar 
                                dataKey="actualTime" 
                                name="Actual Hours"
                                fill="var(--color-primary)" 
                                radius={[8, 8, 0, 0]} 
                                barSize={40}
                            />
                            <Bar 
                                dataKey="estimatedTime" 
                                name="Estimated Hours"
                                fill="var(--color-info)" 
                                radius={[8, 8, 0, 0]} 
                                barSize={20}
                                opacity={0.3}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default TimeTrackingReport;
