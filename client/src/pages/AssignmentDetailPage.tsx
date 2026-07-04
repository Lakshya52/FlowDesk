/// <reference types="react" />
/// <reference types="react-dom" />
import * as React from 'react';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Avatar from '../components/common/Avatar';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, Plus, Paperclip, MessageSquare, Upload, Download, Trash2, Send, Users, Edit3, FolderKanban, RefreshCw, Eye, Loader2, Reply, Edit2, Calendar, Briefcase, Clock } from 'lucide-react';
import { format } from 'date-fns';
import ProjectCanvas from '../components/assignments/ProjectCanvas';
import FilePreviewModal from '../components/common/FilePreviewModal';
import Modal from '../components/common/Modal';

const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const STATUS_LABELS: Record<string, string> = { not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed', delayed: 'Delayed' };
const TASK_STATUS_LABELS: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', completed: 'Completed' };

const AssignmentDetailPage = (): React.JSX.Element | null => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const isManager = user?.role === 'manager';
    const isEmployee = user?.role === 'member';
    const canEdit = true; // Stay democratized: anyone who can see it can edit it
    const [assignment, setAssignment] = useState<any>(null);
    const [tasks, setTasks] = useState<any[]>([]);
    const [comments, setComments] = useState<any[]>([]);
    const [files, setFiles] = useState<any[]>([]);
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'tasks' | 'files' | 'chat' | 'notes'>('tasks');
    // const [comment, setComment] = useState('');
    const [chatInput, setChatInput] = useState('');
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [taskForm, setTaskForm] = useState({ title: '', description: '', assignedTo: '', dueDate: '', priority: 'medium', noDueDate: false });
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [updatingTeam, setUpdatingTeam] = useState(false);
    const [editingTask, setEditingTask] = useState<string | null>(null);
    const [editTaskForm, setEditTaskForm] = useState<any>({});
    const [stagedFiles, setStagedFiles] = useState<any[]>([]);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatFileRef = useRef<HTMLInputElement>(null);
    const whiteboardRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<any>(null);
    const [typingUsers, setTypingUsers] = useState<any>({});
    const typingTimeoutRef = useRef<any>(null);
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
    const [selectedMentions, setSelectedMentions] = useState<Set<string>>(new Set());
    const [replyTo, setReplyTo] = useState<any>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [canvasUnlocked, setCanvasUnlocked] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ url: string, type: string, name: string } | null>(null);

    // Auto-switch tabs and scroll based on URL params
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (tab === 'chat' || tab === 'tasks' || tab === 'files' || tab === 'notes') {
            setActiveTab(tab as any);
        }
    }, [location.search]);

    useEffect(() => {
        if (activeTab === 'notes') {
            setTimeout(() => {
                whiteboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [activeTab]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const msgId = params.get('msgId');
        const taskId = params.get('taskId');

        if (activeTab === 'chat' && msgId && chatMessages.length > 0) {
            // Need a slight delay to ensure elements are mounted
            setTimeout(() => {
                scrollToOriginalMessage(msgId);
                navigate(`/assignments/${id}?tab=chat`, { replace: true });
            }, 500);
        } else if (activeTab === 'tasks' && taskId && tasks.length > 0) {
            setTimeout(() => {
                const el = document.getElementById(`task-${taskId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.transition = 'all 0.5s ease';
                    el.style.backgroundColor = 'var(--color-primary-light)';
                    el.style.transform = 'scale(1.02)';
                    el.style.boxShadow = '0 10px 25px rgba(0,0,0,0.1)';

                    setTimeout(() => {
                        el.style.backgroundColor = '';
                        el.style.transform = '';
                        el.style.boxShadow = '';
                    }, 2000);

                    navigate(`/assignments/${id}?tab=tasks`, { replace: true });
                }
            }, 500);
        }
    }, [location.search, activeTab, chatMessages.length, tasks.length, id]);

    const assignmentMembers = React.useMemo(() => {
        if (!assignment) return [];
        const individualMembers = assignment.team || [];
        const teamManagers = (assignment.teams || []).map((t: any) => t.manager).filter(Boolean);
        const teamMembers = (assignment.teams || []).flatMap((t: any) => t.members || []);

        // Combine all members and deduplicate by _id
        const all = [...individualMembers, ...teamManagers, ...teamMembers];
        const unique = Array.from(new Map(all.map(u => [u?._id, u])).values()).filter(Boolean);
        return unique;
    }, [assignment]);

    const filteredMentionUsers = React.useMemo(() => {
        return assignmentMembers.filter((u: any) => u.name.toLowerCase().includes(mentionQuery.toLowerCase()));
    }, [assignmentMembers, mentionQuery]);

    useEffect(() => {
        setMentionIndex(0);
    }, [mentionQuery, showMentionDropdown]);

    const handleMentionSelect = (u: any) => {
        const lastAtIndex = chatInput.lastIndexOf('@');
        const beforeMention = chatInput.substring(0, lastAtIndex);
        const afterMention = chatInput.substring(lastAtIndex + mentionQuery.length + 1);
        const newVal = beforeMention + `@${u.name} ` + afterMention;
        setChatInput(newVal);
        setSelectedMentions(prev => new Set(prev).add(u._id));
        setShowMentionDropdown(false);
    };

    const scrollToOriginalMessage = (parentId: string) => {
        const el = document.getElementById(`chat-msg-${parentId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Double blink effect for the entire message row just like WhatsApp
            el.style.transition = 'background-color 0.4s ease';

            const blink = () => {
                el.style.backgroundColor = 'var(--color-chat-highlight)';
                setTimeout(() => {
                    el.style.backgroundColor = 'transparent';
                }, 150);
            };

            blink();
            setTimeout(blink, 400); // for twice blinking effect
        }
    };

    // const canEdit = true; // Everyone can edit and manage tasks
    const [isEditingProject, setIsEditingProject] = useState(false);
    const [editProjectForm, setEditProjectForm] = useState({
        title: '',
        description: '',
        priority: '',
        startDate: '',
        dueDate: '',
        noDueDate: false,
        clientName: '',
        companyId: '',
        isRecurring: false,
        recurringPattern: 'monthly',
        recurringStartDate: ''
    });
    const [allCompanies, setAllCompanies] = useState<any[]>([]);
    const [companySearch, setCompanySearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

    const filteredCompanies = allCompanies.filter(c =>
        c.name.toLowerCase().includes(companySearch.toLowerCase())
    );

    const getFileIcon = (type: string) => {
        if (type.startsWith('image/')) return '🖼️';
        if (type === 'application/pdf') return '📄';
        if (type.includes('spreadsheet') || type.includes('excel')) return '📊';
        if (type.includes('word') || type.includes('document')) return '📝';
        return '📎';
    };


    const getDueDateColor = (dueDate: string | null) => {
        if (!dueDate || new Date(dueDate).getFullYear() <= 1970) return 'var(--color-text-tertiary)';
        const due = new Date(dueDate);
        const now = new Date();
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return '#ef4444';
        if (diffDays <= 2) return '#f59e0b';
        return 'var(--color-text-secondary)';
    };

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [aRes, tRes, cRes, fRes, uRes, chatRes] = await Promise.all([
                    api.get(`/assignments/${id}`),
                    api.get(`/tasks?assignment=${id}`),
                    api.get(`/comments?assignmentId=${id}`),
                    api.get(`/files?assignmentId=${id}`),
                    api.get('/auth/users?all=true'),
                    api.get(`/chat?assignmentId=${id}`),
                ]);
                setAssignment(aRes.data.assignment);
                setTasks(tRes.data.tasks || []);
                setComments(cRes.data.comments || []);
                setFiles(fRes.data.attachments || []);
                setUsers(uRes.data.users || []);
                setChatMessages(chatRes.data.messages || []);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        fetchAll();

        // Socket connection
        const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
        const socket = io(socketUrl);
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Socket connected successfully with ID:', socket.id);
            socket.emit('join_assignment', id);
        });

        socket.on('connect_error', (err: any) => {
            console.error('❌ Socket connection error:', err.message);
        });

        socket.on('error', (err: any) => {
            console.error('❌ Socket error:', err);
        });

        socket.on('new_message', (message: any) => {
            setChatMessages(prev => {
                // Check if message already exists to avoid duplicates (e.g. from the person who sent it)
                if (prev.some(m => m._id === message._id)) return prev;
                return [...prev, message];
            });
        });

        socket.on('user_typing', ({ userName, userId }: any) => {
            setTypingUsers((prev: any) => ({ ...prev, [userId]: userName }));
        });

        socket.on('user_stop_typing', ({ userId }: any) => {
            setTypingUsers((prev: any) => {
                const next = { ...prev };
                delete next[userId];
                return next;
            });
        });

        return () => {
            socket.emit('stop_typing', { assignmentId: id });
            socket.disconnect();
        };
    }, [id]);

    useEffect(() => {
        const draft = localStorage.getItem(`chat_draft_${id}`);
        if (draft) setChatInput(draft);

        const replyDraft = localStorage.getItem(`reply_draft_${id}`);
        if (replyDraft) {
            try {
                setReplyTo(JSON.parse(replyDraft));
            } catch (e) {
                console.error('Failed to parse reply draft');
            }
        }
    }, [id]);

    useEffect(() => {
        localStorage.setItem(`chat_draft_${id}`, chatInput);
    }, [id, chatInput]);

    useEffect(() => {
        if (replyTo) {
            localStorage.setItem(`reply_draft_${id}`, JSON.stringify(replyTo));
        } else {
            localStorage.removeItem(`reply_draft_${id}`);
        }
    }, [id, replyTo]);

    useEffect(() => {
        if (activeTab === 'chat') {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, activeTab]);

    const updateStatus = async (status: string) => {
        try {
            const { data } = await api.put(`/assignments/${id}`, { status });
            setAssignment(data.assignment);
        } catch { }
    };

    const handleUpdateProject = async () => {
        setSaving(true);
        try {
            const payload = {
                ...editProjectForm,
                dueDate: editProjectForm.noDueDate ? null : editProjectForm.dueDate
            };
            const { data } = await api.put(`/assignments/${id}`, payload);
            setAssignment(data.assignment);
            setIsEditingProject(false);
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to update project');
        } finally {
            setSaving(false);
        }
    };

    const startEditingProject = () => {
        setEditProjectForm({
            title: assignment.title,
            description: assignment.description || '',
            priority: assignment.priority,
            startDate: assignment.startDate ? new Date(assignment.startDate).toISOString().split('T')[0] : '',
            dueDate: assignment.dueDate && new Date(assignment.dueDate).getFullYear() > 1970 ? new Date(assignment.dueDate).toISOString().split('T')[0] : '',
            noDueDate: assignment.noDueDate || (!assignment.dueDate || new Date(assignment.dueDate).getFullYear() <= 1970),
            clientName: assignment.clientName || '',
            companyId: assignment.companyId?._id || assignment.companyId || '',
            isRecurring: assignment.isRecurring || false,
            recurringPattern: assignment.recurringPattern || 'monthly',
            recurringStartDate: assignment.recurringStartDate ? new Date(assignment.recurringStartDate).toISOString().split('T')[0] : ''
        });
        setCompanySearch(assignment.clientName || '');
        setIsEditingProject(true);

        if (allCompanies.length === 0) {
            api.get('/companies').then(res => {
                const flatCompanies: any[] = [];
                const flatten = (items: any[]) => {
                    items.forEach(item => {
                        const { children, ...rest } = item;
                        flatCompanies.push(rest);
                        if (children) flatten(children);
                    });
                };
                flatten(res.data.companies || []);
                setAllCompanies(flatCompanies);
            });
        }
    };

    const handleQuickAddCompany = async (name: string) => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const { data } = await api.post('/companies', { name });
            const newCompany = data.company;
            setAllCompanies(prev => [...prev, newCompany]);
            setEditProjectForm(prev => ({ ...prev, clientName: newCompany.name, companyId: newCompany._id }));
            setCompanySearch(newCompany.name);
            setShowCompanyDropdown(false);
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to add company');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
        try {
            await api.delete(`/assignments/${id}`);
            navigate('/assignments');
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to delete project please try again later');
        }
    };

    const handleUpdateTeam = async (teamIds: string[]) => {
        setUpdatingTeam(true);
        try {
            const { data } = await api.put(`/assignments/${id}`, { team: teamIds });
            setAssignment(data.assignment);
            setShowTeamModal(false);
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to update team');
        } finally {
            setUpdatingTeam(false);
        }
    };

    // const addComment = async (e: React.FormEvent) => {
    //     e.preventDefault();
    //     if (!comment.trim()) return;
    //     try {
    //         const { data } = await api.post('/comments', { content: comment, assignmentId: id });
    //         setComments(prev => [data.comment, ...prev]);
    //         setComment('');
    //     } catch { }
    // };

    const createTask = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                ...taskForm,
                assignment: id,
                dueDate: taskForm.noDueDate ? null : taskForm.dueDate
            };
            const { data } = await api.post('/tasks', payload);
            setTasks(prev => [data.task, ...prev]);
            setShowTaskForm(false);
            setTaskForm({
                title: '',
                description: '',
                assignedTo: '',
                dueDate: '',
                priority: 'medium',
                noDueDate: !assignment.dueDate || new Date(assignment.dueDate).getFullYear() <= 1970
            });
        } catch (e: any) { alert(e.response?.data?.message || 'Failed'); }
    };

    const updateTask = async (taskId: string, updates: any) => {
        try {
            const payload = {
                ...updates,
                dueDate: updates.noDueDate ? null : updates.dueDate
            };
            const { data } = await api.put(`/tasks/${taskId}`, payload);
            setTasks(prev => prev.map(t => t._id === taskId ? data.task : t));
            setEditingTask(null);
        } catch (e: any) { alert(e.response?.data?.message || 'Failed'); }
    };

    const deleteTask = async (taskId: string) => {
        if (!window.confirm('Delete this task?')) return;
        try {
            await api.delete(`/tasks/${taskId}`);
            setTasks(prev => prev.filter(t => t._id !== taskId));
        } catch (e: any) { alert(e.response?.data?.message || 'Failed'); }
    };

    const updateTaskStatus = async (taskId: string, status: string) => {
        try {
            // Override status for employees trying to complete
            let targetStatus = status;
            if (isEmployee && status === 'completed') {
                targetStatus = 'review';
            }
            const { data } = await api.put(`/tasks/${taskId}`, { status: targetStatus });
            setTasks(prev => prev.map(t => t._id === taskId ? data.task : t));
        } catch { }
    };

    const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
        if (file.size > MAX_FILE_SIZE) {
            toast.error(`"${file.name}" exceeds the 50 MB size limit`);
            if (e.target) e.target.value = '';
            return;
        }

        setUploadingFileName(file.name);
        setIsUploadingFile(true);
        setUploadProgress(0);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('assignmentId', id!);
        try {
            const { data } = await api.post('/files', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                    setUploadProgress(percentCompleted);
                }
            });
            setFiles(prev => [data.attachment, ...prev]);
        } catch { }
        finally {
            setIsUploadingFile(false);
            setUploadingFileName(null);
            setUploadProgress(0);
            if (e.target) e.target.value = '';
        }
    };

    const downloadFile = async (fileId: string, originalName: string) => {
        try {
            const response = await api.get(`/files/${fileId}/download`, { responseType: 'blob' });
            // Use the Content-Type from the response to preserve original format
            const contentType = response.headers['content-type'] || 'application/octet-stream';
            const url = window.URL.createObjectURL(new Blob([response.data], { type: contentType }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', originalName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch { }
    };

    const sendChatMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() && stagedFiles.length === 0) return;

        setIsUploadingFile(true);
        try {
            let attachmentIds: string[] = [];

            // Upload files only on send
            if (stagedFiles.length > 0) {
                setUploadProgress(0);
                const loadedMap: Record<number, number> = {};
                const totalMap: Record<number, number> = {};

                const uploadPromises = stagedFiles.map((fileObject, index) => {
                    const formData = new FormData();
                    formData.append('file', fileObject.file);
                    formData.append('assignmentId', id!);
                    return api.post('/files', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                        onUploadProgress: (progressEvent) => {
                            loadedMap[index] = progressEvent.loaded;
                            totalMap[index] = progressEvent.total || fileObject.file.size;

                            const totalLoaded = Object.values(loadedMap).reduce((a, b) => a + b, 0);
                            const totalBytes = Object.values(totalMap).reduce((a, b) => a + b, 0);
                            const percentCompleted = Math.round((totalLoaded * 100) / (totalBytes || 1));
                            setUploadProgress(percentCompleted);
                        }
                    });
                });

                const uploadResults = await Promise.all(uploadPromises);
                attachmentIds = uploadResults.map(res => res.data.attachment._id);
            }

            await api.post('/chat', {
                content: chatInput,
                assignmentId: id,
                attachments: attachmentIds,
                mentions: Array.from(selectedMentions),
                parentMessageId: replyTo?._id
            });

            setChatInput('');
            setSelectedMentions(new Set());
            setReplyTo(null);
            setStagedFiles([]);
            localStorage.removeItem(`chat_draft_${id}`);
            localStorage.removeItem(`reply_draft_${id}`);
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to send message');
        } finally {
            setIsUploadingFile(false);
            setUploadProgress(0);
        }
    };

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

    const sendChatFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;

        const newStagedFiles = [...stagedFiles];
        const rejected: string[] = [];

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];

            if (file.size > MAX_FILE_SIZE) {
                rejected.push(`"${file.name}" exceeds the 50 MB size limit`);
                continue;
            }

            newStagedFiles.push({
                id: Math.random().toString(36).substr(2, 9),
                file: file,
                originalName: file.name,
                fileType: file.type,
                fileSize: file.size
            });
        }

        if (rejected.length > 0) {
            toast.error('The following files were not added:\n\n' + rejected.join('\n'));
        }

        setStagedFiles(newStagedFiles);
        if (chatFileRef.current) chatFileRef.current.value = '';
    };

    const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const cursorPosition = e.target.selectionStart || 0;
        setChatInput(val);
        localStorage.setItem(`chat_draft_${id}`, val);

        // Mention logic
        const lastAtIndex = val.lastIndexOf('@', cursorPosition - 1);
        if (lastAtIndex !== -1) {
            const query = val.substring(lastAtIndex + 1, cursorPosition).toLowerCase();
            if (!query.includes(' ')) {
                setMentionQuery(query);
                setShowMentionDropdown(true);
                setMentionPosition({ top: -150, left: Math.min(cursorPosition * 8, 300) });
            } else {
                setShowMentionDropdown(false);
            }
        } else {
            setShowMentionDropdown(false);
        }

        if (socketRef.current) {
            socketRef.current.emit('typing', { assignmentId: id, userName: user?.name });

            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                socketRef.current.emit('stop_typing', { assignmentId: id });
            }, 3000);
        }
    };

    const removeStagedFile = (tempId: string) => {
        setStagedFiles(prev => prev.filter(f => f.id !== tempId));
    };

    // Calculate assignment progress from tasks
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const progressPercent = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

    if (loading) return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 } as React.CSSProperties}><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 400 }} /></div>;
    if (!assignment) return (
        <div style={{ padding: 64, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 } as React.CSSProperties}>
            <FolderKanban size={48} style={{ opacity: 0.2 }} />
            <div>
                <h2 style={{ fontWeight: 700 }}>Project not found</h2>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>The project might have been deleted or you don't have permission to view it.</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/assignments')}>
                Back to Projects
            </button>
        </div>
    );

    const tabs = [
        { key: 'tasks', label: 'Tasks', count: tasks.length },
        { key: 'chat', label: 'Chat', count: chatMessages.length },
        { key: 'files', label: 'Files', count: files.length },
        { key: 'notes', label: 'Whiteboard', count: 0, new: true },
    ];

    return (
        <div style={{ maxWidth: 1000, width: '100%' }}>
            <FilePreviewModal
                isOpen={!!previewFile}
                onClose={() => setPreviewFile(null)}
                fileUrl={previewFile?.url || ''}
                fileType={previewFile?.type || ''}
                fileName={previewFile?.name || ''}
            />

            {comments ? null : null}
            {/* Back button */}
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => navigate('/assignments')}>
                <ArrowLeft size={16} /> Back to Projects
            </button>

            {/* Project header */}
            <div className="card" style={{ padding: window.innerWidth < 768 ? '16px' : '24px', marginBottom: 20 }}>
                <div style={{ display: 'flex', flexDirection: window.innerWidth < 768 ? 'column' as any : 'row' as any, justifyContent: 'space-between', alignItems: window.innerWidth < 768 ? 'stretch' : 'flex-start', marginBottom: 16, gap: window.innerWidth < 768 ? 12 : 0 }}>
                    <div style={{ flex: 1 }}>
                        {isEditingProject ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <input
                                        className="input"
                                        style={{ fontSize: '1.25rem', fontWeight: 700, flex: 1 }}
                                        value={editProjectForm.title}
                                        onChange={e => setEditProjectForm({ ...editProjectForm, title: e.target.value })}
                                        placeholder="Project Title"
                                    />
                                    <select
                                        className="select"
                                        style={{ width: 120 }}
                                        value={editProjectForm.priority}
                                        onChange={e => setEditProjectForm({ ...editProjectForm, priority: e.target.value })}
                                    >
                                        {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <textarea
                                    className="input"
                                    rows={2}
                                    value={editProjectForm.description}
                                    onChange={e => setEditProjectForm({ ...editProjectForm, description: e.target.value })}
                                    placeholder="Project Description"
                                />
                                <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                                    <div style={{ position: 'relative' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Client / Company</label>
                                        <input
                                            className="input"
                                            placeholder="Search or add company..."
                                            value={companySearch}
                                            onChange={e => {
                                                setCompanySearch(e.target.value);
                                                setShowCompanyDropdown(true);
                                                if (!e.target.value) setEditProjectForm({ ...editProjectForm, clientName: '', companyId: '' });
                                            }}
                                            onFocus={() => setShowCompanyDropdown(true)}
                                        />
                                        {showCompanyDropdown && (companySearch.trim() || filteredCompanies.length > 0) && (
                                            <>
                                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} onClick={() => setShowCompanyDropdown(false)} />
                                                <div className="card shadow-xl" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 101, marginTop: 4, maxHeight: 200, overflow: 'auto', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                                                    {filteredCompanies.length > 0 ? (
                                                        filteredCompanies.map(c => (
                                                            <div
                                                                key={c._id}
                                                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.875rem' }}
                                                                className="hover-bg"
                                                                onClick={() => {
                                                                    setEditProjectForm({ ...editProjectForm, clientName: c.name, companyId: c._id });
                                                                    setCompanySearch(c.name);
                                                                    setShowCompanyDropdown(false);
                                                                }}
                                                            >
                                                                {c.name}
                                                                {c.parentCompanyId && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginLeft: 6 }}>(Subsidiary)</span>}
                                                            </div>
                                                        ))
                                                    ) : companySearch ? (
                                                        <div
                                                            style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-primary-light)' }}
                                                            className="hover-bg"
                                                            onClick={() => handleQuickAddCompany(companySearch)}
                                                        >
                                                            <Plus size={16} color="var(--color-primary)" />
                                                            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-primary)' }}>
                                                                Add <strong>"{companySearch}"</strong> as new company
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Start Date</label>
                                        <input
                                            className="input"
                                            type="date"
                                            value={editProjectForm.startDate}
                                            onChange={e => setEditProjectForm({ ...editProjectForm, startDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Due Date</label>
                                        <input
                                            className={`input ${!editProjectForm.dueDate ? 'opacity-50' : ''}`}
                                            type="date"
                                            disabled={editProjectForm.noDueDate}
                                            value={editProjectForm.dueDate}
                                            onChange={e => setEditProjectForm({ ...editProjectForm, dueDate: e.target.value })}
                                        />
                                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input
                                                type="checkbox"
                                                id="editNoDueDate"
                                                checked={editProjectForm.noDueDate}
                                                onChange={e => setEditProjectForm({ ...editProjectForm, noDueDate: e.target.checked })}
                                            />
                                            <label htmlFor="editNoDueDate" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>No due date</label>
                                        </div>
                                    </div>
                                </div>

                                <div className="card" style={{ padding: '12px 16px', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: editProjectForm.isRecurring ? 12 : 0 }}>
                                        <input
                                            type="checkbox"
                                            id="editIsRecurring"
                                            checked={editProjectForm.isRecurring}
                                            onChange={e => setEditProjectForm({ ...editProjectForm, isRecurring: e.target.checked })}
                                        />
                                        <label htmlFor="editIsRecurring" style={{ fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Recurring Project Blueprint</label>
                                    </div>

                                    {editProjectForm.isRecurring && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Pattern</label>
                                                <select
                                                    className="select"
                                                    value={editProjectForm.recurringPattern}
                                                    onChange={e => setEditProjectForm({ ...editProjectForm, recurringPattern: e.target.value })}
                                                >
                                                    <option value="daily">Daily</option>
                                                    <option value="weekly">Weekly</option>
                                                    <option value="monthly">Monthly</option>
                                                    <option value="yearly">Yearly</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Anchor Start Date</label>
                                                <input
                                                    className="input"
                                                    type="date"
                                                    value={editProjectForm.recurringStartDate}
                                                    onChange={e => setEditProjectForm({ ...editProjectForm, recurringStartDate: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{assignment.title}</h1>
                                    {assignment.isRecurring && !assignment.parentAssignmentId && (
                                        <span className="badge" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>Recurring Blueprint</span>
                                    )}
                                    {assignment.parentAssignmentId && (
                                        <span className="badge" style={{ background: '#f0fdf4', color: '#16a34a' }}>Recurring Instance</span>
                                    )}
                                    <span className={`badge badge-${assignment.priority}`}>{PRIORITY_LABELS[assignment.priority]}</span>
                                </div>
                                {assignment.isRecurring && !assignment.parentAssignmentId && (
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'var(--color-primary-light)',
                                        borderRadius: 8,
                                        marginBottom: 16,
                                        border: '1px solid var(--color-primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12
                                    }}>
                                        <div style={{ fontSize: '1.25rem' }}>📋</div>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-primary)', fontWeight: 500 }}>
                                            This is a <b>Recurring Blueprint</b>. Any tasks added here will be automatically copied to every new project instance created according to the <b>{assignment.recurringPattern}</b> schedule.
                                        </div>
                                    </div>
                                )}
                                {assignment.description && <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 12 }}>{assignment.description}</p>}
                                <div style={{ display: 'flex', gap: 20, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Briefcase size={16} /> Client: <strong>{assignment.clientName}</strong></span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={16} /> Start: {format(new Date(assignment.startDate), 'MMM d, yyyy')}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Clock size={16} /> Due: <strong>
                                            {assignment.dueDate && new Date(assignment.dueDate).getFullYear() > 1970
                                                ? format(new Date(assignment.dueDate), 'MMM d, yyyy')
                                                : 'No Due Date'}
                                        </strong>
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                    {canEdit && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            {isEditingProject ? (
                                <>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setIsEditingProject(false)}>Cancel</button>
                                    <button className="btn btn-primary btn-sm" onClick={handleUpdateProject} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="btn btn-ghost btn-sm" onClick={startEditingProject} title="Edit Project Details">
                                        <Edit2 size={18} />
                                    </button>
                                    <select className="select" style={{ width: 140 }} value={assignment.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateStatus(e.target.value)}>
                                        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)' }} onClick={handleDelete} title="Delete Project">
                                        <Trash2 size={18} />
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        <span>Progress</span>
                        <span>{completedTasks}/{tasks.length} tasks · {progressPercent}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-hover)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 3,
                            width: `${progressPercent}%`,
                            background: progressPercent === 100 ? '#22c55e' : 'linear-gradient(90deg, var(--color-primary), #a78bfa)',
                            transition: 'width 0.5s ease',
                        }} />
                    </div>
                </div>

                {/* Teams */}
                {assignment.teams?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                            Assigned Teams
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {assignment.teams.map((t: any) => (
                                <div key={t._id} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                                    borderRadius: 8, background: 'var(--color-primary-light)', fontSize: '0.75rem', fontWeight: 500,
                                    border: '1px solid var(--color-primary)',
                                }}>
                                    <Users size={12} />
                                    {t.name}
                                    <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>({t.members?.length || 0})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Team Members */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } as React.CSSProperties}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' } as React.CSSProperties}>
                        {assignment.team?.map((m: any) => (
                            <span key={m._id} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                                borderRadius: 6, background: 'var(--color-surface-hover)', fontSize: '0.75rem', fontWeight: 500,
                            }}>
                                <Avatar src={m.avatar} name={m.name} size={20} />
                                {m.name}
                            </span>
                        ))}
                    </div>
                    {canEdit && (
                        <button className="btn btn-ghost btn-xs" style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }} onClick={() => setShowTeamModal(true)}>
                            Manage Team
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
                {tabs.map(t => (
                    <button
                        key={t.key}
                        className="btn btn-ghost"
                        onClick={() => setActiveTab(t.key as any)}
                        style={{
                            borderRadius: 0,
                            borderBottom: activeTab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                            color: activeTab === t.key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                            fontWeight: activeTab === t.key ? 600 : 400,
                            paddingBottom: 12,
                        }}
                    >
                        {t.label}
                        {t.key !== 'notes' ? (
                            <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.6, marginLeft: 6 }}>({t.count})</span>
                        ) : (
                            <span style={{
                                fontSize: '0.6rem',
                                background: '#22c55e',
                                color: 'white',
                                padding: '2px 6px',
                                borderRadius: 10,
                                marginLeft: 8,
                                fontWeight: 700,
                                textTransform: 'uppercase'
                            }}>New</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Notes/Whiteboard Tab */}
            {activeTab === 'notes' && (
                <div ref={whiteboardRef}>
                    <div style={{ marginBottom: 16 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Project Whiteboard</h3>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                            Collaborative space for visual notes and brainstorming. All project members can see and edit these notes.
                        </p>
                    </div>
                    {/* Canvas Gate Overlay */}
                    {!canvasUnlocked ? (
                        <div style={{
                            position: 'relative',
                            height: 500,
                            borderRadius: 12,
                            overflow: 'hidden',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg)',
                        }}>
                            {/* Blurred preview background */}
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                backgroundImage: 'radial-gradient(circle at 1px 1px, var(--color-text-tertiary) 1px, transparent 0)',
                                backgroundSize: '20px 20px',
                                opacity: 0.15,
                            }} />
                            {/* Decorative fake notes */}
                            <div style={{ position: 'absolute', inset: 0, filter: 'blur(3px)', opacity: 0.4, pointerEvents: 'none' }}>
                                {['#fef9c3', '#dcfce7', '#dbeafe', '#f3e8ff'].map((color, i) => (
                                    <div key={i} style={{
                                        position: 'absolute',
                                        left: 60 + i * 180,
                                        top: 80 + (i % 2) * 100,
                                        width: 160,
                                        height: 120,
                                        background: color,
                                        borderRadius: 10,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                    }} />
                                ))}
                            </div>
                            {/* Overlay content */}
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 16,
                                background: 'rgba(255,255,255,0.05)',
                                backdropFilter: 'blur(2px)',
                                zIndex: 10,
                            }}>
                                <div style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 16,
                                    background: 'linear-gradient(135deg, var(--color-primary), #818cf8)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
                                }}>
                                    <FolderKanban size={28} color="#fff" />
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 4, color: 'var(--color-text)' }}>
                                        Collaborative Canvas
                                    </h3>
                                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', maxWidth: 360 }}>
                                        An interactive whiteboard shared with your project team. Add, edit, and organize notes collaboratively.
                                    </p>
                                </div>
                                <button
                                    className="btn btn-primary"
                                    style={{
                                        padding: '10px 28px',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        borderRadius: 10,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        marginTop: 4,
                                        boxShadow: '0 4px 16px rgba(99,102,241,0.25)',
                                    }}
                                    onClick={() => setCanvasUnlocked(true)}
                                >
                                    <Eye size={16} /> Enter Collaborative Canvas
                                </button>
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                                    {assignment.team?.length || 0} team member{(assignment.team?.length || 0) !== 1 ? 's' : ''} have access
                                </span>
                            </div>
                        </div>
                    ) : (
                        <ProjectCanvas
                            assignmentId={id!}
                            initialData={assignment.canvasData}
                            startFullScreen={true}
                            onExitFullScreen={() => setCanvasUnlocked(false)}
                        />
                    )}
                </div>
            )}

            {/* Tasks Tab */}
            {activeTab === 'tasks' && (
                <div>
                    {canEdit && (
                        <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={() => {
                            const show = !showTaskForm;
                            setShowTaskForm(show);
                            if (show) {
                                setTaskForm(prev => ({
                                    ...prev,
                                    noDueDate: !assignment.dueDate || new Date(assignment.dueDate).getFullYear() <= 1970
                                }));
                            }
                        }}>
                            <Plus size={16} /> Add Task
                        </button>
                    )}
                    {showTaskForm && (
                        <form onSubmit={createTask} className="card" style={{ padding: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 } as React.CSSProperties}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Task Title *</label>
                                <input className="input" required placeholder="Enter task title" value={taskForm.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaskForm({ ...taskForm, title: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Detailed Task Description *</label>
                                <textarea className="input" required rows={2} placeholder="Enter task description..." value={taskForm.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTaskForm({ ...taskForm, description: e.target.value })} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Assign To *</label>
                                    <select className="select" required value={taskForm.assignedTo} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}>
                                        <option value="">Select member...</option>
                                        {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Due Date *</label>
                                    <input
                                        className="input"
                                        type="date"
                                        required={!taskForm.noDueDate}
                                        disabled={taskForm.noDueDate}
                                        value={taskForm.dueDate}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                                    />
                                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                            type="checkbox"
                                            id="taskNoDueDate"
                                            checked={taskForm.noDueDate}
                                            onChange={e => setTaskForm({ ...taskForm, noDueDate: e.target.checked })}
                                        />
                                        <label htmlFor="taskNoDueDate" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>No due date</label>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Priority</label>
                                    <select className="select" value={taskForm.priority} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                                        {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTaskForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary btn-sm">Create Task</button>
                            </div>
                        </form>
                    )}
                    {tasks.length === 0 ? (
                        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>No tasks yet</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {tasks
                                .map(t => (
                                    <div key={t._id} id={`task-${t._id}`} className="card" style={{ padding: '14px 18px' }}>
                                        {editingTask === t._id ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 } as React.CSSProperties}>
                                                <input className="input" required placeholder="Enter task title" value={editTaskForm.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTaskForm({ ...editTaskForm, title: e.target.value })} />
                                                <textarea className="input" required rows={2} placeholder="Enter task description..." value={editTaskForm.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditTaskForm({ ...editTaskForm, description: e.target.value })} />
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                                    <select className="select" value={editTaskForm.assignedTo} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditTaskForm({ ...editTaskForm, assignedTo: e.target.value })}>
                                                        {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                                                    </select>
                                                    <div>
                                                        <input className="input" type="date" disabled={editTaskForm.noDueDate} value={editTaskForm.dueDate?.split('T')[0]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTaskForm({ ...editTaskForm, dueDate: e.target.value })} />
                                                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <input
                                                                type="checkbox"
                                                                id={`editTaskNoDueDate-${t._id}`}
                                                                checked={editTaskForm.noDueDate}
                                                                onChange={e => setEditTaskForm({ ...editTaskForm, noDueDate: e.target.checked })}
                                                            />
                                                            <label htmlFor={`editTaskNoDueDate-${t._id}`} style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>No due date</label>
                                                        </div>
                                                    </div>
                                                    <select className="select" value={editTaskForm.priority} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditTaskForm({ ...editTaskForm, priority: e.target.value })}>
                                                        {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                    <button className="btn btn-ghost btn-xs" onClick={() => setEditingTask(null)}>Cancel</button>
                                                    <button className="btn btn-primary btn-xs" onClick={() => updateTask(t._id, editTaskForm)}>Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                        <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{t.title}</span>
                                                        <span className={`badge badge-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
                                                        <span className={`badge badge-${t.status}`}>{TASK_STATUS_LABELS[t.status]}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }} >

                                                        {t.description ? (
                                                            <>
                                                                <span className="font-semibold text-(--color-text-secondary)">Task Description :</span> {t.description}
                                                            </>
                                                        ) : null}

                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                                        Assigned to {t.assignedTo?.name}<span style={{ color: getDueDateColor(t.dueDate) }}>
                                                            <span style={{ color: 'var(--color-text-secondary)' }} > · </span>
                                                            {t.status === "completed" ? (
                                                                <span className='line-through text-(--color-success) ' >{t.dueDate && new Date(t.dueDate).getFullYear() > 1970 ? `Due ${format(new Date(t.dueDate), 'MMM d')}` : 'No due date'}</span>
                                                            ) : (
                                                                <span>{t.dueDate && new Date(t.dueDate).getFullYear() > 1970 ? `Due ${format(new Date(t.dueDate), 'MMM d')}` : 'No due date'}</span>
                                                            )}

                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {t.status === 'review' && (isAdmin || isManager) ? (
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            <button
                                                                className="btn btn-xs"
                                                                style={{ backgroundColor: '#22c55e', color: 'white', border: 'none' }}
                                                                onClick={() => updateTaskStatus(t._id, 'completed')}
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                className="btn btn-xs"
                                                                style={{ backgroundColor: '#ef4444', color: 'white', border: 'none' }}
                                                                onClick={() => updateTaskStatus(t._id, 'in_progress')}
                                                            >
                                                                Reject
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {t.status !== 'completed' && (
                                                                <select
                                                                    className="select"
                                                                    style={{ fontSize: '0.75rem', padding: '4px 24px 4px 8px', width: 120 }}
                                                                    value={isEmployee && t.status === 'review' ? 'review' : t.status}
                                                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                                                        const val = e.target.value;
                                                                        if (isEmployee && val === 'review') {
                                                                            updateTaskStatus(t._id, 'review');
                                                                        } else {
                                                                            updateTaskStatus(t._id, val);
                                                                        }
                                                                    }}
                                                                >
                                                                    {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => {
                                                                        if (isEmployee && k === 'review') return null;
                                                                        if (isEmployee && k === 'completed') return <option key={k} value="review">Mark for Review</option>;
                                                                        return <option key={k} value={k}>{v}</option>;
                                                                    })}
                                                                </select>
                                                            )}
                                                        </>
                                                    )}
                                                    {canEdit && (
                                                        <>
                                                            <button className="btn btn-ghost btn-xs" onClick={() => {
                                                                setEditingTask(t._id);
                                                                setEditTaskForm({
                                                                    title: t.title,
                                                                    description: t.description || '',
                                                                    assignedTo: t.assignedTo?._id,
                                                                    dueDate: t.dueDate && new Date(t.dueDate).getFullYear() > 1970 ? t.dueDate.split('T')[0] : '',
                                                                    noDueDate: t.noDueDate || (!t.dueDate || new Date(t.dueDate).getFullYear() <= 1970),
                                                                    priority: t.priority,
                                                                });
                                                            }}>
                                                                <Edit3 size={13} />
                                                            </button>
                                                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--color-error)' }} onClick={() => deleteTask(t._id)}>
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* Chat Tab */}
            {activeTab === 'chat' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: 500 }}>
                    {/* Messages area */}
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: '16px 0',
                        display: 'flex', flexDirection: 'column', gap: 12,
                    } as React.CSSProperties}>
                        {chatMessages.length === 0 ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--color-text-tertiary)' } as React.CSSProperties}>
                                <MessageSquare size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                                <div style={{ fontSize: '0.875rem' }}>No messages yet. Start the conversation!</div>
                            </div>
                        ) : (
                            chatMessages.map((msg: any) => {
                                const isOwnMessage = msg.sender?._id === user?._id;
                                return (
                                    <div key={msg._id} id={`chat-msg-${msg._id}`} style={{
                                        display: 'flex', gap: 10,
                                        flexDirection: (isOwnMessage ? 'row-reverse' : 'row') as any,
                                    }}>
                                        <Avatar src={msg.sender?.avatar} name={msg.sender?.name} size={32} />
                                        <div style={{ maxWidth: '60%', width: 'fit-content' }}>
                                            <div style={{
                                                fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', marginBottom: 4,
                                                textAlign: isOwnMessage ? 'right' : 'left',
                                            }}>
                                                {msg.sender?.name} · {format(new Date(msg.createdAt), 'h:mm a')}
                                            </div>
                                            {msg.parentMessage && (
                                                <div
                                                    style={{
                                                        fontSize: '0.75rem',
                                                        color: 'var(--color-text-tertiary)',
                                                        background: 'rgba(0,0,0,0.05)',
                                                        padding: '4px 8px',
                                                        borderRadius: 4,
                                                        marginBottom: 4,
                                                        borderLeft: '2px solid var(--color-primary)',
                                                        maxWidth: '100%',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    onClick={() => scrollToOriginalMessage(msg.parentMessage._id)}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                                                    title="Go to message"
                                                >
                                                    Replying to {msg.parentMessage.sender?.name}: {msg.parentMessage.content}
                                                </div>
                                            )}
                                            {msg.content && (
                                                <div
                                                    className="chat-bubble"
                                                    style={{
                                                        padding: '10px 14px', borderRadius: 12, fontSize: '0.875rem',
                                                        background: isOwnMessage ? 'var(--color-primary)' : 'var(--color-surface-hover)',
                                                        color: isOwnMessage ? 'white' : 'var(--color-text)',
                                                        borderTopRightRadius: isOwnMessage ? 4 : 12,
                                                        borderTopLeftRadius: isOwnMessage ? 12 : 4,
                                                        position: 'relative'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        const btn = e.currentTarget.querySelector('.reply-btn') as HTMLElement;
                                                        if (btn) {
                                                            btn.style.opacity = '1';
                                                            btn.style.visibility = 'visible';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        const btn = e.currentTarget.querySelector('.reply-btn') as HTMLElement;
                                                        if (btn) {
                                                            btn.style.opacity = '0';
                                                            btn.style.visibility = 'hidden';
                                                        }
                                                    }}
                                                >
                                                    {(() => {
                                                        const mentionNames = (msg.mentions || []).map((m: any) => typeof m === 'string' ? '' : m.name).filter(Boolean);
                                                        if (mentionNames.length === 0) {
                                                            return msg.content.split(/(@\w+)/g).map((part: string, i: number) => {
                                                                if (part.startsWith('@')) {
                                                                    return <span key={i} style={{ fontWeight: 700, color: isOwnMessage ? 'white' : 'var(--color-primary)' }}>{part}</span>;
                                                                }
                                                                return part;
                                                            });
                                                        }
                                                        const regex = new RegExp(`(@(?:${mentionNames.map((n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
                                                        return msg.content.split(regex).map((part: string, i: number) => {
                                                            if (part.startsWith('@')) {
                                                                const name = part.substring(1);
                                                                if (mentionNames.includes(name)) {
                                                                    return <span key={i} style={{ fontWeight: 700, color: isOwnMessage ? 'white' : 'var(--color-primary)' }}>{part}</span>;
                                                                }
                                                            }
                                                            return part;
                                                        });
                                                    })()}
                                                    <button
                                                        className="reply-btn"
                                                        onClick={() => setReplyTo(msg)}
                                                        style={{
                                                            position: 'absolute',
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            right: isOwnMessage ? 'auto' : -36,
                                                            left: isOwnMessage ? -36 : 'auto',
                                                            display: 'flex',
                                                            background: 'var(--color-surface)',
                                                            border: '1px solid var(--color-border)',
                                                            borderRadius: '50%',
                                                            width: 28,
                                                            height: 28,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                                                            color: 'var(--color-primary)',
                                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                            zIndex: 10,
                                                            opacity: 0,
                                                            visibility: 'hidden'
                                                        }}
                                                        title="Reply"
                                                    >
                                                        <Reply size={16} />
                                                    </button>
                                                </div>
                                            )}
                                            {/* Attachments in message */}
                                            {msg.attachments?.map((att: any) => {
                                                const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
                                                const fileUrl = att.filePath ? `${socketUrl}${att.filePath}` : `${socketUrl}/uploads/${att.fileName || att.filename}`;
                                                const ext = (att.fileName || att.filename || att.originalName || '').split('.').pop()?.toLowerCase() || '';
                                                const isImage = att.fileType?.startsWith('image/') || att.contentType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);

                                                return (
                                                    <div
                                                        key={att._id}
                                                        style={{
                                                            marginTop: 6,
                                                            padding: isImage ? '4px' : '8px 12px',
                                                            borderRadius: 10,
                                                            background: isOwnMessage ? 'rgba(255,255,255,0.1)' : 'var(--color-surface)',
                                                            border: '1px solid var(--color-border)',
                                                            display: 'flex',
                                                            flexDirection: 'column' as any,
                                                            gap: 4,
                                                            cursor: 'pointer',
                                                            maxWidth: '100%',
                                                            boxShadow: 'var(--shadow-sm)'
                                                        }}
                                                        onClick={() => setPreviewFile({ url: fileUrl, type: att.fileType || att.contentType || '', name: att.originalName || att.fileName || att.filename || '' })}
                                                    >
                                                        {isImage ? (
                                                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                                                <img
                                                                    src={fileUrl}
                                                                    alt={att.originalName}
                                                                    style={{
                                                                        maxHeight: 100,
                                                                        maxWidth: 240,
                                                                        borderRadius: 6,
                                                                        display: 'block',
                                                                        objectFit: 'cover'
                                                                    }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setPreviewFile({ url: fileUrl, type: att.fileType || att.contentType || '', name: att.originalName || att.fileName || att.filename || '' }); }}
                                                                    style={{
                                                                        position: 'absolute', bottom: 6, right: 6,
                                                                        background: 'rgba(0,0,0,0.6)', color: 'white',
                                                                        border: 'none', borderRadius: 6, cursor: 'pointer',
                                                                        padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4,
                                                                        fontSize: '0.6875rem', fontWeight: 500,
                                                                        backdropFilter: 'blur(4px)'
                                                                    }}
                                                                >
                                                                    <Eye size={12} /> Preview
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <div style={{
                                                                    width: 32, height: 32, borderRadius: 8,
                                                                    background: 'var(--color-surface-hover)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    color: 'var(--color-primary)'
                                                                }}>
                                                                    {getFileIcon(att.fileType)}
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {att.originalName}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                                                                        {(att.fileSize / 1024).toFixed(1)} KB
                                                                    </div>
                                                                </div>
                                                                <Download size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        {Object.values(typingUsers).length > 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic', padding: '0 8px' }}>
                                {Object.values(typingUsers).join(', ')} {Object.values(typingUsers).length === 1 ? 'is' : 'are'} typing...
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Reply Preview */}
                    {replyTo && (
                        <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-primary-light)', borderTop: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 2 }}>
                                    <Reply size={12} />
                                    <span>Replying to {replyTo.sender?.name}</span>
                                </div>
                                <div style={{ color: 'var(--color-text-secondary)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{replyTo.content}</div>
                            </div>
                            <button className="btn btn-ghost btn-xs" onClick={() => setReplyTo(null)}>Cancel</button>
                        </div>
                    )}

                    {/* Staged files area */}
                    {stagedFiles.length > 0 && (
                        <div style={{ padding: '8px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-hover)' }}>
                            {stagedFiles.map(f => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--color-surface)', borderRadius: 16, fontSize: '0.75rem', border: '1px solid var(--color-border)' }}>
                                    <span>{getFileIcon(f.fileType)}</span>
                                    <span style={{ maxWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.originalName}</span>
                                    <button type="button" onClick={() => removeStagedFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--color-text-tertiary)' }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Chat input */}
                    <form onSubmit={sendChatMessage} style={{
                        display: 'flex', gap: 8, padding: '12px 0', borderTop: '1px solid var(--color-border)', alignItems: 'center',
                        position: 'relative'
                    }}>
                        <input type="file" ref={chatFileRef} style={{ display: 'none' }} multiple onChange={sendChatFile} />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => chatFileRef.current?.click()} title="Attach files" disabled={isUploadingFile}>
                            <Paperclip size={16} />
                        </button>
                        {isUploadingFile ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-primary)', fontSize: '0.875rem', fontWeight: 500 }}>
                                    <Loader2 className="animate-spin" size={18} />
                                    <span>
                                        Uploading {stagedFiles.length > 0 ? stagedFiles[0].originalName + (stagedFiles.length > 1 ? ` (+${stagedFiles.length - 1} more)` : '') : (uploadingFileName || 'attachment')}... ({uploadProgress}%)
                                    </span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: 'var(--color-surface-hover)', overflow: 'hidden', width: '100%', maxWidth: 280 }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${uploadProgress}%`,
                                        background: 'var(--color-primary)',
                                        transition: 'width 0.1s ease',
                                    }} />
                                </div>
                            </div>
                        ) : (
                            <>
                                {showMentionDropdown && (
                                    <div className="card shadow-lg animate-fade-in" style={{
                                        position: 'absolute',
                                        bottom: 'calc(100% + 10px)',
                                        left: mentionPosition.left,
                                        width: 220,
                                        zIndex: 100,
                                        padding: '4px 0',
                                        maxHeight: 200,
                                        overflow: 'auto'
                                    }}>
                                        {filteredMentionUsers.length === 0 ? (
                                            <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>No users found</div>
                                        ) : (
                                            filteredMentionUsers.map((u: any, idx: number) => (
                                                <div
                                                    key={u._id}
                                                    style={{
                                                        padding: '8px 12px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        cursor: 'pointer',
                                                        transition: 'background 0.15s',
                                                        background: mentionIndex === idx ? 'var(--color-surface-hover)' : 'transparent'
                                                    }}
                                                    onClick={() => handleMentionSelect(u)}
                                                    onMouseEnter={() => setMentionIndex(idx)}
                                                >
                                                    <Avatar src={u.avatar} name={u.name} size={24} />
                                                    <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{u.name}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                <input
                                    className="input"
                                    style={{ flex: 1 }}
                                    placeholder="Type a message..."
                                    value={chatInput}
                                    onChange={handleChatInputChange}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            setShowMentionDropdown(false);
                                        } else if (e.key === 'ArrowDown' && showMentionDropdown) {
                                            e.preventDefault();
                                            setMentionIndex(prev => (prev + 1) % filteredMentionUsers.length);
                                        } else if (e.key === 'ArrowUp' && showMentionDropdown) {
                                            e.preventDefault();
                                            setMentionIndex(prev => (prev - 1 + filteredMentionUsers.length) % filteredMentionUsers.length);
                                        } else if (e.key === 'Enter' && showMentionDropdown) {
                                            e.preventDefault();
                                            if (filteredMentionUsers[mentionIndex]) {
                                                handleMentionSelect(filteredMentionUsers[mentionIndex]);
                                            }
                                        }
                                    }}
                                />
                            </>
                        )}
                        <button type="submit" className="btn btn-primary btn-sm" disabled={(!chatInput.trim() && stagedFiles.length === 0) || isUploadingFile}>
                            <Send size={16} /> Send
                        </button>
                    </form>
                </div>
            )
            }

            {/* Files Tab */}
            {
                activeTab === 'files' && (
                    <div>
                        {isUploadingFile && activeTab === 'files' ? (
                            <div style={{
                                marginBottom: 16, padding: '12px 16px', borderRadius: 12,
                                background: 'var(--color-primary-light)', color: 'var(--color-primary)',
                                display: 'flex', alignItems: 'center', gap: 12, fontWeight: 500, fontSize: '0.875rem',
                                border: '1px solid var(--color-primary)'
                            }}>
                                <div style={{ width: 18, height: 18, border: '2px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                Uploading: <span style={{ textDecoration: 'underline' }}>{uploadingFileName}</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                                    <Upload size={16} /> Upload File
                                    <input type="file" style={{ display: 'none' }} onChange={uploadFile} />
                                </label>
                                <button className="btn btn-ghost btn-sm" onClick={async () => { const { data } = await api.get(`/files?assignmentId=${id}`); setFiles(data.attachments || []); }} title="Refresh files">
                                    <RefreshCw size={16} /> Refresh
                                </button>
                            </div>
                        )}
                        {files.length === 0 ? (
                            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>No files uploaded</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {files.map(f => (
                                    <div key={f._id} className="card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{ fontSize: '1.25rem' }}>{getFileIcon(f.fileType)}</span>
                                            <div>
                                                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{f.originalName}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                                    {(f.fileSize / 1024).toFixed(1)} KB · {f.uploadedBy?.name} · {format(new Date(f.createdAt), 'MMM d, yyyy')}
                                                </div>
                                            </div>
                                        </div>
                                        <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(f._id, f.originalName)} title="Download">
                                            <Download size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            }

            {/* Manage Team Modal */}
            <Modal isOpen={showTeamModal} onClose={() => setShowTeamModal(false)} zIndex={100}>
                <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 400, padding: 24 }}>
                            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 16 }}>Manage Team Members</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflow: 'auto', marginBottom: 20 } as React.CSSProperties}>
                                {users.map(u => {
                                    const isManualMember = assignment.team?.some((m: any) => m._id === u._id);
                                    const assignedTeam = assignment.teams?.find((t: any) =>
                                        t.manager?._id === u._id ||
                                        t.members?.some((m: any) => m._id === u._id) ||
                                        t.manager === u._id ||
                                        t.members?.includes(u._id)
                                    );

                                    return (
                                        <div key={u._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--color-surface-hover)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Avatar src={u.avatar} name={u.name} size={28} />
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{u.name}</span>
                                                    {assignedTeam && (
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                                                            Team: {assignedTeam.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                className={`btn btn-xs ${isManualMember ? 'btn-secondary' : 'btn-primary'}`}
                                                disabled={updatingTeam}
                                                onClick={() => {
                                                    const currentIds = assignment.team?.map((m: any) => m._id || m) || [];
                                                    const nextIds = isManualMember
                                                        ? currentIds.filter((tid: string) => tid !== u._id)
                                                        : [...currentIds, u._id];
                                                    handleUpdateTeam(nextIds);
                                                }}
                                            >
                                                {isManualMember ? 'Remove' : 'Add'}
                                            </button>

                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowTeamModal(false)}>Close</button>
                            </div>
                        </div>
                    </Modal>
        </div >
    );
};

export default AssignmentDetailPage;
