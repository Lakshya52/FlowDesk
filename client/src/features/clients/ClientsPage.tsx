import React, { useEffect, useState, useRef } from "react";
import { useNavigate , useLocation  } from "react-router-dom";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import Modal from '@/shared/components/Modal';
import { Plus, Building2, Building, Users, FolderKanban, ChevronRight, ChevronDown, Edit2, Trash2, X, Phone, Mail, Globe, Upload, Download, FileSpreadsheet, FileText } from "lucide-react";

interface Company {
    _id: string;
    name: string;
    parentCompanyId?: string | null;
    industry?: string;
    description?: string;
    website?: string;
    phone?: string;
    phoneCountryCode?: string;
    address?: { street?: string; city?: string; state?: string; country?: string; postalCode?: string };
    status: "active" | "inactive";
    contacts?: Contact[];
    childCompanies?: Company[];
    email?: string;
}

interface Contact {
    _id: string;
    companyId: string;
    name: string;
    email?: string;
    phone?: string;
    phoneCountryCode?: string;
    position?: string;
    department?: string;
    isPrimary: boolean;
    notes?: string;
}

const ClientsPage: React.FC = () => {
    const location = useLocation();
    const queryClient = useQueryClient();

    const { data: companiesData, isLoading: loading } = useQuery({
        queryKey: ['companies'],
        queryFn: async () => {
            const { data } = await api.get("/companies");
            return data.companies || [];
        },
        staleTime: Infinity,
    });

    const companies = React.useMemo(() => {
        const flatList: Company[] = [];
        const flatten = (list: any[]) => {
            list.forEach(item => {
                const { children, ...rest } = item;
                flatList.push(rest);
                if (children) flatten(children);
            });
        };
        flatten(companiesData || []);
        return flatList;
    }, [companiesData]);
    const [selected, setSelected] = useState<Company | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [showContactForm, setShowContactForm] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<"details" | "contacts" | "projects">("details");
    const [showImport, setShowImport] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const detailsRef = useRef<HTMLDivElement>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const [companyAssignments, setCompanyAssignments] = useState<any[]>([]);
    const [loadingAssignments, setLoadingAssignments] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
    const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

    // Safety: close export dropdown on Escape or route change
    React.useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsExportDropdownOpen(false);
        };
        window.addEventListener("keydown", handleEscape);
        return () => {
            window.removeEventListener("keydown", handleEscape);
            setIsExportDropdownOpen(false);
        };
    }, [location.pathname]);
    const [isSelectDataMode, setIsSelectDataMode] = useState(false);

    // for debugging
    // console.log(selected);

    const [companyForm, setCompanyForm] = useState({
        name: "",
        companyType: "parent" as "parent" | "child",
        parentCompanyId: "",
        industry: "",
        description: "",
        website: "",
        email: "",
        phone: "",
        phoneCountryCode: "+91",
        address: { street: "", city: "", state: "", country: "India", postalCode: "" },
    });

    const [contactForm, setContactForm] = useState({
        name: "",
        email: "",
        phone: "",
        phoneCountryCode: "+91",
        position: "",
        department: "",
        isPrimary: false,
        notes: "",
    });

    useEffect(() => {
        let isMounted = true;
        if (selected?._id) {
            const fetchDetails = async () => {
                try {
                    const { data } = await api.get(`/companies/${selected._id}`);
                    if (isMounted) {
                        setSelected(data.company);
                    }
                } catch (e) {
                    console.error(e);
                }
            };
            fetchDetails();
        }
        return () => {
            isMounted = false;
        };
    }, [selected?._id]);

    useEffect(() => {
        if (selected?._id && window.innerWidth < 1024) {
            // Smooth scroll to the details container on mobile/tablet viewports where layout is stacked
            detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [selected?._id]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const fetchCompanyDetails = async (companyId: string) => {
        try {
            const { data } = await api.get(`/companies/${companyId}`);
            setSelected(data.company);


        } catch (e) {
            console.error(e);
        }
    };



    useEffect(() => {
        let isMounted = true;
        if (selected?._id && activeTab === 'projects') {
            const fetchAssignments = async () => {
                setLoadingAssignments(true);
                try {
                    const { data } = await api.get('/assignments', { params: { companyId: selected._id } });
                    if (isMounted) {
                        setCompanyAssignments(data.assignments || []);
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    if (isMounted) {
                        setLoadingAssignments(false);
                    }
                }
            };
            fetchAssignments();
        }
        return () => {
            isMounted = false;
        };
    }, [selected?._id, activeTab]);

    const handleCreateCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingCompany) {
                await api.put(`/companies/${editingCompany._id}`, companyForm);
            } else {
                await api.post("/companies", companyForm);
            }
            setShowCreate(false);
            setEditingCompany(null);
            resetCompanyForm();
            queryClient.invalidateQueries({ queryKey: ['companies'] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        }
    };

    const handleEditCompany = (company: Company) => {
        setEditingCompany(company);
        setCompanyForm({
            name: company.name,
            companyType: company.parentCompanyId ? "child" : "parent",
            parentCompanyId: company.parentCompanyId || "",
            industry: company.industry || "",
            description: company.description || "",
            website: company.website || "",
            email: company.email || "",
            phone: company.phone || "",
            phoneCountryCode: (company as any).phoneCountryCode || "+91",
            address: {
                street: company.address?.street || "",
                city: company.address?.city || "",
                state: company.address?.state || "",
                country: company.address?.country || "India",
                postalCode: company.address?.postalCode || "",
            }
        });
        setShowCreate(true);
    };

    const handleDeleteCompany = async (id: string) => {
        if (!confirm("Are you sure you want to delete this company? This will also delete all associated contacts and children companies.")) return;
        try {
            await api.delete(`/companies/${id}`);
            if (selected?._id === id) setSelected(null);
            queryClient.invalidateQueries({ queryKey: ['companies'] });
        } catch (e: any) {
            alert(e.response?.data?.message || "Delete failed");
        }
    };

    const resetCompanyForm = () => {
        setCompanyForm({
            name: "",
            companyType: "parent",
            parentCompanyId: "",
            industry: "",
            description: "",
            website: "",
            email: "",
            phone: "",
            phoneCountryCode: "+91",
            address: { street: "", city: "", state: "", country: "India", postalCode: "" }
        });
        setEditingCompany(null);
    };

    const toggleExpand = (companyId: string) => {
        const newExpanded = new Set(expandedCompanies);
        if (newExpanded.has(companyId)) {
            newExpanded.delete(companyId);
        } else {
            newExpanded.add(companyId);
        }
        setExpandedCompanies(newExpanded);
    };

    const filteredTree = React.useMemo(() => {
        const buildTreeLocal = (parentId: string | null = null): any[] => {
            return companies
                .filter((c) => (c.parentCompanyId || null) === parentId)
                .map((c) => ({ ...c, children: buildTreeLocal(c._id) }));
        };
        const rootCompanies = buildTreeLocal();
        if (!searchQuery) return rootCompanies;

        const matchCompany = (c: any): boolean =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.children && c.children.some(matchCompany));

        const filterCompany = (c: any): any => {
            return {
                ...c,
                children: c.children?.map(filterCompany).filter((child: any) => matchCompany(child) || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
            };
        };

        return rootCompanies.map(filterCompany).filter((c: any) => matchCompany(c) || c.children?.length > 0);
    }, [companies, searchQuery]);

    const totalPages = Math.ceil(filteredTree.length / ITEMS_PER_PAGE);
    const displayPage = Math.min(currentPage, totalPages || 1);
    const paginatedTree = React.useMemo(() => {
        const activePage = Math.min(currentPage, totalPages || 1);
        return filteredTree.slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE);
    }, [filteredTree, currentPage, totalPages]);

    // const tree = buildTree();

    // const handleAddContact = () => {
    //     setEditingContact(null);
    //     setContactForm({
    //         name: "",
    //         email: "",
    //         phone: "",
    //         position: "",
    //         department: "",
    //         isPrimary: false,
    //         notes: ""
    //     });
    //     setShowContactForm(true);
    // };

    // const handleEditContact = (contact: Contact) => {
    //     setEditingContact(contact);
    //     setContactForm({
    //         name: contact.name,
    //         email: contact.email || "",
    //         phone: contact.phone || "",
    //         position: contact.position || "",
    //         department: contact.department || "",
    //         isPrimary: contact.isPrimary,
    //         notes: contact.notes || ""
    //     });
    //     setShowContactForm(true);
    // };

    const handleSaveContact = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selected) return;

        try {
            if (editingContact) {
                await api.put(`/companies/${selected._id}/contacts/${editingContact._id}`, contactForm);
            } else {
                await api.post(`/companies/${selected._id}/contacts`, contactForm);
            }
            setShowContactForm(false);
            fetchCompanyDetails(selected._id);
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        }
    };


    const handleDeleteContact = async (contactId: string) => {
        if (!selected || !confirm("Delete this contact?")) return;

        try {
            await api.delete(`/companies/${selected._id}/contacts/${contactId}`);
            fetchCompanyDetails(selected._id);
        } catch (e: any) {
            alert(e.response?.data?.message || "Failed");
        }
    };

    // const handleExportExcel = async () => {
    //     try {
    //         const response = await api.get('/companies/export/excel', { responseType: 'blob' });
    //         const url = window.URL.createObjectURL(new Blob([response.data]));
    //         const link = document.createElement('a');
    //         link.href = url;
    //         link.setAttribute('download', `companies_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    //         document.body.appendChild(link);
    //         link.click();
    //         link.remove();
    //     } catch (e: any) {
    //         alert(e.response?.data?.message || "Export failed");
    //     }
    // };

    const handleExportExcel = async () => {
        try {
            const idsParam = selectedCompanyIds.size > 0 ? `?ids=${Array.from(selectedCompanyIds).join(',')}` : '';
            const response = await api.get(`/companies/export/excel${idsParam}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `clients_export_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setIsExportDropdownOpen(false);
        } catch (e: any) {
            alert(e.response?.data?.message || "Export failed");
        }
    };

    const handleExportPDF = async () => {
        try {
            const idsParam = selectedCompanyIds.size > 0 ? `?ids=${Array.from(selectedCompanyIds).join(',')}` : '';
            const response = await api.get(`/companies/export/pdf${idsParam}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `clients_export_${new Date().toISOString().split('T')[0]}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setIsExportDropdownOpen(false);
        } catch (e: any) {
            alert(e.response?.data?.message || "Export failed");
        }
    };

    // const handleImportClick = () => {
    //     setShowImport(true);
    //     setImportResult(null);
    // };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setImporting(true);

        try {
            const { data } = await api.post('/companies/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setImportResult(data.results);
            queryClient.invalidateQueries({ queryKey: ['companies'] });
        } catch (err: any) {
            alert(err.response?.data?.message || "Import failed");
        } finally {
            setImporting(false);
        }
    };

    const handleDownloadSample = async () => {
        try {
            const response = await api.get('/companies/import/sample', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'company_import_sample.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e: any) {
            alert("Failed to download sample file");
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedCompanyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedCompanyIds.size === companies.length) {
            setSelectedCompanyIds(new Set());
        } else {
            setSelectedCompanyIds(new Set(companies.map(c => c._id)));
        }
    };

    const exportToCSV = () => {
        const targetCompanies = selectedCompanyIds.size > 0
            ? companies.filter(c => selectedCompanyIds.has(c._id))
            : companies;

        if (targetCompanies.length === 0) {
            alert("No data to export");
            return;
        }

        const headers = [
            "Company Name", "Industry", "Website", "Company Email", "Company Phone", "Status",
            "Contact Name", "Contact Email", "Contact Phone", "Position", "Department", "Is Primary?"
        ];

        const rows: any[] = [];

        targetCompanies.forEach(c => {
            // Find contacts for this company from the 'companies' flat list if they exist
            // (The flat list might have contacts if they were populated by the server)
            const contacts = c.contacts || [];

            if (contacts.length > 0) {
                contacts.forEach((contact: any) => {
                    rows.push([
                        `"${c.name}"`,
                        `"${c.industry || ""}"`,
                        `"${c.website || ""}"`,
                        `"${c.email || ""}"`,
                        `"${(c.phoneCountryCode || "") + (c.phone ? " " + c.phone : "")}"`,
                        `"${c.status}"`,
                        `"${contact.name}"`,
                        `"${contact.email || ""}"`,
                        `"${(contact.phoneCountryCode || "") + (contact.phone ? " " + contact.phone : "")}"`,
                        `"${contact.position || ""}"`,
                        `"${contact.department || ""}"`,
                        `"${contact.isPrimary ? "Yes" : "No"}"`
                    ]);
                });
            } else {
                rows.push([
                    `"${c.name}"`,
                    `"${c.industry || ""}"`,
                    `"${c.website || ""}"`,
                    `"${c.email || ""}"`,
                    `"${(c.phoneCountryCode || "") + (c.phone ? " " + c.phone : "")}"`,
                    `"${c.status}"`,
                    `""`, `""`, `""`, `""`, `""`, `""`
                ]);
            }
        });

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `clients_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const navigate = useNavigate();

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 24, maxWidth: 1200, margin: '0 auto' }}>
            {/* Header section with actions */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Companies & Clients</h1>
                    <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: 4 }}>Manage client relationships, contacts, and projects</p>
                </div>
                <div className="flex flex-wrap gap-2.5 items-center">
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Upload size={16} />Import
                    </button>

                    <div style={{ position: 'relative' }}>
                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                                style={{ display: "flex", alignItems: "center", gap: 6 }}
                            >
                                <Download size={16} />
                                {isSelectDataMode ? `Export Selected (${selectedCompanyIds.size})` : 'Export'}
                            </button>

                            {isSelectDataMode && (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                        setIsSelectDataMode(false);
                                        setSelectedCompanyIds(new Set());
                                    }}
                                    style={{ color: 'var(--color-error)' }}
                                    title="Cancel Selection"
                                >
                                    <X size={16} /> Cancel
                                </button>
                            )}
                        </div>

                        {isExportDropdownOpen && (
                            <>
                                <div
                                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
                                    onClick={() => setIsExportDropdownOpen(false)}
                                />
                                <div className="card shadow-xl" style={{
                                    position: 'absolute', top: '100%', right: 0, zIndex: 101,
                                    marginTop: 8, width: 220, padding: 8,
                                    background: 'var(--color-surface)', border: '1px solid var(--color-border)'
                                }}>
                                    {isSelectDataMode ? (
                                        <>
                                            <div style={{ padding: '8px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                                                Choose Format ({selectedCompanyIds.size} Selected)
                                            </div>
                                            <button
                                                className="btn btn-ghost btn-sm w-full"
                                                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                                                onClick={() => { exportToCSV(); setIsExportDropdownOpen(false); setIsSelectDataMode(false); setSelectedCompanyIds(new Set()); }}
                                            >
                                                <FileSpreadsheet size={16} style={{ marginRight: 10 }} /> Export to CSV
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm w-full"
                                                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                                                onClick={() => { handleExportExcel(); setIsSelectDataMode(false); setSelectedCompanyIds(new Set()); }}
                                            >
                                                <FileSpreadsheet size={16} style={{ marginRight: 10 }} /> Export to Excel
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm w-full"
                                                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                                                onClick={() => { handleExportPDF(); setIsSelectDataMode(false); setSelectedCompanyIds(new Set()); }}
                                            >
                                                <FileText size={16} style={{ marginRight: 10 }} /> Export to PDF
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ padding: '8px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                                                Export Options
                                            </div>
                                            <button
                                                className="btn btn-ghost btn-sm w-full"
                                                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                                                onClick={() => { setIsSelectDataMode(true); setIsExportDropdownOpen(false); setSelectedCompanyIds(new Set()); }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 14, height: 14, border: '1px solid currentColor', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 10 }}>✓</span></div> Select Data
                                                </div>
                                            </button>
                                            <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                                            <div style={{ padding: '8px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                                                Export All Formats
                                            </div>
                                            <button
                                                className="btn btn-ghost btn-sm w-full"
                                                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                                                onClick={() => { setIsSelectDataMode(false); setSelectedCompanyIds(new Set()); exportToCSV(); setIsExportDropdownOpen(false); }}
                                            >
                                                <FileSpreadsheet size={16} style={{ marginRight: 10 }} /> Export to CSV
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm w-full"
                                                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                                                onClick={() => { setIsSelectDataMode(false); setSelectedCompanyIds(new Set()); handleExportExcel(); }}
                                            >
                                                <FileSpreadsheet size={16} style={{ marginRight: 10 }} /> Export to Excel (.xlsx)
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm w-full"
                                                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                                                onClick={() => { setIsSelectDataMode(false); setSelectedCompanyIds(new Set()); handleExportPDF(); }}
                                            >
                                                <FileText size={16} style={{ marginRight: 10 }} /> Export to PDF (.pdf)
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <button className="btn btn-primary btn-sm" onClick={() => { setEditingCompany(null); resetCompanyForm(); setShowCreate(true); }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Plus size={16} />Add Company
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 lg:h-[calc(100vh-180px)]" style={{ minHeight: 600 }}>
                {/* Left panel: Company List & Hierarchy */}
                <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ padding: 16, borderBottom: "1px solid var(--color-border)" }}>
                        <div style={{ position: 'relative', marginBottom: 12 }}>
                            <input
                                placeholder="Search companies..."
                                className="input w-full"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            {isSelectDataMode ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        className="checkbox"
                                        checked={selectedCompanyIds.size === companies.length && companies.length > 0}
                                        onChange={selectAll}
                                    />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                        {selectedCompanyIds.size > 0 ? `${selectedCompanyIds.size} Selected` : 'Select All'}
                                    </span>
                                </div>
                            ) : (
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                    Companies List
                                </span>
                            )}
                            {/* Pagination controls matching Dashboard Recent Activity */}
                            {totalPages > 1 && (
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <button
                                        className="btn btn-ghost btn-xs"
                                        style={{ fontSize: "0.6875rem", padding: "2px 6px" }}
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    >
                                        Prev
                                    </button>
                                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
                                        Page {displayPage} of {totalPages}
                                    </span>
                                    <button
                                        className="btn btn-ghost btn-xs"
                                        style={{ fontSize: "0.6875rem", padding: "2px 6px" }}
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                            {(totalPages <= 1 || !totalPages) && (
                                <span className="badge" style={{ fontSize: '0.65rem' }}>{companies.length} total</span>
                            )}
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                        {loading ? (
                            <div style={{ padding: 40, textAlign: "center", opacity: 0.5 }} className="flex flex-col items-center justify-center gap-3" >
                                <span className="border-t border-(--primary) h-5 w-5 rounded-full animate-spin" ></span>
                                Loading companies...</div>
                        ) : (
                            (() => {
                                if (filteredTree.length === 0) {
                                    return (
                                        <div style={{ opacity: 0.6, fontSize: "0.875rem", textAlign: 'center', padding: 40 }}>
                                            {searchQuery ? "No matches found" : "No companies yet"}
                                        </div>
                                    );
                                }

                                return (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                        {paginatedTree.map((company) => (
                                            <CompanyNode
                                                key={company._id}
                                                node={company}
                                                onSelect={setSelected}
                                                onEdit={handleEditCompany}
                                                onDelete={handleDeleteCompany}
                                                selectedId={selected?._id}
                                                selectedCompanyIds={selectedCompanyIds}
                                                toggleSelection={toggleSelection}
                                                expandedCompanies={expandedCompanies}
                                                toggleExpand={toggleExpand}
                                                isSearchActive={searchQuery.length > 0}
                                                isSelectDataMode={isSelectDataMode}
                                            />
                                        ))}
                                    </div>
                                );
                            })()
                        )}
                    </div>
                </div>

                {/* Right section - details of the company */}
                <div ref={detailsRef} className="card" style={{ overflowY: "auto", padding: 0, position: 'relative' }}>
                    {!selected ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.4 }}>
                            <Building2 size={64} style={{ marginBottom: 16 }} />
                            <h3 style={{ fontWeight: 700 }}>Company Details</h3>
                            <p style={{ fontSize: '0.875rem' }}>Select a company from the list to view full details</p>
                        </div>
                    ) : (
                        <div style={{ padding: 32 }}>
                            <CompanyDetailView
                                company={selected}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                onAddContact={() => {
                                    setEditingContact(null);
                                    setContactForm({
                                        name: "",
                                        email: "",
                                        phone: "",
                                        phoneCountryCode: "+91",
                                        position: "",
                                        department: "",
                                        isPrimary: false,
                                        notes: ""
                                    });
                                    setShowContactForm(true);
                                }}
                                onEditContact={(contact: Contact) => {
                                    setEditingContact(contact);
                                    setContactForm({
                                        name: contact.name,
                                        email: contact.email || "",
                                        phone: contact.phone || "",
                                        phoneCountryCode: contact.phoneCountryCode || "+91",
                                        position: contact.position || "",
                                        department: contact.department || "",
                                        isPrimary: contact.isPrimary,
                                        notes: contact.notes || ""
                                    });
                                    setShowContactForm(true);
                                }}
                                onDeleteContact={handleDeleteContact}
                                assignments={companyAssignments}
                                loadingAssignments={loadingAssignments}
                                onProjectClick={(pid: string) => navigate(`/assignments/${pid}`)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {showCreate && (
                <CreateCompanyModal
                    showCreate={showCreate}
                    setShowCreate={setShowCreate}
                    companies={companies}
                    companyForm={companyForm}
                    setCompanyForm={setCompanyForm}
                    handleCreate={handleCreateCompany}
                    resetForm={resetCompanyForm}
                    isEditing={!!editingCompany}
                />
            )}

            {showContactForm && selected && (
                <ContactModal
                    showContactForm={showContactForm}
                    setShowContactForm={setShowContactForm}
                    editingContact={editingContact}
                    contactForm={contactForm}
                    setContactForm={setContactForm}
                    handleSave={handleSaveContact}
                />
            )}

            {showImport && (
                <ImportModal
                    showImport={showImport}
                    setShowImport={setShowImport}
                    setImportResult={setImportResult}
                    importing={importing}
                    importResult={importResult}
                    fileInputRef={fileInputRef}
                    handleFileSelect={handleFileSelect}
                    handleDownloadSample={handleDownloadSample}
                />
            )}
        </div>
    );
};


export default ClientsPage;

const CompanyNode = ({ node, onSelect, onEdit, onDelete, selectedId, selectedCompanyIds, toggleSelection, expandedCompanies, toggleExpand, isSearchActive, isSelectDataMode, level = 0 }: any) => {
    const [isHovered, setIsHovered] = useState(false);
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = isSearchActive || expandedCompanies.has(node._id);
    const isSelected = selectedId === node._id;
    const isChecked = selectedCompanyIds.has(node._id);

    return (
        <div style={{ display: "flex", flexDirection: "column" }}>
            <div
                className="company-node-row"
                style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 10px",
                    paddingLeft: level > 0 ? (level * 16) + 10 : 10,
                    cursor: "pointer",
                    borderRadius: 6,
                    background: isSelected ? "var(--color-surface-hover)" : "transparent",
                    marginBottom: 1,
                    position: 'relative'
                }}
                onClick={() => {
                    if (selectedId !== node._id) {
                        onSelect(node);
                    }
                    // Only auto-expand if it's currently collapsed. 
                    // This prevents accidental collapsing when clicking a row to view details.
                    if (hasChildren && !isExpanded) {
                        toggleExpand(node._id);
                    }
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Branching lines for nested items */}
                {level > 0 && (
                    <div style={{
                        position: "absolute",
                        left: (level - 1) * 16 + 12,
                        top: -10,
                        bottom: "50%",
                        width: 12,
                        borderLeft: "1px solid var(--color-border)",
                        borderBottom: "1px solid var(--color-border)",
                        borderBottomLeftRadius: 4,
                        pointerEvents: "none"
                    }} />
                )}

                {hasChildren ? (
                    <button
                        className="expand-button"
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            marginRight: 6,
                            display: "flex",
                            color: "var(--color-text-secondary)",
                            zIndex: 2
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(node._id);
                        }}
                    >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                ) : (
                    <span style={{ width: 20, display: "inline-block" }} />
                )}

                {isSelectDataMode && (
                    <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                            e.stopPropagation();
                            toggleSelection(node._id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginRight: 10, cursor: 'pointer' }}
                    />
                )}

                <Building2 size={16} style={{ marginRight: 8, opacity: 0.7 }} />

                <span style={{
                    flex: 1,
                    fontSize: "0.85rem",
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: isSelected ? 600 : 400
                }}>
                    {node.name}
                </span>

                {/* Actions */}
                <div className="hover-actions" style={{
                    display: isHovered ? 'flex' : 'none',
                    gap: 4,
                    position: 'absolute',
                    right: 8,
                    background: isSelected ? "var(--color-surface-hover)" : "white",
                    padding: '2px',
                    borderRadius: 4,
                    boxShadow: 'var(--shadow-sm)',
                    zIndex: 10
                }}>
                    <button className="btn btn-secondary btn-xs" style={{ padding: 4 }} onClick={(e) => { e.stopPropagation(); onEdit(node); }}>
                        <Edit2 size={12} />
                    </button>
                    <button className="btn btn-secondary btn-xs" style={{ padding: 4, color: 'var(--color-error)' }} onClick={(e) => { e.stopPropagation(); onDelete(node._id); }}>
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {/* Recursively render children */}
            {isExpanded && hasChildren && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    {node.children.map((child: any) => (
                        <CompanyNode
                            key={child._id}
                            node={child}
                            level={level + 1}
                            onSelect={onSelect}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            selectedId={selectedId}
                            selectedCompanyIds={selectedCompanyIds}
                            toggleSelection={toggleSelection}
                            expandedCompanies={expandedCompanies}
                            toggleExpand={toggleExpand}
                            isSearchActive={isSearchActive}
                            isSelectDataMode={isSelectDataMode}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const CompanyDetailView = ({ company, activeTab, setActiveTab, onAddContact, onEditContact, onDeleteContact, assignments, loadingAssignments, onProjectClick }: any) => (
    <div>
        <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <Building2 size={24} />
                        {company.name}
                    </h2>
                    {company.industry && (
                        <p style={{ opacity: 0.7, fontSize: "0.9rem" }}>
                            {company.industry}
                        </p>
                    )}
                </div>
                <span className="badge" style={{
                    background: company.status === "active" ? "#22c55e22" : "#ef444422",
                    color: company.status === "active" ? "#22c55e" : "#ef4444",
                    padding: "4px 12px",
                    borderRadius: 20,
                    fontSize: "0.8rem",
                    fontWeight: 500
                }}>
                    {company.status}
                </span>
            </div>

            {(company.description || company.website || company.email || company.phone) && (
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
                    {/* {company.description && (
                        <div style={{ opacity: 0.8, fontSize: "0.9rem" }}>
                            <span style={{ fontWeight: 500 }}>Description: </span>
                            {company.description}
                        </div>
                    )} */}
                    {company.website && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.8, fontSize: "0.9rem" }}>
                            <Globe size={16} />
                            <a href={company.website} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                                {company.website.replace(/^https?:\/\//, "")}
                            </a>
                        </div>
                    )}
                    {company.email && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.8, fontSize: "0.9rem" }}>
                            <Mail size={16} />
                            <a href={`mailto:${company.email}`} style={{ color: "inherit" }}>
                                {company.email}
                            </a>
                        </div>
                    )}
                    {company.phone && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.8, fontSize: "0.9rem" }}>
                            <Phone size={16} />
                            {(company.phoneCountryCode || "") + " " + company.phone}
                        </div>
                    )}
                </div>
            )}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--color-border)", paddingBottom: "24px" }}>
            <button
                className={`btn btn-sm ${activeTab === "details" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("details")}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
                <Building2 size={16} />Info
            </button>
            <button
                className={`btn btn-sm ${activeTab === "contacts" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("contacts")}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
                <Users size={16} />Contacts
                {company.contacts?.length > 0 && (
                    <span style={{ background: "var(--color-border)", padding: "2px 8px", borderRadius: 10, fontSize: "0.75rem" }}>
                        {company.contacts.length}
                    </span>
                )}
            </button>
            <button
                className={`btn btn-sm ${activeTab === "projects" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("projects")}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
                <FolderKanban size={16} />Projects
            </button>
        </div>

        {activeTab === "details" && (
            <div>
                {company.description && (
                    <div className="mb-3" style={{ opacity: 0.8, fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                        <span style={{ fontWeight: 500 }}>Description: </span>
                        {company.description}
                    </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", marginBottom: "1.5rem", opacity: 0.8, fontSize: "0.85rem" }}>
                    {company.email && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Mail size={16} color="var(--color-primary)" />
                            <span style={{ fontWeight: 500 }}>Email:</span> {company.email}
                        </div>
                    )}
                    {company.phone && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Phone size={16} color="var(--color-primary)" />
                            <span style={{ fontWeight: 500 }}>Phone:</span> {(company.phoneCountryCode || "") + " " + company.phone}
                        </div>
                    )}
                    {company.website && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Building2 size={16} color="var(--color-primary)" />
                            <span style={{ fontWeight: 500 }}>Website:</span> {company.website}
                        </div>
                    )}
                </div>
                {/* {company.childCompanies && company.childCompanies.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                            <ChevronRight size={16} />Subsidiary Companies ({company.childCompanies.length})
                        </h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {company.childCompanies.map((child: Company, idx: number) => {
                                const isLast = idx === company.childCompanies.length - 1;
                                return (
                                    <div key={child._id} style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                        {/* Vertical & Horizontal Branching Line 
                                        <div style={{
                                            position: "absolute",
                                            left: 0,
                                            top: 0,
                                            bottom: isLast ? "50%" : "-4px",
                                            borderLeft: "2px solid var(--color-border)",
                                            borderBottom: isLast ? "2px solid var(--color-border)" : "none",
                                            borderBottomLeftRadius: isLast ? "8px" : "0",
                                            width: isLast ? "20px" : "0"
                                        }} />
                                        {!isLast && (
                                            <div style={{
                                                position: "absolute",
                                                left: 0,
                                                top: "50%",
                                                width: "20px",
                                                borderTop: "2px solid var(--color-border)",
                                            }} />
                                        )}
                                        <div className="card" style={{ padding: "10px 14px", fontSize: "0.9rem", marginLeft: "24px", flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                                            <Building2 size={16} style={{ marginRight: 6, opacity: 0.7 }} />
                                            <span style={{ flex: 1 }}>{child.name}</span>
                                            {child.industry && <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>{child.industry}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )} */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
                    <div className="card" style={{ padding: 16, textAlign: "center" }}>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                            {company.contacts?.length || 0}
                        </div>
                        <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>Contacts</div>
                    </div>
                    <div className="card" style={{ padding: 16, textAlign: "center" }}>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                            {company.childCompanies?.length || 0}
                        </div>
                        <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>Subsidiaries</div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === "contacts" && (
            <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 600 }}>Contact Persons</h4>
                    <button className="btn btn-primary btn-sm" onClick={onAddContact} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Plus size={16} />Add Contact
                    </button>
                </div>

                {company.contacts && company.contacts.length > 0 ? (
                    <div style={{ display: "grid", gap: 10 }}>
                        {[...(company.contacts || [])].sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1)).map((contact: Contact) => (
                            <div key={contact._id} className="card" style={{
                                padding: 14,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                borderLeft: contact.isPrimary ? "3px solid var(--color-primary)" : "3px solid transparent"
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600 }}>{contact.name}</span>
                                        {contact.isPrimary && (
                                            <span style={{ fontSize: "0.7rem", background: "var(--color-primary)", color: "white", padding: "2px 6px", borderRadius: 4 }}>
                                                Primary
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: "0.85rem", opacity: 0.8, display: "flex", flexWrap: "wrap", gap: 12 }}>
                                        {contact.position && <span>{contact.position}</span>}
                                        {contact.position && contact.department && <span>|</span>}
                                        {contact.department && <span>{contact.department}</span>}
                                    </div>
                                    <div style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: 6, display: "flex", flexWrap: "wrap", gap: 12 }}>
                                        {contact.email && (
                                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                <Mail size={12} />{contact.email}
                                            </span>
                                        )}
                                        {contact.phone && (
                                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                <Phone size={12} />{(contact.phoneCountryCode || "") + " " + contact.phone}
                                            </span>
                                        )}
                                    </div>
                                    {contact.notes && (
                                        <p style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: 8, fontStyle: "italic" }}>
                                            {contact.notes}
                                        </p>
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button className="btn btn-secondary btn-xs" onClick={() => onEditContact(contact)} style={{ padding: "4px 8px" }}>
                                        <Edit2 size={12} />
                                    </button>
                                    <button className="btn btn-secondary btn-xs" onClick={() => onDeleteContact(contact._id)} style={{ padding: "4px 8px", color: "#ef4444" }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: "center", padding: 40, opacity: 0.6 }}>
                        <Users size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <p>No contacts yet</p>
                        <button className="btn btn-primary btn-sm" onClick={onAddContact} style={{ marginTop: 12 }}>
                            Add your first contact
                        </button>
                    </div>
                )}
            </div>
        )}


        {activeTab === "projects" && (
            <div>
                {loadingAssignments ? (
                    <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>Loading projects...</div>
                ) : assignments.length > 0 ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                        {assignments.map((a: any) => (
                            <div key={a._id} className="card" style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={() => onProjectClick(a._id)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                            <span style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{a.title}</span>
                                            {a.isRecurring && <span className="badge" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontSize: '0.65rem' }}>Recurring</span>}
                                            <span style={{
                                                fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase',
                                                background: a.priority === 'urgent' ? '#fee2e2' : a.priority === 'high' ? '#fff7ed' : '#f0f9ff',
                                                color: a.priority === 'urgent' ? '#ef4444' : a.priority === 'high' ? '#f97316' : '#0ea5e9'
                                            }}>
                                                {a.priority}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                            {a.dueDate && new Date(a.dueDate).getFullYear() > 1970
                                                ? `Due ${new Date(a.dueDate).toLocaleDateString()}`
                                                : 'No due date'} · Status: <span style={{ textTransform: 'capitalize' }}>{a.status.replace('_', ' ')}</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} style={{ opacity: 0.3 }} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
                        <FolderKanban size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <p>No projects found for this company</p>
                    </div>
                )}
            </div>
        )}
    </div>
);

const CreateCompanyModal = ({
    setShowCreate, companies, companyForm, setCompanyForm, handleCreate, resetForm, isEditing }: any) => {

    // Filter to only show parent/root companies (those with no parentCompanyId)
    const parentCompanies = companies.filter((c: Company) => !c.parentCompanyId);

    const phoneRules: Record<string, { min: number; max: number }> = {
        "+91": { min: 10, max: 10 }, // India
        "+1": { min: 10, max: 10 },  // US
        "+44": { min: 10, max: 10 }, // UK
        "+61": { min: 9, max: 9 },   // Australia
        "+971": { min: 9, max: 9 },  // UAE
        "+65": { min: 8, max: 8 },   // Singapore
        "+33": { min: 9, max: 9 },   // France
        "+81": { min: 10, max: 10 }, // Japan
        "+49": { min: 10, max: 12 }, // Germany (variable)
    };

    const rule =
        phoneRules[companyForm.phoneCountryCode] || { min: 6, max: 15 };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const digitsOnly = e.target.value
            .replace(/\D/g, "")
            .slice(0, rule.max);

        setCompanyForm({
            ...companyForm,
            phone: digitsOnly,
        });
    };

    const handleCompanyTypeChange = (type: "parent" | "child") => {
        setCompanyForm({
            ...companyForm,
            companyType: type,
            // Clear parentCompanyId when switching to parent type
            parentCompanyId: type === "parent" ? "" : companyForm.parentCompanyId,
        });
    };

    return (
        <Modal isOpen={true} onClose={() => { setShowCreate(false); resetForm(); }} zIndex={1000}>
            <div
                className="card animate-fade-in"
                style={{
                    padding: 0,
                    width: '100%',
                    maxWidth: "650px",
                    maxHeight: "90vh",
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--color-surface)'
                }}>
                    <div>
                        <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: 'var(--color-text)' }}>
                            {isEditing ? 'Edit Company' : 'Create New Company'}
                        </h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                            {isEditing ? 'Update your company details' : 'Add a new company to your network'}
                        </p>
                    </div>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setShowCreate(false); resetForm(); }}
                        style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <form
                    onSubmit={handleCreate}
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: '24px',
                        display: "flex",
                        flexDirection: "column",
                        gap: '24px'
                    }}
                >
                    {/* Section: Company Type */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <label style={{ fontSize: "0.875rem", fontWeight: 600, color: 'var(--color-text)' }}>
                            Select Company Type
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={() => handleCompanyTypeChange("parent")}
                                style={{
                                    padding: "16px",
                                    borderRadius: '12px',
                                    border: companyForm.companyType === "parent"
                                        ? "2px solid var(--color-primary)"
                                        : "1px solid var(--color-border)",
                                    background: companyForm.companyType === "parent"
                                        ? "var(--color-primary-light)"
                                        : "var(--color-surface)",
                                    cursor: "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: "8px",
                                    transition: "all 0.2s ease",
                                    textAlign: 'center'
                                }}
                            >
                                <Building2 size={24} style={{ color: companyForm.companyType === "parent" ? "var(--color-primary)" : "var(--color-text-tertiary)" }} />
                                <div>
                                    <span style={{ fontSize: "0.9375rem", fontWeight: 600, display: 'block' }}>Parent Company</span>
                                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Top-level organization</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleCompanyTypeChange("child")}
                                style={{
                                    padding: "16px",
                                    borderRadius: '12px',
                                    border: companyForm.companyType === "child"
                                        ? "2px solid var(--color-primary)"
                                        : "1px solid var(--color-border)",
                                    background: companyForm.companyType === "child"
                                        ? "var(--color-primary-light)"
                                        : "var(--color-surface)",
                                    cursor: "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: "8px",
                                    transition: "all 0.2s ease",
                                    textAlign: 'center'
                                }}
                            >
                                <Building size={24} style={{ color: companyForm.companyType === "child" ? "var(--color-primary)" : "var(--color-text-tertiary)" }} />
                                <div>
                                    <span style={{ fontSize: "0.9375rem", fontWeight: 600, display: 'block' }}>Child Company</span>
                                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Subsidiary of another</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Section: Basic Info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '24px', height: '2px', background: 'var(--color-primary)' }}></div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.05em' }}>General Information</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>Company Name *</label>
                                <input
                                    className="input"
                                    placeholder="Enter company name"
                                    required
                                    value={companyForm.name}
                                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                                />
                            </div>

                            {companyForm.companyType === "child" && (
                                <div className="animate-fade-in">
                                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>
                                        Select Parent Company *
                                    </label>
                                    <select
                                        className="select"
                                        value={companyForm.parentCompanyId}
                                        onChange={(e) => setCompanyForm({ ...companyForm, parentCompanyId: e.target.value })}
                                        required
                                    >
                                        <option value="">Choose a parent company</option>
                                        {parentCompanies.map((c: Company) => (
                                            <option key={c._id} value={c._id}>{c.name}</option>
                                        ))}
                                    </select>
                                    {parentCompanies.length === 0 && (
                                        <p style={{ fontSize: "0.75rem", color: "var(--color-danger)", marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <X size={12} /> No parent companies found.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div>
                                <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>Industry</label>
                                <input
                                    className="input"
                                    placeholder="e.g., Technology, Healthcare"
                                    value={companyForm.industry}
                                    onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>Description</label>
                            <textarea
                                className="input"
                                placeholder="Tell us about the company..."
                                value={companyForm.description}
                                onChange={(e) => setCompanyForm({ ...companyForm, description: e.target.value })}
                                style={{ minHeight: '80px', resize: 'vertical' }}
                            />
                        </div>
                    </div>

                    {/* Section: Contact Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '24px', height: '2px', background: 'var(--color-primary)' }}></div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.05em' }}>Contact Details</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>Company Email</label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
                                    <input
                                        className="input"
                                        type="email"
                                        placeholder="email@example.com"
                                        value={companyForm.email}
                                        onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                                        style={{ paddingLeft: '40px' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    style={{
                                        fontSize: "0.8125rem",
                                        fontWeight: 500,
                                        marginBottom: "6px",
                                        display: "block",
                                        color: "var(--color-text-secondary)",
                                    }}
                                >
                                    Phone Number
                                </label>

                                <div style={{ display: "flex", gap: "8px" }}>
                                    <select
                                        className="select"
                                        value={companyForm.phoneCountryCode || "+91"}
                                        onChange={(e) =>
                                            setCompanyForm({
                                                ...companyForm,
                                                phoneCountryCode: e.target.value,
                                                phone: "", // reset phone when country changes
                                            })
                                        }
                                        style={{
                                            width: "100px",
                                            flexShrink: 0,
                                            paddingLeft: "8px",
                                            paddingRight: "24px",
                                        }}
                                    >
                                        <option value="+91">🇮🇳 +91</option>
                                        <option value="+1">🇺🇸 +1</option>
                                        <option value="+44">🇬🇧 +44</option>
                                        <option value="+61">🇦🇺 +61</option>
                                        <option value="+971">🇦🇪 +971</option>
                                        <option value="+65">🇸🇬 +65</option>
                                        <option value="+33">🇫🇷 +33</option>
                                        <option value="+81">🇯🇵 +81</option>
                                        <option value="+49">🇩🇪 +49</option>
                                    </select>

                                    <input
                                        className="input"
                                        placeholder="Phone"
                                        value={companyForm.phone || ""}
                                        maxLength={rule.max}
                                        onChange={handlePhoneChange}
                                        style={{ flex: 1 }}
                                    />
                                </div>

                                {/* Validation Message */}
                                {companyForm.phone && companyForm.phone.length < rule.max && (
                                    <p
                                        style={{
                                            fontSize: "0.75rem",
                                            color: "var(--color-danger)",
                                            marginTop: "4px",
                                        }}
                                    >
                                        {rule.max - companyForm.phone.length} digits remaining
                                    </p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>Website</label>
                            <div style={{ position: 'relative' }}>
                                <Globe size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
                                <input
                                    className="input"
                                    placeholder="https://www.example.com"
                                    value={companyForm.website}
                                    onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                                    style={{ paddingLeft: '40px' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section: Address */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '24px', height: '2px', background: 'var(--color-primary)' }}></div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.05em' }}>Address Info</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>Street Address</label>
                                <input
                                    className="input"
                                    placeholder="Street, Building, etc."
                                    value={companyForm.address.street}
                                    onChange={(e) => setCompanyForm({ ...companyForm, address: { ...companyForm.address, street: e.target.value } })}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>City</label>
                                    <input
                                        className="input"
                                        placeholder="City"
                                        value={companyForm.address.city}
                                        onChange={(e) => setCompanyForm({ ...companyForm, address: { ...companyForm.address, city: e.target.value } })}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>State / Province</label>
                                    <input
                                        className="input"
                                        placeholder="State"
                                        value={companyForm.address.state}
                                        onChange={(e) => setCompanyForm({ ...companyForm, address: { ...companyForm.address, state: e.target.value } })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>Postal Code</label>
                                    <input
                                        className="input"
                                        placeholder="ZIP / Postal Code"
                                        value={companyForm.address.postalCode}
                                        onChange={(e) => setCompanyForm({ ...companyForm, address: { ...companyForm.address, postalCode: e.target.value } })}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: '6px', display: "block", color: 'var(--color-text-secondary)' }}>Country</label>
                                    <input
                                        className="input"
                                        placeholder="Country"
                                        value={companyForm.address.country}
                                        onChange={(e) => setCompanyForm({ ...companyForm, address: { ...companyForm.address, country: e.target.value } })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid var(--color-border)',
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: '12px',
                    background: 'var(--color-surface)'
                }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => { setShowCreate(false); resetForm(); }}
                        style={{ padding: '10px 20px' }}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        onClick={(e) => {
                            e.preventDefault();
                            handleCreate(e as any);
                        }}
                        style={{ padding: '10px 24px', boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.4)' }}
                    >
                        {isEditing ? 'Update Company' : 'Create Company'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

const ContactModal = ({ 
    setShowContactForm, editingContact, contactForm, setContactForm, handleSave }: any) => (
    <Modal isOpen={true} onClose={() => setShowContactForm(false)} zIndex={1000}>
        <div className="card" style={{ padding: 24, width: 550 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 600 }}>{editingContact ? "Edit Contact" : "Add Contact"}</h3>
                <button className="btn btn-secondary btn-xs" onClick={() => setShowContactForm(false)}>
                    <X size={16} />
                </button>
            </div>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: 4, display: "block" }}>Name *</label>
                    <input
                        className="input"
                        placeholder="Contact name"
                        required
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                        <label style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: 4, display: "block" }}>Email</label>
                        <input
                            className="input"
                            type="email"
                            placeholder="email@example.com"
                            value={contactForm.email}
                            onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: 4, display: "block" }}>Phone</label>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <select
                                className="select"
                                value={contactForm.phoneCountryCode || "+91"}
                                onChange={(e) => setContactForm({ ...contactForm, phoneCountryCode: e.target.value })}
                                style={{ width: "80px", flexShrink: 0, padding: "4px 8px", fontSize: "0.85rem" }}
                            >
                                <option value="+91">+91</option>
                                <option value="+1">+1</option>
                                <option value="+44">+44</option>
                                <option value="+61">+61</option>
                                <option value="+971">+971</option>
                                <option value="+65">+65</option>
                                <option value="+33">+33</option>
                                <option value="+81">+81</option>
                                <option value="+49">+49</option>
                            </select>
                            <input
                                className="input"
                                placeholder="Phone number"
                                value={contactForm.phone}
                                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value.replace(/\D/g, "") })}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                        <label style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: 4, display: "block" }}>Position</label>
                        <input
                            className="input"
                            placeholder="e.g., Manager"
                            value={contactForm.position}
                            onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: 4, display: "block" }}>Department</label>
                        <input
                            className="input"
                            placeholder="e.g., Sales"
                            value={contactForm.department}
                            onChange={(e) => setContactForm({ ...contactForm, department: e.target.value })}
                        />
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                        type="checkbox"
                        id="isPrimary"
                        checked={contactForm.isPrimary}
                        onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                    />
                    <label htmlFor="isPrimary" style={{ fontSize: "0.9rem" }}>Primary Contact</label>
                </div>

                <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: 4, display: "block" }}>Notes</label>
                    <textarea
                        className="input"
                        placeholder="Additional notes"
                        rows={3}
                        value={contactForm.notes}
                        onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                    />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowContactForm(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">{editingContact ? "Update" : "Add"} Contact</button>
                </div>
            </form>
        </div>
    </Modal>
);

