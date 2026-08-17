import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Plus, X, Users, Target, Calendar, Loader2, Trash2, Pencil, Phone, Building, Search, Upload, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import Modal from '@/shared/components/Modal';
import { useAuthStore } from '@/store/authStore';
import { useCrmSocket } from '@/shared/hooks/useCrmSocket';

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
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    useLayoutEffect(() => {
        if (selectedCampaignId) {
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }
    }, [selectedCampaignId]);

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
            const params: any = { campaignId: selectedCampaignId, };
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

        const membersWithCreator = currentUser?._id
            ? [...new Set([currentUser._id, ...selectedMembers])]
            : selectedMembers;

        if (editingCampaign) {
            updateMutation.mutate(
                { id: editingCampaign._id, data: { name: form.name.trim(), purpose: form.purpose.trim(), description: form.description.trim(), people: membersWithCreator } },
                {
                    onSuccess: () => {
                        resetForm();
                        setShowCreateModal(false);
                    },
                    onError: (err: any) => {
                        setToast({ message: err.response?.data?.message || 'Failed to update campaign', type: 'error' });
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
                        setToast({ message: err.response?.data?.message || 'Failed to create campaign', type: 'error' });
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
        if (!window.confirm('Delete this campaign? This cannot be undone.')) return;
        if (selectedCampaignId === campaignId) setSelectedCampaignId(null);
        deleteMutation.mutate(campaignId, {
            onError: (err: any) => {
                setToast({ message: err.response?.data?.message || 'Failed to delete campaign', type: 'error' });
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
            setToast({ message: err.response?.data?.message || "Import failed", type: 'error' });
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

    const leadsPanel = selectedCampaign && (
        <div className={`flex flex-col overflow-hidden  border-l border-r border-b border-(--color-border) rounded-xl
            ${selectedCampaignId ? 'w-full lg:w-100 lg:min-w-100' : 'w-0 lg:w-0'}`}
            style={{ transition: 'width 0.2s, min-width 0.2s' }}>
            <div className="px-[16px_20px] py-4  border-b border-t border-(--color-border) flex items-center justify-between rounded-xl bg-(--color-surface) shrink-0">
                <div>
                    <h3 className="text-base font-bold m-0">
                        {selectedCampaign.name}
                    </h3>
                    <p className="text-[0.75rem] text-(--color-text-secondary) mt-0.5 m-0">
                        {leads.length} lead{leads.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                        <button
                            onClick={() => setShowImportModal(true)}
                            title="Import leads"
                            className="bg-(--color-primary-light) border-none cursor-pointer text-(--color-primary) w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:opacity-80"
                        >
                            <Upload size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => { setSelectedCampaignId(null); setLeadSearch(''); }}
                        className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:opacity-80"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className="px-4 py-3 border-b border-(--color-border) shrink-0">
                <div className="flex items-center gap-1.5 border border-(--color-border) rounded-lg px-2.5">
                    <Search size={14} className="text-(--color-text-tertiary) shrink-0" />
                    <input
                        placeholder="Search leads..."
                        className="flex-1 border-none py-1.75 text-[0.8rem] outline-none shadow-none bg-transparent"
                        value={leadSearch}
                        onChange={e => setLeadSearch(e.target.value)}
                    />
                    {leadSearch && (
                        <button
                            onClick={() => setLeadSearch('')}
                            className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-0.5 leading-none"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {leadsLoading ? (
                    <div className="flex justify-center p-10">
                        <Loader2 size={24} className="animate-spin text-(--color-primary)" />
                    </div>
                ) : leads.length === 0 ? (
                    <div className="p-10 text-center">
                        <Phone size={32} className="text-(--color-text-tertiary) opacity-30 mx-auto mb-3 block" />
                        <p className="text-[0.85rem] text-(--color-text-secondary)">
                            {leadSearch ? 'No leads match your search' : 'No leads in this campaign'}
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {leads.map((lead) => (
                            <div
                                key={lead._id}
                                className="card p-[10px_14px] cursor-pointer border border-(--color-border) hover:shadow-sm"
                                onClick={() => navigate(`/crm/dial?leadId=${lead._id}`)}
                            >
                                <div className="flex items-start justify-between mb-1">
                                    <span className="text-[0.85rem] font-semibold text-(--color-text)">
                                        {lead.name}
                                    </span>
                                    <span className={` text-[0.6rem] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ml-2 ${lead.priority === 'very high' ? 'bg-(--color-danger-light) text-(--color-danger)' : lead.priority === 'high' ? 'bg-(--color-warning-light) text-(--color-warning)' : lead.priority === 'medium' ? 'bg-(--color-primary-light) text-(--color-primary)' : 'bg-(--color-text-tertiary-light) text-(--color-text-tertiary)'}`}
                                        style={{
                                            // background: PRIORITY_COLORS[lead.priority] + '20',
                                            color: PRIORITY_COLORS[lead.priority],
                                        }}>
                                        {lead.priority}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2.5 text-[0.72rem] text-(--color-text-secondary) flex-wrap">
                                    {lead.phone && (
                                        <span className="flex items-center gap-1">
                                            <Phone size={11} /> {lead.phone}
                                        </span>
                                    )}
                                    {lead.companyName && (
                                        <span className="flex items-center gap-1">
                                            <Building size={11} /> {lead.companyName}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1">
                                    <span className={`badge badge-${STATUS_BADGE[lead.status] || "todo"} text-[0.6rem]`}>
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

    const campaignsContent = (
        <>
            <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4 mb-5 pt-4 sm:pt-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Campaigns
                    </h1>
                    <p className="text-[0.85rem] text-(--color-text-secondary) mt-1">
                        {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                    </p>
                </div>

                {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                    <div className="flex gap-2">
                        <button className="btn btn-primary" onClick={() => {
                            setShowCreateModal(true);
                            if (!editingCampaign && currentUser?._id) {
                                setSelectedMembers(prev => prev.includes(currentUser._id) ? prev : [...prev, currentUser._id]);
                            }
                        }}>
                            <Plus size={16} /> New Campaign
                        </button>
                    </div>
                )} 
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pb-4 sm:pb-6">
            {campaigns.length === 0 ? (
                <div className="card p-12 text-center">
                    <div className="mb-4 opacity-30">
                        <Target size={48} className="text-(--color-text-tertiary) mx-auto" />
                    </div>
                    <h3 className="text-[1.1rem] font-semibold text-(--color-text) mb-2">
                        No Campaigns Yet
                    </h3>
                    <p className="text-[0.85rem] text-(--color-text-secondary) max-w-90 mx-auto">
                        Create your first campaign to start managing outreach, tracking leads, and organising your CRM efforts.
                    </p>
                </div>
            ) : (
                <div className={`grid grid-cols-1 ${!leadsPanel ? "sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-1 xl:grid-cols-2 " }  gap-5 py-2`}>
                    {campaigns.map((campaign) => (
                        <div
                            key={campaign._id}
                            className={`card animate-fade-in flex flex-col overflow-hidden relative cursor-pointer transition-shadow transition-border-color
                                ${selectedCampaignId === campaign._id ? 'border-(--color-primary)! border-2!' : ''}`}
                            style={{ padding: 0 }}
                            onClick={() => setSelectedCampaignId(campaign._id)}
                        >
                            <div className="p-[18px_20px_14px] flex flex-col gap-2.5">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                        <h4 className="text-[1.05rem] font-bold text-(--color-text) leading-tight m-0">
                                            {campaign.name}
                                        </h4>
                                        <div className="bg-(--color-primary-light) text-(--color-primary) text-[0.7rem] font-semibold px-2.5 py-0.5 rounded-full inline-block self-start">
                                            {campaign.purpose}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                    {(currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?._id === campaign.createdBy?._id) && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCampaignEdit(campaign); }}
                                            title="Edit campaign"
                                            className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-1 rounded-md shrink-0 leading-none hover:bg-[#C7FFD1] hover:text-[#00961C]!"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                    )}
                                    {(currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?._id === campaign.createdBy?._id) && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(campaign._id); }}
                                            title="Delete campaign"
                                            className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-1 rounded-md shrink-0 leading-none hover:bg-[#fef2f2] hover:text-[#ef4444]!"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                    </div>
                                </div>

                                {campaign.description && (
                                    <p className="text-[0.78rem] text-(--color-text-secondary) leading-relaxed m-0 line-clamp-2">
                                        {campaign.description}
                                    </p>
                                )}

                                <div className="flex items-center gap-3 text-[0.72rem] text-(--color-text-tertiary) flex-wrap">
                                    <span className="flex items-center gap-1">
                                        <Calendar size={11} />
                                        {formatDate(campaign.createdAt)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Target size={11} />
                                        <span className="font-semibold text-(--color-primary)">
                                            {campaign.leadCount ?? 0} lead{(campaign.leadCount ?? 0) !== 1 ? 's' : ''}
                                        </span>
                                    </span>
                                    <span className="ml-auto text-[0.7rem]">
                                        by {campaign.createdBy?.name || 'Unknown'}
                                    </span>
                                </div>
                            </div>

                            {campaign.people.length > 0 && (
                                <div className="px-5 py-[10px_12px] border-t border-(--color-border) bg-(--color-surface)">
                                    <div className="text-[0.68rem] text-(--color-text-tertiary) mb-1.5">
                                        Members ({campaign.people.length})
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {campaign.people.map((person, idx) => (
                                            <div
                                                key={person._id}
                                                title={person.name}
                                                className="flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1"
                                                style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] + '12' }}
                                            >
                                                <div className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[0.55rem] font-semibold shrink-0"
                                                    style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}>
                                                    {person.avatar ? (
                                                        <img src={`${import.meta.env.VITE_SOCKET_URL || 'https://flowdesk-api.raksco.in'}${person.avatar}/resize?w=40&q=60`} alt={person.name} width={20} height={20} loading="lazy" decoding="async" className="w-full h-full rounded-full object-cover" />
                                                    ) : getInitials(person.name)}
                                                </div>
                                                <span className="text-[0.7rem] font-medium text-(--color-text-secondary)">
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
            </div>
        </>
    );

    

    if (isLoading) {
        return (
            <div className="flex justify-center p-15">
                <Loader2 size={32} className="animate-spin text-(--color-primary)" />
            </div>
        );
    }

    return (
        <>
        {toast && (
            <div className={`fixed top-4 right-4 z-100 px-4 py-2.5 rounded-lg shadow-lg text-sm font-semibold text-white animate-fade-in ${
                toast.type === 'error' ? 'bg-(--color-danger)' : 'bg-green-600'
            }`}>
                {toast.message}
            </div>
        )}
        <div className="max-w-350 mx-auto h-[80dvh] flex flex-col lg:flex-row gap-0 overflow-hidden">
            <div className={`flex flex-col min-h-0 h-full flex-1 min-w-0 ${selectedCampaignId ? 'hidden lg:flex lg:pr-6' : 'flex'}`}>
                {campaignsContent}
            </div>
            {leadsPanel}

            {/* Create Campaign Modal */}
            <Modal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }}>
                <div className="card animate-fade-in max-w-125 w-full p-0 overflow-hidden rounded-2xl" style={{padding:0}}>
                        <div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface)">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
                                    <Plus size={18} className="text-(--color-primary)" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold m-0">{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</h3>
                                    <p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
                                        {editingCampaign ? 'Update campaign details' : 'Create a new outreach campaign'}
                                    </p>
                                </div>
                            </div>
                            <button
                                className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
                                onClick={() => { setShowCreateModal(false); resetForm(); }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4.5">
                            <div>
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
                                    Campaign Name <span className="text-(--color-danger)">*</span>
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
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
                                    Purpose / Goal <span className="text-(--color-danger)">*</span>
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
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
                                    Description (optional)
                                </label>
                                <textarea
                                    className="input min-h-17.5 resize-y"
                                    placeholder="Campaign details..."
                                    value={form.description}
                                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-2.5">
                                    Add Members <span className="text-[0.7rem] text-(--color-text-tertiary)">({selectedMembers.length} selected)</span>
                                </label>
                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                    {users.length === 0 ? (
                                        <p className="text-[0.8rem] text-(--color-text-tertiary) py-1">No team members found</p>
                                    ) : (
                                        users.map(user => {
                                            const isSelected = selectedMembers.includes(user._id);
                                            const isCreator = editingCampaign
                                                ? editingCampaign.createdBy?._id === user._id
                                                : currentUser?._id === user._id;
                                            return (
                                                <button
                                                    key={user._id}
                                                    onClick={() => {
                                                        if (isCreator) return;
                                                        toggleMember(user._id);
                                                    }}
                                                    style={{border:"1px solid #e2e8f0"}}
                                                    className={`btn btn-sm rounded-full flex items-center gap-1.5 shrink-0 ${isSelected ? 'btn-primary border border-transparent' : 'btn-secondary'} ${isCreator ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                    disabled={isCreator}
                                                >
                                                    {isCreator ? <Users size={12} /> : isSelected ? <X size={12} /> : <Users size={12} />}
                                                    {user.name}{isCreator ? ' (You)' : ''}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <button
                                className="btn btn-primary w-full mt-1 py-2.5"
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
                <div className="card animate-fade-in max-w-120 w-full p-0 overflow-hidden rounded-2xl">
                        <div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface)">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
                                    <Upload size={18} className="text-(--color-primary)" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold m-0">Import Leads</h3>
                                    <p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
                                        to {selectedCampaign?.name || 'campaign'}
                                    </p>
                                </div>
                            </div>
                            <button
                                className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
                                onClick={() => { setShowImportModal(false); setImportResult(null); }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {importResult ? (
                            <div className="p-6">
                                <div className="text-center mb-5">
                                    <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
                                        importResult.imported > 0 ? 'bg-green-100' : 'bg-red-100'
                                    }`}>
                                        {importResult.imported > 0
                                            ? <CheckCircle size={24} className="text-green-600" />
                                            : <AlertCircle size={24} className="text-red-500" />
                                        }
                                    </div>
                                    <h3 className="text-[1.05rem] font-bold text-(--color-text) m-0 mb-1">
                                        {importResult.imported} lead{importResult.imported !== 1 ? 's' : ''} imported
                                    </h3>
                                    <p className="text-[0.8rem] text-(--color-text-secondary) m-0">
                                        {importResult.errors.length > 0
                                            ? `${importResult.errors.length} error${importResult.errors.length !== 1 ? 's' : ''} encountered`
                                            : 'All leads imported successfully'}
                                    </p>
                                </div>
                                {importResult.errors.length > 0 && (
                                    <div className="mb-4 p-3 bg-red-50 rounded-lg text-[0.78rem] max-h-37.5 overflow-y-auto border border-red-200">
                                        <div className="font-semibold text-red-600 mb-2 flex items-center gap-1.5">
                                            <AlertCircle size={14} /> {importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''}
                                        </div>
                                        {importResult.errors.map((e: any, i: number) => (
                                            <div key={i} className="text-red-600 p-1 bg-white rounded mb-1 text-[0.75rem]">
                                                <strong>Row {e.row}:</strong> {e.message}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button
                                    className="btn btn-primary w-full py-2.5 rounded-lg font-semibold"
                                    onClick={() => { setShowImportModal(false); setImportResult(null); }}
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <div className="p-6">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    className="hidden"
                                    onChange={handleFileImport}
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-(--color-border) rounded-xl p-[32px_24px] text-center cursor-pointer bg-(--color-surface) mb-4 hover:border-(--color-primary) transition-colors"
                                >
                                    <Upload size={32} className="text-(--color-text-tertiary) mx-auto mb-3 opacity-40" />
                                    <p className="text-[0.85rem] font-semibold text-(--color-text) m-0 mb-1">
                                        {importing ? 'Importing...' : 'Click to upload Excel file'}
                                    </p>
                                    <p className="text-[0.72rem] text-(--color-text-tertiary) m-0">
                                        .xlsx or .xls format
                                    </p>
                                </div>

                                <a
                                    href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/leads/import/sample`}
                                    className="flex items-center justify-center gap-1.5 text-[0.8rem] font-medium text-(--color-primary) no-underline"
                                >
                                    <Download size={14} /> Download sample format
                                </a>
                            </div>
                        )}
                    </div>
                </Modal>
        </div>
        </>
    );
};

export default Campaigns;
