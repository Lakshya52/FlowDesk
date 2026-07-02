import { useState } from 'react';
import { Plus, X, Users, Target, Calendar, Loader2, Trash2, Pencil } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useCrmSocket } from '../../hooks/useCrmSocket';

interface Campaign {
    _id: string;
    avatar?: string;
    name: string;
    purpose: string;
    description?: string;
    people: { _id: string; name: string; email: string; avatar?: string }[];
    createdBy: { _id: string; name: string; email: string; avatar?: string };
    createdAt: string;
    leadCount?: number;
}

interface TeamUser {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
    role?: string;
}

const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

const Campaigns = () => {
    const { user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();
    useCrmSocket();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [form, setForm] = useState({ name: '', purpose: '', description: '' });
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

    const { data: campaigns = [], isLoading } = useQuery({
        queryKey: ["campaigns"],
        queryFn: async () => {
            const res = await api.get('/campaigns');
            return (res.data.success ? res.data.campaigns : []) as Campaign[];
        },
    });

    const { data: users = [] } = useQuery({
        queryKey: ["users"],
        queryFn: async () => {
            const res = await api.get('/users');
            return (res.data.success ? res.data.users : []) as TeamUser[];
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: { name: string; purpose: string; description: string; people: string[] }) =>
            api.post('/campaigns', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (campaignId: string) => api.delete(`/campaigns/${campaignId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: { name: string; purpose: string; description: string; people: string[] } }) =>
            api.put(`/campaigns/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        },
    });

    const resetForm = () => {
        setForm({ name: '', purpose: '', description: '' });
        setSelectedMembers([]);
        setEditingCampaign(null);
    };

    const handleCreate = async () => {
        if (!form.name.trim() || !form.purpose.trim()) return;

        if (editingCampaign) {
            updateMutation.mutate(
                { id: editingCampaign._id, data: { name: form.name.trim(), purpose: form.purpose.trim(), description: form.description.trim(), people: selectedMembers } },
                {
                    onSuccess: () => {
                        resetForm();
                        setShowCreateModal(false);
                    },
                    onError: (err: any) => {
                        alert(err.response?.data?.message || 'Failed to update campaign');
                    },
                }
            );
        } else {
            createMutation.mutate(
                { name: form.name.trim(), purpose: form.purpose.trim(), description: form.description.trim(), people: selectedMembers },
                {
                    onSuccess: () => {
                        resetForm();
                        setShowCreateModal(false);
                    },
                    onError: (err: any) => {
                        alert(err.response?.data?.message || 'Failed to create campaign');
                    },
                }
            );
        }
    };

    const toggleMember = (userId: string) => {
        setSelectedMembers(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleDelete = (campaignId: string) => {
        if (!confirm('Delete this campaign? This cannot be undone.')) return;
        deleteMutation.mutate(campaignId, {
            onError: (err: any) => {
                alert(err.response?.data?.message || 'Failed to delete campaign');
            },
        });
    };
    const handleCampaignEdit = (campaign: Campaign) => {
        setForm({ name: campaign.name, purpose: campaign.purpose, description: campaign.description || '' });
        setSelectedMembers(campaign.people.map(p => p._id));
        setEditingCampaign(campaign);
        setShowCreateModal(true);
    };

    // const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    //     const file = e.target.files?.[0];
    //     if (!file) return;

    //     setImporting(true);
    //     setImportResult(null);

    //     try {
    //         const formData = new FormData();
    //         formData.append('file', file);

    //         const { data } = await api.post('/campaigns/import/excel', formData, {
    //             headers: { 'Content-Type': 'multipart/form-data' },
    //         });

    //         setImportResult({
    //             imported: data.imported,
    //             errors: data.errors || [],
    //         });
    //         if (data.success) {
    //             fetchCampaigns();
    //         }
    //     } catch (err: any) {
    //         alert(err.response?.data?.message || 'Import failed');
    //     } finally {
    //         setImporting(false);
    //         if (fileInputRef.current) fileInputRef.current.value = '';
    //     }
    // };

    const getInitials = (name: string) =>
        name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
        );
    }

    // console.log('Campaigns:', campaigns);
    return (
        <div style={{ maxWidth: 1200 }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4" style={{ marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                        Campaigns
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                        {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                    </p>
                </div>

                {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                            <Plus size={16} /> New Campaign
                        </button>
                    </div>
                )} 
            </div>

            {campaigns.length === 0 ? (
                <div className="card" style={{ padding: 48, textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 16, opacity: 0.3 }}>
                        <Target size={48} style={{ color: 'var(--color-text-tertiary)', margin: '0 auto' }} />
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
                        No Campaigns Yet
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', maxWidth: 360, margin: '0 auto' }}>
                        Create your first campaign to start managing outreach, tracking leads, and organising your CRM efforts.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
                    {campaigns.map((campaign) => (
                        <div
                            key={campaign._id}
                            className="card animate-fade-in"
                            style={{
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                position: 'relative',
                                transition: 'box-shadow 0.2s',
                            }}
                        >
                            <div style={{
                                padding: '18px 20px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                                        <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3, margin: 0 }}>
                                            {campaign.name}
                                        </h4>
                                        <div style={{
                                            background: 'var(--color-primary-light)',
                                            color: 'var(--color-primary)',
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            padding: '2px 10px',
                                            borderRadius: 20,
                                            display: 'inline-block',
                                            alignSelf: 'flex-start',
                                        }}>
                                            {campaign.purpose}
                                        </div>
                                    </div>
                                    {(currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?._id === campaign.createdBy?._id) && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCampaignEdit(campaign); }}
                                            title="Edit campaign"
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: 'var(--color-text-tertiary)', padding: 4,
                                                borderRadius: 6, flexShrink: 0, lineHeight: 0,
                                                marginLeft: 8,
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.background = '#C7FFD1'; e.currentTarget.style.color = '#00961C'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                                        >
                                            <Pencil size={14} />
                                        </button>
                                    )}
                                    {(currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?._id === campaign.createdBy?._id) && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(campaign._id); }}
                                            title="Delete campaign"
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: 'var(--color-text-tertiary)', padding: 4,
                                                borderRadius: 6, flexShrink: 0, lineHeight: 0,
                                                marginLeft: 8,
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>

                                {campaign.description && (
                                    <p style={{
                                        fontSize: '0.78rem',
                                        color: 'var(--color-text-secondary)',
                                        lineHeight: 1.5,
                                        margin: 0,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                    }}>
                                        {campaign.description}
                                    </p>
                                )}

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    fontSize: '0.72rem',
                                    color: 'var(--color-text-tertiary)',
                                    flexWrap: 'wrap',
                                }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Calendar size={11} />
                                        {formatDate(campaign.createdAt)}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Target size={11} />
                                        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                                            {campaign.leadCount ?? 0} lead{(campaign.leadCount ?? 0) !== 1 ? 's' : ''}
                                        </span>
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                                        by {campaign.createdBy?.name || 'Unknown'}
                                    </span>
                                </div>
                            </div>

                            {campaign.people.length > 0 && (
                                <div style={{
                                    padding: '10px 20px 12px',
                                    borderTop: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                }}>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
                                        Members ({campaign.people.length})
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {campaign.people.map((person, idx) => (
                                            <div
                                                key={person._id}
                                                title={person.name}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                    background: AVATAR_COLORS[idx % AVATAR_COLORS.length] + '12',
                                                    borderRadius: 20,
                                                    padding: '2px 8px 2px 4px',
                                                }}
                                            >
                                                <div style={{
                                                    width: 20, height: 20, borderRadius: '50%',
                                                    background: AVATAR_COLORS[idx % AVATAR_COLORS.length],
                                                    color: 'white', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', fontSize: '0.55rem', fontWeight: 600,
                                                    flexShrink: 0,
                                                }}>
                                                    {person.avatar ? (
                                                        <img src={`${import.meta.env.VITE_SOCKET_URL || 'https://flowdesk-api.raksco.in'}${person.avatar}/resize?w=40&q=60`} alt={person.name} width={20} height={20} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                                    ) : getInitials(person.name)}
                                                </div>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                                                    {person.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Create Campaign Modal */}
            {showCreateModal && (
                <div
                    style={{
                        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
                        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
                    }}
                    onClick={() => { setShowCreateModal(false); resetForm(); }}
                >
                    <div
                        className="card animate-fade-in"
                        style={{ maxWidth: 500, width: '100%', padding: 0, overflow: 'hidden', borderRadius: 16 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{
                            padding: '20px 24px', borderBottom: '1px solid var(--color-border)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'var(--color-surface)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Plus size={18} style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</h3>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', margin: '2px 0 0' }}>
                                        {editingCampaign ? 'Update campaign details' : 'Create a new outreach campaign'}
                                    </p>
                                </div>
                            </div>
                            <button
                                style={{
                                    background: 'var(--color-surface-hover)', border: 'none', cursor: 'pointer',
                                    color: 'var(--color-text-tertiary)', width: 32, height: 32, borderRadius: 8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                                onClick={() => { setShowCreateModal(false); resetForm(); }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                                    Campaign Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g. Q3 Outreach"
                                    value={form.name}
                                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                                    Purpose / Goal <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g. Generate leads for funding"
                                    value={form.purpose}
                                    onChange={e => setForm(prev => ({ ...prev, purpose: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                                    Description (optional)
                                </label>
                                <textarea
                                    className="input"
                                    style={{ minHeight: 70, resize: 'vertical' }}
                                    placeholder="Campaign details..."
                                    value={form.description}
                                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                                    Add Members <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>({selectedMembers.length} selected)</span>
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
                                    {users.length === 0 ? (
                                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)', padding: '4px 0' }}>No team members found</p>
                                    ) : (
                                        users.map(user => {
                                            const isSelected = selectedMembers.includes(user._id);
                                            return (
                                                <button
                                                    key={user._id}
                                                    onClick={() => toggleMember(user._id)}
                                                    className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                                    style={{
                                                        borderRadius: 20,
                                                        fontWeight: isSelected ? 600 : 400,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                    }}
                                                >
                                                    {isSelected ? <X size={12} /> : <Users size={12} />}
                                                    {user.name}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', marginTop: 4, padding: '10px' }}
                                disabled={!form.name.trim() || !form.purpose.trim() || createMutation.isPending || updateMutation.isPending}
                                onClick={handleCreate}
                            >
                                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : null}
                                {(createMutation.isPending || updateMutation.isPending)
                                    ? (editingCampaign ? 'Updating...' : 'Creating...')
                                    : (editingCampaign ? 'Update Campaign' : 'Create Campaign')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Campaigns Modal */}
            {/* {showImportModal && (
                <div
                    style={{
                        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
                        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
                    }}
                    onClick={() => { setShowImportModal(false); setImportResult(null); }}
                >
                    <div
                        className="card animate-fade-in"
                        style={{ maxWidth: 480, width: '100%', padding: 0, overflow: 'hidden', borderRadius: 16 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{
                            padding: '20px 24px', borderBottom: '1px solid var(--color-border)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'var(--color-surface)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Upload size={18} style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Import Campaigns</h3>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', margin: '2px 0 0' }}>
                                        Upload an Excel file to bulk add campaigns
                                    </p>
                                </div>
                            </div>
                            <button
                                style={{
                                    background: 'var(--color-surface-hover)', border: 'none', cursor: 'pointer',
                                    color: 'var(--color-text-tertiary)', width: 32, height: 32, borderRadius: 8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                                onClick={() => { setShowImportModal(false); setImportResult(null); }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {importResult ? (
                            <div style={{ padding: 24 }}>
                                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: importResult.imported > 0 ? '#dcfce7' : '#fef2f2',
                                    }}>
                                        {importResult.imported > 0
                                            ? <CheckCircle size={24} style={{ color: '#22c55e' }} />
                                            : <AlertCircle size={24} style={{ color: '#ef4444' }} />
                                        }
                                    </div>
                                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 4px' }}>
                                        {importResult.imported} campaign{importResult.imported !== 1 ? 's' : ''} imported
                                    </h3>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                        {importResult.errors.length > 0
                                            ? `${importResult.errors.length} error${importResult.errors.length !== 1 ? 's' : ''} encountered`
                                            : 'All campaigns imported successfully'}
                                    </p>
                                </div>
                                {importResult.errors.length > 0 && (
                                    <div style={{
                                        marginBottom: 16, padding: 12, background: '#fef2f2',
                                        borderRadius: 10, fontSize: '0.78rem', maxHeight: 150, overflowY: 'auto',
                                        border: '1px solid #fecaca',
                                    }}>
                                        <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <AlertCircle size={14} /> {importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''}
                                        </div>
                                        {importResult.errors.map((e: any, i: number) => (
                                            <div key={i} style={{ color: '#dc2626', padding: '4px 8px', background: 'white', borderRadius: 4, marginBottom: 4, fontSize: '0.75rem' }}>
                                                <strong>Row {e.row}:</strong> {e.message}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', padding: 10, borderRadius: 10, fontWeight: 600 }}
                                    onClick={() => { setShowImportModal(false); setImportResult(null); }}
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <div style={{ padding: 24 }}>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    style={{ display: 'none' }}
                                    onChange={handleFileImport}
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        border: '2px dashed var(--color-border)', borderRadius: 12,
                                        padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
                                        background: 'var(--color-surface)', marginBottom: 16,
                                        transition: 'border-color 0.2s',
                                    }}
                                    onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                                    onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                                >
                                    <Upload size={32} style={{ color: 'var(--color-text-tertiary)', margin: '0 auto 12px', opacity: 0.4 }} />
                                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px' }}>
                                        {importing ? 'Importing...' : 'Click to upload Excel file'}
                                    </p>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', margin: 0 }}>
                                        .xlsx or .xls format
                                    </p>
                                </div>

                                <a
                                    href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/campaigns/import/sample`}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-primary)',
                                        textDecoration: 'none',
                                    }}
                                >
                                    <Download size={14} /> Download sample format
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )} */}
        </div>
    );
};

export default Campaigns;