import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import Avatar from "../components/common/Avatar";
import Modal from "../components/common/Modal";
import { useAuthStore } from "../store/authStore";
import { Search, Trash2, X, Check, Plus, Loader2, GripVertical, ChevronRight, Paperclip, Download, Upload, SquarePen } from "lucide-react";
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
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);
  const [editColumnLabel, setEditColumnLabel] = useState("");
  const [showNewColumnCard, setShowNewColumnCard] = useState(false);
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [detailTask, setDetailTask] = useState<any>(null);
  const [detailAttachments, setDetailAttachments] = useState<any[]>([]);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailEditForm, setDetailEditForm] = useState<any>({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [dropAnim, setDropAnim] = useState<{ x: number; y: number; w: number; h: number; key: number } | null>(null);
  const draggedCardRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragInsertInfo, setDragInsertInfo] = useState<{ colKey: string; index: number } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const { data: boardData, isFetching: boardFetching } = useQuery({
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
  // const isManager = user?.role === "manager";
  // const isEmployee = user?.role === "member";

  const canEditTask = (task: any) => {
    if (isAdmin) return true;
    if (task.assignment) {
      const isProjectCreator = task.assignment.createdBy?._id === user?._id || task.assignment.createdBy === user?._id;
      const isProjectTeamMember = task.assignment.team?.some((m: any) => (m._id || m) === user?._id);
      return isProjectCreator || isProjectTeamMember;
    }
    return task.createdBy?._id === user?._id || task.assignedTo?._id === user?._id;
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
      const isTaskCreator = task.assignment.createdBy?._id === user?._id
      return isTaskCreator ;
    }
    return task.createdBy?._id === user?._id
  };

  const { data: companiesData } = useQuery({
    queryKey: ["companies-flat"],
    queryFn: async () => {
      const { data } = await api.get("/companies", { params: { flat: "true" } });
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

  const { data: assignmentsData } = useQuery({
    queryKey: ["assignments"],
    queryFn: async () => {
      const { data } = await api.get("/assignments");
      return data.assignments || [];
    },
  });
  const assignments = assignmentsData || [];

  const taskQueryKey = ["tasks", activeBoardId, selectedCompany, currentTab, user?._id];

  const { data: tasksData, isLoading: loading, isFetching: tasksFetching } = useQuery({
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

  const isSyncing = activeBoardId && (boardFetching || tasksFetching);

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
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      setHighlightedTaskId(taskId);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedTaskId(null), 2000);
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
      const response = await api.get(`/files/${fileId}/download`, { responseType: "blob" });
      const contentType = response.headers["content-type"] || "application/octet-stream";
      const url = window.URL.createObjectURL(new Blob([response.data], { type: contentType }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData("taskId", taskId);
    e.dataTransfer.effectAllowed = "move";
    const el = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(el, 0, 0);
    const rect = el.getBoundingClientRect();
    draggedCardRectRef.current = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragInsertInfo(null);
  };

  const calcInsertIndex = (e: React.DragEvent, colKey: string) => {
    const container = (e.currentTarget as HTMLElement).querySelector(`[data-col="${colKey}"]`) as HTMLElement | null;
    if (!container) return -1;

    // If hovering over the empty spacer zone, always insert at the top —
    // don't do position math against it.
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest(".empty-drop-zone")) {
      const cards = container.querySelectorAll<HTMLElement>(".task-card");
      return cards.length;
    }


    const cards = Array.from(container.querySelectorAll<HTMLElement>(".task-card"));
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

  const computeMoveRank = (colTasks: any[], taskId: string, toIdx: number): number => {
    const remaining = colTasks.filter((t: any) => t._id !== taskId);
    const prevRank = toIdx > 0 ? remaining[toIdx - 1].rank : -1;
    const nextRank = toIdx < remaining.length ? remaining[toIdx].rank : prevRank + 2;
    return (prevRank + nextRank) / 2;
  };

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      const task = tasks.find((t: any) => t._id === taskId);
      if (task && canEditTask(task)) {
        const insertIdx = dragInsertInfo?.colKey === status ? dragInsertInfo.index : -1;
        const sourceStatus = task.status;
        const isCrossColumn = sourceStatus !== status;

        const targetColTasks = grouped[status] || [];
        let toIdx = insertIdx > -1 ? insertIdx : targetColTasks.length;
        if (!isCrossColumn) {
          const fromIdx = targetColTasks.findIndex((t: any) => t._id === taskId);
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
              t._id === taskId ? { ...t, rank: newRank, ...(isCrossColumn ? { status } : {}) } : t,
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
      if (createForm.assignment) payload.assignment = createForm.assignment;
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
      queryClient.invalidateQueries({ queryKey: ["board", activeBoardId] });
      setEditingColumnKey(null);
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed");
    }
  };

  const handleAddColumn = async () => {
    if (!activeBoardId) return;
    const existingLabels = boardColumns.map((c: any) => c.label.toLowerCase());
    let label = "New Column";
    let counter = 1;
    while (existingLabels.includes(label.toLowerCase())) {
      counter++;
      label = `New Column ${counter}`;
    }
    try {
      await api.post(`/boards/${activeBoardId}/columns`, { label });
      queryClient.invalidateQueries({ queryKey: ["board", activeBoardId] });
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed");
    }
  };

  const handleDeleteColumn = async (key: string) => {
    if (!activeBoardId) return;
    const taskCount = tasks.filter((t: any) => t.status === key).length;
    if (taskCount > 0) {
      alert(`Cannot delete: ${taskCount} task(s) are still in this column. Move them first.`);
      return;
    }
    if (!window.confirm("Delete this column?")) return;
    try {
      await api.delete(`/boards/${activeBoardId}/columns/${key}`);
      queryClient.invalidateQueries({ queryKey: ["board", activeBoardId] });
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
      await api.put(`/boards/${activeBoardId}/columns/reorder`, { columnKeys: keys });
      queryClient.invalidateQueries({ queryKey: ["board", activeBoardId] });
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed");
    }
    setDraggedColumnKey(null);
  };

  const openDetailModal = async (task: any) => {
    setDetailTask(task);
    setDetailEditing(false);
    try {
      const { data } = await api.get("/files", { params: { taskId: task._id } });
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
      dueDate: detailTask.dueDate && new Date(detailTask.dueDate).getFullYear() > 1970 ? detailTask.dueDate.split("T")[0] : "",
      noDueDate: !detailTask.dueDate || new Date(detailTask.dueDate).getFullYear() <= 1970,
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
        old ? old.map((t) => (t._id === detailTask._id ? data.task : t)) : old,
      );
      setDetailTask(data.task);
      setDetailEditing(false);
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to update task");
    } finally {
      setDetailSaving(false);
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm("Delete this attachment?")) return;
    try {
      await api.delete(`/files/${attachmentId}`);
      setDetailAttachments((prev) => prev.filter((a) => a._id !== attachmentId));
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
    ? boardColumns.map((c: any) => ({ key: c.key, label: c.label, color: c.color }))
    : defaultColumns;

  const columnCount = activeColumns.length;
  const fitCount = columnCount <= 4 ? 4 : 5;

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

  return (
    <div className="flex flex-col justify-between items-start gap-3 mb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-2">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
              {activeBoardInfo ? (
                "Kanban : " + activeBoardInfo?.title
                ) : "Tasks / Kanban View"}
            </h1>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: 2 }}>
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </p>
        </div>
        {/* <button
          className="btn btn-primary w-full sm:w-auto"
          onClick={() => setShowCreateModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={16} /> Create Task
        </button> */}
      </div>

      {/* Board Selector */}
      <div className="w-full sm:w-auto" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ minWidth: 250 }}>
          <select
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
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="w-full flex overflow-x-scroll"
        style={{ display: "flex", gap: 32, borderBottom: "1px solid var(--color-border)" }}
      >
        <button
          onClick={() => setCurrentTab("all")}
          style={{
            padding: "12px 4px", fontSize: "0.875rem", fontWeight: 500,
            color: currentTab === "all" ? "var(--color-primary)" : "var(--color-text-secondary)",
            borderBottom: `2px solid ${currentTab === "all" ? "var(--color-primary)" : "transparent"}`,
            background: "none", borderTop: "none", borderLeft: "none", borderRight: "none", cursor: "pointer",
          }}
        >
          All&nbsp;Tasks
        </button>
        <button
          onClick={() => setCurrentTab("my")}
          style={{
            padding: "12px 4px", fontSize: "0.875rem", fontWeight: 500,
            color: currentTab === "my" ? "var(--color-primary)" : "var(--color-text-secondary)",
            borderBottom: `2px solid ${currentTab === "my" ? "var(--color-primary)" : "transparent"}`,
            background: "none", borderTop: "none", borderLeft: "none", borderRight: "none", cursor: "pointer",
          }}
        >
          My&nbsp;Tasks
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 w-full">
        <div className="w-full sm:max-w-[400px] relative" ref={searchContainerRef}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)" }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && search.trim().length >= 2 && searchResults.length > 0 && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 8, marginTop: 4, maxHeight: 300, overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
            >
              {searchResults.map((t: any) => (
                <div
                  key={t._id}
                  style={{
                    padding: "10px 12px", cursor: "pointer",
                    borderBottom: "1px solid var(--color-border)",
                    display: "flex", flexDirection: "column", gap: 2,
                  }}
                  onClick={() => scrollToTask(t._id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{t.title}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "flex", gap: 8 }}>
                    <span style={{ textTransform: "capitalize" }}>{t.status?.replace("_", " ")}</span>
                    {t.assignedTo?.name && <span>{t.assignedTo.name}</span>}
                    {t.assignment?.title && <span style={{ color: "var(--color-primary)" }}>{t.assignment.title}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {search && search.trim().length >= 2 && searchResults.length === 0 && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 8, marginTop: 4, padding: "12px 12px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                fontSize: "0.8125rem", color: "var(--color-text-secondary)",
              }}
            >
              No tasks found
            </div>
          )}
        </div>
        {!activeBoardId && (
          <div className="w-full sm:w-[250px]">
            <select className="select" value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} style={{ width: "100%" }}>
              <option value="">All Companies</option>
              {companies.map((c: any) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Kanban Board - unified view */}
      {(loading || isSyncing) ? (
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 300, borderRadius: 12, flex: 1 }} />
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            width: "100%",
            // paddingBottom: 8,
            minHeight: "60dvh",
            scrollBehavior: "smooth",
          }}
          className="hide-scrollbar"
        >
          {activeColumns.map((col: any) => (
            <div
              key={col.key}
              style={{
                minHeight: "100%",
                background: "var(--color-surface-hover)",
                borderRadius: 12,
                padding: 8,
                border: draggedTaskId
                  ? `2px dashed ${col.color}40`
                  : draggedColumnKey === col.key
                  ? `2px dashed ${col.color}`
                  : "2px solid transparent",
                transition: "all 0.2s ease",
                flex: `0 0 calc((100% - ${(fitCount - 1) * 8}px) / ${fitCount})`,
                minWidth: 0,
              }}
              onDragOver={(e) => { handleColumnDragOver(e, col.key); setHoveredColumn(col.key); }}
              onDrop={(e) => {
                if (draggedColumnKey) {
                  handleColumnDrop(e, col.key);
                } else {
                  handleDrop(e, col.key);
                }
              }}
              onMouseEnter={() => setHoveredColumn(col.key)}
              onMouseLeave={() => setHoveredColumn(null)}
            >
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 12,
                  padding: "0 4px",
                }}
                draggable={!!activeBoardId}
                onDragStart={(e) => handleColumnDragStart(e, col.key)}
              >
                {activeBoardId && (
                  <GripVertical size={14} style={{ color: "var(--color-text-tertiary)", cursor: "grab", flexShrink: 0 }} />
                )}
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
                {editingColumnKey === col.key ? (
                  <input
                    className="input"
                    style={{ fontSize: "0.8125rem", padding: "2px 6px", flex: 1 }}
                    value={editColumnLabel}
                    onChange={(e) => setEditColumnLabel(e.target.value)}
                    onBlur={() => handleRenameColumn(col.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameColumn(col.key);
                      if (e.key === "Escape") setEditingColumnKey(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span
                    style={{ fontSize: "0.8125rem", fontWeight: 600, cursor: activeBoardId ? "pointer" : "default" }}
                    onDoubleClick={() => {
                      if (!activeBoardId) return;
                      setEditingColumnKey(col.key);
                      setEditColumnLabel(col.label);
                    }}
                  >
                    {col.label}
                  </span>
                )}
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginLeft: "auto" }}>
                  {grouped[col.key]?.length || 0}
                </span>
                {activeBoardId && (
                  <button
                    className="btn btn-ghost btn-xs"
                    style={{ padding: 2, marginLeft: 2 }}
                    onClick={() => handleDeleteColumn(col.key)}
                  >
                    <Trash2 size={12} style={{ color: "var(--color-text-tertiary)" }} />
                  </button>
                )}
              </div>

              {/* Task cards */}
              <div data-col={col.key} className="h-[95%]" style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {grouped[col.key]?.map((t: any, colIdx: number) => (
                      <React.Fragment key={t._id}>
                        {draggedTaskId && dragInsertInfo?.colKey === col.key && dragInsertInfo?.index === colIdx && (
                          <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: -1 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-primary)", flexShrink: 0 }} />
                            <div style={{ height: 2, flex: 1, background: "var(--color-primary)", borderRadius: "0 2px 2px 0" }} />
                          </div>
                        )}
                        {/* task card */}
                        <div
                          id={`task-card-${t._id}`}
                          className={`card task-card${highlightedTaskId === t._id ? " task-highlight" : ""}`}
                          style={{
                            padding: "12px", borderRadius: "4px",
                            cursor: canEditTask(t) ? "grab" : "default",
                            opacity: draggedTaskId === t._id ? 0.4 : 1,
                            border: draggedTaskId === t._id
                              ? `1px dashed ${col.color}`
                              : "1px solid var(--color-border)",
                            transition: "opacity 0.15s ease",
                          }}
                          draggable={canEditTask(t)}
                          onDragStart={(e) => handleDragStart(e, t._id)}
                          onDragEnd={handleDragEnd}
                          onMouseDown={() => {
                            if (!canEditTask(t)) {
                              showToast(getDeniedReason(t));
                            }
                          }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, paddingBottom: 8, borderBottom: "1px solid var(--color-border)" }}>
                              <div
                                style={{
                                  fontSize: "0.6875rem", textTransform: "uppercase", color: "var(--color-primary)",
                                  fontWeight: 600, cursor: t.assignment ? "pointer" : "default",
                                  textDecoration: t.assignment ? "underline" : "none", textUnderlineOffset: 2,
                                }}
                                onClick={() => {
                                  if (t.assignment?._id) navigate(`/assignments/${t.assignment._id}`);
                                }}
                              >
                                {t.assignment?.title || "General"}
                              </div>
                              <span className={`badge badge-${t.priority}`} style={{ fontSize: "0.625rem" }}>
                                {PRIORITY_LABELS[t.priority]}
                              </span>
                            </div>
                            <div
                              className="font-bold"
                              style={{ fontSize: "0.8125rem", lineHeight: 1.4, cursor: "pointer" }}
                              onClick={(e) => { e.stopPropagation(); openDetailModal(t); }}
                            >
                              {t.title}
                            </div>
                            <div
                              style={{
                                fontSize: "0.8125rem",
                                lineHeight: 1.4,
                                marginBottom: 8,
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                wordBreak: "break-word",
                                overflowWrap: "break-word",
                                cursor: "pointer",
                                width: "100%",
                                minWidth: 0,
                              }}
                              className="text-(--color-text-secondary)"
                              onClick={(e) => { e.stopPropagation(); openDetailModal(t); }}
                            >
                              {t.description}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <Avatar src={t.assignedTo?.avatar} name={t.assignedTo?.name} size={20} />
                                <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)" }}>
                                  {t.assignedTo?.name?.split(" ")[0]}
                                </span>
                              </div>
                              <span style={{ fontSize: "0.6875rem", ...getDeadlineStyle(t.dueDate, t.status) }}>
                                {getDeadlineLabel(t.dueDate, t.status)}
                              </span>
                            </div>
                        </div>
                      </React.Fragment>
                    ))}
                    {draggedTaskId && dragInsertInfo?.colKey === col.key && dragInsertInfo?.index === (grouped[col.key]?.length || 0) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: -1 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-primary)", flexShrink: 0 }} />
                        <div style={{ height: 2, flex: 1, background: "var(--color-primary)", borderRadius: "0 2px 2px 0" }} />
                      </div>
                    )}
                    

                {/* New Task button - visible on column hover */}
                {hoveredColumn === col.key && !draggedTaskId && (
                  <div
                    className="card"
                    style={{
                      padding: "12px", borderRadius: "4px", cursor: "pointer",
                      border: "1px dashed var(--color-border)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      color: "var(--color-text-tertiary)", fontSize: "0.8125rem", transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = col.color; e.currentTarget.style.color = col.color; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
                    onClick={() => { setCreateColumnStatus(col.key); setShowCreateModal(true); }}
                  >
                    <Plus size={14} /> New Task
                  </div>
                )}

                
                  <div
                  className="card flex-1 empty-drop-zone"
                    style={{
                      background:"none",
                      border:"none",
                    }}
                    >

                  </div>
              </div>
            </div>
          ))}

          {/* Right-edge hover zone + New Column card - only when board is selected */}
          {activeBoardId && (
            <div
              className="relative flex items-start"
              style={{
                minWidth: showNewColumnCard ? 180 : 24,
                flexShrink: 0,
                transition: "min-width 0.2s ease",
              }}
              onMouseEnter={() => setShowNewColumnCard(true)}
              onMouseLeave={() => setShowNewColumnCard(false)}
            >
              {showNewColumnCard ? (
                <div
                className="h-full min-w-45 bg-(--color-surface-hover) rounded-xl border-2 border-dashed border-(--color-border) flex flex-col items-center justify-center cursor-pointer min-h-25"
                  style={{
                    flexShrink: 0,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                  onClick={() => { handleAddColumn(); setShowNewColumnCard(false); }}
                >
                  <Plus size={18} style={{ color: "var(--color-text-tertiary)", marginBottom: 4 }} />
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>New Column</span>
                </div>
              ) : (
                <div
                className="h-full flex items-center justify-center"
                  style={{
                    width: 24,
                    borderRadius: 12,
                    background: "var(--color-surface-hover)",
                    opacity: 0.4,
                    transition: "opacity 0.2s ease",
                  }}
                  onMouseEnter={() => setShowNewColumnCard(true)}
                >
                  {showNewColumnCard ? (
                    <Plus size={16} style={{ color: "var(--color-text-tertiary)" }} />
                    ):(
                    <ChevronRight size={16} style={{ color: "var(--color-text-tertiary)" }} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreateColumnStatus(""); }}
      >
        <div className="card animate-fade-in" style={{ maxWidth: 500, width: "100%", padding: 0, overflow: "hidden", borderRadius: 16 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-surface)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--color-primary-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={18} style={{ color: "var(--color-primary)" }} />
              </div> */}
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Create Task</h3>
                <p style={{ fontSize: "0.72rem", color: "var(--color-text-tertiary)", margin: "2px 0 0" }}>
                  {createColumnStatus ? `Add to ${activeStatusLabels[createColumnStatus] || "column"}` : "Add a new task"}
                </p>
              </div>
            </div>
            <button
              style={{ background: "var(--color-surface-hover)", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => setShowCreateModal(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                Title <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input type="text" className="input" placeholder="e.g. Design landing page" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} />
            </div>
            
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                Description <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <textarea className="input" style={{ minHeight: 70, resize: "vertical" }} placeholder="Task details..." value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                Project <span style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)" }}>(optional)</span>
              </label>
              <select className="select" value={createForm.assignment} onChange={(e) => setCreateForm({ ...createForm, assignment: e.target.value })} style={{ width: "100%" }}>
                <option value="">Standalone task (no project)</option>
                {assignments.map((a: any) => (
                  <option key={a._id} value={a._id}>{a.title}</option>
                ))}
              </select>
            </div>
            {!activeBoardId && (
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                  Board <span style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)" }}>(optional)</span>
                </label>
                <select className="select" value={createForm.board} onChange={(e) => setCreateForm({ ...createForm, board: e.target.value })} style={{ width: "100%" }}>
                  <option value="">No board (standalone task)</option>
                  {allBoards.map((b: any) => (
                    <option key={b._id} value={b._id}>{b.title}</option>
                  ))}
                </select>
              </div>
            )} 
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                Assign To <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <select className="select" value={createForm.assignedTo} onChange={(e) => setCreateForm({ ...createForm, assignedTo: e.target.value })} style={{ width: "100%" }}>
                {createForm.assignment == "" ? (
                  <>
                    <option value="">Select a user</option>
                    {users.map((u: any) => (
                      <option key={u._id} value={u._id}>{u.name}</option>
                    ))}
                  </>
                ) : (
                  <option key={user?._id} value={user?._id}>{user?.name}</option>
                )}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>Due Date</label>
                <input type="date" className="input" value={createForm.dueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value, noDueDate: false })} disabled={createForm.noDueDate} style={{ width: "100%", marginBottom: 4 }} />
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: "0.7rem", color: "var(--color-text-tertiary)" }}>
                  <input type="checkbox" checked={createForm.noDueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.checked ? "" : createForm.dueDate, noDueDate: e.target.checked })} />
                  No Due Date
                </label>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>Priority</label>
                <select className="select" value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })} style={{ width: "100%" }}>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 4, padding: "10px" }} disabled={!createForm.title.trim() || !createForm.assignedTo || submitting} onClick={handleCreateTask}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? "Creating..." : "Create Task"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Task Detail Modal */}
      <Modal isOpen={!!detailTask} onClose={() => { setDetailTask(null); setDetailAttachments([]); setDetailEditing(false); }}>
        {detailTask && (
          <div className="card animate-fade-in" style={{ maxWidth: 640, width: "100%", padding: 0, overflow: "hidden", borderRadius: 16 }}>
            <div style={{ padding: "20px 24px", paddingBottom: "0px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", background: "var(--color-surface)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Title</div>
                {detailEditing ? (
                  <input className="input" style={{ fontSize: "0.95rem", fontWeight: 700 }} value={detailEditForm.title} onChange={(e) => setDetailEditForm({ ...detailEditForm, title: e.target.value })} />
                ) : (
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.4 }}>{detailTask.title}</div>
                )}
              </div>
              <div className="flex items-center justify-center" style={{ gap: 6, flexShrink: 0, marginLeft: 12 }}>
                {!detailEditing && canEditTask(detailTask) &&  (
                    <button className="btn btn-ghost btn-xs" style={{ color: "var(--color-primary)" }} onClick={startDetailEdit} title="Edit Task">
                      <SquarePen size={20} />
                    </button>
                )}
                {!detailEditing && canDeleteTask(detailTask) && (
                    <button className="btn btn-ghost btn-xs" style={{ color: "var(--color-error, #ef4444)" }} onClick={async () => { const deleted = await deleteTask(detailTask._id); if (deleted) { setDetailTask(null); setDetailAttachments([]); setDetailEditing(false); } }} title="Delete Task">
                      <Trash2 size={20} />
                    </button>
                )}
                <button
                  className={`bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) ${detailEditing ? "w-10 h-10":"w-8 h-8"} `}
                  style={{ background: "var(--color-surface-hover)", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)",  borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
                  onClick={() => { 
                    if(detailEditing){
                      setDetailEditing(false);
                    }else{
                      setDetailTask(null); setDetailAttachments([]); setDetailEditing(false); }}
                    }
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div style={{ padding: 24, display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20, maxHeight: "70dvh", overflowY: "auto" }}>
              {/* LHS: Title, Description, Meta */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                {detailEditing ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", display: "block" }}>Assigned To</label>
                        <select className="select" style={{ width: "100%" }} value={detailEditForm.assignedTo} onChange={(e) => setDetailEditForm({ ...detailEditForm, assignedTo: e.target.value })}>
                          {users.map((u: any) => (
                            <option key={u._id} value={u._id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", display: "block" }}>Priority</label>
                        <select className="select" style={{ width: "100%" }} value={detailEditForm.priority} onChange={(e) => setDetailEditForm({ ...detailEditForm, priority: e.target.value })}>
                          {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", display: "block" }}>Status</label>
                        <select className="select" style={{ width: "100%" }} value={detailEditForm.status} onChange={(e) => setDetailEditForm({ ...detailEditForm, status: e.target.value })}>
                          {activeColumns.map((c: any) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", display: "block" }}>Due Date</label>
                        <input type="date" className="input" style={{ width: "100%" }} value={detailEditForm.dueDate} disabled={detailEditForm.noDueDate} onChange={(e) => setDetailEditForm({ ...detailEditForm, dueDate: e.target.value })} />
                        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginTop: 4 }}>
                          <input type="checkbox" checked={detailEditForm.noDueDate} onChange={(e) => setDetailEditForm({ ...detailEditForm, dueDate: e.target.checked ? "" : detailEditForm.dueDate, noDueDate: e.target.checked })} />
                          No Due Date
                        </label>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", display: "block" }}>Description</label>
                      <textarea className="input" style={{ minHeight: 80, resize: "vertical" }} value={detailEditForm.description} onChange={(e) => setDetailEditForm({ ...detailEditForm, description: e.target.value })} placeholder="Task description..." />
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDetailEditing(false)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={saveDetailEdit} disabled={detailSaving}>
                        {detailSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {detailSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Assigned To</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Avatar src={detailTask.assignedTo?.avatar} name={detailTask.assignedTo?.name} size={22} />
                          <span style={{ fontSize: "0.8125rem" }}>{detailTask.assignedTo?.name}</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Priority</div>
                        <span className={`badge badge-${detailTask.priority}`} style={{ fontSize: "0.75rem" }}>
                          {PRIORITY_LABELS[detailTask.priority]}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Status</div>
                        <span className={`badge badge-${detailTask.status}`} style={{ fontSize: "0.75rem", textTransform: "capitalize" }}>
                          {detailTask.status?.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Created</div>
                        <span style={{ fontSize: "0.8125rem" }}>{detailTask.createdAt ? format(new Date(detailTask.createdAt), "MMM d, yyyy") : "—"}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Due Date</div>
                        <span style={{ fontSize: "0.8125rem", ...getDeadlineStyle(detailTask.dueDate, detailTask.status) }}>
                          {getDeadlineLabel(detailTask.dueDate, detailTask.status)}
                        </span>
                      </div>
                    </div>

                    {detailTask.description && (
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Description</div>
                        <div style={{ fontSize: "0.85rem", lineHeight: 1.6, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>{detailTask.description}</div>
                      </div>
                    )}
                  </>
                )}

                {detailTask.assignment && (
                  <div style={{ padding: "10px 12px", background: "var(--color-primary-light)", borderRadius: 8 }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Project: </span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-primary)", cursor: "pointer" }} onClick={() => { setDetailTask(null); navigate(`/assignments/${detailTask.assignment._id}`); }}>
                      {detailTask.assignment.title}
                    </span>
                  </div>
                )}
              </div>

              {/* RHS: Attachments */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, borderLeft: "1px solid var(--color-border)", paddingLeft: 20 }}>
                

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Paperclip size={14} style={{ color: "var(--color-text-tertiary)" }} />
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase" }}>
                    Attachments ({detailAttachments.length})
                  </span>
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => attachmentInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragOver ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderRadius: 10,
                    padding: "18px 12px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: isDragOver ? "var(--color-primary-light)" : "var(--color-surface)",
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
                    <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-primary)", margin: "0 auto 4px" }} />
                  ) : (
                    <Upload size={20} style={{ color: isDragOver ? "var(--color-primary)" : "var(--color-text-tertiary)", margin: "0 auto 4px", display: "block" }} />
                  )}
                  <p style={{ fontSize: "0.78rem", fontWeight: 600, margin: "0 0 2px", color: isDragOver ? "var(--color-primary)" : "var(--color-text-secondary)" }}>
                    {uploadingAttachment ? "Uploading..." : "Drop file here or click to browse"}
                  </p>
                  <p style={{ fontSize: "0.68rem", margin: 0, color: "var(--color-text-tertiary)" }}>
                    Max 50MB
                  </p>
                </div>

                {detailAttachments.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {detailAttachments.map((att: any) => (
                      <div
                        key={att._id}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "6px 10px", borderRadius: 6,
                          border: "1px solid var(--color-border)", background: "var(--color-surface)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                          <Paperclip size={12} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                          <span style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {att.originalName}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 2, flexShrink: 0, marginLeft: 6 }}>
                          <span style={{ fontSize: "0.65rem", color: "var(--color-text-tertiary)", alignSelf: "center" }}>
                            {att.fileSize > 1048576 ? `${(att.fileSize / 1048576).toFixed(1)}MB` : `${(att.fileSize / 1024).toFixed(0)}KB`}
                          </span>
                          <button
                            className="btn btn-ghost btn-xs"
                            style={{ padding: 2, color: "var(--color-primary)" }}
                            onClick={() => downloadFile(att._id, att.originalName)}
                          >
                            <Download size={12} />
                          </button>
                          {(user?.role === "admin" || att.uploadedBy?._id === user?._id) && (
                            <button
                              className="btn btn-ghost btn-xs"
                              style={{ padding: 2, color: "var(--color-error)" }}
                              onClick={() => handleDeleteAttachment(att._id)}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailAttachments.length === 0 && (
                  <div style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)", textAlign: "center", padding: "12px 0" }}>
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
        <div key={dropAnim.key} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
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
            zIndex: 9999,
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
