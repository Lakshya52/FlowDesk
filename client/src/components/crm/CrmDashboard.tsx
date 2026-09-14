import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Building, Loader2, ArrowRight, Settings } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import Modal from '../common/Modal';
import { useAuthStore } from '../../store/authStore';
import { useCrmSocket } from '../../hooks/useCrmSocket';

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

const DEFAULT_STATUS_COLORS: Record<string, string> = {
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

const STATUS_ORDER = ['new', 'attempted', 'connected', 'interested', 'callback_scheduled', 'meeting_scheduled', 'not_interested', 'not_reachable', 'do_not_call', 'closed_won', 'closed_lost'];

const statusColorKey = (uid?: string) => `crm-lifecycle-colors:${uid || 'anon'}`;

function loadStatusColors(uid?: string): Record<string, string> {
    const out = { ...DEFAULT_STATUS_COLORS };
    try {
        const raw = localStorage.getItem(statusColorKey(uid));
        if (!raw) return out;
        const parsed = JSON.parse(raw);
        for (const k of Object.keys(DEFAULT_STATUS_COLORS)) {
            if (typeof parsed[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed[k])) out[k] = parsed[k];
        }
    } catch {
        // corrupted storage — fall back to defaults
    }
    return out;
}

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

// Color settings dialog keeps a local draft while picking so the dashboard
// chart doesn't re-render on every native-picker tick (the lag). Parent
// state — and the chart — update once on Done.
function LifecycleColorDialog({ open, initialColors, userName, onClose, onApply }: {
    open: boolean;
    initialColors: Record<string, string>;
    userName?: string;
    onClose: () => void;
    onApply: (c: Record<string, string>) => void;
}) {
    const [draft, setDraft] = useState<Record<string, string>>({ ...initialColors });
    const wasOpen = useRef(false);
    if (open && !wasOpen.current) setDraft({ ...initialColors });
    wasOpen.current = open;

    return (
        <Modal isOpen={open} onClose={onClose} zIndex={4960}>
            <div className="card animate-fade-in w-full" style={{ maxWidth: 'min(420px, calc(100vw - 32px))', padding: 0, overflow: 'hidden', borderRadius: 16, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
                <div className="px-5 py-4 border-b border-(--color-border) flex items-center gap-2.5 bg-(--color-surface)">
                    <div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
                        <Settings size={18} className="text-(--color-primary)" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-bold m-0">Lifecycle colors</h3>
                        <p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
                            Saved for {userName || 'your account'} on this device
                        </p>
                    </div>
                </div>

                <div className="p-4 overflow-y-auto">
                    <div className="grid grid-cols-3 gap-2">
                        {STATUS_ORDER.map(key => (
                            <label key={key} className="flex flex-col items-center gap-1 cursor-pointer m-0 p-2 rounded-lg hover-bg" title={STATUS_LABELS[key] || key}>
                                {/* Square swatch: native color inputs carry a UA-fixed
                                    height that ignores aspect-ratio, so the visible
                                    square is a div with the picker overlaid invisibly. */}
                                <div style={{ width: '100%', aspectRatio: '1 / 1', padding: 3, border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', position: 'relative', cursor: 'pointer' }}>
                                    <div style={{ width: '100%', height: '100%', borderRadius: 6, background: draft[key] }} />
                                    <input
                                        type="color"
                                        value={draft[key]}
                                        onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
                                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', padding: 0, border: 'none' }}
                                    />
                                </div>
                                <span className="text-[0.68rem] font-medium text-(--color-text) truncate w-full text-center">{STATUS_LABELS[key] || key}</span>
                                <span className="text-[0.62rem] text-(--color-text-tertiary) uppercase">{draft[key]}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-(--color-border) flex justify-between gap-2 bg-(--color-surface)">
                    <button className="btn btn-secondary btn-sm" onClick={() => setDraft({ ...DEFAULT_STATUS_COLORS })}>
                        Reset to defaults
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => { onApply(draft); onClose(); }}>
                        Done
                    </button>
                </div>
            </div>
        </Modal>
    );
}

const CrmDashboard = () => {
    const navigate = useNavigate();
    useCrmSocket();
    const { user } = useAuthStore();
    const [statusColors, setStatusColors] = useState<Record<string, string>>(() => loadStatusColors(user?._id));
    const [showColorSettings, setShowColorSettings] = useState(false);

    useEffect(() => {
        try {
            localStorage.setItem(statusColorKey(user?._id), JSON.stringify(statusColors));
        } catch {
            // storage full/blocked — colors still apply for this session
        }
    }, [statusColors, user?._id]);

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

    const statusCounts: Record<string, number> = stats?.statusCounts || {};

    const lifecycleData = STATUS_ORDER.map(s => ({
        name: STATUS_LABELS[s] || s,
        value: statusCounts[s] || 0,
        color: statusColors[s] || '#94a3b8',
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>Leads Lifecycle</h3>
                    <button
                        onClick={() => setShowColorSettings(true)}
                        className="btn btn-ghost btn-sm"
                        title="Customize lifecycle colors"
                        aria-label="Customize lifecycle colors"
                        style={{ color: 'var(--color-text-tertiary)' }}
                    >
                        <Settings size={14} />
                    </button>
                </div>
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

            {/* ── Lifecycle color settings ── */}
            <LifecycleColorDialog
                open={showColorSettings}
                initialColors={statusColors}
                userName={user?.name}
                onClose={() => setShowColorSettings(false)}
                onApply={setStatusColors}
            />
        </div>
    );
};

export default CrmDashboard;