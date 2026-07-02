import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Phone, Building, Loader2, AlertCircle, CheckCircle2, X, RefreshCw, Search, Filter, ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import Avatar from "../common/Avatar";
import toast from "react-hot-toast";
import { useCrmSocket } from "../../hooks/useCrmSocket";

interface Campaign {
	_id: string;
	name: string;
}

interface Lead {
	_id: string;
	name: string;
	phone?: string;
	companyName?: string;
	status: string;
	priority: string;
	nextFollowupAt?: string;
	scheduleType?: "follow_up" | "meeting";
	meetingStatus?: "scheduled" | "done" | "canceled";
	meetingAt?: string;
	campaignId?: Campaign | string;
}

const STATUS_BADGE: Record<string, string> = {
	callback_scheduled: "warning",
	meeting_scheduled: "info",
	new: "todo",
	attempted: "warning",
	connected: "info",
	interested: "success",
	not_interested: "danger",
	not_reachable: "danger",
	do_not_call: "danger",
	closed_won: "success",
	closed_lost: "danger",
};

const STATUS_OPTIONS = [
	"new", "attempted", "connected", "interested",
	"callback_scheduled", "meeting_scheduled",
	"not_interested", "not_reachable", "do_not_call",
	"closed_won", "closed_lost",
] as const;

type Tab = "all" | "meetings" | "followups";
type DateFilter = "all" | "overdue" | "today" | "tomorrow" | "thisWeek" | "later";

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "overdue", label: "Overdue" },
	{ key: "today", label: "Today" },
	{ key: "tomorrow", label: "Tomorrow" },
	{ key: "thisWeek", label: "This Week" },
	{ key: "later", label: "Later" },
];

const getItemDate = (lead: Lead): Date | null => {
	const d = lead.scheduleType === "meeting" || lead.meetingAt ? lead.meetingAt : lead.nextFollowupAt;
	return d ? new Date(d) : null;
};

const formatRelativeDateTime = (d?: string): { label: string; time: string; isOverdue: boolean } => {
	if (!d) return { label: "—", time: "", isOverdue: false };
	const date = new Date(d);
	const now = new Date();
	const isOverdue = date < now;

	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

	const diffDays = Math.round((targetDay.getTime() - today.getTime()) / 86400000);

	const timeStr = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

	let label: string;
	if (diffDays === 0) {
		label = "Today";
	} else if (diffDays === 1) {
		label = "Tomorrow";
	} else if (diffDays < 0) {
		label = `${Math.abs(diffDays)}d overdue`;
	} else if (diffDays < 7) {
		label = date.toLocaleDateString("en-IN", { weekday: "short" });
	} else {
		label = date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
	}

	return { label, time: timeStr, isOverdue };
};

interface DateGroup {
	key: string;
	title: string;
	count: number;
	items: Lead[];
}

const groupLeadsByDate = (items: Lead[]): DateGroup[] => {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const endOfWeek = new Date(today);
	endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

	const groups: Record<string, Lead[]> = {
		overdue: [],
		today: [],
		tomorrow: [],
		thisWeek: [],
		later: [],
	};

	items.forEach((lead) => {
		const d = getItemDate(lead);
		if (!d) { groups.later.push(lead); return; }

		const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

		if (d < now) {
			groups.overdue.push(lead);
		} else if (targetDay.getTime() === today.getTime()) {
			groups.today.push(lead);
		} else if (targetDay.getTime() === tomorrow.getTime()) {
			groups.tomorrow.push(lead);
		} else if (targetDay <= endOfWeek) {
			groups.thisWeek.push(lead);
		} else {
			groups.later.push(lead);
		}
	});

	const result: DateGroup[] = [];
	if (groups.overdue.length) result.push({ key: "overdue", title: "Overdue", count: groups.overdue.length, items: groups.overdue });
	if (groups.today.length) result.push({ key: "today", title: "Today", count: groups.today.length, items: groups.today });
	if (groups.tomorrow.length) result.push({ key: "tomorrow", title: "Tomorrow", count: groups.tomorrow.length, items: groups.tomorrow });
	if (groups.thisWeek.length) result.push({ key: "thisWeek", title: "This Week", count: groups.thisWeek.length, items: groups.thisWeek });
	if (groups.later.length) result.push({ key: "later", title: "Later", count: groups.later.length, items: groups.later });

	return result;
};

