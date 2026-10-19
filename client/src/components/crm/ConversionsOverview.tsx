import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowUpRight,
	BadgeCheck,
	CalendarClock,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Clock,
	FolderOpen,
	Loader2,
	MessageSquare,
	PhoneCall,
	RefreshCw,
	Users,
	XCircle,
} from "lucide-react";
import api from "../../lib/api";
import Avatar from "../common/Avatar";
import { useAuthStore } from "../../store/authStore";
import { useCrmSocket } from "../../hooks/useCrmSocket";

interface OverviewUser {
	_id: string;
	name: string;
	email?: string;
	avatar?: string;
	role?: string;
	isActive?: boolean;
}

interface PersonStats {
	userId: string;
	user: OverviewUser | null;
	leadsTouched: number;
	calls: number;
	followUps: number;
	meetings: number;
	notes: number;
	leadsCreated: number;
	filesCreated: number;
	sanctioned: number;
	lost: number;
	statusChanges: number;
}

interface HistoryEntry {
	_id: string;
	action: string;
	createdAt: string;
	user: OverviewUser | null;
	entityType: "lead" | "conversion";
	entityId: string;
	leadId: string | null;
	caseFileId: string | null;
	leadName: string | null;
	company: string | null;
	phone: string | null;
}

interface ProcessedLead {
	leadId: string;
	caseFileId: string | null;
	caseFileStatus: "in_process" | "closed" | "lost" | null;
	name: string;
	company: string | null;
	phone: string | null;
	product: string | null;
	status: string | null;
	user: OverviewUser | null;
	action: string;
	at: string;
}

interface OverviewData {
	scope: {
		month: string;
		start: string;
		end: string;
		userId: string | null;
		role: string;
	};
	members: OverviewUser[];
	overall: {
		leads: number;
		calls: number;
		followUps: number;
		meetings: number;
		files: {
			total: number;
			in_process: number;
			closed: number;
			lost: number;
		};
		conversionRate: number;
	};
	monthly: {
		leadsTouched: number;
		calls: number;
		followUps: number;
		meetings: number;
		notes: number;
		leadsCreated: number;
		filesCreated: number;
		sanctioned: number;
		lost: number;
		statusChanges: number;
	};
	team: PersonStats[];
	history: HistoryEntry[];
	historyTotal: number;
	processedLeads: ProcessedLead[];
}

type HistoryFilter = "all" | "calls" | "schedules" | "files" | "notes";

const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
	{ key: "all", label: "All activity" },
	{ key: "calls", label: "Calls" },
	{ key: "schedules", label: "Follow-ups & meetings" },
	{ key: "files", label: "Files" },
	{ key: "notes", label: "Notes" },
];

const LEAD_STATUS_META: Record<string, { label: string; color: string }> = {
	new: { label: "New", color: "#6366f1" },
	attempted: { label: "Attempted", color: "#8b5cf6" },
	connected: { label: "Connected", color: "#3b82f6" },
	interested: { label: "Interested", color: "#0ea5e9" },
	callback_scheduled: { label: "Callback", color: "#06b6d4" },
	meeting_scheduled: { label: "Meeting", color: "#10b981" },
	not_interested: { label: "Not interested", color: "#f59e0b" },
	not_reachable: { label: "Not reachable", color: "#f97316" },
	do_not_call: { label: "Do not call", color: "#ef4444" },
	closed_won: { label: "Closed won", color: "#22c55e" },
	closed_lost: { label: "Closed lost", color: "#dc2626" },
};

const FILE_STATUS_META: Record<string, { label: string; color: string }> = {
	in_process: { label: "In Process", color: "#3b82f6" },
	closed: { label: "Sanctioned", color: "#22c55e" },
	lost: { label: "Lost", color: "#ef4444" },
};

const monthLabel = (month: string) => {
	const [year, m] = month.split("-").map(Number);
	if (!year || !m) return month;
	return new Date(year, m - 1, 1).toLocaleDateString("en-IN", {
		month: "long",
		year: "numeric",
	});
};

const monthInputValue = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const shiftMonth = (month: string, delta: number) => {
	const [year, m] = month.split("-").map(Number);
	const next = new Date(year, m - 1 + delta, 1);
	return monthInputValue(next);
};

