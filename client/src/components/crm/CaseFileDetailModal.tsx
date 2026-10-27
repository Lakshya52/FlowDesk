import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
	Check,
	ChevronDown,
	ChevronRight,
	Circle,
	CircleDot,
	Clock,
	ExternalLink,
	FileText,
	MessageSquare,
	RotateCcw,
	Trash2,
	X,
	AlertTriangle,
	Undo2,
	Pencil,
	Send,
	ShieldCheck,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import Modal from "../common/Modal";
import type {
	Clarification,
	CheckpointKey,
	CaseFile,
	CaseFileDoc,
	CaseFileDocStatus,
	TimelineEntry,
	WorkflowItem,
} from "./caseFileTypes";

interface Props {
	caseFile: CaseFile;
	isMobile: boolean;
	canManage: boolean;
	docStatuses: any[];
	loanProducts: any[];
	onClose: () => void;
	onChanged: (c: CaseFile) => void;
	onDeleted: () => void;
}

const PRIMARY = "var(--color-primary)";
const SUCCESS = "#16a34a";
const DANGER = "var(--color-danger)";

const fmtDate = (d?: string | null) =>
	d
		? new Date(d).toLocaleDateString("en-IN", {
				day: "numeric",
				month: "short",
				year: "numeric",
			})
		: "—";

const fmtDateTime = (d?: string | null) =>
	d
		? new Date(d).toLocaleString("en-IN", {
				day: "numeric",
				month: "short",
				hour: "numeric",
				minute: "2-digit",
			})
		: "—";

const initials = (name?: string) =>
	(name || "U")
		.split(" ")
		.filter(Boolean)
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

const userName = (u: any) =>
	typeof u === "object" && u ? u.name || "User" : "System";

const CLARIFICATION_QUICK_REASONS = [
	"Not eligible",
	"Customer declined",
	"Better offer elsewhere",
	"Documents incomplete",
	"Bank rejected",
	"Duplicate lead",
];

// ─────────────────────────────────────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────────────────────────────────────

const Stepper: React.FC<{
	caseFile: CaseFile;
	isMobile: boolean;
	onSelect?: (key: CheckpointKey) => void;
}> = ({ caseFile, isMobile, onSelect }) => {
	const checkpoints = caseFile.checkpoints || [];
	const currentIdx = checkpoints.findIndex((c) => !c.complete);
	const completedCount = checkpoints.filter((c) => c.complete).length;
	const terminal = caseFile.status === "closed" || caseFile.status === "lost";
	const sanctioned = caseFile.status === "closed";
	const lost = caseFile.status === "lost";
	// Last reached step: the current incomplete one, or the final step when
	// everything is complete. Used to colour the connector line.
	const reachedIdx = currentIdx === -1 ? checkpoints.length - 1 : currentIdx;

	return (
		<div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 20 }}>
			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: "flex",
					alignItems: "flex-start",
					overflowX: "auto",
					paddingBottom: 2,
				}}
				className="hide-scrollbar"
			>
				{checkpoints.map((cp, idx) => {
					const isComplete = cp.complete;
					const isCurrent =
						!terminal && (currentIdx === -1 ? idx === checkpoints.length - 1 : idx === currentIdx);
					const isLast = idx === checkpoints.length - 1;
					const filled = isComplete || idx < currentIdx;
					const color = filled
						? PRIMARY
						: isCurrent
							? lost
								? DANGER
								: sanctioned
									? SUCCESS
									: PRIMARY
							: "var(--color-border)";

					return (
						<div
							key={cp.key}
							onClick={() => onSelect?.(cp.key)}
							role={onSelect ? "button" : undefined}
							tabIndex={onSelect ? 0 : undefined}
							onKeyDown={(e) => {
								if (onSelect && (e.key === "Enter" || e.key === " ")) {
									e.preventDefault();
									onSelect(cp.key);
								}
							}}
							title={`Open ${cp.label}`}
							style={{
								display: "flex",
								alignItems: "flex-start",
								flex: isLast ? "0 0 auto" : 1,
								minWidth: isMobile ? 64 : 0,
								cursor: onSelect ? "pointer" : "default",
							}}
						>
							<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
								<div
									style={{
										width: 34,
										height: 34,
										borderRadius: 999,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flex: "0 0 auto",
										background: filled ? PRIMARY : "var(--color-surface)",
										border: `2px solid ${color}`,
										color: filled ? "#fff" : color,
										boxShadow: isCurrent
											? `0 0 0 4px color-mix(in srgb, ${
													lost ? "var(--color-danger)" : sanctioned ? "#16a34a" : "var(--color-primary)"
												} 14%, transparent)`
											: "none",
										transition: "all 0.2s ease",
									}}
									title={`${cp.label}: ${cp.done}/${cp.total}`}
								>
									{filled ? (
										<Check size={17} strokeWidth={3} />
									) : isCurrent ? (
										<span
											style={{
												width: 8,
												height: 8,
												borderRadius: 999,
												background: color,
											}}
										/>
									) : (
										<Circle size={9} fill="var(--color-border)" stroke="none" />
									)}
								</div>
								<span
									style={{
										fontSize: "0.68rem",
										fontWeight: isCurrent ? 700 : 600,
										color: isCurrent || isComplete ? "var(--color-text)" : "var(--color-text-tertiary)",
										textAlign: "center",
										lineHeight: 1.2,
										maxWidth: 92,
										whiteSpace: isMobile ? "nowrap" : "normal",
									}}
								>
									{cp.label}
								</span>
							</div>
							{!isLast ? (
								<div
									style={{
										flex: 1,
										height: 2,
										marginTop: 17,
										marginLeft: 4,
										marginRight: 4,
										minWidth: 14,
										background: idx < reachedIdx ? PRIMARY : "var(--color-border)",
										borderRadius: 2,
										transition: "background 0.2s ease",
									}}
								/>
							) : null}
						</div>
					);
				})}
			</div>

			{/* Progress ring */}
			<div
				style={{
					flex: "0 0 auto",
					position: "relative",
					width: isMobile ? 62 : 74,
					height: isMobile ? 62 : 74,
				}}
				title={`${completedCount} of ${checkpoints.length} checkpoints complete`}
			>
				<svg viewBox="0 0 80 80" width="100%" height="100%">
					<circle cx="40" cy="40" r="33" fill="none" stroke="var(--color-border)" strokeWidth="7" />
					<circle
						cx="40"
						cy="40"
						r="33"
						fill="none"
						stroke={caseFile.status === "lost" ? DANGER : caseFile.status === "closed" ? SUCCESS : PRIMARY}
						strokeWidth="7"
						strokeLinecap="round"
						strokeDasharray={`${2 * Math.PI * 33}`}
						strokeDashoffset={`${2 * Math.PI * 33 * (1 - (caseFile.overallPercent || 0) / 100)}`}
						transform="rotate(-90 40 40)"
						style={{ transition: "stroke-dashoffset 0.4s ease" }}
					/>
				</svg>
				<div
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						lineHeight: 1.1,
					}}
				>
					<span
						style={{
							fontSize: "0.55rem",
							fontWeight: 600,
							color: "var(--color-text-tertiary)",
							textTransform: "uppercase",
							letterSpacing: "0.05em",
						}}
					>
						Status
					</span>
					<span style={{ fontSize: isMobile ? "0.72rem" : "0.82rem", fontWeight: 800 }}>
						{completedCount} of {checkpoints.length}
					</span>
					<span style={{ fontSize: "0.58rem", color: "var(--color-text-tertiary)" }}>
						{caseFile.overallPercent || 0}%
					</span>
				</div>
			</div>
		</div>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────────────────────

