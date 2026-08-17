import * as React from 'react';
import { useEffect, useState } from 'react';
import { 
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip, 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, 
} from 'recharts';
import api from '@/lib/api';
import { Activity, Box, History, Send, Archive, MessageSquare, Info, Layers, CheckCircle } from 'lucide-react';

interface ActivityReportProps {
    filters: any;
    onDrilldown: (title: string, data: any[]) => void;
}

const ActivityReport = ({ filters, onDrilldown }: ActivityReportProps): React.JSX.Element | null => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: reportData } = await api.get('/reports/activity', { params: filters });
                setData(reportData.data);
            } catch (err) {
                console.error('Failed to fetch activity report', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [filters]);

    if (loading) return (
        <div className="space-y-8 animate-pulse pb-10">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ marginBottom:"20px" }}>
                {/* Distribution Skeleton */}
                <div className="card p-8 flex flex-col items-center border-border/40 bg-surface/50 h-125">
                    <div className="w-full mb-8">
                        <div className="w-40 h-6 bg-surface-hover rounded-lg mb-2"></div>
                        <div className="w-32 h-3 bg-surface-hover rounded-full opacity-50"></div>
                    </div>
                    <div className="w-48 h-48 rounded-full border-16 border-surface-hover opacity-40"></div>
                    <div className="mt-8 grid grid-cols-2 gap-2 w-full">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-surface-hover rounded-lg"></div>)}
                    </div>
                </div>

                {/* Bar Chart Skeleton */}
                <div className="lg:col-span-2 card p-8 border-border/40 bg-surface/50 h-125">
                    <div className="flex justify-between mb-10">
                        <div className="space-y-3">
                            <div className="w-48 h-7 bg-surface-hover rounded-lg"></div>
                            <div className="w-64 h-4 bg-surface-hover rounded-lg opacity-60"></div>
                        </div>
                    </div>
                    <div className="w-full h-80 bg-surface-hover rounded-2xl opacity-30"></div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* List Skeleton */}
                <div className="card p-8 border-border/40 bg-surface/50 h-150">
                    <div className="flex gap-4 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-surface-hover"></div>
                        <div className="space-y-2">
                            <div className="w-32 h-6 bg-surface-hover rounded-lg"></div>
                            <div className="w-24 h-3 bg-surface-hover rounded-full opacity-50"></div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-surface-hover/30 rounded-xl border border-border"></div>)}
                    </div>
                </div>

                {/* Timeline Skeleton */}
                <div className="lg:col-span-2 card p-8 border-border/40 bg-surface/50 h-150">
                    <div className="w-48 h-7 bg-surface-hover rounded-lg mb-10"></div>
                    <div className="space-y-8">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-6">
                                <div className="w-10 h-10 rounded-xl bg-surface-hover shrink-0"></div>
                                <div className="flex-1 space-y-3">
                                    <div className="flex justify-between">
                                        <div className="w-24 h-4 bg-surface-hover rounded-full"></div>
                                        <div className="w-16 h-3 bg-surface-hover rounded-full opacity-50"></div>
                                    </div>
                                    <div className="w-full h-16 bg-surface-hover/40 rounded-xl"></div>
                                </div>
                            </div>
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
            <p className="text-sm text-text-secondary max-w-sm mt-2">Adjust your filters to see activity logs for different metrics.</p>
        </div>
    );

    const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    const getIcon = (action: string) => {
        const a = action.toLowerCase();
        if (a.includes('create')) return <Send size={18} className="text-success" />;
        if (a.includes('update')) return <Activity size={18} className="text-primary" />;
        if (a.includes('upload') || a.includes('file')) return <Archive size={18} className="text-info" />;
        if (a.includes('comment')) return <MessageSquare size={18} className="text-warning" />;
        return <Activity size={18} className="text-text-tertiary" />;
    };

    return (
        <div className="space-y-8 pb-10">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{
                marginBottom:"20px"
            }}>
                {/* Activity Mix */}
                <div className="card p-8 flex flex-col items-center border-border/60 bg-surface/50 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-[0.03] text-primary group-hover:scale-110 transition-transform duration-700">
                        <Layers size={120} />
                    </div>
                    <div className="w-full mb-8 relative z-10">
                        <h3 className="text-lg font-bold tracking-tight text-text">Activity Dynamic</h3>
                        <p className="text-xs text-text-tertiary mt-1 uppercase tracking-widest font-bold">Action distribution mix</p>
                    </div>
                    <div className="h-70 w-full relative z-10 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.activityDistribution || []}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="count"
                                    nameKey="_id"
                                    stroke="none"
                                >
                                    {(data.activityDistribution || []).map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}
                                        //  cornerRadius={4}
                                          />
                                    ))}
                                </Pie>
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
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mb-1">
                            <span className="text-4xl font-bold text-text tracking-tighter">{data.totalActivities || 0}</span>
                            <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">Total Logs</span>
                        </div>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-2 w-full relative z-10">
                        {(data.activityDistribution || []).map((item: any, i: number) => (
                            <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-surface-hover/40 rounded-lg border border-transparent transition-all hover:bg-surface-hover">
                                <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                <span className="text-[11px] font-bold text-text-secondary truncate uppercase tracking-wider">{item._id}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Project Activity Volume */}
                <div className="lg:col-span-2 card p-8 border-border/60 bg-surface/50 group relative overflow-hidden">
                    <div className="absolute bottom-0 right-0 p-10 opacity-[0.03] text-primary group-hover:scale-110 transition-transform duration-700">
                        <Box size={200} />
                    </div>
                    <div className="flex items-center justify-between mb-10 relative z-10">
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text">Workspace Intensity</h3>
                            <p className="text-sm text-text-secondary mt-1">Activity volume per project node.</p>
                        </div>
                        <button 
                            onClick={() => onDrilldown('Project Activity Intensity', data.fileCountPerProject || [])}
                            className="btn btn-secondary btn-sm rounded-lg"
                        >
                            Sync History
                        </button>
                    </div>
                    <div className="h-87.5 relative z-10">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.fileCountPerProject || []} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.4} />
                                <XAxis 
                                    dataKey="title" 
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-tertiary)' }}
                                    tickFormatter={(val) => val.length > 14 ? val.substring(0, 14) + '...' : val}
                                    dy={15}
                                />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-tertiary)' }} />
                                <ReTooltip 
                                    cursor={{fill: 'var(--color-primary)', opacity: 0.05}}
                                    contentStyle={{ 
                                        backgroundColor: 'var(--color-surface)', 
                                        borderRadius: '12px', 
                                        border: '1px solid var(--color-border)',
                                        boxShadow: 'var(--shadow-xl)',
                                        padding: '16px',
                                        fontSize: '13px'
                                    }}
                                />
                                <Bar 
                                    dataKey="fileCount" 
                                    fill="var(--color-primary)" 
                                    radius={[8, 8, 0, 0]} 
                                    barSize={40} 
                                    name="Artifacts Logged"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Resource List */}
                <div className="card p-8 border-border/60 bg-surface/50 group h-fit max-h-150 flex flex-col">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                            <Archive size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text">Repository Vault</h3>
                            <p className="text-xs text-text-tertiary mt-0.5 font-bold uppercase tracking-wider">Asset telemetry</p>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {(data.fileCountPerProject || []).slice(0, 10).map((proj: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-surface/60 hover:bg-surface rounded-xl border border-transparent hover:border-border transition-all group/item cursor-pointer shadow-sm" onClick={() => onDrilldown(`Assets: ${proj.title}`, [proj])}>
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-surface text-text-tertiary rounded-lg border border-border group-hover/item:bg-primary/10 group-hover/item:text-primary group-hover/item:border-primary/20 transition-all">
                                        <Box size={16} />
                                    </div>
                                    <span className="text-sm font-semibold text-text truncate max-w-30">{proj.title}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-base font-bold text-primary">{proj.fileCount}</span>
                                    <span className="text-[10px] font-bold text-text-tertiary ml-1.5 uppercase tracking-widest">FILES</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Activity Timeline */}
                <div className="lg:col-span-2 card p-8 border-border/60 bg-surface/50 h-150 flex flex-col">
                    <div style={{
                        marginBottom: "20px"
                    }} className="flex items-center justify-between mb-10">
                        <div>
                            <h3 className="text-lg font-bold tracking-tight text-text flex items-center gap-2">
                                <History size={20} className="text-primary" />
                                Operational Log
                            </h3>
                            <p className="text-sm text-text-secondary mt-1">Real-time trace of organizational actions.</p>
                        </div>
                        {/* <button 
                            onClick={() => onDrilldown('Recent Activity History', data.recentActivities || [])}
                            className="btn btn-primary btn-sm rounded-lg"
                        >
                            History Node
                        </button> */}
                    </div>

                    <div className="space-y-6 flex flex-col gap-4 flex-1 overflow-y-auto pr-4 custom-scrollbar pl-2">
                        {(data.recentActivities || []).slice(0, 10).map((act: any, i: number) => (
                            <div key={i} className="flex gap-6 group/item relative">
                                <div className="flex flex-col items-center relative z-10">
                                    <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center group-hover/item:border-primary/40 group-hover/item:bg-primary/5 transition-all shadow-sm">
                                        {getIcon(act.action)}
                                    </div>
                                    {i < Math.min(10, data.recentActivities?.length || 0) - 1 && (
                                        <div className="w-0.5 flex-1 bg-border/40 my-2"></div>
                                    )}
                                </div>
                                <div className="flex-1 pb-6 relative z-10">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                            act.action.includes('create') ? 'bg-success/10 text-success' : 
                                            act.action.includes('update') ? 'bg-primary/10 text-primary' : 
                                            act.action.includes('comment') ? 'bg-warning/10 text-warning' : 'bg-surface-hover text-text-tertiary'
                                        }`}>
                                            {act.action}
                                        </span>
                                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">
                                            {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="p-4 bg-surface/60 rounded-xl border border-transparent group-hover/item:border-border group-hover/item:bg-surface transition-all">
                                        <p className="text-sm text-text-secondary">
                                            <span className="font-bold text-text mr-1.5">{act.user?.name || 'Automated System'}</span> 
                                            &nbsp;processed <span className="font-bold text-primary">{act.entityType}</span> transaction
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!data.recentActivities || data.recentActivities.length === 0) && (
                            <div className="py-20 text-center opacity-40">
                                <CheckCircle size={40} className="mx-auto mb-4" />
                                <p className="text-sm font-bold">No recent activity detected.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ActivityReport;
