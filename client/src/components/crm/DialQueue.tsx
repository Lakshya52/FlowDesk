import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
	Phone,
	Building,
	X,
	Clock,
	MessageSquare,
	Plus,
	Upload,
	Download,
	ChevronDown,
	PhoneCall,
	Filter,
	Search,
	Loader2,
	AlertCircle,
	CheckCircle,
	Pen,
	Trash2,
	Calendar,
	RefreshCw,
} from "lucide-react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import toast from "react-hot-toast";
import { useCrmSocket } from "../../hooks/useCrmSocket";

interface Campaign {
	_id: string;
	name: string;
}

interface LeadNote {
	_id: string;
	text: string;
	createdBy: { _id: string; name: string; email: string; avatar?: string };
	createdAt: string;
}

interface FollowUpLog {
	scheduledAt: string;
	createdAt: string;
}

interface MeetingLog {
	scheduledAt: string;
	createdAt: string;
	status: "scheduled" | "done" | "canceled";
}

interface Lead {
	_id: string;
	campaignId: Campaign | string;
	tenantId: string;
	name: string;
	designation?: string;
	phone?: string;
	alternatePhone?: string;
	companyName?: string;
	addressLine?: string;
	city?: string;
	state?: string;
	pincode?: string;
	companyPan?: string;
	companyGst?: string;
	industry?: string;
	email?: string;
	website?: string;
	priority: "very high" | "high" | "medium" | "low";
	source: string;
	status:
		| "new"
		| "attempted"
		| "connected"
		| "interested"
		| "callback_scheduled"
		| "meeting_scheduled"
		| "not_interested"
		| "not_reachable"
		| "do_not_call"
		| "closed_won"
		| "closed_lost";
	callCount: number;
	lastCallAt?: string;
	callDuration: number;
	nextFollowupAt?: string;
	scheduleType?: "follow_up" | "meeting";
	meetingStatus?: "scheduled" | "done" | "canceled";
	meetingAt?: string;
	followUpCount: number;
	meetingCount: number;
	followUpLogs: FollowUpLog[];
	meetingLogs: MeetingLog[];
	notes: LeadNote[];
	createdAt: string;
	updatedAt: string;
}