const ProgressBar: React.FC<{ percent: number; complete?: boolean; lost?: boolean }> = ({
	percent,
	complete,
	lost,
}) => (
	<div
		style={{
			height: 6,
			borderRadius: 999,
			background: "var(--color-border)",
			overflow: "hidden",
			flex: 1,
			minWidth: 60,
		}}
	>
		<div
			style={{
				height: "100%",
				width: `${Math.min(100, Math.max(0, percent))}%`,
				borderRadius: 999,
				background: lost ? DANGER : complete ? SUCCESS : PRIMARY,
				transition: "width 0.3s ease",
			}}
		/>
	</div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint accordion
// ─────────────────────────────────────────────────────────────────────────────

const CheckpointCard: React.FC<{
	id: CheckpointKey;
	title: string;
	icon: React.ReactNode;
	done: number;
	total: number;
	percent: number;
	complete: boolean;
	open: boolean;
	isCurrent: boolean;
	onToggle: () => void;
	children: React.ReactNode;
	accent?: string;
	/** Overrides the right-hand "done/total" label (e.g. "None needed"). */
	summary?: string;
}> = ({ id, title, icon, done, total, percent, complete, open, isCurrent, onToggle, children, accent, summary }) => (
	<div
		id={`checkpoint-${id}`}
		className="card"
		style={{
			padding: 0,
			overflow: "hidden",
			border: `1px solid ${isCurrent ? "color-mix(in srgb, var(--color-primary) 45%, transparent)" : "var(--color-border)"}`,
			boxShadow: isCurrent ? "0 1px 10px color-mix(in srgb, var(--color-primary) 10%, transparent)" : "none",
		}}
	>
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			style={{
				width: "100%",
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "11px 12px",
				background: "transparent",
				border: "none",
				cursor: "pointer",
				textAlign: "left",
			}}
		>
			<div
				style={{
					width: 28,
					height: 28,
					borderRadius: 999,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					flex: "0 0 auto",
					background: complete ? "color-mix(in srgb, #16a34a 14%, transparent)" : "var(--color-primary-light)",
					color: complete ? SUCCESS : (accent || PRIMARY),
				}}
			>
				{complete ? <Check size={15} strokeWidth={3} /> : icon}
			</div>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
					<span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{title}</span>
					{isCurrent ? (
						<span
							className="badge"
							style={{
								fontSize: "0.58rem",
								padding: "1px 6px",
								background: "var(--color-primary-light)",
								color: PRIMARY,
								fontWeight: 700,
								letterSpacing: "0.03em",
							}}
						>
							CURRENT
						</span>
					) : null}
					{complete ? (
						<span style={{ fontSize: "0.66rem", color: SUCCESS, fontWeight: 600 }}>Done</span>
					) : null}
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
					<ProgressBar percent={percent} complete={complete} />
					<span
						style={{
							fontSize: "0.68rem",
							color: "var(--color-text-tertiary)",
							fontWeight: 600,
							flex: "0 0 auto",
							minWidth: 34,
							textAlign: "right",
						}}
					>
						{summary || `${done}/${total}`}
					</span>
				</div>
			</div>
			<ChevronDown
				size={16}
				style={{
					flex: "0 0 auto",
					color: "var(--color-text-tertiary)",
					transform: open ? "rotate(180deg)" : "none",
					transition: "transform 0.18s ease",
				}}
			/>
		</button>
		{open ? (
			<div style={{ borderTop: "1px solid var(--color-border)", padding: 12 }}>{children}</div>
		) : null}
	</div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Detail modal
// ─────────────────────────────────────────────────────────────────────────────

const CaseFileDetailModal: React.FC<Props> = ({
	caseFile,
	isMobile,
	canManage,
	docStatuses,
	loanProducts,
	onClose,
	onChanged,
	onDeleted,
}) => {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { user: currentUser } = useAuthStore();
	const isAdmin = currentUser?.role === "admin";

	const [busy, setBusy] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Set<CheckpointKey>>(new Set());
	const [docMenu, setDocMenu] = useState<string | null>(null);
	const [docMenuPos, setDocMenuPos] = useState({ top: 0, left: 0 });
	const [showLose, setShowLose] = useState(false);
	const [loseReason, setLoseReason] = useState("");
	const [confirmSanction, setConfirmSanction] = useState(false);
	const [newClarification, setNewClarification] = useState("");
	const [editingClarification, setEditingClarification] = useState<string | null>(null);
	const [editingText, setEditingText] = useState("");
	const [notesDraft, setNotesDraft] = useState(caseFile.notes || "");
	const [notesOpen, setNotesOpen] = useState(false);
	const docMenuRef = useRef<HTMLDivElement | null>(null);
	const docMenuPanelRef = useRef<HTMLDivElement | null>(null);

	const statusById = useMemo(
		() => new Map(docStatuses.map((s: any) => [String(s._id), s])),
		[docStatuses]
	);

	const checkpoints = caseFile.checkpoints || [];
	const currentKey = checkpoints.find((c) => !c.complete)?.key as CheckpointKey | undefined;
	const terminal = caseFile.status === "closed" || caseFile.status === "lost";
	const lost = caseFile.status === "lost";

	// Open the current checkpoint, and follow it as the stage advances.
	useEffect(() => {
		const firstOpen = currentKey || "finalizing";
		setExpanded((prev) => {
			if (!prev.size) return new Set<CheckpointKey>([firstOpen]);
			if (terminal || !currentKey || prev.has(currentKey)) return prev;
			const next = new Set(prev);
			next.add(currentKey);
			return next;
		});
	}, [currentKey, terminal]);

	useEffect(() => {
		setNotesDraft(caseFile.notes || "");
	}, [caseFile._id, caseFile.notes]);

	// Reset transient panels when switching lead. The expanded set is seeded
	// with the new caseFile's current checkpoint here because the follow
	// effect above won't re-run when both caseFiles share the same stage.
	useEffect(() => {
		setShowLose(false);
		setLoseReason("");
		setConfirmSanction(false);
		setDocMenu(null);
		setEditingClarification(null);
		setExpanded(new Set<CheckpointKey>([currentKey || "finalizing"]));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [caseFile._id]);

	// Close the document status menu on an outside click, Escape, scroll or resize.
	useEffect(() => {
		if (!docMenu) return;
		const onDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (docMenuRef.current?.contains(target) || docMenuPanelRef.current?.contains(target)) return;
			setDocMenu(null);
		};
		const onScroll = (e: Event) => {
			if (docMenuPanelRef.current?.contains(e.target as Node)) return;
			setDocMenu(null);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setDocMenu(null);
		};
		const onResize = () => setDocMenu(null);
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", onResize);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
			window.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("resize", onResize);
		};
	}, [docMenu]);

	const { data: timeline = [], isLoading: timelineLoading } = useQuery<TimelineEntry[]>({
		queryKey: ["case-file-timeline", caseFile._id],
		queryFn: async () => {
			const { data } = await api.get(`/case-files/${caseFile._id}/timeline`);
			return data.timeline || [];
		},
		enabled: !!caseFile._id,
	});

	const invalidateAll = () => {
		queryClient.invalidateQueries({ queryKey: ["case-files"] });
		queryClient.invalidateQueries({ queryKey: ["case-file-stats"] });
		queryClient.invalidateQueries({ queryKey: ["case-file-timeline", caseFile._id] });
		// Product/status changes are mirrored onto the lead by the API.
		queryClient.invalidateQueries({ queryKey: ["leads"] });
		queryClient.invalidateQueries({ queryKey: ["lead-product"] });
	};

	const run = async (key: string, fn: () => Promise<any>, successMsg?: string) => {
		if (busy) return;
		setBusy(key);
		try {
			const data = await fn();
			if (data?.caseFile) onChanged(data.caseFile);
			invalidateAll();
			if (successMsg) toast.success(successMsg);
			return data;
		} catch (err: any) {
			toast.error(err?.response?.data?.message || "Something went wrong");
			return null;
		} finally {
			setBusy(null);
		}
	};

	// ── Actions ──────────────────────────────────────────────────────────────

	const toggleWorkflowItem = (group: "proposal" | "finalizing", item: WorkflowItem) =>
		run(`${group}:${item.key}`, async () => {
			const { data } = await api.patch(
				`/case-files/${caseFile._id}/workflow/${group}/${item.key}`,
				{ done: !item.done }
			);
			return data;
		});

	const advanceDoc = async (doc: CaseFileDoc) => {
		const data = await run(`doc:${doc._id}`, async () => {
			const res = await api.patch(
				`/case-files/${caseFile._id}/docs/${doc._id}/advance`
			);
			return res.data;
		});
		if (!data) return;
		if (data.advanced) toast.success(`${doc.name} → ${data.status}`);
		else toast(`Already at the final status for ${doc.name}`, { icon: "ℹ️" });
	};

	const setDocStatus = (doc: CaseFileDoc, statusId: string) => {
		setDocMenu(null);
		if (String(doc.statusId || "") === String(statusId)) return;
		return run(`doc:${doc._id}`, async () => {
			const { data } = await api.patch(
				`/case-files/${caseFile._id}/docs/${doc._id}`,
				{ statusId }
			);
			return data;
		});
	};

	const addClarification = () =>
		run("clarification:add", async () => {
			const text = newClarification.trim();
			if (!text) return null;
			const { data } = await api.post(`/case-files/${caseFile._id}/clarifications`, {
				text,
			});
			setNewClarification("");
			return data;
		}, "Clarification added");

	const toggleClarification = (c: Clarification) =>
		run(`clarification:${c._id}`, async () => {
			const { data } = await api.patch(
				`/case-files/${caseFile._id}/clarifications/${c._id}`,
				{ resolved: !c.resolved }
			);
			return data;
		});

	const saveClarificationText = (c: Clarification) =>
		run(`clarification:${c._id}`, async () => {
			const text = editingText.trim();
			if (!text) return null;
			const { data } = await api.patch(
				`/case-files/${caseFile._id}/clarifications/${c._id}`,
				{ text }
			);
			setEditingClarification(null);
			return data;
		}, "Clarification updated");

	const deleteClarification = (c: Clarification) =>
		run(`clarification:${c._id}`, async () => {
			const { data } = await api.delete(
				`/case-files/${caseFile._id}/clarifications/${c._id}`
			);
			return data;
		}, "Clarification deleted");

	const saveNotes = () =>
		run("notes", async () => {
			const { data } = await api.put(`/case-files/${caseFile._id}`, {
				notes: notesDraft,
			});
			return data;
		}, "Notes saved");

	const changeProduct = (productId: string) =>
		run("product", async () => {
			const { data } = await api.put(`/case-files/${caseFile._id}`, {
				productId: productId || null,
			});
			return data;
		}, "Product updated — matching documents kept their status");

	const sanction = () =>
		run("sanction", async () => {
			const { data } = await api.post(`/case-files/${caseFile._id}/sanction`);
			setConfirmSanction(false);
			return data;
		}, "File sanctioned");

	const lose = () =>
		run("lose", async () => {
			const reason = loseReason.trim();
			if (!reason) return null;
			const { data } = await api.post(`/case-files/${caseFile._id}/lose`, { reason });
			setShowLose(false);
			setLoseReason("");
			return data;
		}, "File marked lost — lead is now closed lost");

	const reopen = () =>
		run("reopen", async () => {
			const { data } = await api.post(`/case-files/${caseFile._id}/reopen`);
			return data;
		}, "File reopened");

	const clearClarifications = (cleared: boolean) =>
		run("clarifications:clear", async () => {
			const { data } = await api.post(
				`/case-files/${caseFile._id}/clarifications/clear`,
				{ cleared }
			);
			return data;
		}, cleared ? "Marked as no clarifications needed" : "Clarifications reopened");

	const deleteCaseFile = async () => {
		if (!window.confirm(`Delete the caseFile for ${caseFile.leadName || "this lead"}? This cannot be undone.`))
			return;
		try {
			await api.delete(`/case-files/${caseFile._id}`);
			toast.success("File deleted");
			onDeleted();
		} catch (err: any) {
			toast.error(err?.response?.data?.message || "Failed to delete file");
		}
	};

	// ── Derived ──────────────────────────────────────────────────────────────

	const statusPill = lost
		? { label: "Lost", color: DANGER, bg: "color-mix(in srgb, var(--color-danger) 12%, transparent)" }
		: caseFile.status === "closed"
			? { label: "Sanctioned", color: SUCCESS, bg: "color-mix(in srgb, #16a34a 12%, transparent)" }
			: {
					label: currentKey ? checkpoints.find((c) => c.key === currentKey)?.label || "In Process" : "In Process",
					color: PRIMARY,
					bg: "var(--color-primary-light)",
				};

	const sortedClarifications = useMemo(() => {
		const list = caseFile.clarifications || [];
		return [...list].sort((a, b) => {
			if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		});
	}, [caseFile.clarifications]);
	const openClarifications = (caseFile.clarifications || []).filter((c) => !c.resolved).length;

	const docs = caseFile.docs || [];
	const requiredDocs = docs.filter((d) => d.required !== false && !d.removedFromTemplate);
	const doneDocs = requiredDocs.filter((d) => d.status?.isResolved).length;

	const toggleExpanded = (key: CheckpointKey) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const isOpen = (key: CheckpointKey) => expanded.has(key);
	const isCurrent = (key: CheckpointKey) => !terminal && currentKey === key;

	const nextStatusOf = (doc: CaseFileDoc) => {
		const active = docStatuses
			.filter((s: any) => s.isActive)
			.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
		const idx = active.findIndex((s: any) => String(s._id) === String(doc.statusId));
		if (idx < 0) return active[0];
		return active[Math.min(idx + 1, active.length - 1)];
	};

	const workflowGroup = (group: "proposal" | "finalizing") =>
		(caseFile.workflow?.[group] || []) as WorkflowItem[];

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<Modal isOpen onClose={onClose} zIndex={4960}>
			<div
				className="card animate-fade-in"
				style={{
					width: "min(1080px, calc(100vw - 24px))",
					maxHeight: "92vh",
					display: "flex",
					flexDirection: "column",
					padding: 0,
					overflow: "hidden",
					borderRadius: 16,
				}}
			>
				{/* ── Header ── */}
				<div
					style={{
						padding: isMobile ? "14px 14px 12px" : "16px 20px 14px",
						borderBottom: "1px solid var(--color-border)",
						background: "var(--color-surface)",
						flex: "0 0 auto",
					}}
				>
					<div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
						<div style={{ flex: 1, minWidth: 180 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
								<h2 style={{ margin: 0, fontSize: isMobile ? "1rem" : "1.15rem", fontWeight: 800 }}>
									{caseFile.companyName || "No company name available"}
								</h2>
								<span
									className="badge"
									style={{
										background: statusPill.bg,
										color: statusPill.color,
										fontWeight: 700,
										fontSize: "0.68rem",
									}}
								>
									{statusPill.label}
								</span>
								{lost && caseFile.lostReason ? (
									<span
										style={{
											fontSize: "0.7rem",
											color: "var(--color-text-tertiary)",
											maxWidth: 280,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
										title={caseFile.lostReason}
									>
										{caseFile.lostReason}
									</span>
								) : null}
							</div>
							<div
								style={{
									fontSize: "0.78rem",
									color: "var(--color-text-secondary)",
									marginTop: 3,
									display: "flex",
									alignItems: "center",
									gap: 6,
									flexWrap: "wrap",
								}}
							>
								<span>{[caseFile.leadName, caseFile.phone].filter(Boolean).join(" · ") || "No contact info"}</span>
								<span style={{ color: "var(--color-text-tertiary)" }}>·</span>
								<span style={{ color: "var(--color-text-tertiary)" }}>
									Converted {fmtDate(caseFile.convertedAt)}
								</span>
							</div>
						</div>

						<div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
							<button
								type="button"
								className="btn btn-primary btn-sm"
								onClick={() => {
									onClose();
									navigate(`/crm/dial?leadId=${caseFile.leadId}`);
								}}
								title="Open this file in leads details view"
							>
								<ExternalLink size={14} />
								<span>View Lead Details</span>
							</button>
							{canManage && !terminal ? (
								<button
									type="button"
									className="btn btn-secondary btn-sm"
									style={{ color: DANGER, borderColor: "color-mix(in srgb, var(--color-danger) 35%, transparent)" }}
									onClick={() => {
										setShowLose((v) => !v);
										setConfirmSanction(false);
									}}
									title="Mark this file lost"
								>
									<AlertTriangle size={14} />
									<span>{isMobile ? "" : "Mark lost"}</span>
								</button>
							) : null}
							{canManage && terminal ? (
								<button
									type="button"
									className="btn btn-secondary btn-sm"
									disabled={busy === "reopen"}
									onClick={reopen}
									title="Reopen this file"
								>
									<RotateCcw size={14} />
									<span>{isMobile ? "" : "Reopen"}</span>
								</button>
							) : null}
							<button
								type="button"
								onClick={onClose}
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									color: "var(--color-text-secondary)",
									padding: 6,
									borderRadius: 8,
								}}
								title="Close"
							>
								<X size={18} />
							</button>
						</div>
					</div>

					{/* Meta row: product + permissions */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							marginTop: 10,
							flexWrap: "wrap",
						}}
					>
						<select
							className="select"
							disabled={!canManage || busy === "product"}
							value={caseFile.productId?._id || ""}
							onChange={(e) => changeProduct(e.target.value)}
							style={{ height: 32, fontSize: "0.76rem", maxWidth: 230, paddingTop: 0, paddingBottom: 0 }}
							title="Loan product — changing it rebuilds the document checklist"
						>
							<option value="">No product</option>
							{loanProducts.map((p: any) => (
								<option key={p._id} value={p._id}>
									{p.name}
									{p.isActive === false ? " (inactive)" : ""}
								</option>
							))}
						</select>
						{!canManage ? (
							<span
								style={{
									padding: "4px 10px",
									borderRadius: 999,
									background: "rgba(245, 158, 11, 0.12)",
									color: "#b45309",
									fontSize: "0.7rem",
									fontWeight: 600,
								}}
							>
								Read-only — admin / manager can update
							</span>
						) : null}
						<span style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginLeft: "auto" }}>
							Updated {fmtDate(caseFile.updatedAt)}
						</span>
					</div>

					{/* Stepper */}
					<div style={{ marginTop: 14 }}>
						<Stepper
							caseFile={caseFile}
							isMobile={isMobile}
							onSelect={(key) => {
								setExpanded((prev) => {
									const next = new Set(prev);
									next.add(key);
									return next;
								});
								setTimeout(() => {
									document
										.getElementById(`checkpoint-${key}`)
										?.scrollIntoView({ behavior: "smooth", block: "center" });
								}, 40);
							}}
						/>
					</div>

					{/* Lose panel */}
					{showLose ? (
						<div
							style={{
								marginTop: 12,
								border: `1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)`,
								background: "color-mix(in srgb, var(--color-danger) 6%, var(--color-surface))",
								borderRadius: 12,
								padding: 12,
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
								<AlertTriangle size={15} style={{ color: DANGER }} />
								<strong style={{ fontSize: "0.82rem" }}>Why is this lead lost?</strong>
								<span style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)" }}>
									The lead becomes <b>Closed Lost</b> and stays callable in the Dial Queue.
								</span>
							</div>
							<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
								{CLARIFICATION_QUICK_REASONS.map((r) => (
									<button
										key={r}
										type="button"
										onClick={() => setLoseReason(r)}
										style={{
											padding: "3px 9px",
											borderRadius: 999,
											fontSize: "0.7rem",
											fontWeight: 600,
											cursor: "pointer",
											border: `1px solid ${loseReason === r ? DANGER : "var(--color-border)"}`,
											background: loseReason === r ? "color-mix(in srgb, var(--color-danger) 12%, transparent)" : "transparent",
											color: loseReason === r ? DANGER : "var(--color-text-secondary)",
										}}
									>
										{r}
									</button>
								))}
							</div>
							<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
								<input
									className="input"
									style={{ flex: "1 1 220px", height: 34, fontSize: "0.8rem" }}
									placeholder="Or type a reason..."
									value={loseReason}
									onChange={(e) => setLoseReason(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && loseReason.trim()) lose();
									}}
								/>
								<button
									type="button"
									className="btn btn-danger btn-sm"
									disabled={!loseReason.trim() || busy === "lose"}
									onClick={lose}
								>
									{busy === "lose" ? "Saving..." : "Mark lost"}
								</button>
								<button
									type="button"
									className="btn btn-secondary btn-sm"
									onClick={() => {
										setShowLose(false);
										setLoseReason("");
									}}
								>
									Cancel
								</button>
							</div>
						</div>
					) : null}
				</div>

				{/* ── Body ── */}
				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						padding: isMobile ? 12 : 16,
						background: "var(--color-bg)",
					}}
				>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 330px",
							gap: 14,
							alignItems: "start",
						}}
					>
						{/* Left: checkpoints */}
						<div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
							{/* 1 — In Process (documents) */}
							<CheckpointCard
								id="in_process"
								title="In Process"
								icon={<FileText size={14} />}
								done={doneDocs}
								total={requiredDocs.length}
								percent={checkpoints.find((c) => c.key === "in_process")?.percent || 0}
								complete={!!checkpoints.find((c) => c.key === "in_process")?.complete}
								open={isOpen("in_process")}
								isCurrent={isCurrent("in_process")}
								onToggle={() => toggleExpanded("in_process")}
							>
								{docs.length === 0 ? (
									<div
										style={{
											fontSize: "0.8rem",
											color: "var(--color-text-tertiary)",
											padding: "10px 12px",
											border: "1px dashed var(--color-border)",
											borderRadius: 8,
										}}
									>
										No documents yet — pick a loan product above to build the checklist.
									</div>
								) : (
									<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
										{docs.map((doc) => {
											const st = doc.status || (doc.statusId ? (statusById.get(String(doc.statusId)) as CaseFileDocStatus) : null);
											const next = nextStatusOf(doc);
											const canAdvance = !!next && String(next._id) !== String(doc.statusId);
											const isBusy = busy === `doc:${doc._id}`;
											return (
												<div
													key={doc._id}
													style={{
														display: "flex",
														alignItems: "center",
														gap: 8,
														padding: "6px 8px",
														border: "1px solid var(--color-border)",
														borderRadius: 9,
														background: "var(--color-surface)",
														opacity: doc.removedFromTemplate ? 0.55 : 1,
														flexWrap: "wrap",
													}}
												>
													<span
														style={{
															width: 18,
															height: 18,
															borderRadius: 999,
															flex: "0 0 auto",
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															background: st?.isResolved
																? "color-mix(in srgb, #16a34a 15%, transparent)"
																: "var(--color-surface-hover)",
															color: st?.isResolved ? SUCCESS : "var(--color-text-tertiary)",
														}}
													>
														{st?.isResolved ? <Check size={12} strokeWidth={3} /> : <Circle size={7} fill="currentColor" stroke="none" />}
													</span>
													<span
														style={{
															flex: "1 1 140px",
															minWidth: 0,
															fontSize: "0.8rem",
															textDecoration: doc.removedFromTemplate ? "line-through" : "none",
														}}
													>
														{doc.name}
														{!doc.required ? (
															<span style={{ marginLeft: 5, fontSize: "0.64rem", color: "var(--color-text-tertiary)" }}>
																optional
															</span>
														) : null}
													</span>

													{/* One-click status chip */}
													<div
														ref={docMenu === doc._id ? docMenuRef : undefined}
														style={{ position: "relative", display: "flex", alignItems: "center", gap: 2, flex: "0 0 auto" }}
													>
														<button
															type="button"
															disabled={!canManage || isBusy || !canAdvance}
															onClick={() => advanceDoc(doc)}
															title={
																!canAdvance
																	? "Already at the last status — use the menu to change"
																	: `Click to advance${next ? ` to ${next.name}` : ""}`
															}
															style={{
																display: "inline-flex",
																alignItems: "center",
																gap: 6,
																padding: "3px 9px",
																borderRadius: 999,
																fontSize: "0.7rem",
																fontWeight: 700,
																cursor: canManage && canAdvance ? "pointer" : "default",
																border: `1px solid ${st?.color || "var(--color-border)"}`,
																background: st?.color ? `${st.color}18` : "transparent",
																color: st?.color || "var(--color-text-secondary)",
																opacity: isBusy ? 0.6 : 1,
																transition: "all 0.15s ease",
															}}
														>
															<span
																style={{
																	width: 7,
																	height: 7,
																	borderRadius: 999,
																	background: st?.color || "var(--color-border)",
																	flex: "0 0 auto",
																}}
															/>
															{st?.name || "Set status"}
															{canManage && canAdvance ? (
																<ChevronRight size={11} style={{ opacity: 0.7 }} />
															) : null}
														</button>
														{canManage ? (
															<button
																type="button"
																onClick={(e) => {
																	if (docMenu === doc._id) {
																		setDocMenu(null);
																		return;
																	}
																	const rect = e.currentTarget.getBoundingClientRect();
																	const menuWidth = 176;
																	const itemCount = docStatuses.filter(
																		(s: CaseFileDocStatus) => s.isActive || String(s._id) === String(doc.statusId)
																	).length;
																	const menuHeight = Math.min(itemCount * 31 + 8, 240);
																	const flipUp = rect.bottom + menuHeight + 8 > window.innerHeight;
																	setDocMenuPos({
																		top: flipUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6,
																		left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
																	});
																	setDocMenu(doc._id);
																}}
																title="Choose a specific status"
																style={{
																	background: "none",
																	border: "none",
																	cursor: "pointer",
																	padding: "2px 3px",
																	color: "var(--color-text-tertiary)",
																	display: "flex",
																}}
															>
																<ChevronDown size={12} />
															</button>
														) : null}

														{docMenu === doc._id
															? createPortal(
																	<div
																		ref={docMenuPanelRef}
																		style={{
																			position: "fixed",
																			top: docMenuPos.top,
																			left: docMenuPos.left,
																			width: 176,
																			maxHeight: 240,
																			overflowY: "auto",
																			zIndex: 4965,
																			background: "var(--color-surface)",
																			border: "1px solid var(--color-border)",
																			borderRadius: 10,
																			boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
																			padding: 4,
																		}}
																	>
																{docStatuses
																	.filter((s: any) => s.isActive || String(s._id) === String(doc.statusId))
																	.map((s: any) => (
																		<button
																			key={s._id}
																			type="button"
																			onClick={() => setDocStatus(doc, s._id)}
																			style={{
																				display: "flex",
																				alignItems: "center",
																				gap: 7,
																				width: "100%",
																				padding: "6px 8px",
																				border: "none",
																				borderRadius: 7,
																				background:
																					String(s._id) === String(doc.statusId)
																						? "var(--color-primary-light)"
																						: "transparent",
																				cursor: "pointer",
																				fontSize: "0.75rem",
																				fontWeight: 600,
																				textAlign: "left",
																				color: "var(--color-text)",
																			}}
																		>
																			<span
																				style={{
																					width: 8,
																					height: 8,
																					borderRadius: 999,
																					background: s.color,
																					flex: "0 0 auto",
																				}}
																			/>
																			{s.name}
																			{s.isResolved ? (
																				<span style={{ marginLeft: "auto", color: SUCCESS, fontSize: "0.62rem" }}>done</span>
																			) : null}
																		</button>
																	))}
																	</div>,
																	document.body
																)
															: null}
													</div>
												</div>
											);
										})}
										{doneDocs === requiredDocs.length && requiredDocs.length > 0 ? (
											<div style={{ fontSize: "0.72rem", color: SUCCESS, fontWeight: 600, marginTop: 2 }}>
												All required documents received — In Process complete.
											</div>
										) : null}
									</div>
								)}
							</CheckpointCard>

							{/* 2 — Proposal to Bank */}
							<CheckpointCard
								id="proposal"
								title="Proposal to Bank"
								icon={<Send size={14} />}
								done={checkpoints.find((c) => c.key === "proposal")?.done || 0}
								total={checkpoints.find((c) => c.key === "proposal")?.total || 0}
								percent={checkpoints.find((c) => c.key === "proposal")?.percent || 0}
								complete={!!checkpoints.find((c) => c.key === "proposal")?.complete}
								open={isOpen("proposal")}
								isCurrent={isCurrent("proposal")}
								onToggle={() => toggleExpanded("proposal")}
							>
								<WorkflowList
									items={workflowGroup("proposal")}
									canManage={canManage}
									busy={busy}
									prefix="proposal"
									onToggle={(item) => toggleWorkflowItem("proposal", item)}
								/>
							</CheckpointCard>

							{/* 3 — Clarifications */}
							<CheckpointCard
								id="clarifications"
								title="Clarifications"
								icon={<MessageSquare size={14} />}
								done={checkpoints.find((c) => c.key === "clarifications")?.done || 0}
								total={checkpoints.find((c) => c.key === "clarifications")?.total || 0}
								percent={checkpoints.find((c) => c.key === "clarifications")?.percent || 0}
								complete={!!checkpoints.find((c) => c.key === "clarifications")?.complete}
								open={isOpen("clarifications")}
								isCurrent={isCurrent("clarifications")}
								onToggle={() => toggleExpanded("clarifications")}
								summary={
									caseFile.clarificationsCleared && sortedClarifications.length === 0
										? "None needed"
										: undefined
								}
							>
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
									<span style={{ fontSize: "0.72rem", color: "var(--color-text-tertiary)" }}>
										{caseFile.clarificationsCleared && sortedClarifications.length === 0
											? "Confirmed — no clarifications needed"
											: sortedClarifications.length === 0
												? "Not reviewed yet"
												: openClarifications > 0
													? `${openClarifications} open clarification${openClarifications > 1 ? "s" : ""}`
													: "All clarifications resolved"}
									</span>
									{sortedClarifications.length > 0 ? (
										<span style={{ fontSize: "0.68rem", color: "var(--color-text-tertiary)" }}>
											{sortedClarifications.length - openClarifications} resolved
										</span>
									) : null}
								</div>

								{sortedClarifications.length === 0 ? (
									caseFile.clarificationsCleared ? (
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												fontSize: "0.78rem",
												color: SUCCESS,
												padding: "9px 12px",
												border: "1px solid color-mix(in srgb, #16a34a 30%, transparent)",
												background: "color-mix(in srgb, #16a34a 7%, transparent)",
												borderRadius: 8,
												marginBottom: 8,
											}}
										>
											<Check size={14} strokeWidth={3} />
											<span style={{ flex: 1 }}>
												No clarifications needed — confirmed
												{caseFile.clarificationsClearedAt
													? ` on ${fmtDate(caseFile.clarificationsClearedAt)}`
													: ""}.
											</span>
											{canManage ? (
												<button
													type="button"
													className="btn btn-ghost btn-xs"
													disabled={busy === "clarifications:clear"}
													onClick={() => clearClarifications(false)}
												>
													<Undo2 size={11} /> Undo
												</button>
											) : null}
										</div>
									) : (
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 10,
												padding: "10px 12px",
												border: "1px dashed var(--color-border)",
												borderRadius: 8,
												marginBottom: 8,
												flexWrap: "wrap",
											}}
										>
											<span style={{ flex: "1 1 220px", fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
												No clarifications recorded. Add a note below, or confirm this lead
												doesn&apos;t need any.
											</span>
											{canManage ? (
												<button
													type="button"
													className="btn btn-secondary btn-sm"
													disabled={busy === "clarifications:clear"}
													onClick={() => clearClarifications(true)}
													title="Complete this checkpoint without adding any clarification"
												>
													<Check size={13} strokeWidth={3} />
													No clarifications needed
												</button>
											) : null}
										</div>
									)
								) : (
									<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
										{sortedClarifications.map((c) => {
											const isEditing = editingClarification === c._id;
											const isBusy = busy === `clarification:${c._id}`;
											return (
												<div
													key={c._id}
													style={{
														display: "flex",
														gap: 8,
														padding: "8px 9px",
														border: "1px solid var(--color-border)",
														borderRadius: 9,
														background: c.resolved ? "var(--color-surface-hover)" : "var(--color-surface)",
														opacity: c.resolved ? 0.78 : 1,
													}}
												>
													<div
														style={{
															width: 24,
															height: 24,
															borderRadius: 999,
															flex: "0 0 auto",
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															background: "var(--color-primary-light)",
															color: PRIMARY,
															fontSize: "0.6rem",
															fontWeight: 800,
														}}
													>
														{initials(userName(c.createdBy))}
													</div>
													<div style={{ flex: 1, minWidth: 0 }}>
														<div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
															<span style={{ fontSize: "0.72rem", fontWeight: 700 }}>
																{userName(c.createdBy)}
															</span>
															<span style={{ fontSize: "0.64rem", color: "var(--color-text-tertiary)" }}>
																{fmtDateTime(c.createdAt)}
															</span>
															{c.resolved ? (
																<span
																	style={{
																		fontSize: "0.6rem",
																		fontWeight: 700,
																		color: SUCCESS,
																		display: "inline-flex",
																		alignItems: "center",
																		gap: 3,
																	}}
																>
																	<Check size={10} strokeWidth={3} /> Resolved
																</span>
															) : null}
														</div>
														{isEditing ? (
															<div style={{ display: "flex", gap: 5, marginTop: 5 }}>
																<textarea
																	className="input"
																	rows={2}
																	autoFocus
																	value={editingText}
																	onChange={(e) => setEditingText(e.target.value)}
																	onKeyDown={(e) => {
																		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveClarificationText(c);
																		if (e.key === "Escape") setEditingClarification(null);
																	}}
																	style={{ fontSize: "0.78rem", flex: 1 }}
																/>
																<button
																	type="button"
																	className="btn btn-primary btn-xs"
																	disabled={!editingText.trim() || isBusy}
																	onClick={() => saveClarificationText(c)}
																>
																	Save
																</button>
															</div>
														) : (
															<p
																style={{
																	margin: "3px 0 0",
																	fontSize: "0.79rem",
																	lineHeight: 1.45,
																	whiteSpace: "pre-wrap",
																	wordBreak: "break-word",
																	textDecoration: c.resolved ? "line-through" : "none",
																	color: c.resolved ? "var(--color-text-tertiary)" : "var(--color-text-secondary)",
																}}
															>
																{c.text}
															</p>
														)}
														{canManage && !isEditing ? (
															<div style={{ display: "flex", gap: 6, marginTop: 5 }}>
																<button
																	type="button"
																	className="btn btn-secondary btn-xs"
																	disabled={isBusy}
																	onClick={() => toggleClarification(c)}
																>
																	{c.resolved ? <Undo2 size={11} /> : <Check size={11} />}
																	{c.resolved ? "Reopen" : "Resolve"}
																</button>
																<button
																	type="button"
																	className="btn btn-ghost btn-xs"
																	disabled={isBusy}
																	onClick={() => {
																		setEditingClarification(c._id);
																		setEditingText(c.text);
																	}}
																>
																	<Pencil size={11} />
																</button>
																<button
																	type="button"
																	className="btn btn-ghost btn-xs"
																	disabled={isBusy}
																	style={{ color: DANGER }}
																	onClick={() => deleteClarification(c)}
																>
																	<Trash2 size={11} />
																</button>
															</div>
														) : null}
													</div>
												</div>
											);
										})}
									</div>
								)}

								{canManage ? (
									<div style={{ display: "flex", gap: 6 }}>
										<textarea
											className="input"
											rows={2}
											placeholder="Add a clarification note... (Ctrl+Enter to save)"
											value={newClarification}
											onChange={(e) => setNewClarification(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addClarification();
											}}
											style={{ fontSize: "0.78rem", flex: 1, resize: "vertical" }}
										/>
										<button
											type="button"
											className="btn btn-primary btn-sm"
											disabled={!newClarification.trim() || busy === "clarification:add"}
											onClick={addClarification}
										>
											<Send size={13} />
										</button>
									</div>
								) : null}
							</CheckpointCard>

							{/* 4 — Finalizing */}
							<CheckpointCard
								id="finalizing"
								title="Finalizing"
								icon={<ShieldCheck size={14} />}
								done={checkpoints.find((c) => c.key === "finalizing")?.done || 0}
								total={checkpoints.find((c) => c.key === "finalizing")?.total || 0}
								percent={checkpoints.find((c) => c.key === "finalizing")?.percent || 0}
								complete={!!checkpoints.find((c) => c.key === "finalizing")?.complete}
								open={isOpen("finalizing")}
								isCurrent={isCurrent("finalizing")}
								onToggle={() => toggleExpanded("finalizing")}
							>
								<WorkflowList
									items={workflowGroup("finalizing")}
									canManage={canManage}
									busy={busy}
									prefix="finalizing"
									onToggle={(item) => toggleWorkflowItem("finalizing", item)}
								/>

								{canManage && !terminal ? (
									<div
										style={{
											marginTop: 10,
											paddingTop: 10,
											borderTop: "1px dashed var(--color-border)",
											display: "flex",
											gap: 8,
											flexWrap: "wrap",
											alignItems: "center",
										}}
									>
										{confirmSanction ? (
											<>
												<span style={{ fontSize: "0.76rem", fontWeight: 600 }}>
													Mark this caseFile sanctioned?
												</span>
												<button
													type="button"
													className="btn btn-success btn-sm"
													disabled={busy === "sanction"}
													onClick={sanction}
												>
													<Check size={13} /> Confirm
												</button>
												<button
													type="button"
													className="btn btn-secondary btn-sm"
													onClick={() => setConfirmSanction(false)}
												>
													Cancel
												</button>
											</>
										) : (
											<>
												<button
													type="button"
													className="btn btn-success btn-sm"
													onClick={() => setConfirmSanction(true)}
												>
													<ShieldCheck size={14} /> Mark Sanctioned
												</button>
												<button
													type="button"
													className="btn btn-secondary btn-sm"
													style={{ color: DANGER }}
													onClick={() => {
														setShowLose(true);
														setConfirmSanction(false);
													}}
												>
													<AlertTriangle size={14} /> Mark Lost
												</button>
												<span style={{ fontSize: "0.68rem", color: "var(--color-text-tertiary)" }}>
													Sanctioning keeps the lead Closed Won.
												</span>
											</>
										)}
									</div>
								) : null}
							</CheckpointCard>

							{/* Internal notes (compact, collapsed) */}
							<div className="card" style={{ padding: 0, overflow: "hidden" }}>
								<button
									type="button"
									onClick={() => setNotesOpen((v) => !v)}
									style={{
										width: "100%",
										display: "flex",
										alignItems: "center",
										gap: 8,
										padding: "9px 12px",
										background: "transparent",
										border: "none",
										cursor: "pointer",
										fontSize: "0.78rem",
										fontWeight: 600,
										color: "var(--color-text-secondary)",
									}}
								>
									<Pencil size={13} />
									Internal notes
									<span style={{ fontSize: "0.68rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>
										{caseFile.notes ? "saved" : "empty"}
									</span>
									<ChevronDown
										size={15}
										style={{ marginLeft: "auto", transform: notesOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }}
									/>
								</button>
								{notesOpen ? (
									<div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--color-border)" }}>
										<textarea
											className="input"
											rows={3}
											disabled={!canManage}
											value={notesDraft}
											onChange={(e) => setNotesDraft(e.target.value)}
											placeholder="Anything to remember about this file"
											style={{ marginTop: 10, fontSize: "0.8rem" }}
										/>
										{canManage && notesDraft !== (caseFile.notes || "") ? (
											<div style={{ display: "flex", gap: 6, marginTop: 6 }}>
												<button
													type="button"
													className="btn btn-primary btn-sm"
													disabled={busy === "notes"}
													onClick={saveNotes}
												>
													{busy === "notes" ? "Saving..." : "Save notes"}
												</button>
												<button
													type="button"
													className="btn btn-secondary btn-sm"
													onClick={() => setNotesDraft(caseFile.notes || "")}
												>
													Reset
												</button>
											</div>
										) : null}
									</div>
								) : null}
							</div>

							{isAdmin ? (
								<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
									<button
										type="button"
										className="btn btn-danger btn-xs"
										onClick={deleteCaseFile}
										title="Delete this file (admin only)"
									>
										<Trash2 size={12} /> Delete caseFile
									</button>
								</div>
							) : null}
						</div>

						{/* Right: timeline */}
						<div
							className="card"
							style={{
								padding: 0,
								overflow: "hidden",
								position: isMobile ? "static" : "sticky",
								top: 0,
								maxHeight: isMobile ? 360 : "calc(92vh - 210px)",
								display: "flex",
								flexDirection: "column",
							}}
						>
							<div
								style={{
									padding: "11px 12px",
									borderBottom: "1px solid var(--color-border)",
									display: "flex",
									alignItems: "center",
									gap: 7,
									flex: "0 0 auto",
								}}
							>
								<Clock size={14} style={{ color: PRIMARY }} />
								<span style={{ fontSize: "0.82rem", fontWeight: 700 }}>Activity Timeline</span>
								<span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--color-text-tertiary)" }}>
									{timeline.length}
								</span>
							</div>
							<div style={{ overflowY: "auto", padding: "10px 12px", flex: 1, minHeight: 0 }}>
								{timelineLoading ? (
									<div style={{ fontSize: "0.76rem", color: "var(--color-text-tertiary)", padding: 8 }}>
										Loading timeline...
									</div>
								) : timeline.length === 0 ? (
									<div style={{ fontSize: "0.76rem", color: "var(--color-text-tertiary)", padding: 8 }}>
										No activity recorded yet.
									</div>
								) : (
									<div style={{ display: "flex", flexDirection: "column" }}>
										{timeline.map((entry, idx) => {
											const isLast = idx === timeline.length - 1;
											const color =
												entry.kind === "status"
													? PRIMARY
													: entry.kind === "doc"
														? "#0ea5e9"
														: entry.kind === "clarification"
															? "#8b5cf6"
															: entry.kind === "checkpoint"
																? "#16a34a"
																: "var(--color-text-tertiary)";
											return (
												<div key={entry._id} style={{ display: "flex", gap: 9, position: "relative" }}>
													<div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto" }}>
														<span
															style={{
																width: 9,
																height: 9,
																borderRadius: 999,
																background: color,
																marginTop: 5,
																boxShadow: "0 0 0 3px var(--color-surface)",
																zIndex: 1,
															}}
														/>
														{!isLast ? (
															<span style={{ width: 2, flex: 1, background: "var(--color-border)", minHeight: 16 }} />
														) : null}
													</div>
													<div style={{ paddingBottom: isLast ? 0 : 12, minWidth: 0 }}>
														<div
															style={{
																fontSize: "0.74rem",
																lineHeight: 1.35,
																color: "var(--color-text)",
																wordBreak: "break-word",
															}}
														>
															{entry.action}
														</div>
														<div
															style={{
																fontSize: "0.64rem",
																color: "var(--color-text-tertiary)",
																marginTop: 2,
																display: "flex",
																gap: 6,
																flexWrap: "wrap",
															}}
														>
															<span>{fmtDateTime(entry.at)}</span>
															{entry.user?.name ? <span>· {entry.user.name}</span> : null}
														</div>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</Modal>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// Workflow item list (Proposal / Finalizing)
// ─────────────────────────────────────────────────────────────────────────────

const WorkflowList: React.FC<{
	items: WorkflowItem[];
	canManage: boolean;
	busy: string | null;
	prefix: "proposal" | "finalizing";
	onToggle: (item: WorkflowItem) => void;
}> = ({ items, canManage, busy, prefix, onToggle }) => (
	<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
		{items.map((item) => {
			const isBusy = busy === `${prefix}:${item.key}`;
			return (
				<button
					key={item.key}
					type="button"
					disabled={!canManage || isBusy}
					onClick={() => onToggle(item)}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 9,
						padding: "8px 10px",
						border: `1px solid ${item.done ? "color-mix(in srgb, #16a34a 35%, transparent)" : "var(--color-border)"}`,
						borderRadius: 9,
						background: item.done ? "color-mix(in srgb, #16a34a 6%, var(--color-surface))" : "var(--color-surface)",
						cursor: canManage ? "pointer" : "default",
						textAlign: "left",
						opacity: isBusy ? 0.65 : 1,
						transition: "all 0.15s ease",
					}}
				>
					<span
						style={{
							width: 20,
							height: 20,
							borderRadius: 6,
							flex: "0 0 auto",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							border: item.done ? "none" : "2px solid var(--color-border-hover)",
							background: item.done ? SUCCESS : "transparent",
							color: "#fff",
						}}
					>
						{item.done ? <Check size={13} strokeWidth={3} /> : null}
					</span>
					<span style={{ flex: 1, minWidth: 0 }}>
						<span
							style={{
								display: "block",
								fontSize: "0.8rem",
								fontWeight: 600,
								color: item.done ? "var(--color-text-secondary)" : "var(--color-text)",
								textDecoration: item.done ? "line-through" : "none",
							}}
						>
							{item.label}
						</span>
						{item.hint ? (
							<span style={{ display: "block", fontSize: "0.66rem", color: "var(--color-text-tertiary)" }}>
								{item.hint}
							</span>
						) : null}
					</span>
					{item.doneAt ? (
						<span style={{ fontSize: "0.64rem", color: "var(--color-text-tertiary)", flex: "0 0 auto" }}>
							{fmtDate(item.doneAt)}
						</span>
					) : (
						<CircleDot size={13} style={{ color: "var(--color-text-tertiary)", flex: "0 0 auto" }} />
					)}
				</button>
			);
		})}
	</div>
);

export default CaseFileDetailModal;
