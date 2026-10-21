import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
	Activity,
	ArrowUpDown,
	ArrowUpRight,
	BadgeCheck,
	Building2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Clock,
	Database,
	Download,
	FolderOpen,
	Handshake,
	Info,
	Lightbulb,
	Loader2,
	MessageSquare,
	Minus,
	PhoneCall,
	RefreshCw,
	Search,
	Target,
	TrendingDown,
	TrendingUp,
	Trophy,
	UserCheck,
	Users,
	XCircle,
} from "lucide-react";
import {
	Bar,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import * as XLSX from "xlsx";
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
	filesOpen: number;
	filesClosed: number;
	filesLost: number;
	sanctioned: number;
	lost: number;
	statusChanges: number;
	activeDays: number;
	lastActiveAt: string | null;
	fileRate: number;
	winRate: number;
	lostRate: number;
	actions: number;
}

interface SummaryMetrics {
	leadsTouched: number;
	calls: number;
	followUps: number;
	meetings: number;
	notes: number;
	leadsCreated: number;
	filesCreated: number;
	filesOpen: number;
	filesClosed: number;
	filesLost: number;
	sanctioned: number;
	lost: number;
	statusChanges: number;
	actions: number;
	activeMembers: number;
	totalMembers: number;
	fileRate: number;
	winRate: number;
	lostRate: number;
}

interface FunnelMetrics {
	leadsTouched: number;
	filesCreated: number;
	sanctioned: number;
	lost: number;
	filesOpen: number;
	filesClosed: number;
	filesLost: number;
	touchedToFileRate: number;
	fileToSanctionRate: number;
	winRate: number;
	cohortWinRate: number;
}

interface DailyPoint {
	date: string;
	day: number;
	label: string;
	calls: number;
	followUps: number;
	meetings: number;
	notes: number;
	filesCreated: number;
	sanctioned: number;
	lost: number;
	leadsTouched: number;
}

interface ActivityMixItem {
	key: string;
	label: string;
	value: number;
}

