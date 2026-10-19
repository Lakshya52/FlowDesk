import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Building, Loader2, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip, PieChart, Pie } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useCrmSocket } from '../../hooks/useCrmSocket';

// ── Types ────────────────────────────────────────────────────────────────

interface DatabaseItem {
    _id: string;
    name: string;
    leadCount?: number;
}

interface PartnerItem {
    _id: string;
    companyName?: string;
    name?: string;
    personName?: string;
    leadCount?: number;
}

interface UpcomingItem {
    _id: string;
    name: string;
    phone?: string;
    companyName?: string;
    scheduleType?: 'follow_up' | 'meeting';
    meetingAt?: string;
    nextFollowupAt?: string;
}

interface ActiveVisit {
    _id: string;
    employeeId?: { name?: string };
    clientName?: string;
    checkInTime?: string;
}

interface CaseFileCounts {
    all: number;
    in_process: number;
    closed: number;
    lost: number;
}

// ── Leads lifecycle constants (shared look with Leads Overview) ──────────
// The chart here is read-only: status colors are customized on the Leads
// Overview page and stored per-user, so both charts always match.

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

// CaseFile statuses — same palette as the CaseFiles page.
const CASE_FILE_META: { key: keyof CaseFileCounts; label: string; color: string }[] = [
    { key: 'in_process', label: 'In Process', color: '#3b82f6' },
    { key: 'closed', label: 'Sanctioned', color: '#22c55e' },
    { key: 'lost', label: 'Lost', color: '#ef4444' },
];

// ── Small helpers ────────────────────────────────────────────────────────

const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const getItemDate = (lead: UpcomingItem): Date | null => {
    const d = lead.scheduleType === "meeting" || lead.meetingAt ? lead.meetingAt : lead.nextFollowupAt;
    return d ? new Date(d) : null;
};

const formatRelativeDateTime = (d?: string): { label: string; time: string; isOverdue: boolean } => {
    if (!d) return { label: "—", time: "", isOverdue: false };
    const date = new Date(d);
    const now = new Date();
    const isOverdue = date < now;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((targetDay.getTime() - today.getTime()) / 86400000);

    const timeStr = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    let label: string;
    if (diffDays === 0) label = "Today";
    else if (diffDays === 1) label = "Tomorrow";
    else if (diffDays < 0) label = `${Math.abs(diffDays)}d overdue`;
    else if (diffDays < 7) label = date.toLocaleDateString("en-IN", { weekday: "short" });
    else label = date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

    return { label, time: timeStr, isOverdue };
};

const formatAgo = (t?: string) => {
    if (!t) return '';
    const mins = Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 60000));
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
};

const partnerName = (p: PartnerItem) => p.companyName || p.name || p.personName || 'Unnamed';

const clickableRowProps = (onClick: () => void) => ({
    onClick,
    style: { border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all 0.2s ease' } as CSSProperties,
    onMouseEnter: (e: ReactMouseEvent<HTMLDivElement>) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; },
    onMouseLeave: (e: ReactMouseEvent<HTMLDivElement>) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; },
});

const InlineSpinner = () => (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
    </div>
);

const EmptyText = ({ children }: { children: string }) => (
    <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.85rem' }}>
        {children}
    </div>
);

// ── Component ────────────────────────────────────────────────────────────

