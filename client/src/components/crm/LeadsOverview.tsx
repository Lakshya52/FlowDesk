import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Building, Loader2, ArrowRight, Settings } from 'lucide-react';
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
    databaseId?: { _id: string; name: string };
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

// Color settings dialog keeps a local draft while picking so the board
// doesn't re-render on every native-picker tick (the lag). Parent state
// updates once on Done. Colors are stored per-user and are also read by
// the CRM Overview page so both stay in sync.
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

const LeadsOverview = () => {
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

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
        );
    }

    const total = stats?.total || 0;
    const activeLeads = stats?.active || 0;
    const won = stats?.won || 0;
    const lost = stats?.lost || 0;
    const statusCounts: Record<string, number> = stats?.statusCounts || {};

    const distribution = STATUS_ORDER.map(s => {
        const value = statusCounts[s] || 0;
        return {
            key: s,
            label: STATUS_LABELS[s] || s,
            value,
            color: statusColors[s] || '#94a3b8',
            pct: total > 0 ? (value / total) * 100 : 0,
        };
    });
    const segments = distribution.filter(d => d.value > 0);

    return (
        <div style={{ maxWidth: 1200 }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4" style={{ marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Leads Overview</h1>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
                        Here's where your leads are sitting right now — click any status to open it in the Dial Queue.
                    </p>
                </div>
            </div>

            {/* ── Pipeline strip ── */}
            <div className="card" style={{ padding: "20px", marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>Leads Pipeline</h3>
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

                {total === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
                        No leads yet
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', height: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-surface-hover)' }}>
                            {segments.map(seg => (
                                <div
                                    key={seg.key}
                                    title={`${seg.label}: ${seg.value} (${seg.pct.toFixed(1)}%)`}
                                    style={{ width: `${seg.pct}%`, background: seg.color, transition: 'width 0.3s ease' }}
                                />
                            ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '14px 20px', marginTop: 16, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                            <span><strong style={{ color: 'var(--color-text)', fontSize: '1.05rem' }}>{total}</strong> total leads</span>
                            <span><strong style={{ color: 'var(--color-primary)', fontSize: '1.05rem' }}>{activeLeads}</strong> active</span>
                            <span><strong style={{ color: 'var(--color-success)', fontSize: '1.05rem' }}>{won}</strong> won</span>
                            <span><strong style={{ color: 'var(--color-danger)', fontSize: '1.05rem' }}>{lost}</strong> lost</span>
                        </div>
                    </>
                )}
            </div>

            {/* ── Status board ── */}
            <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: '0 0 12px' }}>Status Board</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    {distribution.map(d => {
                        const clickable = d.value > 0;
                        return (
                            <div
                                key={d.key}
                                className="card animate-fade-in"
                                onClick={clickable ? () => navigate(`/crm/dial?status=${d.key}`) : undefined}
                                style={{ padding: '14px 16px', borderLeft: `3px solid ${d.color}`, cursor: clickable ? 'pointer' : 'default', opacity: clickable ? 1 : 0.5, transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
                                onMouseEnter={e => { if (!clickable) return; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                                        {d.label}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{d.pct.toFixed(0)}%</span>
                                </div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, marginTop: 10, color: 'var(--color-text)' }}>
                                    {d.value}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Very High Priority Leads ── */}
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

export default LeadsOverview;
