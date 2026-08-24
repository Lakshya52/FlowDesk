import * as React from 'react';
import {
    RotateCcw, Calendar, Users,
    Target,
    User,
    Activity
} from 'lucide-react';

interface FilterBarProps {
    filters: any;
    setFilters: (filters: any) => void;
    filterOptions: { teams: any[], employees: any[], assignments: any[] };
    onReset: () => void;
    user: any;
}

/** Task status values — must match server TaskStatus enum exactly. */
const TASK_STATUSES = [
    { value: '', label: 'Any Status' },
    { value: 'todo', label: 'To Do' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'review', label: 'In Review' },
    { value: 'completed', label: 'Completed' },
];

const isoDay = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
};

const PRESETS = [
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
];

const FilterBar = ({ filters, setFilters, filterOptions, onReset, user }: FilterBarProps) => {
    // Case-insensitive role check
    const role = (user?.role || '').toLowerCase();
    const isAdminOrManager = role === 'admin' || role === 'manager';

    const rangeInvalid =
        !!filters.startDate && !!filters.endDate &&
        new Date(filters.startDate) > new Date(filters.endDate);

    const applyPreset = (days: number) => {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        setFilters({ ...filters, startDate: isoDay(-(days - 1)), endDate: isoDay(0) });
    };

    // Dependent filtering logic
    const filteredEmployees = React.useMemo(() => {
        if (!filters.teamId || !Array.isArray(filterOptions.employees)) return filterOptions.employees || [];

        const selectedTeam = filterOptions.teams.find((t: any) => String(t._id) === String(filters.teamId));
        if (!selectedTeam) return [];

        const membersList = Array.isArray(selectedTeam.members) ? selectedTeam.members : [];
        const roster = [...membersList, selectedTeam.manager].filter(Boolean);

        return filterOptions.employees.filter((emp: any) =>
            roster.some((memberId: any) => String(memberId?._id || memberId) === String(emp._id))
        );
    }, [filters.teamId, filterOptions.employees, filterOptions.teams]);

    const filteredProjects = React.useMemo(() => {
        if (!Array.isArray(filterOptions.assignments)) return [];
        let projects = filterOptions.assignments;

        if (filters.teamId) {
            projects = projects.filter((p: any) =>
                (Array.isArray(p.teams) && p.teams.some((tid: any) => String(tid?._id || tid) === String(filters.teamId))) ||
                (Array.isArray(p.team) && p.team.some((tid: any) => String(tid?._id || tid) === String(filters.teamId))) ||
                String(p.team) === String(filters.teamId)
            );
        }

        if (filters.employeeId) {
            projects = projects.filter((p: any) =>
                String(p.createdBy?._id || p.createdBy) === String(filters.employeeId) ||
                (Array.isArray(p.team) && p.team.some((uid: any) => String(uid?._id || uid) === String(filters.employeeId)))
            );
        }

        return projects;
    }, [filters.teamId, filters.employeeId, filterOptions.assignments]);

    const activePreset = PRESETS.find(p => filters.startDate === isoDay(-(p.days - 1)) && filters.endDate === isoDay(0));

    return (
        <div className="flex flex-col card p-6 border-border/80 shadow-md gap-4" style={{ marginTop: "20px" }}>
            {/* Date Range Group */}
            <div className="flex  flex-col gap-2 w-full sm:w-auto min-w-70 ">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={16} className="text-primary" />
                    Time Period
                </label>
                <div className="flex flex-wrap items-center  gap-4">
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={filters.startDate || ''}
                            max={filters.endDate || undefined}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            className={`input h-10 px-3 text-sm font-medium focus:ring-1 focus:ring-primary/10 ${rangeInvalid ? 'border-danger' : ''}`}
                        />
                        <span className="text-text-tertiary font-bold px-1 text-xs">TO</span>
                        <input
                            type="date"
                            value={filters.endDate || ''}
                            min={filters.startDate || undefined}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            className={`input h-10 px-3 text-sm font-medium focus:ring-1 focus:ring-primary/10 ${rangeInvalid ? 'border-danger' : ''}`}
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        {PRESETS.map(p => (
                            <button
                                key={p.label}
                                onClick={() => applyPreset(p.days)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                                    activePreset?.label === p.label
                                        ? 'bg-primary/10 text-primary border-primary/30'
                                        : 'bg-surface-hover/50 text-text-tertiary border-transparent hover:border-border hover:text-text-secondary'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                        {rangeInvalid && (
                            <span className="text-[11px] font-bold text-danger ml-1">End date is before start date</span>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap items-end gap-4 sm:gap-6">
                {/* Team Filter */}
                {isAdminOrManager && (
                    <div className="flex flex-col gap-2 w-full sm:w-auto min-w-45">
                        <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <Users size={16} className="text-primary" />
                            Team
                        </label>
                        <select
                            value={filters.teamId || ''}
                            onChange={(e) => setFilters({ ...filters, teamId: e.target.value, employeeId: '', projectId: '' })}
                            className="select h-10 px-3 text-sm font-medium focus:ring-1 focus:ring-primary/10"
                        >
                            <option value="">All Teams</option>
                            {Array.isArray(filterOptions.teams) && filterOptions.teams.map(team => (
                                <option key={team._id} value={team._id}>{team.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Employee Filter */}
                {isAdminOrManager && (
                    <div className="flex flex-col gap-2 w-full sm:w-auto min-w-45">
                        <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <User size={16} className="text-primary" />
                            Member
                        </label>
                        <select
                            value={filters.employeeId || ''}
                            onChange={(e) => setFilters({ ...filters, employeeId: e.target.value, projectId: '' })}
                            className="select h-10 px-3 text-sm font-medium focus:ring-1 focus:ring-primary/10"
                        >
                            <option value="">All Personnel</option>
                            {filteredEmployees.map((emp: any) => (
                                <option key={emp._id} value={emp._id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Project Filter */}
                <div className="flex flex-col gap-2 w-full sm:w-auto min-w-50">
                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                        <Target size={16} className="text-primary" />
                        Project
                    </label>
                    <select
                        value={filters.projectId || ''}
                        onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
                        className="select h-10 px-3 text-sm font-medium focus:ring-1 focus:ring-primary/10"
                    >
                        <option value="">Global Overview</option>
                        {filteredProjects.map((asgn: any) => (
                            <option key={asgn._id} value={asgn._id}>{asgn.title}</option>
                        ))}
                    </select>
                </div>

                

                {/* Status Filter */}
                <div className="flex flex-col gap-2 w-full sm:w-auto min-w-37.5">
                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                        <Activity size={16} className="text-primary" />
                        Status
                    </label>
                    <select
                        value={filters.status || ''}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className="select h-10 px-3 text-sm font-medium focus:ring-1 focus:ring-primary/10"
                    >
                        {TASK_STATUSES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                </div>

                {/* Reset Button */}
                <div className="w-full sm:w-auto sm:ml-auto flex items-center h-10 mb-0.5 justify-end">
                    <button
                        onClick={onReset}
                        className="flex items-center justify-center gap-2 px-4 h-full text-xs font-bold uppercase tracking-wider text-danger hover:bg-danger-light rounded-lg border border-transparent hover:border-danger/10 transition-all active:scale-95 group/reset w-full sm:w-auto"
                    >
                        <RotateCcw size={16} className="group-hover/reset:rotate-180 transition-transform duration-500" />
                        Reset Filters
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FilterBar;
