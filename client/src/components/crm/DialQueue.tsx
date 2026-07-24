import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
	Phone, Building, X, Plus, Upload, Download, ChevronDown, PhoneCall,
	Filter, Search, Loader2, AlertCircle, CheckCircle, RefreshCw,
} from "lucide-react";
import {
	useQuery,
	useQueryClient,
	keepPreviousData,
} from "@tanstack/react-query";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import toast from "react-hot-toast";
import { useCrmSocket } from "../../hooks/useCrmSocket";
import LeadDetailModal, {
	PRIORITY_COLORS,
	STATUS_BADGE,
	STATUS_OPTIONS,
} from "./LeadDetailModal";

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

export interface Lead {
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

const INDIAN_STATES = [
	"Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
	"Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
	"Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
	"Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
	"Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
	"West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
	"Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
	"Ladakh", "Lakshadweep", "Puducherry",
];



const DialQueue = () => {
	const { user: currentUser } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const isAdmin = currentUser?.role === "admin";
	const isManager = currentUser?.role === "manager";
	useCrmSocket();

	const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
	const [filterCampaign, setFilterCampaign] = useState("");
	const [filterStatus, setFilterStatus] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [filterIndustry, setFilterIndustry] = useState("");
	const [filterSource, setFilterSource] = useState("");
	const [filterPriority, setFilterPriority] = useState("");
	const [filterCity, setFilterCity] = useState("");
	const [filterState, setFilterState] = useState("");
	const [filterPincode, setFilterPincode] = useState("");
	const [showFilters, setShowFilters] = useState(false);

	const [activeTab, setActiveTab] = useState<
		"all" | "archived" | "meeting_scheduled" | "closed_won"
	>("all");
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
	const [scheduleType, setScheduleType] = useState<"follow_up" | "meeting">(
		"follow_up",
	);
	const [showAllContactDetails, setShowAllContactDetails] = useState(false);
	const [isEditingLead, setIsEditingLead] = useState(false);
	const [editForm, setEditForm] = useState<
		Record<string, string | undefined>
	>({});

	const [showProjectModal, setShowProjectModal] = useState(false);
	const [creatingProject, setCreatingProject] = useState(false);
	const [allUsers, setAllUsers] = useState<any[]>([]);
	const [projectForm, setProjectForm] = useState({
		title: "",
		clientName: "",
		assignmentType: "transactional" as "transactional" | "recurring",
		description: "",
		priority: "medium" as "low" | "medium" | "high" | "urgent",
		startDate: new Date().toISOString().split("T")[0],
		dueDate: "",
		noDueDate: false,
		team: [] as string[],
	});

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

	const [pincodeLoading, setPincodeLoading] = useState(false);

const handlePincodeChange = async (value: string) => {
	const digitsOnly = value.replace(/\D/g, "").slice(0, 6);
	setCreateForm((p) => ({ ...p, pincode: digitsOnly }));

	if (digitsOnly.length === 6) {
		setPincodeLoading(true);
		try {
			const res = await fetch(
				`https://api.postalpincode.in/pincode/${digitsOnly}`,
			);
			const data = await res.json();
			const postOffice = data?.[0]?.PostOffice?.[0];
			if (postOffice) {
				setCreateForm((p) => ({
					...p,
					city: postOffice.District || p.city,
					state: postOffice.State || p.state,
				}));
			}
		} catch (err) {
			console.error("Failed to fetch pincode details", err);
		} finally {
			setPincodeLoading(false);
		}
	}
};

	useEffect(() => {
		setIsCalling(false);
		setCallDuration(0);
		if (selectedLead) {
			setIsEditingLead(false);
			const hasMeeting = selectedLead.meetingAt;
			const hasFollowup = selectedLead.nextFollowupAt;
			const dateStr = hasMeeting || hasFollowup;
			setFollowupDate(
				dateStr ? new Date(dateStr).toISOString().slice(0, 16) : "",
			);
			setScheduleType(
				selectedLead.scheduleType ||
					(selectedLead.meetingAt ? "meeting" : "follow_up"),
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
			setCallDuration(0);
			if (selectedLead) {
				handleRecordCall(selectedLead._id);
			}
		} else {
			setCallDuration(0);
			setIsCalling(true);
		}
	};

	

	const getTabStatusParam = (tab: typeof activeTab): string | undefined => {
		switch (tab) {
			case "archived":
				return "not_interested,do_not_call,closed_lost";
			case "meeting_scheduled":
				return "meeting_scheduled";
			case "closed_won":
				return "closed_won";
			default:
				return undefined;
		}
	};

	const leadsParams = useMemo(
		() => ({
			page,
			pageSize,
			activeTab,
			filterCampaign,
			filterStatus,
			searchQuery,
			filterIndustry,
			filterSource,
			filterPriority,
			filterCity,
			filterState,
			filterPincode,
		}),
		[
			page,
			pageSize,
			activeTab,
			filterCampaign,
			filterStatus,
			searchQuery,
			filterIndustry,
			filterSource,
			filterPriority,
			filterCity,
			filterState,
			filterPincode,
		],
	);

	const { data: leadsData = { leads: [], totalPages: 1 }, isLoading } =
		useQuery({
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
				if (filterCity) params.city = filterCity;
				if (filterState) params.state = filterState;
				if (filterPincode) params.pincode = filterPincode;
				const { data } = await api.get("/leads", { params });
				return {
					leads: data.success ? data.leads : [],
					totalPages: data.totalPages || 1,
				};
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

	const filterOptionsContext = useMemo(
		() => ({
			filterCampaign,
			searchQuery,
			tabStatus: getTabStatusParam(activeTab),
		}),
		[filterCampaign, searchQuery, activeTab],
	);

	const { data: filterOptions = { industries: [], sources: [], cities: [], states: [], pincodes: [] } } =
		useQuery({
			queryKey: ["leads", "filter-options", filterOptionsContext],
			queryFn: async () => {
				const params: any = {};
				if (filterCampaign) params.campaignId = filterCampaign;
				if (searchQuery) params.search = searchQuery;
				const tabStatus = getTabStatusParam(activeTab);
				if (tabStatus) params.status = tabStatus;
				const { data } = await api.get("/leads/filter-options", { params });
				return data.success
					? data.options
					: { industries: [], sources: [], cities: [], states: [], pincodes: [] };
			},
			staleTime: 60000,
		});

	const countsParams = useMemo(
		() => ({
			filterCampaign,
			searchQuery,
			filterIndustry,
			filterSource,
			filterPriority,
			filterCity,
			filterState,
			filterPincode,
		}),
		[
			filterCampaign,
			searchQuery,
			filterIndustry,
			filterSource,
			filterPriority,
			filterCity,
			filterState,
			filterPincode,
		],
	);

	const {
		data: tabCounts = {
			all: 0,
			archived: 0,
			meeting_scheduled: 0,
			closed_won: 0,
		},
	} = useQuery({
		queryKey: ["leads", "counts", countsParams],
		queryFn: async () => {
			const params: any = {};
			if (filterCampaign) params.campaignId = filterCampaign;
			if (searchQuery) params.search = searchQuery;
			if (filterIndustry) params.industry = filterIndustry;
			if (filterSource) params.source = filterSource;
			if (filterPriority) params.priority = filterPriority;
			if (filterCity) params.city = filterCity;
			if (filterState) params.state = filterState;
			if (filterPincode) params.pincode = filterPincode;
			const { data } = await api.get("/leads/counts", { params });
			return data.success
				? data.counts
				: { all: 0, archived: 0, meeting_scheduled: 0, closed_won: 0 };
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
		filterCity,
		filterState,
		filterPincode,
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

	// Set campaign filter from URL param (e.g. from Campaigns page card click)
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const campaignId = params.get("campaignId");
		if (campaignId) {
			setFilterCampaign(campaignId);
			navigate("/crm/dial", { replace: true });
		}
	}, [location.search]);

	useEffect(() => {
		if (!focusLeadId) return;

		const openLead = async () => {
			const lead =
				leads.find((l: any) => l._id === focusLeadId) ||
				(await api
					.get(`/leads/${focusLeadId}`)
					.then((r) => r.data.lead)
					.catch(() => null));

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

	useEffect(() => {
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape" && selectedLead) {
				setSelectedLead(null);
				setIsCalling(false);
				setCallDuration(0);
			}
		};
		document.addEventListener("keydown", handleEsc);
		return () => document.removeEventListener("keydown", handleEsc);
	}, [selectedLead]);

	const getCampaignName = (campaignId: any): string => {
		if (!campaignId) return "—";
		if (typeof campaignId === "object" && campaignId.name)
			return campaignId.name;
		const found = campaigns.find((c: any) => c._id === campaignId);
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

	const fetchUsersAndTeams = async () => {
		try {
			const { data } = await api.get("/auth/users?all=true");
			setAllUsers(data.users || []);
		} catch (err) {
			console.error("Failed to fetch users", err);
		}
	};

	const handleStatusChange = async (
		leadId: string,
		status: Lead["status"],
	) => {
		if (status === "closed_won" && selectedLead) {
			setProjectForm({
				title: `Converted - ${selectedLead.companyName || selectedLead.name || "Lead"}`,
				clientName: selectedLead.companyName || "",
				assignmentType: "transactional",
				// description: `Project from lead: ${selectedLead.name || ""}${selectedLead.companyName ? ` (${selectedLead.companyName})` : ""}`,
				description: `Successfully converted : ${selectedLead.name || ""}${selectedLead.companyName ? ` (${selectedLead.companyName})` : ""}`,
				priority: "medium",
				startDate: new Date().toISOString().split("T")[0],
				dueDate: "",
				noDueDate: false,
				team: [],
			});
			fetchUsersAndTeams();
			setShowProjectModal(true);
			return;
		}
		setUpdatingLead(true);
		try {
			const { data }  = await api.put(`/leads/${leadId}`, { status });
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

	const handleCreateProject = async () => {
		if (!projectForm.title.trim() || !projectForm.clientName.trim()) {
			toast.error("Title and Company Name are required");
			return;
		}
		setCreatingProject(true);
		try {
			await api.post("/assignments", {
				title: projectForm.title.trim(),
				clientName: projectForm.clientName.trim(),
				description: projectForm.description.trim(),
				priority: projectForm.priority,
				status: "not_started",
				startDate: projectForm.startDate,
				dueDate: projectForm.dueDate || null,
				team: [...projectForm.team, currentUser?._id].filter(Boolean),
				isRecurring: projectForm.assignmentType === "recurring",
			});

			const { data } = await api.put(`/leads/${selectedLead!._id}`, {
				status: "closed_won",
			});
			if (data.success) {
				setSelectedLead(data.lead);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
				toast.success("Project created & lead closed as won");
				setShowProjectModal(false);
			}
		} catch (err: any) {
			toast.error(
				err?.response?.data?.message || "Failed to create project",
			);
		} finally {
			setCreatingProject(false);
		}
	};

	const handleCancelProject = () => {
		setShowProjectModal(false);
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
			const { data } = await api.put(
				`/leads/${selectedLead._id}`,
				payload,
			);
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
		if (
			createForm.email &&
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email)
		) {
			alert("Please enter a valid email address.");
			return;
		}
		if (
			createForm.phone &&
			!/^\d{10}$/.test(createForm.phone.replace(/\D/g, ""))
		) {
			alert("Please enter a valid 10-digit phone number.");
			return;
		}
		if (
			createForm.alternatePhone &&
			!/^\d{10}$/.test(createForm.alternatePhone.replace(/\D/g, ""))
		) {
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
		<div className="w-full max-w-[1200px] mx-auto">
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
				<div className="flex flex-wrap gap-2">
					<button
						className="btn btn-secondary"
						onClick={async () => {
							await Promise.all([
								queryClient.invalidateQueries({
									queryKey: ["leads"],
								}),
								queryClient.invalidateQueries({
									queryKey: ["campaigns"],
								}),
							]);
							toast.success("Refreshed");
						}}
						title="Refresh"
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						<RefreshCw size={16} /> Refresh
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
				className="overflow-x-auto hide-scrollbar"
				style={{
					display: "flex",
					gap: 4,
					marginBottom: 16,
					borderBottom: "1px solid var(--color-border)",
					paddingBottom: 0,
				}}
			>
				{(
					[
						{ key: "all", label: "All Queue" },
						{ key: "archived", label: "Archived" },
						{
							key: "meeting_scheduled",
							label: "Meeting Scheduled",
						},
						{ key: "closed_won", label: "Closed Won" },
					] as const
				).map((tab) => (
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
				className="flex flex-col items-start sm:items-center gap-2 w-full"
				// style={{
				// 	display: "flex",
				// 	flexDirection: "column",
				// 	gap: 12,
				// 	marginBottom: 20,
				// 	flexWrap: "wrap",
				// 	alignItems: "center",
				// }}
			>
				<div
					className="flex flex-wrap gap-2 w-full border border-(--color-border) rounded-md p-2 bg-(--color-surface) h-[60px]"
					style={{
						// flex: "1 1 280px",
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
						className="text-(--color-test-tertiary) bg-(--color-surface) w-full"
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
						onChange={(e) => {
							setSearchInput(e.target.value);
							setPage(1);
						}}
					/>
				</div>
				{/* Filters toggle button - only on small screens */}
				<button

					type="button"
					onClick={() => setShowFilters((prev) => !prev)}
					// className="lg:hidden flex items-center justify-center gap-2 w-full bg-(--color-primary)"
					// style={{
					// 	padding: "8px 12px",
					// 	fontSize: "0.82rem",
					// 	fontWeight: 600,
					// 	borderRadius: 8,
					// 	border: "1px solid var(--color-border)",
					// 	// background: "var(--color-surface)",
					// 	color: "var(--color-surface)",
					// 	cursor: "pointer",
					// }}
					className="flex bg-(--color-primary) text-(--color-border) rounded-lg p-2 text-md w-full lg:hidden items-center justify-center gap-2"
				>
					{showFilters ? (
						<X size={18} className="" />
					):(
						<Filter size={14} className="" />
					)}
					{showFilters ? "Close Filters" : "Filters"}
					
				</button>

				{/* Filters */}
				<div
					className={`${
						showFilters ? "flex" : "hidden"
					} lg:flex flex-row flex-wrap items-center justify-start gap-2`}
				>
					{/* campaign selection filter dropdown */}
					<select
						className="input flex-1 sm:max-w-[150px] min-w-[150px]"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterCampaign}
						onChange={(e) => setFilterCampaign(e.target.value)}
					>
						<option value="">All Campaigns</option>
						<option value="__none__">No Campaign</option>
						{campaigns.map((c: any) => (
							<option key={c._id} value={c._id}>
								{c.name}
							</option>
						))}
					</select>
					{/* Lead status filter dropdown */}
					<select
						className="input flex-1 sm:max-w-[150px] min-w-[140px]"
						style={{
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
					{/* industry filter dropdown */}
					<select
						className="input flex-1 sm:max-w-[150px] min-w-[140px]"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterIndustry}
						onChange={(e) => setFilterIndustry(e.target.value)}
					>
						<option value="">All Industries</option>
						{filterOptions.industries.map((ind: string) => (
							<option key={ind} value={ind}>
								{ind}
							</option>
						))}
					</select>
					{/* source filter dropdown */}
					<select
						className="input flex-1 sm:max-w-[150px] min-w-[150px]"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterSource}
						onChange={(e) => setFilterSource(e.target.value)}
					>
						<option value="">All Sources</option>
						{filterOptions.sources.map((src: string) => (
							<option key={src} value={src}>
								{src}
							</option>
						))}
					</select>
					{/* priority filter dropdown */}
					<select
						className="input flex-1 sm:max-w-[150px] min-w-[140px]"
						style={{
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
					{/* city filter dropdown */}
					<select
						className="input flex-1 sm:max-w-[150px] min-w-[130px]"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterCity}
						onChange={(e) => setFilterCity(e.target.value)}
					>
						<option value="">All Cities</option>
						{filterOptions.cities.map((c: string) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
					{/* state filter dropdown */}
					<select
						className="input flex-1 sm:max-w-[150px] min-w-[130px]"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterState}
						onChange={(e) => setFilterState(e.target.value)}
					>
						<option value="">All States</option>
						{filterOptions.states.map((s: string) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
					{/* pincode filter dropdown */}
					<select
						className="input flex-1 sm:max-w-[150px] min-w-[130px]"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
						}}
						value={filterPincode}
						onChange={(e) => setFilterPincode(e.target.value)}
					>
						<option value="">All Pincodes</option>
						{filterOptions.pincodes.map((p: string) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
					<button
						type="button"
						onClick={() => {
							setFilterCampaign("");
							setFilterStatus("");
							setFilterIndustry("");
							setFilterSource("");
							setFilterPriority("");
							setFilterCity("");
							setFilterState("");
							setFilterPincode("");
							setSearchInput("");
							setSearchQuery("");
							setActiveTab("all");
							setPage(1);
						}}
						className="flex items-center gap-1 bg-(--color-surface) border border-(--color-border) rounded-lg px-3 py-1.5 text-xs font-medium text-(--color-text-secondary) hover:bg-(--color-bg) transition-colors cursor-pointer"
					>
						<X size={12} />
						Reset Filters
					</button>
				</div>
				<div
				className="flex items-center gap-2 w-full justify-end mb-4 border-b border-(--color-border) pb-4"
					// style={{
					// 	display: "flex",
					// 	alignItems: "center",
					// 	justifyContent: "flex-end",
					// 	gap: 6,
					// 	marginBottom: 4,
					// }}
				>
					<span
						style={{
							fontSize: "0.78rem",
							color: "var(--color-text-tertiary)",
						}}
					>
						Leads Per Page
					</span>
					<select
						style={{
							padding: "4px 8px",
							fontSize: "0.8rem",
							borderRadius: 6,
							border: "1px solid var(--color-border)",
							// background: "white",
							background: "var(--color-surface)",
						}}
						value={pageSize}
						onChange={(e) => setPageSize(Number(e.target.value))}
					>
						<option value={10}>10</option>
						<option value={20}>20</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
						<option value={150}>150</option>
						<option value={200}>200</option>
						{/* i dont know how to work on this idea, i didnt even think of it taking help from the AI */}
						{/* <option value={}>All</option> */}
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
					leads.map((lead: any) => (
						<div
							key={lead._id}
							id={`lead-${lead._id}`}
							className="card animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between"
							style={{
								padding: 14,
								cursor: "pointer",
								border:
									selectedLead?._id === lead._id
										? "1px solid var(--color-primary)"
										: undefined,
							}}
							onClick={() => setSelectedLead(lead)}
						>
							<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
								<div>
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
										
									</div>
									<div
										className="flex flex-wrap items-center gap-x-4 gap-y-1"
										style={{
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

							<div className="flex items-center justify-between gap-3 sm:gap-4 mt-2 sm:mt-0">
								<div
									className="flex flex-row items-center sm:items-end gap-3"
									style={{
										fontSize: "0.7rem",
										color: "var(--color-text-tertiary)",
									}}
								>
									<span>Calls: {lead.callCount}</span>
									<span>F/U: {lead.followUpCount}</span>
									<span>Meet: {lead.meetingCount}</span>
									<span
										style={{
											color: "var(--color-text-secondary)",
										}}
									>
										{formatDateShort(lead.lastCallAt)}
									</span>
								</div>
								{/* {isAdmin && ( */}
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
								{/* )} */}
							</div>
						</div>
					))
				)}

				{totalPages > 1 && (
					<div
						className="flex items-center gap-3 flex-wrap"
						// className="flex flex-col sm:flex-row items-center gap-3 flex-wrap"
						style={{
							justifyContent: "center",
							padding: "16px 0",
						}}
					>
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
										: "var(--color-primary)",
								color:
									page <= 1
										? "var(--color-text-tertiary)"
										: "var(--color-border)",
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
										: "var(--color-primary)",
								color:
									page >= totalPages
										? "var(--color-text-tertiary)"
										: "var(--color-border)",
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
			<LeadDetailModal
				selectedLead={selectedLead}
				setSelectedLead={setSelectedLead}
				setUpdatingLead={setUpdatingLead}
				isAdmin={isAdmin}
				isManager={isManager}
				isCalling={isCalling}
				setIsCalling={setIsCalling}
				callDuration={callDuration}
				isEditingLead={isEditingLead}
				setIsEditingLead={setIsEditingLead}
				editForm={editForm}
				setEditForm={setEditForm}
				showAllContactDetails={showAllContactDetails}
				setShowAllContactDetails={setShowAllContactDetails}
				followupDate={followupDate}
				setFollowupDate={setFollowupDate}
				schedulingFollowup={schedulingFollowup}
				scheduleType={scheduleType}
				setScheduleType={setScheduleType}
				newNote={newNote}
				setNewNote={setNewNote}
				updatingLead={updatingLead}
				handleDeleteLead={handleDeleteLead}
				handleSaveLead={handleSaveLead}
				handleStatusChange={handleStatusChange}
				handleToggleCall={handleToggleCall}
				handleAddNote={handleAddNote}
				handleScheduleFollowup={handleScheduleFollowup}
				getInitials={getInitials}
				getCampaignName={getCampaignName}
				formatDate={formatDate}
				formatDateShort={formatDateShort}
				formatDuration={formatDuration}
			/>

			{showImportModal && (
				<div
					className="p-4 sm:p-6"
					style={{
						position: "fixed",
						inset: 0,
						backgroundColor: "rgba(0,0,0,0.4)",
						zIndex: 50,
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
					<div
						className="card animate-fade-in w-full max-w-[480px] mx-4"
						style={{
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
												style={{
													color: "var(--color-success)",
												}}
											/>
										) : (
											<AlertCircle
												size={24}
												style={{
													color: "var(--color-danger)",
												}}
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
										{importResult.imported !== 1
											? "s"
											: ""}{" "}
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
											background:
												"var(--color-danger-light)",
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
												(c: any) =>
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
											{campaigns.map((c: any) => (
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
					className="p-4 sm:p-6"
					style={{
						position: "fixed",
						inset: 0,
						backgroundColor: "rgba(0,0,0,0.4)",
						zIndex: 50,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
					onClick={() => setShowCreateForm(false)}
				>
					<div
						className="card animate-fade-in w-full max-w-[520px] mx-4 p-4 sm:p-7"
						style={{
							maxHeight: "90vh",
							overflowY: "auto",
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

							{/* Phone / Alternate Phone */}
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
										type="text"
										inputMode="numeric"
										maxLength={10}
										className="input"
										required
										value={createForm.phone}
										onChange={(e) => {
											const digitsOnly = e.target.value
												.replace(/\D/g, "")
												.slice(0, 10);
											setCreateForm((p) => ({
												...p,
												phone: digitsOnly,
											}));
										}}
									/>
									{createForm.phone &&
										createForm.phone.length !== 10 && (
											<span
												style={{
													fontSize: "0.7rem",
													color: "var(--color-danger)",
													marginTop: 3,
													display: "block",
												}}
											>
												Phone number must be exactly 10 digits
											</span>
										)}
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
										type="text"
										inputMode="numeric"
										maxLength={10}
										className="input"
										value={createForm.alternatePhone}
										onChange={(e) => {
											const digitsOnly = e.target.value
												.replace(/\D/g, "")
												.slice(0, 10);
											setCreateForm((p) => ({
												...p,
												alternatePhone: digitsOnly,
											}));
										}}
									/>
									{createForm.alternatePhone &&
										createForm.alternatePhone.length !== 10 && (
											<span
												style={{
													fontSize: "0.7rem",
													color: "var(--color-danger)",
													marginTop: 3,
													display: "block",
												}}
											>
												Alternate phone must be exactly 10 digits
											</span>
										)}
								</div>
							</div>

							{/* Email / Website */}
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

							{/* Company / Industry */}
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

							{/* Address Line - full width own row */}
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
									style={{ width: "100%" }}
									value={createForm.addressLine}
									onChange={(e) =>
										setCreateForm((p) => ({
											...p,
											addressLine: e.target.value,
										}))
									}
								/>
							</div>

							{/* City / State / Pincode */}
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
									<select
										className="input"
										value={createForm.state}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												state: e.target.value,
											}))
										}
									>
										<option value="">Select State</option>
										{INDIAN_STATES.map((s) => (
											<option key={s} value={s}>
												{s}
											</option>
										))}
									</select>
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
										type="text"
										inputMode="numeric"
										maxLength={6}
										className="input"
										value={createForm.pincode}
										onChange={(e) => handlePincodeChange(e.target.value)}
									/>
									{pincodeLoading && (
										<span
											style={{
												fontSize: "0.7rem",
												color: "var(--color-text-tertiary)",
												marginTop: 3,
												display: "block",
											}}
										>
											Looking up city/state...
										</span>
									)}
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
										<option value="very high">Very High</option>
										<option value="high">High</option>
										<option value="medium">Medium</option>
										<option value="low">Low</option>
									</select>
								</div>
							</div>

							{/* PAN / GST */}
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

							{/* Designation / Project */}
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
										Project *
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
										<option value="">Select Project</option>
										{campaigns.map((c: any) => (
											<option key={c._id} value={c._id}>
												{c.name}
											</option>
										))}
									</select>
									{!createForm.campaignId && (
										<span
											style={{
												fontSize: "0.7rem",
												color: "var(--color-danger)",
												marginTop: 3,
												display: "block",
											}}
										>
											Please select a project
										</span>
									)}
								</div>
							</div>

							{/* Priority */}
							{/* <div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								
							</div> */}

							<button
								className="btn btn-primary"
								style={{
									width: "100%",
									padding: 10,
									marginTop: 4,
								}}
								disabled={
									!createForm.name.trim() ||
									updatingLead ||
									!createForm.phone.trim() ||
									!/^\d{10}$/.test(createForm.phone.trim()) ||
									!createForm.campaignId
								}
								onClick={handleCreateLead}
							>
								{updatingLead ? (
									<Loader2 size={16} className="animate-spin" />
								) : null}
								{updatingLead ? "Creating..." : "Create Lead"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Create Project Modal on Closed Won */}
			{showProjectModal && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: "rgba(0,0,0,0.5)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 100,
					}}
					onClick={handleCancelProject}
				>
					<div
						className="card animate-fade-in"
						style={{
							width: "100%",
							maxWidth: 560,
							padding: 28,
							maxHeight: "90vh",
							overflow: "auto",
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
							<h2
								style={{
									fontSize: "1.125rem",
									fontWeight: 700,
									margin: 0,
								}}
							>
								Create Project from Lead
							</h2>
							<button
								onClick={handleCancelProject}
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									color: "var(--color-text-secondary)",
									padding: 4,
								}}
							>
								<X size={18} />
							</button>
						</div>

						<form
							onSubmit={(e) => {
								e.preventDefault();
								handleCreateProject();
							}}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 16,
							}}
						>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.8125rem",
										fontWeight: 500,
										marginBottom: 4,
										color: "var(--color-text-secondary)",
									}}
								>
									Title *
								</label>
								<input
									className="input"
									required
									value={projectForm.title}
									onChange={(e) =>
										setProjectForm((p) => ({
											...p,
											title: e.target.value,
										}))
									}
									placeholder="Project title"
								/>
							</div>

							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.8125rem",
										fontWeight: 500,
										marginBottom: 4,
										color: "var(--color-text-secondary)",
									}}
								>
									Company Name *
								</label>
								<input
									className="input"
									required
									value={projectForm.clientName}
									onChange={(e) =>
										setProjectForm((p) => ({
											...p,
											clientName: e.target.value,
										}))
									}
									placeholder="Company name"
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
											fontSize: "0.8125rem",
											fontWeight: 500,
											marginBottom: 4,
											color: "var(--color-text-secondary)",
										}}
									>
										Assignment Type
									</label>
									<select
										className="input"
										style={{ width: "100%" }}
										value={projectForm.assignmentType}
										onChange={(e) =>
											setProjectForm((p) => ({
												...p,
												assignmentType: e.target
													.value as any,
											}))
										}
									>
										<option value="transactional">
											Transactional
										</option>
										<option value="recurring">
											Recurring
										</option>
									</select>
								</div>
							</div>

							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.8125rem",
										fontWeight: 500,
										marginBottom: 4,
										color: "var(--color-text-secondary)",
									}}
								>
									Description
								</label>
								<textarea
									className="input"
									rows={3}
									value={projectForm.description}
									onChange={(e) =>
										setProjectForm((p) => ({
											...p,
											description: e.target.value,
										}))
									}
									placeholder="Description..."
									style={{ resize: "vertical" }}
								/>
							</div>

							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr 1fr",
									gap: 12,
								}}
							>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.8125rem",
											fontWeight: 500,
											marginBottom: 4,
											color: "var(--color-text-secondary)",
										}}
									>
										Priority
									</label>
									<select
										className="input"
										style={{ width: "100%" }}
										value={projectForm.priority}
										onChange={(e) =>
											setProjectForm((p) => ({
												...p,
												priority: e.target.value as any,
											}))
										}
									>
										<option value="low">Low</option>
										<option value="medium">Medium</option>
										<option value="high">High</option>
										<option value="urgent">Urgent</option>
									</select>
								</div>

								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.8125rem",
											fontWeight: 500,
											marginBottom: 4,
											color: "var(--color-text-secondary)",
										}}
									>
										Start Date *
									</label>
									<input
										type="date"
										className="input"
										style={{ width: "100%" }}
										required
										value={projectForm.startDate}
										onChange={(e) =>
											setProjectForm((p) => ({
												...p,
												startDate: e.target.value,
											}))
										}
									/>
								</div>

								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.8125rem",
											fontWeight: 500,
											marginBottom: 4,
											color: "var(--color-text-secondary)",
										}}
									>
										Due Date
									</label>
									<input
										type="date"
										className="input"
										style={{ width: "100%" }}
										disabled={projectForm.noDueDate}
										value={projectForm.dueDate}
										onChange={(e) =>
											setProjectForm((p) => ({
												...p,
												dueDate: e.target.value,
											}))
										}
									/>
									<div
										style={{
											marginTop: 6,
											display: "flex",
											alignItems: "center",
											gap: 6,
										}}
									>
										<input
											type="checkbox"
											id="noDueDate"
											checked={projectForm.noDueDate}
											onChange={(e) =>
												setProjectForm((p) => ({
													...p,
													noDueDate: e.target.checked,
													dueDate: e.target.checked
														? ""
														: p.dueDate,
												}))
											}
										/>
										<label
											htmlFor="noDueDate"
											style={{
												fontSize: "0.75rem",
												color: "var(--color-text-secondary)",
												cursor: "pointer",
											}}
										>
											No due date
										</label>
									</div>
								</div>
							</div>

							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.8125rem",
										fontWeight: 500,
										marginBottom: 8,
										color: "var(--color-text-secondary)",
									}}
								>
									Add Members
								</label>
								<div
									style={{
										display: "flex",
										flexWrap: "wrap",
										gap: 8,
										maxHeight: 120,
										overflowY: "auto",
										padding: "6px 0",
									}}
								>
									{allUsers.length === 0 && (
										<span
											style={{
												fontSize: "0.8rem",
												color: "var(--color-text-tertiary)",
											}}
										>
											Loading members...
										</span>
									)}
									{allUsers.map((user: any) => (
										<label
											key={user._id}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												fontSize: "0.8rem",
												cursor: "pointer",
												padding: "4px 8px",
												borderRadius: 6,
												background:
													projectForm.team.includes(
														user._id,
													)
														? "var(--color-primary-light)"
														: "transparent",
												border: "1px solid var(--color-border)",
											}}
										>
											<input
												type="checkbox"
												checked={projectForm.team.includes(
													user._id,
												)}
												onChange={() =>
													setProjectForm((p) => ({
														...p,
														team: p.team.includes(
															user._id,
														)
															? p.team.filter(
																	(id) =>
																		id !==
																		user._id,
																)
															: [
																	...p.team,
																	user._id,
																],
													}))
												}
											/>
											{user.name || user.email}
										</label>
									))}
								</div>
							</div>

							<div
								style={{
									marginTop: 24,
									display: "flex",
									gap: 12,
								}}
							>
								<button
									type="button"
									className="btn btn-secondary"
									style={{ flex: 1 }}
									onClick={handleCancelProject}
									disabled={creatingProject}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="btn btn-primary"
									style={{ flex: 1 }}
									disabled={
										creatingProject ||
										!projectForm.title.trim() ||
										!projectForm.clientName.trim()
									}
								>
									{creatingProject ? (
										<Loader2
											size={16}
											className="animate-spin"
										/>
									) : null}
									{creatingProject
										? "Creating..."
										: "Create Project"}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
};

export default DialQueue;
