import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
	Search,
	RefreshCw,
	ChevronRight,
	FolderOpen,
	PhoneCall,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { useCrmSocket } from "../../hooks/useCrmSocket";
import useDebounce from "../../lib/useDebounce";
import CaseFileDetailModal from "./CaseFileDetailModal";
import type { CaseFile, CaseFileStatus } from "./caseFileTypes";

const PRIMARY = "var(--color-primary)";
const SUCCESS = "#16a34a";

const STATUS_META: Record<
	CaseFileStatus,
	{ label: string; color: string; bg: string }
> = {
	in_process: {
		label: "In Process",
		color: "#3b82f6",
		bg: "rgba(59, 130, 246, 0.14)",
	},
	closed: {
		label: "Sanctioned",
		color: "#22c55e",
		bg: "rgba(34, 197, 94, 0.14)",
	},
	lost: { label: "Lost", color: "#ef4444", bg: "rgba(239, 68, 68, 0.14)" },
};

const fmtDate = (d?: string | null) =>
	d
		? new Date(d).toLocaleDateString("en-IN", {
				day: "numeric",
				month: "short",
				year: "numeric",
			})
		: "—";

const Files = (): React.JSX.Element => {
	useCrmSocket();
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const { user: currentUser } = useAuthStore();
	const canManage =
		currentUser?.role === "admin" || currentUser?.role === "manager";

	const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
	useEffect(() => {
		const onResize = () => setIsMobile(window.innerWidth < 768);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const [statusFilter, setStatusFilter] = useState<"all" | CaseFileStatus>(
		"all",
	);
	const [productFilter, setProductFilter] = useState("");
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 350);

	const [selected, setSelected] = useState<CaseFile | null>(null);

	// Server-side paging — mirrors the Partners page pattern.
	const [page, setPage] = useState(1);
	const PAGE_SIZE = 20;

	const {
		data: caseFilesData = { caseFiles: [], total: 0, totalPages: 1 },
		isLoading,
		isFetching,
	} = useQuery<{ caseFiles: CaseFile[]; total: number; totalPages: number }>({
		queryKey: [
			"case-files",
			page,
			statusFilter,
			productFilter,
			debouncedSearch,
		],
		queryFn: async () => {
			const params: Record<string, string | number> = {
				page,
				limit: PAGE_SIZE,
			};
			if (statusFilter !== "all") params.status = statusFilter;
			if (productFilter) params.productId = productFilter;
			if (debouncedSearch) params.search = debouncedSearch;
			const res = await api.get("/case-files", { params });
			return {
				caseFiles: (res.data.caseFiles || []) as CaseFile[],
				total: (res.data.total as number) ?? 0,
				totalPages: (res.data.totalPages as number) || 1,
			};
		},
		// Keep the previous page visible while the next one loads.
		placeholderData: keepPreviousData,
		refetchInterval: 10000,
	});

	const caseFiles = caseFilesData.caseFiles;
	const totalPages = caseFilesData.totalPages;

	// Step back when the current page disappears (filter change or deletion).
	useEffect(() => {
		if (page > totalPages && totalPages > 0) setPage(totalPages);
	}, [page, totalPages]);

	const { data: stats } = useQuery({
		queryKey: ["case-file-stats"],
		queryFn: async () => {
			const res = await api.get("/case-files/stats");
			return res.data.counts || { all: 0, in_process: 0, closed: 0, lost: 0 };
		},
		refetchInterval: 10000,
	});

	const { data: loanProducts = [] } = useQuery<any[]>({
		queryKey: ["loan-products"],
		queryFn: async () =>
			(await api.get("/loan-products")).data.products || [],
	});

	const { data: docStatuses = [] } = useQuery<any[]>({
		queryKey: ["doc-statuses"],
		queryFn: async () =>
			(await api.get("/doc-statuses")).data.docStatuses || [],
	});

	// Deep link support: /crm/files?leadId=<id> opens that lead's
	// caseFile popup (e.g. when a lead is clicked in the partner details
	// modal). The param is cleared immediately so closing the popup or a page
	// refresh doesn't reopen it.
	const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);

	useEffect(() => {
		const leadId = new URLSearchParams(location.search).get("leadId");
		if (!leadId) return;
		navigate("/crm/files", { replace: true });
		if (/^[a-f\d]{24}$/i.test(leadId)) setPendingLeadId(leadId);
	}, [location.search, navigate]);

	const {
		data: deepLinkCaseFile,
		isFetched: deepLinkFetched,
		isError: deepLinkFailed,
	} = useQuery<CaseFile | null>({
		queryKey: ["case-file-by-lead", pendingLeadId],
		queryFn: async () => {
			const res = await api.get("/case-files", {
				params: { leadId: pendingLeadId, limit: 1 },
			});
			return res.data.caseFiles?.[0] || null;
		},
		enabled: !!pendingLeadId,
		retry: false,
	});

	useEffect(() => {
		if (!pendingLeadId || !deepLinkFetched) return;
		if (deepLinkCaseFile) {
			setSelected(deepLinkCaseFile);
		} else if (deepLinkFailed) {
			toast.error("Couldn't open this lead's file");
		} else {
			toast("This lead doesn't have a file yet", { icon: "ℹ️" });
		}
		setPendingLeadId(null);
	}, [pendingLeadId, deepLinkFetched, deepLinkCaseFile, deepLinkFailed]);

	// Keep the open detail modal in sync with live list updates, but never
	// downgrade to a stale list row right after an edit (the list refetch is
	// async, the modal response is fresh).
	const selectedLive = useMemo(() => {
		if (!selected) return null;
		const fromList = caseFiles.find((c) => c._id === selected._id);
		if (!fromList) return selected;
		const selectedAt = new Date(selected.updatedAt || 0).getTime();
		const listAt = new Date(fromList.updatedAt || 0).getTime();
		return listAt >= selectedAt ? fromList : selected;
	}, [caseFiles, selected]);

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["case-files"] });
		queryClient.invalidateQueries({ queryKey: ["case-file-stats"] });
	};

	const openDetail = (c: CaseFile) => setSelected(c);
	const closeDetail = () => setSelected(null);

	return (
		<div style={{ maxWidth: 1400, margin: "0 auto" }}>
			{/* Header */}
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
					marginBottom: 18,
				}}
			>
				<div>
					<h1 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0 }}>
						Files
					</h1>
					<p
						style={{
							margin: "4px 0 0",
							fontSize: "0.85rem",
							color: "var(--color-text-secondary)",
						}}
					>
						Converted leads, document checklists & closure
					</p>
				</div>
				<button
					className="btn btn-secondary btn-sm"
					onClick={() => {
						queryClient.invalidateQueries({ queryKey: ["case-files"] });
						queryClient.invalidateQueries({
							queryKey: ["case-file-stats"],
						});
					}}
				>
					<RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
					Refresh
				</button>
			</div>

			{/* Stat cards — click to filter */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
					gap: 12,
					marginBottom: 16,
				}}
			>
				{(["all", "in_process", "closed", "lost"] as const).map((key) => {
					const meta =
						key === "all"
							? { label: "All Files", color: "#6366f1" }
							: STATUS_META[key];
					const value =
						key === "all"
							? ((stats as any)?.all ?? 0)
							: ((stats as any)?.[key] ?? 0);
					const active = statusFilter === key;
					return (
						<button
							key={key}
							type="button"
							onClick={() => {
								setStatusFilter(key);
								setPage(1);
							}}
							className="card"
							style={{
								padding: "12px 16px",
								textAlign: "left",
								cursor: "pointer",
								border: `1.5px solid ${active ? meta.color : "var(--color-border)"}`,
								background: "var(--color-surface)",
							}}
						>
							<div style={{ fontSize: "1.5rem", fontWeight: 800 }}>
								{value}
							</div>
							<div
								style={{
									fontSize: "0.76rem",
									fontWeight: 700,
									color: meta.color,
									letterSpacing: "0.03em",
									textTransform: "uppercase",
								}}
							>
								{meta.label}
							</div>
						</button>
					);
				})}
			</div>

			{/* Toolbar */}
			<div
				className="card"
				style={{
					padding: 12,
					display: "flex",
					flexWrap: "wrap",
					gap: 10,
					alignItems: "center",
					marginBottom: 14,
				}}
			>
				<div style={{ position: "relative", flex: "1 1 220px" }}>
					<Search
						size={15}
						style={{
							position: "absolute",
							left: 10,
							top: "50%",
							transform: "translateY(-50%)",
							color: "var(--color-text-tertiary)",
						}}
					/>
					<input
						className="input"
						style={{ paddingLeft: 32, width: "100%" }}
						placeholder="Search lead, company or phone..."
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(1);
						}}
					/>
				</div>
				<select
					className="select"
					style={
						isMobile
							? { width: "100%", flex: "1 1 100%" }
							: { width: 230, flex: "0 0 auto", minWidth: 190 }
					}
					value={productFilter}
					onChange={(e) => {
						setProductFilter(e.target.value);
						setPage(1);
					}}
				>
					<option value="">All products</option>
					{loanProducts.map((p: any) => (
						<option key={p._id} value={p._id}>
							{p.name}
						</option>
					))}
				</select>
			</div>

			{/* List */}
			{isLoading ? (
				<div
					className="card"
					style={{
						padding: 24,
						textAlign: "center",
						color: "var(--color-text-tertiary)",
					}}
				>
					Loading caseFiles...
				</div>
			) : caseFiles.length === 0 ? (
				<div className="card" style={{ padding: 36, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
					<FolderOpen
						size={34}
						style={{
							color: "var(--color-text-tertiary)",
							marginBottom: 10,
						}}
					/>
					<div style={{ fontWeight: 600 }}>No caseFiles yet</div>
					<div
						style={{
							fontSize: "0.85rem",
							color: "var(--color-text-secondary)",
							marginTop: 4,
						}}
					>
						Mark a lead as Closed Won in the Dial Queue — it will show up
						here.
					</div>
				</div>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
					{caseFiles.map((c) => {
						const meta = STATUS_META[c.status];
						const checkpoints = c.checkpoints || [];
						const completed = checkpoints.filter((cp) => cp.complete).length;
						const percent = c.overallPercent ?? 0;
						const currentLabel =
							c.status === "lost"
								? "Lost"
								: c.status === "closed"
									? "Sanctioned"
									: checkpoints.find((cp) => !cp.complete)?.label ||
										"Ready to sanction";

						const nameBlock = (
							<div style={{ minWidth: 0 }}>
								<div
									style={{
										fontWeight: 700,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{c.companyName || "No company name available"}
								</div>
								<div
									style={{
										fontSize: "0.78rem",
										color: "var(--color-text-secondary)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{[c.leadName || "No name available", c.phone]
										.filter(Boolean)
										.join(" · ") || "—"}
								</div>
							</div>
						);

						const productBlock = (
							<div style={{ fontSize: "0.82rem", minWidth: 0 }}>
								{c.productId ? (
									<span
										className="badge"
										style={{
											background: "rgba(99, 102, 241, 0.14)",
											color: "#6366f1",
											fontWeight: 600,
										}}
									>
										{c.productId.name}
									</span>
								) : (
									<span
										style={{
											color: "#f59e0b",
											fontSize: "0.78rem",
											fontWeight: 600,
										}}
									>
										Set product
									</span>
								)}
							</div>
						);

						const progressBlock = (
							<div
								style={{
									fontSize: "0.8rem",
									color: "var(--color-text-secondary)",
									minWidth: 0,
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 8,
									}}
								>
									<span style={{ fontWeight: 600, color: "var(--color-text)" }}>
										{currentLabel}
									</span>
									<span style={{ fontSize: "0.72rem", color: "var(--color-text-tertiary)" }}>
										{completed}/{checkpoints.length}
									</span>
								</div>
								<div
									style={{
										height: 5,
										borderRadius: 3,
										background: "var(--color-border)",
										marginTop: 5,
										width: "100%",
										overflow: "hidden",
									}}
								>
									<div
										style={{
											height: "100%",
											width: `${percent}%`,
											background:
												c.status === "lost"
													? "#ef4444"
													: percent === 100
														? SUCCESS
														: PRIMARY,
											transition: "width 0.3s ease",
										}}
									/>
								</div>
							</div>
						);

						const statusBlock = (
							<span
								className="badge"
								style={{
									background: meta.bg,
									color: meta.color,
									fontWeight: 600,
									flex: "0 0 auto",
								}}
							>
								{meta.label}
							</span>
						);

						const dateBlock = (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: 8,
									color: "var(--color-text-tertiary)",
									fontSize: "0.75rem",
									flex: "0 0 auto",
								}}
							>
								{fmtDate(c.convertedAt)}
								<ChevronRight size={15} />
							</div>
						);

						const dialButton = (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									navigate(`/crm/dial?leadId=${c.leadId}`);
								}}
								title="Open lead in Dial Queue"
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 4,
									padding: "3px 8px",
									borderRadius: 999,
									fontSize: "0.68rem",
									fontWeight: 600,
									cursor: "pointer",
									border: "1px solid var(--color-border)",
									background: "var(--color-surface)",
									color: "var(--color-text-secondary)",
									flex: "0 0 auto",
								}}
							>
								<PhoneCall size={11} /> Dial
							</button>
						);

						return (
							<div
								key={c._id}
								role="button"
								tabIndex={0}
								className="card"
								onClick={() => openDetail(c)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										openDetail(c);
									}
								}}
								style={
									isMobile
										? {
												padding: "12px 14px",
												textAlign: "left",
												cursor: "pointer",
												display: "flex",
												flexDirection: "column",
												gap: 8,
												background: "var(--color-surface)",
											}
										: {
												padding: "14px 16px",
												textAlign: "left",
												cursor: "pointer",
												display: "grid",
												gridTemplateColumns:
													"minmax(0, 1.3fr) minmax(0, 0.8fr) minmax(0, 1.1fr) 96px 108px",
												gap: 14,
												alignItems: "center",
												background: "var(--color-surface)",
											}
								}
							>
								{isMobile ? (
									<>
										<div
											style={{
												display: "flex",
												alignItems: "flex-start",
												justifyContent: "space-between",
												gap: 8,
											}}
										>
											<div style={{ flex: 1, minWidth: 0 }}>
												{nameBlock}
											</div>
											{statusBlock}
										</div>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												gap: 8,
												flexWrap: "wrap",
											}}
										>
											{productBlock}
											{dialButton}
										</div>
										{progressBlock}
										<div
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
											}}
										>
											{dateBlock}
										</div>
									</>
								) : (
									<>
										{nameBlock}
										{productBlock}
										{progressBlock}
										{statusBlock}
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												justifyContent: "flex-end",
											}}
										>
											{dialButton}
											{dateBlock}
										</div>
									</>
								)}
							</div>
						);
					})}
				</div>
			)}

			{/* Pagination */}
			{!isLoading && caseFiles.length > 0 && totalPages > 1 && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 12,
						flexWrap: "wrap",
						padding: "16px 0 4px",
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
								page >= totalPages ? "not-allowed" : "pointer",
						}}
					>
						Next
					</button>
				</div>
			)}

			{/* Detail modal */}
			{selectedLive ? (
				<CaseFileDetailModal
					caseFile={selectedLive}
					isMobile={isMobile}
					canManage={canManage}
					docStatuses={docStatuses}
					loanProducts={loanProducts}
					onClose={closeDetail}
					onChanged={(next) => setSelected(next)}
					onDeleted={() => {
						closeDetail();
						invalidate();
					}}
				/>
			) : null}
		</div>
	);
};

export default Files;
