import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, AlertOctagon, CalendarClock, CheckCircle2, ArrowUpDown, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import useReportQuery from '../../hooks/useReportQuery';
import { ReportError, ReportEmpty, StatCard } from './ReportStates';

interface ProjectHealthReportProps {
    filters: any;
    /** Intentionally unused — project cards open the project directly (no drilldown modal). */
    onDrilldown?: (title: string, data: any[]) => void;
}

const PAGE_SIZE = 12;

const HEALTH_META: Record<string, { label: string; dot: string; chip: string }> = {
    red: { label: 'At Risk', dot: 'var(--color-danger)', chip: 'bg-danger/10 text-danger border border-danger/20' },
    yellow: { label: 'Watch', dot: 'var(--color-warning)', chip: 'bg-warning/10 text-warning border border-warning/20' },
    green: { label: 'Healthy', dot: 'var(--color-success)', chip: 'bg-success/10 text-success border border-success/20' },
};

type SortKey = 'health' | 'overdueTasks' | 'completionPct' | 'dueThisWeek' | 'daysSinceActivity';

const SORT_OPTIONS: [SortKey, string][] = [
    ['health', 'Risk'],
    ['overdueTasks', 'Overdue'],
    ['dueThisWeek', 'Due Soon'],
    ['completionPct', 'Progress'],
    ['daysSinceActivity', 'Last Active'],
];

