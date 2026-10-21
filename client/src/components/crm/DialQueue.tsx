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
import { apiUrl } from "../../lib/urls";
import Modal from "../common/Modal";
import { useAuthStore } from "../../store/authStore";
import toast from "react-hot-toast";
import { useCrmSocket } from "../../hooks/useCrmSocket";
import LeadDetailModal, {
	PRIORITY_COLORS,
	STATUS_BADGE,
	STATUS_OPTIONS,
} from "./LeadDetailModal";

interface Database {
	_id: string;
	name: string;
}

interface PartnerOption {
	_id: string;
	companyName?: string;
	name?: string;
	personName: string;
	partnerType?: string;
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
	mode?: "virtual" | "physical";
	location?: string;
	link?: string;
}

export interface Lead {
	_id: string;
	databaseId: Database | string;
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
	sourceType?: "udyam" | "self" | "partner";
	partnerId?: { _id: string; companyName?: string; name?: string; personName?: string; partnerType?: string } | string;
	product?: string;
	productId?: { _id: string; name: string } | string | null;
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
	meetingMode?: "virtual" | "physical";
	meetingLocation?: string;
	meetingLink?: string;
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

// Applied-filter highlight: an indigo ring + tint on a dropdown so a
// forgotten filter stands out at a glance.
const APPLIED_FILTER_STYLE = {
	borderColor: "var(--color-primary)",
	boxShadow: "0 0 0 2px rgba(99, 102, 241, 0.14)",
	background: "var(--color-primary-light)",
	color: "var(--color-primary)",
	fontWeight: 600,
};



const DialQueue = () => {
	const { user: currentUser } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const isAdmin = currentUser?.role === "admin";
	const isManager = currentUser?.role === "manager";
	useCrmSocket();

	const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
	const [filterDatabase, setFilterDatabase] = useState("");
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

	// How many dropdown filters are currently applied — drives the highlight
	// on the Filters button and the per-select styling, so a forgotten filter
	// is obvious at a glance.
	const activeFilterCount = [
		filterDatabase,
		filterStatus,
		filterIndustry,
		filterSource,
		filterPriority,
		filterCity,
		filterState,
		filterPincode,
	].filter(Boolean).length;

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
		"database" | "upload" | "result"
	>("database");
	const [importDatabaseId, setImportDatabaseId] = useState("");
	const [importResult, setImportResult] = useState<{
		imported: number;
		errors: any[];
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [newNote, setNewNote] = useState("");
	const [updatingLead, setUpdatingLead] = useState(false);
	const [isCalling, setIsCalling] = useState(false);
	const [callDuration, setCallDuration] = useState(0);

	const [showAllContactDetails, setShowAllContactDetails] = useState(false);
	const [isEditingLead, setIsEditingLead] = useState(false);
	const [editForm, setEditForm] = useState<
		Record<string, string | undefined>
	>({});

	const [showConvertModal, setShowConvertModal] = useState(false);
	const [convertingLead, setConvertingLead] = useState(false);
	const [convertForm, setConvertForm] = useState({
		productId: "",
		notes: "",
	});

	// Products for the Convert Lead modal — the docs checklist template source
	const { data: loanProducts = [] } = useQuery<any[]>({
		queryKey: ["loan-products"],
		queryFn: async () => {
			const res = await api.get("/loan-products");
			return res.data.products || [];
		},
		enabled: showConvertModal,
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
		databaseId: "",
		priority: "medium" as Lead["priority"],
		sourceType: "udyam" as "udyam" | "self" | "partner",
		partnerId: "",
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
			filterDatabase,
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
			filterDatabase,
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
				if (filterDatabase) params.databaseId = filterDatabase;
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

	const { data: databases = [] } = useQuery({
		queryKey: ["databases"],
		queryFn: async () => {
			const { data } = await api.get("/databases");
			return data.success ? data.databases : [];
		},
	});

	const { data: partners = [] } = useQuery({
		queryKey: ["partners"],
		queryFn: async () => {
			const { data } = await api.get("/partners");
			return (data.success ? data.partners : []) as PartnerOption[];
		},
	});

	const filterOptionsContext = useMemo(
		() => ({
			filterDatabase,
			searchQuery,
			tabStatus: getTabStatusParam(activeTab),
		}),
		[filterDatabase, searchQuery, activeTab],
	);

	const { data: filterOptions = { industries: [], sources: [], cities: [], states: [], pincodes: [] } } =
		useQuery({
			queryKey: ["leads", "filter-options", filterOptionsContext],
			queryFn: async () => {
				const params: any = {};
				if (filterDatabase) params.databaseId = filterDatabase;
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
			filterDatabase,
			searchQuery,
			filterIndustry,
			filterSource,
			filterPriority,
			filterCity,
			filterState,
			filterPincode,
		}),
		[
			filterDatabase,
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
			if (filterDatabase) params.databaseId = filterDatabase;
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
		filterDatabase,
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

	// Set database filter from URL param (e.g. from Databases page card click)
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const databaseId = params.get("databaseId");
		if (databaseId) {
			setFilterDatabase(databaseId);
			navigate("/crm/dial", { replace: true });
		}
	}, [location.search]);

	// Set status filter from URL param (e.g. from Leads Overview status tiles)
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const status = params.get("status");
		if (status) {
			// Tab filters override the status dropdown — reset to "all" so the
			// requested status actually applies.
			setActiveTab("all");
			setFilterStatus(status);
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

	const getDatabaseName = (databaseId: any): string => {
		if (!databaseId) return "—";
		if (typeof databaseId === "object" && databaseId.name)
			return databaseId.name;
		const found = databases.find((c: any) => c._id === databaseId);
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
		if (status === "closed_won" && selectedLead) {
			setConvertForm({ productId: "", notes: "" });
			setShowConvertModal(true);
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

	const handleConvertLead = async () => {
		if (!selectedLead) return;
		setConvertingLead(true);
		try {
			const { data } = await api.post("/case-files", {
				leadId: selectedLead._id,
				productId: convertForm.productId || undefined,
				notes: convertForm.notes.trim() || undefined,
			});
			if (data.success) {
				setSelectedLead((prev) =>
					prev ? { ...prev, status: "closed_won" } : prev,
				);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
				queryClient.invalidateQueries({ queryKey: ["case-files"] });
				queryClient.invalidateQueries({ queryKey: ["case-file-stats"] });
				toast.success("Lead converted — tracked in Files");
				setShowConvertModal(false);
			}
		} catch (err: any) {
			toast.error(
				err?.response?.data?.message || "Failed to convert lead",
			);
		} finally {
			setConvertingLead(false);
		}
	};

	const handleCancelConvert = () => {
		setShowConvertModal(false);
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

	const handleUpdateNote = async (noteId: string, text: string) => {
		if (!text.trim() || !selectedLead) return;
		try {
			const { data } = await api.put(
				`/leads/${selectedLead._id}/notes/${noteId}`,
				{ text: text.trim() },
			);
			if (data.success) {
				setSelectedLead(data.lead);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
				toast.success("Note updated");
			}
		} catch (err: any) {
			console.error("Failed to update note", err);
			toast.error(err.response?.data?.message || "Failed to update note");
			throw err;
		}
	};

	const handleDeleteNote = async (noteId: string) => {
		if (!selectedLead) return;
		try {
			const { data } = await api.delete(
				`/leads/${selectedLead._id}/notes/${noteId}`,
			);
			if (data.success) {
				setSelectedLead(data.lead);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
				toast.success("Note deleted");
			}
		} catch (err: any) {
			console.error("Failed to delete note", err);
			toast.error(err.response?.data?.message || "Failed to delete note");
			throw err;
		}
	};

	const handleCreateLead = async () => {
		if (!createForm.name.trim()) return;
		if (createForm.sourceType !== "partner" && !createForm.databaseId) {
			alert("Please select a project before creating a lead.");
			return;
		}
		if (createForm.sourceType === "partner" && !createForm.partnerId) {
			alert("Please select a partner for partner-sourced leads.");
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
		const payload: any = Object.fromEntries(
			Object.entries(createForm).filter(([_, v]) => v !== ""),
		);
		if (payload.sourceType !== "partner") delete payload.partnerId;
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
					databaseId: "",
					priority: "medium",
					sourceType: "udyam",
					partnerId: "",
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
		if (editForm.sourceType === "partner" && !editForm.partnerId) {
			alert("Please select a partner for partner-sourced leads.");
			return;
		}
		setUpdatingLead(true);
		try {
			// "" means "No database" — send null so the lead is unassigned
			// instead of failing ObjectId validation server-side.
			const payload: Record<string, string | null | undefined> = {
				...editForm,
				databaseId: editForm.databaseId || null,
				partnerId: editForm.sourceType === "partner" ? (editForm.partnerId || null) : null,
			};
			const { data } = await api.put(
				`/leads/${selectedLead._id}`,
				payload,
			);
			if (data.success) {
				setSelectedLead(data.lead);
				setIsEditingLead(false);
				queryClient.invalidateQueries({ queryKey: ["leads"] });
				queryClient.invalidateQueries({ queryKey: ["databases"] });
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
			formData.append("databaseId", importDatabaseId || "");

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
		<div className="w-full max-w-300 mx-auto">
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
						Leads / Dial Queue
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
									queryKey: ["databases"],
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
					className="flex flex-wrap gap-2 w-full border border-(--color-border) rounded-md p-2 bg-(--color-surface) h-15"
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
					title={activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} applied` : "Show filters"}
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
					{activeFilterCount > 0 && (
						<span
							style={{
								background: "var(--color-surface)",
								color: "var(--color-primary)",
								borderRadius: 999,
								minWidth: 20,
								height: 20,
								padding: "0 6px",
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "0.72rem",
								fontWeight: 800,
							}}
						>
							{activeFilterCount}
						</span>
					)}
					
				</button>

				{/* Filters */}
				<div
					className={`${
						showFilters ? "flex" : "hidden"
					} lg:flex flex-row flex-wrap items-center justify-start gap-2`}
				>
					{/* database selection filter dropdown */}
					<select
						className="input flex-1 sm:max-w-37.5 min-w-37.5 cursor-pointer"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
							...(filterDatabase ? APPLIED_FILTER_STYLE : {}),
						}}
						value={filterDatabase}
						onChange={(e) => setFilterDatabase(e.target.value)}
					>
						<option value="">All Databases</option>
						<option value="__none__">No Database</option>
						{databases.map((c: any) => (
							<option key={c._id} value={c._id}>
								{c.name}
							</option>
						))}
					</select>
					{/* Lead status filter dropdown */}
					<select
						className="input flex-1 sm:max-w-37.5 min-w-35 cursor-pointer"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
							...(filterStatus ? APPLIED_FILTER_STYLE : {}),
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
						className="input flex-1 sm:max-w-37.5 min-w-35 cursor-pointer"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
							...(filterIndustry ? APPLIED_FILTER_STYLE : {}),
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
						className="input flex-1 sm:max-w-37.5 min-w-37.5 cursor-pointer"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
							...(filterSource ? APPLIED_FILTER_STYLE : {}),
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
						className="input flex-1 sm:max-w-37.5 min-w-35 cursor-pointer"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
							...(filterPriority ? APPLIED_FILTER_STYLE : {}),
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
						className="input flex-1 sm:max-w-37.5 min-w-32.5 cursor-pointer"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
							...(filterCity ? APPLIED_FILTER_STYLE : {}),
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
						className="input flex-1 sm:max-w-37.5 min-w-32.5 cursor-pointer"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
							...(filterState ? APPLIED_FILTER_STYLE : {}),
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
						className="input flex-1 sm:max-w-37.5 min-w-32.5 cursor-pointer"
						style={{
							padding: "6px 10px",
							fontSize: "0.8rem",
							...(filterPincode ? APPLIED_FILTER_STYLE : {}),
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
							setFilterDatabase("");
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
						className="flex items-center gap-1 bg-(--color-surface) border border-(--color-border) rounded-lg px-3 py-1.5 text-xs font-medium text-(--color-text-secondary) hover:bg-(--color-bg) hover:text-(--color-text) transition-colors cursor-pointer"
						style={activeFilterCount > 0 ? { borderColor: "var(--color-primary)", color: "var(--color-primary)" } : undefined}
					>
						<X size={12} />
						Reset Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
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
				newNote={newNote}
				setNewNote={setNewNote}
				updatingLead={updatingLead}
				handleDeleteLead={handleDeleteLead}
				handleSaveLead={handleSaveLead}
				handleStatusChange={handleStatusChange}
				handleToggleCall={handleToggleCall}
				handleAddNote={handleAddNote}
				handleUpdateNote={handleUpdateNote}
				handleDeleteNote={handleDeleteNote}
				currentUserId={currentUser?._id}
				currentUserName={currentUser?.name}
				partners={partners}
				getInitials={getInitials}
				getDatabaseName={getDatabaseName}
				databases={databases}
				formatDate={formatDate}
				formatDateShort={formatDateShort}
				formatDuration={formatDuration}
			/>

			<Modal isOpen={showImportModal} onClose={() => { setShowImportModal(false); setImportResult(null); setImportStep("database"); setImportDatabaseId(""); }} zIndex={4950}>
					<div
						className="card animate-fade-in w-full"
						style={{
							maxWidth: "min(480px, calc(100vw - 32px))",
							padding: 0,
							overflow: "hidden",
							borderRadius: 16,
							maxHeight: "90vh",
							overflowY: "auto",
						}}
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
										{importStep === "database"
											? "Select a target database"
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
									setImportStep("database");
									setImportDatabaseId("");
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
										setImportStep("database");
										setImportDatabaseId("");
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
											setImportStep("database");
											setImportResult(null);
										}}
									>
										← Back
									</button>
									{importDatabaseId && (
										<span
											style={{
												fontSize: "0.78rem",
												color: "var(--color-text-secondary)",
											}}
										>
											Database:{" "}
											{databases.find(
												(c: any) =>
													c._id === importDatabaseId,
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
									href={apiUrl("/leads/import/sample")}
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
								{databases.length === 0 ? (
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
											No databases yet
										</h4>
										<p
											style={{
												fontSize: "0.78rem",
												color: "var(--color-text-secondary)",
												margin: "0 0 20px",
											}}
										>
											Create a database before importing
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
												navigate("/crm/databases");
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
											Select Database
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
											value={importDatabaseId}
											onChange={(e) =>
												setImportDatabaseId(
													e.target.value,
												)
											}
										>
											<option value="">
												No Database
											</option>
											{databases.map((c: any) => (
												<option
													key={c._id}
													value={c._id}
												>
													{c.name}
												</option>
											))}
										</select>
										<button
											disabled={!importDatabaseId}
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
			</Modal>

			<Modal isOpen={showCreateForm} onClose={() => setShowCreateForm(false)} zIndex={4950}>
					<div
						className="card animate-fade-in w-full p-4 sm:p-7"
						style={{
							maxWidth: "min(520px, calc(100vw - 32px))",
							maxHeight: "90vh",
							overflowY: "auto",
						}}
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
									Name <span className="text-danger">*</span>
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
										Phone <span className="text-danger">*</span>
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
										onChange={(e) => {
											const gst = e.target.value.toUpperCase();
											const g = gst.replace(/\s/g, "");
											const derived =
												g.length === 15 &&
												/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(g.slice(2, 12))
													? g.slice(2, 12)
													: "";
											setCreateForm((p) => ({
												...p,
												companyGst: gst,
												...(derived ? { companyPan: derived } : {}),
											}));
										}}
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
										Lead Source (selected default)
									</label>
									<select
										className="input"
										value={createForm.sourceType}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												sourceType: e.target.value as "udyam" | "self" | "partner",
												partnerId: e.target.value === "partner" ? p.partnerId : "",
												databaseId: e.target.value === "partner" ? "" : p.databaseId,
											}))
										}
									>
										<option value="udyam">Udyam Capital</option>
										<option value="self">Self ({currentUser?.name || "Me"})</option>
										<option value="partner">Partner</option>
									</select>
								</div>
							</div>

							{createForm.sourceType === "partner" && (
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Select Partner
									</label>
									<select
										className="input"
										value={createForm.partnerId}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												partnerId: e.target.value,
											}))
										}
									>
										<option value="">Select Partner</option>
										{partners.map((pt: PartnerOption) => (
											<option key={pt._id} value={pt._id}>
												{pt.companyName || pt.name || pt.personName}
												{pt.partnerType ? ` (${pt.partnerType})` : ""}
											</option>
										))}
									</select>
									{!createForm.partnerId && (
										<span
											style={{
												fontSize: "0.7rem",
												color: "var(--color-danger)",
												marginTop: 3,
												display: "block",
											}}
										>
											Please select a partner
										</span>
									)}
								</div>
							)}

							{createForm.sourceType !== "partner" && (
							/* Project */
							<div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "0.75rem",
											color: "var(--color-text-secondary)",
											marginBottom: 4,
										}}
									>
										Database <span className="text-danger">*</span>
									</label>
									<select
										className="input"
										value={createForm.databaseId}
										onChange={(e) =>
											setCreateForm((p) => ({
												...p,
												databaseId: e.target.value,
											}))
										}
									>
										<option value="">Select Project</option>
										{databases.map((c: any) => (
											<option key={c._id} value={c._id}>
												{c.name}
											</option>
										))}
									</select>
								</div>
							</div>
							)}

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
									(createForm.sourceType !== "partner" && !createForm.databaseId) ||
									(createForm.sourceType === "partner" && !createForm.partnerId)
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
			</Modal>

			{/* Convert Lead Modal on Closed Won (can open above the lead modal, hence +10) */}
			<Modal
				isOpen={showConvertModal}
				onClose={handleCancelConvert}
				zIndex={4960}
			>
				<div
					className="card animate-fade-in"
					style={{
						width: "min(560px, calc(100vw - 32px))",
						padding: 28,
						maxHeight: "90vh",
						overflow: "auto",
					}}
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
							Convert Lead
						</h2>
						<button
							onClick={handleCancelConvert}
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

					<div
						style={{
							padding: "10px 12px",
							borderRadius: 10,
							background: "var(--color-surface-hover)",
							marginBottom: 16,
							fontSize: "0.875rem",
							color: "var(--color-text-secondary)",
						}}
					>
						<strong style={{ color: "var(--color-text)" }}>
							{selectedLead?.name || "Lead"}
						</strong>
						{selectedLead?.companyName
							? ` · ${selectedLead.companyName}`
							: ""}
						{selectedLead?.phone ? ` · ${selectedLead.phone}` : ""}
					</div>

					<form
						onSubmit={(e) => {
							e.preventDefault();
							handleConvertLead();
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
								Loan Product
							</label>
							<select
								className="select"
								value={convertForm.productId}
								onChange={(e) =>
									setConvertForm((p) => ({
										...p,
										productId: e.target.value,
									}))
								}
							>
								<option value="">
									No product yet — set it later in Files
								</option>
								{loanProducts
									.filter((p: any) => p.isActive)
									.map((p: any) => (
										<option key={p._id} value={p._id}>
											{p.name}
										</option>
									))}
							</select>
							<p
								style={{
									margin: "6px 0 0",
									fontSize: "0.75rem",
									color: "var(--color-text-tertiary)",
								}}
							>
								The required-document checklist is copied from this
								product's Docs Structure — manage doc statuses later
								on the Files page.
							</p>
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
								Note (optional)
							</label>
							<textarea
								className="input"
								rows={3}
								value={convertForm.notes}
								onChange={(e) =>
									setConvertForm((p) => ({
										...p,
										notes: e.target.value,
									}))
								}
								placeholder="Anything to remember about this file"
							/>
						</div>

						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								gap: 10,
								marginTop: 4,
							}}
						>
							<button
								type="button"
								className="btn btn-secondary"
								onClick={handleCancelConvert}
							>
								Cancel
							</button>
							<button
								type="submit"
								className="btn btn-primary"
								disabled={convertingLead}
							>
								{convertingLead ? (
									<Loader2
										size={16}
										className="animate-spin"
									/>
								) : null}
								{convertingLead ? "Converting..." : "Convert Lead"}
							</button>
						</div>
					</form>
				</div>
			</Modal>
		</div>
	);
};

export default DialQueue;
