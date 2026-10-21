import { useState, useEffect } from "react";
import {
	Plus,
	X,
	Handshake,
	Calendar,
	Loader2,
	Trash2,
	Pencil,
	Search,
	Upload,
	Download,
	AlertCircle,
	CheckCircle,
	Phone,
	Mail,
	Building2,
	User as UserIcon,
	FileText,
	ExternalLink,
	RefreshCw,
	Tag,
} from "lucide-react";
import {
	useQuery,
	useMutation,
	useQueryClient,
	keepPreviousData,
} from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import {
	API_BASE_URL,
	apiUrl,
	joinUrl,
	stripTrailingSlashes,
} from "../../lib/urls";
import Modal from "../common/Modal";
import FilePreviewModal from "../common/FilePreviewModal";
import ToggleSwitch from "../common/ToggleSwitch";
import { useAuthStore } from "../../store/authStore";
import { useCrmSocket } from "../../hooks/useCrmSocket";
import toast from "react-hot-toast";

interface Partner {
	_id: string;
	companyName?: string;
	// legacy
	name?: string;
	personName: string;
	phone?: string;
	email?: string;
	pan?: string;
	gst?: string;
	partnerType: "company" | "individual";
	purpose?: string;
	description?: string;
	agreementFilePath?: string;
	agreementOriginalName?: string;
	agreementFileType?: string;
	agreementFileName?: string;
	agreementSigned?: boolean;
	isCA?: boolean;
	people?: { _id: string; name: string }[];
	createdBy: { _id: string; name: string; email: string; avatar?: string };
	createdAt: string;
	leadCount?: number;
}

interface Lead {
	_id: string;
	name: string;
	phone?: string;
	companyName?: string;
	status: string;
	source?: string;
	product?: string;
}

const apiBase = API_BASE_URL;
const FILE_BASE = stripTrailingSlashes(
	(import.meta.env.VITE_SOCKET_URL as string) ||
		apiBase.replace(/\/api$/, ""),
);

// Tenant-checked download URL for agreements (requires auth header, which
// FilePreviewModal now sends). Falls back to the public path when only
// the legacy path is known.
const agreementUrl = (p: Partner): string => {
	if (p.agreementFileName)
		return apiUrl(`/files/by-name/${encodeURIComponent(p.agreementFileName)}`);
	return p.agreementFilePath ? joinUrl(FILE_BASE, p.agreementFilePath) : "";
};

// GSTIN chars 3–12 are the holder's PAN (e.g. 27ABCDE1234F1Z5 → ABCDE1234F)
const panFromGst = (gst: string): string => {
	const g = gst.toUpperCase().replace(/\s/g, "");
	if (g.length !== 15) return "";
	const pan = g.slice(2, 12);
	return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : "";
};

// Quick-add parsing: one lead per line, fields separated by tab (Excel paste),
// semicolon or comma. Field order: Name, Phone, Company.
interface ParsedQuickLead {
	row: number;
	name: string;
	phone?: string;
	companyName?: string;
	error?: string;
}

const splitLeadLine = (line: string): string[] => {
	if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
	if (line.includes(";")) return line.split(";").map((s) => s.trim());
	if (line.includes(",")) return line.split(",").map((s) => s.trim());
	return [line.trim()];
};

const parseQuickAddLines = (text: string): ParsedQuickLead[] => {
	const seenPhones = new Set<string>();
	const parsed: ParsedQuickLead[] = [];
	text.split("\n").forEach((rawLine, lineIdx) => {
		const line = rawLine.trim();
		if (!line) return;
		const parts = splitLeadLine(line);
		const name = (parts[0] || "").trim();
		const rawPhone = (parts[1] || "").trim();
		const companyName = parts.slice(2).join(", ").trim();
		const phone = rawPhone.replace(/\D/g, "");
		const base: ParsedQuickLead = {
			row: lineIdx + 1,
			name,
			phone: phone || undefined,
			companyName: companyName || undefined,
		};
		if (!name) {
			parsed.push({ ...base, error: "Name is required" });
			return;
		}
		if (rawPhone && phone.length !== 10) {
			parsed.push({
				...base,
				error: `Invalid phone "${rawPhone}" (must be 10 digits)`,
			});
			return;
		}
		if (phone && seenPhones.has(phone)) {
			parsed.push({ ...base, error: `Duplicate phone: ${phone}` });
			return;
		}
		if (phone) seenPhones.add(phone);
		parsed.push(base);
	});
	return parsed;
};

