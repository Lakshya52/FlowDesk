import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Search, FileSpreadsheet } from 'lucide-react';

interface DrilldownModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: any[];
}

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/** Friendly labels for machine keys across all report payloads. */
const LABEL_OVERRIDES: Record<string, string> = {
    created: 'Created',
    completed: 'Completed',
    count: 'Actions',
    totalActions: 'Actions',
    name: 'Name',
    tasksAssigned: 'Tasks Assigned',
    tasksCompleted: 'Completed',
    tasksCreated: 'Created',
    onTimeDeliveryPct: 'On-Time %',
    lateCompletions: 'Late Completions',
    activeDays: 'Active Days',
    currentStreak: 'Current Streak',
    avgCompletionHrs: 'Avg Completion',
    estimatedHours: 'Est. Hours',
    loggedHours: 'Logged Hours',
    capacityPct: 'Capacity %',
    completionRate: 'Completion Rate',
    totalTasks: 'Total Tasks',
    completedTasks: 'Completed Tasks',
    overdueTasks: 'Overdue Tasks',
    dueThisWeek: 'Due This Week',
    staleTasks: 'Stale Tasks',
    assignmentCount: 'Assignments',
    taskCount: 'Tasks',
    commentCount: 'Comments',
};

const humanizeKey = (key: string) => {
    if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
};

const isPlainValue = (v: unknown): v is string | number | boolean | null =>
    v === null || ['string', 'number', 'boolean'].includes(typeof v);

const formatCell = (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    const str = String(value);
    // Never leak raw ObjectIds into the UI
    if (OBJECT_ID_RE.test(str)) return '—';
    // ISO date strings (daily trend keys etc.)
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
    }
    if (typeof value === 'number') {
        if (/pct|rate/i.test(key)) return `${value}%`;
        if (/hours/i.test(key)) return `${value}h`;
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return str;
};

const isDateLike = (v: unknown) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/**
 * Decide visible columns for a payload row set.
 * Drops internal keys; if "_id" holds a Mongo ObjectId (e.g. a userId on
 * leaderboard rows) it is dropped too — but kept when it carries real data
 * (a date key on trend rows, or an action type on distribution rows).
 */
const pickColumns = (rows: any[]): { key: string; label: string }[] => {
    if (!rows.length) return [];
    const drop = new Set(['__v', 'user', 'avatar']);
    const sample = rows[0];
    return Object.keys(sample)
        .filter(k => {
            if (drop.has(k)) return false;
            if (k === '_id') return !OBJECT_ID_RE.test(String(sample[k]));
            return true;
        })
        .map(k => ({
            key: k,
            label: k === '_id'
                ? (isDateLike(sample[k]) ? 'Date' : 'Key')
                : humanizeKey(k),
        }));
};