interface SourceItem {
	id: string;
	name: string;
	count: number;
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
	summary: SummaryMetrics;
	previousSummary: SummaryMetrics;
	allTime: {
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
	funnel: FunnelMetrics;
	daily: DailyPoint[];
	activityMix: ActivityMixItem[];
	statusBreakdown: { status: string; count: number }[];
	sources: {
		databases: SourceItem[];
		partners: SourceItem[];
		sourceTypes: { key: string; count: number }[];
	};
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
	monthly: SummaryMetrics;
	team: PersonStats[];
	history: HistoryEntry[];
	historyTotal: number;
	processedLeads: ProcessedLead[];
	processedTotal: number;
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

const SOURCE_TYPE_META: Record<string, { label: string; color: string }> = {
	udyam: { label: "Udyam Capital", color: "#0ea5e9" },
	self: { label: "Self-sourced", color: "#10b981" },
	partner: { label: "Channel partner", color: "#8b5cf6" },
};

const STATUS_ORDER = [
	"new",
	"attempted",
	"connected",
	"interested",
	"callback_scheduled",
	"meeting_scheduled",
	"not_interested",
	"not_reachable",
	"do_not_call",
	"closed_won",
	"closed_lost",
];

const ACTIVITY_COLORS: Record<string, string> = {
	calls: "#6366f1",
	followUps: "#0ea5e9",
	meetings: "#10b981",
	notes: "#f59e0b",
	files: "#0284c7",
	statusChanges: "#8b5cf6",
	other: "#94a3b8",
};

const EMPTY_SUMMARY: SummaryMetrics = {
	leadsTouched: 0,
	calls: 0,
	followUps: 0,
	meetings: 0,
	notes: 0,
	leadsCreated: 0,
	filesCreated: 0,
	filesOpen: 0,
	filesClosed: 0,
	filesLost: 0,
	sanctioned: 0,
	lost: 0,
	statusChanges: 0,
	actions: 0,
	activeMembers: 0,
	totalMembers: 0,
	fileRate: 0,
	winRate: 0,
	lostRate: 0,
};

type SortKey =
	| "name"
	| "leadsTouched"
	| "calls"
	| "followUps"
	| "meetings"
	| "notes"
	| "filesCreated"
	| "sanctioned"
	| "lost"
	| "winRate";
type SortDir = "asc" | "desc";
type Tone = "good" | "bad" | "neutral";

const safePct = (value: number, total: number) =>
	total > 0 ? Math.round((value / total) * 100) : 0;

const compareMetric = (
	current: number,
	previous: number,
	invert = false,
	mode: "pct" | "pts" = "pct",
) => {
	if (previous === 0 && current === 0) return null;
	if (previous === 0) {
		return { label: "New", tone: "neutral" as Tone, Icon: Minus };
	}
	const diff =
		mode === "pts"
			? current - previous
			: Math.round(((current - previous) / previous) * 100);
	if (diff === 0) {
		return { label: "No change", tone: "neutral" as Tone, Icon: Minus };
	}
	const positive = diff > 0;
	const good = invert ? !positive : positive;
	return {
		label: `${positive ? "+" : ""}${diff}${mode === "pts" ? " pts" : "%"}`,
		tone: (good ? "good" : "bad") as Tone,
		Icon: positive ? TrendingUp : TrendingDown,
	};
};

const fmtLastActive = (value: string | null) => {
	if (!value) return "No activity";
	const date = new Date(value);
	const now = new Date();
	const sameDay = date.toDateString() === now.toDateString();
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const time = date.toLocaleTimeString("en-IN", {
		hour: "numeric",
		minute: "2-digit",
	});
	if (sameDay) return `Today, ${time}`;
	if (date.toDateString() === yesterday.toDateString()) {
		return `Yesterday, ${time}`;
	}
	return `${date.toLocaleDateString("en-IN", {
		day: "numeric",
		month: "short",
	})}, ${time}`;
};

const dateGroupLabel = (value: string) => {
	const date = new Date(value);
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (date.toDateString() === today.toDateString()) return "Today";
	if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
	return date.toLocaleDateString("en-IN", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
};

const toneStyle = (tone: Tone) => {
	if (tone === "good") {
		return {
			background: "rgba(34, 197, 94, 0.12)",
			color: "var(--color-success)",
		};
	}
	if (tone === "bad") {
		return {
			background: "rgba(239, 68, 68, 0.12)",
			color: "var(--color-danger)",
		};
	}
	return {
		background: "var(--color-surface-hover)",
		color: "var(--color-text-tertiary)",
	};
};

const KpiCard = ({
	label,
	value,
	sub,
	color,
	icon,
	current,
	previous,
	invert,
	mode = "pct",
	previousLabel,
}: {
	label: string;
	value: number | string;
	sub?: string;
	color: string;
	icon: ReactNode;
	current?: number;
	previous?: number;
	invert?: boolean;
	mode?: "pct" | "pts";
	previousLabel?: string;
}) => {
	const comparison =
		current !== undefined && previous !== undefined
			? compareMetric(current, previous, invert, mode)
			: null;
	return (
		<div className="card p-3 sm:p-3.5 flex flex-col gap-2 min-w-0">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[0.6rem] sm:text-[0.66rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary) truncate">
					{label}
				</span>
				<span
					className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
					style={{ background: `${color}18`, color }}
				>
					{icon}
				</span>
			</div>
			<div className="flex items-end justify-between gap-1.5">
				<div className="text-xl sm:text-2xl font-bold text-(--color-text) tabular-nums leading-none">
					{value}
				</div>
				{comparison && (
					<span
						className="inline-flex items-center gap-0.5 text-[0.56rem] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap"
						style={toneStyle(comparison.tone)}
						title={
							previousLabel
								? `Compared with ${previousLabel}`
								: "Compared with previous month"
						}
					>
						<comparison.Icon size={10} />
						{comparison.label}
					</span>
				)}
			</div>
			{sub && (
				<div className="text-[0.62rem] sm:text-[0.68rem] text-(--color-text-tertiary) leading-snug">
					{sub}
				</div>
			)}
		</div>
	);
};

const MiniBar = ({
	pct,
	color,
	height = 6,
}: {
	pct: number;
	color: string;
	height?: number;
}) => (
	<div
		className="w-full rounded-full overflow-hidden bg-(--color-surface-hover)"
		style={{ height }}
	>
		<div
			className="h-full rounded-full transition-all duration-500"
			style={{
				width: `${Math.min(Math.max(pct, 0), 100)}%`,
				background: color,
			}}
		/>
	</div>
);

const FunnelStage = ({
	label,
	value,
	percent,
	note,
	color,
	icon,
}: {
	label: string;
	value: number;
	percent: number;
	note: string;
	color: string;
	icon: ReactNode;
}) => (
	<div>
		<div className="flex items-center justify-between gap-2 mb-1.5">
			<span className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-(--color-text-secondary)">
				<span style={{ color }}>{icon}</span>
				{label}
			</span>
			<span className="text-sm font-bold text-(--color-text) tabular-nums">
				{value}
			</span>
		</div>
		<MiniBar pct={percent} color={color} height={7} />
		<div className="text-[0.62rem] text-(--color-text-tertiary) mt-1">
			{note}
		</div>
	</div>
);

const SourceList = ({
	title,
	icon,
	items,
	color,
}: {
	title: string;
	icon: ReactNode;
	items: SourceItem[];
	color: string;
}) => {
	const max = Math.max(1, ...items.map((item) => item.count));
	return (
		<div className="min-w-0">
			<div className="flex items-center gap-1.5 text-[0.68rem] font-bold text-(--color-text-secondary) mb-2">
				<span style={{ color }}>{icon}</span>
				{title}
			</div>
			{items.length === 0 ? (
				<div className="text-[0.65rem] text-(--color-text-tertiary) py-2">
					No files yet
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{items.slice(0, 5).map((item) => (
						<div key={item.id}>
							<div className="flex items-center justify-between gap-2 text-[0.66rem] mb-1">
								<span
									className="truncate text-(--color-text-secondary)"
									title={item.name}
								>
									{item.name}
								</span>
								<span className="font-bold text-(--color-text) tabular-nums">
									{item.count}
								</span>
							</div>
							<MiniBar
								pct={(item.count / max) * 100}
								color={color}
								height={4}
							/>
						</div>
					))}
					{items.length > 5 && (
						<div className="text-[0.6rem] text-(--color-text-tertiary)">
							+{items.length - 5} more
						</div>
					)}
				</div>
			)}
		</div>
	);
};

const HighlightCard = ({
	icon,
	label,
	value,
	sub,
	color,
}: {
	icon: ReactNode;
	label: string;
	value: string;
	sub: string;
	color: string;
}) => (
	<div className="rounded-lg border border-(--color-border) bg-(--color-surface-hover)/40 p-2.5 flex items-start gap-2 min-w-0">
		<span
			className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
			style={{ background: `${color}18`, color }}
		>
			{icon}
		</span>
		<div className="min-w-0">
			<div className="text-[0.58rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary)">
				{label}
			</div>
			<div className="text-[0.72rem] font-bold text-(--color-text) truncate">
				{value}
			</div>
			<div className="text-[0.6rem] text-(--color-text-tertiary) truncate">
				{sub}
			</div>
		</div>
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
	const [historySearch, setHistorySearch] = useState("");
	const [teamSearch, setTeamSearch] = useState("");
	const [teamRole, setTeamRole] = useState("all");
	const [sortKey, setSortKey] = useState<SortKey>("sanctioned");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [processedSearch, setProcessedSearch] = useState("");
	const [processedFileFilter, setProcessedFileFilter] = useState<
		"all" | "with_file" | "without_file"
	>("all");

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

	const team = data?.team ?? [];
	const members = data?.members ?? [];
	const historyEntries = data?.history ?? [];
	const processedEntries = data?.processedLeads ?? [];

	const teamRoles = useMemo(
		() =>
			[
				...new Set(
					team
						.map((member) => member.user?.role)
						.filter((role): role is string => Boolean(role)),
				),
			].sort(),
		[team],
	);

	const rankById = useMemo(() => {
		const ranked = [...team].sort(
			(a, b) =>
				b.sanctioned - a.sanctioned ||
				b.filesCreated - a.filesCreated ||
				b.calls - a.calls ||
				(a.user?.name || "").localeCompare(b.user?.name || ""),
		);
		return new Map(ranked.map((member, index) => [member.userId, index + 1]));
	}, [team]);

	const visibleTeam = useMemo(() => {
		const query = teamSearch.trim().toLowerCase();
		return [...team]
			.filter((member) => {
				if (teamRole !== "all" && member.user?.role !== teamRole) {
					return false;
				}
				if (!query) return true;
				return [member.user?.name, member.user?.email, member.user?.role]
					.filter(Boolean)
					.some((value) => String(value).toLowerCase().includes(query));
			})
			.sort((a, b) => {
				if (sortKey === "name") {
					return (
						(a.user?.name || "").localeCompare(b.user?.name || "") *
						(sortDir === "asc" ? 1 : -1)
					);
				}
				return (
					(a[sortKey] - b[sortKey]) * (sortDir === "asc" ? 1 : -1)
				);
			});
	}, [team, teamSearch, teamRole, sortKey, sortDir]);

	const filteredHistory = useMemo(() => {
		const query = historySearch.trim().toLowerCase();
		if (!query) return historyEntries;
		return historyEntries.filter((entry) =>
			[entry.action, entry.leadName, entry.company, entry.user?.name]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(query)),
		);
	}, [historyEntries, historySearch]);

	const historyGroups = useMemo(() => {
		const groups: {
			key: string;
			label: string;
			entries: HistoryEntry[];
		}[] = [];
		for (const entry of filteredHistory) {
			const key = new Date(entry.createdAt).toDateString();
			const last = groups[groups.length - 1];
			if (last?.key === key) {
				last.entries.push(entry);
			} else {
				groups.push({
					key,
					label: dateGroupLabel(entry.createdAt),
					entries: [entry],
				});
			}
		}
		return groups;
	}, [filteredHistory]);

	const processedFiltered = useMemo(() => {
		const query = processedSearch.trim().toLowerCase();
		return processedEntries.filter((lead) => {
			if (
				processedFileFilter === "with_file" &&
				!lead.caseFileId
			) {
				return false;
			}
			if (
				processedFileFilter === "without_file" &&
				lead.caseFileId
			) {
				return false;
			}
			if (!query) return true;
			return [
				lead.name,
				lead.company,
				lead.phone,
				lead.product,
				lead.status,
				lead.user?.name,
			]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(query));
		});
	}, [processedEntries, processedSearch, processedFileFilter]);

	const changeMonth = (next: string) => {
		setMonth(next);
		setHistoryLimit(100);
	};

	const selectUser = (userId: string) => {
		setSelectedUserId((prev) => (prev === userId ? "" : userId));
		setHistoryLimit(100);
	};

	const toggleSort = (key: SortKey) => {
		if (key === sortKey) {
			setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir(key === "name" ? "asc" : "desc");
		}
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

	const effectiveUserId = data.scope.userId || selectedUserId;
	const selectedMember = members.find(
		(member) => member._id === effectiveUserId,
	);
	const scopeName =
		selectedMember?.name ||
		(role === "member" ? currentUser?.name || "My report" : "Whole team");
	const summary = data.summary || EMPTY_SUMMARY;
	const previous = data.previousSummary || EMPTY_SUMMARY;
	const funnel = data.funnel || {
		leadsTouched: summary.leadsTouched,
		filesCreated: summary.filesCreated,
		sanctioned: summary.sanctioned,
		lost: summary.lost,
		filesOpen: summary.filesOpen,
		filesClosed: summary.filesClosed,
		filesLost: summary.filesLost,
		touchedToFileRate: summary.fileRate,
		fileToSanctionRate: safePct(
			summary.sanctioned,
			summary.filesCreated,
		),
		winRate: summary.winRate,
		cohortWinRate: safePct(
			summary.filesClosed,
			summary.filesClosed + summary.filesLost,
		),
	};
	const daily = data.daily || [];
	const activityMix = data.activityMix || [];
	const statusBreakdown = data.statusBreakdown || [];
	const sources = data.sources || {
		databases: [],
		partners: [],
		sourceTypes: [],
	};
	const allTime = data.allTime || {
		leads: data.overall?.leads || 0,
		calls: data.overall?.calls || 0,
		followUps: data.overall?.followUps || 0,
		meetings: data.overall?.meetings || 0,
		files: data.overall?.files || {
			total: 0,
			in_process: 0,
			closed: 0,
			lost: 0,
		},
		conversionRate: data.overall?.conversionRate || 0,
	};
	const previousLabel = monthLabel(shiftMonth(month, -1));
	const currentMonth = monthInputValue(new Date());
	const isCurrentMonth = month === currentMonth;
	const periodLabel = isCurrentMonth ? "Month to date" : monthLabel(month);

	const teamTotals = visibleTeam.reduce(
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

	const rankedTeam = [...team].sort(
		(a, b) =>
			b.sanctioned - a.sanctioned ||
			b.filesCreated - a.filesCreated ||
			b.calls - a.calls,
	);
	const topConverter = rankedTeam[0];
	const topCaller = [...team].sort(
		(a, b) => b.calls - a.calls || b.leadsTouched - a.leadsTouched,
	)[0];
	const fieldTeam = team.filter(
		(member) => (member.user?.role || "member") === "member",
	);
	const attentionPool = fieldTeam.length > 0 ? fieldTeam : team;
	const silentMembers = attentionPool.filter(
		(member) => member.actions === 0 && member.filesCreated === 0,
	);

	const statusItems = [...statusBreakdown]
		.map((item) => ({
			...item,
			meta: LEAD_STATUS_META[item.status] || {
				label: item.status,
				color: "#94a3b8",
			},
		}))
		.sort(
			(a, b) =>
				(STATUS_ORDER.indexOf(a.status) === -1
					? 99
					: STATUS_ORDER.indexOf(a.status)) -
				(STATUS_ORDER.indexOf(b.status) === -1
					? 99
					: STATUS_ORDER.indexOf(b.status)),
		);
	const statusTotal = statusItems.reduce(
		(total, item) => total + item.count,
		0,
	);

	const sourceTypeItems = sources.sourceTypes.map((item) => ({
		id: item.key,
		name: SOURCE_TYPE_META[item.key]?.label || item.key,
		count: item.count,
	}));

	const activityMixTotal = activityMix.reduce(
		(total, item) => total + item.value,
		0,
	);
	const hasDailyActivity = daily.some(
		(day) =>
			day.calls > 0 ||
			day.filesCreated > 0 ||
			day.sanctioned > 0 ||
			day.leadsTouched > 0,
	);

	const exportReport = () => {
		const change = (
			current: number,
			priorValue: number,
			mode: "pct" | "pts" = "pct",
		) => {
			if (priorValue === 0) return current === 0 ? "0%" : "New";
			const diff =
				mode === "pts"
					? current - priorValue
					: Math.round(((current - priorValue) / priorValue) * 100);
			return `${diff > 0 ? "+" : ""}${diff}${mode === "pts" ? " pts" : "%"}`;
		};
		const workbook = XLSX.utils.book_new();
		const summaryRows: (string | number)[][] = [
			["Conversion Overview"],
			["Month", monthLabel(month)],
			["Scope", scopeName],
			["Compared with", previousLabel],
			["Generated", new Date().toLocaleString("en-IN")],
			[],
			["Metric", "This month", "Previous month", "Change"],
			[
				"Leads touched",
				summary.leadsTouched,
				previous.leadsTouched,
				change(summary.leadsTouched, previous.leadsTouched),
			],
			[
				"Calls",
				summary.calls,
				previous.calls,
				change(summary.calls, previous.calls),
			],
			[
				"Follow-ups",
				summary.followUps,
				previous.followUps,
				change(summary.followUps, previous.followUps),
			],
			[
				"Meetings",
				summary.meetings,
				previous.meetings,
				change(summary.meetings, previous.meetings),
			],
			[
				"Notes",
				summary.notes,
				previous.notes,
				change(summary.notes, previous.notes),
			],
			[
				"Files opened",
				summary.filesCreated,
				previous.filesCreated,
				change(summary.filesCreated, previous.filesCreated),
			],
			[
				"Sanctioned",
				summary.sanctioned,
				previous.sanctioned,
				change(summary.sanctioned, previous.sanctioned),
			],
			[
				"Lost",
				summary.lost,
				previous.lost,
				change(summary.lost, previous.lost),
			],
			[
				"Win rate",
				`${summary.winRate}%`,
				`${previous.winRate}%`,
				change(summary.winRate, previous.winRate, "pts"),
			],
			["Active members", summary.activeMembers, previous.activeMembers, ""],
		];
		const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
		summarySheet["!cols"] = [
			{ wch: 24 },
			{ wch: 16 },
			{ wch: 16 },
			{ wch: 14 },
		];
		XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

		const teamRows = [
			[
				"Rank",
				"Member",
				"Email",
				"Role",
				"Leads touched",
				"Calls",
				"Follow-ups",
				"Meetings",
				"Notes",
				"Files opened",
				"Files open",
				"Files sanctioned (cohort)",
				"Files lost (cohort)",
				"Sanctioned actions",
				"Lost actions",
				"Win rate %",
				"Active days",
				"Last active",
			],
			...[...team]
				.sort(
					(a, b) =>
						(rankById.get(a.userId) || 0) -
						(rankById.get(b.userId) || 0),
				)
				.map((member) => [
					rankById.get(member.userId) || "",
					member.user?.name || "Unknown",
					member.user?.email || "",
					member.user?.role || "",
					member.leadsTouched,
					member.calls,
					member.followUps,
					member.meetings,
					member.notes,
					member.filesCreated,
					member.filesOpen,
					member.filesClosed,
					member.filesLost,
					member.sanctioned,
					member.lost,
					member.winRate,
					member.activeDays,
					member.lastActiveAt
						? fmtLastActive(member.lastActiveAt)
						: "No activity",
				]),
		];
		const teamSheet = XLSX.utils.aoa_to_sheet(teamRows);
		teamSheet["!cols"] = teamRows[0].map(() => ({ wch: 15 }));
		XLSX.utils.book_append_sheet(workbook, teamSheet, "Team performance");

		const sourceRows: (string | number)[][] = [
			["Source", "Name", "Files opened"],
			...sources.databases.map((item) => [
				"Database",
				item.name,
				item.count,
			]),
			...sources.partners.map((item) => [
				"Channel partner",
				item.name,
				item.count,
			]),
			...sourceTypeItems.map((item) => [
				"Lead source",
				item.name,
				item.count,
			]),
		];
		const sourceSheet = XLSX.utils.aoa_to_sheet(sourceRows);
		sourceSheet["!cols"] = [{ wch: 18 }, { wch: 34 }, { wch: 14 }];
		XLSX.utils.book_append_sheet(workbook, sourceSheet, "Conversion sources");

		const processedRows = [
			[
				"Lead",
				"Company",
				"Phone",
				"Product",
				"Lead status",
				"File status",
				"Processed by",
				"Last action",
				"When",
			],
			...processedEntries.map((lead) => [
				lead.name,
				lead.company || "",
				lead.phone || "",
				lead.product || "",
				lead.status
					? LEAD_STATUS_META[lead.status]?.label || lead.status
					: "",
				lead.caseFileStatus
					? FILE_STATUS_META[lead.caseFileStatus]?.label ||
						lead.caseFileStatus
					: "No file",
				lead.user?.name || "",
				lead.action,
				fmtDateTime(lead.at),
			]),
		];
		const processedSheet = XLSX.utils.aoa_to_sheet(processedRows);
		processedSheet["!cols"] = [
			{ wch: 24 },
			{ wch: 24 },
			{ wch: 16 },
			{ wch: 22 },
			{ wch: 16 },
			{ wch: 14 },
			{ wch: 18 },
			{ wch: 38 },
			{ wch: 22 },
		];
		XLSX.utils.book_append_sheet(
			workbook,
			processedSheet,
			"Leads processed",
		);

		const historyRows = [
			["When", "Member", "Action", "Lead", "Company", "Phone"],
			...historyEntries.map((entry) => [
				fmtDateTime(entry.createdAt),
				entry.user?.name || "",
				entry.action,
				entry.leadName || "",
				entry.company || "",
				entry.phone || "",
			]),
		];
		const historySheet = XLSX.utils.aoa_to_sheet(historyRows);
		historySheet["!cols"] = [
			{ wch: 22 },
			{ wch: 18 },
			{ wch: 42 },
			{ wch: 24 },
			{ wch: 24 },
			{ wch: 16 },
		];
		XLSX.utils.book_append_sheet(
			workbook,
			historySheet,
			"Activity history",
		);

		const fileScope = selectedMember
			? `-${selectedMember.name.replace(/[^a-z0-9]+/gi, "-")}`
			: "";
		XLSX.writeFile(workbook, `conversion-overview-${month}${fileScope}.xlsx`);
	};

	const sortHeader = (
		key: SortKey,
		label: string,
		align: "left" | "right" = "right",
	) => (
		<th
			key={key}
			className={`${
				align === "left" ? "text-left" : "text-right"
			} py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary) whitespace-nowrap`}
		>
			<button
				type="button"
				onClick={() => toggleSort(key)}
				className={`inline-flex items-center gap-1 border-none bg-transparent cursor-pointer text-[0.6rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary) hover:text-(--color-text-secondary) ${
					align === "right" ? "justify-end w-full" : ""
				}`}
				title={`Sort by ${label}`}
			>
				{label}
				{sortKey === key ? (
					sortDir === "asc" ? (
						<ChevronUp size={11} />
					) : (
						<ChevronDown size={11} />
					)
				) : (
					<ArrowUpDown size={10} className="opacity-40" />
				)}
			</button>
		</th>
	);

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
			{/* ── Header ── */}
			<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-xl sm:text-2xl font-bold tracking-tight text-(--color-text) m-0">
							Conversion Overview
						</h1>
						<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-primary-light) text-(--color-primary)">
							{viewLabel}
						</span>
						<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary)">
							{periodLabel}
						</span>
					</div>
					<p className="text-sm text-(--color-text-secondary) mt-0.5 m-0">
						Month-scoped conversion performance, team output and
						lead-source reporting.
					</p>
				</div>
				<div className="flex items-center gap-2 self-start">
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className="btn btn-secondary px-3 py-2"
						title="Refresh live CRM data"
					>
						<RefreshCw
							size={14}
							className={isFetching ? "animate-spin" : ""}
						/>
						Refresh
					</button>
					<button
						onClick={exportReport}
						className="btn btn-primary px-3 py-2"
						title="Download this report as an Excel workbook"
					>
						<Download size={14} />
						Export Excel
					</button>
				</div>
			</div>

			{/* ── Filters ── */}
			<div className="card p-3 sm:p-4 mb-4 flex flex-col xl:flex-row xl:items-end gap-3">
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
						{!isCurrentMonth && (
							<button
								type="button"
								className="btn btn-ghost btn-sm px-2 py-1 text-[0.62rem]"
								onClick={() => changeMonth(currentMonth)}
							>
								This month
							</button>
						)}
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
							{members.map((member) => (
								<option key={member._id} value={member._id}>
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

				<div className="xl:ml-auto flex flex-wrap items-center gap-2 text-[0.65rem] sm:text-xs text-(--color-text-tertiary)">
					<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-(--color-surface-hover)">
						<Clock size={12} />
						Showing{" "}
						<strong className="text-(--color-text-secondary) font-semibold">
							{scopeName}
						</strong>
						· {monthLabel(month)}
					</span>
					<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-(--color-surface-hover)">
						<Info size={12} />
						Live CRM data
					</span>
				</div>
			</div>

			{/* ── Month-scoped KPIs ── */}
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 mb-3">
				<KpiCard
					label="Leads touched"
					value={summary.leadsTouched}
					sub={`${summary.calls} calls · ${summary.followUps} follow-ups`}
					color="#6366f1"
					icon={<Users size={15} />}
					current={summary.leadsTouched}
					previous={previous.leadsTouched}
					previousLabel={previousLabel}
				/>
				<KpiCard
					label="Files opened"
					value={summary.filesCreated}
					sub={`${summary.fileRate}% of worked leads`}
					color="#0ea5e9"
					icon={<FolderOpen size={15} />}
					current={summary.filesCreated}
					previous={previous.filesCreated}
					previousLabel={previousLabel}
				/>
				<KpiCard
					label="Sanctioned"
					value={summary.sanctioned}
					sub={`${summary.winRate}% win rate`}
					color="#22c55e"
					icon={<BadgeCheck size={15} />}
					current={summary.sanctioned}
					previous={previous.sanctioned}
					previousLabel={previousLabel}
				/>
				<KpiCard
					label="Lost"
					value={summary.lost}
					sub={`${summary.lostRate}% loss rate`}
					color="#ef4444"
					icon={<XCircle size={15} />}
					invert
					current={summary.lost}
					previous={previous.lost}
					previousLabel={previousLabel}
				/>
				<KpiCard
					label="Calls"
					value={summary.calls}
					sub={`${summary.meetings} meetings logged`}
					color="#8b5cf6"
					icon={<PhoneCall size={15} />}
					current={summary.calls}
					previous={previous.calls}
					previousLabel={previousLabel}
				/>
				<KpiCard
					label="Notes"
					value={summary.notes}
					sub={`${summary.statusChanges} status changes`}
					color="#f59e0b"
					icon={<MessageSquare size={15} />}
					current={summary.notes}
					previous={previous.notes}
					previousLabel={previousLabel}
				/>
				<KpiCard
					label="Active team"
					value={`${summary.activeMembers}/${summary.totalMembers}`}
					sub="Members with logged work"
					color="#14b8a6"
					icon={<UserCheck size={15} />}
				/>
			</div>

			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6rem] sm:text-[0.66rem] text-(--color-text-tertiary) mb-4">
				<span className="font-bold uppercase tracking-wider text-(--color-text-secondary)">
					All-time context
				</span>
				<span>{allTime.leads} leads</span>
				<span>·</span>
				<span>{allTime.files.total} files</span>
				<span>·</span>
				<span>{allTime.conversionRate}% success rate</span>
				<span className="ml-auto inline-flex items-center gap-1">
					<Info size={11} />
					KPI cards above are month-scoped, not all-time totals.
				</span>
			</div>

			{/* ── Daily output + conversion funnel ── */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
				<div className="card lg:col-span-2 p-4 sm:p-5">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
						<div>
							<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0 flex items-center gap-2">
								<Activity
									size={16}
									className="text-(--color-primary)"
								/>
								Daily output
							</h2>
							<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
								Calls, files opened and sanctions across{" "}
								{monthLabel(month)}
							</p>
						</div>
						<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary) self-start">
							{activityMixTotal} logged actions
						</span>
					</div>

					{hasDailyActivity ? (
						<div className="h-60">
							<ResponsiveContainer width="100%" height="100%">
								<ComposedChart
									data={daily}
									margin={{
										top: 6,
										right: 4,
										left: -18,
										bottom: 0,
									}}
								>
									<CartesianGrid
										strokeDasharray="3 3"
										vertical={false}
										stroke="var(--color-border)"
									/>
									<XAxis
										dataKey="day"
										interval={4}
										tick={{
											fontSize: 11,
											fill: "var(--color-text-tertiary)",
										}}
										axisLine={false}
										tickLine={false}
									/>
									<YAxis
										allowDecimals={false}
										tick={{
											fontSize: 11,
											fill: "var(--color-text-tertiary)",
										}}
										axisLine={false}
										tickLine={false}
									/>
									<Tooltip
										contentStyle={{
											background:
												"var(--color-surface)",
											border: "1px solid var(--color-border)",
											borderRadius: 10,
											fontSize: "0.78rem",
											boxShadow: "var(--shadow-md)",
										}}
										cursor={{
											fill: "var(--color-surface-hover)",
										}}
										labelFormatter={(label) =>
											`Day ${label} · ${monthLabel(month)}`
										}
									/>
									<Legend
										iconType="circle"
										wrapperStyle={{
											fontSize: 11,
											paddingBottom: 6,
										}}
									/>
									<Bar
										dataKey="calls"
										name="Calls"
										fill="#6366f1"
										radius={[3, 3, 0, 0]}
										maxBarSize={10}
									/>
									<Bar
										dataKey="filesCreated"
										name="Files opened"
										fill="#0ea5e9"
										radius={[3, 3, 0, 0]}
										maxBarSize={10}
									/>
									<Line
										type="monotone"
										dataKey="sanctioned"
										name="Sanctioned"
										stroke="#22c55e"
										strokeWidth={2}
										dot={false}
									/>
								</ComposedChart>
							</ResponsiveContainer>
						</div>
					) : (
						<div className="h-60 flex flex-col items-center justify-center gap-1.5 text-center">
							<Activity
								size={28}
								className="text-(--color-text-tertiary)"
							/>
							<p className="m-0 text-sm font-semibold text-(--color-text-secondary)">
								No activity logged yet
							</p>
							<p className="m-0 text-xs text-(--color-text-tertiary)">
								Calls, files and sanctions will appear here as
								the team works the selected month.
							</p>
						</div>
					)}

					{activityMixTotal > 0 && (
						<div className="border-t border-(--color-border) pt-3 mt-3">
							<div className="flex items-center justify-between gap-2 mb-1.5">
								<span className="text-[0.62rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary)">
									Activity mix
								</span>
								<span className="text-[0.62rem] text-(--color-text-tertiary)">
									{activityMixTotal} actions
								</span>
							</div>
							<div className="flex h-2 rounded-full overflow-hidden bg-(--color-surface-hover)">
								{activityMix.map((item) => (
									<div
										key={item.key}
										style={{
											width: `${(item.value / activityMixTotal) * 100}%`,
											background:
												ACTIVITY_COLORS[item.key] ||
												"#94a3b8",
										}}
										title={`${item.label}: ${item.value}`}
									/>
								))}
							</div>
							<div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
								{activityMix.map((item) => (
									<span
										key={item.key}
										className="inline-flex items-center gap-1 text-[0.6rem] text-(--color-text-tertiary)"
									>
										<span
											className="w-1.5 h-1.5 rounded-full"
											style={{
												background:
													ACTIVITY_COLORS[item.key] ||
													"#94a3b8",
											}}
										/>
										{item.label}{" "}
										<strong className="text-(--color-text-secondary)">
											{item.value}
										</strong>
									</span>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="card p-4 sm:p-5">
					<div className="mb-4">
						<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0 flex items-center gap-2">
							<Target
								size={16}
								className="text-(--color-primary)"
							/>
							Conversion funnel
						</h2>
						<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
							How worked leads move into files and sanctions
						</p>
					</div>

					<div className="flex flex-col gap-4">
						<FunnelStage
							label="Leads touched"
							value={funnel.leadsTouched}
							percent={100}
							note={`${summary.calls} calls and ${summary.followUps} follow-ups logged`}
							color="#6366f1"
							icon={<Users size={14} />}
						/>
						<FunnelStage
							label="Files opened"
							value={funnel.filesCreated}
							percent={funnel.touchedToFileRate}
							note={`${funnel.touchedToFileRate}% of worked leads`}
							color="#0ea5e9"
							icon={<FolderOpen size={14} />}
						/>
						<FunnelStage
							label="Sanctioned"
							value={funnel.sanctioned}
							percent={Math.min(100, funnel.fileToSanctionRate)}
							note={`${funnel.fileToSanctionRate}% of files opened`}
							color="#22c55e"
							icon={<BadgeCheck size={14} />}
						/>
					</div>

					<div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-(--color-border)">
						{[
							{
								label: "In process",
								value: funnel.filesOpen,
								color: "#3b82f6",
							},
							{
								label: "Sanctioned",
								value: funnel.filesClosed,
								color: "#22c55e",
							},
							{
								label: "Lost",
								value: funnel.filesLost,
								color: "#ef4444",
							},
						].map((item) => (
							<div key={item.label} className="min-w-0">
								<div className="text-[0.58rem] uppercase tracking-wider font-semibold text-(--color-text-tertiary) truncate">
									{item.label}
								</div>
								<div
									className="text-lg font-bold tabular-nums"
									style={{ color: item.color }}
								>
									{item.value}
								</div>
							</div>
						))}
					</div>
					<p className="text-[0.6rem] text-(--color-text-tertiary) m-0 mt-2 leading-snug">
						Files opened this month, by current status. Cohort win
						rate:{" "}
						<strong className="text-(--color-text-secondary)">
							{funnel.cohortWinRate}%
						</strong>
						.
					</p>
				</div>
			</div>

			{/* ── Team performance ── */}
			{canSelectUser && (
				<>
					<div className="grid sm:grid-cols-3 gap-2.5 mb-3">
						<HighlightCard
							icon={<Trophy size={14} />}
							label="Top converter"
							value={
								topConverter && topConverter.sanctioned > 0
									? topConverter.user?.name || "Unknown"
									: "No conversions yet"
							}
							sub={
								topConverter && topConverter.sanctioned > 0
									? `${topConverter.sanctioned} sanctioned · ${topConverter.filesCreated} files`
									: "Sanctioned files will appear here"
							}
							color="#22c55e"
						/>
						<HighlightCard
							icon={<PhoneCall size={14} />}
							label="Busiest caller"
							value={
								topCaller && topCaller.calls > 0
									? topCaller.user?.name || "Unknown"
									: "No calls yet"
							}
							sub={
								topCaller && topCaller.calls > 0
									? `${topCaller.calls} calls · ${topCaller.leadsTouched} leads`
									: "Call activity will appear here"
							}
							color="#6366f1"
						/>
						<HighlightCard
							icon={<Lightbulb size={14} />}
							label="Needs attention"
							value={
								silentMembers.length > 0
									? `${silentMembers.length} silent`
									: "All active"
							}
							sub={
								silentMembers.length > 0
									? `${silentMembers
											.slice(0, 2)
											.map(
												(member) =>
													member.user?.name ||
													"Unknown",
											)
											.join(", ")}${
											silentMembers.length > 2
												? ` +${silentMembers.length - 2}`
												: ""
										}`
									: "Every member logged activity"
							}
							color="#f59e0b"
						/>
					</div>

					<div className="card mb-5 overflow-hidden">
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border-b border-(--color-border)">
							<div>
								<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0">
									Team performance
								</h2>
								<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
									{monthLabel(month)} · click a member to open
									their report. Columns are sortable.
								</p>
							</div>
							<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary) self-start">
								{visibleTeam.length} of {team.length} member
								{team.length === 1 ? "" : "s"}
							</span>
						</div>

						<div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 border-b border-(--color-border)">
							<div className="relative flex-1 min-w-0">
								<Search
									size={13}
									className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--color-text-tertiary)"
								/>
								<input
									value={teamSearch}
									onChange={(e) =>
										setTeamSearch(e.target.value)
									}
									placeholder="Search team member..."
									className="input w-full pl-8 pr-2.5 py-1.5 text-xs sm:text-sm rounded-lg"
								/>
							</div>
							<div className="flex items-center gap-2">
								<select
									value={teamRole}
									onChange={(e) =>
										setTeamRole(e.target.value)
									}
									className="select px-2.5 py-1.5 text-xs sm:text-sm rounded-lg"
									title="Filter by role"
								>
									<option value="all">All roles</option>
									{teamRoles.map((teamRoleOption) => (
										<option
											key={teamRoleOption}
											value={teamRoleOption}
										>
											{teamRoleOption
												.charAt(0)
												.toUpperCase() +
												teamRoleOption.slice(1)}
										</option>
									))}
								</select>
								{isFetching && (
									<Loader2
										size={14}
										className="animate-spin text-(--color-primary)"
									/>
								)}
							</div>
						</div>

						{visibleTeam.length === 0 ? (
							<div className="p-8 text-center text-xs sm:text-sm text-(--color-text-tertiary)">
								No team members match the current filters.
							</div>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full min-w-[1120px] text-xs border-collapse">
									<thead>
										<tr className="border-b border-(--color-border) bg-(--color-surface-hover)">
											<th className="text-left py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary)">
												#
											</th>
											{sortHeader("name", "Member", "left")}
											{sortHeader("leadsTouched", "Leads")}
											{sortHeader("calls", "Calls")}
											{sortHeader(
												"followUps",
												"Follow-ups",
											)}
											{sortHeader("meetings", "Meetings")}
											{sortHeader("notes", "Notes")}
											{sortHeader(
												"filesCreated",
												"Files",
											)}
											{sortHeader(
												"sanctioned",
												"Sanctioned",
											)}
											{sortHeader("lost", "Lost")}
											{sortHeader("winRate", "Win %")}
											<th className="text-right py-2.5 px-3 font-semibold text-[0.6rem] uppercase tracking-wider text-(--color-text-tertiary) whitespace-nowrap">
												Last active
											</th>
										</tr>
									</thead>
									<tbody>
										{visibleTeam.map((member) => {
											const active =
												member.userId ===
												effectiveUserId;
											const rank =
												rankById.get(member.userId) ||
												0;
											const decided =
												member.sanctioned +
												member.lost;
											return (
												<tr
													key={member.userId}
													onClick={() =>
														selectUser(
															member.userId,
														)
													}
													className={`border-b border-(--color-border) cursor-pointer transition-colors ${
														active
															? "bg-(--color-primary-light)"
															: "hover:bg-(--color-surface-hover)"
													}`}
													title="Open this member's report"
												>
													<td className="py-2.5 px-3">
														<span
															className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[0.6rem] font-bold ${
																rank <= 3
																	? "bg-(--color-primary-light) text-(--color-primary)"
																	: "text-(--color-text-tertiary)"
															}`}
														>
															{rank}
														</span>
													</td>
													<td className="py-2.5 px-3">
														<div className="flex items-center gap-2 min-w-0">
															<Avatar
																name={
																	member.user
																		?.name
																}
																src={
																	member.user
																		?.avatar
																}
																size={26}
															/>
															<div className="min-w-0">
																<div className="font-semibold text-(--color-text) truncate max-w-[13rem]">
																	{member.user
																		?.name ||
																		"Unknown"}
																</div>
																<div className="text-[0.6rem] text-(--color-text-tertiary) capitalize truncate">
																	{member.user
																		?.role ||
																		"member"}{" "}
																	·{" "}
																	{
																		member.activeDays
																	}{" "}
																	active day
																	{member.activeDays ===
																	1
																		? ""
																		: "s"}
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
													<td className="text-right px-3 tabular-nums">
														<div className="font-semibold text-(--color-text-secondary)">
															{member.filesCreated}
														</div>
														<div className="text-[0.56rem] text-(--color-text-tertiary)">
															{member.filesOpen} open
														</div>
													</td>
													<td className="text-right px-3 tabular-nums font-semibold text-(--color-success)">
														{member.sanctioned}
													</td>
													<td className="text-right px-3 tabular-nums font-semibold text-(--color-danger)">
														{member.lost}
													</td>
													<td className="text-right px-3 tabular-nums font-semibold">
														{decided === 0 ? (
															<span className="text-(--color-text-tertiary)">
																—
															</span>
														) : (
															<span
																style={{
																	color:
																		member.winRate >=
																		50
																			? "var(--color-success)"
																			: "var(--color-danger)",
																}}
															>
																{member.winRate}%
															</span>
														)}
													</td>
													<td className="text-right px-3 text-[0.62rem] text-(--color-text-tertiary) whitespace-nowrap">
														{fmtLastActive(
															member.lastActiveAt,
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
									<tfoot>
										<tr className="bg-(--color-surface-hover)">
											<td
												colSpan={2}
												className="py-2.5 px-3 font-bold text-(--color-text)"
											>
												Visible total
											</td>
											<td
												className="text-right px-3 py-2.5 tabular-nums font-semibold text-(--color-text)"
												title="Sum of member lead touches. A lead worked by more than one member is counted for each member."
											>
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
											<td className="text-right px-3 py-2.5 tabular-nums font-semibold">
												{safePct(
													teamTotals.sanctioned,
													teamTotals.sanctioned +
														teamTotals.lost,
												)}
												%
											</td>
											<td className="px-3" />
										</tr>
									</tfoot>
								</table>
							</div>
						)}
					</div>
				</>
			)}

			{/* ── Conversion sources + pipeline ── */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
				<div className="card lg:col-span-2 p-4 sm:p-5">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
						<div>
							<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0 flex items-center gap-2">
								<Target
									size={16}
									className="text-(--color-primary)"
								/>
								Where conversions come from
							</h2>
							<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
								Files opened in {monthLabel(month)} by database,
								channel partner and lead source
							</p>
						</div>
						<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary) self-start">
							{funnel.filesCreated} file
							{funnel.filesCreated === 1 ? "" : "s"}
						</span>
					</div>
					{funnel.filesCreated === 0 ? (
						<div className="py-8 text-center text-xs text-(--color-text-tertiary)">
							No files opened in this month for {scopeName}. Source
							breakdown will appear once files are created.
						</div>
					) : (
						<div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
							<SourceList
								title="By database"
								icon={<Database size={13} />}
								items={sources.databases}
								color="#6366f1"
							/>
							<SourceList
								title="By channel partner"
								icon={<Handshake size={13} />}
								items={sources.partners}
								color="#8b5cf6"
							/>
							<SourceList
								title="By lead source"
								icon={<Building2 size={13} />}
								items={sourceTypeItems}
								color="#0ea5e9"
							/>
						</div>
					)}
				</div>

				<div className="card p-4 sm:p-5">
					<div className="flex items-start justify-between gap-2 mb-3">
						<div>
							<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0 flex items-center gap-2">
								<Users
									size={16}
									className="text-(--color-primary)"
								/>
								Lead pipeline
							</h2>
							<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
								Current status of leads worked this month
							</p>
						</div>
						<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary)">
							{statusTotal} leads
						</span>
					</div>
					{statusItems.length === 0 ? (
						<div className="py-8 text-center text-xs text-(--color-text-tertiary)">
							No worked leads to show for this month.
						</div>
					) : (
						<div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
							{statusItems.map((item) => (
								<div key={item.status}>
									<div className="flex items-center justify-between gap-2 text-[0.68rem] mb-1">
										<span
											className="font-medium truncate"
											style={{ color: item.meta.color }}
										>
											{item.meta.label}
										</span>
										<span className="text-(--color-text-secondary) tabular-nums font-semibold">
											{item.count}
											<span className="text-(--color-text-tertiary) font-normal">
												{" "}
												·{" "}
												{safePct(
													item.count,
													statusTotal,
												)}
												%
											</span>
										</span>
									</div>
									<MiniBar
										pct={(item.count / statusTotal) * 100}
										color={item.meta.color}
										height={5}
									/>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* ── Leads processed ── */}
			<div className="card mb-5 overflow-hidden">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border-b border-(--color-border)">
					<div>
						<h2 className="text-sm sm:text-base font-bold text-(--color-text) m-0">
							Leads processed
						</h2>
						<p className="text-[0.7rem] sm:text-xs text-(--color-text-tertiary) m-0 mt-0.5">
							Latest activity by {scopeName.toLowerCase()} in{" "}
							{monthLabel(month)} · search and filter the latest{" "}
							{processedEntries.length} worked leads
						</p>
					</div>
					<span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-(--color-surface-hover) text-(--color-text-secondary) self-start">
						{processedFiltered.length} of {data.processedTotal || processedEntries.length} lead
						{(data.processedTotal || processedEntries.length) === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 border-b border-(--color-border)">
					<div className="relative flex-1 min-w-0">
						<Search
							size={13}
							className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--color-text-tertiary)"
						/>
						<input
							value={processedSearch}
							onChange={(e) => setProcessedSearch(e.target.value)}
							placeholder="Search lead, company, phone, product or owner..."
							className="input w-full pl-8 pr-2.5 py-1.5 text-xs sm:text-sm rounded-lg"
						/>
					</div>
					<select
						value={processedFileFilter}
						onChange={(e) =>
							setProcessedFileFilter(
								e.target.value as
									| "all"
									| "with_file"
									| "without_file",
							)
						}
						className="select px-2.5 py-1.5 text-xs sm:text-sm rounded-lg"
						title="Filter by file status"
					>
						<option value="all">All worked leads</option>
						<option value="with_file">With a file</option>
						<option value="without_file">No file yet</option>
					</select>
				</div>
				{processedFiltered.length === 0 ? (
					<div className="p-8 text-center text-xs sm:text-sm text-(--color-text-tertiary)">
						{processedEntries.length === 0
							? `No lead activity in ${monthLabel(month)} for ${scopeName}.`
							: "No worked leads match the current search or filter."}
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
								{processedFiltered.map((lead) => {
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
													<button
														type="button"
														onClick={() =>
															navigate(
																`/crm/dial?leadId=${lead.leadId}`,
															)
														}
														className="btn btn-ghost btn-sm px-2 py-1 text-[0.62rem] font-semibold inline-flex items-center gap-1"
														title="Open this lead in the dial queue"
													>
														<ArrowUpRight
															size={12}
														/>
														Open lead
													</button>
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

				<div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
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
					<div className="relative ml-auto w-full sm:w-64">
						<Search
							size={13}
							className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--color-text-tertiary)"
						/>
						<input
							value={historySearch}
							onChange={(e) => setHistorySearch(e.target.value)}
							placeholder="Search activity or lead..."
							className="input w-full pl-8 pr-2.5 py-1.5 text-[0.7rem] rounded-lg"
						/>
					</div>
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
							activity in {monthLabel(month)}
							{historySearch.trim() ? " matches your search" : ""}.
						</div>
					) : (
						<div className="flex flex-col">
							{historyGroups.map((group) => (
								<div key={group.key}>
									<div className="px-2 pt-2 pb-1 text-[0.58rem] font-bold uppercase tracking-wider text-(--color-text-tertiary) bg-(--color-surface)">
										{group.label}
									</div>
									{group.entries.map((entry) => {
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
							))}
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
