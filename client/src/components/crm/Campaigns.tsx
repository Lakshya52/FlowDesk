import { useState, useRef } from 'react';
import { Plus, X, Users, Target, Calendar, Loader2, Trash2, Pencil, Phone, Building, Search, Upload, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../common/Modal';
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

interface Lead {
    _id: string;
    name: string;
    phone?: string;
    companyName?: string;
    priority: string;
    status: string;
    designation?: string;
    email?: string;
    city?: string;
    state?: string;
}

const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

const STATUS_BADGE: Record<string, string> = {
    new: "todo",
    attempted: "warning",
    connected: "in_progress",
    interested: "in_progress",
    callback_scheduled: "in_progress",
    meeting_scheduled: "in_progress",
    not_interested: "not_started",
    not_reachable: "not_started",
    do_not_call: "not_started",
    closed_won: "done",
    closed_lost: "not_started",
};

const PRIORITY_COLORS: Record<string, string> = {
    "very high": "var(--color-danger)",
    high: "var(--color-warning)",
    medium: "var(--color-primary)",
    low: "var(--color-text-tertiary)",
};

const Campaigns = () => {
    const { user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    useCrmSocket();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [form, setForm] = useState({ name: '', purpose: '', description: '' });
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
    const [leadSearch, setLeadSearch] = useState('');
    const [showImportModal, setShowImportModal] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ imported: number; errors: any[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const selectedCampaign = campaigns.find(c => c._id === selectedCampaignId) || null;

    const { data: leads = [], isLoading: leadsLoading } = useQuery({
        queryKey: ["campaign-leads", selectedCampaignId, leadSearch],
        queryFn: async () => {
            if (!selectedCampaignId) return [];
            const params: any = { campaignId: selectedCampaignId, limit: 200 };
            if (leadSearch) params.search = leadSearch;
            const { data } = await api.get("/leads", { params });
            return (data.success ? data.leads : []) as Lead[];
        },
        enabled: !!selectedCampaignId,
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
        if (selectedCampaignId === campaignId) setSelectedCampaignId(null);
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

    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedCampaignId) return;
        setImporting(true);
        setImportResult(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("campaignId", selectedCampaignId);
            const { data } = await api.post("/leads/import/excel", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setImportResult({
                imported: data.imported,
                errors: data.errors || [],
            });
            if (data.success) {
                queryClient.invalidateQueries({ queryKey: ["campaign-leads", selectedCampaignId] });
                queryClient.invalidateQueries({ queryKey: ["campaigns"] });
            }
        } catch (err: any) {
            alert(err.response?.data?.message || "Import failed");
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const getInitials = (name: string) =>
        name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const campaignsContent = (
        <>
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
                                transition: 'box-shadow 0.2s, border-color 0.2s',
                                cursor: 'pointer',
                                border: selectedCampaignId === campaign._id ? '2px solid var(--color-primary)' : undefined,
                            }}
                            onClick={() => setSelectedCampaignId(campaign._id)}
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
        </>
    );

    const leadsPanel = selectedCampaign && (
        <div style={{
            width: selectedCampaignId ? 400 : 0,
            minWidth: selectedCampaignId ? 400 : 0,
            borderLeft: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.2s, min-width 0.2s',
        }}>
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-surface)',
                flexShrink: 0,
            }}>
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                        {selectedCampaign.name}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                        {leads.length} lead{leads.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                        <button
                            onClick={() => setShowImportModal(true)}
                            title="Import leads"
                            style={{
                                background: 'var(--color-primary-light)', border: 'none', cursor: 'pointer',
                                color: 'var(--color-primary)', width: 32, height: 32, borderRadius: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}
                        >
                            <Upload size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => { setSelectedCampaignId(null); setLeadSearch(''); }}
                        style={{
                            background: 'var(--color-surface-hover)', border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-tertiary)', width: 32, height: 32, borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    border: '1px solid var(--color-border)', borderRadius: 8, padding: '0 10px',
                }}>
                    <Search size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <input
                        placeholder="Search leads..."
                        style={{
                            flex: 1, border: 'none', padding: '7px 0', fontSize: '0.8rem',
                            outline: 'none', boxShadow: 'none', background: 'transparent',
                        }}
                        value={leadSearch}
                        onChange={e => setLeadSearch(e.target.value)}
                    />
                    {leadSearch && (
                        <button
                            onClick={() => setLeadSearch('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 2, lineHeight: 0 }}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {leadsLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                    </div>
                ) : leads.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <Phone size={32} style={{ color: 'var(--color-text-tertiary)', opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            {leadSearch ? 'No leads match your search' : 'No leads in this campaign'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {leads.map((lead) => (
                            <div
                                key={lead._id}
                                className="card"
                                style={{
                                    padding: '10px 14px',
                                    cursor: 'pointer',
                                    border: '1px solid var(--color-border)',
                                    transition: 'box-shadow 0.15s',
                                }}
                                onClick={() => navigate(`/crm/dial?leadId=${lead._id}`)}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                        {lead.name}
                                    </span>
                                    <span style={{
                                        fontSize: '0.6rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                                        background: PRIORITY_COLORS[lead.priority] + '20',
                                        color: PRIORITY_COLORS[lead.priority],
                                        whiteSpace: 'nowrap', marginLeft: 8,
                                    }}>
                                        {lead.priority}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.72rem', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                                    {lead.phone && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Phone size={11} /> {lead.phone}
                                        </span>
                                    )}
                                    {lead.companyName && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Building size={11} /> {lead.companyName}
                                        </span>
                                    )}
                                </div>
                                <div style={{ marginTop: 4 }}>
                                    <span className={`badge badge-${STATUS_BADGE[lead.status] || "todo"}`} style={{ fontSize: '0.6rem' }}>
                                        {lead.status.replace(/_/g, ' ')}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
        );
    }

    return (
        <div style={{ maxWidth: selectedCampaignId ? 1400 : 1200, height: selectedCampaignId ? '100dvh' : undefined, display: 'flex', gap: 0, overflow: selectedCampaignId ? 'hidden' : undefined }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: selectedCampaignId ? 24 : 0, overflow: selectedCampaignId ? 'hidden' : undefined }}>
                {campaignsContent}
            </div>
            {leadsPanel}

            {/* Create Campaign Modal */}
            <Modal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }}>
                <div
                    className="card animate-fade-in"
                    style={{ maxWidth: 500, width: '100%', padding: 0, overflow: 'hidden', borderRadius: 16 }}
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
                </Modal>

            {/* Import Leads Modal */}
            <Modal isOpen={showImportModal} onClose={() => { setShowImportModal(false); setImportResult(null); }}>
                <div
                    className="card animate-fade-in"
                    style={{ maxWidth: 480, width: '100%', padding: 0, overflow: 'hidden', borderRadius: 16 }}
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
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Import Leads</h3>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', margin: '2px 0 0' }}>
                                        to {selectedCampaign?.name || 'campaign'}
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
                                        {importResult.imported} lead{importResult.imported !== 1 ? 's' : ''} imported
                                    </h3>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                        {importResult.errors.length > 0
                                            ? `${importResult.errors.length} error${importResult.errors.length !== 1 ? 's' : ''} encountered`
                                            : 'All leads imported successfully'}
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
                                    href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/leads/import/sample`}
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
                </Modal>
        </div>
    );
};

export default Campaigns;