const DrilldownModal: React.FC<DrilldownModalProps> = ({ isOpen, onClose, title, data }) => {
    const [search, setSearch] = React.useState('');
    const [sortKey, setSortKey] = React.useState<string | null>(null);
    const [sortAsc, setSortAsc] = React.useState(true);

    React.useEffect(() => {
        if (isOpen) { setSearch(''); setSortKey(null); setSortAsc(true); }
    }, [isOpen]);

    const columns = React.useMemo(() => pickColumns(data), [data]);

    const rows = React.useMemo(() => {
        let result = [...data];
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(row =>
                columns.some(({ key: col }) => {
                    const v = (row as any)[col];
                    return isPlainValue(v) && formatCell(col, v).toLowerCase().includes(q);
                })
            );
        }
        if (sortKey) {
            result.sort((a: any, b: any) => {
                const va = a[sortKey], vb = b[sortKey];
                if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
                return sortAsc
                    ? String(va ?? '').localeCompare(String(vb ?? ''))
                    : String(vb ?? '').localeCompare(String(va ?? ''));
            });
        }
        return result;
    }, [data, columns, search, sortKey, sortAsc]);

    const handleExportCsv = () => {
        if (!rows.length) return;
        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const header = columns.map(c => c.label).map(escape).join(',');
        const body = rows.map(r => columns.map(c => escape(formatCell(c.key, (r as any)[c.key]))).join(',')).join('\n');
        const blob = new Blob(["\uFEFF" + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `flowdesk-drilldown-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 3000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-surface border border-border w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up transform-gpu"
                style={{ background: 'var(--color-surface)' }}
            >
                {/* Modal Header */}
                <div
                    className="px-8 py-6 border-b border-border flex items-center justify-between gap-4 shrink-0"
                    style={{ background: 'var(--color-surface)' }}
                >
                    <div className="flex items-center gap-5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xl font-bold tracking-tight text-text leading-none truncate">{title}</h2>
                            <p className="text-xs font-semibold text-text-tertiary mt-1.5 uppercase tracking-wider">
                                <span className="text-primary font-bold">{rows.length}</span> of {data.length} records
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="relative hidden sm:block">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search…"
                                className="input h-10 pl-9 pr-3 w-44 text-sm"
                            />
                        </div>
                        <button
                            onClick={handleExportCsv}
                            disabled={!rows.length}
                            className="h-10 px-5 bg-surface hover:bg-surface-hover border border-border rounded-xl text-xs font-bold uppercase tracking-wider text-text-secondary transition-all flex items-center gap-2.5 shadow-sm group/export disabled:opacity-50"
                        >
                            <Download size={16} className="group-hover/export:translate-y-0.5 transition-transform" /> Export CSV
                        </button>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="w-10 h-10 flex items-center justify-center bg-surface hover:bg-danger/5 hover:text-danger rounded-xl text-text-tertiary transition-all border border-border hover:border-danger/20 group/close"
                        >
                            <X size={20} className="group-hover/close:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                </div>

                {/* Data Grid */}
                <div className="flex-1 overflow-auto p-8 min-h-0" style={{ background: 'var(--color-bg)' }}>
                    {!rows.length ? (
                        <div className="h-full min-h-64 flex flex-col items-center justify-center text-text-tertiary p-16 bg-surface rounded-2xl border-2 border-dashed border-border/60 group">
                            <div className="w-20 h-20 bg-surface-hover rounded-2xl border border-border mb-6 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500">
                                <Search size={32} className="opacity-20 text-primary" />
                            </div>
                            <p className="text-sm font-semibold uppercase tracking-widest opacity-40">
                                {data.length ? 'No records match your search' : 'No records found for this view'}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead
                                        className="border-b border-border text-text-tertiary text-[10px] uppercase font-bold tracking-widest sticky top-0 z-10"
                                        style={{ background: 'var(--color-surface)' }}
                                    >
                                        <tr>
                                            {columns.map(({ key, label }) => (
                                                <th
                                                    key={key}
                                                    onClick={() => {
                                                        if (sortKey === key) setSortAsc(!sortAsc);
                                                        else { setSortKey(key); setSortAsc(true); }
                                                    }}
                                                    className="px-6 py-4 font-bold cursor-pointer select-none hover:text-text transition-colors whitespace-nowrap"
                                                >
                                                    {label}
                                                    {sortKey === key && <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {rows.map((item, i) => (
                                            <tr key={i} className="hover:bg-primary/[0.04] transition-colors group/row">
                                                {columns.map(({ key: col }) => {
                                                    const value = (item as Record<string, any>)[col];
                                                    return (
                                                        <td key={col} className="px-6 py-4 text-sm text-text-secondary font-medium group-hover/row:text-text transition-colors duration-200 whitespace-nowrap max-w-72 truncate">
                                                            {isPlainValue(value)
                                                                ? formatCell(col, value)
                                                                : Array.isArray(value)
                                                                    ? `${value.length} item${value.length === 1 ? '' : 's'}`
                                                                    : <span className="text-[10px] font-bold text-text-tertiary bg-surface-hover px-3 py-1 rounded-full border border-border/40 italic">Reference</span>}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    className="px-8 py-6 border-t border-border flex justify-end relative z-10 shrink-0"
                    style={{ background: 'var(--color-surface)' }}
                >
                    <button
                        onClick={onClose}
                        className="btn btn-primary px-10 py-3 text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                        Close Details
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DrilldownModal;
