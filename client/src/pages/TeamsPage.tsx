import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import Avatar from '../components/common/Avatar';
import { useAuthStore } from '../store/authStore';
import {
    Plus, Users, Trash2, UserPlus, UserMinus,
    Crown, Search, Settings, Clock, CheckCircle, XCircle,
} from 'lucide-react';

type ModalTab = 'members' | 'requests' | 'manager';

const TeamsPage: React.FC = () => {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();

    // ── Role helpers ──────────────────────────────────────────────
    const isAdmin   = user?.role === 'admin';
    const isManager = user?.role === 'manager';
    const isMember  = user?.role === 'member';

    // ── UI state ──────────────────────────────────────────────────
    const [showCreate,       setShowCreate]       = useState(false);
    const [form,             setForm]             = useState({ name: '', description: '', members: [] as string[], manager: '' });
    const [saving,           setSaving]           = useState(false);
    const [createMemberSearch, setCreateMemberSearch] = useState('');
    const [selectedTeam,     setSelectedTeam]     = useState<any>(null);
    const [showManage,       setShowManage]       = useState(false);
    const [activeTab,        setActiveTab]        = useState<ModalTab>('members');
    const [memberSearch,     setMemberSearch]     = useState('');
    const [assigningManager, setAssigningManager] = useState(false);
    const [selectedMgrId,    setSelectedMgrId]    = useState('');

    // ── Queries ───────────────────────────────────────────────────
    const { data: teamsData, isLoading: loading } = useQuery({
        queryKey: ['teams'],
        queryFn: async () => {
            const { data } = await api.get('/teams?all=true');
            return data.teams || [];
        },
    });
    const teams = teamsData || [];

    const { data: usersData } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const { data } = await api.get('/auth/users?all=true');
            return data.users || [];
        },
        enabled: isAdmin || isManager,
    });
    const users = usersData || [];

    // ── Helpers ───────────────────────────────────────────────────
    const canManageTeam = (team: any) =>
        isAdmin || (isManager && team.manager?._id === user?._id);

    const openManage = (team: any, tab: ModalTab = 'members') => {
        setSelectedTeam(team);
        setActiveTab(tab);
        setMemberSearch('');
        setSelectedMgrId(team.manager?._id || '');
        setShowManage(true);
    };

    const filteredUsers = users.filter((u: any) =>
        u.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(memberSearch.toLowerCase())
    );

    // ── Handlers ──────────────────────────────────────────────────
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.members.length === 0) {
            alert('Please select at least one team member.');
            return;
        }
        if (!form.manager) {
            alert('Please assign a team manager.');
            return;
        }
        setSaving(true);
        try {
            await api.post('/teams', form);
            setShowCreate(false);
            setForm({ name: '', description: '', members: [], manager: '' });
            queryClient.invalidateQueries({ queryKey: ['teams'] });
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to create team');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (teamId: string) => {
        if (!window.confirm('Delete this team? This cannot be undone.')) return;
        try {
            await api.delete(`/teams/${teamId}`);
            queryClient.invalidateQueries({ queryKey: ['teams'] });
            // queryClient.invalidateQueries({ queryKey: ['my-teams'] });
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to delete team');
        }
    };

    const handleToggleMember = async (team: any, userId: string) => {
        const current = team.members?.map((m: any) => m._id) || [];
        const isAlready = current.includes(userId);
        const updated = isAlready
            ? current.filter((id: string) => id !== userId)
            : [...current, userId];

        // Optimistic update
        queryClient.setQueryData(['teams'], (old: any[]) =>
            old?.map(t => t._id === team._id
                ? { ...t, members: updated.map((id: string) => ({ _id: id })) }
                : t)
        );
        try {
            const { data } = await api.put(`/teams/${team._id}/members`, { members: updated });
            queryClient.setQueryData(['teams'], (old: any[]) =>
                old?.map(t => t._id === team._id ? data.team : t)
            );
            setSelectedTeam(data.team);
        } catch (e: any) {
            // Rollback
            queryClient.setQueryData(['teams'], (old: any[]) =>
                old?.map(t => t._id === team._id
                    ? { ...t, members: current.map((id: string) => ({ _id: id })) }
                    : t)
            );
            alert(e.response?.data?.message || 'Failed');
        }
    };

    const handleAssignManager = async (managerId: string | null) => {
        if (!selectedTeam) return;
        setAssigningManager(true);
        try {
            const { data } = await api.put(`/teams/${selectedTeam._id}/manager`, { managerId });
            queryClient.setQueryData(['teams'], (old: any[]) =>
                old?.map(t => t._id === selectedTeam._id ? data.team : t)
            );
            setSelectedTeam(data.team);
            setSelectedMgrId(data.team.manager?._id || '');
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to assign manager');
        } finally {
            setAssigningManager(false);
        }
    };

    const handleRequestJoin = async (teamId: string) => {
        try {
            const { data } = await api.post(`/teams/${teamId}/request-join`);
            queryClient.setQueryData(['teams'], (old: any[]) =>
                old?.map(t => t._id === teamId ? data.team : t)
            );
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to send request');
        }
    };

    const handleApproveRequest = async (teamId: string, userId: string) => {
        try {
            const { data } = await api.post(`/teams/${teamId}/requests/${userId}/approve`);
            queryClient.setQueryData(['teams'], (old: any[]) =>
                old?.map(t => t._id === teamId ? data.team : t)
            );
            if (selectedTeam?._id === teamId) setSelectedTeam(data.team);
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed');
        }
    };

    const handleRejectRequest = async (teamId: string, userId: string) => {
        try {
            const { data } = await api.post(`/teams/${teamId}/requests/${userId}/reject`);
            queryClient.setQueryData(['teams'], (old: any[]) =>
                old?.map(t => t._id === teamId ? data.team : t)
            );
            if (selectedTeam?._id === teamId) setSelectedTeam(data.team);
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed');
        }
    };

    const isMobile = window.innerWidth < 768;

    return (
        <div style={{ maxWidth: 1200, width: '100%' }}>

            {/* Header */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-start', marginBottom: isMobile ? 20 : 32, gap: isMobile ? 12 : 0 }}>
                <div>
                    <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.625rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
                        Our Teams
                    </h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        {teams.length} team{teams.length !== 1 ? 's' : ''}
                        {isAdmin   && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 20, background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: 600 }}>Admin</span>}
                        {isManager && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 20, background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>Manager</span>}
                    </p>
                </div>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ gap: 6 }}>
                        <Plus size={15} /> Create New Team
                    </button>
                )}
            </div>

            {/* Teams Grid */}
            {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="skeleton" style={{ height: 230, borderRadius: 14 }} />
                    ))}
                </div>
            ) : teams.length === 0 ? (
                <div className="card" style={{ padding: 64, textAlign: 'center' }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: '50%',
                        background: 'var(--color-surface-hover)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px',
                    }}>
                        <Users size={28} style={{ color: 'var(--color-text-tertiary)' }} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 6 }}>No teams yet</div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                        {isAdmin ? 'Create your first team to get started.' : 'No teams have been created yet.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                    {teams.map((team: any) => {
                        const selfIsMember    = team.members?.some((m: any) => m._id === user?._id);
                        const selfHasRequest  = team.joinRequests?.some((m: any) => m._id === user?._id);
                        const canManage       = canManageTeam(team);
                        const pendingCount    = team.joinRequests?.length || 0;

                        return (
                            <div
                                key={team._id}
                                className="card animate-fade-in"
                                style={{
                                    padding: 0, position: 'relative', overflow: 'hidden',
                                    border: canManage
                                        ? '1px solid var(--color-primary)'
                                        : '1px solid transparent',
                                }}
                            >
                                {/* Top accent bar */}
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                    background: 'linear-gradient(90deg, var(--color-primary), #a78bfa)',
                                }} />

                                <div style={{ padding: '22px 20px 18px' }}>

                                    {/* Card header row */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                                <h3 style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                                                    {team.name}
                                                </h3>
                                                {canManage && (
                                                    <span style={{
                                                        fontSize: '0.6875rem', fontWeight: 600,
                                                        padding: '2px 7px', borderRadius: 20,
                                                        background: 'var(--color-primary-light)',
                                                        color: 'var(--color-primary)',
                                                        textTransform: 'uppercase', letterSpacing: '0.04em',
                                                    }}>
                                                        {isAdmin ? 'Admin' : 'Your Team'}
                                                    </span>
                                                )}
                                            </div>
                                            {team.description && (
                                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.45, margin: 0 }}>
                                                    {team.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Action buttons — role-gated */}
                                        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                                            {canManage && (
                                                <button
                                                    className="btn btn-ghost btn-xs"
                                                    style={{ color: 'var(--color-primary)' }}
                                                    onClick={() => openManage(team, 'members')}
                                                >
                                                    <Settings size={13} /> Manage
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button
                                                    className="btn btn-ghost btn-xs"
                                                    style={{ color: 'var(--color-error)' }}
                                                    onClick={() => handleDelete(team._id)}
                                                    title="Delete team"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                            {isMember && !selfIsMember && !selfHasRequest && (
                                                <button
                                                    className="btn btn-primary btn-xs"
                                                    onClick={() => handleRequestJoin(team._id)}
                                                >
                                                    <UserPlus size={13} /> Request
                                                </button>
                                            )}
                                            {isMember && !selfIsMember && selfHasRequest && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    fontSize: '0.75rem', color: 'var(--color-text-secondary)',
                                                    padding: '4px 10px',
                                                    background: 'var(--color-surface-hover)',
                                                    borderRadius: 20,
                                                }}>
                                                    <Clock size={11} /> Pending
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Manager row */}
                                    {team.manager ? (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '7px 10px', borderRadius: 8, marginBottom: 16,
                                            background: 'var(--color-surface-hover)',
                                        }}>
                                            <Crown size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                            <Avatar src={team.manager.avatar} name={team.manager.name} size={20} />
                                            <span style={{ fontSize: '0.78125rem', fontWeight: 500 }}>{team.manager.name}</span>
                                            <span style={{ fontSize: '0.71875rem', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                                                Manager
                                            </span>
                                        </div>
                                    ) : isAdmin ? (
                                        <button
                                            className="btn btn-ghost btn-xs"
                                            style={{
                                                marginBottom: 16, width: '100%', justifyContent: 'center',
                                                fontSize: '0.75rem', color: 'var(--color-text-tertiary)',
                                                border: '1px dashed var(--color-border, #d1d5db)',
                                            }}
                                            onClick={() => openManage(team, 'manager')}
                                        >
                                            <Crown size={11} /> Assign a Manager
                                        </button>
                                    ) : (
                                        <div style={{ marginBottom: 16 }} />
                                    )}

                                    {/* Members section */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{
                                            fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase',
                                            letterSpacing: '0.06em', color: 'var(--color-text-tertiary)',
                                        }}>
                                            Members · {team.members?.length || 0}
                                        </span>
                                        {canManage && pendingCount > 0 && (
                                            <button
                                                className="btn btn-ghost btn-xs"
                                                style={{ color: '#f59e0b', fontSize: '0.71875rem', gap: 4 }}
                                                onClick={() => openManage(team, 'requests')}
                                            >
                                                <Clock size={11} /> {pendingCount} pending
                                            </button>
                                        )}
                                    </div>

                                    {team.members?.length === 0 ? (
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>
                                            No members yet
                                        </span>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {/* Stacked avatars */}
                                            <div style={{ display: 'flex' }}>
                                                {team.members.slice(0, 7).map((m: any, i: number) => (
                                                    <div
                                                        key={m._id}
                                                        title={m.name}
                                                        style={{
                                                            marginLeft: i === 0 ? 0 : -9,
                                                            borderRadius: '50%',
                                                            border: '2px solid var(--color-surface, #fff)',
                                                            zIndex: 7 - i, position: 'relative',
                                                        }}
                                                    >
                                                        <Avatar src={m.avatar} name={m.name} size={28} />
                                                    </div>
                                                ))}
                                            </div>
                                            {team.members.length > 7 && (
                                                <span style={{ fontSize: '0.78125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                                    +{team.members.length - 7} more
                                                </span>
                                            )}
                                            {/* First-name pills for very small teams */}
                                            {team.members.length <= 3 && (
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                    {team.members.map((m: any) => (
                                                        <span key={m._id} style={{
                                                            fontSize: '0.71875rem', fontWeight: 500,
                                                            padding: '2px 8px', borderRadius: 20,
                                                            background: 'var(--color-surface-hover)',
                                                            color: 'var(--color-text-secondary)',
                                                        }}>
                                                            {m.name?.split(' ')[0]}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Create Team Modal ──────────────────────────────────── */}
            {showCreate && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 100, backdropFilter: 'blur(2px)',
                    }}
                    onClick={() => { setShowCreate(false); setForm({ name: '', description: '', members: [], manager: '' }); setCreateMemberSearch(''); }}
                >
                    <div
                        className="card animate-fade-in"
                        style={{ width: '100%', maxWidth: 460, padding: 28, margin: 16 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                            <div style={{
                                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                                background: 'var(--color-primary-light)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Users size={18} style={{ color: 'var(--color-primary)' }} />
                            </div>
                            <div>
                                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: 1 }}>Create New Team</h2>
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                    Fill in the details below
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                                    Team Name <span style={{ color: 'var(--color-error)' }}>*</span>
                                </label>
                                <input
                                    className="input" required
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g. Engineering, Finance, Design..."
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                                    Description
                                </label>
                                <textarea
                                    className="input" rows={3}
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="What does this team focus on?"
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                                    Team Members <span style={{ color: 'var(--color-error)' }}>*</span>
                                    <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--color-text-tertiary)' }}>
                                        ({form.members.length} selected)
                                    </span>
                                </label>
                                <div style={{ position: 'relative', marginBottom: 8 }}>
                                    <Search
                                        size={14}
                                        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Search users…"
                                        value={createMemberSearch}
                                        onChange={e => setCreateMemberSearch(e.target.value)}
                                        style={{ paddingLeft: 32, fontSize: '0.875rem' }}
                                    />
                                </div>
                                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                                    {users
                                        .filter((u: any) =>
                                            u.name?.toLowerCase().includes(createMemberSearch.toLowerCase()) ||
                                            u.email?.toLowerCase().includes(createMemberSearch.toLowerCase())
                                        )
                                        .map((u: any) => {
                                            const isSelected = form.members.includes(u._id);
                                            return (
                                                <div
                                                    key={u._id}
                                                    onClick={() => setForm(prev => ({
                                                        ...prev,
                                                        members: isSelected
                                                            ? prev.members.filter((id: string) => id !== u._id)
                                                            : [...prev.members, u._id],
                                                    }))}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 10,
                                                        padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                                                        background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface-hover)',
                                                        border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                                                    }}
                                                >
                                                    <input type="checkbox" checked={isSelected} readOnly style={{ cursor: 'pointer' }} />
                                                    <Avatar src={u.avatar} name={u.name} size={28} />
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{u.name}{u._id === user?._id ? ' (You)' : ''}</span>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{u.email}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    {users.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-tertiary)', fontSize: '0.8125rem' }}>
                                            No users available
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 5, color: 'var(--color-text-secondary)' }}>
                                    Team Manager <span style={{ color: 'var(--color-error)' }}>*</span>
                                </label>
                                <select
                                    className="input"
                                    value={form.manager}
                                    onChange={e => setForm({ ...form, manager: e.target.value })}
                                    style={{ fontSize: '0.875rem' }}
                                    required
                                >
                                    <option value="">— Select a manager —</option>
                                    {users
                                        .filter((u: any) => u.role === 'manager' || u.role === 'admin')
                                        .map((u: any) => (
                                            <option key={u._id} value={u._id}>
                                                {u.name}{u._id === user?._id ? ' (You)' : ''}  ·  {u.email}
                                            </option>
                                        ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowCreate(false); setForm({ name: '', description: '', members: [], manager: '' }); setCreateMemberSearch(''); }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Creating...' : 'Create Team'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Manage Team Modal ──────────────────────────────────── */}
            {showManage && selectedTeam && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 100, backdropFilter: 'blur(2px)',
                    }}
                    onClick={() => setShowManage(false)}
                >
                    <div
                        className="card animate-fade-in"
                        style={{
                            width: '100%', maxWidth: 520, margin: 16,
                            padding: 0, overflow: 'hidden',
                            maxHeight: '88vh', display: 'flex', flexDirection: 'column',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal header + tabs */}
                        <div style={{ padding: '20px 22px 0', borderBottom: '1px solid var(--color-border, #e2e8f0)', flexShrink: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                                <div>
                                    <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: 3 }}>
                                        {selectedTeam.name}
                                    </h2>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                                        <Users size={13} />
                                        <span>{selectedTeam.members?.length || 0} members</span>
                                        {selectedTeam.manager && (
                                            <>
                                                <span>·</span>
                                                <Crown size={11} style={{ color: '#f59e0b' }} />
                                                <span>{selectedTeam.manager.name}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <button
                                    className="btn btn-ghost btn-xs"
                                    style={{ fontSize: '1rem', lineHeight: 1, padding: '4px 8px' }}
                                    onClick={() => setShowManage(false)}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Tab bar */}
                            <div style={{ display: 'flex' }}>
                                {(['members', 'requests', ...(isAdmin ? ['manager'] : [])] as ModalTab[]).map(tab => {
                                    const label = tab === 'members'  ? 'Members'
                                                : tab === 'requests' ? `Requests${selectedTeam.joinRequests?.length ? ` (${selectedTeam.joinRequests.length})` : ''}`
                                                : 'Assign Manager';
                                    const isActive = activeTab === tab;
                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            style={{
                                                padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
                                                fontSize: '0.8125rem',
                                                fontWeight: isActive ? 600 : 400,
                                                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                                                transition: 'all 0.15s',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Modal body — scrollable */}
                        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>

                            {/* ── Members tab ── */}
                            {activeTab === 'members' && (
                                <>
                                    <div style={{ position: 'relative', marginBottom: 12 }}>
                                        <Search
                                            size={14}
                                            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}
                                        />
                                        <input
                                            className="input"
                                            placeholder="Search by name or email…"
                                            value={memberSearch}
                                            onChange={e => setMemberSearch(e.target.value)}
                                            style={{ paddingLeft: 32, fontSize: '0.875rem' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {filteredUsers.filter((u: any) => u._id !== selectedTeam.manager?._id).map((u: any) => {
                                            const alreadyIn    = selectedTeam.members?.some((m: any) => m._id === u._id);
                                            const isTeamMgr    = selectedTeam.manager?._id === u._id;
                                            return (
                                                <div
                                                    key={u._id}
                                                    style={{
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        padding: '9px 12px', borderRadius: 10,
                                                        background: alreadyIn ? 'var(--color-primary-light)' : 'var(--color-surface-hover)',
                                                        transition: 'background 0.15s',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <Avatar src={u.avatar} name={u.name} size={34} />
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{u.name}{u._id === user?._id ? ' (You)' : ''}</span>
                                                                {isTeamMgr && (
                                                                    <span title="Team Manager" style={{ display: 'inline-flex' }}>
                                                                        <Crown size={11} style={{ color: '#f59e0b' }} />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{u.email}</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        className={`btn btn-xs ${alreadyIn ? 'btn-secondary' : 'btn-primary'}`}
                                                        style={alreadyIn ? { color: 'var(--color-error)' } : {}}
                                                        onClick={() => handleToggleMember(selectedTeam, u._id)}
                                                    >
                                                        {alreadyIn
                                                            ? <><UserMinus size={12} /> Remove</>
                                                            : <><UserPlus size={12} /> Add</>
                                                        }
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {filteredUsers.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
                                                No users match "{memberSearch}"
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* ── Requests tab ── */}
                            {activeTab === 'requests' && (
                                !selectedTeam.joinRequests?.length ? (
                                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                        <div style={{
                                            width: 52, height: 52, borderRadius: '50%',
                                            background: 'var(--color-surface-hover)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 14px',
                                        }}>
                                            <CheckCircle size={22} style={{ color: 'var(--color-text-tertiary)' }} />
                                        </div>
                                        <div style={{ fontWeight: 600, marginBottom: 5 }}>All clear!</div>
                                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                            No pending join requests for this team
                                        </p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {selectedTeam.joinRequests.map((u: any) => (
                                            <div
                                                key={u._id}
                                                style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '11px 14px', borderRadius: 10,
                                                    background: 'var(--color-surface-hover)',
                                                    border: '1px solid var(--color-border, #e2e8f0)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <Avatar src={u.avatar} name={u.name} size={36} />
                                                    <div>
                                                        <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{u.name}{u._id === user?._id ? ' (You)' : ''}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{u.email}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button
                                                        className="btn btn-xs btn-primary"
                                                        style={{ gap: 4 }}
                                                        onClick={() => handleApproveRequest(selectedTeam._id, u._id)}
                                                    >
                                                        <CheckCircle size={12} /> Approve
                                                    </button>
                                                    <button
                                                        className="btn btn-xs btn-secondary"
                                                        style={{ color: 'var(--color-error)', gap: 4 }}
                                                        onClick={() => handleRejectRequest(selectedTeam._id, u._id)}
                                                    >
                                                        <XCircle size={12} /> Reject
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
            )}

                            {/* ── Assign Manager tab (admin only) ── */}
                            {activeTab === 'manager' && isAdmin && (
                                <>
                                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
                                        The assigned manager can manage members and handle join requests for this team. They must have the <strong>Manager</strong> role.
                                    </p>

                                    {/* Current manager banner */}
                                    {selectedTeam.manager ? (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '12px 14px', borderRadius: 10, marginBottom: 20,
                                            background: 'var(--color-primary-light)',
                                            border: '1px solid var(--color-primary)',
                                        }}>
                                            <Crown size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                            <Avatar src={selectedTeam.manager.avatar} name={selectedTeam.manager.name} size={32} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{selectedTeam.manager.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Current manager</div>
                                            </div>
                                            <button
                                                className="btn btn-ghost btn-xs"
                                                style={{ color: 'var(--color-error)', flexShrink: 0 }}
                                                onClick={() => handleAssignManager(null)}
                                                disabled={assigningManager}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '10px 14px', borderRadius: 10, marginBottom: 20,
                                            background: 'var(--color-surface-hover)',
                                            border: '1px dashed var(--color-border, #d1d5db)',
                                            fontSize: '0.8125rem', color: 'var(--color-text-tertiary)',
                                        }}>
                                            <Crown size={13} /> No manager assigned yet
                                        </div>
                                    )}

                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                                        Select new manager
                                    </label>
                                    <select
                                        className="input"
                                        value={selectedMgrId}
                                        onChange={e => setSelectedMgrId(e.target.value)}
                                        style={{ marginBottom: 14, fontSize: '0.875rem' }}
                                    >
                                        <option value="">— Choose a user —</option>
                                        {users
                                            .filter((u: any) =>
                                                (u.role === 'manager' || u.role === 'admin') &&
                                                u._id !== selectedTeam.manager?._id &&
                                                !selectedTeam.members?.some((m: any) => m._id === u._id)
                                            )
                                            .map((u: any) => (
                                                <option key={u._id} value={u._id}>
                                                    {u.name}{u._id === user?._id ? ' (You)' : ''}  ·  {u.email}
                                                </option>
                                            ))}
                                    </select>

                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                                        disabled={!selectedMgrId || assigningManager || selectedMgrId === selectedTeam.manager?._id}
                                        onClick={() => handleAssignManager(selectedMgrId) }
                                    >
                                        <Crown size={14} />
                                        {assigningManager ? 'Assigning…' : 'Confirm Assignment'}
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Modal footer
                        <div style={{
                            padding: '12px 20px', borderTop: '1px solid var(--color-border, #e2e8f0)',
                            display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
                        }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowManage(false)}>
                                Close
                            </button>
                        </div> */}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamsPage;