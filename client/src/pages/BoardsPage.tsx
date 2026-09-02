import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import Avatar from "../components/common/Avatar";
import Modal from "../components/common/Modal";
import { useAuthStore } from "../store/authStore";
import { Plus, LayoutGrid, Users, X, Loader2, Columns3, Settings, Check, Trash2, Mail, Pencil } from "lucide-react";
import { useTaskSocket } from "../hooks/useTaskSocket";

const COLORS = [
    "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
    "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#6366f1",
];

const BoardsPage: React.FC = () => {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    useTaskSocket();
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ title: "", description: "", color: "#3b82f6" });
    const [submitting, setSubmitting] = useState(false);

    const [manageBoardId, setManageBoardId] = useState<string | null>(null);
    const [inviteUserId, setInviteUserId] = useState("");
    const [inviteSearch, setInviteSearch] = useState("");
    const [actionLoading, setActionLoading] = useState<string | null>(null);


    const [startBoardEditing, setStartBoardEditing] = useState(false);
    const [editForm, setEditForm] = useState<{ title: string; description: string; color: string } | null>(null);
    // const [showColorPicker, setShowColorPicker] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);

    const { data: boardsData, isLoading } = useQuery({
        queryKey: ["boards"],
        queryFn: async () => {
            const { data } = await api.get("/boards");
            return data.boards || [];
        },
    });
    // console.log(boardsData);
    const boards = boardsData || [];

    const { data: manageBoardData, refetch: refetchManageBoard } = useQuery({
        queryKey: ["board-manage", manageBoardId],
        queryFn: async () => {
            if (!manageBoardId) return null;
            const { data } = await api.get(`/boards/${manageBoardId}`);
            return data.board;
        },
        enabled: !!manageBoardId,
    });
    const manageBoard = manageBoardData as any;

    const { data: requestsData } = useQuery({
        queryKey: ["boards-requests"],
        queryFn: async () => {
            const { data } = await api.get("/boards/requests/pending");
            return data.boards || [];
        },
    });
    const pendingRequests = requestsData || [];

    const { data: invitationsData } = useQuery({
        queryKey: ["boards-invitations"],
        queryFn: async () => {
            const { data } = await api.get("/boards/invitations/pending");
            return data.boards || [];
        },
    });
    const pendingInvitations = invitationsData || [];

    const { data: usersData } = useQuery({
        queryKey: ["users-flat"],
        queryFn: async () => {
            const { data } = await api.get("/auth/users");
            return data.users || [];
        },
    });
    const allUsers = usersData || [];

    const isCreator = manageBoard && (manageBoard.createdBy?._id === user?._id || user?.role === "admin");

    const filteredUsers = allUsers.filter((u: any) =>
        u._id !== user?._id &&
        !manageBoard?.members?.some((m: any) => m._id === u._id) &&
        (u.name?.toLowerCase().includes(inviteSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(inviteSearch.toLowerCase()))
    );

    const handleCreate = async () => {
        if (!form.title.trim()) return;
        setSubmitting(true);
        try {
            const { data } = await api.post("/boards", {
                title: form.title,
                description: form.description,
                color: form.color,
            });
            setShowCreate(false);
            setForm({ title: "", description: "", color: "#3b82f6" });
            await queryClient.invalidateQueries({ queryKey: ["boards"] });
            navigate(`/tasks/${data.board._id}`);
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed to create board");
        } finally {
            setSubmitting(false);
        }
    };

    const handleAcceptRequest = async (requestId: string) => {
        if (!manageBoardId) return;
        setActionLoading(requestId);
        try {
            await api.put(`/boards/${manageBoardId}/requests/${requestId}`, { action: "accepted" });
            refetchManageBoard();
            queryClient.invalidateQueries({ queryKey: ["boards"] });
            queryClient.invalidateQueries({ queryKey: ["boards-requests"] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        if (!manageBoardId) return;
        setActionLoading(requestId);
        try {
            await api.put(`/boards/${manageBoardId}/requests/${requestId}`, { action: "rejected" });
            refetchManageBoard();
            queryClient.invalidateQueries({ queryKey: ["boards-requests"] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!manageBoardId) return;
        if (!window.confirm("Remove this member from the board?")) return;
        setActionLoading(memberId);
        try {
            await api.delete(`/boards/${manageBoardId}/members/${memberId}`);
            refetchManageBoard();
            queryClient.invalidateQueries({ queryKey: ["boards"] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        } finally {
            setActionLoading(null);
        }
    };

    const handleInviteMember = async () => {
        if (!manageBoardId || !inviteUserId) return;
        setActionLoading("invite");
        try {
            await api.post(`/boards/${manageBoardId}/invite`, { userId: inviteUserId });
            setInviteUserId("");
            setInviteSearch("");
            refetchManageBoard();
            queryClient.invalidateQueries({ queryKey: ["boards"] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        } finally {
            setActionLoading(null);
        }
    };

    const handleAcceptInvitation = async (boardId: string) => {
        setActionLoading(`inv-${boardId}`);
        try {
            const board = pendingInvitations.find((b: any) => b._id === boardId);
            const invitation = board?.invitations?.find((inv: any) => inv.user?._id === user?._id && inv.status === "pending");
            if (!invitation) return;
            await api.put(`/boards/${boardId}/invitations/${invitation._id}`, { action: "accepted" });
            await queryClient.invalidateQueries({ queryKey: ["boards-invitations"] });
            await queryClient.invalidateQueries({ queryKey: ["boards"] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeclineInvitation = async (boardId: string) => {
        setActionLoading(`inv-decline-${boardId}`);
        try {
            const board = pendingInvitations.find((b: any) => b._id === boardId);
            const invitation = board?.invitations?.find((inv: any) => inv.user?._id === user?._id && inv.status === "pending");
            if (!invitation) return;
            await api.put(`/boards/${boardId}/invitations/${invitation._id}`, { action: "declined" });
            queryClient.invalidateQueries({ queryKey: ["boards-invitations"] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        } finally {
            setActionLoading(null);
        }
    };

    const closeManageModal = () => {
        setManageBoardId(null);
        setInviteSearch("");
        setInviteUserId("");
        setStartBoardEditing(false);
        setEditForm(null);
        // setShowColorPicker(false);
    };

    const handleStartEdit = () => {
        if (!manageBoard) return;
        setEditForm({
            title: manageBoard.title || "",
            description: manageBoard.description || "",
            color: manageBoard.color || "#3b82f6",
        });
        setStartBoardEditing(true);
    };

    const handleCancelEdit = () => {
        setStartBoardEditing(false);
        setEditForm(null);
        // setShowColorPicker(false);
    };

    const handleSaveEdit = async () => {
        if (!manageBoardId || !editForm?.title.trim()) return;
        setSavingEdit(true);
        try {
            await api.put(`/boards/${manageBoardId}`, {
                title: editForm.title,
                description: editForm.description,
                color: editForm.color,
            });
            setStartBoardEditing(false);
            setEditForm(null);
            await queryClient.invalidateQueries({ queryKey: ["boards"] });
            refetchManageBoard();
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed to update board");
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDeleteBoard = async () => {
        if (!manageBoardId) return;
        if (!window.confirm("You really want to delete this?")) return;
        setSavingEdit(true);
        try {
            await api.delete(`/boards/${manageBoardId}`);
            closeManageModal();
            await queryClient.invalidateQueries({ queryKey: ["boards"] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed to delete board");
        } finally {
            setSavingEdit(false);
        }
    };

    // const handleUpdateBoardColor = async (color: string) => {
    //     if (!manageBoardId) return;
    //     setEditForm((prev) => (prev ? { ...prev, color } : prev));
    //     try {
    //         await api.put(`/boards/${manageBoardId}`, { color });
    //         await queryClient.invalidateQueries({ queryKey: ["boards"] });
    //         refetchManageBoard();
    //     } catch (e: any) {
    //         alert(e.response?.data?.message || "Failed to update color");
    //     }
    // };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-2">
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                        Sprint Boards
                    </h1>
                    <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: 2 }}>
                        {boards.length} board{boards.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <button
                    className="btn btn-primary w-full sm:w-auto"
                    onClick={() => setShowCreate(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                    <Plus size={16} /> Create Board
                </button>
            </div>
            <span className="text-sm ">
                Sprint Boards are Kanban-style workspaces that break a project into columns (e.g., To Do, In Progress, Done). Add as many columns as your workflow needs, rename them anytime, and rearrange them by dragging. Move task cards across columns as work progresses, giving the team a clear visual picture of what's planned, active, and completed during the sprint.
            </span>

            {pendingRequests.length > 0 && (
                <div style={{ background: "var(--color-surface-hover)", borderRadius: 12, padding: 16 }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: 12 }}>Pending Requests</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {pendingRequests.map((b: any) => {
                            const myRequest = b.requests.find((r: any) => r.user?._id === user?._id && r.status === "pending");
                            if (!myRequest) return null;
                            return (
                                <div key={b._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--color-surface)", borderRadius: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: b.color }} />
                                        <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{b.title}</span>
                                    </div>
                                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Request pending</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {pendingInvitations.length > 0 && (
                <div style={{ background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.08))", borderRadius: 12, padding: 16, border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <Mail size={16} style={{ color: "var(--color-primary)" }} />
                        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0, color: "var(--color-primary)" }}>Board Invitations</h3>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {pendingInvitations.map((b: any) => {
                            const invitation = b.invitations?.find((inv: any) => inv.user?._id === user?._id && inv.status === "pending");
                            if (!invitation) return null;
                            return (
                                <div key={b._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--color-surface)", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 12, height: 12, borderRadius: "50%", background: b.color, boxShadow: `0 0 0 3px ${b.color}20` }} />
                                        <div>
                                            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{b.title}</span>
                                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                                <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Invited by</span>
                                                <Avatar src={invitation.invitedBy?.avatar} name={invitation.invitedBy?.name} size={16} />
                                                <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>{invitation.invitedBy?.name}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button
                                            className="btn btn-sm"
                                            style={{ background: "#22c55e", color: "white", padding: "6px 14px", fontWeight: 600, fontSize: "0.8125rem" }}
                                            disabled={actionLoading === `inv-${b._id}`}
                                            onClick={() => handleAcceptInvitation(b._id)}
                                        >
                                            {actionLoading === `inv-${b._id}` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                            Accept
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            style={{ background: "var(--color-surface-hover)", color: "var(--color-text-secondary)", padding: "6px 14px", fontWeight: 500, fontSize: "0.8125rem" }}
                                            disabled={actionLoading === `inv-decline-${b._id}`}
                                            onClick={() => handleDeclineInvitation(b._id)}
                                        >
                                            {actionLoading === `inv-decline-${b._id}` ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="skeleton" style={{ height: 160, borderRadius: 12 }} />
                    ))}
                </div>
            ) : boards.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48, color: "var(--color-text-tertiary)" }}>
                    <LayoutGrid size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
                    <p style={{ fontSize: "1rem", fontWeight: 500 }}>No boards yet</p>
                    <p style={{ fontSize: "0.875rem", marginTop: 4 }}>Create your first board to organize tasks</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {boards.map((board: any) => (
                        <div
                            key={board._id}
                            className="card"
                            style={{
                                overflow: "hidden",
                                padding: 0,
                                transition: "all 0.15s ease",
                                cursor: "pointer",
                            }}
                            onClick={() => navigate(`/tasks/${board._id}`)}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                        >
                            <div style={{ height: 4, background: board.color }} />
                            <div style={{ padding: 16 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                    <h3
                                        style={{ fontSize: "1rem", fontWeight: 600 }}
                                    >
                                        {board.title}
                                    </h3>
                                    {(board.createdBy?._id === user?._id || user?.role === "admin") && (
                                        <button
                                            className="btn btn-ghost btn-xs"
                                            style={{ padding: 4 }}
                                            onClick={(e) => { e.stopPropagation(); setManageBoardId(board._id); }}
                                            title="Manage board"
                                        >
                                            <Settings size={14} style={{ color: "var(--color-text-tertiary)" }} />
                                        </button>
                                    )}
                                </div>
                                {board.description && (
                                    <p
                                        style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.5 }}
                                    >
                                        {board.description.length > 100 ? board.description.slice(0, 100) + "..." : board.description}
                                    </p>
                                )}
                                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                                        <Columns3 size={14} />
                                        {board.columns?.length || 0} columns
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                                        <Users size={14} />
                                        {board.members?.length || 0} members
                                    </div>
                                </div>
                                {board.members?.length > 0 && (
                                    <div style={{ display: "flex", marginTop: 12, gap: -4 }}>
                                        {board.members.slice(0, 5).map((m: any) => (
                                            <Avatar key={m._id} src={m.avatar} name={m.name} size={24} />
                                        ))}
                                        {board.members.length > 5 && (
                                            <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginLeft: 8, alignSelf: "center" }}>
                                                +{board.members.length - 5}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Board Modal */}
            <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}>
                <div className="card animate-fade-in" style={{ maxWidth: 440, width: "100%", padding: 0, overflow: "hidden", borderRadius: 16 }}>
                    <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-surface)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--color-primary-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Plus size={18} style={{ color: "var(--color-primary)" }} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Create Board</h3>
                                <p style={{ fontSize: "0.72rem", color: "var(--color-text-tertiary)", margin: "2px 0 0" }}>Set up a new kanban board</p>
                            </div>
                        </div>
                        <button
                            style={{ background: "var(--color-surface-hover)", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
                            onClick={() => setShowCreate(false)}
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                                Title <span style={{ color: "var(--color-danger)" }}>*</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                placeholder="e.g. Marketing Sprint"
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                                Description
                            </label>
                            <textarea
                                className="input"
                                style={{ minHeight: 60, resize: "vertical" }}
                                placeholder="What is this board for?"
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                                Color
                            </label>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {COLORS.map((c) => (
                                    <div
                                        key={c}
                                        onClick={() => setForm({ ...form, color: c })}
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: "50%",
                                            background: c,
                                            cursor: "pointer",
                                            border: form.color === c ? "3px solid var(--color-surface)" : "2px solid var(--color-border)",
                                            outline: form.color === c ? `2px solid ${c}` : "none",
                                            transition: "all 0.15s ease",
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                        <button
                            className="btn btn-primary"
                            style={{ width: "100%", marginTop: 4, padding: "10px" }}
                            disabled={!form.title.trim() || submitting}
                            onClick={handleCreate}
                        >
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                            {submitting ? "Creating..." : "Create Board"}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Manage Board Modal */}
            <Modal isOpen={!!manageBoardId} onClose={closeManageModal}>
                <div className="card" style={{ maxWidth: 480, width: "100%", padding: 24 }}>
                    {manageBoard ? (
                        <>
                            {startBoardEditing && editForm ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                                    <h3 style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>Edit Board</h3>
                                    <div>
                                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                                            Title <span style={{ color: "var(--color-danger)" }}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={editForm.title}
                                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                            placeholder="Board title"
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                                            Description
                                        </label>
                                        <textarea
                                            className="input"
                                            style={{ minHeight: 60, resize: "vertical" }}
                                            value={editForm.description}
                                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                            placeholder="What is this board for?"
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                                            Color
                                        </label>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            {COLORS.map((c) => (
                                                <div
                                                    key={c}
                                                    onClick={() => setEditForm({ ...editForm, color: c })}
                                                    style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: "50%",
                                                        background: c,
                                                        cursor: "pointer",
                                                        border: editForm.color === c ? "3px solid var(--color-surface)" : "2px solid var(--color-border)",
                                                        outline: editForm.color === c ? `2px solid ${c}` : "none",
                                                        transition: "all 0.15s ease",
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                        <button
                                            className="btn btn-primary"
                                            style={{ flex: 1, justifyContent: "center" }}
                                            disabled={!editForm.title.trim() || savingEdit}
                                            onClick={handleSaveEdit}
                                        >
                                            {savingEdit ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                            {savingEdit ? "Saving..." : "Save Changes"}
                                        </button>
                                        <button
                                            className="btn"
                                            style={{ background: "var(--color-surface-hover)", color: "var(--color-text-secondary)" }}
                                            onClick={handleCancelEdit}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                                    <div
                                        style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}
                                        
                                    >
                                        <div style={{ background: manageBoard.color }} className="h-2.5 w-2.5 rounded-[50%] cursor-pointer"
                                        // onMouseEnter={() => setShowColorPicker(true)}
                                        // onMouseLeave={() => setShowColorPicker(false)} 
                                        />
                                        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>{manageBoard.title}</h2>
                                        {/* {showColorPicker && (
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    top: "100%",
                                                    left: -150,
                                                    zIndex: 50,
                                                    // marginTop: 8,
                                                    background: "var(--color-surface)",
                                                    border: "1px solid var(--color-border)",
                                                    borderRadius: 10,
                                                    padding: 8,
                                                    display: "flex",
                                                    gap: 6,
                                                    flexWrap: "wrap",
                                                    width: 152,
                                                    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                                                }}
                                            >
                                                {COLORS.map((c) => (
                                                    <div
                                                        key={c}
                                                        onClick={() => { handleUpdateBoardColor(c); setShowColorPicker(false); }}
                                                        style={{
                                                            width: 24,
                                                            height: 24,
                                                            borderRadius: "50%",
                                                            background: c,
                                                            cursor: "pointer",
                                                            border: manageBoard.color === c ? "2px solid var(--color-surface)" : "1px solid var(--color-border)",
                                                            outline: manageBoard.color === c ? `2px solid ${c}` : "none",
                                                            transition: "all 0.15s ease",
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )} */}
                                    </div>
                                    <div className="flex">
                                        <button className="btn btn-ghost btn-xs group" title="Edit board" onClick={handleStartEdit}>
                                            <Pencil size={16} className="group-hover:text-(--color-primary)" />
                                        </button>
                                        <button className="btn btn-ghost btn-xs group" title="Delete board" disabled={savingEdit} onClick={handleDeleteBoard} >
                                            <Trash2 size={16} className="group-hover:text-(--color-danger)" />
                                        </button>
                                        <button className="btn btn-ghost btn-xs group" onClick={closeManageModal}>
                                            <X size={18} className="group-hover:text-(--color-text)" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Join Requests - only visible to creator/admin */}
                            {isCreator && manageBoard.requests?.filter((r: any) => r.status === "pending").length > 0 && (
                                <div style={{ marginBottom: 20 }}>
                                    <h3 style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: 8, color: "var(--color-text-secondary)" }}>
                                        Join Requests ({manageBoard.requests.filter((r: any) => r.status === "pending").length})
                                    </h3>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {manageBoard.requests.filter((r: any) => r.status === "pending").map((req: any) => (
                                            <div key={req._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--color-surface-hover)", borderRadius: 8 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <Avatar src={req.user?.avatar} name={req.user?.name} size={24} />
                                                    <div>
                                                        <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{req.user?.name}</div>
                                                        <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>{req.user?.email}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", gap: 4 }}>
                                                    <button
                                                        className="btn btn-ghost btn-xs"
                                                        style={{ color: "#22c55e", padding: "4px 8px" }}
                                                        disabled={actionLoading === req._id}
                                                        onClick={() => handleAcceptRequest(req._id)}
                                                    >
                                                        <Check size={14} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-xs"
                                                        style={{ color: "#ef4444", padding: "4px 8px" }}
                                                        disabled={actionLoading === req._id}
                                                        onClick={() => handleRejectRequest(req._id)}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Description */}
                            {!startBoardEditing && (
                                <div style={{ marginBottom: 20 }}>
                                    <h3 style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: 8, color: "var(--color-text-secondary)" }}>
                                        Board Description
                                    </h3>
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-text-primary)" }}>
                                        {manageBoard.description || "No description provided."}
                                    </p>
                                </div>
                            )}

                            {/* Members */}
                            <div style={{ marginBottom: 20 }}>
                                <h3 style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: 8, color: "var(--color-text-secondary)" }}>
                                    Board Member{manageBoard.members?.length > 1 ? "s" : ""} ({manageBoard.members?.length || 0})
                                </h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {manageBoard.members?.map((m: any) => (
                                        <div key={m._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--color-surface-hover)", borderRadius: 8 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Avatar src={m.avatar} name={m.name} size={24} />
                                                <div>
                                                    <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                                                        {m.name}
                                                        {m._id === manageBoard.createdBy?._id && (
                                                            <span style={{ fontSize: "0.625rem", color: "var(--color-primary)", marginLeft: 6 }}>(Creator)</span>
                                                        )}
                                                        {m._id === user?._id && (
                                                            <span style={{ fontSize: "0.625rem", color: "var(--color-text-tertiary)", marginLeft: 6 }}>(You)</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>{m.email}</div>
                                                </div>
                                            </div>
                                            {isCreator && m._id !== manageBoard.createdBy?._id && (
                                                <button
                                                    className="btn btn-ghost btn-xs"
                                                    style={{ color: "#ef4444", padding: 4 }}
                                                    disabled={actionLoading === m._id}
                                                    onClick={() => handleRemoveMember(m._id)}
                                                    title="Remove member"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Invite Member - only visible to creator/admin */}
                            {isCreator && (
                                <div>
                                    <h3 style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: 8, color: "var(--color-text-secondary)" }}>
                                        Invite Member
                                    </h3>
                                    <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginBottom: 8 }}>
                                        Invited users will see a request to accept or decline
                                    </p>
                                    <div style={{ position: "relative" }}>
                                        <input
                                            className="input"
                                            placeholder="Search by name or email..."
                                            value={inviteSearch}
                                            onChange={(e) => { setInviteSearch(e.target.value); setInviteUserId(""); }}
                                            style={{ width: "100%" }}
                                        />
                                        {inviteSearch && !inviteUserId && filteredUsers.length > 0 && (
                                            <div style={{
                                                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                                                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                                                borderRadius: 8, maxHeight: 160, overflowY: "auto", marginTop: 4,
                                            }}>
                                                {filteredUsers.slice(0, 8).map((u: any) => (
                                                    <div
                                                        key={u._id}
                                                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", fontSize: "0.8125rem" }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-hover)"; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                                        onClick={() => { setInviteUserId(u._id); setInviteSearch(u.name || u.email); }}
                                                    >
                                                        <Avatar src={u.avatar} name={u.name} size={20} />
                                                        <span>{u.name}</span>
                                                        <span style={{ color: "var(--color-text-tertiary)", fontSize: "0.6875rem" }}>{u.email}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {inviteUserId && (
                                        <button
                                            className="btn btn-primary btn-sm"
                                            style={{ marginTop: 8, width: "100%" }}
                                            disabled={actionLoading === "invite"}
                                            onClick={handleInviteMember}
                                        >
                                            {actionLoading === "invite" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                                            Send Invitation
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                            <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default BoardsPage;