const Schedule = () => {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	useCrmSocket();
	const [actionLoading, setActionLoading] = useState<string | null>(null);
	const [showRescheduleModal, setShowRescheduleModal] = useState(false);
	const [rescheduleLeadId, setRescheduleLeadId] = useState<string | null>(null);
	const [rescheduleDate, setRescheduleDate] = useState("");
	const [rescheduleNotes, setRescheduleNotes] = useState("");
	const [activeTab, setActiveTab] = useState<Tab>("all");
	const [dateFilter, setDateFilter] = useState<DateFilter>("all");
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [filterStatus, setFilterStatus] = useState("");
	const [page, setPage] = useState(1);
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [datePreset, setDatePreset] = useState("all");
	const [showFollowupModal, setShowFollowupModal] = useState(false);
	const [followupLeadId, setFollowupLeadId] = useState<string | null>(null);
	const [followupNotes, setFollowupNotes] = useState("");
	const [followupStatus, setFollowupStatus] = useState("connected");
	const [showMeetingModal, setShowMeetingModal] = useState(false);
	const [meetingLeadId, setMeetingLeadId] = useState<string | null>(null);
	const [meetingNotes, setMeetingNotes] = useState("");
	const [meetingOutcome, setMeetingOutcome] = useState("attempted");

	const presets = [
		{ label: "All", value: "all" },
		{ label: "Today", value: "today" },
		{ label: "This Week", value: "week" },
		{ label: "This Month", value: "month" },
		{ label: "This Year", value: "year" },
	];

	const applyPreset = (preset: string) => {
		setDatePreset(preset);
		setPage(1);
		const now = new Date();
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		if (preset === "all") {
			setDateFrom("");
			setDateTo("");
		} else if (preset === "today") {
			setDateFrom(startOfDay.toISOString().slice(0, 10));
			setDateTo(startOfDay.toISOString().slice(0, 10));
		} else if (preset === "week") {
			const weekStart = new Date(startOfDay);
			weekStart.setDate(weekStart.getDate() - weekStart.getDay());
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekEnd.getDate() + 6);
			setDateFrom(weekStart.toISOString().slice(0, 10));
			setDateTo(weekEnd.toISOString().slice(0, 10));
		} else if (preset === "month") {
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
			const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			setDateFrom(monthStart.toISOString().slice(0, 10));
			setDateTo(monthEnd.toISOString().slice(0, 10));
		} else if (preset === "year") {
			const yearStart = new Date(now.getFullYear(), 0, 1);
			const yearEnd = new Date(now.getFullYear(), 11, 31);
			setDateFrom(yearStart.toISOString().slice(0, 10));
			setDateTo(yearEnd.toISOString().slice(0, 10));
		}
	};

	const clearDateRange = () => {
		setDateFrom("");
		setDateTo("");
		setDatePreset("all");
		setPage(1);
	};

	useEffect(() => {
		const t = setTimeout(() => setSearchQuery(searchInput), 350);
		return () => clearTimeout(t);
	}, [searchInput]);

	const queryParams = useMemo(() => {
		const params: Record<string, string> = { page: String(page), limit: "100" };
		if (activeTab !== "all") params.tab = activeTab;
		if (searchQuery) params.search = searchQuery;
		if (filterStatus) params.status = filterStatus;
		if (dateFrom) params.dateFrom = dateFrom;
		if (dateTo) params.dateTo = dateTo;
		return params;
	}, [page, activeTab, searchQuery, filterStatus, dateFrom, dateTo]);

	const { data, isLoading, error } = useQuery({
		queryKey: ["leads", "upcoming", queryParams],
		queryFn: async () => {
			const { data } = await api.get("/leads/upcoming", { params: queryParams });
			if (!data.success) throw new Error("Failed to load schedule");
			return data;
		},
	});

	const leads: Lead[] = data?.leads ?? [];
	const totalPages = data?.totalPages ?? 1;
	const tabCounts = data?.counts ?? { all: 0, meetings: 0, followups: 0 };

	const getCampaignName = (campaignId: any): string => {
		if (!campaignId) return "—";
		if (typeof campaignId === "object" && campaignId.name) return campaignId.name;
		return "—";
	};

	const handleMeetingAction = async (leadId: string, action: "done" | "canceled") => {
		setActionLoading(leadId);
		try {
			await api.patch(`/leads/${leadId}/meeting-status`, { meetingStatus: action });
			queryClient.invalidateQueries({ queryKey: ["leads"] });
		} catch (err: any) {
			alert(err.response?.data?.message || "Failed to update meeting");
		} finally {
			setActionLoading(null);
		}
	};

	const handleRescheduleSave = async () => {
		if (!rescheduleLeadId || !rescheduleDate) return;
		setActionLoading(rescheduleLeadId);
		try {
			if (rescheduleNotes.trim()) {
				await api.post(`/leads/${rescheduleLeadId}/notes`, { text: rescheduleNotes.trim() });
			}
			await api.put(`/leads/${rescheduleLeadId}`, { meetingAt: rescheduleDate, meetingStatus: "scheduled", status: "meeting_scheduled" });
			queryClient.invalidateQueries({ queryKey: ["leads"] });
			toast.success("Meeting rescheduled");
			setShowRescheduleModal(false);
			setRescheduleLeadId(null);
			setRescheduleDate("");
			setRescheduleNotes("");
		} catch (err: any) {
			alert(err.response?.data?.message || "Failed to reschedule");
		} finally {
			setActionLoading(null);
		}
	};

	const handleFollowupCompleteSave = async () => {
		if (!followupLeadId) return;
		if (!followupNotes.trim()) {
			toast.error("Notes are required");
			return;
		}
		setActionLoading(followupLeadId);
		try {
			if (followupNotes.trim()) {
				await api.post(`/leads/${followupLeadId}/notes`, { text: followupNotes.trim() });
			}
			await api.put(`/leads/${followupLeadId}`, { nextFollowupAt: null, status: followupStatus });
			queryClient.invalidateQueries({ queryKey: ["leads"] });
			toast.success("Follow-up completed");
			setShowFollowupModal(false);
			setFollowupLeadId(null);
			setFollowupNotes("");
			setFollowupStatus("connected");
		} catch (err: any) {
			alert(err.response?.data?.message || "Failed to complete follow-up");
		} finally {
			setActionLoading(null);
		}
	};

	const handleMeetingCompleteSave = async () => {
		if (!meetingLeadId) return;
		if (!meetingNotes.trim()) {
			toast.error("Notes are required");
			return;
		}
		setActionLoading(meetingLeadId);
		try {
			if (meetingNotes.trim()) {
				await api.post(`/leads/${meetingLeadId}/notes`, { text: meetingNotes.trim() });
			}
			await api.put(`/leads/${meetingLeadId}`, { meetingStatus: "done", status: meetingOutcome, nextFollowupAt: null });
			queryClient.invalidateQueries({ queryKey: ["leads"] });
			toast.success("Meeting completed");
			setShowMeetingModal(false);
			setMeetingLeadId(null);
			setMeetingNotes("");
			setMeetingOutcome("attempted");
		} catch (err: any) {
			alert(err.response?.data?.message || "Failed to complete meeting");
		} finally {
			setActionLoading(null);
		}
	};

	const handleFollowupDismiss = async (leadId: string) => {
		setActionLoading(leadId);
		try {
			await api.put(`/leads/${leadId}`, { nextFollowupAt: null });
			queryClient.invalidateQueries({ queryKey: ["leads"] });
			toast.success("Follow-up dismissed");
		} catch (err: any) {
			alert(err.response?.data?.message || "Failed to dismiss follow-up");
		} finally {
			setActionLoading(null);
		}
	};

	const filteredLeads = useMemo(() => {
		return [...leads].sort((a, b) => {
			const da = getItemDate(a);
			const db = getItemDate(b);
			if (!da && !db) return 0;
			if (!da) return 1;
			if (!db) return -1;
			return da.getTime() - db.getTime();
		});
	}, [leads]);

	const dateGroups = useMemo(() => groupLeadsByDate(filteredLeads), [filteredLeads]);

	const displayedGroups = useMemo(() => {
		if (dateFilter === "all") return dateGroups;
		return dateGroups.filter(g => g.key === dateFilter);
	}, [dateGroups, dateFilter]);

	const TABS: { key: Tab; label: string }[] = [
		{ key: "all", label: "All" },
		{ key: "meetings", label: "Meetings" },
		{ key: "followups", label: "Follow-ups" },
	];

	const handleTabChange = (tab: Tab) => {
		setActiveTab(tab);
		setPage(1);
	};

	const handleSearchChange = (val: string) => {
		setSearchInput(val);
		setPage(1);
	};

	const handleStatusChange = (val: string) => {
		setFilterStatus(val);
		setPage(1);
	};

	const getTabCount = (tab: Tab) => tabCounts[tab];

	if (isLoading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
				<Loader2 size={32} className="animate-spin" style={{ color: "var(--color-primary)" }} />
			</div>
		);
	}

	if (error) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
				<div className="card" style={{ padding: 32, textAlign: "center" }}>
					<AlertCircle size={32} style={{ color: "var(--color-danger)", marginBottom: 12 }} />
					<p style={{ color: "var(--color-text-secondary)" }}>{error instanceof Error ? error.message : "Failed to load schedule"}</p>
					<button className="btn btn-primary btn-sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["leads", "upcoming"] })} style={{ marginTop: 12 }}>
						<RefreshCw size={14} /> Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div style={{ maxWidth: 960 }}>
			<div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
				<div>
					<h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
						Schedule
					</h1>
					<p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
						Manage meetings & follow-ups
					</p>
				</div>
				<button
					className="btn btn-secondary"
					onClick={async () => {
						await Promise.all([
							queryClient.invalidateQueries({ queryKey: ["leads"] }),
							queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
						]);
						toast.success("Refreshed");
					}}
					title="Refresh"
					style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
				>
					<RefreshCw size={16} />
				</button>
			</div>

			<div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--color-border)" }}>
				{TABS.map((tab) => (
					<button
						key={tab.key}
						onClick={() => handleTabChange(tab.key)}
						style={{
							padding: "10px 20px",
							fontSize: "0.85rem",
							fontWeight: activeTab === tab.key ? 600 : 500,
							color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-secondary)",
							background: "none",
							border: "none",
							borderBottom: activeTab === tab.key ? "2px solid var(--color-primary)" : "2px solid transparent",
							cursor: "pointer",
							transition: "all 0.15s ease",
							whiteSpace: "nowrap",
							marginBottom: -1,
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						{tab.label}
						<span style={{
							fontSize: "0.7rem",
							fontWeight: 500,
							background: activeTab === tab.key ? "var(--color-primary-light)" : "var(--color-surface-hover)",
							color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-tertiary)",
							padding: "0 7px",
							borderRadius: 10,
							lineHeight: "18px",
						}}>
							{getTabCount(tab.key)}
						</span>
					</button>
				))}
			</div>

			<div className="card" style={{ padding: "14px 18px", marginBottom: 20 }}>
				<div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
					<div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
						<div style={{
							flex: "1 1 200px", display: "flex", alignItems: "center", gap: 6,
							border: "1px solid var(--color-border)", borderRadius: 8, padding: "0 10px",
						}}>
							<Search size={15} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
							<input
								placeholder="Search by name, company, phone..."
								style={{
									flex: 1, border: "none", padding: "8px 0", fontSize: "0.82rem",
									outline: "none", boxShadow: "none", background: "transparent", color: "var(--color-text)",
								}}
								value={searchInput}
								onChange={(e) => handleSearchChange(e.target.value)}
							/>
							{searchQuery && (
								<button
									onClick={() => handleSearchChange("")}
									style={{ border: "none", background: "none", padding: 4, cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: "0.75rem" }}
								>
									<X size={14} />
								</button>
							)}
						</div>
						<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
							<Filter size={14} style={{ color: "var(--color-text-tertiary)" }} />
							<select
								className="input"
								style={{ padding: "6px 10px", fontSize: "0.8rem" }}
								value={filterStatus}
								onChange={(e) => handleStatusChange(e.target.value)}
							>
								<option value="">All Status</option>
								{STATUS_OPTIONS.map((s) => (
									<option key={s} value={s}>{s.replace(/_/g, " ")}</option>
								))}
							</select>
						</div>
						<div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
							{presets.map((p) => (
								<button
									key={p.value}
									onClick={() => applyPreset(p.value)}
									style={{
										padding: "4px 10px", fontSize: "0.75rem", fontWeight: datePreset === p.value ? 600 : 500,
										color: datePreset === p.value ? "var(--color-primary)" : "var(--color-text-secondary)",
										background: datePreset === p.value ? "var(--color-primary-light)" : "transparent",
										border: `1px solid ${datePreset === p.value ? "var(--color-primary)" : "var(--color-border)"}`,
										borderRadius: 6, cursor: "pointer",
									}}
								>
									{p.label}
								</button>
							))}
						</div>
					</div>
					<div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
						<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
							<span style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-tertiary)" }}>
								Date Range
							</span>
							<input
								type="date"
								value={dateFrom}
								onChange={(e) => { setDateFrom(e.target.value); setDatePreset("custom"); setPage(1); }}
								style={{
									padding: "5px 8px", fontSize: "0.78rem", border: "1px solid var(--color-border)",
									borderRadius: 6, background: "var(--color-surface)", color: "var(--color-text)",
								}}
							/>
							<span style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)" }}>–</span>
							<input
								type="date"
								value={dateTo}
								onChange={(e) => { setDateTo(e.target.value); setDatePreset("custom"); setPage(1); }}
								style={{
									padding: "5px 8px", fontSize: "0.78rem", border: "1px solid var(--color-border)",
									borderRadius: 6, background: "var(--color-surface)", color: "var(--color-text)",
								}}
							/>
							{(dateFrom || dateTo) && (
								<button
									onClick={clearDateRange}
									style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-text-tertiary)", padding: 4 }}
									title="Clear date range"
								>
									<X size={14} />
								</button>
							)}
						</div>
						<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
							{DATE_FILTERS.map((f) => {
								const count = f.key === "all"
									? filteredLeads.length
									: dateGroups.find(g => g.key === f.key)?.count ?? 0;
								const isActive = dateFilter === f.key;
								const isOverdue = f.key === "overdue";
								return (
									<button
										key={f.key}
										onClick={() => { setDateFilter(f.key); setPage(1); }}
										style={{
											padding: "4px 10px", fontSize: "0.75rem", fontWeight: isActive ? 600 : 500,
											color: isActive ? (isOverdue ? "var(--color-danger)" : "var(--color-primary)") : "var(--color-text-secondary)",
											background: isActive ? (isOverdue ? "var(--color-danger-light)" : "var(--color-primary-light)") : "transparent",
											border: `1px solid ${isActive ? (isOverdue ? "var(--color-danger)" : "var(--color-primary)") : "var(--color-border)"}`,
											borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
										}}
									>
										{f.label}
										<span style={{
											fontSize: "0.65rem", fontWeight: 500,
											background: isActive ? (isOverdue ? "var(--color-danger)" : "var(--color-primary)") : "var(--color-surface-hover)",
											color: isActive ? "#fff" : "var(--color-text-tertiary)", padding: "0 6px", borderRadius: 8, lineHeight: "16px",
										}}>
											{count}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				</div>
			</div>

			{filteredLeads.length === 0 ? (
				<div className="card" style={{ padding: 48, textAlign: "center" }}>
					<Calendar size={48} style={{ color: "var(--color-text-tertiary)", margin: "0 auto 16px", opacity: 0.3 }} />
					<h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", margin: "0 0 6px" }}>
						{searchQuery || filterStatus ? "No matching schedules" : "No upcoming schedules"}
					</h3>
					<p style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", margin: 0 }}>
						{searchQuery || filterStatus
							? "Try changing your search or filter criteria."
							: "Schedule a follow-up or meeting from the lead details panel to see it here."}
					</p>
				</div>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
					{displayedGroups.map((group) => (
						<div key={group.key}>
							<div style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 10,
								padding: "4px 2px",
							}}>
								<h2 style={{
									fontSize: "0.85rem",
									fontWeight: 600,
									color: group.key === "overdue" ? "var(--color-danger)" : "var(--color-text)",
									margin: 0,
									display: "flex",
									alignItems: "center",
									gap: 6,
								}}>
									{group.key === "overdue" ? <AlertCircle size={14} /> : <Calendar size={14} />}
									{group.title}
								</h2>
								<span style={{
									fontSize: "0.7rem",
									fontWeight: 500,
									background: group.key === "overdue" ? "var(--color-danger-light)" : "var(--color-surface-hover)",
									color: group.key === "overdue" ? "var(--color-danger)" : "var(--color-text-tertiary)",
									padding: "0 8px",
									borderRadius: 10,
									lineHeight: "20px",
								}}>
									{group.count}
								</span>
							</div>
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								{group.items.map((lead) => {
									const date = getItemDate(lead);
									const rel = formatRelativeDateTime(date?.toISOString());
									const isMeeting = lead.scheduleType === "meeting" || !!lead.meetingAt;
									const isMeetingDone = lead.meetingStatus === "done" || lead.meetingStatus === "canceled";

									return (
										<div
										onClick={() => navigate(`/crm/dial?leadId=${lead._id}`)}
											key={lead._id}
											className="card cursor-pointer"
											style={{
												padding: "14px 18px",
												borderLeft: `3px solid ${
													isMeetingDone
														? "var(--color-border)"
														: group.key === "overdue"
															? "var(--color-danger)"
															: "var(--color-primary)"
												}`,
												opacity: isMeetingDone ? 0.65 : 1,
												transition: "opacity 0.15s ease",
											}}
										>
											<div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
												<Avatar name={lead.name} size={36} />
												<div style={{ flex: 1, minWidth: 0 }}>
													<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
														<span style={{
															fontWeight: 600,
															fontSize: "0.9rem",
															textDecoration: isMeetingDone ? "line-through" : "none",
														}}>
															{lead.name}
														</span>
														<span className={`badge ${isMeeting ? "badge-info" : "badge-warning"}`} style={{ fontSize: "0.6rem", padding: "1px 7px", borderRadius: 6 }}>
															{isMeeting ? "Meeting" : "Follow-up"}
														</span>
														<span className={`badge badge-${STATUS_BADGE[lead.status] || "todo"}`} style={{ fontSize: "0.6rem", padding: "1px 7px", borderRadius: 6 }}>
															{lead.status.replace(/_/g, " ")}
														</span>
														{isMeetingDone && (
															<span className={`badge ${lead.meetingStatus === "done" ? "badge-success" : "badge-danger"}`} style={{ fontSize: "0.6rem", padding: "1px 7px", borderRadius: 6 }}>
																{lead.meetingStatus}
															</span>
														)}
													</div>

													<div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: "0.78rem", color: "var(--color-text-secondary)", marginTop: 4 }}>
														{lead.companyName && (
															<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
																<Building size={12} /> {lead.companyName}
															</span>
														)}
														{lead.phone && (
															<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
																<Phone size={12} /> {lead.phone}
															</span>
														)}
														<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
															{getCampaignName(lead.campaignId)}
														</span>
													</div>

													{date && (
														<div style={{
															display: "flex",
															alignItems: "center",
															gap: 6,
															marginTop: 6,
															fontSize: "0.78rem",
															fontWeight: 500,
															color: rel.isOverdue && !isMeetingDone
																? "var(--color-danger)"
																: "var(--color-primary)",
														}}>
															<Clock size={12} />
															<span>{rel.label}</span>
															{rel.time && <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>{rel.time}</span>}
														</div>
													)}
												</div>

												<div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
													{isMeeting && !isMeetingDone && (
														<div style={{ display: "flex", gap: 6 }}>
															<button
																className="btn btn-success btn-sm"
																onClick={(e) => { e.stopPropagation(); setMeetingLeadId(lead._id); setMeetingOutcome("attempted"); setMeetingNotes(""); setShowMeetingModal(true); }}
																style={{ fontSize: "0.78rem", padding: "6px 14px", borderRadius: 8, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
															>
																<CheckCircle2 size={14} /> Completed
															</button>
															<button
																className="btn btn-secondary btn-sm"
																onClick={(e) => { e.stopPropagation(); setRescheduleLeadId(lead._id); setRescheduleDate(lead.meetingAt?.slice(0, 16) || ""); setRescheduleNotes(""); setShowRescheduleModal(true); }}
																style={{ fontSize: "0.78rem", padding: "6px 14px", borderRadius: 8, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
															>
																<CalendarClock size={14} /> Reschedule
															</button>
															<button
																className="btn btn-sm"
																disabled={actionLoading === lead._id}
																onClick={(e) => { e.stopPropagation(); handleMeetingAction(lead._id, "canceled"); }}
																style={{ fontSize: "0.78rem", padding: "6px 14px", borderRadius: 8, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.12)", color: "var(--color-danger)", border: "none" }}
															>
																<X size={14} /> Cancel
															</button>
														</div>
													)}
													{!isMeeting && !isMeetingDone && (
														<div style={{ display: "flex", gap: 6 }}>
															<button
																className="btn btn-success btn-sm"
																onClick={(e) => { e.stopPropagation(); setFollowupLeadId(lead._id); setFollowupStatus("connected"); setFollowupNotes(""); setShowFollowupModal(true); }}
																style={{ fontSize: "0.78rem", padding: "6px 14px", borderRadius: 8, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
															>
																<CheckCircle2 size={14} />
																Completed
															</button>
															<button
																className="btn btn-danger btn-sm"
																onClick={(e) => { e.stopPropagation(); handleFollowupDismiss(lead._id); }}
																style={{ fontSize: "0.78rem", padding: "6px 14px", borderRadius: 8, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
															>
																<X size={14} /> Dismiss
															</button>
														</div>
													)}

												</div>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					))}
					{totalPages > 1 && (
						<div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 0" }}>
							<button
								className="btn btn-ghost btn-sm"
								disabled={page <= 1}
								onClick={() => setPage(p => Math.max(1, p - 1))}
								style={{ width: 36, height: 36, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--color-border)" }}
							>
								<ChevronLeft size={16} />
							</button>
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
								.reduce((acc: (number | string)[], p, idx, arr) => {
									if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
									acc.push(p);
									return acc;
								}, [])
								.map((p, i) =>
									typeof p === "string" ? (
										<span key={`ellipsis-${i}`} style={{ color: "var(--color-text-tertiary)", fontSize: "0.8rem", padding: "0 2px" }}>...</span>
									) : (
										<button
											key={p}
											className="btn btn-sm"
											onClick={() => setPage(p)}
											style={{
												width: 32, height: 32, padding: 0, borderRadius: 6, fontSize: "0.8rem", fontWeight: p === page ? 600 : 400,
												border: p === page ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
												background: p === page ? "var(--color-primary-light)" : "transparent",
												color: p === page ? "var(--color-primary)" : "var(--color-text-secondary)",
											}}
										>
											{p}
										</button>
									)
								)}
							{totalPages > 1 && (
								<span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginLeft: 4 }}>
									of {totalPages}
								</span>
							)}
							<button
								className="btn btn-ghost btn-sm"
								disabled={page >= totalPages}
								onClick={() => setPage(p => Math.min(totalPages, p + 1))}
								style={{ width: 36, height: 36, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--color-border)" }}
							>
								<ChevronRight size={16} />
							</button>
						</div>
					)}
				</div>
			)}

			{showFollowupModal && (
				<div
					style={{
						position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
						zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
					}}
					onClick={() => { setShowFollowupModal(false); setFollowupLeadId(null); }}
				>
					<div
						className="card animate-fade-in"
						style={{ maxWidth: 440, width: '100%', padding: 24, borderRadius: 16 }}
						onClick={e => e.stopPropagation()}
					>
						<h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 600 }}>Complete Follow-up</h3>

						<label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }}>
							Call Status <span style={{ color: 'var(--color-danger)' }}>*</span>
						</label>
						<select
							value={followupStatus}
							onChange={e => setFollowupStatus(e.target.value)}
							style={{
								width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
								fontSize: '0.85rem', marginBottom: 14, background: 'var(--color-bg)',
							}}
						>
							<option value="new">New</option>
							<option value="attempted">Attempted</option>
							<option value="connected">Connected</option>
							<option value="interested">Interested</option>
							<option value="callback_scheduled">Callback Scheduled</option>
							<option value="meeting_scheduled">Meeting Scheduled</option>
							<option value="not_interested">Not Interested</option>
							<option value="not_reachable">Not Reachable</option>
							<option value="do_not_call">Do Not Call</option>
							<option value="closed_won">Closed Won</option>
							<option value="closed_lost">Closed Lost</option>
						</select>

						<label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }}>
							Notes <span style={{ color: 'var(--color-danger)' }}>*</span>
						</label>
						<textarea
							value={followupNotes}
							onChange={e => setFollowupNotes(e.target.value)}
							placeholder="Enter notes about this call..."
							rows={4}
							style={{
								width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
								fontSize: '0.85rem', resize: 'vertical', background: 'var(--color-bg)',
							}}
						/>

						<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
							<button
								className="btn btn-ghost"
								onClick={() => { setShowFollowupModal(false); setFollowupLeadId(null); }}
								style={{ fontSize: '0.85rem', padding: '8px 18px', borderRadius: 8 }}
							>
								Cancel
							</button>
							<button
								className="btn btn-primary"
								disabled={actionLoading === followupLeadId || !followupNotes.trim()}
								onClick={handleFollowupCompleteSave}
								style={{ fontSize: '0.85rem', padding: '8px 18px', borderRadius: 8 }}
							>
								{actionLoading === followupLeadId ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
							</button>
						</div>
					</div>
				</div>
			)}

			{showMeetingModal && (
				<div
					style={{
						position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
						zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
					}}
					onClick={() => { setShowMeetingModal(false); setMeetingLeadId(null); }}
				>
					<div
						className="card animate-fade-in"
						style={{ maxWidth: 440, width: '100%', padding: 24, borderRadius: 16 }}
						onClick={e => e.stopPropagation()}
					>
						<h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 600 }}>Complete Meeting</h3>

						<label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }}>
							Meeting Outcome <span style={{ color: 'var(--color-danger)' }}>*</span>
						</label>
						<select
							value={meetingOutcome}
							onChange={e => setMeetingOutcome(e.target.value)}
							style={{
								width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
								fontSize: '0.85rem', marginBottom: 14, background: 'var(--color-bg)',
							}}
						>
							<option value="attempted">Attempted</option>
							<option value="interested">Interested</option>
							<option value="closed_won">Closed Won</option>
							<option value="closed_lost">Closed Lost</option>
						</select>

						<label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }}>
							Notes <span style={{ color: 'var(--color-danger)' }}>*</span>
						</label>
						<textarea
							value={meetingNotes}
							onChange={e => setMeetingNotes(e.target.value)}
							placeholder="Enter notes about this meeting..."
							rows={4}
							style={{
								width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
								fontSize: '0.85rem', resize: 'vertical', background: 'var(--color-bg)',
							}}
						/>

						<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
							<button
								className="btn btn-ghost"
								onClick={() => { setShowMeetingModal(false); setMeetingLeadId(null); }}
								style={{ fontSize: '0.85rem', padding: '8px 18px', borderRadius: 8 }}
							>
								Cancel
							</button>
							<button
								className="btn btn-primary"
								disabled={actionLoading === meetingLeadId || !meetingNotes.trim()}
								onClick={handleMeetingCompleteSave}
								style={{ fontSize: '0.85rem', padding: '8px 18px', borderRadius: 8 }}
							>
								{actionLoading === meetingLeadId ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
							</button>
						</div>
					</div>
				</div>
			)}

			{showRescheduleModal && (
				<div
					style={{
						position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
						zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
					}}
					onClick={() => { setShowRescheduleModal(false); setRescheduleLeadId(null); }}
				>
					<div
						className="card animate-fade-in"
						style={{ maxWidth: 440, width: '100%', padding: 24, borderRadius: 16 }}
						onClick={e => e.stopPropagation()}
					>
						<h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 600 }}>Reschedule Meeting</h3>

						<label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }}>
							New Date & Time <span style={{ color: 'var(--color-danger)' }}>*</span>
						</label>
						<input
							type="datetime-local"
							value={rescheduleDate}
							onChange={e => setRescheduleDate(e.target.value)}
							style={{
								width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
								fontSize: '0.85rem', marginBottom: 14, background: 'var(--color-bg)',
							}}
						/>

						<label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }}>
							Reason for Reschedule
						</label>
						<textarea
							value={rescheduleNotes}
							onChange={e => setRescheduleNotes(e.target.value)}
							placeholder="Enter reason for rescheduling..."
							rows={3}
							style={{
								width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
								fontSize: '0.85rem', resize: 'vertical', background: 'var(--color-bg)',
							}}
						/>

						<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
							<button
								className="btn btn-ghost"
								onClick={() => { setShowRescheduleModal(false); setRescheduleLeadId(null); }}
								style={{ fontSize: '0.85rem', padding: '8px 18px', borderRadius: 8 }}
							>
								Cancel
							</button>
							<button
								className="btn btn-primary"
								disabled={actionLoading === rescheduleLeadId || !rescheduleDate}
								onClick={handleRescheduleSave}
								style={{ fontSize: '0.85rem', padding: '8px 18px', borderRadius: 8 }}
							>
								{actionLoading === rescheduleLeadId ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
							</button>
						</div>
					</div>
				</div>
			)}
	</div>
);
};

export default Schedule;