const ImportModal = ({
    // showImport,
    setShowImport, setImportResult, importing, importResult, fileInputRef, handleFileSelect, handleDownloadSample }: any) => {
    const handleDropzoneClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <Modal isOpen={true} onClose={() => { setShowImport(false); setImportResult(null); }} zIndex={1000}>
            <div className="card" style={{ padding: 24, width: 500 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 600 }}>Import Companies</h3>
                    <button className="btn btn-secondary btn-xs" onClick={() => { setShowImport(false); setImportResult(null); }}>
                        <X size={16} />
                    </button>
                </div>

                {!importResult ? (
                    <>
                        <div
                            style={{ border: "2px dashed var(--color-border)", borderRadius: 8, padding: 32, textAlign: "center", marginBottom: 16, cursor: 'pointer' }}
                            onClick={handleDropzoneClick}
                        >
                            <Upload size={48} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                            <p style={{ fontWeight: 500, marginBottom: 4 }}>{importing ? 'Importing...' : 'Click to select Excel file'}</p>
                            <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Supports .xlsx and .xls formats</p>
                            <button
                                type="button"
                                className="btn btn-link btn-xs"
                                style={{ marginTop: 12, color: 'var(--color-primary)', textDecoration: 'underline' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadSample();
                                }}
                            >
                                <Download size={16} style={{ marginRight: 4 }} /> Download Sample Format
                            </button>
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            disabled={importing}
                        />

                        <div style={{ background: "var(--color-surface-hover)", padding: 16, borderRadius: 8, marginBottom: 16 }}>
                            <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>Import Instructions:</h4>
                            <ul style={{ fontSize: "0.8rem", opacity: 0.8, paddingLeft: 18, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <li>The first row of your Excel file must be the <b>Header Row</b>.</li>
                                <li><b>Company Name</b> is the only mandatory field for creates.</li>
                                <li>If a company name exists, it will be <b>updated</b> with the new info.</li>
                                <li>"Is Primary" supports values like: <i>True, Yes, 1</i>.</li>
                            </ul>

                            <h4 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 8, color: 'var(--color-primary)' }}>Supported Column Headers:</h4>
                            <div style={{ fontSize: "0.75rem", opacity: 0.7, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                                <span>• Company Name *</span>
                                <span>• Parent Company</span>
                                <span>• Industry</span>
                                <span>• Description</span>
                                <span>• Website</span>
                                <span>• Company Email</span>
                                <span>• Company Phone</span>
                                <span>• Street / City / State</span>
                                <span>• Country / Postal Code</span>
                                <span>• Status (Active/Inactive)</span>
                                <span>• Contact Name</span>
                                <span>• Contact Email</span>
                                <span>• Contact Phone</span>
                                <span>• Position / Designation</span>
                                <span>• Department</span>
                                <span>• Is Primary (Yes/No)</span>
                                <span>• Notes</span>
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button type="button" className="btn btn-secondary" onClick={() => { setShowImport(false); setImportResult(null); }}>
                                Cancel
                            </button>
                        </div>
                    </>
                ) : (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                                <div style={{ flex: 1, padding: 12, background: "#22c55e22", borderRadius: 6, textAlign: "center" }}>
                                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>{importResult.created}</div>
                                    <div style={{ fontSize: "0.85rem", color: "#22c55e" }}>Created</div>
                                </div>
                                <div style={{ flex: 1, padding: 12, background: "#3b82f622", borderRadius: 6, textAlign: "center" }}>
                                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#3b82f6" }}>{importResult.updated}</div>
                                    <div style={{ fontSize: "0.85rem", color: "#3b82f6" }}>Updated</div>
                                </div>
                            </div>
                        </div>

                        {importResult.errors && importResult.errors.length > 0 && (
                            <div style={{ marginBottom: 16, maxHeight: 200, overflowY: "auto", background: "#ef444411", padding: 12, borderRadius: 6 }}>
                                <h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#ef4444", marginBottom: 8 }}>Errors ({importResult.errors.length})</h4>
                                <ul style={{ fontSize: "0.8rem", margin: 0, paddingLeft: 16 }}>
                                    {importResult.errors.map((err: string, idx: number) => (
                                        <li key={idx} style={{ marginBottom: 4 }}>{err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button type="button" className="btn btn-secondary" onClick={() => { setShowImport(false); setImportResult(null); }}>
                                Close
                            </button>
                            <button type="button" className="btn btn-primary" onClick={() => { setShowImport(false); setImportResult(null); }}>
                                Import Another File
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};