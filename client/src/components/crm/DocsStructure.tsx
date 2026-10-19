import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
	Plus,
	Trash2,
	ArrowUp,
	ArrowDown,
	ArrowLeft,
	Search,
	FileText,
	X,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { useCrmSocket } from "../../hooks/useCrmSocket";
import Modal from "../common/Modal";

const labelStyle: React.CSSProperties = {
	display: "block",
	fontSize: "0.8125rem",
	fontWeight: 500,
	marginBottom: 6,
	color: "var(--color-text-secondary)",
};

const chipStyle = (active: boolean, color: string): React.CSSProperties => ({
	padding: "4px 10px",
	borderRadius: 999,
	fontSize: "0.72rem",
	fontWeight: 600,
	cursor: "pointer",
	border: `1px solid ${active ? color : "var(--color-border)"}`,
	background: active ? `${color}22` : "transparent",
	color: active ? color : "var(--color-text-tertiary)",
	transition: "all 0.15s ease",
});

interface ProductDraft {
	name: string;
	description: string;
	isActive: boolean;
	docs: { name: string; required: boolean }[];
}

const DocsStructure = (): React.JSX.Element => {
	useCrmSocket();
	const queryClient = useQueryClient();
	const { user: currentUser } = useAuthStore();
	const canManage =
		currentUser?.role === "admin" || currentUser?.role === "manager";

	const [tab, setTab] = useState<"products" | "statuses">("products");

	// On mobile the products tab works as a list ⇄ editor flow, so the
	// selected product's documents are always reachable no matter how many
	// products exist.
	const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
	useEffect(() => {
		const onResize = () => setIsMobile(window.innerWidth < 768);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	// ----- Products tab -----
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState<ProductDraft | null>(null);
	const [newDocName, setNewDocName] = useState("");
	const [saving, setSaving] = useState(false);
	const [showNewProduct, setShowNewProduct] = useState(false);
	const [newProduct, setNewProduct] = useState({ name: "", description: "" });
	const [productSearch, setProductSearch] = useState("");
	const [mobileDetail, setMobileDetail] = useState(false);
	const editorRef = useRef<HTMLDivElement | null>(null);

	const { data: products = [], isLoading } = useQuery<any[]>({
		queryKey: ["loan-products"],
		queryFn: async () =>
			(await api.get("/loan-products")).data.products || [],
	});

	const { data: docStatuses = [] } = useQuery<any[]>({
		queryKey: ["doc-statuses"],
		queryFn: async () =>
			(await api.get("/doc-statuses")).data.docStatuses || [],
	});

	const selected = useMemo(
		() => products.find((p) => p._id === selectedId) || null,
		[products, selectedId],
	);

	const filteredProducts = useMemo(() => {
		const q = productSearch.trim().toLowerCase();
		if (!q) return products;
		return products.filter((p: any) =>
			(p.name || "").toLowerCase().includes(q),
		);
	}, [products, productSearch]);

	// Drop back to the list if the open product disappears (e.g. deleted).
	useEffect(() => {
		if (isMobile && mobileDetail && !selected) setMobileDetail(false);
	}, [isMobile, mobileDetail, selected]);

	// Load the draft when the selected product changes (not on live refetches
	// of the same product — that would clobber in-progress edits).
	useEffect(() => {
		if (selected) {
			setDraft({
				name: selected.name || "",
				description: selected.description || "",
				isActive: selected.isActive !== false,
				docs: (selected.docs || []).map((d: any) => ({
					name: d.name,
					required: d.required !== false,
				})),
			});
			setNewDocName("");
		} else {
			setDraft(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selected?._id]);

	const dirty = useMemo(() => {
		if (!selected || !draft) return false;
		const base: ProductDraft = {
			name: selected.name || "",
			description: selected.description || "",
			isActive: selected.isActive !== false,
			docs: (selected.docs || []).map((d: any) => ({
				name: d.name,
				required: d.required !== false,
			})),
		};
		return JSON.stringify(base) !== JSON.stringify(draft);
	}, [selected, draft]);

	const scrollMainTop = () => {
		requestAnimationFrame(() => {
			document
				.getElementById("main-content-scroll")
				?.scrollTo({ top: 0, behavior: "auto" });
		});
	};

	const selectProduct = (id: string) => {
		setSelectedId(id);
		if (isMobile) {
			// Drill into the editor view on mobile.
			setMobileDetail(true);
			scrollMainTop();
		} else {
			// Make sure the editor is visible when picking from a long list.
			const el = editorRef.current;
			if (el && el.getBoundingClientRect().top < 0) {
				el.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		}
	};

	const backToProducts = () => {
		setMobileDetail(false);
		scrollMainTop();
	};

	const invalidateProducts = () => {
		queryClient.invalidateQueries({ queryKey: ["loan-products"] });
		queryClient.invalidateQueries({ queryKey: ["case-files"] });
		queryClient.invalidateQueries({ queryKey: ["case-file-stats"] });
	};

	const saveDraft = async () => {
		if (!selected || !draft) return;
		if (!draft.name.trim()) {
			toast.error("Product name is required");
			return;
		}
		setSaving(true);
		try {
			const { data } = await api.put(`/loan-products/${selected._id}`, {
				name: draft.name.trim(),
				description: draft.description.trim(),
				isActive: draft.isActive,
				docs: draft.docs
					.filter((d) => d.name.trim())
					.map((d) => ({ name: d.name.trim(), required: d.required })),
			});
			if (data.success) {
				const p = data.product;
				setDraft({
					name: p.name || "",
					description: p.description || "",
					isActive: p.isActive !== false,
					docs: (p.docs || []).map((d: any) => ({
						name: d.name,
						required: d.required !== false,
					})),
				});
				invalidateProducts();
				if (data.syncedCaseFiles > 0) {
					toast.success(
						`Saved — checklist updated on ${data.syncedCaseFiles} in-process file${
							data.syncedCaseFiles > 1 ? "s" : ""
						}`,
					);
				} else {
					toast.success("Product saved");
				}
			}
		} catch (err: any) {
			toast.error(err?.response?.data?.message || "Failed to save product");
		} finally {
			setSaving(false);
		}
	};

	const createProduct = async () => {
		if (!newProduct.name.trim()) {
			toast.error("Product name is required");
			return;
		}
		try {
			const { data } = await api.post("/loan-products", {
				name: newProduct.name.trim(),
				description: newProduct.description.trim(),
			});
			if (data.success) {
				toast.success("Product created");
				setShowNewProduct(false);
				setNewProduct({ name: "", description: "" });
				await queryClient.invalidateQueries({ queryKey: ["loan-products"] });
				selectProduct(data.product._id);
			}
		} catch (err: any) {
			toast.error(err?.response?.data?.message || "Failed to create product");
		}
	};

	const deleteProduct = async () => {
		if (!selected) return;
		if (!window.confirm(`Delete "${selected.name}"? This cannot be undone.`))
			return;
		try {
			await api.delete(`/loan-products/${selected._id}`);
			toast.success("Product removed");
			setSelectedId(null);
			invalidateProducts();
		} catch (err: any) {
			toast.error(err?.response?.data?.message || "Failed to delete product");
		}
	};

	const addDoc = () => {
		const n = newDocName.trim();
		if (!n || !draft) return;
		setDraft({ ...draft, docs: [...draft.docs, { name: n, required: true }] });
		setNewDocName("");
	};

	const updateDoc = (
		i: number,
		patch: Partial<{ name: string; required: boolean }>,
	) => {
		if (!draft) return;
		setDraft({
			...draft,
			docs: draft.docs.map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
		});
	};

	const removeDoc = (i: number) => {
		if (!draft) return;
		setDraft({ ...draft, docs: draft.docs.filter((_, idx) => idx !== i) });
	};

	const moveDoc = (i: number, dir: -1 | 1) => {
		if (!draft) return;
		const j = i + dir;
		if (j < 0 || j >= draft.docs.length) return;
		const next = [...draft.docs];
		[next[i], next[j]] = [next[j], next[i]];
		setDraft({ ...draft, docs: next });
	};

	// ----- Statuses tab -----
	const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
	const [colorDrafts, setColorDrafts] = useState<Record<string, string>>({});
	const [newStatus, setNewStatus] = useState({
		name: "",
		color: "#3b82f6",
		isDefault: false,
		isResolved: false,
	});
	const [statusReorderBusy, setStatusReorderBusy] = useState(false);

	const invalidateStatuses = () => {
		queryClient.invalidateQueries({ queryKey: ["doc-statuses"] });
		queryClient.invalidateQueries({ queryKey: ["case-files"] });
	};

	const createStatus = async () => {
		if (!newStatus.name.trim()) {
			toast.error("Status name is required");
			return;
		}
		try {
			await api.post("/doc-statuses", {
				...newStatus,
				name: newStatus.name.trim(),
			});
			toast.success("Status added");
			setNewStatus({ name: "", color: "#3b82f6", isDefault: false, isResolved: false });
			invalidateStatuses();
		} catch (err: any) {
			toast.error(err?.response?.data?.message || "Failed to add status");
		}
	};

	const updateStatus = async (s: any, patch: any) => {
		try {
			await api.put(`/doc-statuses/${s._id}`, patch);
			invalidateStatuses();
		} catch (err: any) {
			toast.error(
				err?.response?.data?.message || "Failed to update status",
			);
		}
	};

	const deleteStatus = async (s: any) => {
		if (!window.confirm(`Delete the "${s.name}" status?`)) return;
		try {
			await api.delete(`/doc-statuses/${s._id}`);
			toast.success("Status removed");
			invalidateStatuses();
		} catch (err: any) {
			toast.error(err?.response?.data?.message || "Failed to delete status");
		}
	};

	const moveStatus = async (i: number, dir: -1 | 1) => {
		const j = i + dir;
		if (statusReorderBusy || j < 0 || j >= docStatuses.length) return;
		const next = [...docStatuses];
		[next[i], next[j]] = [next[j], next[i]];
		// Optimistic — flip instantly, persist in the background.
		queryClient.setQueryData(["doc-statuses"], next);
		setStatusReorderBusy(true);
		try {
			await api.put("/doc-statuses/reorder", {
				ids: next.map((s: any) => s._id),
			});
		} catch (err: any) {
			toast.error(
				err?.response?.data?.message || "Failed to reorder statuses",
			);
		} finally {
			setStatusReorderBusy(false);
			invalidateStatuses();
		}
	};

	return (
		<div style={{ maxWidth: 1400, margin: "0 auto" }}>
			{/* Header */}
			<div style={{ marginBottom: 16 }}>
				<h1 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0 }}>
					Docs Structure
				</h1>
				<p
					style={{
						margin: "4px 0 0",
						fontSize: "0.85rem",
						color: "var(--color-text-secondary)",
					}}
				>
					Define loan products, their required documents, and the document
					statuses used across all files.
				</p>
			</div>

			{!canManage ? (
				<div
					style={{
						padding: "8px 12px",
						borderRadius: 8,
						background: "rgba(245, 158, 11, 0.12)",
						color: "#b45309",
						fontSize: "0.78rem",
						marginBottom: 16,
					}}
				>
					Read-only — only Admin/Manager can edit the docs structure.
				</div>
			) : null}

			{/* Tabs */}
			<div
				style={{
					display: "flex",
					gap: 8,
					marginBottom: 16,
					flexWrap: "wrap",
				}}
			>
				<button
					type="button"
					className={`btn btn-sm ${
						tab === "products" ? "btn-primary" : "btn-secondary"
					}`}
					style={isMobile ? { flex: "1 1 auto" } : undefined}
					onClick={() => setTab("products")}
				>
					Products & Documents
				</button>
				<button
					type="button"
					className={`btn btn-sm ${
						tab === "statuses" ? "btn-primary" : "btn-secondary"
					}`}
					style={isMobile ? { flex: "1 1 auto" } : undefined}
					onClick={() => setTab("statuses")}
				>
					Document Statuses
				</button>
			</div>

			{tab === "products" ? (
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 16,
						alignItems: "flex-start",
					}}
				>
					{/* Product list (mobile: the "master" view of the flow) */}
					<div
						className="card"
						style={{
							flex: "1 1 240px",
							maxWidth: isMobile ? "none" : 340,
							padding: 14,
							display: isMobile && mobileDetail ? "none" : undefined,
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 10,
								gap: 8,
							}}
						>
							<strong style={{ fontSize: "0.9rem" }}>
								Products
								<span
									style={{
										fontWeight: 400,
										fontSize: "0.75rem",
										color: "var(--color-text-tertiary)",
										marginLeft: 6,
									}}
								>
									{productSearch.trim()
										? `${filteredProducts.length} of ${products.length}`
										: products.length}
								</span>
							</strong>
							<button
								type="button"
								className="btn btn-primary btn-xs"
								onClick={() => setShowNewProduct(true)}
								disabled={!canManage}
							>
								<Plus size={13} />
								Add
							</button>
						</div>
						<div style={{ position: "relative", marginBottom: 10 }}>
							<Search
								size={14}
								style={{
									position: "absolute",
									left: 9,
									top: "50%",
									transform: "translateY(-50%)",
									color: "var(--color-text-tertiary)",
									pointerEvents: "none",
								}}
							/>
							<input
								className="input"
								style={{
									paddingLeft: 28,
									paddingTop: 7,
									paddingBottom: 7,
									fontSize: "0.84rem",
								}}
								placeholder="Search products..."
								value={productSearch}
								onChange={(e) => setProductSearch(e.target.value)}
								disabled={isLoading || products.length === 0}
							/>
						</div>
						{isLoading ? (
							<div
								style={{
									fontSize: "0.82rem",
									color: "var(--color-text-tertiary)",
									padding: 8,
								}}
							>
								Loading...
							</div>
						) : products.length === 0 ? (
							<div
								style={{
									fontSize: "0.82rem",
									color: "var(--color-text-tertiary)",
									padding: 8,
								}}
							>
								No products yet — add your first loan product.
							</div>
						) : filteredProducts.length === 0 ? (
							<div
								style={{
									fontSize: "0.82rem",
									color: "var(--color-text-tertiary)",
									padding: 8,
								}}
							>
								No products match “{productSearch.trim()}”.
							</div>
						) : (
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 8,
								}}
							>
								{filteredProducts.map((p: any) => (
									<button
										key={p._id}
										type="button"
										onClick={() => selectProduct(p._id)}
										className="card"
										style={{
											width: "100%",
											textAlign: "left",
											cursor: "pointer",
											padding: "10px 12px",
											border:
												p._id === selectedId
													? "1.5px solid #6366f1"
													: "1.5px solid var(--color-border)",
											background: "var(--color-surface)",
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
											<span
												style={{
													fontWeight: 600,
													fontSize: "0.875rem",
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
												}}
											>
												{p.name}
											</span>
											{p.isActive === false ? (
												<span
													style={{
														fontSize: "0.68rem",
														color: "var(--color-text-tertiary)",
														border: "1px solid var(--color-border)",
														borderRadius: 999,
														padding: "1px 7px",
														flex: "0 0 auto",
													}}
												>
													Inactive
												</span>
											) : null}
										</div>
										<div
											style={{
												fontSize: "0.75rem",
												color: "var(--color-text-tertiary)",
												marginTop: 4,
											}}
										>
											{(p.docs || []).length} document
											{(p.docs || []).length === 1 ? "" : "s"}
											{p.usageCount > 0 ? ` · used by ${p.usageCount}` : ""}
										</div>
									</button>
								))}
							</div>
						)}
					</div>

					{/* Product editor */}
					{draft && selected ? (
						<div
							ref={editorRef}
							className="card"
							style={{
								flex: "2 1 420px",
								padding: isMobile ? 14 : 18,
								display: isMobile && !mobileDetail ? "none" : undefined,
							}}
						>
							{isMobile ? (
								<button
									type="button"
									className="btn btn-ghost btn-sm"
									onClick={backToProducts}
									style={{ marginBottom: 6 }}
								>
									<ArrowLeft size={16} />
									All products
								</button>
							) : null}
							<div
								style={{
									display: "grid",
									gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr",
									gap: 12,
									marginBottom: 12,
								}}
							>
								<div>
									<label style={labelStyle}>Product name</label>
									<input
										className="input"
										value={draft.name}
										disabled={!canManage}
										onChange={(e) =>
											setDraft({ ...draft, name: e.target.value })
										}
									/>
								</div>
								<div>
									<label style={labelStyle}>Description (optional)</label>
									<input
										className="input"
										value={draft.description}
										disabled={!canManage}
										onChange={(e) =>
											setDraft({ ...draft, description: e.target.value })
										}
									/>
								</div>
							</div>

							<div style={{ marginBottom: 16 }}>
								<button
									type="button"
									style={chipStyle(
										draft.isActive,
										draft.isActive ? "#22c55e" : "#94a3b8",
									)}
									disabled={!canManage}
									onClick={() =>
										setDraft({ ...draft, isActive: !draft.isActive })
									}
									title="Inactive products can't be picked for new files"
								>
									{draft.isActive ? "Active" : "Inactive"}
								</button>
							</div>

							<label style={labelStyle}>
								Required documents ({draft.docs.length})
							</label>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 8,
									marginBottom: 10,
								}}
							>
								{draft.docs.map((d, i) => (
									<div
										key={i}
										style={{
											display: "flex",
											flexWrap: "wrap",
											alignItems: "center",
											gap: 8,
											rowGap: 6,
											border: "1px solid var(--color-border)",
											borderRadius: 8,
											padding: "6px 10px",
										}}
									>
										<span
											style={{
												fontSize: "0.72rem",
												color: "var(--color-text-tertiary)",
												width: 18,
												flex: "0 0 auto",
											}}
										>
											{i + 1}
										</span>
										<input
											className="input"
											style={{
												flex: "1 1 140px",
												padding: "6px 8px",
												minWidth: 0,
											}}
											value={d.name}
											disabled={!canManage}
											onChange={(e) =>
												updateDoc(i, { name: e.target.value })
											}
										/>
										<button
											type="button"
											style={chipStyle(
												d.required,
												d.required ? "#6366f1" : "#94a3b8",
											)}
											disabled={!canManage}
											onClick={() =>
												updateDoc(i, { required: !d.required })
											}
											title="Required documents are highlighted on the checklist"
										>
											{d.required ? "Required" : "Optional"}
										</button>
										<button
											type="button"
											className="btn btn-ghost btn-xs"
											disabled={!canManage || i === 0}
											onClick={() => moveDoc(i, -1)}
											title="Move up"
										>
											<ArrowUp size={14} />
										</button>
										<button
											type="button"
											className="btn btn-ghost btn-xs"
											disabled={!canManage || i === draft.docs.length - 1}
											onClick={() => moveDoc(i, 1)}
											title="Move down"
										>
											<ArrowDown size={14} />
										</button>
										<button
											type="button"
											className="btn btn-ghost btn-xs"
											disabled={!canManage}
											onClick={() => removeDoc(i)}
											title="Remove document"
										>
											<Trash2 size={14} />
										</button>
									</div>
								))}
								{draft.docs.length === 0 ? (
									<div
										style={{
											fontSize: "0.82rem",
											color: "var(--color-text-tertiary)",
											padding: "8px 2px",
										}}
									>
										No documents yet — add the required documents below.
									</div>
								) : null}
							</div>

							<div
								style={{
									display: "flex",
									gap: 8,
									marginBottom: 16,
									flexWrap: "wrap",
								}}
							>
								<input
									className="input"
									style={{ flex: 1 }}
									placeholder="Add a document (e.g. PAN Card)"
									value={newDocName}
									disabled={!canManage}
									onChange={(e) => setNewDocName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											addDoc();
										}
									}}
								/>
								<button
									type="button"
									className="btn btn-secondary btn-sm"
									onClick={addDoc}
									disabled={!canManage || !newDocName.trim()}
								>
									<Plus size={15} />
									Add
								</button>
							</div>

							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									borderTop: "1px solid var(--color-border)",
									paddingTop: 14,
									gap: 10,
									flexWrap: "wrap",
								}}
							>
								<span
									style={{
										fontSize: "0.75rem",
										color: "var(--color-text-tertiary)",
									}}
								>
									{selected.usageCount > 0
										? `Used by ${selected.usageCount} file${
												selected.usageCount > 1 ? "s" : ""
											} — changes sync to in-process ones.`
										: "Not used by any file yet."}
								</span>
								<div
									style={{
										display: "flex",
										gap: 8,
										flex: isMobile ? "1 1 100%" : undefined,
									}}
								>
									<button
										type="button"
										className="btn btn-danger btn-sm"
										style={isMobile ? { flex: 1 } : undefined}
										onClick={deleteProduct}
										disabled={!canManage || selected.usageCount > 0}
										title={
											selected.usageCount > 0
												? "In use by files — deactivate it instead"
												: "Delete product"
										}
									>
										<Trash2 size={14} />
										Delete
									</button>
									<button
										type="button"
										className="btn btn-primary btn-sm"
										style={isMobile ? { flex: 1 } : undefined}
										onClick={saveDraft}
										disabled={!canManage || !dirty || saving}
									>
										{saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
									</button>
								</div>
							</div>
						</div>
					) : (
						<div
							className="card"
							style={{
								flex: "2 1 420px",
								padding: 36,
								textAlign: "center",
								color: "var(--color-text-tertiary)",
								display: isMobile ? "none" : undefined,
							}}
						>
							<FileText size={30} style={{ marginBottom: 10 }} />
							<div style={{ fontSize: "0.85rem" }}>
								Select a product on the left, or create a new one.
							</div>
						</div>
					)}
				</div>
			) : (
				/* Statuses tab */
				<div className="card" style={{ padding: 18 }}>
					<div style={{ marginBottom: 4 }}>
						<strong style={{ fontSize: "0.95rem" }}>
							Document Statuses
						</strong>
						<div
							style={{
								fontSize: "0.78rem",
								color: "var(--color-text-secondary)",
								marginTop: 2,
							}}
						>
							Used by the document checklist on every file. “Counts as
							done” statuses drive the progress.
						</div>
					</div>

					{docStatuses.map((s: any, idx: number) => {
						const nameDraft = statusDrafts[s._id] ?? s.name;
						const colorDraft = colorDrafts[s._id] ?? s.color;
						return (
							<div
								key={s._id}
								style={{
									display: "flex",
									flexWrap: "wrap",
									alignItems: "center",
									gap: 10,
									padding: "10px 12px",
									border: "1px solid var(--color-border)",
									borderRadius: 8,
									marginTop: 8,
									opacity: s.isActive ? 1 : 0.6,
								}}
							>
								<input
									type="color"
									value={colorDraft}
									disabled={!canManage}
									onChange={(e) =>
										setColorDrafts((p) => ({
											...p,
											[s._id]: e.target.value,
										}))
									}
									onBlur={() => {
										const v = colorDrafts[s._id];
										if (v && v !== s.color) updateStatus(s, { color: v });
										setColorDrafts((p) => {
											const n = { ...p };
											delete n[s._id];
											return n;
										});
									}}
									style={{
										width: 30,
										height: 30,
										padding: 0,
										border: "1px solid var(--color-border)",
										borderRadius: 8,
										background: "none",
										cursor: "pointer",
										flex: "0 0 auto",
									}}
									title="Status color"
								/>
								<input
									className="input"
									style={{ flex: "1 1 160px", minWidth: 120 }}
									value={nameDraft}
									disabled={!canManage}
									onChange={(e) =>
										setStatusDrafts((p) => ({
											...p,
											[s._id]: e.target.value,
										}))
									}
									onBlur={() => {
										const v = (statusDrafts[s._id] ?? s.name).trim();
										if (v && v !== s.name) {
											updateStatus(s, { name: v });
										}
										setStatusDrafts((p) => {
											const n = { ...p };
											delete n[s._id];
											return n;
										});
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") e.currentTarget.blur();
									}}
								/>
								<button
									type="button"
									style={chipStyle(s.isDefault, "#6366f1")}
									disabled={!canManage || s.isDefault}
									onClick={() => updateStatus(s, { isDefault: !s.isDefault })}
									title="Applied to newly added documents"
								>
									{s.isDefault ? "Default" : "Set default"}
								</button>
								<button
									type="button"
									style={chipStyle(s.isResolved, "#22c55e")}
									disabled={!canManage}
									onClick={() => updateStatus(s, { isResolved: !s.isResolved })}
									title="Counts towards document progress"
								>
									{s.isResolved ? "Counts as done" : "Not counted"}
								</button>
								<button
									type="button"
									style={chipStyle(s.isActive, "#3b82f6")}
									disabled={!canManage}
									onClick={() => updateStatus(s, { isActive: !s.isActive })}
									title="Inactive statuses can't be picked on checklists"
								>
									{s.isActive ? "Active" : "Inactive"}
								</button>
								<button
									type="button"
									className="btn btn-ghost btn-xs"
									disabled={!canManage || statusReorderBusy || idx === 0}
									onClick={() => moveStatus(idx, -1)}
									title="Move up"
								>
									<ArrowUp size={14} />
								</button>
								<button
									type="button"
									className="btn btn-ghost btn-xs"
									disabled={
										!canManage ||
										statusReorderBusy ||
										idx === docStatuses.length - 1
									}
									onClick={() => moveStatus(idx, 1)}
									title="Move down"
								>
									<ArrowDown size={14} />
								</button>
								<button
									type="button"
									className="btn btn-ghost btn-xs"
									disabled={!canManage}
									onClick={() => deleteStatus(s)}
									title="Delete status"
								>
									<Trash2 size={14} />
								</button>
							</div>
						);
					})}

					{/* Add status */}
					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							alignItems: "center",
							gap: 10,
							padding: "10px 12px",
							border: "1px dashed var(--color-border)",
							borderRadius: 8,
							marginTop: 14,
						}}
					>
						<input
							type="color"
							value={newStatus.color}
							disabled={!canManage}
							onChange={(e) =>
								setNewStatus({ ...newStatus, color: e.target.value })
							}
							style={{
								width: 30,
								height: 30,
								padding: 0,
								border: "1px solid var(--color-border)",
								borderRadius: 8,
								background: "none",
								cursor: "pointer",
								flex: "0 0 auto",
							}}
							title="New status color"
						/>
						<input
							className="input"
							style={{ flex: "1 1 160px", minWidth: 120 }}
							placeholder="New status (e.g. Under Review)"
							value={newStatus.name}
							disabled={!canManage}
							onChange={(e) =>
								setNewStatus({ ...newStatus, name: e.target.value })
							}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									createStatus();
								}
							}}
						/>
						<button
							type="button"
							style={chipStyle(newStatus.isDefault, "#6366f1")}
							disabled={!canManage}
							onClick={() =>
								setNewStatus({
									...newStatus,
									isDefault: !newStatus.isDefault,
								})
							}
							title="Applied to newly added documents"
						>
							{newStatus.isDefault ? "Default" : "Set default"}
						</button>
						<button
							type="button"
							style={chipStyle(newStatus.isResolved, "#22c55e")}
							disabled={!canManage}
							onClick={() =>
								setNewStatus({
									...newStatus,
									isResolved: !newStatus.isResolved,
								})
							}
							title="Counts towards document progress"
						>
							{newStatus.isResolved ? "Counts as done" : "Not counted"}
						</button>
						<button
							type="button"
							className="btn btn-primary btn-sm"
							disabled={!canManage || !newStatus.name.trim()}
							onClick={createStatus}
						>
							<Plus size={15} />
							Add status
						</button>
					</div>
				</div>
			)}

			{/* New product modal */}
			<Modal
				isOpen={showNewProduct}
				onClose={() => setShowNewProduct(false)}
				zIndex={4960}
			>
				<div
					className="card animate-fade-in"
					style={{
						width: "min(440px, calc(100vw - 32px))",
						padding: 24,
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 18,
						}}
					>
						<h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
							New Loan Product
						</h2>
						<button
							type="button"
							onClick={() => setShowNewProduct(false)}
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
					<div style={{ marginBottom: 12 }}>
						<label style={labelStyle}>Product name</label>
						<input
							className="input"
							autoFocus
							value={newProduct.name}
							onChange={(e) =>
								setNewProduct({ ...newProduct, name: e.target.value })
							}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									createProduct();
								}
							}}
							placeholder="e.g. Home Loan"
						/>
					</div>
					<div style={{ marginBottom: 18 }}>
						<label style={labelStyle}>Description (optional)</label>
						<input
							className="input"
							value={newProduct.description}
							onChange={(e) =>
								setNewProduct({ ...newProduct, description: e.target.value })
							}
							placeholder="Short description"
						/>
					</div>
					<div
						style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
					>
						<button
							type="button"
							className="btn btn-secondary"
							onClick={() => setShowNewProduct(false)}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary"
							disabled={!newProduct.name.trim()}
							onClick={createProduct}
						>
							Create product
						</button>
					</div>
				</div>
			</Modal>
		</div>
	);
};

export default DocsStructure;
