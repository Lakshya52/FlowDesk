import { useState } from 'react';
import {
    ScrollText, Search, Filter, Loader2, Clock, Target, PhoneCall,
    RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useCrmSocket } from '@/shared/hooks/useCrmSocket';

interface ActivityLog {
    _id: string;
    action: string;
    user: { _id: string; name: string; email: string; avatar?: string };
    entityType: 'campaign' | 'lead';
    entityId: string;
    metadata?: Record<string, any>;
    createdAt: string;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
    campaign: <Target size={14} />,
    lead: <PhoneCall size={14} />,
};

const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const formatDateShort = (d?: string) => {
    if (!d) return '';
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

const CrmLogs = () => {
    useCrmSocket();
    const queryClient = useQueryClient();
    const [filterEntity, setFilterEntity] = useState('');
    const [searchAction, setSearchAction] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const queryParams: any = { limit: '100' };
    if (filterEntity) queryParams.entityType = filterEntity;
    if (searchAction) queryParams.action = searchAction;

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ["activity-logs", filterEntity, searchAction],
        queryFn: async () => {
            const params: any = { limit: '100' };
            if (filterEntity) params.entityType = filterEntity;
            if (searchAction) params.action = searchAction;
            const { data } = await api.get('/activity-logs', { params });
            return { logs: (data.success ? data.logs || [] : []) as ActivityLog[], total: data.total || 0 };
        },
    });

    const logs = data?.logs || [];
    const total = data?.total || 0;
    const refreshing = isFetching && !isLoading;

    const renderMetadataDetails = (log: ActivityLog) => {
        const m = log.metadata;
        if (!m) return null;
        const rows: { label: string; value: string }[] = [];

        if (m.name) rows.push({ label: 'Name', value: m.name });
        if (m.phone) rows.push({ label: 'Phone', value: m.phone });
        if (m.company) rows.push({ label: 'Company', value: m.company });
        if (m.oldStatus && m.newStatus) {
            rows.push({ label: 'Status Change', value: `${m.oldStatus.replace(/_/g, ' ')} → ${m.newStatus.replace(/_/g, ' ')}` });
        }
        if (m.notePreview) rows.push({ label: 'Note Preview', value: m.notePreview });
        if (m.callCount) rows.push({ label: 'Call Count', value: String(m.callCount) });
        if (m.fields) rows.push({ label: 'Changed Fields', value: Array.isArray(m.fields) ? m.fields.join(', ') : m.fields });
        if (m.count) rows.push({ label: 'Leads Imported', value: String(m.count) });
        if (m.errors !== undefined) rows.push({ label: 'Errors', value: String(m.errors) });

        if (rows.length === 0) return null;

        return (
            <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--color-surface)', borderRadius: 10, fontSize: '0.75rem', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
                    {rows.map((r, i) => (
                        <div key={i} style={{ display: 'contents' }}>
                            <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{r.label}</span>
                            <span style={{ color: 'var(--color-text)', wordBreak: 'break-word' }}>{r.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ScrollText size={20} style={{ color: 'var(--color-primary)' }} />
                </div>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Activity Logs</h1>
                    <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>{total} total entries</p>
                </div>
                <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["activity-logs"] })}
                    disabled={refreshing}
                    className="h-9 rounded-xl border border-(--color-border) cursor-pointer flex gap-2 items-center justify-center text-(--color-text-secondary) px-3 text-sm"
                    title="Refresh"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'stretch' }}>
                <div style={{ flex: 1, display: 'flex', borderRadius: 10, border: '1px solid var(--color-border)', overflow: 'hidden',  }}>
                    <div style={{ padding: '0 12px', display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
                        <Search size={15} />
                    </div>
                    <input
                        type="text"
                        placeholder="Search actions..."
                        style={{ flex: 1, border: 'none', outline: 'none', padding: '12px', fontSize: '0.82rem', color: 'var(--color-text)', background: 'transparent', minWidth: 0 }}
                        value={searchAction}
                        onChange={e => setSearchAction(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') queryClient.invalidateQueries({ queryKey: ["activity-logs"] }); }}
                    />
                    {searchAction && (
                        <button
                            onClick={() => { setSearchAction(''); }}
                            style={{ border: 'none', background: 'none', padding: '10px', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: '0.8rem' }}
                        >
                            Clear
                        </button>
                    )}
                </div>
                <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--color-border)', overflow: 'hidden', }}>
                    <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
                        <Filter size={14} />
                    </div>
                    <select
                        style={{ border: 'none', outline: 'none', padding: '0 10px', fontSize: '0.8rem', color: 'var(--color-text)', background: 'transparent', cursor: 'pointer', minWidth: 120 }}
                        value={filterEntity}
                        onChange={e => setFilterEntity(e.target.value)}
                    >
                        <option value="">All Types</option>
                        <option value="campaign">Campaigns</option>
                        <option value="lead">Leads</option>
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
                </div>
            ) : logs.length === 0 ? (
                <div className="card" style={{ padding: 60, textAlign: 'center' }}>
                    <ScrollText size={48} style={{ color: 'var(--color-text-tertiary)', margin: '0 auto 16px', opacity: 0.3 }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>No Activity Logs</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        Campaign and lead activity will appear here as actions are performed.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {logs.map((log, idx) => {
                        const isExpanded = expandedId === log._id;
                        const hasMeta = log.metadata && Object.keys(log.metadata).length > 0;
                        return (
                            <div key={log._id} className="card" style={{
                                padding: '16px 20px',
                                borderLeft: `4px solid ${log.entityType === 'campaign' ? 'var(--color-primary)' : '#22c55e'}`,
                                cursor: hasMeta ? 'pointer' : 'default',
                                borderRadius: 12,
                                transition: 'box-shadow 0.15s',
                            }} onClick={() => hasMeta && setExpandedId(isExpanded ? null : log._id)}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                        background: AVATAR_COLORS[idx % AVATAR_COLORS.length],
                                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.72rem', fontWeight: 600, marginTop: 2,
                                    }}>
                                        {getInitials(log.user?.name || 'U')}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{log.user?.name || 'Unknown'}</span>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{log.action}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--color-text-tertiary)', flexWrap: 'wrap' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Clock size={11} /> {formatDateShort(log.createdAt)}
                                            </span>
                                            {log.metadata?.name && <span style={{ color: 'var(--color-text-secondary)' }}>{log.metadata.name}</span>}
                                            {log.metadata?.company && <><span>·</span><span>{log.metadata.company}</span></>}
                                            {log.metadata?.phone && <><span>·</span><span>{log.metadata.phone}</span></>}
                                        </div>
                                        {isExpanded && renderMetadataDetails(log)}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 2 }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            fontSize: '0.68rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                                            background: log.entityType === 'campaign' ? 'var(--color-primary-light)' : '#dcfce7',
                                            color: log.entityType === 'campaign' ? 'var(--color-primary)' : '#16a34a',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {ENTITY_ICONS[log.entityType]}
                                            {log.entityType}
                                        </span>
                                        {hasMeta && (
                                            <span style={{ color: 'var(--color-text-tertiary)' }}>
                                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CrmLogs;
