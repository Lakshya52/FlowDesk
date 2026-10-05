import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import Avatar from "../components/common/Avatar";
import Modal from "../components/common/Modal";
import { useAuthStore } from "../store/authStore";
import {
	Search,
	Trash2,
	X,
	Check,
	Plus,
	Loader2,
	GripVertical,
	UserPlus,
	ChevronDown,
	Paperclip,
	Download,
	Upload,
	SquarePen,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { useTaskSocket } from "../hooks/useTaskSocket";

const PRIORITY_LABELS: Record<string, string> = {
	low: "Low",
	medium: "Medium",
	high: "High",
	urgent: "Urgent",
};

const TasksPage: React.FC = () => {
	const { user } = useAuthStore();
	const queryClient = useQueryClient();
	useTaskSocket();
	const params = useParams();
	const boardIdFromUrl = params.id || "";
	const [search, setSearch] = useState("");
	const [selectedCompany, setSelectedCompany] = useState("");
	const [currentTab, setCurrentTab] = useState<"all" | "my">("all");
	const navigate = useNavigate();
	const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [assignSearch, setAssignSearch] = useState("");
	const [assignOpen, setAssignOpen] = useState(false);
	const assignRef = useRef<HTMLDivElement>(null);
	const [createForm, setCreateForm] = useState({
		title: "",
		description: "",
		assignedTo: user?._id || "",
		dueDate: "",
		noDueDate: false,
		priority: "medium",
		assignment: "",
		board: "",
	});
	const [submitting, setSubmitting] = useState(false);
	const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
	const [createColumnStatus, setCreateColumnStatus] = useState<string>("");
	const [editingColumnKey, setEditingColumnKey] = useState<string | null>(
		null,
	);
	const [editColumnLabel, setEditColumnLabel] = useState("");
	const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(
		null,
	);
	const boardWrapRef = useRef<HTMLDivElement>(null);
	// Original header nodes, keyed by column — translated on page scroll to
	// freeze them (see effect below). Same nodes, so horizontal scrolling can
	// never detach headers from their columns.
	const headerRefs = useRef(new Map<string, HTMLDivElement>());
	// The board is a single two-axis scroller: it scrolls horizontally when
	// columns overflow and vertically when cards overflow. Because headers and
	// cards share one scroll container, native `position: sticky` freezes the
	// ORIGINAL headers — no mirrored copy, so they can never drift apart.
	// Kanban columns always keep a usable minimum width (200px): whenever the
	// board area is too narrow — phones, small windows, or many columns — the
	// board scrolls horizontally instead of squeezing the columns. Wide boards
	// are unaffected since the percentage basis stays larger than the floor.
	const [detailTask, setDetailTask] = useState<any>(null);
	const [detailAttachments, setDetailAttachments] = useState<any[]>([]);
	const [detailEditing, setDetailEditing] = useState(false);
	const [detailEditForm, setDetailEditForm] = useState<any>({});
	const [detailSaving, setDetailSaving] = useState(false);
	const [uploadingAttachment, setUploadingAttachment] = useState(false);
	const attachmentInputRef = useRef<HTMLInputElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(
		null,
	);
	const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const searchContainerRef = useRef<HTMLDivElement>(null);
	const [dropAnim, setDropAnim] = useState<{
		x: number;
		y: number;
		w: number;
		h: number;
		key: number;
	} | null>(null);
	const draggedCardRectRef = useRef<{
		x: number;
		y: number;
		w: number;
		h: number;
	} | null>(null);
	const [dragInsertInfo, setDragInsertInfo] = useState<{
		colKey: string;
		index: number;
	} | null>(null);
	const [toastMsg, setToastMsg] = useState<string | null>(null);
	const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				searchContainerRef.current &&
				!searchContainerRef.current.contains(e.target as Node)
			) {
				setSearch("");
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (!dropAnim) return;
		const timer = setTimeout(() => setDropAnim(null), 1000);
		return () => clearTimeout(timer);
	}, [dropAnim]);

	const activeBoardId = boardIdFromUrl;

	const { data: boardsData } = useQuery({
		queryKey: ["boards"],
		queryFn: async () => {
			const { data } = await api.get("/boards");
			return data.boards || [];
		},
	});
	const allBoards = boardsData || [];

	const { data: boardData } = useQuery({
		queryKey: ["board", activeBoardId],
		queryFn: async () => {
			const { data } = await api.get(`/boards/${activeBoardId}`);
			return data.board;
		},
		enabled: !!activeBoardId,
	});
	const board = boardData;

	const boardColumns = board?.columns
		? [...board.columns].sort((a: any, b: any) => a.order - b.order)
		: [];

	const isAdmin = user?.role === "admin";
	// A completed sprint is view-only: cards, columns and settings are locked.
	const isCompleted = !!activeBoardId && board?.status === "completed";
	const canManageBoard =
		isAdmin || (board?.createdBy?._id || board?.createdBy) === user?._id;

	// Board invite popover + inline members panel state.
	const [inviteOpen, setInviteOpen] = useState(false);
	const [membersOpen, setMembersOpen] = useState(false);
	const [inviteSearch, setInviteSearch] = useState("");
	const [invitingId, setInvitingId] = useState<string | null>(null);
	const inviteRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!inviteOpen) return;
		const handler = (e: MouseEvent) => {
			if (
				inviteRef.current &&
				!inviteRef.current.contains(e.target as Node)
			)
				setInviteOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [inviteOpen]);

	useEffect(() => {
		if (!membersOpen) return;
		const handler = (e: MouseEvent) => {
			const t = e.target as Element | null;
			if (t && !t.closest("[data-members-menu]")) setMembersOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [membersOpen]);


	// const isManager = user?.role === "manager";
	// const isEmployee = user?.role === "member";

	const canEditTask = (task: any) => {
		if (isAdmin) return true;
		if (task.assignment) {
			const isProjectCreator =
				task.assignment.createdBy?._id === user?._id ||
				task.assignment.createdBy === user?._id;
			const isProjectTeamMember = task.assignment.team?.some(
				(m: any) => (m._id || m) === user?._id,
			);
			return isProjectCreator || isProjectTeamMember;
		}
		return (
			task.createdBy?._id === user?._id ||
			task.assignedTo?._id === user?._id
		);
	};

	const getDeniedReason = (task: any): string => {
		if (task.assignment) {
			return `This task belongs to "${task.assignment.title}". Only the project creator or team members can move it.`;
		}
		if (task.assignedTo?._id === user?._id) {
			return "You are assigned to this task but didn't create it. Only the creator or an admin can move it.";
		}
		return "This task was created by someone else and is not assigned to you. Only the creator or assignee can move it.";
	};

	const canDeleteTask = (task: any) => {
		if (isAdmin) return true;
		if (task.assignment) {
			const isTaskCreator = task.assignment.createdBy?._id === user?._id;
			return isTaskCreator;
		}
		return task.createdBy?._id === user?._id;
	};

	const { data: companiesData } = useQuery({
		queryKey: ["companies-flat"],
		queryFn: async () => {
			const { data } = await api.get("/companies", {
				params: { flat: "true" },
			});
			return data.companies || [];
		},
	});
	const companies = companiesData || [];

	const { data: usersData } = useQuery({
		queryKey: ["users"],
		queryFn: async () => {
			const { data } = await api.get("/auth/users");
			return data.users || [];
		},
	});
	const users = usersData || [];

	const boardMembers = board?.members || [];
	const pendingInvites = (board?.invitations || []).filter(
		(inv: any) => inv.status === "pending",
	);
	const boardMemberIds = new Set(
		boardMembers.map((m: any) => (m._id || m).toString()),
	);
	const pendingInviteIds = new Set(
		pendingInvites.map((inv: any) => (inv.user?._id || inv.user)?.toString()),
	);
	const inviteCandidates = users.filter(
		(u: any) =>
			!boardMemberIds.has(u._id?.toString()) &&
			(inviteSearch.trim() === "" ||
				u.name?.toLowerCase().includes(inviteSearch.toLowerCase()) ||
				u.email?.toLowerCase().includes(inviteSearch.toLowerCase())),
	);

	const handleInviteMember = async (memberUserId: string) => {
		if (!activeBoardId) return;
		setInvitingId(memberUserId);
		try {
			await api.post(`/boards/${activeBoardId}/invite`, {
				userId: memberUserId,
			});
			setInviteSearch("");
			queryClient.invalidateQueries({
				queryKey: ["board", activeBoardId],
			});
			showToast("Invitation sent");
		} catch (e: any) {
			showToast(e.response?.data?.message || "Failed to invite");
		} finally {
			setInvitingId(null);
		}
	};

	const handleRemoveMember = async (memberId: string, memberName?: string) => {
		if (!activeBoardId) return;
		if (!window.confirm(`Remove ${memberName || "this member"} from the sprint board?`)) return;
		try {
			await api.delete(`/boards/${activeBoardId}/members/${memberId}`);
			queryClient.invalidateQueries({ queryKey: ["board", activeBoardId] });
			queryClient.invalidateQueries({ queryKey: ["boards"] });
			showToast("Member removed");
		} catch (e: any) {
			showToast(e.response?.data?.message || "Failed to remove member");
		}
	};

	const handleRevokeInvitation = async (
		invitationId: string,
		inviteeName?: string,
	) => {
		if (!activeBoardId) return;
		if (
			!window.confirm(
				`Revoke invitation for ${inviteeName || "this user"}?`,
			)
		)
			return;
		try {
			await api.delete(
				`/boards/${activeBoardId}/invitations/${invitationId}`,
			);
			queryClient.invalidateQueries({
				queryKey: ["board", activeBoardId],
			});
			queryClient.invalidateQueries({ queryKey: ["boards"] });
			showToast("Invitation revoked");
		} catch (e: any) {
			showToast(e.response?.data?.message || "Failed to revoke invitation");
		}
	};

	useEffect(() => {
		if (!assignOpen) return;
		const handler = (e: MouseEvent) => {
			if (
				assignRef.current &&
				!assignRef.current.contains(e.target as Node)
			)
				setAssignOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [assignOpen]);

	const { data: assignmentsData } = useQuery({
		queryKey: ["assignments"],
		queryFn: async () => {
			const { data } = await api.get("/assignments");
			return data.assignments || [];
		},
	});
	const assignments = assignmentsData || [];

	const taskQueryKey = [
		"tasks",
		activeBoardId,
		selectedCompany,
		currentTab,
		user?._id,
	];

	const { data: tasksData, isLoading: loading } = useQuery({
		queryKey: taskQueryKey,
		queryFn: async () => {
			const params: any = {};
			if (activeBoardId) {
				params.board = activeBoardId;
			}
			if (selectedCompany) params.companyId = selectedCompany;
			if (currentTab === "my") params.assignedTo = user?._id;
			const { data } = await api.get("/tasks", { params });
			return data.tasks || [];
		},
	});
	const tasks = tasksData || [];

	const { data: searchData } = useQuery({
		queryKey: ["tasks-search", search],
		queryFn: async () => {
			if (!search || search.trim().length < 2) return [];
			const params: any = { search };
			if (activeBoardId) params.board = activeBoardId;
			if (selectedCompany) params.companyId = selectedCompany;
			const { data } = await api.get("/tasks", { params });
			return data.tasks || [];
		},
	});
	const searchResults = searchData || [];

	const scrollToTask = (taskId: string) => {
		const el = document.getElementById(`task-card-${taskId}`);
		if (el) {
			el.scrollIntoView({
				behavior: "smooth",
				block: "center",
				inline: "center",
			});
			setHighlightedTaskId(taskId);
			if (highlightTimeoutRef.current)
				clearTimeout(highlightTimeoutRef.current);
			highlightTimeoutRef.current = setTimeout(
				() => setHighlightedTaskId(null),
				2000,
			);
		}
		setSearch("");
	};

	const showToast = (msg: string) => {
		setToastMsg(msg);
		if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
		toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000);
	};

	const downloadFile = async (fileId: string, originalName: string) => {
		try {
			const response = await api.get(`/files/${fileId}/download`, {
				responseType: "blob",
			});
			const contentType =
				response.headers["content-type"] || "application/octet-stream";
			const url = window.URL.createObjectURL(
				new Blob([response.data], { type: contentType }),
			);
			const link = document.createElement("a");
			link.href = url;
			link.setAttribute("download", originalName);
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(url);
		} catch {}
	};

	const handleDragStart = (e: React.DragEvent, taskId: string) => {
		setDraggedTaskId(taskId);
		e.dataTransfer.setData("taskId", taskId);
		e.dataTransfer.effectAllowed = "move";
		const el = e.currentTarget as HTMLElement;
		e.dataTransfer.setDragImage(el, 0, 0);
		const rect = el.getBoundingClientRect();
		draggedCardRectRef.current = {
			x: rect.left,
			y: rect.top,
			w: rect.width,
			h: rect.height,
		};
	};

	const handleDragEnd = () => {
		setDraggedTaskId(null);
		setDragInsertInfo(null);
	};

	const calcInsertIndex = (e: React.DragEvent, colKey: string) => {
		const container = (e.currentTarget as HTMLElement).querySelector(
			`[data-col="${colKey}"]`,
		) as HTMLElement | null;
		if (!container) return -1;

		// If hovering over the empty spacer zone, always insert at the top —
		// don't do position math against it.
		const targetEl = e.target as HTMLElement;
		if (targetEl.closest(".empty-drop-zone")) {
			const cards = container.querySelectorAll<HTMLElement>(".task-card");
			return cards.length;
		}

		const cards = Array.from(
			container.querySelectorAll<HTMLElement>(".task-card"),
		);
		if (cards.length === 0) return 0;
		for (let i = 0; i < cards.length; i++) {
			const rect = cards[i].getBoundingClientRect();
			if (e.clientY < rect.top + rect.height / 2) return i;
		}
		return cards.length;
	};

	const handleColumnDragOver = (e: React.DragEvent, colKey: string) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (!draggedTaskId) return;
		const idx = calcInsertIndex(e, colKey);
		setDragInsertInfo({ colKey, index: idx });
	};

	const computeMoveRank = (
		colTasks: any[],
		taskId: string,
		toIdx: number,
	): number => {
		const remaining = colTasks.filter((t: any) => t._id !== taskId);
		const prevRank = toIdx > 0 ? remaining[toIdx - 1].rank : -1;
		const nextRank =
			toIdx < remaining.length ? remaining[toIdx].rank : prevRank + 2;
		return (prevRank + nextRank) / 2;
	};

	const handleDrop = async (e: React.DragEvent, status: string) => {
		e.preventDefault();
		if (isCompleted) {
			setDraggedTaskId(null);
			setDragInsertInfo(null);
			return;
		}
		const taskId = e.dataTransfer.getData("taskId");
		if (taskId) {
			const task = tasks.find((t: any) => t._id === taskId);
			if (task && canEditTask(task)) {
				const insertIdx =
					dragInsertInfo?.colKey === status
						? dragInsertInfo.index
						: -1;
				const sourceStatus = task.status;
				const isCrossColumn = sourceStatus !== status;

				const targetColTasks = grouped[status] || [];
				let toIdx = insertIdx > -1 ? insertIdx : targetColTasks.length;
				if (!isCrossColumn) {
					const fromIdx = targetColTasks.findIndex(
						(t: any) => t._id === taskId,
					);
					if (fromIdx > -1 && toIdx > fromIdx) toIdx--;
				}
				const newRank = computeMoveRank(targetColTasks, taskId, toIdx);

				try {
					const payload: any = { rank: newRank };
					if (isCrossColumn) payload.status = status;
					await api.put(`/tasks/${taskId}`, payload);

					queryClient.setQueryData(taskQueryKey, (old: any[]) => {
						if (!old) return old;
						return old.map((t) =>
							t._id === taskId
								? {
										...t,
										rank: newRank,
										...(isCrossColumn ? { status } : {}),
									}
								: t,
						);
					});
				} catch {
					queryClient.invalidateQueries({ queryKey: taskQueryKey });
				}
			}
		}
		setDraggedTaskId(null);
		setDragInsertInfo(null);
		draggedCardRectRef.current = null;
	};

	const deleteTask = async (taskId: string) => {
		if (!window.confirm("Delete this task?")) return false;
		try {
			await api.delete(`/tasks/${taskId}`);
			queryClient.setQueryData(taskQueryKey, (old: any[]) =>
				old ? old.filter((t) => t._id !== taskId) : old,
			);
			return true;
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed");
			return false;
		}
	};

	const handleCreateTask = async () => {
		if (!createForm.title.trim() || !createForm.assignedTo) return;
		setSubmitting(true);
		try {
			const payload: any = {
				title: createForm.title,
				description: createForm.description,
				assignedTo: createForm.assignedTo,
				priority: createForm.priority,
			};
			if (createForm.dueDate) payload.dueDate = createForm.dueDate;
			if (createForm.assignment)
				payload.assignment = createForm.assignment;
			if (createColumnStatus) payload.status = createColumnStatus;
			if (createForm.board) payload.board = createForm.board;
			else if (activeBoardId) payload.board = activeBoardId;

			await api.post("/tasks", payload);
			setShowCreateModal(false);
			setCreateColumnStatus("");
			setCreateForm({
				title: "",
				description: "",
				assignedTo: user?._id || "",
				dueDate: "",
				noDueDate: false,
				priority: "medium",
				assignment: "",
				board: "",
			});
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed to create task");
		} finally {
			setSubmitting(false);
		}
	};

	const handleRenameColumn = async (oldKey: string) => {
		if (!editColumnLabel.trim() || !activeBoardId) return;
		try {
			await api.put(`/boards/${activeBoardId}/columns/${oldKey}/rename`, {
				label: editColumnLabel.trim(),
			});
			queryClient.invalidateQueries({
				queryKey: ["board", activeBoardId],
			});
			setEditingColumnKey(null);
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed");
		}
	};

	const handleAddColumn = async () => {
		if (!activeBoardId) return;
		const existingLabels = boardColumns.map((c: any) =>
			c.label.toLowerCase(),
		);
		let label = "New Column";
		let counter = 1;
		while (existingLabels.includes(label.toLowerCase())) {
			counter++;
			label = `New Column ${counter}`;
		}
		try {
			await api.post(`/boards/${activeBoardId}/columns`, { label });
			queryClient.invalidateQueries({
				queryKey: ["board", activeBoardId],
			});
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed");
		}
	};

	const handleCompleteBoard = async () => {
		if (!activeBoardId) return;
		const lastCol = boardColumns[boardColumns.length - 1];
		const lastColKey = lastCol?.key;
		// Count against the FULL board task list, not the tab/company-filtered
		// view — and surface invisible tasks (status matches no column, e.g.
		// default 'todo' tasks attached to custom-column boards) that would
		// otherwise make this warning a mystery.
		let allBoardTasks: any[] = tasks;
		try {
			const { data } = await api.get("/tasks", {
				params: { board: activeBoardId },
			});
			allBoardTasks = data.tasks || [];
		} catch {
			/* fall back to the visible list */
		}
		const openTasks = lastColKey
			? allBoardTasks.filter((t: any) => t.status !== lastColKey)
			: [...allBoardTasks];
		const orphaned = openTasks.filter(
			(t: any) => !boardColumns.some((c: any) => c.key === t.status),
		);
		const named = openTasks
			.slice(0, 5)
			.map((t: any) => `• ${t.title}`)
			.join("\n");
		const msg =
			openTasks.length > 0
				? `Complete this sprint? ${openTasks.length} task${openTasks.length !== 1 ? "s are" : " is"} not in "${lastCol?.label || "the final column"}"${orphaned.length ? ` (${orphaned.length} not visible in any column)` : ""}:\n${named}${openTasks.length > 5 ? `\n…and ${openTasks.length - 5} more` : ""}\n\nThe board will become view-only.`
				: "Complete this sprint? The board will become view-only.";
		if (!window.confirm(msg)) return;
		try {
			await api.post(`/boards/${activeBoardId}/complete`);
			queryClient.invalidateQueries({
				queryKey: ["board", activeBoardId],
			});
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed to complete board");
		}
	};

	const handleReopenBoard = async () => {
		if (!activeBoardId) return;
		if (
			!window.confirm(
				"Reopen this sprint? Members will be able to make changes again.",
			)
		)
			return;
		try {
			await api.post(`/boards/${activeBoardId}/reopen`);
			queryClient.invalidateQueries({
				queryKey: ["board", activeBoardId],
			});
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed to reopen board");
		}
	};

	const handleDeleteColumn = async (key: string) => {
		if (!activeBoardId) return;
		const taskCount = tasks.filter((t: any) => t.status === key).length;
		if (taskCount > 0) {
			alert(
				`Cannot delete: ${taskCount} task(s) are still in this column. Move them first.`,
			);
			return;
		}
		if (!window.confirm("Delete this column?")) return;
		try {
			await api.delete(`/boards/${activeBoardId}/columns/${key}`);
			queryClient.invalidateQueries({
				queryKey: ["board", activeBoardId],
			});
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed");
		}
	};

	const handleColumnDragStart = (e: React.DragEvent, key: string) => {
		setDraggedColumnKey(key);
		e.dataTransfer.setData("columnKey", key);
		e.dataTransfer.effectAllowed = "move";
	};

	const handleColumnDrop = async (e: React.DragEvent, targetKey: string) => {
		e.preventDefault();
		const sourceKey = e.dataTransfer.getData("columnKey");
		if (!sourceKey || sourceKey === targetKey || !activeBoardId) return;

		const keys = boardColumns.map((c: any) => c.key);
		const fromIdx = keys.indexOf(sourceKey);
		const toIdx = keys.indexOf(targetKey);
		if (fromIdx === -1 || toIdx === -1) return;

		keys.splice(fromIdx, 1);
		keys.splice(toIdx, 0, sourceKey);

		try {
			await api.put(`/boards/${activeBoardId}/columns/reorder`, {
				columnKeys: keys,
			});
			queryClient.invalidateQueries({
				queryKey: ["board", activeBoardId],
			});
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed");
		}
		setDraggedColumnKey(null);
	};

	const openDetailModal = async (task: any) => {
		setDetailTask(task);
		setDetailEditing(false);
		try {
			const { data } = await api.get("/files", {
				params: { taskId: task._id },
			});
			setDetailAttachments(data.attachments || []);
		} catch {
			setDetailAttachments([]);
		}
	};

	const startDetailEdit = () => {
		setDetailEditForm({
			title: detailTask.title,
			description: detailTask.description || "",
			assignedTo: detailTask.assignedTo?._id || "",
			priority: detailTask.priority,
			status: detailTask.status,
			dueDate:
				detailTask.dueDate &&
				new Date(detailTask.dueDate).getFullYear() > 1970
					? detailTask.dueDate.split("T")[0]
					: "",
			noDueDate:
				!detailTask.dueDate ||
				new Date(detailTask.dueDate).getFullYear() <= 1970,
		});
		setDetailEditing(true);
	};

	const saveDetailEdit = async () => {
		if (!detailTask || !detailEditForm.title?.trim()) return;
		setDetailSaving(true);
		try {
			const payload: any = {
				title: detailEditForm.title,
				description: detailEditForm.description,
				assignedTo: detailEditForm.assignedTo,
				priority: detailEditForm.priority,
				status: detailEditForm.status,
			};
			if (!detailEditForm.noDueDate && detailEditForm.dueDate) {
				payload.dueDate = detailEditForm.dueDate;
			}
			const { data } = await api.put(`/tasks/${detailTask._id}`, payload);
			queryClient.setQueryData(taskQueryKey, (old: any[]) =>
				old
					? old.map((t) => (t._id === detailTask._id ? data.task : t))
					: old,
			);
			setDetailTask(data.task);
			setDetailEditing(false);
		} catch (e: any) {
			alert(e.response?.data?.message || "Failed to update task");
		} finally {
			setDetailSaving(false);
		}
	};

	const handleAttachmentUpload = async (
		e: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = e.target.files?.[0];
		if (!file || !detailTask) return;
		setUploadingAttachment(true);
		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("taskId", detailTask._id);
			const { data } = await api.post("/files", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});
			setDetailAttachments((prev) => [data.attachment, ...prev]);
		} catch (err: any) {
			alert(err.response?.data?.message || "Upload failed");
		} finally {
			setUploadingAttachment(false);
			if (attachmentInputRef.current)
				attachmentInputRef.current.value = "";
		}
	};

	const handleDeleteAttachment = async (attachmentId: string) => {
		if (!window.confirm("Delete this attachment?")) return;
		try {
			await api.delete(`/files/${attachmentId}`);
			setDetailAttachments((prev) =>
				prev.filter((a) => a._id !== attachmentId),
			);
		} catch (err: any) {
			alert(err.response?.data?.message || "Failed to delete");
		}
	};

	const handleFileDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
		const file = e.dataTransfer.files?.[0];
		if (!file || !detailTask) return;
		setUploadingAttachment(true);
		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("taskId", detailTask._id);
			const { data } = await api.post("/files", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});
			setDetailAttachments((prev) => [data.attachment, ...prev]);
		} catch (err: any) {
			alert(err.response?.data?.message || "Upload failed");
		} finally {
			setUploadingAttachment(false);
		}
	};

	const getDeadlineStyle = (dueDate: string, status: string) => {
		if (!dueDate || new Date(dueDate).getFullYear() <= 1970)
			return { color: "var(--color-text-tertiary)" };
		if (status === "completed") return { color: "#22c55e" };
		const days = differenceInDays(new Date(dueDate), new Date());
		if (days < 0) return { color: "#ef4444", fontWeight: 600 };
		if (days === 0) return { color: "#d97706", fontWeight: 600 };
		if (days <= 2) return { color: "#f59e0b" };
		return { color: "var(--color-text-tertiary)" };
	};

	const getDeadlineLabel = (dueDate: string, status: string) => {
		if (!dueDate || new Date(dueDate).getFullYear() <= 1970)
			return "No due date";
		if (status === "completed") return format(new Date(dueDate), "MMM d");
		const days = differenceInDays(new Date(dueDate), new Date());
		if (days < 0) return `${Math.abs(days)}d overdue`;
		if (days === 0) return "Due today";
		if (days <= 2) return `${days}d left`;
		return format(new Date(dueDate), "MMM d");
	};

	const defaultColumns = [
		{ key: "todo", label: "To Do", color: "#94a3b8" },
		{ key: "in_progress", label: "In Progress", color: "#3b82f6" },
		{ key: "review", label: "Review", color: "#f59e0b" },
		{ key: "completed", label: "Completed", color: "#22c55e" },
	];

	const activeColumns = activeBoardId
		? boardColumns.map((c: any) => ({
				key: c.key,
				label: c.label,
				color: c.color,
			}))
		: defaultColumns;

	const columnCount = activeColumns.length;
	const fitCount = columnCount <= 4 ? 4 : 5;
	const columnsFit = columnCount > fitCount ? columnCount : fitCount;
	const columnsWidth = `${(columnsFit / fitCount) * 90}%`;
	const basisCount = Math.max(columnCount, 1);
	const columnBasis = `calc((100% - ${(basisCount - 1) * 8}px) / ${basisCount})`;

	const grouped: Record<string, any[]> = {};
	activeColumns.forEach((col) => {
		grouped[col.key] = tasks
			.filter((t: any) => t.status === col.key)
			.sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0));
	});

	const activeStatusLabels: Record<string, string> = {};
	activeColumns.forEach((col) => {
		activeStatusLabels[col.key] = col.label;
	});

	const hasBoard = !!activeBoardId && !!board;
	const activeBoardInfo = hasBoard ? board : null;

	// Tiny uppercase captions above the toolbar controls.
	const fieldLabelStyle: React.CSSProperties = {
		display: "block",
		fontSize: "0.6875rem",
		fontWeight: 600,
		textTransform: "uppercase",
		letterSpacing: "0.05em",
		color: "var(--color-text-tertiary)",
		marginBottom: 4,
	};

	// Board wrapper hugs its content (height: fit-content): the whole board
	// is always fully visible and the page scrolls — no capped box, no
	// internal scroll, nothing gets cut off.

	// Freeze the ORIGINAL headers while the page scrolls: each header is
	// translated down by the scrolled distance, clamped to its own column so
	// it never slides past the column's bottom (same clamp native sticky
	// would apply). rAF-throttled, style-only — no re-renders on scroll.
	useEffect(() => {
		let raf = 0;
		const update = () => {
			raf = 0;
			const main = document.getElementById("main-content-scroll");
			const board = boardWrapRef.current;
			if (!main || !board) return;
			const mainTop = main.getBoundingClientRect().top;
			const push = mainTop - board.getBoundingClientRect().top;
			headerRefs.current.forEach((h) => {
				const col = h.parentElement;
				if (!col) return;
				const maxPush = Math.max(0, col.offsetHeight - h.offsetHeight);
				const y = Math.min(Math.max(push, 0), maxPush);
				h.style.transform = y > 0 ? `translateY(${y}px)` : "";
				h.classList.toggle("kanban-stuck", y > 0);
			});
		};
		const schedule = () => {
			if (!raf) raf = requestAnimationFrame(update);
		};
		update();
		const main = document.getElementById("main-content-scroll");
		main?.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			main?.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			if (raf) cancelAnimationFrame(raf);
		};
	}, [loading, activeBoardId, columnCount]);

	return (
		<div className="flex flex-col justify-between items-start gap-3 mb-6">
			{/* Header */}

			<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-2">
				<div>
          <p
						style={{
							fontSize: "0.875rem",
							color: "var(--color-text-secondary)",
							marginTop: 2,
						}}
					>
						{tasks.length} task{tasks.length !== 1 ? "s" : ""}
					</p>
          
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
						}}
					>
						{activeBoardInfo && (
							<div
								style={{
									width: 12,
									height: 12,
									// borderRadius: "50%",
									background: activeBoardInfo.color,
									flexShrink: 0,
								}}
							/>
						)}
						<h1
							style={{
								fontSize: "1.5rem",
								fontWeight: 700,
								letterSpacing: "-0.02em",
							}}
						>
							{activeBoardInfo
								? "Kanban : " + activeBoardInfo?.title
								: "Tasks / Kanban View"}
						</h1>

						{isCompleted && (
							<span
								style={{
									display: "inline-block",
									marginTop: 6,
									fontSize: "0.6875rem",
									fontWeight: 700,
									textTransform: "uppercase",
									letterSpacing: "0.04em",
									padding: "3px 10px",
									borderRadius: 9999,
									background: "#dcfce7",
									color: "#15803d",
								}}
							>
								Completed
								{board?.completedAt
									? ` • ${format(new Date(board.completedAt), "MMM d, yyyy")}`
									: ""}
							</span>
						)}
					</div>

					
				</div>
				{/* <button
          className="btn btn-primary w-full sm:w-auto"
          onClick={() => setShowCreateModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={16} /> Create Task
        </button> */}
				{/* Board Selector */}
				<div
					className="w-full sm:w-auto  "
					style={{
						display: "flex",
						gap: 8,
						alignItems: "center",
						flexWrap: "wrap",
					}}
				>
					{activeBoardId && !isCompleted && (
						<button
							className="btn w-full sm:w-auto"
							onClick={handleAddColumn}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
							}}
							title="Add a new column to this board"
						>
							<Plus size={16} /> New Column
						</button>
					)}
					{activeBoardId && canManageBoard && !isCompleted && (
						<button
							className="btn w-full sm:w-auto"
							onClick={handleCompleteBoard}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								background: "#dcfce7",
								color: "#15803d",
								fontWeight: 600,
							}}
							title="Mark sprint as completed (view-only)"
						>
							<Check size={16} /> Complete Sprint
						</button>
					)}
					{activeBoardId && canManageBoard && isCompleted && (
						<button
							className="btn w-full sm:w-auto"
							onClick={handleReopenBoard}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
							}}
							title="Reopen sprint for editing"
						>
							Reopen Sprint
						</button>
					)}
				</div>
			</div>

			{/* Board members — stacked avatars + invite */}
			{activeBoardId && board && (
				<div
					data-members-menu
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						flexWrap: "wrap",
						position: "relative",
					}}
				>
					<div
						style={{ display: "flex", alignItems: "center" }}
						title={(board.members || [])
							.map((m: any) => m.name)
							.join(", ")}
					>
						{(board.members || [])
							.slice(0, 5)
							.map((m: any, i: number) => (
								<span
									key={m._id || i}
									style={{
										marginLeft: i === 0 ? 0 : -8,
										borderRadius: "50%",
										border: "2px solid var(--color-bg)",
										lineHeight: 0,
									}}
								>
									<Avatar
										src={m.avatar}
										name={m.name}
										size={28}
									/>
								</span>
							))}
						{(board.members || []).length > 5 && (
							<span
								style={{
									marginLeft: -8,
									minWidth: 28,
									height: 28,
									borderRadius: "50%",
									background:
										"var(--color-surface-hover)",
									border: "2px solid var(--color-bg)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									fontSize: "0.6875rem",
									fontWeight: 600,
									color: "var(--color-text-secondary)",
									padding: "0 4px",
								}}
							>
								+{(board.members || []).length - 5}
							</span>
						)}
						{(board.members || []).length === 0 && (
							<span
								style={{
									fontSize: "0.75rem",
									color: "var(--color-text-tertiary)",
								}}
							>
								No members yet
							</span>
						)}
					</div>
					<button
						className="btn btn-ghost btn-sm"
						onClick={() => {
						setMembersOpen((v) => !v);
						setInviteOpen(false);
					}}
						aria-expanded={membersOpen}
						title={membersOpen ? "Hide members" : "Show members"}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 4,
							color: "var(--color-text-secondary)",
							fontSize: "0.75rem",
							fontWeight: 500,
						}}
					>
						{boardMembers.length} member
						{boardMembers.length !== 1 ? "s" : ""}
						{pendingInvites.length > 0 && (
							<span>
								{" "}
								• {pendingInvites.length} pending
							</span>
						)}
						<ChevronDown
							size={14}
							style={{
								transform: membersOpen
									? "rotate(180deg)"
									: "none",
								transition: "transform 0.2s",
							}}
						/>
					</button>
					{canManageBoard && !isCompleted && (
						<div style={{ position: "relative" }} ref={inviteRef}>
							<button
								className="btn btn-sm"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
								}}
								onClick={() => {
								setInviteOpen((v) => !v);
								setMembersOpen(false);
							}}
							>
								<UserPlus size={14} /> Invite
							</button>
							{inviteOpen && (
								<div
									className="card"
									style={{
										position: "absolute",
										top: "calc(100% + 6px)",
										left: 0,
										zIndex: 60,
										width: 280,
										padding: 12,
									}}
								>
									<input
										className="input"
										autoFocus
										placeholder="Search by name or email..."
										value={inviteSearch}
										onChange={(e) =>
											setInviteSearch(e.target.value)
										}
										style={{ width: "100%", marginBottom: 8 }}
									/>
									<div
										style={{
											maxHeight: 220,
											overflowY: "auto",
											display: "flex",
											flexDirection: "column",
											gap: 2,
										}}
									>
										{inviteCandidates
											.slice(0, 8)
											.map((u: any) => {
												const alreadyInvited =
													pendingInviteIds.has(u._id);
												return (
													<div
														key={u._id}
														role={
															alreadyInvited
																? undefined
																: "button"
														}
														tabIndex={
															alreadyInvited
																? -1
																: 0
														}
														onClick={() => {
															if (
																!alreadyInvited
															)
																handleInviteMember(
																	u._id,
																);
														}}
														onKeyDown={(e) => {
															if (
																e.key ===
																	"Enter" &&
																!alreadyInvited
															)
																handleInviteMember(
																	u._id,
																);
														}}
														style={{
															display: "flex",
															alignItems: "center",
															gap: 8,
															padding: "8px 10px",
															cursor: alreadyInvited
																? "default"
																: "pointer",
															fontSize: "0.8125rem",
															borderRadius: 8,
															opacity: alreadyInvited
																? 0.75
																: 1,
														}}
														onMouseEnter={(e) => {
															if (!alreadyInvited)
																e.currentTarget.style.background =
																	"var(--color-surface-hover)";
														}}
														onMouseLeave={(e) => {
															e.currentTarget.style.background =
																"transparent";
														}}
													>
														<Avatar
															src={u.avatar}
															name={u.name}
															size={24}
														/>
														<span
															style={{
																overflow:
																	"hidden",
																textOverflow:
																	"ellipsis",
																whiteSpace:
																	"nowrap",
															}}
														>
															{u.name}
														</span>
														<span
															style={{
																marginLeft: "auto",
																flexShrink: 0,
															}}
														>
															{alreadyInvited ? (
																<span
																	style={{
																		fontSize:
																			"0.625rem",
																		fontWeight: 700,
																		textTransform:
																			"uppercase",
																		letterSpacing:
																			"0.04em",
																		padding:
																				"2px 8px",
																		borderRadius:
																			9999,
																		background:
																			"#fef3c7",
																		color:
																			"#b45309",
																	}}
																>
																	Invited
																</span>
															) : invitingId ===
															  u._id ? (
															<Loader2
																size={14}
																className="animate-spin"
															/>
														) : (
															<Plus size={14} />
														)}
														</span>
													</div>
												);
											})}
										{inviteCandidates.length === 0 && (
											<div
												style={{
													fontSize: "0.78rem",
													color: "var(--color-text-tertiary)",
													textAlign: "center",
													padding: "8px 0",
												}}
											>
												No users found
											</div>
										)}
									</div>
								</div>
							)}
						</div>
					)}
					</div>
				)}
				<div data-members-menu style={{ position: "relative", width: 0, height: 0 }}>
					{membersOpen && (
							<div
								className="card"
								style={{
									position: "absolute",
									top: "calc(100% + 8px)",
									left: 0,
									zIndex: 60,
									width: "min(440px, calc(100vw - 48px))",
									maxHeight: 420,
									overflowY: "auto",
									border: "1px solid var(--color-border)",
									borderRadius: 12,
									background: "var(--color-surface)",
									boxShadow: "var(--shadow-md)",
									padding: 12,
									display: "flex",
									flexDirection: "column",
									gap: 14,
								}}
							>
						<div>
							<div
								style={{
									fontSize: "0.6875rem",
									fontWeight: 600,
									textTransform: "uppercase",
									letterSpacing: "0.05em",
									color: "var(--color-text-tertiary)",
									marginBottom: 8,
								}}
							>
								Members ({boardMembers.length})
							</div>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 6,
								}}
							>
								{boardMembers.map((m: any) => (
									<div
										key={m._id}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
										}}
									>
										<Avatar
											src={m.avatar}
											name={m.name}
											size={24}
										/>
										<div>
											<div
												style={{
													fontSize: "0.8125rem",
													fontWeight: 500,
												}}
											>
												{m.name}
												{(m._id ===
													(board.createdBy?._id ||
														board.createdBy) && (
													<span
														style={{
															fontSize: "0.625rem",
															color: "var(--color-primary)",
															marginLeft: 6,
														}}
													>
														(Creator)
													</span>
												))}
												{(m._id === user?._id && (
													<span
														style={{
															fontSize: "0.625rem",
															color: "var(--color-text-tertiary)",
															marginLeft: 6,
														}}
													>
														(You)
													</span>
												))}
											</div>
											<div
												style={{
													fontSize: "0.6875rem",
													color: "var(--color-text-tertiary)",
												}}
											>
												{m.email}
											</div>
										</div>
										{canManageBoard &&
											m._id !==
												(board.createdBy?._id ||
													board.createdBy) && (
											<button
												className="btn btn-ghost btn-xs"
													style={{ color: "#ef4444", marginLeft: "auto" }}
												title={`Remove ${m.name}`}
												onClick={() =>
													handleRemoveMember(
														m._id,
														m.name,
													)
												}
											>
												Remove
											</button>
										)}
									</div>
								))}
							</div>
						</div>
						<div>
							<div
								style={{
									fontSize: "0.6875rem",
									fontWeight: 600,
									textTransform: "uppercase",
									letterSpacing: "0.05em",
									color: "var(--color-text-tertiary)",
									marginBottom: 8,
								}}
							>
								Pending invitations ({pendingInvites.length})
							</div>
							{pendingInvites.length === 0 ? (
								<div
									style={{
										fontSize: "0.78rem",
										color: "var(--color-text-tertiary)",
									}}
								>
									No pending invitations
								</div>
							) : (
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 6,
									}}
								>
									{pendingInvites.map((inv: any) => (
										<div
											key={inv._id}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
											}}
										>
											<Avatar
												src={inv.user?.avatar}
												name={inv.user?.name}
												size={24}
											/>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div
													style={{
														fontSize: "0.8125rem",
														fontWeight: 500,
													}}
												>
													{inv.user?.name ||
														"Unknown user"}
												</div>
												<div
													style={{
														fontSize: "0.6875rem",
														color: "var(--color-text-tertiary)",
													}}
												>
													Invited by{" "}
													{inv.invitedBy?.name ||
														"someone"}
												</div>
											</div>
											<span
												style={{
													fontSize: "0.625rem",
													fontWeight: 700,
													textTransform: "uppercase",
													letterSpacing: "0.04em",
													padding: "2px 8px",
													borderRadius: 9999,
													background:
														"#fef3c7",
													color: "#b45309",
													flexShrink: 0,
												}}
											>
										Pending
									</span>
									{canManageBoard && (
										<button
											className="btn btn-ghost btn-xs"
											style={{ color: "#ef4444" }}
														onClick={() =>
															handleRevokeInvitation(
																inv._id,
																inv.user?.name,
															)
														}
													>
														Revoke
													</button>
									)}
								</div>
							))}
								</div>
							)}
						</div>
					</div>
				)}
				</div>

			{/* Completed banner — view-only notice */}
			{isCompleted && (
				<div
					className="w-full"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "10px 14px",
						borderRadius: 10,
						background: "#f0fdf4",
						border: "1px solid #bbf7d0",
						fontSize: "0.8125rem",
						color: "#15803d",
					}}
				>
					<Check size={16} style={{ flexShrink: 0 }} />
					<span>
						This sprint was completed
						{board?.completedBy?.name
							? ` by ${board.completedBy.name}`
							: ""}
						{board?.completedAt
							? ` on ${format(new Date(board.completedAt), "MMM d, yyyy")}`
							: ""}{" "}
						and is now view-only.
					</span>
				</div>
			)}

			{/* Controls toolbar — search, filters and the All/My view switch grouped in one row */}
			<div className="flex flex-col lg:flex-row gap-3 mb-6 w-full lg:items-end">
				<div className="flex-1" style={{ minWidth: 200 }}>
					<label htmlFor="task-search" style={fieldLabelStyle}>
						Search
					</label>
					<div className="relative" ref={searchContainerRef}>
						<Search
							size={16}
							style={{
								position: "absolute",
								left: 12,
								top: "50%",
								transform: "translateY(-50%)",
								color: "var(--color-text-tertiary)",
							}}
						/>
						<input
							id="task-search"
							className="input"
							style={{ paddingLeft: 36, width: "100%" }}
							placeholder="Search tasks..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						{search &&
							search.trim().length >= 2 &&
							searchResults.length > 0 && (
								<div
									style={{
										position: "absolute",
										top: "100%",
										left: 0,
										right: 0,
										zIndex: 50,
										background: "var(--color-surface)",
										border: "1px solid var(--color-border)",
										borderRadius: 8,
										marginTop: 4,
										maxHeight: 300,
										overflowY: "auto",
										boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
									}}
								>
									{searchResults.map((t: any) => (
										<div
											key={t._id}
											style={{
												padding: "10px 12px",
												cursor: "pointer",
												borderBottom:
													"1px solid var(--color-border)",
												display: "flex",
												flexDirection: "column",
												gap: 2,
											}}
											onClick={() => scrollToTask(t._id)}
											onMouseEnter={(e) =>
												(e.currentTarget.style.background =
													"var(--color-surface-hover)")
											}
											onMouseLeave={(e) =>
												(e.currentTarget.style.background =
													"transparent")
											}
										>
											<span
												style={{
													fontSize: "0.8125rem",
													fontWeight: 600,
												}}
											>
												{t.title}
											</span>
											<span
												style={{
													fontSize: "0.75rem",
													color: "var(--color-text-secondary)",
													display: "flex",
													gap: 8,
												}}
											>
												<span
													style={{
														textTransform:
															"capitalize",
													}}
												>
													{t.status?.replace(
														"_",
														" ",
													)}
												</span>
												{t.assignedTo?.name && (
													<span>
														{t.assignedTo.name}
													</span>
												)}
												{t.assignment?.title && (
													<span
														style={{
															color: "var(--color-primary)",
														}}
													>
														{t.assignment.title}
													</span>
												)}
											</span>
										</div>
									))}
								</div>
							)}
						{search &&
							search.trim().length >= 2 &&
							searchResults.length === 0 && (
								<div
									style={{
										position: "absolute",
										top: "100%",
										left: 0,
										right: 0,
										zIndex: 50,
										background: "var(--color-surface)",
										border: "1px solid var(--color-border)",
										borderRadius: 8,
										marginTop: 4,
										padding: "12px 12px",
										boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
										fontSize: "0.8125rem",
										color: "var(--color-text-secondary)",
									}}
								>
									No tasks found
								</div>
							)}
					</div>
				</div>

				{!activeBoardId && (
					<div className="w-full lg:w-60" style={{ flexShrink: 0 }}>
						<label htmlFor="task-company" style={fieldLabelStyle}>
							Company
						</label>
						<select
							id="task-company"
							className="select"
							value={selectedCompany}
							onChange={(e) => setSelectedCompany(e.target.value)}
							style={{ width: "100%" }}
						>
							<option value="">All Companies</option>
							{companies.map((c: any) => (
								<option key={c._id} value={c._id}>
									{c.name}
								</option>
							))}
						</select>
					</div>
				)}

				{/* Board switcher */}
				<div className="w-full lg:w-60" style={{ flexShrink: 0 }}>
					<label htmlFor="task-board" style={fieldLabelStyle}>
						Board
					</label>
					<select
						id="task-board"
						className="select"
						value={activeBoardId || "__all__"}
						onChange={(e) => {
							if (e.target.value === "__all__") {
								navigate("/tasks");
							} else {
								navigate(`/tasks/${e.target.value}`);
							}
						}}
						style={{ width: "100%" }}
					>
						<option value="__all__">All Tasks (no board)</option>
						{allBoards.map((b: any) => (
							<option key={b._id} value={b._id}>
								{b.title}
								{b.status === "completed" ? " (Completed)" : ""}
							</option>
						))}
					</select>
				</div>
				{/* View switch — All / My tasks as a segmented control */}
				<div style={{ flexShrink: 0 }}>
					<span style={fieldLabelStyle} id="task-view-label">
						View
					</span>
					<div
						role="tablist"
						aria-labelledby="task-view-label"
						style={{
							display: "flex",
							gap: 4,
							padding: 4,
							background: "var(--color-surface-hover)",
							borderRadius: 10,
							flexShrink: 0,
						}}
					>
						{(["all", "my"] as const).map((tab) => (
							<button
								key={tab}
								role="tab"
								aria-selected={currentTab === tab}
								onClick={() => setCurrentTab(tab)}
								style={{
									padding: "8px 18px",
									fontSize: "0.8125rem",
									fontWeight: 600,
									borderRadius: 7,
									border: "none",
									cursor: "pointer",
									whiteSpace: "nowrap",
									background:
										currentTab === tab
											? "var(--color-surface)"
											: "transparent",
									color:
										currentTab === tab
											? "var(--color-text)"
											: "var(--color-text-secondary)",
									boxShadow:
										currentTab === tab
											? "0 1px 3px rgba(0,0,0,0.12)"
											: "none",
								}}
							>
								{tab === "all" ? "All Tasks" : "My Tasks"}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Kanban Board - unified view */}
			{loading ? (
				<div style={{ display: "flex", gap: 8, width: "100%" }}>
					{[1, 2, 3, 4].map((i) => (
						<div
							key={i}
							className="skeleton"
							style={{ height: 300, borderRadius: 12, flex: 1 }}
						/>
					))}
				</div>
			) : (
				<>
					{/* Board scroller: single two-axis scroll container — horizontal
					    when columns overflow, vertical when cards overflow. The
					    ORIGINAL headers freeze with `position: sticky`, so there
					    is no mirrored copy to drift out of alignment. */}
					<div
						ref={boardWrapRef}
						className="hide-scrollbar flex w-full gap-2"
						style={{
							height: "fit-content",
							overflowX: "auto",
							overflowY: "visible",
						}}
					>
						{/* Row takes the outer 8px gap out of its width so the
						    90% columns + 10% new-column zone sum to exactly
						    100% instead of overflowing and slicing columns. */}
						<div
							className="flex gap-2 shrink-0"
							style={{
								width: `calc(${columnsWidth} - 8px)`,
								// Stretch every column to the row height, which is
								// set by the tallest column — so all columns are
								// always exactly as tall as the fullest one.
								alignItems: "stretch",
							}}
						>
							{activeColumns.map((col: any) => (
								<div
									key={col.key}
									className="kanban-col group"
									style={{
										background:
											"var(--color-surface-hover)",
										borderRadius: 12,
										padding: 8,
										border: draggedTaskId
											? `2px dashed ${col.color}40`
											: draggedColumnKey === col.key
												? `2px dashed ${col.color}`
												: "2px solid transparent",
										transition: "all 0.2s ease",
										flex: `0 0 ${columnBasis}`,
										minWidth: 200,
										// Keep empty columns from collapsing into
										// stubs — every column holds at least
										// half the viewport height.
										minHeight: "50dvh",
									}}
									// className="flex-1"
									onDragOver={(e) => {
										handleColumnDragOver(e, col.key);
										setHoveredColumn(col.key);
									}}
									onDrop={(e) => {
										if (draggedColumnKey) {
											handleColumnDrop(e, col.key);
										} else {
											handleDrop(e, col.key);
										}
									}}
									onMouseEnter={() =>
										setHoveredColumn(col.key)
									}
									onMouseLeave={() => setHoveredColumn(null)}
								>
									{/* Column header — fixed height so every column lines
									    up; frozen on page scroll by translating the
									    original node (see effect above) */}
									<div
										ref={(el) => {
											if (el)
												headerRefs.current.set(
													col.key,
													el,
												);
											else
												headerRefs.current.delete(
													col.key,
												);
										}}
										style={{
											position: "relative",
											zIndex: 10,
											background:
												"var(--color-surface-hover)",
											display: "flex",
											alignItems: "center",
											gap: 6,
											height: 44,
											padding: "0 4px",
											marginBottom: 8,
											borderBottom:
												"1px solid var(--color-border)",
										}}
									>
										{activeBoardId && !isCompleted && (
											<span
												title="Drag to reorder column"
												draggable
												onDragStart={(e) =>
													handleColumnDragStart(
														e,
														col.key,
													)
												}
												className="hidden lg:group-hover:flex"
												style={{
													position: "absolute",
													left: 0,
													top: "50%",
													transform:
														"translateY(-50%)",
													alignItems: "center",
													cursor: "grab",
													background:
														"var(--color-surface-hover)",
													borderRadius: 6,
													padding: 2,
													zIndex: 5,
												}}
											>
												<GripVertical
													size={14}
													style={{
														display: "block",
														color: "var(--color-text-tertiary)",
													}}
												/>
											</span>
										)}
										<div
											style={{
												width: 8,
												height: 8,
												borderRadius: "50%",
												background: col.color,
												flexShrink: 0,
											}}
										/>
										{editingColumnKey === col.key ? (
											<input
												className="input"
												style={{
													fontSize: "0.8125rem",
													padding: "2px 6px",
													flex: 1,
												}}
												value={editColumnLabel}
												onChange={(e) =>
													setEditColumnLabel(
														e.target.value,
													)
												}
												onBlur={() =>
													handleRenameColumn(col.key)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter")
														handleRenameColumn(
															col.key,
														);
													if (e.key === "Escape")
														setEditingColumnKey(
															null,
														);
												}}
												autoFocus
											/>
										) : (
											<span
												title={
													activeBoardId &&
													!isCompleted
														? `${col.label} (double-click to rename)`
														: col.label
												}
												style={{
													fontSize: "0.8125rem",
													fontWeight: 600,
													flex: 1,
													minWidth: 0,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
													cursor:
														activeBoardId &&
														!isCompleted
															? "pointer"
															: "default",
												}}
												onDoubleClick={() => {
													if (
														!activeBoardId ||
														isCompleted
													)
														return;
													setEditingColumnKey(
														col.key,
													);
													setEditColumnLabel(
														col.label,
													);
												}}
											>
												{col.label}
											</span>
										)}
										{/* Task count pill — hidden for now, uncomment to restore
										<span
											title={`${grouped[col.key]?.length || 0} tasks`}
											style={{
												fontSize: "0.6875rem",
												fontWeight: 600,
												color: "var(--color-text-secondary)",
												background:
													"var(--color-surface)",
												border: "1px solid var(--color-border)",
												borderRadius: 9999,
												padding: "1px 8px",
												flexShrink: 0,
											}}
										>
											{grouped[col.key]?.length || 0}
										</span>
										*/}
										{activeBoardId && !isCompleted && (
											<span
												style={{
													display: "flex",
													alignItems: "center",
													gap: 2,
													flexShrink: 0,
												}}
											>
												<button
													className="btn btn-ghost btn-xs"
													style={{ padding: 2 }}
													title="Rename column"
													onClick={() => {
														setEditingColumnKey(
															col.key,
														);
														setEditColumnLabel(
															col.label,
														);
													}}
												>
													<SquarePen
														size={12}
														style={{
															color: "var(--color-text-tertiary)",
														}}
													/>
												</button>
												<button
													className="btn btn-ghost btn-xs"
													style={{ padding: 2 }}
													title="Delete column"
													onClick={() =>
														handleDeleteColumn(
															col.key,
														)
													}
												>
													<Trash2
														size={12}
														style={{
															color: "var(--color-text-tertiary)",
														}}
													/>
												</button>
											</span>
										)}
									</div>

									{/* Task cards */}
									<div
										data-col={col.key}
										className=""
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 8,
											flex: 1,
										}}
									>
										{grouped[col.key]?.map(
											(t: any, colIdx: number) => (
												<React.Fragment key={t._id}>
													{draggedTaskId &&
														dragInsertInfo?.colKey ===
															col.key &&
														dragInsertInfo?.index ===
															colIdx && (
															<div
																style={{
																	display:
																		"flex",
																	alignItems:
																		"center",
																	gap: 0,
																	marginBottom:
																		-1,
																}}
															>
																<div
																	style={{
																		width: 8,
																		height: 8,
																		borderRadius:
																			"50%",
																		background:
																			"var(--color-primary)",
																		flexShrink: 0,
																	}}
																/>
																<div
																	style={{
																		height: 2,
																		flex: 1,
																		background:
																			"var(--color-primary)",
																		borderRadius:
																			"0 2px 2px 0",
																	}}
																/>
															</div>
														)}
													{/* task card */}
													<div
														id={`task-card-${t._id}`}
														className={`card task-card${highlightedTaskId === t._id ? " task-highlight" : ""}`}
														style={{
															padding: "12px",
															borderRadius: "4px",
															cursor:
																canEditTask(
																	t,
																) &&
																!isCompleted
																	? "grab"
																	: "default",
															opacity:
																draggedTaskId ===
																t._id
																	? 0.4
																	: 1,
															border:
																draggedTaskId ===
																t._id
																	? `1px dashed ${col.color}`
																	: "1px solid var(--color-border)",
															transition:
																"opacity 0.15s ease",
														}}
														draggable={
															canEditTask(t) &&
															!isCompleted
														}
														onDragStart={(e) =>
															handleDragStart(
																e,
																t._id,
															)
														}
														onDragEnd={
															handleDragEnd
														}
														onMouseDown={() => {
															if (isCompleted) {
																showToast(
																	"This sprint is completed and view-only.",
																);
															} else if (
																!canEditTask(t)
															) {
																showToast(
																	getDeniedReason(
																		t,
																	),
																);
															}
														}}
													>
														<div
															style={{
																display: "flex",
																justifyContent:
																	"space-between",
																alignItems:
																	"flex-start",
																marginBottom: 4,
																paddingBottom: 8,
																borderBottom:
																	"1px solid var(--color-border)",
															}}
														>
															<div
																style={{
																	fontSize:
																		"0.6875rem",
																	textTransform:
																		"uppercase",
																	color: "var(--color-primary)",
																	fontWeight: 600,
																	cursor: t.assignment
																		? "pointer"
																		: "default",
																	textDecoration:
																		t.assignment
																			? "underline"
																			: "none",
																	textUnderlineOffset: 2,
																}}
																onClick={() => {
																	if (
																		t
																			.assignment
																			?._id
																	)
																		navigate(
																			`/assignments/${t.assignment._id}`,
																		);
																}}
															>
																{t.assignment
																	?.title ||
																	"General"}
															</div>
															<span
																className={`badge badge-${t.priority}`}
																style={{
																	fontSize:
																		"0.625rem",
																}}
															>
																{
																	PRIORITY_LABELS[
																		t
																			.priority
																	]
																}
															</span>
														</div>
														<div
															className="font-bold"
															style={{
																fontSize:
																	"0.8125rem",
																lineHeight: 1.4,
																cursor: "pointer",
															}}
															onClick={(e) => {
																e.stopPropagation();
																openDetailModal(
																	t,
																);
															}}
														>
															{t.title}
														</div>
														<div
															style={{
																fontSize:
																	"0.8125rem",
																lineHeight: 1.4,
																marginBottom: 8,
																display:
																	"-webkit-box",
																WebkitLineClamp: 3,
																WebkitBoxOrient:
																	"vertical",
																overflow:
																	"hidden",
																textOverflow:
																	"ellipsis",
																wordBreak:
																	"break-word",
																overflowWrap:
																	"break-word",
																cursor: "pointer",
																width: "100%",
																minWidth: 0,
															}}
															className="text-(--color-text-secondary)"
															onClick={(e) => {
																e.stopPropagation();
																openDetailModal(
																	t,
																);
															}}
														>
															{t.description}
														</div>
														<div
															style={{
																display: "flex",
																justifyContent:
																	"space-between",
																alignItems:
																	"center",
															}}
														>
															<div
																style={{
																	display:
																		"flex",
																	alignItems:
																		"center",
																	gap: 4,
																}}
															>
																<Avatar
																	src={
																		t
																			.assignedTo
																			?.avatar
																	}
																	name={
																		t
																			.assignedTo
																			?.name
																	}
																	size={20}
																/>
																<span
																	style={{
																		fontSize:
																			"0.6875rem",
																		color: "var(--color-text-secondary)",
																	}}
																>
																	{
																		t.assignedTo?.name?.split(
																			" ",
																		)[0]
																	}
																</span>
															</div>
															<span
																style={{
																	fontSize:
																		"0.6875rem",
																	...getDeadlineStyle(
																		t.dueDate,
																		t.status,
																	),
																}}
															>
																{getDeadlineLabel(
																	t.dueDate,
																	t.status,
																)}
															</span>
														</div>
													</div>
												</React.Fragment>
											),
										)}
										{draggedTaskId &&
											dragInsertInfo?.colKey ===
												col.key &&
											dragInsertInfo?.index ===
												(grouped[col.key]?.length ||
													0) && (
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: 0,
														marginTop: -1,
													}}
												>
													<div
														style={{
															width: 8,
															height: 8,
															borderRadius: "50%",
															background:
																"var(--color-primary)",
															flexShrink: 0,
														}}
													/>
													<div
														style={{
															height: 2,
															flex: 1,
															background:
																"var(--color-primary)",
															borderRadius:
																"0 2px 2px 0",
														}}
													/>
												</div>
											)}

										{/* New Task button - always occupies space; invisible placeholder when not hovering, becomes the button on hover */}
										{!draggedTaskId && !isCompleted && (
											<div
												className="card"
												style={{
													padding: "12px",
													borderRadius: "4px",
													cursor: "pointer",
													border: "1px dashed var(--color-border)",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													gap: 6,
													color: "var(--color-text-tertiary)",
													fontSize: "0.8125rem",
													transition: "all 0.2s ease",
													visibility:
														hoveredColumn ===
														col.key
															? "visible"
															: "hidden",
													pointerEvents:
														hoveredColumn ===
														col.key
															? "auto"
															: "none",
												}}
												onMouseEnter={(e) => {
													e.currentTarget.style.borderColor =
														col.color;
													e.currentTarget.style.color =
														col.color;
												}}
												onMouseLeave={(e) => {
													e.currentTarget.style.borderColor =
														"var(--color-border)";
													e.currentTarget.style.color =
														"var(--color-text-tertiary)";
												}}
												onClick={() => {
													if (
														hoveredColumn ===
														col.key
													) {
														setCreateColumnStatus(
															col.key,
														);
														setShowCreateModal(
															true,
														);
													}
												}}
											>
												<Plus size={14} /> New Task
											</div>
										)}

										<div
											className="card flex-1 empty-drop-zone "
											style={{
												background: "none",
												border: "none",
												boxShadow: "none",
												borderRadius: 0,
											}}
										></div>
									</div>
								</div>
							))}
						</div>
					</div>
				</>
			)}

			{/* Create Task Modal */}
			<Modal
				isOpen={showCreateModal}
				onClose={() => {
					setShowCreateModal(false);
					setCreateColumnStatus("");
					setAssignOpen(false);
					setAssignSearch("");
				}}
			>
				<div
					className="card animate-fade-in"
					style={{
						minWidth: 500,
						width: "100%",
						padding: 0,
						overflow: "hidden",
						borderRadius: 16,
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
							{/* <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--color-primary-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={18} style={{ color: "var(--color-primary)" }} />
              </div> */}
							<div>
								<h3
									style={{
										fontSize: "1rem",
										fontWeight: 700,
										margin: 0,
									}}
								>
									Create Task
								</h3>
								<p
									style={{
										fontSize: "0.72rem",
										color: "var(--color-text-tertiary)",
										margin: "2px 0 0",
									}}
								>
									{createColumnStatus
										? `Add to ${activeStatusLabels[createColumnStatus] || "column"}`
										: "Add a new task"}
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
							onClick={() => setShowCreateModal(false)}
						>
							<X size={16} />
						</button>
					</div>

					<div
						style={{
							padding: 24,
							display: "flex",
							flexDirection: "column",
							gap: 18,
						}}
					>
						<div>
							<label
								style={{
									display: "block",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									marginBottom: 6,
								}}
							>
								Title{" "}
								<span style={{ color: "var(--color-danger)" }}>
									*
								</span>
							</label>
							<input
								type="text"
								className="input"
								placeholder="e.g. Design landing page"
								value={createForm.title}
								onChange={(e) =>
									setCreateForm({
										...createForm,
										title: e.target.value,
									})
								}
							/>
						</div>

						<div>
							<label
								style={{
									display: "block",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									marginBottom: 6,
								}}
							>
								Description{" "}
								<span style={{ color: "var(--color-danger)" }}>
									*
								</span>
							</label>
							<textarea
								className="input"
								style={{ minHeight: 70, resize: "vertical" }}
								placeholder="Task details..."
								value={createForm.description}
								onChange={(e) =>
									setCreateForm({
										...createForm,
										description: e.target.value,
									})
								}
							/>
						</div>
						<div>
							<label
								style={{
									display: "block",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									marginBottom: 6,
								}}
							>
								Project{" "}
								<span
									style={{
										fontSize: "0.7rem",
										color: "var(--color-text-tertiary)",
									}}
								>
									(optional)
								</span>
							</label>
							<select
								className="select"
								value={createForm.assignment}
								onChange={(e) =>
									setCreateForm({
										...createForm,
										assignment: e.target.value,
									})
								}
								style={{ width: "100%" }}
							>
								<option value="">
									Standalone task (no project)
								</option>
								{assignments.map((a: any) => (
									<option key={a._id} value={a._id}>
										{a.title}
									</option>
								))}
							</select>
						</div>
						{!activeBoardId && (
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.75rem",
										color: "var(--color-text-secondary)",
										marginBottom: 6,
									}}
								>
									Board{" "}
									<span
										style={{
											fontSize: "0.7rem",
											color: "var(--color-text-tertiary)",
										}}
									>
										(optional)
									</span>
								</label>
								<select
									className="select"
									value={createForm.board}
									onChange={(e) =>
										setCreateForm({
											...createForm,
											board: e.target.value,
										})
									}
									style={{ width: "100%" }}
								>
									<option value="">
										No board (standalone task)
									</option>
									{allBoards.map((b: any) => (
										<option key={b._id} value={b._id}>
											{b.title}
										</option>
									))}
								</select>
							</div>
						)}
						<div>
							<label
								style={{
									display: "block",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									marginBottom: 6,
								}}
							>
								Assign To{" "}
								<span style={{ color: "var(--color-danger)" }}>
									*
								</span>
							</label>
							{createForm.assignment == "" ? (
								<div
									ref={assignRef}
									style={{ position: "relative" }}
								>
										<Search
											size={13}
											style={{
												position: "absolute",
												left: 10,
												top: "50%",
												transform: "translateY(-50%)",
												color: "var(--color-text-tertiary)",
												pointerEvents: "none",
											}}
										/>
										<input
											type="text"
											className="select"
											placeholder="Select a user"
											autoComplete="off"
											value={
												assignOpen
													? assignSearch
													: users.find(
															(u: any) =>
																u._id ===
																createForm.assignedTo,
														)?.name +
															" (" +
															users.find(
																(u: any) =>
																	u._id ===
																	createForm.assignedTo,
															)?.email +
															")" || ""
											}
											onFocus={() => {
												setAssignOpen(true);
												setAssignSearch("");
											}}
											onChange={(e) =>
												setAssignSearch(e.target.value)
											}
											onKeyDown={(e) => {
												if (e.key === "Escape")
													setAssignOpen(false);
											}}
											style={{
												width: "100%",
												paddingLeft: 28,
												paddingRight: 28,
												cursor: "text",
											}}
										/>
										{/* <ChevronRight size={14} style={{ position: "absolute", right: 9, top: "50%", transform: `translateY(-50%) rotate(${assignOpen ? 90 : 0}deg)`, transition: "transform 0.15s", color: "var(--color-text-tertiary)", pointerEvents: "none" }} /> */}
										{assignOpen && (
										<div
											className="card"
											style={{
												padding: "10px",
												position: "absolute",
												top: "calc(100% + 4px)",
												left: 0,
												right: 0,
												zIndex: 50,
												overflow: "hidden",
												borderRadius: 10,
												boxShadow:
													"var(--color-shadow, 0 8px 24px rgba(0,0,0,0.15))",
											}}
										>
											{users.filter((u: any) =>
												u.name
													?.toLowerCase()
													.includes(
														assignSearch.toLowerCase(),
													),
											).length === 0 && (
												<div
													style={{
														padding: "10px 12px",
														fontSize: "0.78rem",
														color: "var(--color-text-tertiary)",
													}}
												>
													No users found
												</div>
											)}
											<div
												style={{
													maxHeight: 180,
													overflowY: "auto",
												}}
											>
												{users
													.filter((u: any) =>
														u.name
															?.toLowerCase()
															.includes(
																assignSearch.toLowerCase(),
															),
													)
													.map((u: any) => (
														<div
															key={u._id}
															onMouseDown={(e) =>
																e.preventDefault()
															}
															onClick={() => {
																setCreateForm({
																	...createForm,
																	assignedTo:
																		u._id,
																});
																setAssignOpen(
																	false,
																);
																setAssignSearch(
																	"",
																);
															}}
															style={{
																display: "flex",
																alignItems:
																	"center",
																gap: 8,
																padding:
																	"7px 10px",
																cursor: "pointer",
																fontSize:
																	"0.82rem",
																background:
																	u._id ===
																	createForm.assignedTo
																		? "var(--color-primary-light)"
																		: "transparent",
															}}
															onMouseEnter={(e) =>
																(e.currentTarget.style.background =
																	"var(--color-surface-hover)")
															}
															onMouseLeave={(e) =>
																(e.currentTarget.style.background =
																	u._id ===
																	createForm.assignedTo
																		? "var(--color-primary-light)"
																		: "transparent")
															}
														>
															<Avatar
																src={u.avatar}
																name={u.name}
																size={20}
															/>
															<span
																style={{
																	overflow:
																		"hidden",
																	textOverflow:
																		"ellipsis",
																	whiteSpace:
																		"nowrap",
																}}
															>
																{u.name}{" "}
																{u.name ===
																user?.name
																	? " (You)"
																	: ""}
															</span>
															{u._id ===
																createForm.assignedTo && (
																<Check
																	size={13}
																	style={{
																		marginLeft:
																			"auto",
																		flexShrink: 0,
																		color: "var(--color-primary)",
																	}}
																/>
															)}
														</div>
													))}
											</div>
										</div>
									)}
								</div>
							) : (
								<select
									className="select"
									value={createForm.assignedTo}
									onChange={(e) =>
										setCreateForm({
											...createForm,
											assignedTo: e.target.value,
										})
									}
									style={{ width: "100%" }}
								>
									<option key={user?._id} value={user?._id}>
										{user?.name}
									</option>
								</select>
							)}
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
										marginBottom: 6,
									}}
								>
									Due Date
								</label>
								<input
									type="date"
									className="input"
									value={createForm.dueDate}
									onChange={(e) =>
										setCreateForm({
											...createForm,
											dueDate: e.target.value,
											noDueDate: false,
										})
									}
									disabled={createForm.noDueDate}
									style={{ width: "100%", marginBottom: 4 }}
								/>
								<label
									style={{
										display: "flex",
										alignItems: "center",
										gap: 4,
										cursor: "pointer",
										fontSize: "0.7rem",
										color: "var(--color-text-tertiary)",
									}}
								>
									<input
										type="checkbox"
										checked={createForm.noDueDate}
										onChange={(e) =>
											setCreateForm({
												...createForm,
												dueDate: e.target.checked
													? ""
													: createForm.dueDate,
												noDueDate: e.target.checked,
											})
										}
									/>
									No Due Date
								</label>
							</div>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.75rem",
										color: "var(--color-text-secondary)",
										marginBottom: 6,
									}}
								>
									Priority
								</label>
								<select
									className="select"
									value={createForm.priority}
									onChange={(e) =>
										setCreateForm({
											...createForm,
											priority: e.target.value,
										})
									}
									style={{ width: "100%" }}
								>
									{Object.entries(PRIORITY_LABELS).map(
										([k, v]) => (
											<option key={k} value={k}>
												{v}
											</option>
										),
									)}
								</select>
							</div>
						</div>
						<button
							className="btn btn-primary"
							style={{
								width: "100%",
								marginTop: 4,
								padding: "10px",
							}}
							disabled={
								!createForm.title.trim() ||
								!createForm.assignedTo ||
								submitting
							}
							onClick={handleCreateTask}
						>
							{submitting ? (
								<Loader2 size={16} className="animate-spin" />
							) : null}
							{submitting ? "Creating..." : "Create Task"}
						</button>
					</div>
				</div>
			</Modal>

			{/* Task Detail Modal */}
			<Modal
				isOpen={!!detailTask}
				onClose={() => {
					setDetailTask(null);
					setDetailAttachments([]);
					setDetailEditing(false);
				}}
			>
				{detailTask && (
					<div
						className="card animate-fade-in"
						style={{
							maxWidth: 640,
							width: "100%",
							padding: 0,
							overflow: "hidden",
							borderRadius: 16,
						}}
					>
						<div
							style={{
								padding: "20px 24px",
								paddingBottom: "0px",
								display: "flex",
								justifyContent: "space-between",
								alignItems: "flex-end",
								background: "var(--color-surface)",
							}}
						>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										fontSize: "0.7rem",
										color: "var(--color-text-tertiary)",
										marginBottom: 4,
										fontWeight: 600,
										textTransform: "uppercase",
									}}
								>
									Title
								</div>
								{detailEditing ? (
									<input
										className="input"
										style={{
											fontSize: "0.95rem",
											fontWeight: 700,
										}}
										value={detailEditForm.title}
										onChange={(e) =>
											setDetailEditForm({
												...detailEditForm,
												title: e.target.value,
											})
										}
									/>
								) : (
									<div
										style={{
											fontSize: "0.95rem",
											fontWeight: 700,
											lineHeight: 1.4,
										}}
									>
										{detailTask.title}
									</div>
								)}
							</div>
							<div
								className="flex items-center justify-center"
								style={{
									gap: 6,
									flexShrink: 0,
									marginLeft: 12,
								}}
							>
								{!detailEditing &&
									!isCompleted &&
									canEditTask(detailTask) && (
										<button
											className="btn btn-ghost btn-xs"
											style={{
												color: "var(--color-primary)",
											}}
											onClick={startDetailEdit}
											title="Edit Task"
										>
											<SquarePen size={20} />
										</button>
									)}
								{!detailEditing &&
									!isCompleted &&
									canDeleteTask(detailTask) && (
										<button
											className="btn btn-ghost btn-xs"
											style={{
												color: "var(--color-error, #ef4444)",
											}}
											onClick={async () => {
												const deleted =
													await deleteTask(
														detailTask._id,
													);
												if (deleted) {
													setDetailTask(null);
													setDetailAttachments([]);
													setDetailEditing(false);
												}
											}}
											title="Delete Task"
										>
											<Trash2 size={20} />
										</button>
									)}
								<button
									className={`bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) ${detailEditing ? "w-10 h-10" : "w-8 h-8"} `}
									style={{
										background:
											"var(--color-surface-hover)",
										border: "none",
										cursor: "pointer",
										color: "var(--color-text-tertiary)",
										borderRadius: 8,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
									}}
									onClick={() => {
										if (detailEditing) {
											setDetailEditing(false);
										} else {
											setDetailTask(null);
											setDetailAttachments([]);
											setDetailEditing(false);
										}
									}}
								>
									<X size={16} />
								</button>
							</div>
						</div>

						<div
							style={{
								padding: 24,
								display: "grid",
								gridTemplateColumns: "3fr 2fr",
								gap: 20,
								maxHeight: "70dvh",
								overflowY: "auto",
							}}
						>
							{/* LHS: Title, Description, Meta */}
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 14,
									minWidth: 0,
								}}
							>
								{detailEditing ? (
									<>
										<div
											style={{
												display: "grid",
												gridTemplateColumns: "1fr 1fr",
												gap: 10,
											}}
										>
											<div>
												<label
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
														display: "block",
													}}
												>
													Assigned To
												</label>
												<select
													className="select"
													style={{ width: "100%" }}
													value={
														detailEditForm.assignedTo
													}
													onChange={(e) =>
														setDetailEditForm({
															...detailEditForm,
															assignedTo:
																e.target.value,
														})
													}
												>
													{users.map((u: any) => (
														<option
															key={u._id}
															value={u._id}
														>
															{u.name}
														</option>
													))}
												</select>
											</div>
											<div>
												<label
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
														display: "block",
													}}
												>
													Priority
												</label>
												<select
													className="select"
													style={{ width: "100%" }}
													value={
														detailEditForm.priority
													}
													onChange={(e) =>
														setDetailEditForm({
															...detailEditForm,
															priority:
																e.target.value,
														})
													}
												>
													{Object.entries(
														PRIORITY_LABELS,
													).map(([k, v]) => (
														<option
															key={k}
															value={k}
														>
															{v}
														</option>
													))}
												</select>
											</div>
											<div>
												<label
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
														display: "block",
													}}
												>
													Status
												</label>
												<select
													className="select"
													style={{ width: "100%" }}
													value={
														detailEditForm.status
													}
													onChange={(e) =>
														setDetailEditForm({
															...detailEditForm,
															status: e.target
																.value,
														})
													}
												>
													{activeColumns.map(
														(c: any) => (
															<option
																key={c.key}
																value={c.key}
															>
																{c.label}
															</option>
														),
													)}
												</select>
											</div>
											<div>
												<label
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
														display: "block",
													}}
												>
													Due Date
												</label>
												<input
													type="date"
													className="input"
													style={{ width: "100%" }}
													value={
														detailEditForm.dueDate
													}
													disabled={
														detailEditForm.noDueDate
													}
													onChange={(e) =>
														setDetailEditForm({
															...detailEditForm,
															dueDate:
																e.target.value,
														})
													}
												/>
												<label
													style={{
														display: "flex",
														alignItems: "center",
														gap: 4,
														cursor: "pointer",
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginTop: 4,
													}}
												>
													<input
														type="checkbox"
														checked={
															detailEditForm.noDueDate
														}
														onChange={(e) =>
															setDetailEditForm({
																...detailEditForm,
																dueDate: e
																	.target
																	.checked
																	? ""
																	: detailEditForm.dueDate,
																noDueDate:
																	e.target
																		.checked,
															})
														}
													/>
													No Due Date
												</label>
											</div>
										</div>
										<div>
											<label
												style={{
													fontSize: "0.7rem",
													color: "var(--color-text-tertiary)",
													marginBottom: 4,
													fontWeight: 600,
													textTransform: "uppercase",
													display: "block",
												}}
											>
												Description
											</label>
											<textarea
												className="input"
												style={{
													minHeight: 80,
													resize: "vertical",
												}}
												value={
													detailEditForm.description
												}
												onChange={(e) =>
													setDetailEditForm({
														...detailEditForm,
														description:
															e.target.value,
													})
												}
												placeholder="Task description..."
											/>
										</div>
										<div
											style={{
												display: "flex",
												gap: 8,
												justifyContent: "flex-end",
											}}
										>
											<button
												className="btn btn-ghost btn-sm"
												onClick={() =>
													setDetailEditing(false)
												}
											>
												Cancel
											</button>
											<button
												className="btn btn-primary btn-sm"
												onClick={saveDetailEdit}
												disabled={detailSaving}
											>
												{detailSaving ? (
													<Loader2
														size={14}
														className="animate-spin"
													/>
												) : (
													<Check size={14} />
												)}
												{detailSaving
													? "Saving..."
													: "Save"}
											</button>
										</div>
									</>
								) : (
									<>
										<div
											style={{
												display: "grid",
												gridTemplateColumns: "1fr 1fr",
												gap: 10,
											}}
										>
											<div>
												<div
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
													}}
												>
													Assigned To
												</div>
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: 6,
													}}
												>
													<Avatar
														src={
															detailTask
																.assignedTo
																?.avatar
														}
														name={
															detailTask
																.assignedTo
																?.name
														}
														size={22}
													/>
													<span
														style={{
															fontSize:
																"0.8125rem",
														}}
													>
														{
															detailTask
																.assignedTo
																?.name
														}
													</span>
												</div>
											</div>
											<div>
												<div
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
													}}
												>
													Priority
												</div>
												<span
													className={`badge badge-${detailTask.priority}`}
													style={{
														fontSize: "0.75rem",
													}}
												>
													{
														PRIORITY_LABELS[
															detailTask.priority
														]
													}
												</span>
											</div>
											<div>
												<div
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
													}}
												>
													Status
												</div>
												<span
													className={`badge badge-${detailTask.status}`}
													style={{
														fontSize: "0.75rem",
														textTransform:
															"capitalize",
													}}
												>
													{detailTask.status?.replace(
														/_/g,
														" ",
													)}
												</span>
											</div>
											<div>
												<div
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
													}}
												>
													Created
												</div>
												<span
													style={{
														fontSize: "0.8125rem",
													}}
												>
													{detailTask.createdAt
														? format(
																new Date(
																	detailTask.createdAt,
																),
																"MMM d, yyyy",
															)
														: "—"}
												</span>
											</div>
											<div>
												<div
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
													}}
												>
													Due Date
												</div>
												<span
													style={{
														fontSize: "0.8125rem",
														...getDeadlineStyle(
															detailTask.dueDate,
															detailTask.status,
														),
													}}
												>
													{getDeadlineLabel(
														detailTask.dueDate,
														detailTask.status,
													)}
												</span>
											</div>
										</div>

										{detailTask.description && (
											<div>
												<div
													style={{
														fontSize: "0.7rem",
														color: "var(--color-text-tertiary)",
														marginBottom: 4,
														fontWeight: 600,
														textTransform:
															"uppercase",
													}}
												>
													Description
												</div>
												<div
													style={{
														fontSize: "0.85rem",
														lineHeight: 1.6,
														color: "var(--color-text-secondary)",
														whiteSpace: "pre-wrap",
														wordBreak: "break-word",
														overflowWrap:
															"break-word",
													}}
												>
													{detailTask.description}
												</div>
											</div>
										)}
									</>
								)}

								{detailTask.assignment && (
									<div
										style={{
											padding: "10px 12px",
											background:
												"var(--color-primary-light)",
											borderRadius: 8,
										}}
									>
										<span
											style={{
												fontSize: "0.75rem",
												color: "var(--color-text-tertiary)",
											}}
										>
											Project:{" "}
										</span>
										<span
											style={{
												fontSize: "0.8125rem",
												fontWeight: 600,
												color: "var(--color-primary)",
												cursor: "pointer",
											}}
											onClick={() => {
												setDetailTask(null);
												navigate(
													`/assignments/${detailTask.assignment._id}`,
												);
											}}
										>
											{detailTask.assignment.title}
										</span>
									</div>
								)}
							</div>

							{/* RHS: Attachments */}
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 8,
									minWidth: 0,
									borderLeft: "1px solid var(--color-border)",
									paddingLeft: 20,
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
									}}
								>
									<Paperclip
										size={14}
										style={{
											color: "var(--color-text-tertiary)",
										}}
									/>
									<span
										style={{
											fontSize: "0.75rem",
											fontWeight: 600,
											color: "var(--color-text-tertiary)",
											textTransform: "uppercase",
										}}
									>
										Attachments ({detailAttachments.length})
									</span>
								</div>

								{!isCompleted && (
									<div
										onDragOver={(e) => {
											e.preventDefault();
											setIsDragOver(true);
										}}
										onDragLeave={() => setIsDragOver(false)}
										onDrop={handleFileDrop}
										onClick={() =>
											attachmentInputRef.current?.click()
										}
										style={{
											border: `2px dashed ${isDragOver ? "var(--color-primary)" : "var(--color-border)"}`,
											borderRadius: 10,
											padding: "18px 12px",
											textAlign: "center",
											cursor: "pointer",
											background: isDragOver
												? "var(--color-primary-light)"
												: "var(--color-surface)",
											transition: "all 0.2s ease",
										}}
									>
										<input
											ref={attachmentInputRef}
											type="file"
											className="hidden"
											onChange={handleAttachmentUpload}
										/>
										{uploadingAttachment ? (
											<Loader2
												size={20}
												className="animate-spin"
												style={{
													color: "var(--color-primary)",
													margin: "0 auto 4px",
												}}
											/>
										) : (
											<Upload
												size={20}
												style={{
													color: isDragOver
														? "var(--color-primary)"
														: "var(--color-text-tertiary)",
													margin: "0 auto 4px",
													display: "block",
												}}
											/>
										)}
										<p
											style={{
												fontSize: "0.78rem",
												fontWeight: 600,
												margin: "0 0 2px",
												color: isDragOver
													? "var(--color-primary)"
													: "var(--color-text-secondary)",
											}}
										>
											{uploadingAttachment
												? "Uploading..."
												: "Drop file here or click to browse"}
										</p>
										<p
											style={{
												fontSize: "0.68rem",
												margin: 0,
												color: "var(--color-text-tertiary)",
											}}
										>
											Max 50MB
										</p>
									</div>
								)}

								{detailAttachments.length > 0 && (
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 4,
										}}
									>
										{detailAttachments.map((att: any) => (
											<div
												key={att._id}
												style={{
													display: "flex",
													alignItems: "center",
													justifyContent:
														"space-between",
													padding: "6px 10px",
													borderRadius: 6,
													border: "1px solid var(--color-border)",
													background:
														"var(--color-surface)",
												}}
											>
												<div
													style={{
														position: "relative",
														display: "flex",
														alignItems: "center",
														gap: 6,
														height: 44,
														padding: "0 4px",
														marginBottom: 8,
														borderBottom:
															"1px solid var(--color-border)",
													}}
												>
													<Paperclip
														size={12}
														style={{
															color: "var(--color-primary)",
															flexShrink: 0,
														}}
													/>
													<span
														style={{
															fontSize: "0.75rem",
															overflow: "hidden",
															textOverflow:
																"ellipsis",
															whiteSpace:
																"nowrap",
														}}
													>
														{att.originalName}
													</span>
												</div>
												<div
													style={{
														display: "flex",
														gap: 2,
														flexShrink: 0,
														marginLeft: 6,
													}}
												>
													<span
														style={{
															fontSize: "0.65rem",
															color: "var(--color-text-tertiary)",
															alignSelf: "center",
														}}
													>
														{att.fileSize > 1048576
															? `${(att.fileSize / 1048576).toFixed(1)}MB`
															: `${(att.fileSize / 1024).toFixed(0)}KB`}
													</span>
													<button
														className="btn btn-ghost btn-xs"
														style={{
															padding: 2,
															color: "var(--color-primary)",
														}}
														onClick={() =>
															downloadFile(
																att._id,
																att.originalName,
															)
														}
													>
														<Download size={12} />
													</button>
													{!isCompleted &&
														(user?.role ===
															"admin" ||
															att.uploadedBy
																?._id ===
																user?._id) && (
															<button
																className="btn btn-ghost btn-xs"
																style={{
																	padding: 2,
																	color: "var(--color-error)",
																}}
																onClick={() =>
																	handleDeleteAttachment(
																		att._id,
																	)
																}
															>
																<Trash2
																	size={12}
																/>
															</button>
														)}
												</div>
											</div>
										))}
									</div>
								)}

								{detailAttachments.length === 0 && (
									<div
										style={{
											fontSize: "0.78rem",
											color: "var(--color-text-tertiary)",
											textAlign: "center",
											padding: "12px 0",
										}}
									>
										No attachments yet
									</div>
								)}
							</div>
						</div>
					</div>
				)}
			</Modal>

			{/* Drop animation overlay */}
			{dropAnim && (
				<div
					key={dropAnim.key}
					style={{
						position: "fixed",
						inset: 0,
						pointerEvents: "none",
						zIndex: 2000,
					}}
				>
					<div
						className="drop-ghost"
						style={{
							position: "absolute",
							left: dropAnim.x,
							top: dropAnim.y,
							width: dropAnim.w,
							height: dropAnim.h,
							borderRadius: 10,
							border: "2px solid var(--color-primary)",
							background: "var(--color-primary-light)",
							opacity: 0.5,
						}}
					/>
				</div>
			)}

			{toastMsg && (
				<div
					style={{
						position: "fixed",
						bottom: 24,
						left: "50%",
						transform: "translateX(-50%)",
						background: "#1e293b",
						color: "#f1f5f9",
						padding: "10px 20px",
						borderRadius: 8,
						fontSize: "0.8125rem",
						fontWeight: 500,
						zIndex: 2000,
						boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
						animation: "toastIn 0.3s ease",
					}}
				>
					{toastMsg}
				</div>
			)}

			<style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* Frozen column header (translated by the scroll effect): shadow
           signals it is floating above the cards scrolling beneath it. */
        .kanban-stuck { box-shadow: 0 10px 18px -8px rgba(0,0,0,0.35); }

        @media (max-width: 768px) {
          /* Keep columns usable on small screens: fixed minimum width so the
             board scrolls horizontally instead of squeezing the columns. */
          .kanban-col {
            min-width: 200px;
          }
        }

        @keyframes dropGhostExpand {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        .drop-ghost {
          animation: dropGhostExpand 0.6s ease-out forwards;
        }
        @keyframes toastIn {
          0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
		</div>
	);
};

export default TasksPage;