// Mirrors the server guard: PDF/DOC/DOCX/JPG/PNG/WEBP, max 10MB (type AND extension must match)
const AGREEMENT_MAX_BYTES = 10 * 1024 * 1024;
const agreementError = (file: File): string | null => {
	const ext = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
	const okType = [
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"image/jpeg",
		"image/png",
		"image/webp",
	].includes(file.type);
	const okExt = [
		".pdf",
		".doc",
		".docx",
		".jpg",
		".jpeg",
		".png",
		".webp",
	].includes(ext);
	if (!okType || !okExt)
		return `Only PDF, DOC, DOCX, JPG, PNG or WEBP allowed (got "${file.name}")`;
	if (file.size > AGREEMENT_MAX_BYTES)
		return `File exceeds 10MB (got ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
	return null;
};

const emptyForm = {
	partnerType: "company" as "company" | "individual",
	companyName: "",
	personName: "",
	phone: "",
	email: "",
	pan: "",
	gst: "",
	purpose: "",
	description: "",
	isCA: false,
	agreementSigned: false,
};

const Partners = () => {
	const { user: currentUser } = useAuthStore();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	useCrmSocket();

	const [showCreateModal, setShowCreateModal] = useState(false);
	const [form, setForm] = useState(emptyForm);
	const [agreementFile, setAgreementFile] = useState<File | null>(null);
	const [removeAgreement, setRemoveAgreement] = useState(false);
	const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
	const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
		null,
	);
	const [leadSearch, setLeadSearch] = useState("");
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [quickAddText, setQuickAddText] = useState("");
	const [quickAddProduct, setQuickAddProduct] = useState("");
	const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);
	const [quickAddResult, setQuickAddResult] = useState<{
		added: number;
		skipped: number;
		errors: { row: number; message: string }[];
	} | null>(null);
	const [showLeadImport, setShowLeadImport] = useState(false);
	const [leadImporting, setLeadImporting] = useState(false);
	const [leadImportProduct, setLeadImportProduct] = useState("");
	const [leadImportResult, setLeadImportResult] = useState<{
		imported: number;
		errors: { row: number; message: string }[];
	} | null>(null);
	const [showImportModal, setShowImportModal] = useState(false);
	const [importing, setImporting] = useState(false);
	const [importResult, setImportResult] = useState<{
		imported: number;
		errors: any[];
	} | null>(null);
	const [deletingPartner, setDeletingPartner] = useState<Partner | null>(
		null,
	);
	const [previewFile, setPreviewFile] = useState<{
		url: string;
		type: string;
		name: string;
	} | null>(null);
	const [page, setPage] = useState(1);
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [caOnly, setCaOnly] = useState(false);
	const PAGE_SIZE = 12;

	useEffect(() => {
		// Debounced search: commit the trimmed query 350ms after typing stops.
		// Keeps the input responsive while avoiding a request per keystroke.
		const t = setTimeout(() => {
			const next = searchInput.trim();
			setSearchQuery((prev) => (prev === next ? prev : next));
			setPage(1);
		}, 350);
		return () => clearTimeout(t);
	}, [searchInput]);

	useEffect(() => {
		// Fresh lead filter each time a partner is opened in the details modal
		setLeadSearch("");
	}, [selectedPartnerId]);

	const {
		data: partnersData = { partners: [], total: 0, totalPages: 1 },
		isLoading,
		isFetching,
	} = useQuery({
		queryKey: ["partners", page, searchQuery, caOnly],
		queryFn: async () => {
			const params: any = { page, limit: PAGE_SIZE };
			if (searchQuery) params.search = searchQuery;
			if (caOnly) params.isCA = "true";
			const res = await api.get("/partners", { params });
			return {
				partners: (res.data.success
					? res.data.partners
					: []) as Partner[],
				total: res.data.total ?? 0,
				totalPages: res.data.totalPages || 1,
			};
		},
		// Keep the previous page visible while the next one loads so the
		// search input is never unmounted (it would lose focus mid-typing).
		placeholderData: keepPreviousData,
		// Safety net for changes made outside the app (e.g. direct database
		// edits in Compass). In-app changes arrive instantly via sockets.
		refetchInterval: 10000,
	});

	const partners = partnersData.partners;
	const total = partnersData.total;
	const totalPages = partnersData.totalPages;

	useEffect(() => {
		if (page > totalPages && totalPages > 0) setPage(totalPages);
	}, [page, totalPages]);

	const { data: selectedPartner = null } = useQuery({
		queryKey: ["partner", selectedPartnerId],
		queryFn: async () => {
			if (!selectedPartnerId) return null;
			const hit = partners.find((p) => p._id === selectedPartnerId);
			if (hit) return hit;
			const res = await api.get(`/partners/${selectedPartnerId}`);
			return (
				res.data.success ? res.data.partner : null
			) as Partner | null;
		},
		enabled: !!selectedPartnerId,
		refetchInterval: 10000,
	});

	const { data: partnerLeads = [], isLoading: leadsLoading } = useQuery({
		queryKey: ["partner-leads", selectedPartnerId],
		queryFn: async () => {
			if (!selectedPartnerId) return [];
			const { data } = await api.get("/leads", {
				params: { partnerId: selectedPartnerId },
			});
			return (data.success ? data.leads : []) as Lead[];
		},
		enabled: !!selectedPartnerId,
		refetchInterval: 10000,
	});

	// Product suggestions for partner leads (quick add + import)
	const { data: leadProducts = [] } = useQuery<any[]>({
		queryKey: ["loan-products"],
		queryFn: async () => {
			const res = await api.get("/loan-products");
			return res.data.products || [];
		},
		enabled: showQuickAdd || showLeadImport,
	});

	// Active catalog products, offered as a proper dropdown wherever a
	// partner lead needs a product (quick add + import fallback).
	const activeProductOptions = leadProducts.filter(
		(p: any) => p.isActive !== false,
	);

	const partnerDisplayName = (p: Partner) =>
		p.companyName || p.name || p.personName;

	const buildFormData = () => {
		const fd = new FormData();
		fd.append("partnerType", form.partnerType);
		fd.append("companyName", form.companyName.trim());
		fd.append("personName", form.personName.trim());
		fd.append("phone", form.phone.trim());
		fd.append("email", form.email.trim());
		fd.append("pan", form.pan.trim());
		fd.append("gst", form.gst.trim());
		fd.append("purpose", form.purpose.trim());
		fd.append("description", form.description.trim());
		fd.append("isCA", form.isCA ? "true" : "false");
		fd.append("agreementSigned", form.agreementSigned ? "true" : "false");
		// A pending file is only submitted when the user says an agreement is signed
		if (agreementFile && form.agreementSigned)
			fd.append("agreement", agreementFile);
		const hadStoredAgreement = !!(
			editingPartner?.agreementFileName ||
			editingPartner?.agreementFilePath
		);
		if (
			editingPartner &&
			(removeAgreement || (!form.agreementSigned && hadStoredAgreement))
		) {
			fd.append("removeAgreement", "true");
		}
		return fd;
	};

	const formValid = () => {
		if (!form.personName.trim()) return false;
		if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) return false;
		if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
			return false;
		return true;
	};

	const createMutation = useMutation({
		mutationFn: (fd: FormData) =>
			api.post("/partners", fd, {
				headers: { "Content-Type": "multipart/form-data" },
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["partners"] }),
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, fd }: { id: string; fd: FormData }) =>
			api.put(`/partners/${id}`, fd, {
				headers: { "Content-Type": "multipart/form-data" },
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["partners"] }),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.delete(`/partners/${id}`),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["partners"] });
			queryClient.invalidateQueries({ queryKey: ["partner-leads"] });
		},
	});

	const resetForm = () => {
		setForm(emptyForm);
		setAgreementFile(null);
		setRemoveAgreement(false);
		setEditingPartner(null);
	};

	const handleSubmit = () => {
		if (!formValid()) return;
		const fd = buildFormData();
		if (editingPartner) {
			updateMutation.mutate(
				{ id: editingPartner._id, fd },
				{
					onSuccess: () => {
						resetForm();
						setShowCreateModal(false);
						toast.success("Partner updated successfully");
					},
					onError: (err: any) =>
						toast.error(
							err.response?.data?.message ||
								"Failed to update partner",
						),
				},
			);
		} else {
			createMutation.mutate(fd, {
				onSuccess: () => {
					resetForm();
					setShowCreateModal(false);
					setPage(1);
					toast.success("Partner created successfully");
				},
				onError: (err: any) =>
					toast.error(
						err.response?.data?.message ||
							"Failed to create partner",
					),
			});
		}
	};

	const handlePartnerEdit = (partner: Partner) => {
		setForm({
			partnerType: partner.partnerType || "company",
			companyName: partner.companyName || partner.name || "",
			personName: partner.personName || "",
			phone: partner.phone || "",
			email: partner.email || "",
			pan: partner.pan || "",
			gst: partner.gst || "",
			purpose: partner.purpose || "",
			description: partner.description || "",
			isCA: !!partner.isCA,
			// Legacy docs: a stored agreement file means it was signed
			agreementSigned:
				partner.agreementSigned ??
				!!(partner.agreementFileName || partner.agreementFilePath),
		});
		setAgreementFile(null);
		setRemoveAgreement(false);
		setEditingPartner(partner);
		setShowCreateModal(true);
	};

	const confirmDelete = () => {
		if (!deletingPartner) return;
		const id = deletingPartner._id;
		if (selectedPartnerId === id) setSelectedPartnerId(null);
		deleteMutation.mutate(id, {
			onSuccess: (res: any) => {
				setDeletingPartner(null);
				toast.success(
					res?.data?.message || "Partner deleted successfully",
				);
			},
			onError: (err: any) =>
				toast.error(
					err.response?.data?.message ||
						"Failed to delete partner",
				),
		});
	};

	const handleRefresh = async () => {
		try {
			await Promise.all([
				queryClient.refetchQueries({ queryKey: ["partners"] }),
				queryClient.refetchQueries({ queryKey: ["partner"] }),
				queryClient.refetchQueries({ queryKey: ["partner-leads"] }),
				queryClient.refetchQueries({ queryKey: ["activity-logs"] }),
			]);
			toast.success("Partners refreshed");
		} catch {
			toast.error("Refresh failed — please try again");
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
			const { data } = await api.post(
				"/partners/import/excel",
				formData,
				{
					headers: { "Content-Type": "multipart/form-data" },
				},
			);
			setImportResult({
				imported: data.imported,
				errors: data.errors || [],
			});
			if (data.success)
				queryClient.invalidateQueries({ queryKey: ["partners"] });
		} catch (err: any) {
			toast.error(err.response?.data?.message || "Import failed");
		} finally {
			setImporting(false);
			e.target.value = "";
		}
	};

	// Bulk add: one request inserts every valid line (fast for 50+ leads)
	const handleQuickAddSubmit = async () => {
		if (
			!selectedPartnerId ||
			quickAddValid.length === 0 ||
			!quickAddProduct.trim()
		)
			return;
		setQuickAddSubmitting(true);
		try {
			const { data } = await api.post("/leads/bulk", {
				sourceType: "partner",
				partnerId: selectedPartnerId,
				product: quickAddProduct.trim(),
				leads: quickAddValid.map((r) => ({
					name: r.name,
					phone: r.phone,
					companyName: r.companyName,
				})),
			});
			const added = data?.imported ?? 0;
			setQuickAddResult({
				added,
				skipped: quickAddInvalidCount,
				errors: (data?.errors || []) as {
					row: number;
					message: string;
				}[],
			});
			toast.success(
				added === 1 ? "1 lead added" : `${added} leads added`,
			);
			refreshPartnerLeads();
		} catch (err: any) {
			toast.error(
				err.response?.data?.message || "Failed to add leads",
			);
		} finally {
			setQuickAddSubmitting(false);
		}
	};

	// Excel import scoped to the open partner (server forces attribution)
	const handleLeadImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file || !selectedPartnerId) return;
		setLeadImporting(true);
		setLeadImportResult(null);
		try {
			const fd = new FormData();
			fd.append("file", file);
			fd.append("partnerId", selectedPartnerId);
			if (leadImportProduct.trim())
				fd.append("product", leadImportProduct.trim());
			const { data } = await api.post("/leads/import/excel", fd, {
				headers: { "Content-Type": "multipart/form-data" },
			});
			setLeadImportResult({
				imported: data.imported,
				errors: data.errors || [],
			});
			toast.success(
				`${data.imported} lead${data.imported !== 1 ? "s" : ""} imported`,
			);
			refreshPartnerLeads();
		} catch (err: any) {
			toast.error(err.response?.data?.message || "Import failed");
		} finally {
			setLeadImporting(false);
			e.target.value = "";
		}
	};

	// Partner-scoped sample template — the route needs auth, so download it
	// as a blob instead of linking to it directly.
	const handleDownloadPartnerSample = async () => {
		if (!selectedPartnerId) return;
		try {
			const { data } = await api.get(
				`/leads/import/sample/partner/${selectedPartnerId}`,
				{ responseType: "blob" },
			);
			const safeName = (
				selectedPartner ? partnerDisplayName(selectedPartner) : "partner"
			)
				.replace(/[^\w.-]+/g, "-")
				.replace(/^-+|-+$/g, "");
			const url = URL.createObjectURL(new Blob([data]));
			const a = document.createElement("a");
			a.href = url;
			a.download = `lead-import-${safeName || "partner"}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err: any) {
			toast.error(
				err.response?.data?.message ||
					"Failed to download sample template",
			);
		}
	};

	const formatDate = (dateStr: string) => {
		const d = new Date(dateStr);
		return d.toLocaleDateString("en-IN", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
	};

	const canManage =
		currentUser?.role === "admin" || currentUser?.role === "manager";

	// Search + paging are server-side; `partners` is the current page.
	const filtered = partners;

	// Client-side filter for the leads list in the details modal. Partners can
	// easily have 100+ leads, so searching beats scrolling through the whole list.
	const leadSearchQuery = leadSearch.trim().toLowerCase();
	const visibleLeads = leadSearchQuery
		? partnerLeads.filter((lead) => {
				const haystack = [
					lead.name,
					lead.phone,
					lead.companyName,
					lead.product,
					lead.status,
					(lead.status || "").replace(/_/g, " "),
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return haystack.includes(leadSearchQuery);
			})
		: partnerLeads;

	// Quick-add batch parse (cheap even for hundreds of lines)
	const quickAddParsed = parseQuickAddLines(quickAddText);
	const quickAddValid = quickAddParsed.filter((r) => !r.error);
	const quickAddInvalidCount = quickAddParsed.length - quickAddValid.length;

	// Keeps the partner modal (details, lead list, card counts) in sync after
	// leads are added or imported for the selected partner.
	const refreshPartnerLeads = () => {
		queryClient.invalidateQueries({
			queryKey: ["partner-leads", selectedPartnerId],
		});
		queryClient.invalidateQueries({
			queryKey: ["partner", selectedPartnerId],
		});
		queryClient.invalidateQueries({ queryKey: ["partners"] });
		queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
	};

	const partnerDetailModal = (
		<Modal
			isOpen={!!selectedPartnerId}
			onClose={() => {
				if (
					!showQuickAdd &&
					!showLeadImport &&
					!showCreateModal &&
					!deletingPartner
				)
					setSelectedPartnerId(null);
			}}
		>
			<div
				className="card animate-fade-in w-full p-0 overflow-hidden rounded-2xl"
				style={{
					padding: 0,
					maxWidth: 720,
					maxHeight: "90vh",
					display: "flex",
					flexDirection: "column",
				}}
			>
				{!selectedPartner ? (
					<div className="flex justify-center p-15">
						<Loader2
							size={24}
							className="animate-spin text-(--color-primary)"
						/>
					</div>
				) : (
					<>
						<div className="px-6 py-5 border-b border-(--color-border) flex items-start justify-between gap-3 bg-(--color-surface) shrink-0">
							<div className="min-w-0">
								<div className="flex items-center gap-1.5 flex-wrap">
									<span
										className={`text-[0.65rem] font-bold uppercase tracking-wide ${selectedPartner.partnerType === "company" ? "text-(--color-primary)" : "text-(--color-warning)"}`}
									>
										{selectedPartner.partnerType ===
										"company"
											? "Company"
											: "Individual"}
									</span>
									{selectedPartner.isCA && (
										<span className="text-[0.6rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
											{selectedPartner.partnerType ===
											"company"
												? "CA Firm"
												: "CA"}
										</span>
									)}
								</div>
								<h3 className="text-base font-bold m-0 truncate">
									{partnerDisplayName(selectedPartner)}
								</h3>
								<p className="text-[0.75rem] text-(--color-text-secondary) mt-0.5 m-0">
									{selectedPartner.leadCount ??
										partnerLeads.length}{" "}
									lead
									{(selectedPartner.leadCount ??
										partnerLeads.length) !== 1
										? "s"
										: ""}{" "}
									referred
								</p>
							</div>
							<div className="flex items-center gap-1.5 shrink-0">
								{canManage && (
									<>
										<button
											onClick={() =>
												handlePartnerEdit(
													selectedPartner,
												)
											}
											title="Edit partner"
											className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#C7FFD1] hover:text-[#00961C]!"
										>
											<Pencil size={15} />
										</button>
										<button
											onClick={() =>
												setDeletingPartner(
													selectedPartner,
												)
											}
											title="Delete partner"
											className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#fef2f2] hover:text-[#ef4444]!"
										>
											<Trash2 size={15} />
										</button>
									</>
								)}
								<button
									onClick={() => setSelectedPartnerId(null)}
									className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:opacity-80"
								>
									<X size={16} />
								</button>
							</div>
						</div>

						<div className="flex-1 min-h-0 overflow-y-auto">
							<div className="p-6 border-b border-(--color-border) flex flex-col gap-2 text-[0.8rem]">
								<div className="flex gap-4">
									<div className="flex items-center gap-2 text-(--color-text)">
										<UserIcon
											size={13}
											className="text-(--color-text-tertiary) shrink-0"
										/>
										<span className="font-semibold">
											{selectedPartner.personName}
										</span>
									</div>
									{/* {selectedPartner.partnerType === 'company' && (selectedPartner.companyName || selectedPartner.name) && (
                                    <div className="flex items-center gap-2 text-(--color-text-secondary)">
                                        <Building2 size={13} className="shrink-0" /> {selectedPartner.companyName || selectedPartner.name}
                                    </div>
                                    )} */}
									{selectedPartner.phone && (
										<div className="flex items-center gap-2 text-(--color-text-secondary)">
											<Phone
												size={13}
												className="shrink-0"
											/>{" "}
											{selectedPartner.phone}
										</div>
									)}
								{selectedPartner.email && (
									<div className="flex items-center gap-2 text-(--color-text-secondary)">
										<Mail size={13} className="shrink-0" />{" "}
										{selectedPartner.email}
									</div>
								)}
								</div>
								{(selectedPartner.pan ||
									selectedPartner.gst) && (
									<div className="flex flex-wrap gap-2 mt-1">
										{selectedPartner.pan && (
											<span className="text-[0.68rem] font-mono bg-(--color-surface-hover) px-2 py-0.5 rounded">
												PAN: {selectedPartner.pan}
											</span>
										)}
										{selectedPartner.gst && (
											<span className="text-[0.68rem] font-mono bg-(--color-surface-hover) px-2 py-0.5 rounded">
												GST: {selectedPartner.gst}
											</span>
										)}
									</div>
								)}
								{selectedPartner.purpose && (
									<p className="m-0 text-[0.78rem] text-(--color-text-secondary)">
										<strong>Purpose:</strong>{" "}
										{selectedPartner.purpose}
									</p>
								)}
								{selectedPartner.description && (
									<p className="m-0 text-[0.78rem] text-(--color-text-secondary)">
										<strong>Description:</strong>{" "}
										{selectedPartner.description}
									</p>
								)}
								{selectedPartner.agreementFilePath ? (
                                    <>
                                        <button
                                            onClick={() =>
                                                setPreviewFile({
                                                    url: agreementUrl(
                                                        selectedPartner,
                                                    ),
                                                    type:
                                                        selectedPartner.agreementFileType ||
                                                        "",
                                                    name:
                                                        selectedPartner.agreementOriginalName ||
                                                        "Agreement",
                                                })
                                            }
                                            className="flex items-center gap-1.5 text-[0.8rem] font-medium text-(--color-primary) bg-transparent border-none cursor-pointer p-0 mt-1"
                                        >
                                            <p className="m-0 text-[0.78rem] text-(--color-text-secondary)">
                                            <strong>Agreement:</strong>{" "}
                                        </p>
                                            <FileText size={14} />{" "}
                                            {selectedPartner.agreementOriginalName ||
                                                "View agreement"}{" "}
                                            <ExternalLink size={12} />
                                        </button>
                                    </>

								) : selectedPartner.agreementSigned ? (
									<span className="flex items-center gap-1.5 text-[0.78rem] text-(--color-text-secondary) mt-1">
										<FileText size={13} /> Agreement signed
										— no file uploaded
									</span>
								) : (
									<span className="flex items-center gap-1.5 text-[0.78rem] text-(--color-text-tertiary) mt-1">
										<FileText size={13} /> No agreement
										signed
									</span>
								)}
							</div>

							<div className="pb-4">
								<div className="sticky top-0 z-10 bg-(--color-surface) px-6 pt-3 pb-2.5 border-b border-(--color-border)">
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center gap-1.5 min-w-0">
											<h4 className="text-[0.72rem] font-bold uppercase tracking-wide text-(--color-text-secondary) m-0 truncate">
												Leads given by this partner
											</h4>
											<span className="text-[0.68rem] font-semibold text-(--color-text-tertiary) shrink-0">
												{partnerLeads.length}
											</span>
										</div>
                                        <div className="flex gap-4">
                                            <button
                                                className="btn btn-secondary btn-sm shrink-0"
                                                title="Import leads from Excel"
                                                onClick={() => {
                                                    setLeadImportResult(null);
                                                    setLeadImportProduct("");
                                                    setShowLeadImport(true);
                                                }}
                                            >
                                                <Upload size={13} /> Import
                                            </button>
                                            <button
                                                className="btn btn-primary btn-sm shrink-0"
                                                onClick={() => {
                                                    setQuickAddText("");
                                                    setQuickAddResult(null);
                                                    setQuickAddProduct("");
                                                    setShowQuickAdd(true);
                                                }}
                                            >
                                                <Plus size={13} /> Add Lead
                                            </button>
                                        </div>
									</div>
									{partnerLeads.length > 0 && (
										<div className="mt-2 flex items-center gap-1.5 border border-(--color-border) rounded-lg px-2.5 bg-(--color-surface)">
											<Search
												size={13}
												className="text-(--color-text-tertiary) shrink-0"
											/>
											<input
												placeholder="Search leads by name, phone, company, status..."
												className="flex-1 border-none py-1.5 text-[0.78rem] outline-none shadow-none bg-transparent"
												value={leadSearch}
												onChange={(e) =>
													setLeadSearch(
														e.target.value,
													)
												}
											/>
											{leadSearch && (
												<button
													onClick={() =>
														setLeadSearch("")
													}
													title="Clear search"
													className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-0.5 leading-none hover:text-(--color-text)"
												>
													<X size={12} />
												</button>
											)}
										</div>
									)}
								</div>

								<div className="px-6 pt-3">
									{leadsLoading ? (
										<div className="flex justify-center p-10">
											<Loader2
												size={24}
												className="animate-spin text-(--color-primary)"
											/>
										</div>
									) : partnerLeads.length === 0 ? (
										<div className="p-10 text-center">
											<Handshake
												size={32}
												className="text-(--color-text-tertiary) opacity-30 mx-auto mb-3 block"
											/>
											<p className="text-[0.85rem] text-(--color-text-secondary)">
												No leads referred by this
												partner yet
											</p>
										</div>
									) : visibleLeads.length === 0 ? (
										<div className="p-10 text-center">
											<Search
												size={28}
												className="text-(--color-text-tertiary) opacity-30 mx-auto mb-3 block"
											/>
											<p className="text-[0.85rem] text-(--color-text-secondary)">
												No leads match your search
											</p>
										</div>
									) : (
										<>
											{leadSearchQuery && (
												<p className="text-[0.7rem] text-(--color-text-tertiary) m-0 mb-2 px-1">
													Showing{" "}
													{visibleLeads.length} of{" "}
													{partnerLeads.length} lead
													{partnerLeads.length !== 1
														? "s"
														: ""}
												</p>
											)}
											<div className="flex flex-col gap-1.5">
												{visibleLeads.map((lead) => (
													<div
														key={lead._id}
														className="card p-[10px_14px] cursor-pointer border border-(--color-border) hover:shadow-sm"
														onClick={() =>
															navigate(
																`/crm/files?leadId=${lead._id}`,
															)
														}
													>
														<div className="flex items-center justify-between gap-2 mb-1">
															<span className="text-[0.85rem] font-semibold text-(--color-text) truncate">
																{lead.name}
															</span>
															<span className="badge badge-todo text-[0.6rem] shrink-0">
																{(
																	lead.status ||
																	""
																).replace(
																	/_/g,
																	" ",
																)}
															</span>
														</div>
														<div className="flex items-center gap-2.5 text-[0.72rem] text-(--color-text-secondary) flex-wrap">
															{lead.phone && (
																<span className="flex items-center gap-1">
																	<Phone
																		size={
																			11
																		}
																	/>{" "}
																	{lead.phone}
																</span>
															)}
															{lead.companyName && (
																<span className="flex items-center gap-1">
																	<Building2
																		size={
																			11
																		}
																	/>{" "}
																	{
																		lead.companyName
																	}
																</span>
															)}
															{lead.product && (
																<span className="flex items-center gap-1">
																	<Tag size={11} />{" "}
																	{lead.product}
																</span>
															)}
														</div>
													</div>
												))}
											</div>
										</>
									)}
								</div>
							</div>
						</div>
					</>
				)}
			</div>
		</Modal>
	);

	// Quick add: paste one lead per line (or straight from Excel) and add
	// them all in a single request — fast enough for 50+ leads at once.
	const quickAddModal = (
		<Modal
			isOpen={showQuickAdd}
			onClose={() => {
				if (!quickAddSubmitting) setShowQuickAdd(false);
			}}
			zIndex={4960}
		>
			<div
				className="card animate-fade-in w-full p-0 overflow-hidden rounded-2xl"
				style={{
					padding: 0,
					maxWidth: 580,
					maxHeight: "90vh",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface) shrink-0">
					<div className="flex items-center gap-2.5">
						<div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
							<Plus
								size={18}
								className="text-(--color-primary)"
							/>
						</div>
						<div>
							<h3 className="text-base font-bold m-0">
								Add Leads
							</h3>
							<p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
								{selectedPartner
									? `Quick add for ${partnerDisplayName(selectedPartner)}`
									: "Quick add multiple leads"}
							</p>
						</div>
					</div>
					<button
						className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
						onClick={() => {
							if (!quickAddSubmitting) setShowQuickAdd(false);
						}}
					>
						<X size={16} />
					</button>
				</div>

				{quickAddResult ? (
					<div className="p-6">
						<div className="text-center mb-5">
							<div
								className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${quickAddResult.added > 0 ? "bg-green-100" : "bg-red-100"}`}
							>
								{quickAddResult.added > 0 ? (
									<CheckCircle
										size={24}
										className="text-green-600"
									/>
								) : (
									<AlertCircle
										size={24}
										className="text-red-500"
									/>
								)}
							</div>
							<h3 className="text-[1.05rem] font-bold text-(--color-text) m-0 mb-1">
								{quickAddResult.added} lead
								{quickAddResult.added !== 1 ? "s" : ""} added
							</h3>
							{quickAddResult.skipped > 0 && (
								<p className="text-[0.75rem] text-(--color-text-secondary) m-0">
									{quickAddResult.skipped} line
									{quickAddResult.skipped !== 1 ? "s" : ""}{" "}
									skipped due to issues
								</p>
							)}
						</div>
						{quickAddResult.errors.length > 0 && (
							<div className="mb-4 p-3 bg-red-50 rounded-lg text-[0.78rem] max-h-37.5 overflow-y-auto border border-red-200">
								<div className="font-semibold text-red-600 mb-2 flex items-center gap-1.5">
									<AlertCircle size={14} />{" "}
									{quickAddResult.errors.length} row
									{quickAddResult.errors.length !== 1
										? "s"
										: ""}{" "}
									not added
								</div>
								{quickAddResult.errors.map((e, i) => (
									<div
										key={i}
										className="text-red-600 p-1 bg-white rounded mb-1 text-[0.75rem]"
									>
										<strong>Row {e.row}:</strong>{" "}
										{e.message}
									</div>
								))}
							</div>
						)}
						<div className="flex gap-2">
							<button
								className="btn btn-secondary flex-1 py-2.5"
								onClick={() => {
									setQuickAddResult(null);
									setQuickAddText("");
								}}
							>
								Add more
							</button>
							<button
								className="btn btn-primary flex-1 py-2.5"
								onClick={() => {
									setShowQuickAdd(false);
									setQuickAddResult(null);
								}}
							>
								Done
							</button>
						</div>
					</div>
				) : (
					<>
						<div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-4">
							<div>
								<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
									One lead per line — Name, Phone, Company
								</label>
								<textarea
									autoFocus
									className="input font-mono text-[0.78rem] resize-y"
									style={{ minHeight: 170 }}
									placeholder={
										"Rahul Sharma, 9876543210, Acme Corp\nPriya Verma, 9812345678\nAmit Patel"
									}
									value={quickAddText}
									onChange={(e) =>
										setQuickAddText(e.target.value)
									}
								/>
								<p className="text-[0.7rem] text-(--color-text-tertiary) mt-1.5 m-0">
									Phone and company are optional · paste rows
									straight from Excel
								</p>
							</div>

							<div>
								<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
									Product{" "}
									<span className="text-(--color-danger)">*</span>{" "}
									— what the partner gave this lead for
								</label>
								{activeProductOptions.length > 0 ? (
									<select
										className="select"
										aria-label="Product"
										value={quickAddProduct}
										onChange={(e) =>
											setQuickAddProduct(
												e.target.value,
											)
										}
									>
										<option value="">
											Select a product…
										</option>
										{activeProductOptions.map((p) => (
											<option
												key={p._id}
												value={p.name}
											>
												{p.name}
											</option>
										))}
									</select>
								) : (
									<input
										className="input"
										placeholder="e.g. Term Loan"
										value={quickAddProduct}
										onChange={(e) =>
											setQuickAddProduct(
												e.target.value,
											)
										}
									/>
								)}
								<p className="text-[0.7rem] text-(--color-text-tertiary) mt-1.5 m-0">
									Required for partner leads — used by the Files tracker
								</p>
							</div>

							{quickAddParsed.length > 0 && (
								<div className="border border-(--color-border) rounded-lg overflow-hidden shrink-0">
									<div className="px-3 py-2 bg-(--color-surface-hover) flex items-center justify-between text-[0.72rem]">
										<span className="font-semibold text-(--color-text)">
											{quickAddValid.length} ready to add
										</span>
										{quickAddInvalidCount > 0 && (
											<span className="text-(--color-danger) font-semibold">
												{quickAddInvalidCount} with
												issues
											</span>
										)}
									</div>
									<div className="px-3 py-1.5 flex items-center gap-2 border-y border-(--color-border) bg-(--color-surface-hover) text-[0.62rem] font-semibold uppercase tracking-wider text-(--color-text-tertiary)">
										<span className="w-5 shrink-0 text-right">
											#
										</span>
										<span className="flex-1 min-w-0">
											Name
										</span>
										<span className="w-24 shrink-0">
											Phone
										</span>
										<span className="flex-1 min-w-0">
											Company
										</span>
									</div>
									<div className="max-h-44 overflow-y-auto">
										{quickAddParsed
											.slice(0, 50)
											.map((r) => (
												<div
													key={r.row}
													className={`px-3 py-1.5 text-[0.75rem] flex items-center gap-2 border-t border-(--color-border) first:border-t-0 ${r.error ? "text-(--color-danger)" : ""}`}
												>
													<span className="text-(--color-text-tertiary) text-[0.65rem] w-5 shrink-0 text-right">
														{r.row}
													</span>
													{r.error ? (
														<span className="flex-1 min-w-0 truncate">
															{r.name || "(empty)"} —{" "}
															{r.error}
														</span>
													) : (
														<>
															<span className="flex-1 min-w-0 truncate font-semibold text-(--color-text)">
																{r.name}
															</span>
															<span className="w-24 shrink-0 truncate text-(--color-text-secondary)">
																{r.phone || "—"}
															</span>
															<span className="flex-1 min-w-0 truncate text-(--color-text-secondary)">
																{r.companyName || "—"}
															</span>
														</>
													)}
												</div>
											))}
										{quickAddParsed.length > 50 && (
											<div className="px-3 py-1.5 text-[0.7rem] text-(--color-text-tertiary) border-t border-(--color-border)">
												…and{" "}
												{quickAddParsed.length - 50}{" "}
												more
											</div>
										)}
									</div>
								</div>
							)}
						</div>
						<div className="px-6 py-4 border-t border-(--color-border) flex justify-end gap-2 shrink-0">
							<button
								className="btn btn-secondary"
								disabled={quickAddSubmitting}
								onClick={() => setShowQuickAdd(false)}
							>
								Cancel
							</button>
							<button
								className="btn btn-primary"
								disabled={
									quickAddValid.length === 0 ||
									!quickAddProduct.trim() ||
									quickAddSubmitting
								}
								onClick={handleQuickAddSubmit}
							>
								{quickAddSubmitting ? (
									<Loader2
										size={15}
										className="animate-spin"
									/>
								) : (
									<Plus size={15} />
								)}
								{quickAddSubmitting
									? "Adding..."
									: `Add ${quickAddValid.length} lead${quickAddValid.length !== 1 ? "s" : ""}`}
							</button>
						</div>
					</>
				)}
			</div>
		</Modal>
	);

	// Excel import scoped to the open partner
	const leadImportModal = (
		<Modal
			isOpen={showLeadImport}
			onClose={() => {
				if (!leadImporting) setShowLeadImport(false);
			}}
			zIndex={4960}
		>
			<div
				className="card animate-fade-in w-full p-0 overflow-hidden rounded-2xl"
				style={{ padding: 0, maxWidth: 500 }}
			>
				<div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface)">
					<div className="flex items-center gap-2.5">
						<div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
							<Upload
								size={18}
								className="text-(--color-primary)"
							/>
						</div>
						<div>
							<h3 className="text-base font-bold m-0">
								Import Leads
							</h3>
							<p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
								{selectedPartner
									? `Bulk add from Excel for ${partnerDisplayName(selectedPartner)}`
									: "Bulk add from Excel"}
							</p>
						</div>
					</div>
					<button
						className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
						onClick={() => {
							if (!leadImporting) setShowLeadImport(false);
						}}
					>
						<X size={16} />
					</button>
				</div>
				{leadImportResult ? (
					<div className="p-6">
						<div className="text-center mb-5">
							<div
								className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${leadImportResult.imported > 0 ? "bg-green-100" : "bg-red-100"}`}
							>
								{leadImportResult.imported > 0 ? (
									<CheckCircle
										size={24}
										className="text-green-600"
									/>
								) : (
									<AlertCircle
										size={24}
										className="text-red-500"
									/>
								)}
							</div>
							<h3 className="text-[1.05rem] font-bold text-(--color-text) m-0 mb-1">
								{leadImportResult.imported} lead
								{leadImportResult.imported !== 1 ? "s" : ""}{" "}
								imported
							</h3>
						</div>
						{leadImportResult.errors.length > 0 && (
							<div className="mb-4 p-3 bg-red-50 rounded-lg text-[0.78rem] max-h-37.5 overflow-y-auto border border-red-200">
								<div className="font-semibold text-red-600 mb-2 flex items-center gap-1.5">
									<AlertCircle size={14} />{" "}
									{leadImportResult.errors.length} row
									{leadImportResult.errors.length !== 1
										? "s"
										: ""}{" "}
									skipped
								</div>
								{leadImportResult.errors.map((e, i) => (
									<div
										key={i}
										className="text-red-600 p-1 bg-white rounded mb-1 text-[0.75rem]"
									>
										<strong>Row {e.row}:</strong>{" "}
										{e.message}
									</div>
								))}
							</div>
						)}
						<div className="flex gap-2">
							<button
								className="btn btn-secondary flex-1 py-2.5"
								onClick={() => setLeadImportResult(null)}
							>
								Import more
							</button>
							<button
								className="btn btn-primary flex-1 py-2.5"
								onClick={() => {
									setShowLeadImport(false);
									setLeadImportResult(null);
								}}
							>
								Done
							</button>
						</div>
					</div>
				) : (
					<div className="p-6">
						<div className="mb-4">
							<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
								Product{" "}
								<span className="text-(--color-text-tertiary)">
									(used for rows without a Product value)
								</span>
							</label>
							{activeProductOptions.length > 0 ? (
								<select
									className="select"
									aria-label="Product"
									value={leadImportProduct}
									onChange={(e) =>
										setLeadImportProduct(
											e.target.value,
										)
									}
								>
									<option value="">
										No fallback product
									</option>
									{activeProductOptions.map((p) => (
										<option
											key={p._id}
											value={p.name}
										>
											{p.name}
										</option>
									))}
								</select>
							) : (
								<input
									className="input"
									placeholder="e.g. Term Loan"
									value={leadImportProduct}
									onChange={(e) =>
										setLeadImportProduct(
											e.target.value,
										)
									}
								/>
							)}
						</div>

						<label className="border-2 border-dashed border-(--color-border) rounded-xl p-[32px_24px] text-center cursor-pointer bg-(--color-surface) mb-4 hover:border-(--color-primary) transition-colors block">
							<input
								type="file"
								accept=".xlsx,.xls,.csv"
								className="hidden"
								onChange={handleLeadImport}
							/>
							<Upload
								size={32}
								className="text-(--color-text-tertiary) mx-auto mb-3 opacity-40"
							/>
							<p className="text-[0.85rem] font-semibold text-(--color-text) m-0 mb-1">
								{leadImporting
									? "Importing..."
									: "Click to upload Excel file"}
							</p>
							<p className="text-[0.72rem] text-(--color-text-tertiary) m-0">
								.xlsx / .xls / .csv · every row is linked to
								this partner and marked Closed Won
							</p>
						</label>
						<button
							type="button"
							onClick={handleDownloadPartnerSample}
							className="bg-transparent border-none cursor-pointer w-full flex items-center justify-center gap-1.5 text-[0.8rem] font-medium text-(--color-primary)"
						>
							<Download size={14} /> Download sample for this partner
						</button>
					</div>
				)}
			</div>
		</Modal>
	);

	if (isLoading) {
		return (
			<div className="flex justify-center p-15">
				<Loader2
					size={32}
					className="animate-spin text-(--color-primary)"
				/>
			</div>
		);
	}

	return (
		<>
			<div className="max-w-350 mx-auto h-[80dvh] flex flex-col overflow-hidden">
				<div className="flex flex-col min-h-0 h-full flex-1 min-w-0">
					<div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4 mb-5 pt-4 sm:pt-6">
						<div>
							<h1 className="text-2xl font-bold tracking-tight">
								Channel Partners
							</h1>
							<p className="text-[0.85rem] text-(--color-text-secondary) mt-1">
								{total} partner{total !== 1 ? "s" : ""}
							</p>
						</div>
						<div className="flex gap-2">
							<button
								onClick={handleRefresh}
								disabled={isFetching}
								title="Refresh partners"
								className="btn btn-secondary flex items-center gap-1.5"
							>
								<RefreshCw
									size={14}
									className={isFetching ? "animate-spin" : ""}
								/>
								Refresh
							</button>
							{canManage && (
								<>
									<button
										className="btn btn-secondary"
										onClick={() => setShowImportModal(true)}
									>
										<Download size={16} /> Import
									</button>
									<button
										className="btn btn-primary"
										onClick={() => {
											resetForm();
											setShowCreateModal(true);
										}}
									>
										<Plus size={16} /> New Partner
									</button>
								</>
							)}
						</div>
					</div>

					<div className="shrink-0 mb-4 flex flex-col sm:flex-row sm:items-center gap-2.5">
						<div className="flex items-center gap-1.5 border border-(--color-border) rounded-lg px-2.5 bg-(--color-surface) flex-1 min-w-0 sm:max-w-md">
							{isFetching ? (
								<Loader2
									size={14}
									className="animate-spin text-(--color-primary) shrink-0"
								/>
							) : (
								<Search
									size={14}
									className="text-(--color-text-tertiary) shrink-0"
								/>
							)}
							<input
								placeholder="Search company, person, phone, email, PAN, GST..."
								className="flex-1 border-none py-2 text-[0.8rem] outline-none shadow-none bg-transparent"
								value={searchInput}
								onChange={(e) => setSearchInput(e.target.value)}
							/>
							{searchInput && (
								<button
									onClick={() => {
										setSearchInput("");
										setSearchQuery("");
										setPage(1);
									}}
									title="Clear search"
									className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-0.5 leading-none hover:text-(--color-text)"
								>
									<X size={12} />
								</button>
							)}
						</div>
						<div className="self-start sm:self-auto flex items-center gap-2 shrink-0 whitespace-nowrap">
							<ToggleSwitch
								checked={caOnly}
								onChange={() => {
									setCaOnly((v) => !v);
									setPage(1);
								}}
								label="Show only CA / CA firm partners"
							/>
							<span
								className={`text-[0.8rem] ${caOnly ? "text-(--color-text) font-medium" : "text-(--color-text-secondary)"}`}
							>
								CA/CA firm only
							</span>
						</div>
					</div>

					<div className="flex-1 min-h-0 overflow-y-auto pb-4 sm:pb-6">
						{filtered.length === 0 ? (
							<div className="card p-12 text-center">
								<div className="mb-4 opacity-30">
									<Handshake
										size={48}
										className="text-(--color-text-tertiary) mx-auto"
									/>
								</div>
								<h3 className="text-[1.1rem] font-semibold text-(--color-text) mb-2">
									{!searchQuery && !caOnly && total === 0
										? "No Partners Yet"
										: caOnly && !searchQuery
											? "No CA Partners Found"
											: "No partners match your search"}
								</h3>
								<p className="text-[0.85rem] text-(--color-text-secondary) max-w-90 mx-auto">
									{!searchQuery && !caOnly && total === 0
										? "Add your first partner with company details and referral tracking."
										: caOnly && !searchQuery
											? 'Turn off the "CA/CA firm only" filter to see all partners.'
											: "Try a different search term."}
								</p>
							</div>
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 py-2">
								{filtered.map((partner) => (
									<div
										key={partner._id}
										className="card animate-fade-in flex flex-col overflow-hidden relative cursor-pointer"
										style={{ padding: 0 }}
										onClick={() =>
											setSelectedPartnerId(partner._id)
										}
									>
										<div className="p-[18px_20px_14px] flex flex-col gap-2.5">
											<div className="flex justify-between items-start">
												<div className="flex flex-col gap-1.5 flex-1 min-w-0">
													<h4 className="text-[1.05rem] font-bold text-(--color-text) leading-tight m-0">
														{partnerDisplayName(
															partner,
														)}
													</h4>
													<div className="flex gap-1.5 flex-wrap">
														<span
															className={`text-[0.68rem] font-semibold px-2.5 py-0.5 rounded-full inline-block self-start ${partner.partnerType === "company" ? "bg-(--color-primary-light) text-(--color-primary)" : "bg-(--color-warning-light) text-(--color-warning)"}`}
														>
															{partner.partnerType ===
															"company"
																? "Company"
																: "Individual"}
														</span>
														{partner.isCA && (
															<span className="text-[0.65rem] font-semibold px-2.5 py-0.5 rounded-full inline-block self-start bg-amber-100 text-amber-700">
																{partner.partnerType ===
																"company"
																	? "CA Firm"
																	: "CA"}
															</span>
														)}
														{(partner.leadCount ??
															0) > 0 && (
															<span className="text-[0.68rem] font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 self-start">
																{
																	partner.leadCount
																}{" "}
																lead
																{(partner.leadCount ??
																	0) !== 1
																	? "s"
																	: ""}
															</span>
														)}
													</div>
												</div>
												{canManage && (
													<div className="flex items-center gap-1 shrink-0 ml-2">
														<button
															onClick={(e) => {
																e.stopPropagation();
																setDeletingPartner(
																	partner,
																);
															}}
															title="Delete partner"
															className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-1 rounded-md shrink-0 leading-none hover:bg-[#fef2f2] hover:text-[#ef4444]!"
														>
															<Trash2 size={14} />
														</button>
													</div>
												)}
											</div>

											<div className="flex flex-col gap-1 text-[0.75rem] text-(--color-text-secondary)">
												<span className="flex items-center gap-1.5">
													<UserIcon size={12} />{" "}
													{partner.personName}
												</span>
												{partner.phone && (
													<span className="flex items-center gap-1.5">
														<Phone size={12} />{" "}
														{partner.phone}
													</span>
												)}
												{partner.email && (
													<span className="flex items-center gap-1.5">
														<Mail size={12} />{" "}
														{partner.email}
													</span>
												)}
												{(partner.pan ||
													partner.gst) && (
													<span className="text-[0.68rem] text-(--color-text-tertiary)">
														{[
															partner.pan &&
																`PAN: ${partner.pan}`,
															partner.gst &&
																`GST: ${partner.gst}`,
														]
															.filter(Boolean)
															.join("  •  ")}
													</span>
												)}
											</div>

											<div className="flex items-center gap-3 text-[0.72rem] text-(--color-text-tertiary) flex-wrap">
												<span className="flex items-center gap-1">
													<Calendar size={11} />{" "}
													{formatDate(
														partner.createdAt,
													)}
												</span>
												{partner.agreementFilePath ? (
													<span className="flex items-center gap-1 text-(--color-primary)">
														<FileText size={11} />{" "}
														Agreement
													</span>
												) : partner.agreementSigned ? (
													<span className="flex items-center gap-1">
														<FileText size={11} />{" "}
														Agreement signed
													</span>
												) : null}
												<span className="ml-auto text-[0.7rem]">
													by{" "}
													{partner.createdBy?.name ||
														"Unknown"}
												</span>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
						{totalPages > 1 && (
							<div
								className="flex items-center gap-3 flex-wrap"
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
										cursor:
											page <= 1
												? "not-allowed"
												: "pointer",
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
				</div>
				{partnerDetailModal}
				{quickAddModal}
				{leadImportModal}

				<Modal
					isOpen={showCreateModal}
					onClose={() => {
						setShowCreateModal(false);
						resetForm();
					}}
				>
					<div
						className="card animate-fade-in w-full p-0 overflow-hidden rounded-2xl"
						style={{
							padding: 0,
							maxWidth: 560,
							maxHeight: "90vh",
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface) shrink-0">
							<div className="flex items-center gap-2.5">
								<div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
									<Plus
										size={18}
										className="text-(--color-primary)"
									/>
								</div>
								<div>
									<h3 className="text-base font-bold m-0">
										{editingPartner
											? "Edit Partner"
											: "New Partner"}
									</h3>
									<p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
										{editingPartner
											? "Update partner details"
											: "Add company / individual partner"}
									</p>
								</div>
							</div>
							<button
								className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
								onClick={() => {
									setShowCreateModal(false);
									resetForm();
								}}
							>
								<X size={16} />
							</button>
						</div>

						<div className="p-6 flex flex-col gap-4 overflow-y-auto">
							<div>
								<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
									Partner type (select one)
								</label>
								<div className="flex gap-2">
									{(["company", "individual"] as const).map(
										(t) => (
											<button
												key={t}
												onClick={() =>
													setForm((prev) => ({
														...prev,
														partnerType: t,
													}))
												}
												style={{ outline: 0 }}
												className={`btn btn-sm flex-1 ${form.partnerType === t ? "btn-primary" : "btn-secondary"}`}
											>
												{t === "company"
													? "Company"
													: "Individual"}
											</button>
										),
									)}
								</div>
							</div>

							{form.partnerType === "company" && (
								<div>
									<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
										Company name{" "}
										<span className="text-(--color-text-tertiary)">
											(optional)
										</span>
									</label>
									<input
										type="text"
										className="input"
										placeholder="e.g. Acme Corp"
										value={form.companyName}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												companyName: e.target.value,
											}))
										}
									/>
								</div>
							)}

							<div>
								<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
									Person name{" "}
									<span className="text-(--color-danger)">
										*
									</span>
								</label>
								<input
									type="text"
									className="input"
									placeholder="e.g. Rahul Sharma"
									value={form.personName}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											personName: e.target.value,
										}))
									}
								/>
							</div>

							<div className="mt-2">
								<div className="flex items-center justify-between gap-3 border border-(--color-border) rounded-lg px-3 py-2.5 bg-(--color-surface)">
									<span
										onClick={() =>
											setForm((prev) => ({
												...prev,
												isCA: !prev.isCA,
											}))
										}
										className="text-[0.8rem] text-(--color-text-secondary) cursor-pointer select-none"
									>
										{form.partnerType === "company"
											? "Is CA firm?"
											: "Is CA?"}
									</span>
									<div className="flex items-center gap-2 shrink-0">
										<span
											className={`text-[0.72rem] font-semibold ${form.isCA ? "text-(--color-primary)" : "text-(--color-text-tertiary)"}`}
										>
											{form.isCA ? "Yes" : "No"}
										</span>
										<ToggleSwitch
											checked={form.isCA}
											onChange={() =>
												setForm((prev) => ({
													...prev,
													isCA: !prev.isCA,
												}))
											}
											label={
												form.partnerType === "company"
													? "Is CA firm?"
													: "Is CA?"
											}
										/>
									</div>
								</div>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<div>
									<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
										Contact number{" "}
										<span className="text-(--color-danger)">
											*
										</span>
									</label>
									<input
										type="text"
										inputMode="numeric"
										maxLength={10}
										className="input"
										placeholder="10-digit mobile"
										value={form.phone}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												phone: e.target.value
													.replace(/\D/g, "")
													.slice(0, 10),
											}))
										}
									/>
									{form.phone &&
										!/^\d{10}$/.test(
											form.phone.replace(/\D/g, ""),
										) && (
											<p className="text-[0.7rem] text-(--color-danger) mt-1">
												Enter a valid 10-digit number
											</p>
										)}
								</div>
								<div>
									<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
										Email id
									</label>
									<input
										type="email"
										className="input"
										placeholder="name@company.com"
										value={form.email}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												email: e.target.value,
											}))
										}
									/>
								</div>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<div>
									<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
										GST number
									</label>
									<input
										type="text"
										className="input font-mono"
										placeholder="27ABCDE1234F1Z5"
										value={form.gst}
										onChange={(e) => {
											const gst =
												e.target.value.toUpperCase();
											const derived = panFromGst(gst);
											setForm((prev) => ({
												...prev,
												gst,
												...(derived
													? { pan: derived }
													: {}),
											}));
										}}
									/>
									{panFromGst(form.gst) && (
										<p className="text-[0.7rem] text-(--color-text-tertiary) mt-1">
											PAN auto-filled from GST
										</p>
									)}
								</div>
								<div>
									<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
										PAN number
									</label>
									<input
										type="text"
										className="input font-mono"
										placeholder="ABCDE1234F"
										value={form.pan}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												pan: e.target.value.toUpperCase(),
											}))
										}
									/>
								</div>
							</div>

							<div>
								<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
									Purpose / Role (optional)
								</label>
								<input
									type="text"
									className="input"
									placeholder="e.g. Channel partner for west region"
									value={form.purpose}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											purpose: e.target.value,
										}))
									}
								/>
							</div>

							<div>
								<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
									Description (optional)
								</label>
								<textarea
									className="input min-h-17.5 resize-y"
									placeholder="Partner details..."
									value={form.description}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											description: e.target.value,
										}))
									}
								/>
							</div>

							<div>
								<div className="flex items-center justify-between gap-3 border border-(--color-border) rounded-lg px-3 py-2.5 bg-(--color-surface)">
									<span
										onClick={() =>
											setForm((prev) => ({
												...prev,
												agreementSigned:
													!prev.agreementSigned,
											}))
										}
										className="text-[0.8rem] text-(--color-text-secondary) cursor-pointer select-none"
									>
										Is an agreement signed with this
										partner?
									</span>
									<div className="flex items-center gap-2 shrink-0">
										<span
											className={`text-[0.72rem] font-semibold ${form.agreementSigned ? "text-(--color-primary)" : "text-(--color-text-tertiary)"}`}
										>
											{form.agreementSigned
												? "Yes"
												: "No"}
										</span>
										<ToggleSwitch
											checked={form.agreementSigned}
											onChange={() =>
												setForm((prev) => ({
													...prev,
													agreementSigned:
														!prev.agreementSigned,
												}))
											}
											label="Is an agreement signed with this partner?"
										/>
									</div>
								</div>
								{!form.agreementSigned &&
									editingPartner &&
									(editingPartner.agreementFileName ||
										editingPartner.agreementFilePath) && (
										<p className="text-[0.72rem] text-(--color-warning) mt-1.5 m-0">
											The current agreement file will be
											removed when you save.
										</p>
									)}
								{!form.agreementSigned &&
									!(
										editingPartner &&
										(editingPartner.agreementFileName ||
											editingPartner.agreementFilePath)
									) && (
										<p className="text-[0.72rem] text-(--color-text-tertiary) mt-1.5 m-0">
											The partner will be saved without a
											signed agreement.
										</p>
									)}
							</div>

							{form.agreementSigned && (
								<div>
									<label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
										Agreement document (optional)
									</label>
									{editingPartner?.agreementFilePath &&
									!removeAgreement &&
									!agreementFile ? (
										<div className="flex items-center justify-between gap-2 border border-(--color-border) rounded-lg px-3 py-2 text-[0.8rem]">
											<button
												onClick={() =>
													editingPartner?.agreementFilePath &&
													setPreviewFile({
														url: agreementUrl(
															editingPartner,
														),
														type:
															editingPartner.agreementFileType ||
															"",
														name:
															editingPartner.agreementOriginalName ||
															"Agreement",
													})
												}
												className="flex items-center gap-1.5 text-(--color-primary) bg-transparent border-none cursor-pointer truncate p-0"
											>
												<FileText size={14} />{" "}
												<span className="truncate">
													{editingPartner.agreementOriginalName ||
														"Current agreement"}
												</span>
											</button>
											<button
												onClick={() =>
													setRemoveAgreement(true)
												}
												className="btn btn-sm btn-secondary shrink-0"
											>
												Remove
											</button>
										</div>
									) : agreementFile ? (
										<div className="flex items-center justify-between gap-2 border border-(--color-border) rounded-lg px-3 py-2 text-[0.8rem]">
											<button
												onClick={() =>
													setPreviewFile({
														url: URL.createObjectURL(
															agreementFile,
														),
														type: agreementFile.type,
														name: agreementFile.name,
													})
												}
												className="flex items-center gap-1.5 text-(--color-primary) bg-transparent border-none cursor-pointer truncate p-0"
											>
												<FileText size={14} />{" "}
												<span className="truncate">
													{agreementFile.name}
												</span>
											</button>
											<button
												onClick={() =>
													setAgreementFile(null)
												}
												className="btn btn-sm btn-secondary shrink-0"
											>
												Remove
											</button>
										</div>
									) : (
										<label className="border-2 border-dashed border-(--color-border) rounded-xl p-4 text-center cursor-pointer bg-(--color-surface) hover:border-(--color-primary) transition-colors block">
											<input
												type="file"
												className="hidden"
												accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
												onChange={(e) => {
													const f =
														e.target.files?.[0] ||
														null;
													if (f) {
														const err =
															agreementError(f);
														if (err) {
															toast.error(err);
															e.target.value = "";
															return;
														}
													}
													setAgreementFile(f);
												}}
											/>
											<Upload
												size={20}
												className="text-(--color-text-tertiary) mx-auto mb-1 opacity-60"
											/>
											<p className="text-[0.8rem] font-semibold text-(--color-text) m-0">
												Upload agreement
											</p>
											<p className="text-[0.7rem] text-(--color-text-tertiary) m-0">
												PDF / DOC / JPG / PNG / WEBP ·
												max 10MB · optional
											</p>
										</label>
									)}
									{removeAgreement && !agreementFile && (
										<p className="text-[0.72rem] text-(--color-warning) mt-1">
											Current agreement will be removed on
											save. You can upload a replacement
											above.
										</p>
									)}
								</div>
							)}

							<button
								className="btn btn-primary w-full mt-1 py-2.5"
								disabled={
									!formValid() ||
									createMutation.isPending ||
									updateMutation.isPending
								}
								onClick={handleSubmit}
							>
								{createMutation.isPending ||
								updateMutation.isPending ? (
									<Loader2
										size={16}
										className="animate-spin"
									/>
								) : null}
								{createMutation.isPending ||
								updateMutation.isPending
									? editingPartner
										? "Updating..."
										: "Creating..."
									: editingPartner
										? "Update Partner"
										: "Create Partner"}
							</button>
						</div>
					</div>
				</Modal>

				<Modal
					isOpen={!!deletingPartner}
					onClose={() => {
						if (!deleteMutation.isPending) setDeletingPartner(null);
					}}
				>
					<div
						className="card animate-fade-in max-w-105 w-full p-0 overflow-hidden rounded-2xl"
						style={{ padding: 0 }}
					>
						<div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface)">
							<div>
								<h3 className="text-base font-bold m-0">
									Delete partner?
								</h3>
								<p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
									This cannot be undone. Referred leads are
									kept, just unlinked.
								</p>
							</div>
							<button
								className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
								onClick={() => {
									if (!deleteMutation.isPending)
										setDeletingPartner(null);
								}}
							>
								<X size={16} />
							</button>
						</div>
						<div className="p-6 flex flex-col gap-4">
							<p className="text-[0.875rem] text-(--color-text) m-0 leading-relaxed">
								Delete{" "}
								<strong>
									{deletingPartner &&
										partnerDisplayName(deletingPartner)}
								</strong>
								?
							</p>
							<div className="flex justify-end gap-2">
								<button
									className="btn btn-secondary"
									disabled={deleteMutation.isPending}
									onClick={() => setDeletingPartner(null)}
								>
									Cancel
								</button>
								<button
									className="btn btn-danger"
									disabled={deleteMutation.isPending}
									onClick={confirmDelete}
								>
									{deleteMutation.isPending ? (
										<Loader2
											size={16}
											className="animate-spin"
										/>
									) : null}
									{deleteMutation.isPending
										? "Deleting..."
										: "Delete partner"}
								</button>
							</div>
						</div>
					</div>
				</Modal>

				<Modal
					isOpen={showImportModal}
					onClose={() => {
						setShowImportModal(false);
						setImportResult(null);
					}}
				>
					<div className="card animate-fade-in max-w-120 w-full p-0 overflow-hidden rounded-2xl" style={{ padding: 0 }}>
						<div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface)">
							<div className="flex items-center gap-2.5">
								<div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
									<Download
										size={18}
										className="text-(--color-primary)"
									/>
								</div>
								<div>
									<h3 className="text-base font-bold m-0">
										Import Partners
									</h3>
									<p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
										Bulk add from Excel
									</p>
								</div>
							</div>
							<button
								className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
								onClick={() => {
									setShowImportModal(false);
									setImportResult(null);
								}}
							>
								<X size={16} />
							</button>
						</div>
						{importResult ? (
							<div className="p-6">
								<div className="text-center mb-5">
									<div
										className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${importResult.imported > 0 ? "bg-green-100" : "bg-red-100"}`}
									>
										{importResult.imported > 0 ? (
											<CheckCircle
												size={24}
												className="text-green-600"
											/>
										) : (
											<AlertCircle
												size={24}
												className="text-red-500"
											/>
										)}
									</div>
									<h3 className="text-[1.05rem] font-bold text-(--color-text) m-0 mb-1">
										{importResult.imported} partner
										{importResult.imported !== 1 ? "s" : ""}{" "}
										imported
									</h3>
								</div>
								{importResult.errors.length > 0 && (
									<div className="mb-4 p-3 bg-red-50 rounded-lg text-[0.78rem] max-h-37.5 overflow-y-auto border border-red-200">
										<div className="font-semibold text-red-600 mb-2 flex items-center gap-1.5">
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
													className="text-red-600 p-1 bg-white rounded mb-1 text-[0.75rem]"
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
									className="btn btn-primary w-full py-2.5 rounded-lg font-semibold"
									onClick={() => {
										setShowImportModal(false);
										setImportResult(null);
									}}
								>
									Done
								</button>
							</div>
						) : (
							<div className="p-6">
								<label className="border-2 border-dashed border-(--color-border) rounded-xl p-[32px_24px] text-center cursor-pointer bg-(--color-surface) mb-4 hover:border-(--color-primary) transition-colors block">
									<input
										type="file"
										accept=".xlsx,.xls"
										className="hidden"
										onChange={handleFileImport}
									/>
									<Upload
										size={32}
										className="text-(--color-text-tertiary) mx-auto mb-3 opacity-40"
									/>
									<p className="text-[0.85rem] font-semibold text-(--color-text) m-0 mb-1">
										{importing
											? "Importing..."
											: "Click to upload Excel file"}
									</p>
									<p className="text-[0.72rem] text-(--color-text-tertiary) m-0">
										.xlsx or .xls format
									</p>
								</label>
								<a
									href={apiUrl("/partners/import/sample")}
									className="flex items-center justify-center gap-1.5 text-[0.8rem] font-medium text-(--color-primary) no-underline"
								>
									Download sample format
								</a>
							</div>
						)}
					</div>
				</Modal>

				<FilePreviewModal
					isOpen={!!previewFile}
					onClose={() => {
						if (previewFile?.url.startsWith("blob:"))
							URL.revokeObjectURL(previewFile.url);
						setPreviewFile(null);
					}}
					fileUrl={previewFile?.url || ""}
					fileType={previewFile?.type || ""}
					fileName={previewFile?.name || ""}
				/>
			</div>
		</>
	);
};

export default Partners;
