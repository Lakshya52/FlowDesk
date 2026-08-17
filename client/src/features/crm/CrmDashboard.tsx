import { useNavigate, Link } from 'react-router-dom';
import { Phone, Building, Loader2, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useCrmSocket } from '@/shared/hooks/useCrmSocket';

interface Lead {
    _id: string;
    name: string;
    phone?: string;
    companyName?: string;
    status: string;
    priority: string;
    callCount: number;
    callDuration: number;
    lastCallAt?: string;
    campaignId?: { _id: string; name: string };
    createdAt: string;
    source: string;
}

const STATUS_LABELS: Record<string, string> = {
    new: 'New',
    attempted: 'Attempted',
    connected: 'Connected',
    interested: 'Interested',
    callback_scheduled: 'Callback',
    meeting_scheduled: 'Meeting',
    not_interested: 'Not Interested',
    not_reachable: 'Not Reachable',
    do_not_call: 'Do Not Call',
    closed_won: 'Won',
    closed_lost: 'Lost',
};

const STATUS_COLORS: Record<string, string> = {
    new: '#7f1d1d',
    attempted: '#d946ef',
    connected: '#ef4444',
    interested: '#06b6d4',
    callback_scheduled: '#f472b6',
    meeting_scheduled: '#64748b',
    not_interested: '#3b82f6',
    not_reachable: '#22c55e',
    do_not_call: '#0f172a',
    closed_won: '#f97316',
    closed_lost: '#0ea5e9',
};

// const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

// const getInitials = (name: string) =>
//     name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const formatDateShort = (d?: string) => {
    if (!d) return 'Never';
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const CrmDashboard = () => {
    const navigate = useNavigate();
    useCrmSocket();

    const { data: stats, isLoading } = useQuery({
        queryKey: ["leads", "stats"],
        queryFn: async () => {
            const res = await api.get('/leads/stats');
            return res.data.success ? res.data.stats : null;
        },
    });

    const { data: priorityLeads = [] } = useQuery({
        queryKey: ["leads", "priority", "very_high"],
        queryFn: async () => {
            const res = await api.get('/leads', { params: { priority: 'very high', limit: 5 } });
            return (res.data.success ? res.data.leads : []) as Lead[];
        },
    });

    const total = stats?.total || 0;
    const won = stats?.won || 0;
    const lost = stats?.lost || 0;
    const activeLeads = stats?.active || 0;
    const successRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
        );
    }

    const kpis = [
        {
            label: 'Converted Leads',
            value: String(won),
            subtitle: `${total > 0 ? Math.round(won / total * 100) : 0}% of total`,
            subtitleColor: 'var(--color-success)',
            bg: 'var(--color-success-light)',
            color: 'var(--color-success)',
        },
        {
            label: 'Lost Leads',
            value: String(lost),
            subtitle: `${total > 0 ? Math.round(lost / total * 100) : 0}% of total`,
            subtitleColor: 'var(--color-danger)',
            bg: 'var(--color-danger-light)',
            color: 'var(--color-danger)',
        },
        {
            label: 'Active Leads',
            value: String(activeLeads),
            bg: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
        },
        {
            label: 'Success Rate',
            value: `${successRate}%`,
            bg: 'var(--color-info-light)',
            color: 'var(--color-info)',
        },
        {
            label: 'Call Duration',
            value: formatDuration(stats?.totalCallDuration || 0),
            bg: '#f3e8ff',
            color: '#8b5cf6',
        },
    ];

    const statusOrder = ['new', 'attempted', 'connected', 'interested', 'callback_scheduled', 'meeting_scheduled', 'not_interested', 'not_reachable', 'do_not_call', 'closed_won', 'closed_lost'];
    const statusCounts: Record<string, number> = stats?.statusCounts || {};

    const lifecycleData = statusOrder.map(s => ({
        name: STATUS_LABELS[s] || s,
        value: statusCounts[s] || 0,
        color: STATUS_COLORS[s] || '#94a3b8',
        statusKey: s,
    }));

    return (
        <div style={{ maxWidth: 1200 }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4" style={{ marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Overview</h1>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
                        Here's an overview of your CRM leads and queues.
                    </p>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, marginBottom: 32 }}>
                {kpis.map((kpi, idx) => (
                    <div
                        key={idx}
                        className="card animate-fade-in"
                        style={{ padding: "24px", transition: "transform 0.2s ease, box-shadow 0.2s ease", overflow: "hidden" }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 24px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                                    {kpi.label}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <div style={{ fontSize: "2.25rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--color-text)" }}>
                                        {kpi.value}
                                    </div>
                                    {kpi.subtitle && (
                                        <span style={{ fontSize: "0.875rem", fontWeight: 500, color: kpi.subtitleColor }}>{kpi.subtitle}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="card" style={{ padding: "20px", marginBottom: 24 }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: 16 }}>Leads Lifecycle</h3>
                <div style={{ height: 260, marginBottom: 24 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={lifecycleData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                                angle={-20}
                                textAnchor="end"
                            />
                            <YAxis
                                tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
                                allowDecimals={false}
                            />
                            <Tooltip
                                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "0.8125rem" }}
                            />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {lifecycleData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 8px', fontSize: '0.75rem', fontWeight: 500 }}>
                    {lifecycleData.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, color: item.color }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: item.color }} />
                            <span>{item.name} ({item.value})</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Very High Priority Leads</h3>
                    <Link className='text-[0.8rem] flex items-center justify-center gap-2' to="/crm/dial">View All <ArrowRight size={18} /></Link>
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {priorityLeads.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
                            No very high priority leads
                        </div>
                    ) : (
                        priorityLeads.map((lead) => (
                            <div
                                key={lead._id}
                                onClick={() => navigate(`/crm/dial?leadId=${lead._id}`)}
                                style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)' }}>{lead.name}</span>
                                            <span className={`badge badge-${lead.status === 'new' ? 'todo' : lead.status === 'closed_won' ? 'done' : lead.status === 'closed_lost' ? 'not_started' : 'in_progress'}`} style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                                                {lead.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3.5 text-[0.75rem] text-(--color-text-secondary) mt-0.5">
                                            {lead.phone && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <Phone size={11} /> {lead.phone}
                                                </span>
                                            )}
                                            {lead.companyName && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <Building size={11} /> {lead.companyName}
                                                </span>
                                            )}
                                            <span>Calls: {lead.callCount}</span>
                                            <span>Added {formatDateShort(lead.createdAt)}</span>
                                        </div>
                                    </div>
                                </div>
                                <ArrowRight size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default CrmDashboard;