import React, { useState, useEffect } from "react";
import api from '@/lib/api';
import {
    Mail,
    // Building2,
    Search, X, CheckCircle2, AlertCircle, Users
} from "lucide-react";

import { useQuery } from '@tanstack/react-query';

interface Company {
    _id: string;
    name: string;
    email?: string;
    industry?: string;
    status: string;
}

const BulkEmailPage: React.FC = () => {
    const { data: companiesData, isLoading: loading } = useQuery({
        queryKey: ['companies'],
        queryFn: async () => {
            const { data } = await api.get("/companies");
            return data.companies || [];
        },
        staleTime: Infinity,
    });

    const companies = React.useMemo(() => {
        const allCompanies: Company[] = [];
        const flatten = (list: any[]) => {
            list.forEach(c => {
                allCompanies.push(c);
                if (c.children && c.children.length > 0) {
                    flatten(c.children);
                }
            });
        };
        flatten(companiesData || []);
        return allCompanies;
    }, [companiesData]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const filteredCompanies = companies.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.industry && c.industry.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredCompanies.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredCompanies.map(c => c._id)));
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedIds.size === 0) return;

        setSending(true);
        setResult(null);
        try {
            const { data } = await api.post("/companies/bulk-email", {
                companyIds: Array.from(selectedIds),
                subject,
                message
            });
            setResult({ success: true, message: data.message });
            setSelectedIds(new Set());
            setSubject("");
            setMessage("");
        } catch (e: any) {
            setResult({
                success: false,
                message: e.response?.data?.message || "Failed to send emails. Please check your SMTP settings."
            });
        } finally {
            setSending(false);
        }
    };

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div style={{
            height: isMobile ? 'auto' : "calc(100vh - 120px)",
            minHeight: isMobile ? 'calc(100vh - 160px)' : 0,
            display: "flex",
            flexDirection: "column",
            gap: isMobile ? 16 : 24,
        }}>
            <div style={{ display: "flex", flexDirection: isMobile ? 'column' : 'row', justifyContent: "space-between", alignItems: isMobile ? 'flex-start' : 'center', flexShrink: 0, gap: isMobile ? 12 : 0 }}>
                <div>
                    <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700, marginBottom: 4 }}>Bulk Email Messaging</h1>
                    <p style={{ opacity: 0.7, fontSize: isMobile ? '0.8rem' : undefined }}>Send broadcast messages to selected company emails</p>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                    <div className="card" style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, background: "var(--color-primary-light)", border: "none" }}>
                        <Users size={18} color="var(--color-primary)" />
                        <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{selectedIds.size} Selected</span>
                    </div>
                </div>
            </div>

            {result && (
                <div style={{
                    padding: 16,
                    borderRadius: 8,
                    background: result.success ? "#dcfce7" : "#fee2e2",
                    color: result.success ? "#166534" : "#991b1b",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    border: `1px solid ${result.success ? "#bbf7d0" : "#fecaca"}`,
                    flexShrink: 0
                }}>
                    {result.success ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    <span style={{ flex: 1, fontSize: "0.9rem" }}>{result.message}</span>
                    <button onClick={() => setResult(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
                        <X size={16} />
                    </button>
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 24, flex: 1, minHeight: 0 }}>
                {/* Left Side: Company Selection */}
                <div className="card" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", minHeight: 0, height: isMobile ? '380px' : 'auto' }}>
                    <div style={{ padding: 16, borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
                        <div style={{ position: "relative", marginBottom: 12 }}>
                            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
                            <input
                                className="input"
                                placeholder="Search by name or industry..."
                                style={{ paddingLeft: 40 }}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>{filteredCompanies.length} companies found</span>
                            <button
                                className="btn btn-link btn-xs"
                                onClick={toggleSelectAll}
                                style={{ color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}
                            >
                                {selectedIds.size === filteredCompanies.length ? "Deselect All" : "Select All Visible"}
                            </button>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
                        {loading ? (
                            <div style={{ padding: 40, textAlign: "center", opacity: 0.5 }} className="flex flex-col items-center justify-center gap-3" >
                                <span className="border-t border-(--primary) h-5 w-5 rounded-full animate-spin" ></span>
                                Loading companies...</div>
                        ) : filteredCompanies.length === 0 ? (
                            <div style={{ padding: 40, textAlign: "center", opacity: 0.5 }}>No companies found</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {filteredCompanies.map(c => (
                                    <div
                                        key={c._id}
                                        onClick={() => toggleSelect(c._id)}
                                        style={{
                                            padding: "10px 12px",
                                            borderRadius: 8,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 12,
                                            cursor: "pointer",
                                            background: selectedIds.has(c._id) ? "var(--color-primary-light)" : "transparent",
                                            transition: "background 0.2s"
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(c._id)}
                                            onChange={() => { }} // toggled by parent div
                                            style={{ cursor: "pointer" }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{c.name}</div>
                                            <div style={{ fontSize: "0.75rem", opacity: 0.6, display: "flex", gap: 8 }}>
                                                {c.email ? <span>{c.email}</span> : <span style={{ color: "#ef4444" }}>No Email</span>}
                                                {c.industry && <span>• {c.industry}</span>}
                                            </div>
                                        </div>
                                        {c.status === "active" ? (
                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                                        ) : (
                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side: Message Composer */}
                <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", minHeight: 0 }}>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <Mail size={20} color="var(--color-primary)" />
                        Compose Message
                    </h3>

                    <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, minHeight: 0 }}>
                        <div style={{ flexShrink: 0 }}>
                            <label style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 8, display: "block" }}>Subject Line</label>
                            <input
                                className="input"
                                placeholder="e.g. Important Update for Our Partners"
                                required
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                            />
                        </div>

                        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                            <label style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 8, display: "block" }}>Email Body</label>
                            <textarea
                                className="input"
                                placeholder="Dear Team,&#10;&#10;We wanted to reach out regarding..."
                                required
                                style={{ flex: 1, resize: "none", padding: 16, lineHeight: 1.6, minHeight: isMobile ? '240px' : 'auto' }}
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                            />
                        </div>

                        <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, fontSize: "0.8rem", color: "#64748b", flexShrink: 0 }}>
                            <strong>Privacy Note:</strong> This message will be sent via BCC. Companies will not see other recipients.
                            Only companies with a valid email address will receive the message.
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={sending || selectedIds.size === 0}
                            style={{ height: 48, fontSize: "1rem", flexShrink: 0 }}
                        >
                            {sending ? "Sending..." : `Send Email to ${selectedIds.size} Companies`}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default BulkEmailPage;