const fmtDateTime = (value: string) =>
	new Date(value).toLocaleString("en-IN", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

const fmtShortDate = (value: string) =>
	new Date(value).toLocaleString("en-IN", {
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "2-digit",
	});

const emptyMonth = {
	leadsTouched: 0,
	calls: 0,
	followUps: 0,
	meetings: 0,
	notes: 0,
	leadsCreated: 0,
	filesCreated: 0,
	sanctioned: 0,
	lost: 0,
	statusChanges: 0,
};

const KpiCard = ({
	label,
	value,
	sub,
	color,
	icon,
}: {
	label: string;
	value: number | string;
	sub?: string;
	color: string;
	icon: ReactNode;
}) => (
	<div className="card p-3.5 sm:p-4 flex flex-col gap-2">
		<div className="flex items-center justify-between gap-2">
			<span className="text-[0.62rem] sm:text-[0.68rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary)">
				{label}
			</span>
			<span
				className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
				style={{ background: `${color}18`, color }}
			>
				{icon}
			</span>
		</div>
		<div className="text-xl sm:text-2xl font-bold text-(--color-text) tabular-nums leading-none">
			{value}
		</div>
		{sub && (
			<div className="text-[0.64rem] sm:text-[0.7rem] text-(--color-text-tertiary)">
				{sub}
			</div>
		)}
	</div>
);

const ConversionsOverview = () => {
	useCrmSocket();
	const navigate = useNavigate();
	const { user: currentUser } = useAuthStore();
	const role = currentUser?.role || "member";
	const canSelectUser = role === "admin" || role === "manager";

	const [month, setMonth] = useState(() => monthInputValue(new Date()));
	const [selectedUserId, setSelectedUserId] = useState("");
	const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
	const [historyLimit, setHistoryLimit] = useState(100);

	const { data, isLoading, isFetching, isError, refetch } =
		useQuery<OverviewData>({
			queryKey: [
				"conversion-overview",
				month,
				selectedUserId,
				historyLimit,
				historyFilter,
			],
			queryFn: async () => {
				const res = await api.get("/case-files/overview", {
					params: {
						month,
						...(selectedUserId ? { userId: selectedUserId } : {}),
						historyLimit,
						...(historyFilter !== "all"
							? { historyFilter }
							: {}),
					},
				});
				return res.data as OverviewData;
			},
			refetchInterval: 20000,
		});

	const changeMonth = (next: string) => {
		setMonth(next);
		setHistoryLimit(100);
	};

	const selectUser = (userId: string) => {
		setSelectedUserId((prev) => (prev === userId ? "" : userId));
		setHistoryLimit(100);
	};

	const viewLabel =
		role === "admin"
			? "Management view"
			: role === "manager"
				? "Team report"
				: "My report";

	if (isLoading && !data) {
		return (
			<div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
				<div className="card p-10 flex flex-col items-center gap-3 text-(--color-text-tertiary)">
					<Loader2
						size={26}
						className="animate-spin text-(--color-primary)"
					/>
					<span className="text-sm">Loading conversion overview...</span>
				</div>
			</div>
		);
	}

	if (isError || !data) {
		return (
			<div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
				<div className="card p-8 flex flex-col items-center gap-3 text-center">
					<XCircle size={28} className="text-(--color-danger)" />
					<p className="m-0 text-sm font-semibold text-(--color-text)">
						Couldn't load the conversion overview
					</p>
					<p className="m-0 text-xs text-(--color-text-tertiary)">
						Please try again in a moment.
					</p>
					<button
						className="btn btn-primary btn-sm"
						onClick={() => refetch()}
					>
						<RefreshCw size={14} /> Retry
					</button>
				</div>
			</div>
		);
	}

	const selectedMember = data.members.find(
		(member) => member._id === selectedUserId,
	);
	const scopeName = selectedMember?.name || "Whole team";
	const monthly = data.monthly || emptyMonth;

	const teamTotals = data.team.reduce(
		(acc, member) => ({
			leadsTouched: acc.leadsTouched + member.leadsTouched,
			calls: acc.calls + member.calls,
			followUps: acc.followUps + member.followUps,
			meetings: acc.meetings + member.meetings,
			notes: acc.notes + member.notes,
			filesCreated: acc.filesCreated + member.filesCreated,
			sanctioned: acc.sanctioned + member.sanctioned,
			lost: acc.lost + member.lost,
		}),
		{
			leadsTouched: 0,
			calls: 0,
			followUps: 0,
			meetings: 0,
			notes: 0,
			filesCreated: 0,
			sanctioned: 0,
			lost: 0,
		},
	);

	const filteredHistory = data.history;

	const monthlyStats = [
		{
			label: "Calls",
			value: monthly.calls,
			color: "#6366f1",
			Icon: PhoneCall,
		},
		{
			label: "Follow-ups",
			value: monthly.followUps,
			color: "#0ea5e9",
			Icon: CalendarClock,
		},
		{
			label: "Meetings",
			value: monthly.meetings,
			color: "#10b981",
			Icon: CalendarDays,
		},
		{
			label: "Notes",
			value: monthly.notes,
			color: "#f59e0b",
			Icon: MessageSquare,
		},
		{
			label: "Leads touched",
			value: monthly.leadsTouched,
			color: "#8b5cf6",
			Icon: Users,
		},
		{
			label: "Files opened",
			value: monthly.filesCreated,
			color: "#0284c7",
			Icon: FolderOpen,
		},
		{
			label: "Sanctioned",
			value: monthly.sanctioned,
			color: "#22c55e",
			Icon: BadgeCheck,
		},
		{
			label: "Lost",
			value: monthly.lost,
			color: "#ef4444",
			Icon: XCircle,
		},
	];

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
			{/* ── Header ── */}
			<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-xl sm:text-2xl font-bold tracking-tight text-(--color-text) m-0">
							Conversion Overview
						</h1>
						<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-primary-light) text-(--color-primary)">
							{viewLabel}
						</span>
					</div>
					<p className="text-sm text-(--color-text-secondary) mt-0.5 m-0">
						CRM-wide overview, team performance and month-end
						history.
					</p>
				</div>
				<button
					onClick={() => refetch()}
					disabled={isFetching}
					className="btn btn-secondary px-3 py-2 self-start"
					title="Refresh overview"
				>
					<RefreshCw
						size={14}
						className={isFetching ? "animate-spin" : ""}
					/>
					Refresh
				</button>
			</div>

			{/* ── Filters ── */}
			<div className="card p-3 sm:p-4 mb-5 flex flex-col lg:flex-row lg:items-end gap-3">
				<div>
					<label className="block text-[0.62rem] sm:text-[0.68rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary) mb-1">
						Month
					</label>
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							className="btn btn-ghost btn-sm p-1.5 rounded-md"
							onClick={() => changeMonth(shiftMonth(month, -1))}
							aria-label="Previous month"
						>
							<ChevronLeft size={16} />
						</button>
						<input
							type="month"
							className="input px-2.5 py-1.5 text-xs sm:text-sm rounded-lg"
							value={month}
							onChange={(e) =>
								e.target.value && changeMonth(e.target.value)
							}
						/>
						<button
							type="button"
							className="btn btn-ghost btn-sm p-1.5 rounded-md"
							onClick={() => changeMonth(shiftMonth(month, 1))}
							aria-label="Next month"
						>
							<ChevronRight size={16} />
						</button>
					</div>
				</div>

				{canSelectUser ? (
					<div className="min-w-0 sm:min-w-55">
						<label className="block text-[0.62rem] sm:text-[0.68rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary) mb-1">
							Team member
						</label>
						<select
							className="select w-full px-2.5 py-1.5 text-xs sm:text-sm rounded-lg"
							value={selectedUserId}
							onChange={(e) => {
								setSelectedUserId(e.target.value);
								setHistoryLimit(100);
							}}
						>
							<option value="">All team members</option>
							{data.members.map((member) => (
								<option
									key={member._id}
									value={member._id}
								>
									{member.name}
									{member.role ? ` · ${member.role}` : ""}
								</option>
							))}
						</select>
					</div>
				) : (
					<div className="min-w-0">
						<label className="block text-[0.62rem] sm:text-[0.68rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary) mb-1">
							Report
						</label>
						<div className="text-xs sm:text-sm font-semibold text-(--color-text) py-1.5">
							My activity — {currentUser?.name}
						</div>
					</div>
				)}

				<div className="lg:ml-auto text-[0.68rem] sm:text-xs text-(--color-text-tertiary) flex items-center gap-1.5">
					<Clock size={12} />
					Showing{" "}
					<strong className="text-(--color-text-secondary) font-semibold">
						{scopeName}
					</strong>{" "}
					· {monthLabel(month)}
				</div>
			</div>

			{/* ── CRM overview ── */}
			<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
				<KpiCard
					label="Total Leads"
					value={data.overall.leads}
					sub={`${data.overall.calls} calls logged`}
					color="#6366f1"
					icon={<Users size={15} />}
				/>
				<KpiCard
					label="Total Files"
					value={data.overall.files.total}
					sub={`${data.overall.conversionRate}% success rate`}
					color="#0ea5e9"
					icon={<FolderOpen size={15} />}
				/>
				<KpiCard
					label="In Process"
					value={data.overall.files.in_process}
					sub="Documents pending"
					color="#f59e0b"
					icon={<Clock size={15} />}
				/>
				<KpiCard
					label="Sanctioned"
					value={data.overall.files.closed}
					sub="Files closed won"
					color="#22c55e"
					icon={<BadgeCheck size={15} />}
				/>
				<KpiCard
					label="Lost"
					value={data.overall.files.lost}
					sub="Files closed lost"
					color="#ef4444"
					icon={<XCircle size={15} />}
				/>
				<KpiCard
					label="Meetings"
					value={data.overall.meetings}
					sub={`${data.overall.followUps} follow-ups`}
					color="#8b5cf6"
					icon={<CalendarDays size={15} />}
				/>
			</div>

			{/* ── Month at a glance ── */}
			<div className="card p-4 sm:p-5 mb-5">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
					<div>
						<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0">
							{selectedUserId
								? `${selectedMember?.name || "Team member"}'s month`
								: "Team activity this month"}
						</h2>
						<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
							{monthLabel(month)} · calls, follow-ups, meetings
							and file progress
						</p>
					</div>
					<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary) self-start">
						{scopeName}
					</span>
				</div>
				<div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
					{monthlyStats.map(({ label, value, color, Icon }) => (
						<div
							key={label}
							className="rounded-lg bg-(--color-surface-hover) p-2.5 flex flex-col gap-1.5"
						>
							<div className="flex items-center gap-1.5">
								<Icon size={12} style={{ color }} />
								<span className="text-[0.62rem] sm:text-[0.68rem] font-medium text-(--color-text-secondary) truncate">
									{label}
								</span>
							</div>
							<span className="text-lg sm:text-xl font-bold text-(--color-text) tabular-nums leading-none">
								{value}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* ── Team performance ── */}
			{canSelectUser && (
				<div className="card mb-5 overflow-hidden">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border-b border-(--color-border)">
						<div>
							<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0">
								Team performance
							</h2>
							<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
								{monthLabel(month)} · click a member to open
								their report
							</p>
						</div>
						<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary) self-start">
							{data.team.length} member
							{data.team.length === 1 ? "" : "s"}
						</span>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[860px] text-xs border-collapse">
							<thead>
								<tr className="border-b border-(--color-border) bg-(--color-surface-hover)">
									<th className="text-left py-2.5 px-4 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										Member
									</th>
									{[
										"Leads",
										"Calls",
										"Follow-ups",
										"Meetings",
										"Notes",
										"Files",
										"Sanctioned",
										"Lost",
									].map((label) => (
										<th
											key={label}
											className="text-right py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)"
										>
											{label}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{data.team.map((member) => {
									const active =
										member.userId === selectedUserId;
									return (
										<tr
											key={member.userId}
											onClick={() =>
												selectUser(member.userId)
											}
											className={`border-b border-(--color-border) cursor-pointer transition-colors ${
												active
													? "bg-(--color-primary-light)"
													: "hover:bg-(--color-surface-hover)"
											}`}
											title="Open this member's report"
										>
											<td className="py-2.5 px-4">
												<div className="flex items-center gap-2 min-w-0">
													<Avatar
														name={member.user?.name}
														src={member.user?.avatar}
														size={26}
													/>
													<div className="min-w-0">
														<div className="font-semibold text-(--color-text) truncate">
															{member.user?.name ||
																"Unknown"}
														</div>
														<div className="text-[0.6rem] text-(--color-text-tertiary) capitalize">
															{member.user?.role ||
																"member"}
														</div>
													</div>
												</div>
											</td>
											<td className="text-right px-3 tabular-nums text-(--color-text-secondary)">
												{member.leadsTouched}
											</td>
											<td className="text-right px-3 tabular-nums text-(--color-text-secondary)">
												{member.calls}
											</td>
											<td className="text-right px-3 tabular-nums text-(--color-text-secondary)">
												{member.followUps}
											</td>
											<td className="text-right px-3 tabular-nums text-(--color-text-secondary)">
												{member.meetings}
											</td>
											<td className="text-right px-3 tabular-nums text-(--color-text-secondary)">
												{member.notes}
											</td>
											<td className="text-right px-3 tabular-nums text-(--color-text-secondary)">
												{member.filesCreated}
											</td>
											<td className="text-right px-3 tabular-nums font-semibold text-(--color-success)">
												{member.sanctioned}
											</td>
											<td className="text-right px-3 tabular-nums font-semibold text-(--color-danger)">
												{member.lost}
											</td>
										</tr>
									);
								})}
							</tbody>
							<tfoot>
								<tr className="bg-(--color-surface-hover)">
									<td className="py-2.5 px-4 font-bold text-(--color-text)">
										Team total
									</td>
									<td className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-text)">
										{teamTotals.leadsTouched}
									</td>
									<td className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-text)">
										{teamTotals.calls}
									</td>
									<td className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-text)">
										{teamTotals.followUps}
									</td>
									<td className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-text)">
										{teamTotals.meetings}
									</td>
									<td className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-text)">
										{teamTotals.notes}
									</td>
									<td className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-text)">
										{teamTotals.filesCreated}
									</td>
									<td className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-success)">
										{teamTotals.sanctioned}
									</td>
									<td className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-danger)">
										{teamTotals.lost}
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
				</div>
			)}

			{/* ── Leads processed ── */}
			<div className="card mb-5 overflow-hidden">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border-b border-(--color-border)">
					<div>
						<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0">
							Leads processed
						</h2>
						<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
							Latest activity by {scopeName.toLowerCase()} in{" "}
							{monthLabel(month)}
						</p>
					</div>
					<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary) self-start">
						{data.processedLeads.length} lead
						{data.processedLeads.length === 1 ? "" : "s"}
					</span>
				</div>
				{data.processedLeads.length === 0 ? (
					<div className="p-8 text-center text-xs sm:text-sm text-(--color-text-tertiary)">
						No lead activity in {monthLabel(month)} for {scopeName}.
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[980px] text-xs border-collapse">
							<thead>
								<tr className="border-b border-(--color-border)">
									<th className="text-left py-2.5 px-4 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										Lead
									</th>
									<th className="text-left py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										Product
									</th>
									<th className="text-left py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										Lead status
									</th>
									<th className="text-left py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										File
									</th>
									<th className="text-left py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										Processed by
									</th>
									<th className="text-left py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										Last action
									</th>
									<th className="text-left py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										When
									</th>
									<th className="text-right py-2.5 px-4 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
										File
									</th>
								</tr>
							</thead>
							<tbody>
								{data.processedLeads.map((lead) => {
									const leadStatus = lead.status
										? LEAD_STATUS_META[lead.status]
										: null;
									const fileStatus = lead.caseFileStatus
										? FILE_STATUS_META[lead.caseFileStatus]
										: null;
									return (
										<tr
											key={lead.leadId}
											className="border-b border-(--color-border) hover:bg-(--color-surface-hover)"
										>
											<td className="py-2.5 px-4">
												<div className="font-semibold text-(--color-text) truncate max-w-55">
													{lead.name}
												</div>
												<div className="text-[0.62rem] text-(--color-text-tertiary) truncate max-w-55">
													{lead.company || lead.phone || "—"}
												</div>
											</td>
											<td className="px-3 text-(--color-text-secondary) truncate max-w-40">
												{lead.product || "—"}
											</td>
											<td className="px-3">
												{leadStatus ? (
													<span
														className="inline-flex text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap"
														style={{
															background: `${leadStatus.color}16`,
															color: leadStatus.color,
														}}
													>
														{leadStatus.label}
													</span>
												) : (
													"—"
												)}
											</td>
											<td className="px-3">
												{fileStatus ? (
													<span
														className="inline-flex text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap"
														style={{
															background: `${fileStatus.color}16`,
															color: fileStatus.color,
														}}
													>
														{fileStatus.label}
													</span>
												) : (
													<span className="text-[0.62rem] text-(--color-text-tertiary)">
														No file
													</span>
												)}
											</td>
											<td className="px-3">
												<div className="flex items-center gap-1.5 min-w-0">
													<Avatar
														name={lead.user?.name}
														src={lead.user?.avatar}
														size={22}
													/>
													<span className="truncate max-w-35 text-(--color-text-secondary)">
														{lead.user?.name || "—"}
													</span>
												</div>
											</td>
											<td
												className="px-3 text-(--color-text-secondary) truncate max-w-50"
												title={lead.action}
											>
												{lead.action}
											</td>
											<td className="px-3 text-(--color-text-tertiary) whitespace-nowrap">
												{fmtShortDate(lead.at)}
											</td>
											<td className="px-4 text-right">
												{lead.caseFileId ? (
													<button
														type="button"
														onClick={() =>
															navigate(
																`/crm/files?leadId=${lead.leadId}`,
															)
														}
														className="btn btn-secondary btn-sm px-2 py-1 text-[0.62rem] font-semibold inline-flex items-center gap-1"
													>
														<ArrowUpRight
															size={12}
														/>
														Open
													</button>
												) : (
													<span className="text-[0.62rem] text-(--color-text-tertiary)">
														—
													</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* ── Activity history ── */}
			<div className="card overflow-hidden">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border-b border-(--color-border)">
					<div>
						<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0">
							Activity history
						</h2>
						<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
							Every logged action for {scopeName.toLowerCase()} in{" "}
							{monthLabel(month)}
						</p>
					</div>
					<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary) self-start">
						{data.history.length} of {data.historyTotal} entries
					</span>
				</div>

				<div className="flex flex-wrap gap-1.5 px-4 pt-3">
					{HISTORY_FILTERS.map((filter) => (
						<button
							key={filter.key}
							type="button"
							onClick={() => {
							setHistoryFilter(filter.key);
							setHistoryLimit(100);
						}}
							className={`px-2.5 py-1 rounded-md text-[0.62rem] sm:text-[0.68rem] font-semibold border cursor-pointer transition-colors ${
								historyFilter === filter.key
									? "bg-(--color-primary) text-white border-(--color-primary)"
									: "bg-(--color-surface) text-(--color-text-tertiary) border-(--color-border) hover:text-(--color-text-secondary)"
							}`}
						>
							{filter.label}
						</button>
					))}
				</div>

				<div className="p-2 sm:p-3">
					{filteredHistory.length === 0 ? (
						<div className="p-8 text-center text-xs sm:text-sm text-(--color-text-tertiary)">
							No{" "}
							{historyFilter === "all"
								? ""
								: HISTORY_FILTERS.find(
										(f) => f.key === historyFilter,
									)?.label.toLowerCase()}{" "}
							activity in {monthLabel(month)}.
						</div>
					) : (
						<div className="flex flex-col">
							{filteredHistory.map((entry) => {
								const isCall = /^Call #/.test(entry.action);
								const isSchedule = /^(Follow-up|Meeting)/.test(
									entry.action,
								);
								const isFile =
									entry.entityType === "conversion";
								const accent = isCall
									? "#6366f1"
									: isSchedule
										? "#10b981"
										: isFile
											? "#0ea5e9"
											: "#f59e0b";
								return (
									<div
										key={entry._id}
										className="flex items-start gap-2.5 px-2 py-2.5 border-b border-(--color-border) last:border-b-0 hover:bg-(--color-surface-hover) rounded-md"
									>
										<Avatar
											name={entry.user?.name}
											src={entry.user?.avatar}
											size={26}
										/>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
												<span
													className="text-[0.72rem] sm:text-xs font-semibold text-(--color-text)"
													title={entry.action}
												>
													{entry.action}
												</span>
												{(entry.leadName ||
													entry.company) && (
													<span
														className="text-[0.62rem] sm:text-[0.68rem] px-1.5 py-0.5 rounded bg-(--color-surface-hover) text-(--color-text-secondary) truncate max-w-55"
														style={{
															borderLeft: `2px solid ${accent}`,
														}}
													>
														{entry.leadName}
														{entry.company
															? ` · ${entry.company}`
															: ""}
													</span>
												)}
											</div>
											<div className="flex flex-wrap items-center gap-x-2 text-[0.6rem] sm:text-[0.66rem] text-(--color-text-tertiary) mt-0.5">
												<span className="font-medium">
													{entry.user?.name ||
														"Unknown user"}
												</span>
												<span>·</span>
												<span>
													{fmtDateTime(entry.createdAt)}
												</span>
											</div>
										</div>
										{entry.caseFileId && entry.leadId && (
											<button
												type="button"
												onClick={() =>
													navigate(
														`/crm/files?leadId=${entry.leadId}`,
													)
												}
												className="shrink-0 bg-(--color-primary-light) border-none cursor-pointer text-(--color-primary) w-7 h-7 rounded-md flex items-center justify-center hover:opacity-80"
												title="Open file"
											>
												<ArrowUpRight size={13} />
											</button>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>

				{data.history.length < data.historyTotal && (
					<div className="p-3 border-t border-(--color-border) flex justify-center">
						<button
							className="btn btn-secondary btn-sm"
							onClick={() =>
								setHistoryLimit((limit) =>
									Math.min(500, limit + 100),
								)
							}
						>
							Load more activity
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

export default ConversionsOverview;
