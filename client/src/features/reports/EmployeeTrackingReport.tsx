import * as React from 'react';
import { useEffect, useState } from 'react';
import {
    ResponsiveContainer, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip
} from 'recharts';
import api from '@/lib/api';
import {
    Users, TrendingUp, Target, Zap,
    // Activity,
    Info, Calendar
} from 'lucide-react';

interface EmployeeTrackingReportProps {
    filters: any;
    onDrilldown: (title: string, data: any[]) => void;
}

const EmployeeTrackingReport = ({ filters, onDrilldown }: EmployeeTrackingReportProps): React.JSX.Element | null => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: reportData } = await api.get('/reports/employee-tracking', { params: filters });
                setData(reportData.data);
            } catch (err) {
                console.error('Failed to fetch employee tracking report', err);
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

            {/* Chart Skeleton */}
            <div className="grid grid-cols-1 gap-6" style={{ marginBottom: "20px" }}>
                <div className="card p-8 border-border/40 bg-surface/50 h-112.5">
                    <div className="flex justify-between mb-8">
                        <div className="space-y-3">
                            <div className="w-48 h-6 bg-surface-hover rounded-lg"></div>
                            <div className="w-64 h-4 bg-surface-hover rounded-lg opacity-60"></div>
                        </div>
                        <div className="w-24 h-9 bg-surface-hover rounded-lg"></div>
                    </div>
                    <div className="w-full h-75 bg-surface-hover rounded-2xl opacity-40"></div>
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
            <p className="text-sm text-text-secondary max-w-sm mt-2">Adjust your filters to see metrics for different personnel or time periods.</p>
        </div>
    );

    const stats = [
        { label: 'Active Employees', value: data.overallStats?.totalEmployees || 0, icon: <Users size={22} />, color: 'var(--color-primary)' },
        { label: 'Assignments Touched', value: data.overallStats?.totalAssignments || 0, icon: <Target size={22} />, color: 'var(--color-info)' },
        { label: 'Tasks Handled', value: data.overallStats?.totalTasks || 0, icon: <Zap size={22} />, color: 'var(--color-success)' },
        { label: 'Avg Active Days', value: data.overallStats?.avgActiveDays || 0, icon: <Calendar size={22} />, color: 'var(--color-warning)' },
    ];

    return (
        <div className="space-y-8 pb-10">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" style={{ marginBottom: "20px" }}>
                {stats.map((stat, i) => (
                    <div key={i} className="card p-6 flex flex-col justify-between hover:shadow-lg transition-all group border-border/60">
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

            <div className="grid grid-cols-1 gap-6" style={{ marginBottom: "20px" }}>
                {/* Daily Trend */}
                <div className="card p-8 border-border/60 bg-surface/50">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                                <TrendingUp size={20} className="text-primary" />
                                Action Velocity Trend
                            </h3>
                            <p className="text-sm text-text-secondary mt-1">Timeline of tasks handled across the organization.</p>
                        </div>
                        <button
                            onClick={() => onDrilldown('Action Velocity', data.dailyTrends || [])}
                            className="btn btn-secondary btn-sm rounded-lg"
                        >
                            View Data
                        </button>
                    </div>
                    <div className="h-87.5">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailyTrends || []}>
                                <defs>
                                    <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
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
                                    dataKey="tasksHandled"
                                    name="Tasks Handled"
                                    stroke="var(--color-primary)"
                                    strokeWidth={3}
                                    fill="url(#colorTasks)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Performance Overview Chart */}
            <div className="card p-10 bg-surface/50 border-border/60">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <h3 className="text-xl font-bold tracking-tight text-text">Personnel Impact Analysis</h3>
                        <p className="text-sm text-text-secondary mt-2">Correlating total assignments touched against volume of tasks handled.</p>
                    </div>
                </div>
                <div className="h-100">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.employeeStats || []} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.4} />
                            <XAxis
                                dataKey="name"
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
                                dataKey="taskCount"
                                name="Tasks Handled"
                                fill="var(--color-primary)"
                                radius={[8, 8, 0, 0]}
                                barSize={40}
                            />
                            <Bar
                                dataKey="assignmentCount"
                                name="Assignments Touched"
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

export default EmployeeTrackingReport;