const CrmDashboard = () => {
    const navigate = useNavigate();
    useCrmSocket();
    const { user } = useAuthStore();
    const [statusColors] = useState<Record<string, string>>(() => loadStatusColors(user?._id));

    const { data: stats, isLoading } = useQuery({
        queryKey: ["leads", "stats"],
        queryFn: async () => {
            const res = await api.get('/leads/stats');
            return res.data.success ? res.data.stats : null;
        },
    });

    const { data: caseFileStats, isLoading: caseFilesLoading } = useQuery({
        queryKey: ["case-file-stats"],
        queryFn: async () => {
            const res = await api.get('/case-files/stats');
            return (res.data.success ? res.data.counts : null) as CaseFileCounts | null;
        },
    });

    const { data: databases = [], isLoading: databasesLoading } = useQuery({
        queryKey: ["databases"],
        queryFn: async () => {
            const res = await api.get('/databases');
            return (res.data.success ? res.data.databases : []) as DatabaseItem[];
        },
    });

    const { data: partners = [], isLoading: partnersLoading } = useQuery({
        queryKey: ["partners", "overview"],
        queryFn: async () => {
            const res = await api.get('/partners');
            return (res.data.success ? res.data.partners : []) as PartnerItem[];
        },
    });

    const { data: upcoming = [], isLoading: upcomingLoading } = useQuery({
        queryKey: ["leads", "upcoming", "dashboard"],
        queryFn: async () => {
            const res = await api.get('/leads/upcoming', { params: { limit: 5 } });
            return (res.data.success ? res.data.leads : []) as UpcomingItem[];
        },
    });

    const { data: activeVisits = [], isLoading: visitsLoading } = useQuery({
        queryKey: ["field-visits", "active"],
        queryFn: async () => {
            const res = await api.get('/field-visits/active');
            return (res.data.visits || []) as ActiveVisit[];
        },
    });

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
        );
    }

    // ── Derived values ──────────────────────────────────────────────────

    const total = stats?.total || 0;
    const won = stats?.won || 0;
    const lost = stats?.lost || 0;
    const activeLeads = stats?.active || 0;
    const successRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;

    const inProcess = caseFileStats?.in_process || 0;
    const closedCaseFiles = caseFileStats?.closed || 0;

    const statusCounts: Record<string, number> = stats?.statusCounts || {};
    const lifecycleData = STATUS_ORDER.map(s => ({
        name: STATUS_LABELS[s] || s,
        value: statusCounts[s] || 0,
        color: statusColors[s] || '#94a3b8',
    }));

    const caseFileData = CASE_FILE_META
        .map(m => ({ key: m.key, name: m.label, value: caseFileStats?.[m.key] || 0, color: m.color }))
        .filter(d => d.value > 0);

    const topDatabases = [...databases].sort((a, b) => (b.leadCount || 0) - (a.leadCount || 0)).slice(0, 4);
    const totalDbLeads = databases.reduce((sum, d) => sum + (d.leadCount || 0), 0);

    const topPartners = [...partners].sort((a, b) => (b.leadCount || 0) - (a.leadCount || 0)).slice(0, 4);
    const totalPartnerLeads = partners.reduce((sum, p) => sum + (p.leadCount || 0), 0);

    const kpis = [
        {
            label: 'Total Leads',
            value: String(total),
            subtitle: `${activeLeads} active`,
            subtitleColor: 'var(--color-primary)',
            to: '/crm/dial',
        },
        {
            label: 'Converted Leads',
            value: String(won),
            subtitle: `${total > 0 ? Math.round(won / total * 100) : 0}% of total`,
            subtitleColor: 'var(--color-success)',
            to: '/crm/files',
        },
        {
            label: 'Lost Leads',
            value: String(lost),
            subtitle: `${total > 0 ? Math.round(lost / total * 100) : 0}% of total`,
            subtitleColor: 'var(--color-danger)',
            to: '/crm/dial',
        },
        {
            label: 'Success Rate',
            value: `${successRate}%`,
            subtitle: `Won ${won} · Lost ${lost}`,
            subtitleColor: 'var(--color-text-tertiary)',
            to: '/crm/dial/leads-overview',
        },
        {
            label: 'Files In Process',
            value: String(inProcess),
            subtitle: `${closedCaseFiles} closed`,
            subtitleColor: 'var(--color-info)',
            to: '/crm/files',
        },
        {
            label: 'Call Time',
            value: formatDuration(stats?.totalCallDuration || 0),
            subtitle: 'total talk time',
            subtitleColor: 'var(--color-text-tertiary)',
            to: '/crm/dial/leads-overview',
        },
    ];

    return (
        <div style={{ maxWidth: 1200 }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4" style={{ marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Overview</h1>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
                        A full snapshot of your CRM — leads, caseFiles, databases, partners and field activity.
                    </p>
                </div>
            </div>

            {/* ── KPI cards (click to open the related page) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, marginBottom: 24 }}>
                {kpis.map((kpi, idx) => (
                    <div
                        key={idx}
                        className="card animate-fade-in"
                        onClick={() => navigate(kpi.to)}
                        style={{ padding: "20px", transition: "transform 0.2s ease, box-shadow 0.2s ease", overflow: "hidden", cursor: "pointer" }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 24px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                        <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, minHeight: 30 }}>
                            {kpi.label}
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--color-text)" }}>
                            {kpi.value}
                        </div>
                        <div style={{ fontSize: "0.75rem", fontWeight: 500, color: kpi.subtitleColor, marginTop: 7 }}>
                            {kpi.subtitle}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Leads pipeline + CaseFiles breakdown ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 mb-6">
                <div className="card" style={{ padding: "20px", minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>Leads Pipeline</h3>
                        <Link className='text-[0.8rem] flex items-center justify-center gap-2' to="/crm/dial">View All <ArrowRight size={18} /></Link>
                    </div>
                    <div style={{ height: 240, marginBottom: 20 }}>
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
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 8px', fontSize: '0.72rem', fontWeight: 500 }}>
                        {lifecycleData.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, color: item.color }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: item.color }} />
                                <span>{item.name} ({item.value})</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card" style={{ padding: "20px", minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>Files</h3>
                        <Link className='text-[0.8rem] flex items-center justify-center gap-2' to="/crm/files">View All <ArrowRight size={18} /></Link>
                    </div>
                    {caseFilesLoading ? (
                        <InlineSpinner />
                    ) : (caseFileStats?.all || 0) === 0 ? (
                        <EmptyText>No files yet — mark a lead as Closed Won to start one.</EmptyText>
                    ) : (
                        <>
                            <div style={{ position: 'relative', height: 220 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={caseFileData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={4} stroke="none">
                                            {caseFileData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "0.8125rem" }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: 'var(--color-text)' }}>
                                        {caseFileStats?.all || 0}
                                    </div>
                                    <div style={{ fontSize: '0.66rem', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                                        Total
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                                {CASE_FILE_META.map(m => (
                                    <div key={m.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)' }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }} />
                                            {m.label}
                                        </span>
                                        <strong style={{ color: 'var(--color-text)' }}>{caseFileStats?.[m.key] || 0}</strong>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Upcoming follow-ups & meetings ── */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Upcoming Follow-ups &amp; Meetings</h3>
                    <Link className='text-[0.8rem] flex items-center justify-center gap-2' to="/crm/schedule">View All <ArrowRight size={18} /></Link>
                </div>
                {upcomingLoading ? (
                    <InlineSpinner />
                ) : upcoming.length === 0 ? (
                    <EmptyText>Nothing scheduled — follow-ups and meetings will appear here.</EmptyText>
                ) : (
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {upcoming.map((lead) => {
                            const isMeeting = lead.scheduleType === 'meeting' || !!lead.meetingAt;
                            const date = getItemDate(lead);
                            const rel = formatRelativeDateTime(date ? date.toISOString() : undefined);
                            return (
                                <div key={lead._id} {...clickableRowProps(() => navigate(`/crm/dial?leadId=${lead._id}`))}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)' }}>{lead.name}</span>
                                            <span className={`badge ${isMeeting ? 'badge-in_progress' : 'badge-review'}`} style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                                                {isMeeting ? 'Meeting' : 'Follow-up'}
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
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: rel.isOverdue ? 'var(--color-danger)' : 'var(--color-text)' }}>
                                                {rel.label}
                                            </div>
                                            {rel.time && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>{rel.time}</div>
                                            )}
                                        </div>
                                        <ArrowRight size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Databases · Partners · Field visits ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 32 }}>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Databases</h3>
                        <Link className='text-[0.8rem] flex items-center justify-center gap-2' to="/crm/databases">View All <ArrowRight size={18} /></Link>
                    </div>
                    {databasesLoading ? (
                        <InlineSpinner />
                    ) : databases.length === 0 ? (
                        <EmptyText>No databases yet</EmptyText>
                    ) : (
                        <div style={{ padding: 16 }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                                <strong style={{ color: 'var(--color-text)', fontSize: '1.1rem' }}>{databases.length}</strong> databases ·{' '}
                                <strong style={{ color: 'var(--color-text)', fontSize: '1.1rem' }}>{totalDbLeads}</strong> leads
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {topDatabases.map(db => (
                                    <div key={db._id} {...clickableRowProps(() => navigate('/crm/databases'))}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{db.name}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{db.leadCount || 0} leads</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Channel Partners</h3>
                        <Link className='text-[0.8rem] flex items-center justify-center gap-2' to="/crm/partners">View All <ArrowRight size={18} /></Link>
                    </div>
                    {partnersLoading ? (
                        <InlineSpinner />
                    ) : partners.length === 0 ? (
                        <EmptyText>No channel partners yet</EmptyText>
                    ) : (
                        <div style={{ padding: 16 }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                                <strong style={{ color: 'var(--color-text)', fontSize: '1.1rem' }}>{partners.length}</strong> partners ·{' '}
                                <strong style={{ color: 'var(--color-text)', fontSize: '1.1rem' }}>{totalPartnerLeads}</strong> referred leads
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {topPartners.map(p => (
                                    <div key={p._id} {...clickableRowProps(() => navigate('/crm/partners'))}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partnerName(p)}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{p.leadCount || 0} leads</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Field Visits</h3>
                        <Link className='text-[0.8rem] flex items-center justify-center gap-2' to="/crm/field-visits">View All <ArrowRight size={18} /></Link>
                    </div>
                    {visitsLoading ? (
                        <InlineSpinner />
                    ) : (
                        <div style={{ padding: 16 }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: activeVisits.length > 0 ? 12 : 0 }}>
                                <strong style={{ color: activeVisits.length > 0 ? 'var(--color-success)' : 'var(--color-text)', fontSize: '1.1rem' }}>{activeVisits.length}</strong> active now
                            </div>
                            {activeVisits.length === 0 ? (
                                <div style={{ padding: '4px 0 8px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8rem' }}>
                                    No active field visits right now
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {activeVisits.slice(0, 3).map(v => (
                                        <div key={v._id} {...clickableRowProps(() => navigate('/crm/field-visits'))}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {v.employeeId?.name || 'Employee'}
                                                </div>
                                                {v.clientName && (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {v.clientName}
                                                    </div>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{formatAgo(v.checkInTime)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CrmDashboard;