const STATUS_OPTIONS: Lead["status"][] = [
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

const PRIORITY_COLORS: Record<string, string> = {
	"very high": "var(--color-danger)",
	high: "var(--color-warning)",
	med: "var(--color-primary)",
	low: "var(--color-text-tertiary)",
};

const STATUS_BADGE: Record<string, string> = {
	new: "todo",
	attempted: "warning",
	connected: "in_progress",
	interested: "in_progress",
	callback_scheduled: "in_progress",
	meeting_scheduled: "in_progress",
	not_interested: "not_started",
	not_reachable: "not_started",
	do_not_call: "not_started",
	closed_won: "done",
	closed_lost: "not_started",
};

const DialQueue = () => {
	const { user: currentUser } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const isAdmin = currentUser?.role === "admin";
	useCrmSocket();

	const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
	const [filterCampaign, setFilterCampaign] = useState("");
	const [filterStatus, setFilterStatus] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [filterIndustry, setFilterIndustry] = useState("");
	const [filterSource, setFilterSource] = useState("");
	const [filterPriority, setFilterPriority] = useState("");
	const [activeTab, setActiveTab] = useState<"all" | "archived" | "meeting_scheduled" | "closed_won">("all");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(50);

	useEffect(() => {
		const t = setTimeout(() => setSearchQuery(searchInput), 350);
		return () => clearTimeout(t);
	}, [searchInput]);

	const [showImportModal, setShowImportModal] = useState(false);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [importing, setImporting] = useState(false);
	const [importStep, setImportStep] = useState<
		"campaign" | "upload" | "result"
	>("campaign");
	const [importCampaignId, setImportCampaignId] = useState("");
	const [importResult, setImportResult] = useState<{
		imported: number;
		errors: any[];
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [newNote, setNewNote] = useState("");
	const [updatingLead, setUpdatingLead] = useState(false);
	const [isCalling, setIsCalling] = useState(false);
	const [callDuration, setCallDuration] = useState(0);

	const [followupDate, setFollowupDate] = useState("");
	const [schedulingFollowup, setSchedulingFollowup] = useState(false);
	const [scheduleType, setScheduleType] = useState<"follow_up" | "meeting">("follow_up");
	const [showAllContactDetails, setShowAllContactDetails] = useState(false);
	const [isEditingLead, setIsEditingLead] = useState(false);
	const [editForm, setEditForm] = useState<
		Record<string, string | undefined>
	>({});

	useEffect(() => {
		if (selectedLead) {
			setIsEditingLead(false);
			const hasMeeting = selectedLead.meetingAt;
			const hasFollowup = selectedLead.nextFollowupAt;
			const dateStr = hasMeeting || hasFollowup;
			setFollowupDate(
				dateStr
					? new Date(dateStr)
							.toISOString()
							.slice(0, 16)
					: "",
			);
			setScheduleType(
				selectedLead.scheduleType || (selectedLead.meetingAt ? "meeting" : "follow_up"),
			);
		}
	}, [selectedLead]);

	useEffect(() => {
		let interval: ReturnType<typeof setInterval>;
		if (isCalling) {
			interval = setInterval(() => {
				setCallDuration((prev) => prev + 1);
			}, 1000);
		}
		return () => clearInterval(interval);
	}, [isCalling]);

	const formatDuration = (seconds: number) => {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
	};

	const handleToggleCall = () => {
		if (isCalling) {
			setIsCalling(false);
			if (selectedLead) {
				handleRecordCall(selectedLead._id);
			}
		} else {
			setCallDuration(0);
			setIsCalling(true);
		}
	};

	const [createForm, setCreateForm] = useState({
		name: "",
		phone: "",
		email: "",
		companyName: "",
		addressLine: "",
		city: "",
		state: "",
		pincode: "",
		companyPan: "",
		companyGst: "",
		designation: "",
		industry: "",
		website: "",
		alternatePhone: "",
		campaignId: "",
		priority: "medium" as Lead["priority"],
	});

	const getTabStatusParam = (tab: typeof activeTab): string | undefined => {
		switch (tab) {
			case "archived": return "not_interested,do_not_call,closed_lost";
			case "meeting_scheduled": return "meeting_scheduled";
			case "closed_won": return "closed_won";
			default: return undefined;
		}
	};

	const leadsParams = useMemo(() => ({ page, pageSize, activeTab, filterCampaign, filterStatus, searchQuery, filterIndustry, filterSource, filterPriority }), [page, pageSize, activeTab, filterCampaign, filterStatus, searchQuery, filterIndustry, filterSource, filterPriority]);

	const { data: leadsData = { leads: [], totalPages: 1 }, isLoading } = useQuery({
		queryKey: ["leads", leadsParams],
		queryFn: async () => {
			const params: any = { page: page, limit: pageSize };
			if (filterCampaign) params.campaignId = filterCampaign;
			const tabStatus = getTabStatusParam(activeTab);
			if (tabStatus) {
				params.status = tabStatus;
			} else if (filterStatus) {
				params.status = filterStatus;
			}
			if (searchQuery) params.search = searchQuery;
			if (filterIndustry) params.industry = filterIndustry;
			if (filterSource) params.source = filterSource;
			if (filterPriority) params.priority = filterPriority;
			const { data } = await api.get("/leads", { params });
			return { leads: data.success ? data.leads : [], totalPages: data.totalPages || 1 };
		},
		staleTime: 30000,
		placeholderData: keepPreviousData,
	});

	const leads = leadsData.leads;
	const totalPages = leadsData.totalPages;

	const { data: campaigns = [] } = useQuery({
		queryKey: ["campaigns"],
		queryFn: async () => {
			const { data } = await api.get("/campaigns");
			return data.success ? data.campaigns : [];
		},
	});

	const countsParams = useMemo(() => ({ filterCampaign, searchQuery, filterIndustry, filterSource, filterPriority }), [filterCampaign, searchQuery, filterIndustry, filterSource, filterPriority]);

	const { data: tabCounts = { all: 0, archived: 0, meeting_scheduled: 0, closed_won: 0 } } = useQuery({
		queryKey: ["leads", "counts", countsParams],
		queryFn: async () => {
			const params: any = {};
			if (filterCampaign) params.campaignId = filterCampaign;
			if (searchQuery) params.search = searchQuery;
			if (filterIndustry) params.industry = filterIndustry;
			if (filterSource) params.source = filterSource;
			if (filterPriority) params.priority = filterPriority;
			const { data } = await api.get("/leads/counts", { params });
			return data.success ? data.counts : { all: 0, archived: 0, meeting_scheduled: 0, closed_won: 0 };
		},
		staleTime: 60000,
	});

	useEffect(() => {
		setPage(1);
	}, [
		activeTab,
		filterCampaign,
		filterStatus,
		searchQuery,
		filterIndustry,
		filterSource,
		filterPriority,
		pageSize,
	]);

	// Auto-open lead from URL param (e.g. from CRM Dashboard "Very High Priority" click)
	const [focusLeadId, setFocusLeadId] = useState<string | null>(null);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const leadId = params.get("leadId");
		if (leadId) {
			setFocusLeadId(leadId);
			navigate("/crm/dial", { replace: true });
		}
	}, [location.search]);

	useEffect(() => {
		if (!focusLeadId) return;

		const openLead = async () => {
			const lead = leads.find((l:any) => l._id === focusLeadId)
				|| (await api.get(`/leads/${focusLeadId}`).then((r) => r.data.lead).catch(() => null));

			if (!lead) return;

			setTimeout(() => {
				const el = document.getElementById(`lead-${focusLeadId}`);
				if (el) {
					el.scrollIntoView({ behavior: "smooth", block: "center" });
					el.style.transition = "all 0.3s ease";
					el.style.backgroundColor = "var(--color-primary-light)";
					el.style.transform = "scale(1.02)";
					el.style.boxShadow = "0 10px 25px rgba(0,0,0,0.1)";
					setTimeout(() => {
						el.style.backgroundColor = "";
						el.style.transform = "";
						el.style.boxShadow = "";
					}, 2000);
				}
			}, 300);

			setTimeout(() => {
				setSelectedLead(lead);
				setFocusLeadId(null);
			}, 600);
		};

		openLead();
	}, [focusLeadId, leads]);

	const getCampaignName = (campaignId: any): string => {
		if (!campaignId) return "—";
		if (typeof campaignId === "object" && campaignId.name)
			return campaignId.name;
		const found = campaigns.find((c:any) => c._id === campaignId);
		return found?.name || "—";
	};

	const getInitials = (name: string) =>
		name
			.split(" ")
			.map((w) => w[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);

	const formatDate = (d?: string) => {
		if (!d) return "—";
		return new Date(d).toLocaleDateString("en-IN", {
			day: "numeric",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const formatDateShort = (d?: string) => {
		if (!d) return "Never";
		const date = new Date(d);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const hours = Math.floor(diff / 3600000);
		if (hours < 1) return "Just now";
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString("en-IN", {
			day: "numeric",
			month: "short",
		});
	};

	const handleStatusChange = async (
		leadId: string,
		status: Lead["status"],
	) => {
		setUpdatingLead(true);
		try {
			const { data } = await api.put(`/leads/${leadId}`, { status });
			if (data.success) {
				if (selectedLead?._id === leadId) setSelectedLead(data.lead);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
			}
		} catch (err) {
			console.error("Failed to update status", err);
		} finally {
			setUpdatingLead(false);
		}
	};

	const handleRecordCall = async (
		leadId: string,
		newStatus?: Lead["status"],
	) => {
		setUpdatingLead(true);
		try {
			const body: any = {};
			if (newStatus) body.status = newStatus;
			body.callDuration = callDuration;
			const { data } = await api.post(`/leads/${leadId}/call`, body);
			if (data.success) {
				if (selectedLead?._id === leadId) setSelectedLead(data.lead);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
			}
		} catch (err) {
			console.error("Failed to record call", err);
		} finally {
			setUpdatingLead(false);
		}
	};

	const handleAddNote = async () => {
		if (!newNote.trim() || !selectedLead) return;
		try {
			const { data } = await api.post(
				`/leads/${selectedLead._id}/notes`,
				{ text: newNote.trim() },
			);
			if (data.success) {
				setSelectedLead(data.lead);
				setNewNote("");
				queryClient.invalidateQueries({ queryKey: ["leads"] });
			}
		} catch (err) {
			console.error("Failed to add note", err);
		}
	};

	const handleScheduleFollowup = async () => {
		if (!selectedLead || !followupDate) return;
		setSchedulingFollowup(true);
		try {
			const payload: any = {
				scheduleType,
			};
			if (scheduleType === "meeting") {
				payload.meetingAt = followupDate;
				payload.status = "meeting_scheduled";
				payload.meetingStatus = "scheduled";
			} else {
				payload.nextFollowupAt = followupDate;
				payload.status = "callback_scheduled";
			}
			const { data } = await api.put(`/leads/${selectedLead._id}`, payload);
			if (data.success) {
				setSelectedLead(data.lead);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
			}
		} catch (err) {
			console.error("Failed to schedule follow-up", err);
		} finally {
			setSchedulingFollowup(false);
		}
	};

	const handleCreateLead = async () => {
		if (!createForm.name.trim()) return;
		if (!createForm.campaignId) {
			alert("Please select a campaign before creating a lead.");
			return;
		}
		if (createForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email)) {
			alert("Please enter a valid email address.");
			return;
		}
		if (createForm.phone && !/^\d{10}$/.test(createForm.phone.replace(/\D/g, ""))) {
			alert("Please enter a valid 10-digit phone number.");
			return;
		}
		if (createForm.alternatePhone && !/^\d{10}$/.test(createForm.alternatePhone.replace(/\D/g, ""))) {
			alert("Please enter a valid 10-digit alternate phone number.");
			return;
		}
		setUpdatingLead(true);
		const payload = Object.fromEntries(
			Object.entries(createForm).filter(([_, v]) => v !== ""),
		);
		try {
			const { data } = await api.post("/leads", payload);
			if (data.success) {
				setShowCreateForm(false);
				setCreateForm({
					name: "",
					phone: "",
					email: "",
					companyName: "",
					addressLine: "",
					city: "",
					state: "",
					pincode: "",
					companyPan: "",
					companyGst: "",
					designation: "",
					industry: "",
					website: "",
					alternatePhone: "",
					campaignId: "",
					priority: "medium",
				});
				queryClient.invalidateQueries({ queryKey: ["leads"] });
			}
		} catch (err: any) {
			alert(err.response?.data?.message || "Failed to create lead");
		} finally {
			setUpdatingLead(false);
		}
	};

	const handleSaveLead = async () => {
		if (!selectedLead || !editForm) return;
		setUpdatingLead(true);
		try {
			const { data } = await api.put(
				`/leads/${selectedLead._id}`,
				editForm,
			);
			if (data.success) {
				setSelectedLead(data.lead);
				setIsEditingLead(false);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
			}
		} catch (err: unknown) {
			const apiErr = err as {
				response?: { data?: { message?: string } };
			};
			alert(apiErr.response?.data?.message || "Failed to update lead");
		} finally {
			setUpdatingLead(false);
		}
	};

	const handleDeleteLead = async () => {
		if (!selectedLead) return;
		const first = confirm("Are you sure you want to delete this lead?");
		if (!first) return;
		const second = confirm(
			`This will permanently delete "${selectedLead.name}". This action cannot be undone.`,
		);
		if (!second) return;
		try {
			await api.delete(`/leads/${selectedLead._id}`);
			setSelectedLead(null);
			queryClient.invalidateQueries({ queryKey: ["leads"] });
		} catch (err: unknown) {
			const apiErr = err as {
				response?: { data?: { message?: string } };
			};
			alert(apiErr.response?.data?.message || "Failed to delete lead");
		}
	};

	const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setImporting(true);
		setImportResult(null);

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("campaignId", importCampaignId || "");

			const { data } = await api.post("/leads/import/excel", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});

			setImportResult({
				imported: data.imported,
				errors: data.errors || [],
			});
			setImportStep("result");
			if (data.success) {
				queryClient.invalidateQueries({ queryKey: ["leads"] });
			}
		} catch (err: any) {
			alert(err.response?.data?.message || "Import failed");
		} finally {
			setImporting(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	if (isLoading) {
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					padding: 60,
				}}
			>
				<Loader2
					size={32}
					className="animate-spin"
					style={{ color: "var(--color-primary)" }}
				/>
			</div>
		);
	}

	return (
		<div style={{ maxWidth: 1200 }}>
			<div
				className="flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4"
				style={{ marginBottom: 20 }}
			>
				<div>
					<h1
						style={{
							fontSize: "1.5rem",
							fontWeight: 700,
							letterSpacing: "-0.02em",
						}}
					>
						Dial Queue
					</h1>
					{/* <p
						style={{
							color: "var(--color-text-secondary)",
							fontSize: "0.875rem",
							marginTop: 4,
						}}
					>
						{leads.length} lead{leads.length !== 1 ? "s" : ""} in
						queue
					</p> */}
				</div>

				{/* {isAdmin && ( */}
				<div style={{ display: "flex", gap: 8 }}>
					<button
						className="btn btn-secondary"
						onClick={async () => {
							await Promise.all([
								queryClient.invalidateQueries({ queryKey: ["leads"] }),
								queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
							]);
							toast.success('Refreshed');
						}}
						title="Refresh"
						style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
					>
						<RefreshCw size={16} />
					</button>
					<button
						className="btn btn-secondary"
						onClick={() => setShowImportModal(true)}
					>
						<Download size={16} /> Import
					</button>
					<button
						className="btn btn-primary"
						onClick={() => setShowCreateForm(true)}
					>
						<Plus size={16} /> Add Lead
					</button>
				</div>
				{/* // )} */}
			</div>

			{/* Tabs */}
			<div
				style={{
					display: "flex",
					gap: 4,
					marginBottom: 16,
					borderBottom: "1px solid var(--color-border)",
					paddingBottom: 0,
				}}
			>
				{([
					{ key: "all", label: "All Queue" },
					{ key: "archived", label: "Archived" },
					{ key: "meeting_scheduled", label: "Meeting Scheduled" },
					{ key: "closed_won", label: "Closed Won" },
				] as const).map((tab) => (
					<button
						key={tab.key}
						onClick={() => {
							setActiveTab(tab.key);
							setFilterStatus("");
						}}
						style={{
							padding: "8px 18px",
							fontSize: "0.82rem",
							fontWeight: activeTab === tab.key ? 700 : 500,
							color:
								activeTab === tab.key
									? "var(--color-primary)"
									: "var(--color-text-secondary)",
							background: "none",
							border: "none",
							borderBottom:
								activeTab === tab.key
									? "2px solid var(--color-primary)"
									: "2px solid transparent",
							cursor: "pointer",
							transition: "all 0.15s ease",
							whiteSpace: "nowrap",
							display: "inline-flex",
							alignItems: "center",
						}}
					>
						{tab.label}
						<span
							style={{
								marginLeft: 6,
								padding: "2px 8px",
								borderRadius: 12,
								fontSize: "0.75rem",
								background:
									activeTab === tab.key
										? "var(--color-primary-light)"
										: "var(--color-surface-hover)",
								color:
									activeTab === tab.key
										? "var(--color-primary)"
										: "var(--color-text-tertiary)",
							}}
						>
							{tabCounts[tab.key] ?? 0}
						</span>
					</button>
				))}
			</div>

			<div
				style={{
					display: "flex",
					gap: 12,
					marginBottom: 20,
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				<div
					style={{
						flex: "1 1 280px",
						display: "flex",
						alignItems: "center",
						gap: 6,
						// background: "white",
						border: "1px solid var(--color-border)",
						borderRadius: 8,
						padding: "0 10px",
					}}
				>
					<Search
						size={15}
						style={{
							color: "var(--color-text-tertiary)",
							flexShrink: 0,
						}}
					/>
					<input
						placeholder="Search by name, phone, company, email, GST, PAN, industry ..... "
						style={{
							flex: 1,
							border: "none",
							padding: "8px 0",
							fontSize: "0.82rem",
							outline: "none",
							boxShadow: "none",
							background: "transparent",
						}}
						value={searchInput}
						onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
					/>
				</div>
				<div
					style={{
						display: "flex",
						gap: 8,
						flexWrap: "wrap",
						alignItems: "center",
					}}
				>
					<Filter
						size={14}
						style={{ color: "var(--color-text-tertiary)" }}
					/>
					<select
						className="input"
						style={{
							width: 150,
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterCampaign}
						onChange={(e) => setFilterCampaign(e.target.value)}
					>
						<option value="">All Campaigns</option>
						<option value="__none__">No Campaign</option>
						{campaigns.map((c:any) => (
							<option key={c._id} value={c._id}>
								{c.name}
							</option>
						))}
					</select>
					<select
						className="input"
						style={{
							width: 140,
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterStatus}
						onChange={(e) => setFilterStatus(e.target.value)}
					>
						<option value="">All Status</option>
						{STATUS_OPTIONS.map((s) => (
							<option key={s} value={s}>
								{s.replace(/_/g, " ")}
							</option>
						))}
					</select>
					<select
						className="input"
						style={{
							width: 140,
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterIndustry}
						onChange={(e) => setFilterIndustry(e.target.value)}
					>
						<option value="">All Industries</option>
						{[
							...new Set(
								(leads.map((l:any) => l.industry).filter(Boolean) as string[]),
							),
						].map((ind) => (
							<option key={ind} value={ind}>
								{ind}
							</option>
						))}
					</select>
					<select
						className="input"
						style={{
							width: 150,
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterSource}
						onChange={(e) => setFilterSource(e.target.value)}
					>
						<option value="">All Sources</option>
						{[
							...new Set(
								(leads.map((l:any) => l.source).filter(Boolean) as string[]),
							),
						].map((src) => (
							<option key={src} value={src}>
								{src}
							</option>
						))}
					</select>
					<select
						className="input"
						style={{
							width: 140,
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterPriority}
						onChange={(e) => setFilterPriority(e.target.value)}
					>
						<option value="">All Priority</option>
						<option value="very high">Very High</option>
						<option value="high">High</option>
						<option value="medium">Medium</option>
						<option value="low">Low</option>
					</select>
				</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				{leads.length === 0 ? (
					<div
						className="card"
						style={{ padding: 48, textAlign: "center" }}
					>
						<PhoneCall
							size={48}
							style={{
								color: "var(--color-text-tertiary)",
								margin: "0 auto 16px",
								opacity: 0.3,
							}}
						/>
						<h3
							style={{
								fontSize: "1.1rem",
								fontWeight: 600,
								color: "var(--color-text)",
								marginBottom: 8,
							}}
						>
							No Leads in Queue
						</h3>
						<p
							style={{
								fontSize: "0.85rem",
								color: "var(--color-text-secondary)",
								maxWidth: 400,
								margin: "0 auto",
							}}
						>
							{isAdmin
								? "Import leads from Excel or add them manually to start your dial queue."
								: "Leads will appear here once they are assigned to your queue."}
						</p>
					</div>
				) : (
					leads.map((lead:any) => (
						<div
							key={lead._id}
							id={`lead-${lead._id}`}
							className="card animate-fade-in"
							style={{
								padding: 14,
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								cursor: "pointer",
								border:
									selectedLead?._id === lead._id
										? "1px solid var(--color-primary)"
										: undefined,
							}}
							onClick={() => setSelectedLead(lead)}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 14,
								}}
							>
								<div>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											marginBottom: 3,
										}}
									>
										<span
											style={{
												fontSize: "0.9rem",
												fontWeight: 600,
												color: "var(--color-text)",
											}}
										>
											{lead.name}
										</span>
										<span
											style={{
												fontSize: "0.65rem",
												fontWeight: 600,
												padding: "2px 6px",
												borderRadius: 4,
												background:
													PRIORITY_COLORS[
														lead.priority
													] + "20",
												color: PRIORITY_COLORS[
													lead.priority
												],
											}}
										>
											{lead.priority}
										</span>
										<span
											className={`badge badge-${STATUS_BADGE[lead.status] || "todo"}`}
											style={{ fontSize: "0.65rem" }}
										>
											{lead.status.replace(/_/g, " ")}
										</span>
									</div>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 14,
											fontSize: "0.78rem",
											color: "var(--color-text-secondary)",
										}}
									>
										{lead.phone && (
											<span
												style={{
													display: "flex",
													alignItems: "center",
													gap: 3,
												}}
											>
												<Phone size={12} /> {lead.phone}
											</span>
										)}
										{lead.companyName && (
											<span
												style={{
													display: "flex",
													alignItems: "center",
													gap: 3,
												}}
											>
												<Building size={12} />{" "}
												{lead.companyName}
											</span>
										)}
									</div>
								</div>
							</div>

							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 16,
								}}
							>
								<div
									style={{
										textAlign: "right",
										fontSize: "0.7rem",
										color: "var(--color-text-tertiary)",
									}}
								>
									<div>Calls: {lead.callCount}</div>
									<div>F/U: {lead.followUpCount}</div>
									<div>Meet: {lead.meetingCount}</div>
									<div
										style={{
											color: "var(--color-text-secondary)",
										}}
									>
										{formatDateShort(lead.lastCallAt)}
									</div>
								</div>
								{isAdmin && (
									<button
										className="btn btn-primary btn-sm"
										style={{
											borderRadius: "50%",
											width: 34,
											height: 34,
											padding: 0,
										}}
										onClick={(e) => {
											e.stopPropagation();
											setSelectedLead(lead);
										}}
									>
										<ChevronDown size={16} />
									</button>
								)}
							</div>
						</div>
					))
				)}
				{totalPages > 1 && (
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							gap: 12,
							padding: "16px 0",
							flexWrap: "wrap",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							<span
								style={{
									fontSize: "0.78rem",
									color: "var(--color-text-tertiary)",
								}}
							>
								Per page
							</span>
							<select
								style={{
									padding: "4px 8px",
									fontSize: "0.8rem",
									borderRadius: 6,
									border: "1px solid var(--color-border)",
									// background: "white",
								}}
								value={pageSize}
								onChange={(e) =>
									setPageSize(Number(e.target.value))
								}
							>
								<option value={50}>50</option>
								<option value={100}>100</option>
								<option value={150}>150</option>
								<option value={200}>200</option>
							</select>
						</div>
						<button
							disabled={page <= 1}
							onClick={() => setPage((p) => p - 1)}
							style={{
								padding: "6px 14px",
								borderRadius: 8,
								border: "1px solid var(--color-border)",
								background:
									page <= 1
										? "var(--color-surface)"
										: "white",
								color:
									page <= 1
										? "var(--color-text-tertiary)"
										: "var(--color-text)",
								fontSize: "0.8rem",
								fontWeight: 600,
								cursor: page <= 1 ? "not-allowed" : "pointer",
							}}
						>
							Previous
						</button>
						<span
							style={{
								fontSize: "0.82rem",
								color: "var(--color-text-secondary)",
							}}
						>
							Page {page} of {totalPages}
						</span>
						<button
							disabled={page >= totalPages}
							onClick={() => setPage((p) => p + 1)}
							style={{
								padding: "6px 14px",
								borderRadius: 8,
								border: "1px solid var(--color-border)",
								background:
									page >= totalPages
										? "var(--color-surface)"
										: "white",
								color:
									page >= totalPages
										? "var(--color-text-tertiary)"
										: "var(--color-text)",
								fontSize: "0.8rem",
								fontWeight: 600,
								cursor:
									page >= totalPages
										? "not-allowed"
										: "pointer",
							}}
						>
							Next
						</button>
					</div>
				)}
			</div>

			{selectedLead && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						// backgroundColor: "rgba(0,0,0,0.4)",
						zIndex: 50,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 24,
					}}
					className="backdrop-blur-sm"
					onClick={() => {
						setSelectedLead(null);
						setIsCalling(false);
					}}
				>
					<div
						className="card animate-fade-in bg-(--color-bg) shadow-xl border-(--color-primary)"
						style={{
							width: "100%",
							maxWidth: 1200,
							maxHeight: "90vh",
							overflow: "hidden",
							display: "flex",
							flexDirection: "column",
							// background: "white",
							borderRadius: 12,
							boxShadow: "var(--color-primary)",
							borderColor: "color-mix(in srgb, var(--color-primary) 50%, transparent)"
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							style={{
								padding: "0px 0px 20px 0px",
								// borderBottom: "1px solid var(--color-border)",
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								flexShrink: 0,
								background: "var(--color-surface)",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 14,
								}}
							>
								<div
									style={{
										width: 44,
										height: 44,
										borderRadius: "50%",
										background:
											PRIORITY_COLORS[
												selectedLead.priority
											] + "20",
										color: PRIORITY_COLORS[
											selectedLead.priority
										],
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: "1.1rem",
										fontWeight: 600,
									}}
								>
									{getInitials(selectedLead.name)}
								</div>
								<div>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
										}}
									>
										<h2
											style={{
												fontSize: "1.15rem",
												fontWeight: 700,
												color: "var(--color-text)",
											}}
										>
											{selectedLead.name}
										</h2>
										<span
											className={`badge badge-${STATUS_BADGE[selectedLead.status] || "todo"}`}
											style={{
												fontSize: "0.65rem",
												padding: "2px 8px",
												borderRadius: 8,
											}}
										>
											{selectedLead.status.replace(
												/_/g,
												" ",
											)}
										</span>
										<span
											style={{
												fontSize: "0.65rem",
												fontWeight: 600,
												padding: "2px 8px",
												borderRadius: 8,
												background:
													PRIORITY_COLORS[
														selectedLead.priority
													] + "15",
												color: PRIORITY_COLORS[
													selectedLead.priority
												],
											}}
										>
											{selectedLead.priority}
										</span>
									</div>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 10,
											marginTop: 2,
											fontSize: "0.75rem",
											color: "var(--color-text-tertiary)",
										}}
									>
										{selectedLead.designation && (
											<span>
												{selectedLead.designation}
											</span>
										)}
										|
										<span>
											Source :&nbsp;
											{selectedLead.source}
										</span>{" "}
										|
										<span>
											Campaign :&nbsp;
											{getCampaignName(
												selectedLead.campaignId,
											)}
										</span>
									</div>
								</div>
							</div>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
								}}
							>
								{isAdmin && !isEditingLead && (
									<button
										onClick={() => {
											setEditForm({
												name: selectedLead.name,
												phone: selectedLead.phone,
												alternatePhone:
													selectedLead.alternatePhone,
												email: selectedLead.email,
												website: selectedLead.website,
												companyName:
													selectedLead.companyName,
												industry: selectedLead.industry,
												designation:
													selectedLead.designation,
												addressLine:
													selectedLead.addressLine,
												city: selectedLead.city,
												state: selectedLead.state,
												pincode: selectedLead.pincode,
												companyPan:
													selectedLead.companyPan,
												companyGst:
													selectedLead.companyGst,
												priority: selectedLead.priority,
											});
											setIsEditingLead(true);
										}}
										title="Edit Lead"
										style={{
											background:
												"var(--color-primary-light)",
											border: "none",
											cursor: "pointer",
											color: "var(--color-primary)",
											width: 32,
											height: 32,
											borderRadius: 8,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Pen size={14} />
									</button>
								)}
								{isAdmin && (
									<button
										onClick={handleDeleteLead}
										title="Delete Lead"
										style={{
											background: "var(--color-danger-light)",
											border: "none",
											cursor: "pointer",
											color: "var(--color-danger)",
											width: 32,
											height: 32,
											borderRadius: 8,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Trash2 size={14} />
									</button>
								)}
								<button
									style={{
										background:
											"var(--color-primary)",
										border: "none",
										cursor: "pointer",
										color: "var(--color-bg)",
										width: 32,
										height: 32,
										borderRadius: 8,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
									}}
									onClick={() => {
										setSelectedLead(null);
										setIsCalling(false);
										setIsEditingLead(false);
									}}
								>
									<X size={16} />
								</button>
							</div>
						</div>

						<div
							style={{
								display: "flex",
								flex: 1,
								overflow: "hidden",
							}}
						>
							{/* Left Column */}
							<div
								style={{
									flex: 1,
									// padding: "20px 24px",
									overflowY: "auto",
									// borderRight:
									// 	"1px solid var(--color-border)",
									marginRight: "12px",
								}}
								className="pr-2"
							>
								{/* Contact Information */}
								<div
									style={{
										// background: "white",
										borderRadius: 12,
										border: "1px solid var(--color-border)",
										overflow: "hidden",
										marginBottom: 16,
										borderColor: "color-mix(in srgb, var(--color-primary) 50%, transparent)"
									}}
								>
									<div
										style={{
											padding: "14px 18px",
											borderBottom:
												"1px solid var(--color-border)",
											display: "flex",
											alignItems: "center",
											gap: 8,
											background: "var(--color-surface)",
										}}
									>
										<Building
											size={14}
											style={{
												color: "var(--color-primary)",
											}}
										/>
										<span
											style={{
												fontSize: "0.82rem",
												fontWeight: 600,
												color: "var(--color-text)",
											}}
										>
											Contact Information
										</span>
									</div>
									{isEditingLead ? (
										<div
											style={{
												padding: "12px 16px",
												display: "flex",
												flexDirection: "column",
												gap: 10,
											}}
										>
											{[
												{ label: "Name", key: "name" },
												{
													label: "Phone",
													key: "phone",
												},
												{
													label: "Alt Phone",
													key: "alternatePhone",
												},
												{
													label: "Email",
													key: "email",
												},
												{
													label: "Website",
													key: "website",
												},
												{
													label: "Company",
													key: "companyName",
												},
												{
													label: "Industry",
													key: "industry",
												},
												{
													label: "Designation",
													key: "designation",
												},
												{
													label: "Address Line",
													key: "addressLine",
												},
												{ label: "City", key: "city" },
												{
													label: "State",
													key: "state",
												},
												{
													label: "Pincode",
													key: "pincode",
												},
												{
													label: "PAN",
													key: "companyPan",
												},
												{
													label: "GST",
													key: "companyGst",
												},
											].map((field) => (
												<div key={field.key}>
													<label
														style={{
															fontSize: "0.7rem",
															color: "var(--color-text-tertiary)",
															marginBottom: 2,
															display: "block",
														}}
													>
														{field.label}
													</label>
													<input
														className="input"
														style={{
															width: "100%",
															padding: "6px 10px",
															fontSize: "0.8rem",
															borderRadius: 6,
														}}
														value={
															editForm[
																field.key
															] || ""
														}
														onChange={(e) =>
															setEditForm(
																(prev) => ({
																	...prev,
																	[field.key]:
																		e.target
																			.value,
																}),
															)
														}
													/>
												</div>
											))}
											<div>
												<label
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 2,
														display: "block",
													}}
												>
													Priority
												</label>
												<select
													className="input"
													style={{
														width: "100%",
														padding: "6px 10px",
														fontSize: "0.8rem",
														borderRadius: 6,
													}}
													value={
														editForm.priority ||
														"medium"
													}
													onChange={(e) =>
														setEditForm((prev) => ({
															...prev,
															priority:
																e.target.value,
														}))
													}
												>
													<option value="very high">
														Very High
													</option>
													<option value="high">
														High
													</option>
													<option value="medium">
														Medium
													</option>
													<option value="low">
														Low
													</option>
												</select>
											</div>
											<div
												style={{
													display: "flex",
													gap: 8,
													marginTop: 4,
												}}
											>
												<button
													className="btn btn-primary"
													disabled={
														updatingLead ||
														!editForm.name
													}
													onClick={handleSaveLead}
													style={{
														flex: 1,
														padding: "8px",
														borderRadius: 8,
														fontSize: "0.82rem",
														fontWeight: 600,
													}}
												>
													{updatingLead
														? "Saving..."
														: "Save Changes"}
												</button>
												<button
													onClick={() =>
														setIsEditingLead(false)
													}
													style={{
														flex: 1,
														padding: "8px",
														borderRadius: 8,
														fontSize: "0.82rem",
														fontWeight: 600,
														background:
															"var(--color-surface)",
														border: "1px solid var(--color-border)",
														cursor: "pointer",
													}}
												>
													Cancel
												</button>
											</div>
										</div>
									) : (
										<>
											<div
												style={{
													display: "grid",
													gridTemplateColumns:
														"1fr 1fr",
													gap: 0,
												}}
											>
												{[
													{
														label: "Phone",
														value: selectedLead.phone,
														phone: true,
													},
													{
														label: "Alt Phone",
														value: selectedLead.alternatePhone,
														phone: true,
													},
													{
														label: "Email",
														value: selectedLead.email,
													},
													{
														label: "Website",
														value: selectedLead.website,
													},
													{
														label: "Company",
														value: selectedLead.companyName,
													},
													{
														label: "Industry",
														value: selectedLead.industry,
													},
													{
														label: "PAN",
														value: selectedLead.companyPan,
													},
													{
														label: "GST",
														value: selectedLead.companyGst,
													},
													{
														label: "Address",
														value: [
															selectedLead.addressLine,
															selectedLead.city,
															selectedLead.state,
															selectedLead.pincode,
														]
															.filter(Boolean)
															.join(", "),
														fullWidth: true,
													},
												]
													.filter(
														(item) =>
															item.phone ||
															showAllContactDetails,
													)
													.map((item, i, arr) => {
														const isPhone =
															item.phone;
														return (
															<div
																key={i}
																style={{
																	padding:
																		isPhone
																			? "10px 18px"
																			: "6px 18px",
																	gridColumn:
																		item.fullWidth
																			? "1 / -1"
																			: undefined,
																	borderRight:
																		!item.fullWidth &&
																		i %
																			2 ===
																			0
																			? "1px solid var(--color-border)"
																			: "none",
																	borderBottom:
																		i <
																		arr.length -
																			1
																			? "1px solid var(--color-border)"
																			: "none",
																	background:
																		isPhone
																			? "var(--color-primary-light)"
																			: "transparent",
																}}
															>
																<div
																	style={{
																		fontSize:
																			"0.65rem",
																		color: isPhone
																			? "var(--color-primary)"
																			: "var(--color-text-tertiary)",
																		marginBottom: 2,
																		display:
																			"flex",
																		alignItems:
																			"center",
																		gap: 4,
																	}}
																>
																	{item.label}
																</div>
																<div
																	style={{
																		fontSize:
																			isPhone
																				? "1.15rem"
																				: "0.82rem",
																		fontWeight:
																			isPhone
																				? 700
																				: 500,
																		color: isPhone
																			? "var(--color-primary)"
																			: "var(--color-text)",
																		wordBreak:
																			"break-all",
																	}}
																>
																	{item.value ||
																		"—"}
																</div>
															</div>
														);
													})}
											</div>
											<button
												onClick={() =>
													setShowAllContactDetails(
														(prev) => !prev,
													)
												}
												style={{
													width: "100%",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													gap: 6,
													padding: "10px",
													background:
														"var(--color-surface)",
													border: "none",
													borderTop:
														"1px solid var(--color-border)",
													fontSize: "0.78rem",
													fontWeight: 600,
													color: "var(--color-primary)",
													cursor: "pointer",
												}}
											>
												{showAllContactDetails
													? "Show Less Details"
													: "View More Details"}
											</button>
										</>
									)}
								</div>

								{/* Call Activity */}
								<div
									style={{
										// background: "white",
										borderRadius: 12,
										border: "1px solid var(--color-border)",
										overflow: "hidden",
										marginBottom: 16,
										borderColor: "color-mix(in srgb, var(--color-primary) 50%, transparent)"
									}}
								>
									<div
										style={{
											padding: "10px 16px",
											borderBottom:
												"1px solid var(--color-border)",
											display: "flex",
											alignItems: "center",
											gap: 8,
											background: "var(--color-surface)",
										}}
									>
										<PhoneCall
											size={14}
											style={{
												color: "var(--color-primary)",
											}}
										/>
										<span
											style={{
												fontSize: "0.82rem",
												fontWeight: 600,
												color: "var(--color-text)",
											}}
										>
											Call Activity
										</span>
									</div>
									<div style={{ padding: "12px 16px" }}>
										<div
											style={{
												display: "flex",
												gap: 10,
												marginBottom: 12,
											}}
										>
											<div
												style={{
													flex: 1,
													textAlign: "center",
													padding: "8px 6px",
													background:
														"var(--color-surface)",
													borderRadius: 8,
												}}
											>
												<div
													style={{
														fontSize: "0.65rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 2,
													}}
												>
													Call Count
												</div>
												<div
													style={{
														fontSize: "1.1rem",
														fontWeight: 700,
														color: "var(--color-primary)",
													}}
												>
													{selectedLead.callCount}
												</div>
											</div>
											<div
												style={{
													flex: 1,
													textAlign: "center",
													padding: "8px 6px",
													background:
														"var(--color-surface)",
													borderRadius: 8,
												}}
											>
												<div
													style={{
														fontSize: "0.65rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 2,
													}}
												>
													Last Call
												</div>
												<div
													style={{
														fontSize: "0.85rem",
														fontWeight: 600,
														color: "var(--color-text)",
													}}
												>
													{selectedLead.lastCallAt
														? formatDateShort(
																selectedLead.lastCallAt,
															)
														: "Never"}
												</div>
											</div>
											<div
												style={{
													flex: 1,
													textAlign: "center",
													padding: "8px 6px",
													background:
														"var(--color-surface)",
													borderRadius: 8,
												}}
											>
												<div
													style={{
														fontSize: "0.65rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 2,
													}}
												>
													Timer
												</div>
												<div
													style={{
														fontSize: "0.85rem",
														fontWeight: 600,
														color: isCalling
															? "var(--color-danger)"
															: "var(--color-text)",
														display: "flex",
														alignItems: "center",
														justifyContent:
															"center",
														gap: 4,
													}}
												>
													<Clock size={13} />
													{formatDuration(
														callDuration,
													)}
												</div>
											</div>
										</div>

										{/* {isAdmin && ( */}
										<div
											style={{
												display: "flex",
												gap: 10,
												marginBottom: 10,
											}}
										>
											<select
												className="input"
												style={{
													flex: 1,
													padding: "8px 10px",
													fontSize: "0.8rem",
													borderRadius: 8,
													fontWeight: 600,
													color: "var(--color-text)",
													border: "2px solid var(--color-primary)",
													background:
														"var(--color-primary-light)",
													cursor: "pointer",
												}}
												value={selectedLead.status}
												onChange={(e) =>
													handleStatusChange(
														selectedLead._id,
														e.target
															.value as Lead["status"],
													)
												}
											>
												{STATUS_OPTIONS.map((s) => (
													<option key={s} value={s}>
														{s.replace(/_/g, " ")}
													</option>
												))}
											</select>
										</div>
										{/* )} */}

										{/* {isAdmin && ( */}
										{/* <a href={`tel:${selectedLead.phone}`}> */}
										<button
											onClick={handleToggleCall}
											style={{
												width: "100%",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												gap: 8,
												background: isCalling
													? "var(--color-danger)"
													: "var(--color-primary)",
												color: "white",
												border: "none",
												padding: "8px",
												borderRadius: 8,
												fontSize: "0.85rem",
												fontWeight: 600,
												cursor: "pointer",
											}}
										>
											<PhoneCall size={16} />
											{isCalling
												? "End Call"
												: "Start Call"}
										</button>
										{/* </a> */}
										{/* // )} */}
									</div>
								</div>

								{/* Schedule Follow-up */}
								{/* <div
									style={{
										background: "white",
										borderRadius: 12,
										border: "1px solid var(--color-border)",
										overflow: "hidden",
										marginBottom: 16,
									}}
								>
									<div
										style={{
											padding: "14px 18px",
											borderBottom:
												"1px solid var(--color-border)",
											display: "flex",
											alignItems: "center",
											gap: 8,
											background: "var(--color-surface)",
										}}
									>
										<Calendar
											size={14}
											style={{
												color: "var(--color-primary)",
											}}
										/>
										<span
											style={{
												fontSize: "0.82rem",
												fontWeight: 600,
												color: "var(--color-text)",
											}}
										>
											Schedule Follow-up
										</span>
									</div>
									<div style={{ padding: 16 }}>
										{selectedLead.nextFollowupAt && (
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: 10,
													padding: "10px 14px",
													background:
														"var(--color-primary-light)",
													borderRadius: 8,
													marginBottom: 14,
												}}
											>
												<Calendar
													size={16}
													style={{
														color: "var(--color-primary)",
														flexShrink: 0,
													}}
												/>
												<div>
													<div
														style={{
															fontSize: "0.78rem",
															fontWeight: 600,
															color: "var(--color-primary)",
														}}
													>
														{formatDate(
															selectedLead.nextFollowupAt,
														)}
													</div>
													{selectedLead.nextFollowupNote && (
														<div
															style={{
																fontSize:
																	"0.72rem",
																color: "var(--color-text-secondary)",
																marginTop: 1,
															}}
														>
															{
																selectedLead.nextFollowupNote
															}
														</div>
													)}
												</div>
											</div>
										)}
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: 10,
											}}
										>
											<input
												type="datetime-local"
												className="input"
												style={{
													width: "100%",
													padding: "10px 12px",
													fontSize: "0.82rem",
													borderRadius: 8,
												}}
												value={followupDate}
												onChange={(e) =>
													setFollowupDate(
														e.target.value,
													)
												}
											/>
											<textarea
												className="input"
												placeholder="Add a note about this follow-up..."
												rows={2}
												style={{
													width: "100%",
													padding: "10px 12px",
													fontSize: "0.82rem",
													borderRadius: 8,
													resize: "vertical",
												}}
												value={followupNote}
												onChange={(e) =>
													setFollowupNote(
														e.target.value,
													)
												}
											/>
											<button
												className="btn btn-primary"
												style={{
													width: "100%",
													padding: "10px",
													borderRadius: 8,
													fontWeight: 600,
													fontSize: "0.85rem",
												}}
												onClick={handleScheduleFollowup}
												disabled={
													schedulingFollowup ||
													!followupDate
												}
											>
												{schedulingFollowup ? (
													<span
														style={{
															display: "flex",
															alignItems:
																"center",
															justifyContent:
																"center",
															gap: 6,
														}}
													>
														<Loader2
															size={14}
															className="animate-spin"
														/>{" "}
														Saving...
													</span>
												) : (
													<span
														style={{
															display: "flex",
															alignItems:
																"center",
															justifyContent:
																"center",
															gap: 6,
														}}
													>
														<CheckCircle
															size={16}
														/>{" "}
														Save Follow-up
													</span>
												)}
											</button>
										</div>
									</div>
								</div> */}
							</div>

							{/* Center Column - Schedule & Activity Trail */}
							<div
								style={{
									width: 350,
									display: "flex",
									flexDirection: "column",
									minHeight: 0,
									border: "1px solid var(--color-border)",
									borderRadius: "12px",
									marginRight: 12,
									borderColor: "color-mix(in srgb, var(--color-primary) 50%, transparent)"
								}}
							>
								{/* Follow-up Section */}
								<div
									style={{
										flexShrink: 0,
										padding: "14px 20px",
										borderBottom:
											"1px solid var(--color-border)",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											marginBottom: 10,
										}}
									>
										<Calendar
											size={14}
											style={{
												color: "var(--color-primary)",
											}}
										/>
										<span
											style={{
												fontSize: "0.82rem",
												fontWeight: 600,
												color: "var(--color-text)",
											}}
										>
											Schedule
										</span>
									</div>
									{(selectedLead.nextFollowupAt || selectedLead.meetingAt) && (
										<div
											style={{
												fontSize: "0.78rem",
												color: "var(--color-text-secondary)",
												marginBottom: 8,
												padding: "6px 10px",
												background:
													selectedLead.scheduleType === "meeting"
														? "var(--color-primary-light)"
														: "var(--color-primary-light)",
												borderRadius: 6,
												display: "flex",
												alignItems: "center",
												gap: 6,
											}}
										>
											<span style={{ fontWeight: 600, color: "var(--color-primary)" }}>
												{selectedLead.scheduleType === "meeting" ? "Meeting" : "Follow-up"}:
											</span>
											{formatDate(
												selectedLead.meetingAt || selectedLead.nextFollowupAt,
											)}
										</div>
									)}
									<div
										style={{
											display: "flex",
											gap: 6,
											marginBottom: 8,
										}}
									>
										<button
											style={{
												flex: 1,
												padding: "5px 0",
												fontSize: "0.72rem",
												fontWeight: 600,
												borderRadius: 6,
												border: "none",
												cursor: "pointer",
												background:
													scheduleType === "follow_up"
														? "var(--color-primary)"
														: "var(--color-surface)",
												color:
													scheduleType === "follow_up"
														? "white"
														: "var(--color-text-tertiary)",
											}}
											onClick={() => setScheduleType("follow_up")}
										>
											Follow-up
										</button>
										<button
											style={{
												flex: 1,
												padding: "5px 0",
												fontSize: "0.72rem",
												fontWeight: 600,
												borderRadius: 6,
												border: "none",
												cursor: "pointer",
												background:
													scheduleType === "meeting"
														? "var(--color-primary)"
														: "var(--color-surface)",
												color:
													scheduleType === "meeting"
														? "white"
														: "var(--color-text-tertiary)",
											}}
											onClick={() => setScheduleType("meeting")}
										>
											Meeting
										</button>
									</div>
									<div
										style={{
											display: "flex",
											gap: 8,
										}}
									>
										<input
											type="datetime-local"
											className="input"
											value={followupDate}
											onChange={(e) =>
												setFollowupDate(e.target.value)
											}
											style={{
												flex: 1,
												padding: "6px 10px",
												fontSize: "0.78rem",
												borderRadius: 6,
											}}
										/>
										<button
											className="btn btn-primary"
											disabled={
												!followupDate ||
												schedulingFollowup
											}
											onClick={handleScheduleFollowup}
											style={{
												padding: "6px 14px",
												borderRadius: 6,
												fontSize: "0.78rem",
												fontWeight: 600,
												whiteSpace: "nowrap",
												background: scheduleType === "meeting" ? "var(--color-primary)" : undefined,
											}}
										>
											{schedulingFollowup
												? "Saving..."
												: "Save"}
										</button>
									</div>
								</div>
								{/* Trail / Logs */}
								<div
									style={{
										flex: 1,
										overflowY: "auto",
										minHeight: 0,
										padding: "14px 20px",
										// borderBottom:
										// 	"1px solid var(--color-border)",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											marginBottom: 10,
										}}
									>
										<Clock
											size={14}
											style={{
												color: "var(--color-primary)",
											}}
										/>
										<span
											style={{
												fontSize: "0.82rem",
												fontWeight: 600,
												color: "var(--color-text)",
											}}
										>
											Activity Trail
										</span>
									</div>
									<div
										style={{
											display: "flex",
											gap: 8,
											marginBottom: 8,
										}}
									>
										<div
											style={{
												flex: 1,
												textAlign: "center",
												padding: "6px",
												background:
													"var(--color-surface)",
												borderRadius: 6,
											}}
										>
											<div
												style={{
													fontSize: "0.65rem",
													color: "var(--color-text-tertiary)",
												}}
											>
												Follow-ups
											</div>
											<div
												style={{
													fontSize: "1rem",
													fontWeight: 700,
													color: "var(--color-primary)",
												}}
											>
												{selectedLead.followUpCount}
											</div>
										</div>
										<div
											style={{
												flex: 1,
												textAlign: "center",
												padding: "6px",
												background:
													"var(--color-surface)",
												borderRadius: 6,
											}}
										>
											<div
												style={{
													fontSize: "0.65rem",
													color: "var(--color-text-tertiary)",
												}}
											>
												Meetings
											</div>
											<div
												style={{
													fontSize: "1rem",
													fontWeight: 700,
													color: "var(--color-primary)",
												}}
											>
												{selectedLead.meetingCount}
											</div>
										</div>
									</div>
									{[...selectedLead.followUpLogs]
										.reverse()
										// .slice(0, 5)
										.map((log, idx) => (
											<div
												key={idx}
												style={{
													display: "flex",
													alignItems: "center",
													gap: 8,
													padding: "4px 0",
													fontSize: "0.72rem",
													color: "var(--color-text-secondary)",
													borderBottom:
														idx <
														Math.min(
															selectedLead
																.followUpLogs
																.length,
															5,
														) -
															1
															? "1px solid var(--color-border)"
															: "none",
												}}
											>
												<div
													style={{
														width: 6,
														height: 6,
														borderRadius: "50%",
														background:
															"var(--color-primary)",
														flexShrink: 0,
													}}
												/>
												<span
													style={{
														fontWeight: 600,
														marginRight: 4,
													}}
												>
													Follow-up
												</span>
												{formatDate(log.scheduledAt)}
											</div>
										))}
									{[...selectedLead.meetingLogs]
										.reverse()
										// .slice(0, 5)
										.map((log, idx) => (
											<div
												key={idx}
												style={{
													display: "flex",
													alignItems: "center",
													gap: 8,
													padding: "4px 0",
													fontSize: "0.72rem",
													color: "var(--color-text-secondary)",
													borderBottom:
														idx <
														Math.min(
															selectedLead
																.meetingLogs
																.length,
															5,
														) -
															1
															? "1px solid var(--color-border)"
															: "none",
												}}
											>
												<div
													style={{
														width: 6,
														height: 6,
														borderRadius: "50%",
														background:
															log.status ===
															"done"
																? "var(--color-success)"
																: log.status ===
																	  "canceled"
																	? "var(--color-danger)"
																	: "var(--color-warning)",
														flexShrink: 0,
													}}
												/>
												<span
													style={{
														fontWeight: 600,
														marginRight: 4,
													}}
												>
													Meeting ({log.status})
												</span>
												{formatDate(log.scheduledAt)}
											</div>
										))}
									{selectedLead.followUpLogs.length === 0 &&
										selectedLead.meetingLogs.length ===
											0 && (
											<p
												style={{
													fontSize: "0.75rem",
													color: "var(--color-text-tertiary)",
													textAlign: "center",
													padding: "8px 0",
													margin: 0,
												}}
											>
												No follow-ups or meetings
												scheduled yet.
											</p>
										)}
								</div>
							</div>

							{/* Right Column - Notes */}
							<div
								style={{
									width: 350,
									display: "flex",
									flexDirection: "column",
									border: "1px solid var(--color-border)",
									borderRadius: "12px",
									borderColor: "color-mix(in srgb, var(--color-primary) 50%, transparent)"
								}}
							>
								<div
									style={{
										padding: "14px 20px",
										borderBottom:
											"1px solid var(--color-border)",
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
										}}
									>
										<MessageSquare
											size={14}
											style={{
												color: "var(--color-primary)",
											}}
										/>
										<span
											style={{
												fontSize: "0.82rem",
												fontWeight: 600,
												color: "var(--color-text)",
											}}
										>
											Notes ({selectedLead.notes.length})
										</span>
									</div>
								</div>
								<div
									style={{
										flex: 1,
										overflowY: "auto",
										padding: "16px 20px 16px 16px",
									}}
								>
									{selectedLead.notes.length === 0 ? (
										<p
											style={{
												fontSize: "0.8rem",
												color: "var(--color-text-tertiary)",
												textAlign: "center",
												marginTop: 40,
											}}
										>
											No notes yet. Add the first note
											below.
										</p>
									) : (
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: 16,
											}}
										>
											{[...selectedLead.notes]
												.reverse()
												.map((note, idx) => (
													<div
														key={note._id}
														style={{
															display: "flex",
															gap: 12,
															position:
																"relative",
														}}
													>
														{idx !==
															selectedLead.notes
																.length -
																1 && (
															<div
																style={{
																	position:
																		"absolute",
																	left: 13,
																	top: 30,
																	bottom: -20,
																	width: 2,
																	background:
																		"var(--color-border)",
																}}
															/>
														)}
														<div
															style={{
																width: 28,
																height: 28,
																borderRadius:
																	"50%",
																flexShrink: 0,
																background:
																	"var(--color-primary-light)",
																color: "var(--color-primary)",
																display: "flex",
																alignItems:
																	"center",
																justifyContent:
																	"center",
																fontSize:
																	"0.65rem",
																fontWeight: 600,
																border: "2px solid white",
																zIndex: 1,
															}}
														>
															{getInitials(
																note.createdBy
																	?.name ||
																	"U",
															)}
														</div>
														<div
															style={{ flex: 1 }}
														>
															<div
																style={{
																	display:
																		"flex",
																	alignItems:
																		"center",
																	gap: 6,
																	marginBottom: 4,
																}}
															>
																<span
																	style={{
																		fontSize:
																			"0.78rem",
																		fontWeight: 600,
																		color: "var(--color-text)",
																	}}
																>
																	{note
																		.createdBy
																		?.name ||
																		"Unknown"}
																</span>
																<span
																	style={{
																		fontSize:
																			"0.62rem",
																		color: "var(--color-text-tertiary)",
																	}}
																>
																	{formatDateShort(
																		note.createdAt,
																	)}
																</span>
															</div>
															<p
																style={{
																	fontSize:
																		"0.82rem",
																	color: "var(--color-text-secondary)",
																	lineHeight: 1.5,
																	margin: 0,
																}}
															>
																{note.text}
															</p>
														</div>
													</div>
												))}
										</div>
									)}
								</div>
								{/* {isAdmin && ( */}
								<div
									style={{
										padding: "12px 16px",
										borderTop:
											"1px solid var(--color-border)",
										display: "flex",
										gap: 10,
										
									}}
								>
									<textarea
										id="note-input"
										className="input"
										placeholder="Add a note..."
										rows={3}
										value={newNote}
										onChange={(e) =>
											setNewNote(e.target.value)
										}
										style={{
											flex: 1,
											padding: "8px 12px",
											fontSize: "0.8rem",
											borderRadius: 8,
											resize: "vertical",
											minHeight: 60,
											maxHeight: 120,
										}}
									/>
									<button
										className="btn btn-primary"
										disabled={!newNote.trim()}
										onClick={handleAddNote}
										style={{
											padding: "0 18px",
											borderRadius: 8,
											fontWeight: 600,
											fontSize: "0.82rem",
										}}
									>
										Add
									</button>
								</div>
								{/* )} */}
							</div>
						</div>
					</div>
				</div>
			)}

			{showImportModal && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						backgroundColor: "rgba(0,0,0,0.4)",
						zIndex: 50,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 24,
					}}
					
					onClick={() => {
						setShowImportModal(false);
						setImportResult(null);
						setImportStep("campaign");
						setImportCampaignId("");
					}}
				>
					<div
						className="card animate-fade-in"
						style={{
							maxWidth: 480,
							width: "100%",
							padding: 0,
							overflow: "hidden",
							borderRadius: 16,
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							style={{
								padding: "20px 24px",
								borderBottom: "1px solid var(--color-border)",
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								background: "var(--color-surface)",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
								}}
							>
								<div
									style={{
										width: 36,
										height: 36,
										borderRadius: 10,
										background:
											"var(--color-primary-light)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
									}}
								>
									<Upload
										size={18}
										style={{
											color: "var(--color-primary)",
										}}
									/>
								</div>
								<div>
									<h3
										style={{
											fontSize: "1rem",
											fontWeight: 700,
											margin: 0,
										}}
									>
										Import Leads
									</h3>
									<p
										style={{
											fontSize: "0.72rem",
											color: "var(--color-text-tertiary)",
											margin: "2px 0 0",
										}}
									>
										{importStep === "campaign"
											? "Select a target campaign"
											: importStep === "upload"
												? "Upload an Excel file"
												: "Import complete"}
									</p>
								</div>
							</div>
							<button
								style={{
									background: "var(--color-surface-hover)",
									border: "none",
									cursor: "pointer",
									color: "var(--color-text-tertiary)",
									width: 32,
									height: 32,
									borderRadius: 8,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
								onClick={() => {
									setShowImportModal(false);
									setImportResult(null);
									setImportStep("campaign");
									setImportCampaignId("");
								}}
							>
								<X size={16} />
							</button>
						</div>

						{importStep === "result" && importResult ? (
							<div style={{ padding: 24 }}>
								<div
									style={{
										textAlign: "center",
										marginBottom: 20,
									}}
								>
									<div
										style={{
											width: 48,
											height: 48,
											borderRadius: "50%",
											margin: "0 auto 12px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											background:
												importResult.imported > 0
													? "var(--color-success-light)"
													: "var(--color-danger-light)",
										}}
									>
										{importResult.imported > 0 ? (
											<CheckCircle
												size={24}
												style={{ color: "var(--color-success)" }}
											/>
										) : (
											<AlertCircle
												size={24}
												style={{ color: "var(--color-danger)" }}
											/>
										)}
									</div>
									<h3
										style={{
											fontSize: "1.05rem",
											fontWeight: 700,
											color: "var(--color-text)",
											margin: "0 0 4px",
										}}
									>
										{importResult.imported} lead
										{importResult.imported !== 1 ? "s" : ""}{" "}
										imported
									</h3>
									<p
										style={{
											fontSize: "0.8rem",
											color: "var(--color-text-secondary)",
											margin: 0,
										}}
									>
										{importResult.errors.length > 0
											? `${importResult.errors.length} error${importResult.errors.length !== 1 ? "s" : ""} encountered`
											: "All leads imported successfully"}
									</p>
								</div>
								{importResult.errors.length > 0 && (
									<div
										style={{
											marginBottom: 16,
											padding: 12,
											background: "var(--color-danger-light)",
											borderRadius: 10,
											fontSize: "0.78rem",
											maxHeight: 150,
											overflowY: "auto",
											border: "1px solid var(--color-danger-light)",
										}}
									>
										<div
											style={{
												fontWeight: 600,
												color: "var(--color-danger)",
												marginBottom: 8,
												display: "flex",
												alignItems: "center",
												gap: 6,
											}}
										>
											<AlertCircle size={14} />{" "}
											{importResult.errors.length} error
											{importResult.errors.length !== 1
												? "s"
												: ""}
										</div>
										{importResult.errors.map(
											(e: any, i: number) => (
												<div
													key={i}
													style={{
														color: "var(--color-danger)",
														padding: "4px 8px",
														borderRadius: 4,
														marginBottom: 4,
														fontSize: "0.75rem",
													}}
												>
													<strong>
														Row {e.row}:
													</strong>{" "}
													{e.message}
												</div>
											),
										)}
									</div>
								)}
								<button
									className="btn btn-primary"
									style={{
										width: "100%",
										padding: 10,
										borderRadius: 10,
										fontWeight: 600,
									}}
									onClick={() => {
										setShowImportModal(false);
										setImportResult(null);
										setImportStep("campaign");
										setImportCampaignId("");
									}}
								>
									Done
								</button>
							</div>
						) : importStep === "upload" ? (
							<div style={{ padding: 24 }}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										marginBottom: 16,
									}}
								>
									<button
										className="btn btn-secondary"
										style={{
											padding: "6px 12px",
											fontSize: "0.78rem",
											borderRadius: 8,
										}}
										onClick={() => {
											setImportStep("campaign");
											setImportResult(null);
										}}
									>
										← Back
									</button>
									{importCampaignId && (
										<span
											style={{
												fontSize: "0.78rem",
												color: "var(--color-text-secondary)",
											}}
										>
											Campaign:{" "}
											{campaigns.find(
												(c:any) =>
													c._id === importCampaignId,
											)?.name || "Unknown"}
										</span>
									)}
								</div>
								<input
									ref={fileInputRef}
									type="file"
									accept=".xlsx,.xls"
									style={{ display: "none" }}
									onChange={handleFileImport}
								/>
								<div
									onClick={() =>
										!importing &&
										fileInputRef.current?.click()
									}
									style={{
										border: "2px dashed var(--color-border)",
										borderRadius: 12,
										padding: "32px 24px",
										textAlign: "center",
										cursor: importing
											? "default"
											: "pointer",
										background: "var(--color-surface)",
										marginBottom: 16,
										transition: "border-color 0.2s",
									}}
									onMouseOver={(e) => {
										if (!importing)
											e.currentTarget.style.borderColor =
												"var(--color-primary)";
									}}
									onMouseOut={(e) => {
										e.currentTarget.style.borderColor =
											"var(--color-border)";
									}}
								>
									{importing ? (
										<Loader2
											size={32}
											style={{
												color: "var(--color-primary)",
												margin: "0 auto 12px",
												animation:
													"spin 1s linear infinite",
											}}
										/>
									) : (
										<Upload
											size={32}
											style={{
												color: "var(--color-text-tertiary)",
												margin: "0 auto 12px",
												opacity: 0.4,
											}}
										/>
									)}
									<p
										style={{
											fontSize: "0.85rem",
											fontWeight: 600,
											color: "var(--color-text)",
											margin: "0 0 4px",
										}}
									>
										{importing
											? "Importing..."
											: "Click to upload Excel file"}
									</p>
									<p
										style={{
											fontSize: "0.72rem",
											color: "var(--color-text-tertiary)",
											margin: 0,
										}}
									>
										.xlsx or .xls format
									</p>
								</div>

								<a
									href={`${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}leads/import/sample`}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										gap: 6,
										fontSize: "0.8rem",
										fontWeight: 500,
										color: "var(--color-primary)",
										textDecoration: "none",
										marginBottom: 16,
										padding: "8px",
									}}
								>
									<Download size={14} /> Download sample
									format
								</a>
							</div>
						) : (
							<div style={{ padding: 24 }}>
								{campaigns.length === 0 ? (
									<div
										style={{
											textAlign: "center",
											padding: "24px 0",
										}}
									>
										<div
											style={{
												width: 48,
												height: 48,
												borderRadius: "50%",
												margin: "0 auto 16px",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												background:
													"var(--color-surface-hover)",
											}}
										>
											<AlertCircle
												size={24}
												style={{
													color: "var(--color-text-tertiary)",
												}}
											/>
										</div>
										<h4
											style={{
												fontSize: "0.95rem",
												fontWeight: 600,
												color: "var(--color-text)",
												margin: "0 0 6px",
											}}
										>
											No campaigns yet
										</h4>
										<p
											style={{
												fontSize: "0.78rem",
												color: "var(--color-text-secondary)",
												margin: "0 0 20px",
											}}
										>
											Create a campaign before importing
											leads
										</p>
										<button
											className="btn btn-primary"
											style={{
												padding: "10px 24px",
												borderRadius: 10,
												fontWeight: 600,
											}}
											onClick={() => {
												navigate("/crm/campaigns");
												setShowImportModal(false);
											}}
										>
											Create Now
										</button>
									</div>
								) : (
									<>
										<label
											style={{
												display: "block",
												fontSize: "0.75rem",
												fontWeight: 500,
												color: "var(--color-text-secondary)",
												marginBottom: 6,
											}}
										>
											Select Campaign
										</label>
										<select
											className="input"
											style={{
												width: "100%",
												padding: "10px 12px",
												fontSize: "0.82rem",
												borderRadius: 8,
												marginBottom: 20,
											}}
											value={importCampaignId}
											onChange={(e) =>
												setImportCampaignId(
													e.target.value,
												)
											}
										>
											<option value="">
												No Campaign
											</option>
											{campaigns.map((c:any) => (
												<option
													key={c._id}
													value={c._id}
												>
													{c.name}
												</option>
											))}
										</select>
										<button
											disabled={!importCampaignId}
											className="btn btn-primary"
											style={{
												width: "100%",
												padding: 10,
												borderRadius: 10,
												fontWeight: 600,
											}}
											onClick={() =>
												setImportStep("upload")
											}
										>
											Next →
										</button>
									</>
								)}
							</div>
						)}
					</div>
				</div>
			)}

			{showCreateForm && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						backgroundColor: "rgba(0,0,0,0.4)",
						zIndex: 50,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 24,
					}}
					onClick={() => setShowCreateForm(false)}
				>
					<div
						className="card animate-fade-in"
						style={{
							maxWidth: 520,
							width: "100%",
							maxHeight: "90vh",
							overflowY: "auto",
							padding: 28,
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 20,
							}}
						>
							<h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>
								Add Lead
							</h3>
							<button
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									color: "var(--color-text-tertiary)",
								}}
								onClick={() => setShowCreateForm(false)}
							>
								<X size={18} />
							</button>
						</div>

						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 14,
							}}
						>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.75rem",
										color: "var(--color-text-secondary)",
										marginBottom: 4,
									}}
								>
									Name *
								</label>
								<input
									className="input"
									value={createForm.name}
									onChange={(e) =>
										setCreateForm((p) => ({
											...p,
											name: e.target.value,
										}))
									}
								/>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Phone *
									</label>
									<input
										type="phone"
										inputMode="numeric"
										maxLength={10}
    									pattern="[0-9]"
										className="input"
										required
										value={createForm.phone}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												phone: e.target.value,
											}))
										}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Alternate Phone
									</label>
									<input
										className="input"
										value={createForm.alternatePhone}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												alternatePhone: e.target.value,
											}))
										}
									/>
								</div>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Email
									</label>
									<input
										className="input"
										value={createForm.email}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												email: e.target.value,
											}))
										}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Website
									</label>
									<input
										className="input"
										value={createForm.website}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												website: e.target.value,
											}))
										}
									/>
								</div>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Company
									</label>
									<input
										className="input"
										value={createForm.companyName}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												companyName: e.target.value,
											}))
										}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Industry
									</label>
									<input
										className="input"
										value={createForm.industry}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												industry: e.target.value,
											}))
										}
									/>
								</div>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Address Line
									</label>
									<input
										className="input"
										value={createForm.addressLine}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												addressLine: e.target.value,
											}))
										}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										City
									</label>
									<input
										className="input"
										value={createForm.city}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												city: e.target.value,
											}))
										}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										State
									</label>
									<input
										className="input"
										value={createForm.state}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												state: e.target.value,
											}))
										}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Pincode
									</label>
									<input
										className="input"
										value={createForm.pincode}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												pincode: e.target.value,
											}))
										}
									/>
								</div>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Company PAN
									</label>
									<input
										className="input"
										value={createForm.companyPan}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												companyPan: e.target.value,
											}))
										}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Company GST
									</label>
									<input
										className="input"
										value={createForm.companyGst}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												companyGst: e.target.value,
											}))
										}
									/>
								</div>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Designation
									</label>
									<input
										className="input"
										value={createForm.designation}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												designation: e.target.value,
											}))
										}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Project
									</label>
									<select
										className="input"
										value={createForm.campaignId}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												campaignId: e.target.value,
											}))
										}
									>
										<option value="">None</option>
										{campaigns.map((c:any) => (
											<option key={c._id} value={c._id}>
												{c.name}
											</option>
										))}
									</select>
								</div>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Priority
									</label>
									<select
										className="input"
										value={createForm.priority}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												priority: e.target
													.value as Lead["priority"],
											}))
										}
									>
										<option value="very high">
											Very High
										</option>
										<option value="high">High</option>
										<option value="medium">Medium</option>
										<option value="low">Low</option>
									</select>
								</div>
							</div>
							<button
								className="btn btn-primary"
								style={{
									width: "100%",
									padding: 10,
									marginTop: 4,
								}}
								disabled={
									!createForm.name.trim() || updatingLead || !createForm.phone.trim()
								}
								onClick={handleCreateLead}
							>
								{updatingLead ? (
									<Loader2
										size={16}
										className="animate-spin"
									/>
								) : null}
								{updatingLead ? "Creating..." : "Create Lead"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default DialQueue;