const ProjectHealthReport = ({ filters }: ProjectHealthReportProps) => {
    const navigate = useNavigate();
    const [sortKey, setSortKey] = React.useState<SortKey>('health');
    const [sortAsc, setSortAsc] = React.useState(true);
    const [searchInput, setSearchInput] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [page, setPage] = React.useState(1);

    // Debounce the search box so we don't hammer the API per keystroke
    React.useEffect(() => {
        const t = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    // New scope from the shared filter bar → back to page 1
    const filterSignature = JSON.stringify(filters);
    React.useEffect(() => { setPage(1); }, [filterSignature]);

    const queryParams = React.useMemo(() => ({
        ...filters,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
        sortBy: sortKey,
        sortDir: sortAsc ? 'asc' : 'desc',
    }), [filters, search, page, sortKey, sortAsc]);

    const { data, isLoading, isError, refetch, isFetching } = useReportQuery(
        '/reports/project-health',
        queryParams,
        true,
        { keepPreviousData: true }
    );

    const projects = data?.projects || [];
    const summary = data?.summary;
    const pagination = data?.pagination;

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) setSortAsc(!sortAsc);
        else { setSortKey(key); setSortAsc(key === 'completionPct'); }
        setPage(1); // server re-sorts the full set — start from the top
    };

    if (isError) return <ReportError onRetry={() => refetch()} />;
    // Full skeleton only on the very first load; afterwards previous data stays
    // visible (keepPreviousData) and the grid just dims while refreshing.
    if (isLoading && !data) return <HealthSkeleton />;

    return (
        <div className="space-y-6 pb-10">
            {/* Summary cards */}
            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <StatCard label="Total Projects" value={summary.totalProjects} sub="in selected scope" icon={<FolderKanban size={22} />} color="var(--color-primary)" />
                    <StatCard label="At Risk" value={summary.redCount} sub="overdue or past due date" icon={<AlertOctagon size={22} />} color="var(--color-danger)" />
                    <StatCard label="Needs Watch" value={summary.yellowCount} sub="stalled or tight deadlines" icon={<CalendarClock size={22} />} color="var(--color-warning)" />
                    <StatCard label="Healthy" value={summary.greenCount} sub="on track" icon={<CheckCircle2 size={22} />} color="var(--color-success)" />
                </div>
            )}

            {/* Projects grid */}
            <div>
                <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                    <h3 className="text-base font-bold tracking-tight text-text shrink-0">Project Health Matrix</h3>

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder="Search project or client…"
                                className="input h-9 pl-9 pr-8 w-56 text-sm"
                                style={{paddingLeft: "36px"}}
                            />
                            {searchInput && (
                                <button
                                    onClick={() => setSearchInput('')}
                                    aria-label="Clear search"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Sort */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mr-1">Sort</span>
                            {SORT_OPTIONS.map(([key, label]) => (
                                <button key={key}
                                    onClick={() => toggleSort(key)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border inline-flex items-center gap-1 ${
                                        sortKey === key ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-hover/50 text-text-tertiary border-transparent hover:border-border'
                                    }`}>
                                    {label}
                                    {sortKey === key && <ArrowUpDown size={11} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {!projects.length ? (
                    <ReportEmpty
                        title={search ? `No matches for "${search}"` : 'No projects to assess'}
                        subtitle={search
                            ? 'Try a different project or client name, or clear the search.'
                            : 'Create a project or adjust your filters — health scores appear once projects have tasks.'} />
                ) : (
                <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 transition-opacity duration-200 ${isFetching ? 'opacity-50 pointer-events-none' : ''}`}>
                    {projects.map((p: any) => {
                        const meta = HEALTH_META[p.health] || HEALTH_META.green;
                        return (
                            <div key={p._id}
                                className="card p-6 border-border/60 bg-surface/50 hover:shadow-xl hover:border-primary/30 transition-all cursor-pointer group"
                                onClick={() => navigate(`/assignments/${p._id}`)}
                                title="Open project">
                                <div className="flex items-start justify-between gap-3 mb-4">
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-text truncate group-hover:text-primary transition-colors">{p.title}</h4>
                                        <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{p.clientName}</p>
                                    </div>
                                    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.chip}`}>
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.dot }}></span>
                                        {meta.label}
                                    </span>
                                </div>

                                {/* Progress */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                                        <span className="text-text-tertiary uppercase tracking-wider">Progress</span>
                                        <span className="text-text-secondary">{p.completionPct}% · {p.completedTasks}/{p.totalTasks}</span>
                                    </div>
                                    <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden border border-border">
                                        <div className={`h-full rounded-full transition-all duration-500 ${
                                            p.completionPct >= 70 ? 'bg-success' : p.completionPct >= 40 ? 'bg-warning' : 'bg-danger'
                                        }`} style={{ width: `${p.completionPct}%` }}></div>
                                    </div>
                                </div>

                                {/* Metrics row */}
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className={`rounded-xl px-2 py-2.5 ${p.overdueTasks > 0 ? 'bg-danger/10' : 'bg-surface-hover/40'}`}>
                                        <p className={`text-lg font-black leading-none ${p.overdueTasks > 0 ? 'text-danger' : 'text-text-secondary'}`}>{p.overdueTasks}</p>
                                        <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider mt-1">Overdue</p>
                                    </div>
                                    <div className={`rounded-xl px-2 py-2.5 ${p.dueThisWeek > 0 ? 'bg-warning/10' : 'bg-surface-hover/40'}`}>
                                        <p className={`text-lg font-black leading-none ${p.dueThisWeek > 0 ? 'text-warning' : 'text-text-secondary'}`}>{p.dueThisWeek}</p>
                                        <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider mt-1">Due 7d</p>
                                    </div>
                                    <div className="rounded-xl px-2 py-2.5 bg-surface-hover/40">
                                        <p className="text-lg font-black leading-none text-text-secondary">{p.daysSinceActivity ?? '—'}</p>
                                        <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider mt-1">Days Quiet</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                )}

                {/* Pagination */}
                {projects.length > 0 && pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 mt-6 flex-wrap">
                        <p className="text-xs font-semibold text-text-tertiary">
                            Showing <span className="text-text-secondary font-bold">{(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of{' '}
                            <span className="text-text-secondary font-bold">{pagination.total}</span> projects
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage((v) => Math.max(1, v - 1))}
                                disabled={pagination.page <= 1}
                                aria-label="Previous page"
                                className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-hover text-text-secondary transition-all disabled:opacity-40 disabled:pointer-events-none"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="text-xs font-bold text-text-secondary px-2">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <button
                                onClick={() => setPage((v) => Math.min(pagination.totalPages, v + 1))}
                                disabled={pagination.page >= pagination.totalPages}
                                aria-label="Next page"
                                className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-hover text-text-secondary transition-all disabled:opacity-40 disabled:pointer-events-none"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const HealthSkeleton = () => (
    <div className="space-y-8 animate-pulse pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="card p-6 border-border/40 h-32">
                    <div className="w-12 h-12 rounded-xl bg-surface-hover"></div>
                    <div className="mt-4 w-16 h-7 bg-surface-hover rounded-lg"></div>
                </div>
            ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="card p-6 border-border/40 h-52 bg-surface/50"></div>
            ))}
        </div>
    </div>
);

export default ProjectHealthReport;
