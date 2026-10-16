import { useState, useEffect } from 'react';
import { Plus, X, Handshake, Calendar, Loader2, Trash2, Pencil, Search, Upload, Download, AlertCircle, CheckCircle, Phone, Mail, Building2, User as UserIcon, FileText, ExternalLink } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import Modal from '../common/Modal';
import FilePreviewModal from '../common/FilePreviewModal';
import { useAuthStore } from '../../store/authStore';
import { useCrmSocket } from '../../hooks/useCrmSocket';

interface Partner {
    _id: string;
    companyName?: string;
    // legacy
    name?: string;
    personName: string;
    phone?: string;
    email?: string;
    pan?: string;
    gst?: string;
    partnerType: 'company' | 'individual';
    purpose?: string;
    description?: string;
    agreementFilePath?: string;
    agreementOriginalName?: string;
    agreementFileType?: string;
    agreementFileName?: string;
    people?: { _id: string; name: string }[];
    createdBy: { _id: string; name: string; email: string; avatar?: string };
    createdAt: string;
    leadCount?: number;
}

interface Lead {
    _id: string;
    name: string;
    phone?: string;
    companyName?: string;
    status: string;
    source?: string;
}

const apiBase = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5000/api';
const FILE_BASE =
    (import.meta.env.VITE_SOCKET_URL as string) ||
    apiBase.replace(/\/+$/, '').replace(/\/api$/, '');

// Tenant-checked download URL for agreements (requires auth header, which
// FilePreviewModal now sends). Falls back to the public path when only
// the legacy path is known.
const agreementUrl = (p: Partner): string => {
    if (p.agreementFileName) return `${apiBase.replace(/\/+$/, '')}/files/by-name/${encodeURIComponent(p.agreementFileName)}`;
    return p.agreementFilePath ? `${FILE_BASE}${p.agreementFilePath}` : '';
};

// GSTIN chars 3–12 are the holder's PAN (e.g. 27ABCDE1234F1Z5 → ABCDE1234F)
const panFromGst = (gst: string): string => {
    const g = gst.toUpperCase().replace(/\s/g, '');
    if (g.length !== 15) return '';
    const pan = g.slice(2, 12);
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : '';
};

// Mirrors the server guard: PDF/DOC/DOCX/JPG/PNG/WEBP, max 10MB (type AND extension must match)
const AGREEMENT_MAX_BYTES = 10 * 1024 * 1024;
const agreementError = (file: File): string | null => {
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    const okType = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    const okExt = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    if (!okType || !okExt) return `Only PDF, DOC, DOCX, JPG, PNG or WEBP allowed (got "${file.name}")`;
    if (file.size > AGREEMENT_MAX_BYTES) return `File exceeds 10MB (got ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
    return null;
};

const emptyForm = {
    partnerType: 'company' as 'company' | 'individual',
    companyName: '',
    personName: '',
    phone: '',
    email: '',
    pan: '',
    gst: '',
    purpose: '',
    description: '',
};

const Partners = () => {
    const { user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    useCrmSocket();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [agreementFile, setAgreementFile] = useState<File | null>(null);
    const [removeAgreement, setRemoveAgreement] = useState(false);
    const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
    const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ imported: number; errors: any[] } | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [deletingPartner, setDeletingPartner] = useState<Partner | null>(null);
    const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const PAGE_SIZE = 12;

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    useEffect(() => {
        const t = setTimeout(() => {
            setSearchQuery(searchInput.trim());
            setPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const { data: partnersData = { partners: [], total: 0, totalPages: 1 }, isLoading } = useQuery({
        queryKey: ["partners", page, searchQuery],
        queryFn: async () => {
            const params: any = { page, limit: PAGE_SIZE };
            if (searchQuery) params.search = searchQuery;
            const res = await api.get('/partners', { params });
            return {
                partners: (res.data.success ? res.data.partners : []) as Partner[],
                total: res.data.total ?? 0,
                totalPages: res.data.totalPages || 1,
            };
        },
    });

    const partners = partnersData.partners;
    const total = partnersData.total;
    const totalPages = partnersData.totalPages;

    useEffect(() => {
        if (page > totalPages && totalPages > 0) setPage(totalPages);
    }, [page, totalPages]);

    const { data: selectedPartner = null } = useQuery({
        queryKey: ["partner", selectedPartnerId],
        queryFn: async () => {
            if (!selectedPartnerId) return null;
            const hit = partners.find(p => p._id === selectedPartnerId);
            if (hit) return hit;
            const res = await api.get(`/partners/${selectedPartnerId}`);
            return (res.data.success ? res.data.partner : null) as Partner | null;
        },
        enabled: !!selectedPartnerId,
    });

    const { data: partnerLeads = [], isLoading: leadsLoading } = useQuery({
        queryKey: ["partner-leads", selectedPartnerId],
        queryFn: async () => {
            if (!selectedPartnerId) return [];
            const { data } = await api.get("/leads", { params: { partnerId: selectedPartnerId, limit: 100 } });
            return (data.success ? data.leads : []) as Lead[];
        },
        enabled: !!selectedPartnerId,
    });

    const partnerDisplayName = (p: Partner) => p.companyName || p.name || p.personName;

    const buildFormData = () => {
        const fd = new FormData();
        fd.append('partnerType', form.partnerType);
        fd.append('companyName', form.companyName.trim());
        fd.append('personName', form.personName.trim());
        fd.append('phone', form.phone.trim());
        fd.append('email', form.email.trim());
        fd.append('pan', form.pan.trim());
        fd.append('gst', form.gst.trim());
        fd.append('purpose', form.purpose.trim());
        fd.append('description', form.description.trim());
        if (agreementFile) fd.append('agreement', agreementFile);
        if (editingPartner && removeAgreement) fd.append('removeAgreement', 'true');
        return fd;
    };

    const formValid = () => {
        if (!form.personName.trim()) return false;
        if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ''))) return false;
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return false;
        return true;
    };

    const createMutation = useMutation({
        mutationFn: (fd: FormData) => api.post('/partners', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partners"] }),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, fd }: { id: string; fd: FormData }) =>
            api.put(`/partners/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partners"] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/partners/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["partners"] });
            queryClient.invalidateQueries({ queryKey: ["partner-leads"] });
        },
    });

    const resetForm = () => {
        setForm(emptyForm);
        setAgreementFile(null);
        setRemoveAgreement(false);
        setEditingPartner(null);
    };

    const handleSubmit = () => {
        if (!formValid()) return;
        const fd = buildFormData();
        if (editingPartner) {
            updateMutation.mutate({ id: editingPartner._id, fd }, {
                onSuccess: () => { resetForm(); setShowCreateModal(false); setToast({ message: 'Partner updated successfully', type: 'success' }); },
                onError: (err: any) => setToast({ message: err.response?.data?.message || 'Failed to update partner', type: 'error' }),
            });
        } else {
            createMutation.mutate(fd, {
                onSuccess: () => { resetForm(); setShowCreateModal(false); setPage(1); setToast({ message: 'Partner created successfully', type: 'success' }); },
                onError: (err: any) => setToast({ message: err.response?.data?.message || 'Failed to create partner', type: 'error' }),
            });
        }
    };

    const handlePartnerEdit = (partner: Partner) => {
        setForm({
            partnerType: partner.partnerType || 'company',
            companyName: partner.companyName || partner.name || '',
            personName: partner.personName || '',
            phone: partner.phone || '',
            email: partner.email || '',
            pan: partner.pan || '',
            gst: partner.gst || '',
            purpose: partner.purpose || '',
            description: partner.description || '',
        });
        setAgreementFile(null);
        setRemoveAgreement(false);
        setEditingPartner(partner);
        setShowCreateModal(true);
    };

    const confirmDelete = () => {
        if (!deletingPartner) return;
        const id = deletingPartner._id;
        if (selectedPartnerId === id) setSelectedPartnerId(null);
        deleteMutation.mutate(id, {
            onSuccess: (res: any) => {
                setDeletingPartner(null);
                setToast({ message: res?.data?.message || 'Partner deleted successfully', type: 'success' });
            },
            onError: (err: any) => setToast({ message: err.response?.data?.message || 'Failed to delete partner', type: 'error' }),
        });
    };

    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setImportResult(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const { data } = await api.post("/partners/import/excel", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setImportResult({ imported: data.imported, errors: data.errors || [] });
            if (data.success) queryClient.invalidateQueries({ queryKey: ["partners"] });
        } catch (err: any) {
            setToast({ message: err.response?.data?.message || "Import failed", type: 'error' });
        } finally {
            setImporting(false);
            e.target.value = "";
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';

    // Search + paging are server-side; `partners` is the current page.
    const filtered = partners;

    const detailPanel = selectedPartner && (
        <div className="flex flex-col overflow-hidden border-l border-r border-b border-(--color-border) rounded-xl w-full lg:w-100 lg:min-w-100 bg-(--color-surface)">
            <div className="px-5 py-4 border-b border-t border-(--color-border) flex items-start justify-between rounded-xl shrink-0">
                <div className="min-w-0">
                    <div className={`text-[0.65rem] font-bold uppercase tracking-wide ${selectedPartner.partnerType === 'company' ? 'text-(--color-primary)' : 'text-(--color-warning)'}`}>
                        {selectedPartner.partnerType === 'company' ? 'Company' : 'Individual'}
                    </div>
                    <h3 className="text-base font-bold m-0 truncate">{partnerDisplayName(selectedPartner)}</h3>
                    <p className="text-[0.75rem] text-(--color-text-secondary) mt-0.5 m-0">
                        {(selectedPartner.leadCount ?? partnerLeads.length)} lead{(selectedPartner.leadCount ?? partnerLeads.length) !== 1 ? 's' : ''} referred
                    </p>
                </div>
                <button
                    onClick={() => setSelectedPartnerId(null)}
                    className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:opacity-80"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="p-5 border-b border-(--color-border) flex flex-col gap-2 text-[0.8rem]">
                <div className="flex items-center gap-2 text-(--color-text)">
                    <UserIcon size={13} className="text-(--color-text-tertiary) shrink-0" />
                    <span className="font-semibold">{selectedPartner.personName}</span>
                </div>
                {selectedPartner.partnerType === 'company' && (selectedPartner.companyName || selectedPartner.name) && (
                    <div className="flex items-center gap-2 text-(--color-text-secondary)">
                        <Building2 size={13} className="shrink-0" /> {selectedPartner.companyName || selectedPartner.name}
                    </div>
                )}
                {selectedPartner.phone && (
                    <div className="flex items-center gap-2 text-(--color-text-secondary)">
                        <Phone size={13} className="shrink-0" /> {selectedPartner.phone}
                    </div>
                )}
                {selectedPartner.email && (
                    <div className="flex items-center gap-2 text-(--color-text-secondary)">
                        <Mail size={13} className="shrink-0" /> {selectedPartner.email}
                    </div>
                )}
                {(selectedPartner.pan || selectedPartner.gst) && (
                    <div className="flex flex-wrap gap-2 mt-1">
                        {selectedPartner.pan && <span className="text-[0.68rem] font-mono bg-(--color-surface-hover) px-2 py-0.5 rounded">PAN: {selectedPartner.pan}</span>}
                        {selectedPartner.gst && <span className="text-[0.68rem] font-mono bg-(--color-surface-hover) px-2 py-0.5 rounded">GST: {selectedPartner.gst}</span>}
                    </div>
                )}
                {selectedPartner.purpose && (
                    <p className="m-0 text-[0.78rem] text-(--color-text-secondary)"><strong>Purpose:</strong> {selectedPartner.purpose}</p>
                )}
                {selectedPartner.description && (
                    <p className="m-0 text-[0.78rem] text-(--color-text-secondary)">{selectedPartner.description}</p>
                )}
                {selectedPartner.agreementFilePath && (
                    <button
                        onClick={() => setPreviewFile({
                            url: agreementUrl(selectedPartner),
                            type: selectedPartner.agreementFileType || '',
                            name: selectedPartner.agreementOriginalName || 'Agreement',
                        })}
                        className="flex items-center gap-1.5 text-[0.8rem] font-medium text-(--color-primary) bg-transparent border-none cursor-pointer p-0 mt-1"
                    >
                        <FileText size={14} /> {selectedPartner.agreementOriginalName || 'View agreement'} <ExternalLink size={12} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {leadsLoading ? (
                    <div className="flex justify-center p-10">
                        <Loader2 size={24} className="animate-spin text-(--color-primary)" />
                    </div>
                ) : partnerLeads.length === 0 ? (
                    <div className="p-10 text-center">
                        <Handshake size={32} className="text-(--color-text-tertiary) opacity-30 mx-auto mb-3 block" />
                        <p className="text-[0.85rem] text-(--color-text-secondary)">No leads referred by this partner yet</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {partnerLeads.map((lead) => (
                            <div
                                key={lead._id}
                                className="card p-[10px_14px] cursor-pointer border border-(--color-border) hover:shadow-sm"
                                onClick={() => navigate(`/crm/dial?leadId=${lead._id}`)}
                            >
                                <div className="flex items-start justify-between mb-1">
                                    <span className="text-[0.85rem] font-semibold text-(--color-text)">{lead.name}</span>
                                </div>
                                <div className="flex items-center gap-2.5 text-[0.72rem] text-(--color-text-secondary) flex-wrap">
                                    {lead.phone && <span className="flex items-center gap-1"><Phone size={11} /> {lead.phone}</span>}
                                    {lead.companyName && <span className="flex items-center gap-1"><Building2 size={11} /> {lead.companyName}</span>}
                                </div>
                                <div className="mt-1">
                                    <span className="badge badge-todo text-[0.6rem]">{(lead.status || '').replace(/_/g, ' ')}</span>
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
            <div className={`flex flex-col min-h-0 h-full flex-1 min-w-0 ${selectedPartnerId ? 'hidden lg:flex lg:pr-6' : 'flex'}`}>
                <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-4 mb-5 pt-4 sm:pt-6">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Partners</h1>
                        <p className="text-[0.85rem] text-(--color-text-secondary) mt-1">
                            {total} partner{total !== 1 ? 's' : ''}
                        </p>
                    </div>
                    {canManage && (
                        <div className="flex gap-2">
                            <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
                                <Download size={16} /> Import
                            </button>
                            <button className="btn btn-primary" onClick={() => { resetForm(); setShowCreateModal(true); }}>
                                <Plus size={16} /> New Partner
                            </button>
                        </div>
                    )}
                </div>

                <div className="shrink-0 mb-4">
                    <div className="flex items-center gap-1.5 border border-(--color-border) rounded-lg px-2.5 bg-(--color-surface) max-w-md">
                        <Search size={14} className="text-(--color-text-tertiary) shrink-0" />
                        <input
                            placeholder="Search company, person, phone, email..."
                            className="flex-1 border-none py-2 text-[0.8rem] outline-none shadow-none bg-transparent"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                        />
                        {searchInput && (
                            <button onClick={() => setSearchInput('')} className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-0.5 leading-none">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto pb-4 sm:pb-6">
                {filtered.length === 0 ? (
                    <div className="card p-12 text-center">
                        <div className="mb-4 opacity-30">
                            <Handshake size={48} className="text-(--color-text-tertiary) mx-auto" />
                        </div>
                        <h3 className="text-[1.1rem] font-semibold text-(--color-text) mb-2">
                            {total === 0 ? 'No Partners Yet' : 'No partners match your search'}
                        </h3>
                        <p className="text-[0.85rem] text-(--color-text-secondary) max-w-90 mx-auto">
                            {total === 0 ? 'Add your first partner with company details and referral tracking.' : 'Try a different search term.'}
                        </p>
                    </div>
                ) : (
                    <div className={`grid grid-cols-1 ${!detailPanel ? "sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-1 xl:grid-cols-2"} gap-5 py-2`}>
                        {filtered.map((partner) => (
                            <div
                                key={partner._id}
                                className={`card animate-fade-in flex flex-col overflow-hidden relative cursor-pointer ${selectedPartnerId === partner._id ? 'border-(--color-primary)! border-2!' : ''}`}
                                style={{ padding: 0 }}
                                onClick={() => setSelectedPartnerId(partner._id)}
                            >
                                <div className="p-[18px_20px_14px] flex flex-col gap-2.5">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                            <h4 className="text-[1.05rem] font-bold text-(--color-text) leading-tight m-0">
                                                {partnerDisplayName(partner)}
                                            </h4>
                                            <div className="flex gap-1.5 flex-wrap">
                                                <span className={`text-[0.68rem] font-semibold px-2.5 py-0.5 rounded-full inline-block self-start ${partner.partnerType === 'company' ? 'bg-(--color-primary-light) text-(--color-primary)' : 'bg-(--color-warning-light) text-(--color-warning)'}`}>
                                                    {partner.partnerType === 'company' ? 'Company' : 'Individual'}
                                                </span>
                                                {(partner.leadCount ?? 0) > 0 && (
                                                    <span className="text-[0.68rem] font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 self-start">
                                                        {partner.leadCount} lead{(partner.leadCount ?? 0) !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {canManage && (
                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handlePartnerEdit(partner); }}
                                                title="Edit partner"
                                                className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-1 rounded-md shrink-0 leading-none hover:bg-[#C7FFD1] hover:text-[#00961C]!"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeletingPartner(partner); }}
                                                title="Delete partner"
                                                className="bg-transparent border-none cursor-pointer text-(--color-text-tertiary) p-1 rounded-md shrink-0 leading-none hover:bg-[#fef2f2] hover:text-[#ef4444]!"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1 text-[0.75rem] text-(--color-text-secondary)">
                                        <span className="flex items-center gap-1.5"><UserIcon size={12} /> {partner.personName}</span>
                                        {partner.phone && <span className="flex items-center gap-1.5"><Phone size={12} /> {partner.phone}</span>}
                                        {partner.email && <span className="flex items-center gap-1.5"><Mail size={12} /> {partner.email}</span>}
                                        {(partner.pan || partner.gst) && (
                                            <span className="text-[0.68rem] text-(--color-text-tertiary)">
                                                {[partner.pan && `PAN: ${partner.pan}`, partner.gst && `GST: ${partner.gst}`].filter(Boolean).join('  •  ')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 text-[0.72rem] text-(--color-text-tertiary) flex-wrap">
                                        <span className="flex items-center gap-1">
                                            <Calendar size={11} /> {formatDate(partner.createdAt)}
                                        </span>
                                        {partner.agreementFilePath && (
                                            <span className="flex items-center gap-1 text-(--color-primary)"><FileText size={11} /> Agreement</span>
                                        )}
                                        <span className="ml-auto text-[0.7rem]">by {partner.createdBy?.name || 'Unknown'}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {totalPages > 1 && (
                    <div className="flex items-center gap-3 flex-wrap" style={{ justifyContent: "center", padding: "16px 0" }}>
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                            style={{
                                padding: "6px 14px",
                                borderRadius: 8,
                                border: "1px solid var(--color-border)",
                                background: page <= 1 ? "var(--color-surface)" : "var(--color-primary)",
                                color: page <= 1 ? "var(--color-text-tertiary)" : "var(--color-border)",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                cursor: page <= 1 ? "not-allowed" : "pointer",
                            }}
                        >
                            Previous
                        </button>
                        <span style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                            Page {page} of {totalPages}
                        </span>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            style={{
                                padding: "6px 14px",
                                borderRadius: 8,
                                border: "1px solid var(--color-border)",
                                background: page >= totalPages ? "var(--color-surface)" : "var(--color-primary)",
                                color: page >= totalPages ? "var(--color-text-tertiary)" : "var(--color-border)",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                cursor: page >= totalPages ? "not-allowed" : "pointer",
                            }}
                        >
                            Next
                        </button>
                    </div>
                )}
                </div>
            </div>
            {detailPanel}

            <Modal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }}>
                <div className="card animate-fade-in w-full p-0 overflow-hidden rounded-2xl" style={{padding:0, maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>
                    <div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface) shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
                                <Plus size={18} className="text-(--color-primary)" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold m-0">{editingPartner ? 'Edit Partner' : 'New Partner'}</h3>
                                <p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">
                                    {editingPartner ? 'Update partner details' : 'Add company / individual partner'}
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

                    <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                        <div>
                            <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">Partner type *</label>
                            <div className="flex gap-2">
                                {(['company', 'individual'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setForm(prev => ({ ...prev, partnerType: t }))}
                                        className={`btn btn-sm flex-1 ${form.partnerType === t ? 'btn-primary' : 'btn-secondary'}`}
                                    >
                                        {t === 'company' ? 'Company' : 'Individual'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {form.partnerType === 'company' && (
                            <div>
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
                                    Company name <span className="text-(--color-text-tertiary)">(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g. Acme Corp"
                                    value={form.companyName}
                                    onChange={e => setForm(prev => ({ ...prev, companyName: e.target.value }))}
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">
                                Person name <span className="text-(--color-danger)">*</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                placeholder="e.g. Rahul Sharma"
                                value={form.personName}
                                onChange={e => setForm(prev => ({ ...prev, personName: e.target.value }))}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">Contact number <span className="text-(--color-danger)">*</span></label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={10}
                                    className="input"
                                    placeholder="10-digit mobile"
                                    value={form.phone}
                                    onChange={e => setForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                />
                                {form.phone && !/^\d{10}$/.test(form.phone.replace(/\D/g, '')) && (
                                    <p className="text-[0.7rem] text-(--color-danger) mt-1">Enter a valid 10-digit number</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">Email id</label>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="name@company.com"
                                    value={form.email}
                                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">GST number</label>
                                <input
                                    type="text"
                                    className="input font-mono"
                                    placeholder="27ABCDE1234F1Z5"
                                    value={form.gst}
                                    onChange={e => {
                                        const gst = e.target.value.toUpperCase();
                                        const derived = panFromGst(gst);
                                        setForm(prev => ({ ...prev, gst, ...(derived ? { pan: derived } : {}) }));
                                    }}
                                />
                                {panFromGst(form.gst) && (
                                    <p className="text-[0.7rem] text-(--color-text-tertiary) mt-1">PAN auto-filled from GST</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">PAN number</label>
                                <input
                                    type="text"
                                    className="input font-mono"
                                    placeholder="ABCDE1234F"
                                    value={form.pan}
                                    onChange={e => setForm(prev => ({ ...prev, pan: e.target.value.toUpperCase() }))}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">Purpose / Role (optional)</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="e.g. Channel partner for west region"
                                value={form.purpose}
                                onChange={e => setForm(prev => ({ ...prev, purpose: e.target.value }))}
                            />
                        </div>

                        <div>
                            <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">Description (optional)</label>
                            <textarea
                                className="input min-h-17.5 resize-y"
                                placeholder="Partner details..."
                                value={form.description}
                                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>

                        <div>
                            <label className="block text-[0.75rem] text-(--color-text-secondary) mb-1.5">Agreement (optional)</label>
                            {editingPartner?.agreementFilePath && !removeAgreement && !agreementFile ? (
                                <div className="flex items-center justify-between gap-2 border border-(--color-border) rounded-lg px-3 py-2 text-[0.8rem]">
                                    <button
                                        onClick={() => editingPartner?.agreementFilePath && setPreviewFile({
                                            url: agreementUrl(editingPartner),
                                            type: editingPartner.agreementFileType || '',
                                            name: editingPartner.agreementOriginalName || 'Agreement',
                                        })}
                                        className="flex items-center gap-1.5 text-(--color-primary) bg-transparent border-none cursor-pointer truncate p-0"
                                    >
                                        <FileText size={14} /> <span className="truncate">{editingPartner.agreementOriginalName || 'Current agreement'}</span>
                                    </button>
                                    <button onClick={() => setRemoveAgreement(true)} className="btn btn-sm btn-secondary shrink-0">Remove</button>
                                </div>
                            ) : agreementFile ? (
                                <div className="flex items-center justify-between gap-2 border border-(--color-border) rounded-lg px-3 py-2 text-[0.8rem]">
                                    <button
                                        onClick={() => setPreviewFile({
                                            url: URL.createObjectURL(agreementFile),
                                            type: agreementFile.type,
                                            name: agreementFile.name,
                                        })}
                                        className="flex items-center gap-1.5 text-(--color-primary) bg-transparent border-none cursor-pointer truncate p-0"
                                    >
                                        <FileText size={14} /> <span className="truncate">{agreementFile.name}</span>
                                    </button>
                                    <button onClick={() => setAgreementFile(null)} className="btn btn-sm btn-secondary shrink-0">Remove</button>
                                </div>
                            ) : (
                                <label className="border-2 border-dashed border-(--color-border) rounded-xl p-4 text-center cursor-pointer bg-(--color-surface) hover:border-(--color-primary) transition-colors block">
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                        onChange={e => {
                                            const f = e.target.files?.[0] || null;
                                            if (f) {
                                                const err = agreementError(f);
                                                if (err) {
                                                    setToast({ message: err, type: 'error' });
                                                    e.target.value = '';
                                                    return;
                                                }
                                            }
                                            setAgreementFile(f);
                                        }}
                                    />
                                    <Upload size={20} className="text-(--color-text-tertiary) mx-auto mb-1 opacity-60" />
                                    <p className="text-[0.8rem] font-semibold text-(--color-text) m-0">
                                        Upload agreement
                                    </p>
                                    <p className="text-[0.7rem] text-(--color-text-tertiary) m-0">PDF / DOC / JPG / PNG / WEBP · max 10MB · optional</p>
                                </label>
                            )}
                            {removeAgreement && !agreementFile && (
                                <p className="text-[0.72rem] text-(--color-warning) mt-1">Current agreement will be removed on save. You can upload a replacement above.</p>
                            )}
                        </div>

                        <button
                            className="btn btn-primary w-full mt-1 py-2.5"
                            disabled={!formValid() || createMutation.isPending || updateMutation.isPending}
                            onClick={handleSubmit}
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : null}
                            {(createMutation.isPending || updateMutation.isPending)
                                ? (editingPartner ? 'Updating...' : 'Creating...')
                                : (editingPartner ? 'Update Partner' : 'Create Partner')}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={!!deletingPartner} onClose={() => { if (!deleteMutation.isPending) setDeletingPartner(null); }}>
                <div className="card animate-fade-in max-w-105 w-full p-0 overflow-hidden rounded-2xl" style={{padding:0}}>
                    <div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface)">
                        <div>
                            <h3 className="text-base font-bold m-0">Delete partner?</h3>
                            <p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">This cannot be undone. Referred leads are kept, just unlinked.</p>
                        </div>
                        <button
                            className="bg-(--color-surface-hover) border-none cursor-pointer text-(--color-text-tertiary) w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
                            onClick={() => { if (!deleteMutation.isPending) setDeletingPartner(null); }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="p-6 flex flex-col gap-4">
                        <p className="text-[0.875rem] text-(--color-text) m-0 leading-relaxed">
                            Delete <strong>{deletingPartner && partnerDisplayName(deletingPartner)}</strong>?
                        </p>
                        <div className="flex justify-end gap-2">
                            <button className="btn btn-secondary" disabled={deleteMutation.isPending} onClick={() => setDeletingPartner(null)}>Cancel</button>
                            <button className="btn btn-danger" disabled={deleteMutation.isPending} onClick={confirmDelete}>
                                {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                {deleteMutation.isPending ? 'Deleting...' : 'Delete partner'}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={showImportModal} onClose={() => { setShowImportModal(false); setImportResult(null); }}>
                <div className="card animate-fade-in max-w-120 w-full p-0 overflow-hidden rounded-2xl">
                    <div className="px-6 py-5 border-b border-(--color-border) flex items-center justify-between bg-(--color-surface)">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-(--color-primary-light) flex items-center justify-center">
                                <Upload size={18} className="text-(--color-primary)" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold m-0">Import Partners</h3>
                                <p className="text-[0.72rem] text-(--color-text-tertiary) mt-0.5 m-0">Bulk add from Excel</p>
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
                                <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${importResult.imported > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                                    {importResult.imported > 0 ? <CheckCircle size={24} className="text-green-600" /> : <AlertCircle size={24} className="text-red-500" />}
                                </div>
                                <h3 className="text-[1.05rem] font-bold text-(--color-text) m-0 mb-1">
                                    {importResult.imported} partner{importResult.imported !== 1 ? 's' : ''} imported
                                </h3>
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
                            <button className="btn btn-primary w-full py-2.5 rounded-lg font-semibold" onClick={() => { setShowImportModal(false); setImportResult(null); }}>
                                Done
                            </button>
                        </div>
                    ) : (
                        <div className="p-6">
                            <label className="border-2 border-dashed border-(--color-border) rounded-xl p-[32px_24px] text-center cursor-pointer bg-(--color-surface) mb-4 hover:border-(--color-primary) transition-colors block">
                                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileImport} />
                                <Upload size={32} className="text-(--color-text-tertiary) mx-auto mb-3 opacity-40" />
                                <p className="text-[0.85rem] font-semibold text-(--color-text) m-0 mb-1">{importing ? 'Importing...' : 'Click to upload Excel file'}</p>
                                <p className="text-[0.72rem] text-(--color-text-tertiary) m-0">.xlsx or .xls format</p>
                            </label>
                            <a
                                href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/partners/import/sample`}
                                className="flex items-center justify-center gap-1.5 text-[0.8rem] font-medium text-(--color-primary) no-underline"
                            >
                                <Download size={14} /> Download sample format
                            </a>
                        </div>
                    )}
                </div>
            </Modal>

            <FilePreviewModal
                isOpen={!!previewFile}
                onClose={() => {
                    if (previewFile?.url.startsWith('blob:')) URL.revokeObjectURL(previewFile.url);
                    setPreviewFile(null);
                }}
                fileUrl={previewFile?.url || ''}
                fileType={previewFile?.type || ''}
                fileName={previewFile?.name || ''}
            />
        </div>
        </>
    );
};

export default Partners;
