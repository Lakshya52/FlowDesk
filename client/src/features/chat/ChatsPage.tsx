import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from '@/store/authStore';
import { useChatStore, MessageSnippet, UserSnippet } from '@/store/chatStore';
import api from '@/lib/api';
import { io, Socket } from "socket.io-client";
import Avatar from '@/shared/components/Avatar';
import FilePreviewModal from '@/shared/components/FilePreviewModal';
import Modal from '@/shared/components/Modal';
import toast from "react-hot-toast";
import {
  Search,
  MessageSquare,
  Paperclip,
  Send,
  Smile,
  Check,
  CheckCheck,
  X,
  FileText,
  Download,
  CornerUpRight,
  Trash2,
  Ban,
  Edit3,
  ChevronLeft,
  Reply,
  ReplyAll,
  PanelLeftOpen,
  Eye,
} from "lucide-react";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

// Cache for instant image previews — capped to prevent memory leaks
const MAX_PREVIEW_CACHE_SIZE = 50;
const localPreviewCache = new Map<string, string>();

function addToPreviewCache(key: string, url: string) {
  if (localPreviewCache.size >= MAX_PREVIEW_CACHE_SIZE) {
    // Evict the oldest entry safely
    const firstKey = localPreviewCache.keys().next().value;
    if (firstKey) {
      const oldUrl = localPreviewCache.get(firstKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      localPreviewCache.delete(firstKey);
    }
  }
  localPreviewCache.set(key, url);
}

// Inline delete confirmation component — replaces window.confirm()
function DeleteConfirm({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        background: "var(--color-surface)",
        border: "1px solid var(--color-danger)",
        borderRadius: 10,
        boxShadow: "var(--shadow-md)",
        fontSize: "11px",
        whiteSpace: "nowrap",
        zIndex: 50,
      }}
    >
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <button
        onClick={onConfirm}
        style={{
          border: "none",
          background: "var(--color-danger)",
          color: "white",
          borderRadius: 6,
          padding: "2px 8px",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "10px",
        }}
      >
        Yes
      </button>
      <button
        onClick={onCancel}
        style={{
          border: "1px solid var(--color-border)",
          background: "none",
          color: "var(--color-text-secondary)",
          borderRadius: 6,
          padding: "2px 8px",
          cursor: "pointer",
          fontSize: "10px",
        }}
      >
        No
      </button>
    </div>
  );
}

export default function ChatsPage() {
  const { user } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    setActiveChatUserId,
    fetchConversations,
    markAsRead,
    deleteConversation,
    handleConversationDeleted,
    handleMessageDeleted,
    isLoading,
    addConversation,
  } = useChatStore();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Local States
  const [messages, setMessages] = useState<MessageSnippet[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadingQueue, setUploadingQueue] = useState<
    {
      id: string;
      name: string;
      progress: number;
      status: "uploading" | "completed" | "failed";
    }[]
  >([]);
  const messagesCacheRef = useRef<Record<string, MessageSnippet[]>>({});
  const [typingUsers, setTypingUsers] = useState<
    { id: string; name: string }[]
  >([]);
  const [users, setUsers] = useState<UserSnippet[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isMobile = window.innerWidth < 768;

  // Hover States
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [hoveredContactId, setHoveredContactId] = useState<string | null>(null);

  // Message Features
  const [replyingTo, setReplyingTo] = useState<MessageSnippet | null>(null);
  const [showComposerEmoji, setShowComposerEmoji] = useState(false);
  const [forwardingMessage, setForwardingMessage] =
    useState<MessageSnippet | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<
    string | null
  >(null);
  const [forwardSearchQuery, setForwardSearchQuery] = useState("");
  const [forwardSuccessConvIds, setForwardSuccessConvIds] = useState<string[]>(
    [],
  );
  const [tempActiveConv, setTempActiveConv] = useState<any | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageInput, setEditMessageInput] = useState("");

  // Inline delete confirmation state
  const [pendingDeleteMsgId, setPendingDeleteMsgId] = useState<string | null>(
    null,
  );
  const [pendingDeleteConv, setPendingDeleteConv] = useState(false);

  // Mentions Autocomplete
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);

  // File Preview State
  const [previewFile, setPreviewFile] = useState<{ url: string, type: string, name: string } | null>(null);

  // Single persistent socket ref — never recreated on chat switch
  const socketRef = useRef<Socket | null>(null);
  const currentConvRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // ─── Socket: create ONCE on mount, clean up on unmount ───────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    const joinUser = () => {
      if (user?._id) socket.emit("join_user", user._id);
    };

    if (socket.connected) joinUser();
    socket.on("connect", joinUser);

    socket.on("new_chat_message", (message: MessageSnippet) => {
      const activeCid = currentConvRef.current;
      if (message.conversation === activeCid) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === message._id)) return prev;
          return [...prev, message];
        });
        markAsRead(activeCid!);
        // Also emit so sender sees double-tick immediately
        if (user?._id) {
          socket.emit("mark_messages_read", {
            conversationId: activeCid,
            readerId: user._id,
          });
        }
      }
    });

    socket.on(
      "message_reaction_updated",
      ({ messageId, conversationId, reactions }: any) => {
        if (conversationId === currentConvRef.current) {
          setMessages((prev) =>
            prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)),
          );
        }
      },
    );

    socket.on(
      "user_chat_typing",
      ({ conversationId, userName, userId }: any) => {
        if (conversationId === currentConvRef.current && userId !== user?._id) {
          setTypingUsers((prev) =>
            prev.some((u) => u.id === userId)
              ? prev
              : [...prev, { id: userId, name: userName }],
          );
        }
      },
    );

    socket.on("user_chat_stop_typing", ({ conversationId, userId }: any) => {
      if (conversationId === currentConvRef.current) {
        setTypingUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    });

    socket.on("conversation_deleted", (deletedConversationId: string) => {
      handleConversationDeleted(deletedConversationId);
    });

    socket.on("message_deleted", (payload: any) => {
      handleMessageDeleted(payload);
      if (payload.conversationId === currentConvRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === payload.messageId
              ? {
                  ...m,
                  content: payload.content,
                  attachments: payload.attachments,
                  isDeleted: payload.isDeleted,
                }
              : m,
          ),
        );
      }
    });

    socket.on("message_edited", (editedMessage: MessageSnippet) => {
      if (editedMessage.conversation === currentConvRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m._id === editedMessage._id ? editedMessage : m)),
        );
        // Also update cache
        messagesCacheRef.current[editedMessage.conversation] = (
          messagesCacheRef.current[editedMessage.conversation] || []
        ).map((m) => (m._id === editedMessage._id ? editedMessage : m));
      }
      // Sync sidebar last message snippet only — no full refetch
      useChatStore.getState().fetchConversations();
    });

    socket.on(
      "messages_read",
      ({
        conversationId,
        readerId,
        readAt,
      }: {
        conversationId: string;
        readerId: string;
        readAt: string;
      }) => {
        if (conversationId === currentConvRef.current) {
          setMessages((prev) =>
            prev.map((m) => {
              // Skip if this user already in readBy
              const alreadyRead = m.readBy?.some((r) => r.user === readerId);
              if (alreadyRead) return m;
              return {
                ...m,
                readBy: [
                  ...(m.readBy || []),
                  { user: readerId, readAt: new Date(readAt) },
                ],
              };
            }),
          );
        }
      },
    );

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  // ─── Join/leave conversation rooms when active chat changes ──────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Leave previous room
    if (currentConvRef.current) {
      socket.emit("leave_conversation", currentConvRef.current);
    }

    currentConvRef.current = activeConversationId;

    if (activeConversationId) {
      socket.emit("join_conversation", activeConversationId);
    }
  }, [activeConversationId]);

  // ─── Fetch users lazily on search ─────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim() || users.length > 0) return;
    const fetchUsers = async () => {
      try {
        const { data } = await api.get("/auth/users?all=true");
        setUsers(data.users || []);
      } catch (err) {
        console.error("Failed to fetch users:", err);
      }
    };
    fetchUsers();
  }, [searchQuery, users.length]);

  // ─── Fetch messages for active conversation ───────────────────────────────
  useEffect(() => {
    if (
      activeConversationId &&
      messagesCacheRef.current[activeConversationId]
    ) {
      setMessages(messagesCacheRef.current[activeConversationId]);
      setLoadingMessages(false);
    } else {
      setMessages([]);
      if (activeConversationId) setLoadingMessages(true);
    }

    if (!activeConversationId) {
      setActiveChatUserId(null);
      setLoadingMessages(false);
      return;
    }

    const fetchMessages = async () => {
      try {
        const { data } = await api.get(
          `/conversations/${activeConversationId}/messages`,
        );
        const fetchedMsgs: MessageSnippet[] = data.messages || [];
        setMessages(fetchedMsgs);
        messagesCacheRef.current[activeConversationId] = fetchedMsgs;
        markAsRead(activeConversationId);
        // Tell the server you've read this conversation so
        // the sender's double-tick updates in real time
        if (socketRef.current && user?._id) {
          socketRef.current.emit("mark_messages_read", {
            conversationId: activeConversationId,
            readerId: user._id,
          });
        }

        const conv = useChatStore
          .getState()
          .conversations.find((c) => c._id === activeConversationId);
        if (conv?.type === "direct" && user) {
          const other = conv.participants.find((p) => p._id !== user._id);
          setActiveChatUserId(other?._id ?? null);
        } else {
          setActiveChatUserId(null);
        }
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
    setTypingUsers([]);
    setPendingDeleteMsgId(null);
  }, [activeConversationId, user?._id]);

  // ─── Scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  // ─── Sync messages to cache ref ───────────────────────────────────────────
  useEffect(() => {
    if (activeConversationId) {
      messagesCacheRef.current[activeConversationId] = messages;
    }
  }, [messages, activeConversationId]);

  // ─── Fetch all users for forward dialog ─────────────────────────────
  useEffect(() => {
    if (!forwardingMessage) return;

    const fetchUsersForForward = async () => {
      try {
        const { data } = await api.get("/auth/users?all=true");
        setUsers(data.users || []);
      } catch (err) {
        console.error("Failed to fetch users for forwarding:", err);
      }
    };

    fetchUsersForForward();
  }, [forwardingMessage]);

  // ─── Input & Typing ───────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessageInput(val);

    if (socketRef.current && activeConversationId && user) {
      socketRef.current.emit("chat_typing", {
        conversationId: activeConversationId,
        userName: user.name,
      });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit("chat_stop_typing", {
          conversationId: activeConversationId,
        });
      }, 2000);
    }

    // Mentions — support names with spaces via lookahead
    const cursorIdx = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.substring(0, cursorIdx);
    // Match @word or @word word up to cursor
    const lastWordMatch = textBeforeCursor.match(/@([\w\s]*)$/);
    if (lastWordMatch) {
      setShowMentions(true);
      setMentionFilter(lastWordMatch[1].toLowerCase());
      setMentionCursorPos(cursorIdx - lastWordMatch[1].length - 1);
    } else {
      setShowMentions(false);
    }
  };

  const selectMention = (selectedUser: UserSnippet) => {
    const before = messageInput.substring(0, mentionCursorPos);
    const after = messageInput.substring(
      mentionCursorPos + mentionFilter.length + 1,
    );
    setMessageInput(`${before}@${selectedUser.name} ${after}`);
    setShowMentions(false);
  };

  // ─── Send Message ─────────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // FIX: require actual text content — a bare reply with no text should not send
    if (!messageInput.trim()) return;
    if (!activeConversationId) return;

    const currentConv =
      conversations.find((c) => c._id === activeConversationId) ||
      tempActiveConv;
    const matchingMentions: string[] = [];
    if (currentConv) {
      currentConv.participants.forEach((p: any) => {
        if (messageInput.includes(`@${p.name}`)) matchingMentions.push(p._id);
      });
    }

    try {
      const formData = new FormData();
      formData.append("content", messageInput.trim());
      if (replyingTo) formData.append("parentMessageId", replyingTo._id);
      if (matchingMentions.length > 0)
        formData.append("mentions", JSON.stringify(matchingMentions));

      const { data } = await api.post(
        `/conversations/${activeConversationId}/messages`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      setMessages((prev) =>
        prev.some((m) => m._id === data.message._id)
          ? prev
          : [...prev, data.message],
      );
      setMessageInput("");
      setReplyingTo(null);

      socketRef.current?.emit("chat_stop_typing", {
        conversationId: activeConversationId,
      });

      // Update sidebar last message locally via store instead of full refetch
      fetchConversations();
      setTempActiveConv(null);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  // ─── File Upload ──────────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !activeConversationId) return;

    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const rejected: string[] = [];
    const filesToUpload: File[] = [];

    for (let i = 0; i < fileList.length; i++) {
      if (fileList[i].size > MAX_FILE_SIZE) {
        rejected.push(`"${fileList[i].name}" exceeds the 50 MB size limit`);
      } else {
        filesToUpload.push(fileList[i]);
        if (fileList[i].type.startsWith("image/")) {
          const objectUrl = URL.createObjectURL(fileList[i]);
          const key = `${fileList[i].name}-${fileList[i].size}`;
          addToPreviewCache(key, objectUrl); // FIX: use capped cache helper
        }
      }
    }

    if (rejected.length > 0)
      toast.error("Files not uploaded:\n\n" + rejected.join("\n"));
    if (filesToUpload.length === 0) return;

    const initialQueue = filesToUpload.map((file, idx) => ({
      id: `${Date.now()}-${idx}`,
      name: file.name,
      progress: 0,
      status: "uploading" as const,
    }));

    setUploadingQueue(initialQueue);
    setIsUploadingFile(true);

    try {
      await Promise.all(
        filesToUpload.map(async (file, idx) => {
          const queueId = initialQueue[idx].id;
          const formData = new FormData();
          formData.append("content", "");
          formData.append("file", file);
          if (replyingTo) formData.append("parentMessageId", replyingTo._id);

          try {
            const { data } = await api.post(
              `/conversations/${activeConversationId}/messages`,
              formData,
              {
                headers: { "Content-Type": "multipart/form-data" },
                onUploadProgress: (progressEvent) => {
                  const pct = Math.round(
                    (progressEvent.loaded * 100) / (progressEvent.total || 1),
                  );
                  setUploadingQueue((prev) =>
                    prev.map((item) =>
                      item.id === queueId ? { ...item, progress: pct } : item,
                    ),
                  );
                },
              },
            );
            setUploadingQueue((prev) =>
              prev.map((item) =>
                item.id === queueId
                  ? { ...item, progress: 100, status: "completed" }
                  : item,
              ),
            );
            setMessages((prev) =>
              prev.some((m) => m._id === data.message._id)
                ? prev
                : [...prev, data.message],
            );
          } catch (uploadError) {
            setUploadingQueue((prev) =>
              prev.map((item) =>
                item.id === queueId ? { ...item, status: "failed" } : item,
              ),
            );
            throw uploadError;
          }
        }),
      );

      setReplyingTo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchConversations();
      setTempActiveConv(null);
    } catch (err) {
      console.error("Failed to upload file attachments:", err);
    } finally {
      setTimeout(() => {
        setIsUploadingFile(false);
        setUploadingQueue([]);
      }, 1500);
    }
  };

  // ─── Reactions ────────────────────────────────────────────────────────────
  const handleReactToMessage = async (messageId: string, emoji: string) => {
    try {
      await api.post(`/conversations/messages/${messageId}/react`, { emoji });
      setActiveReactionPickerId(null);
    } catch (err) {
      console.error("Failed to react:", err);
    }
  };

  // ─── Delete Message (inline confirm) ─────────────────────────────────────
  const handleDeleteMessage = async (messageId: string) => {
    try {
      await api.delete(`/conversations/messages/${messageId}`);
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? {
                ...m,
                content: "This message was deleted",
                attachments: [],
                isDeleted: true,
              }
            : m,
        ),
      );
      setPendingDeleteMsgId(null);
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  // ─── Edit Message ─────────────────────────────────────────────────────────
  const handleEditMessage = async (messageId: string) => {
    if (!editMessageInput.trim()) return;
    try {
      const { data } = await api.put(`/conversations/messages/${messageId}`, {
        content: editMessageInput.trim(),
      });
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? data.message : m)),
      );
      setEditingMessageId(null);
      setEditMessageInput("");
    } catch (err) {
      console.error("Failed to edit message:", err);
    }
  };

  // ─── Delete Conversation (inline confirm) ─────────────────────────────────
  const handleDeleteConversation = async () => {
    if (!activeConversationId) return;
    try {
      await deleteConversation(activeConversationId);
      setMessages([]);
      setPendingDeleteConv(false);
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  // ─── Forward Message ──────────────────────────────────────────────────────
  // const handleForwardMessage = async (targetConversationId: string) => {
  //     if (!forwardingMessage) return;
  //     try {
  //         const { data } = await api.post(`/conversations/messages/${forwardingMessage._id}/forward`, { targetConversationId });
  //         setForwardSuccessConvIds(prev => [...prev, targetConversationId]);
  //         if (targetConversationId === activeConversationId) {
  //             setMessages(prev => prev.some(m => m._id === data.message._id) ? prev : [...prev, data.message]);
  //         }
  //         fetchConversations();
  //     } catch (err) {
  //         console.error('Failed to forward message:', err);
  //     }
  // };

  const handleForwardMessage = async (
    targetConversationId?: string,
    targetUserId?: string,
  ) => {
    if (!forwardingMessage) return;

    try {
      let finalConversationId = targetConversationId;

      // Create direct conversation if user selected
      if (!finalConversationId && targetUserId) {
        const { data: convData } = await api.post("/conversations", {
          type: "direct",
          participants: [targetUserId],
        });

        finalConversationId = convData.conversation._id;

        addConversation(convData.conversation);
      }

      if (!finalConversationId) return;

      const { data } = await api.post(
        `/conversations/messages/${forwardingMessage._id}/forward`,
        {
          targetConversationId: finalConversationId,
        },
      );

      setForwardSuccessConvIds((prev) => [...prev, finalConversationId!]);

      if (finalConversationId === activeConversationId) {
        setMessages((prev) =>
          prev.some((m) => m._id === data.message._id)
            ? prev
            : [...prev, data.message],
        );
      }

      fetchConversations();
    } catch (err) {
      console.error("Failed to forward message:", err);
    }
  };

  // ─── Start Direct Chat ────────────────────────────────────────────────────
  const handleStartDirectChat = async (targetUserId: string) => {
    try {
      const { data } = await api.post("/conversations", {
        type: "direct",
        participants: [targetUserId],
      });
      addConversation(data.conversation);
      setTempActiveConv(data.conversation);
      setActiveConversationId(data.conversation._id);
      setSearchQuery("");
      fetchConversations();
    } catch (err) {
      console.error("Failed to start direct conversation:", err);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const matchesNameStart = (name: string, query: string) => {
    if (!query) return true;
    const lq = query.toLowerCase().trim();
    return name
      .toLowerCase()
      .split(/\s+/)
      .some((p) => p.startsWith(lq));
  };

  const filteredConversations = conversations.filter((c) =>
    matchesNameStart(c.name, searchQuery),
  );

  const matchingExternalUsers = searchQuery.trim()
    ? users.filter((u) => {
        const inConversations = conversations.some(
          (c) =>
            c.type === "direct" && c.participants.some((p) => p._id === u._id),
        );
        return (
          !inConversations &&
          u._id !== user?._id &&
          matchesNameStart(u.name, searchQuery)
        );
      })
    : [];

  // ─── Forward modal search ───────────────────────────────────────────
  // const filteredForwardConversations = conversations.filter((c) =>
  //   matchesNameStart(c.name, forwardSearchQuery),
  // );

  const filteredForwardUsers = users.filter((u) => {
    if (u._id === user?._id) return false;

    return matchesNameStart(u.name, forwardSearchQuery);
  });

  const activeConv =
    conversations.find((c) => c._id === activeConversationId) || tempActiveConv;

  const formatMessageDateHeader = (dateStr: string) => {
    const msgDate = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (msgDate.toDateString() === today.toDateString()) return "Today";
    if (msgDate.toDateString() === yesterday.toDateString()) return "Yesterday";
    return msgDate.toLocaleDateString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  // FIX: Correctly determine read status — check if someone OTHER than sender has read it
  // const isMessageRead = useCallback((msg: MessageSnippet): boolean => {
  //     if (!msg.readBy || msg.readBy.length === 0) return false;
  //     return msg.readBy.some((r) => {
  //         // readBy entries are shaped as { user: string, readAt: Date }
  //         return r.user !== msg.sender._id;
  //     });
  // }, []);

  const isMessageRead = useCallback((msg: MessageSnippet): boolean => {
    if (!msg.readBy || msg.readBy.length === 0) return false;
    return msg.readBy.some((r) => {
      return String(r.user) !== String(msg.sender._id);
    });
  }, []);

  const renderMessageContent = (text: string) => {
    if (!text) return null;
    // const regex = /(@[\w][\w\s]*?)(?=\s@|\s|$)/g;
    const parts = text.split(/((?:@[\w][\w\s]*?)(?=\s@|\s|$))/g);
    return parts.map((part, idx) => {
      if (part.startsWith("@")) {
        return (
          <span
            key={idx}
            style={{
              fontWeight: 700,
              color: "var(--color-primary)",
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--color-primary-light)",
              fontSize: "0.75rem",
              display: "inline-block",
              margin: "2px 0",
              border: "1px solid rgba(99, 102, 241, 0.2)",
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  // Global keyframe styles — defined once at top level
  const globalStyles = `
        @keyframes chatsPageSpinner {
            to { transform: rotate(360deg); }
        }
        @keyframes pulse-dot {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;

  return (
    <>
      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || ""}
        fileType={previewFile?.type || ""}
        fileName={previewFile?.name || ""}
      />
      <style>{globalStyles}</style>
      <div
        style={{
          height: "calc(100vh - 120px)",
          display: "flex",
          borderRadius: isMobile ? 12 : 24,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* LEFT PANEL: Chats List — collapsible */}
        <div
          style={{
            width: sidebarCollapsed ? 0 : (isMobile ? '100%' : 340),
            minWidth: sidebarCollapsed ? 0 : (isMobile ? '100%' : 340),
            display: sidebarCollapsed && isMobile ? 'none' : 'flex',
            flexDirection: "column",
            borderRight: sidebarCollapsed
              ? "none"
              : "1px solid var(--color-border)",
            background: "var(--color-surface)",
            overflow: "hidden",
            transition: isMobile ? 'none' : "width 0.25s ease, min-width 0.25s ease",
            flexShrink: 0,
            ...(isMobile && !sidebarCollapsed ? { position: 'absolute' as any, inset: 0, zIndex: 20 } : {}),
          }}
        >
          <div
            style={{
              padding: 16,
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--color-text)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <MessageSquare
                  style={{ color: "var(--color-primary)" }}
                  size={22}
                />
                Chat
              </h2>
              {/* Collapse sidebar button */}
              <button
                onClick={() => setSidebarCollapsed(true)}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "var(--color-text-tertiary)",
                  padding: 4,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    "var(--color-surface-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "none")
                }
                title="Collapse sidebar"
              >
                <ChevronLeft size={18} />
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <Search
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--color-text-tertiary)",
                }}
                size={16}
              />
              <input
                type="text"
                placeholder="Search chats or find colleagues..."
                className="input"
                style={{ paddingLeft: 36 }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {isLoading ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 16px",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "2px solid var(--color-surface-hover)",
                    borderTopColor: "var(--color-primary)",
                    animation: "chatsPageSpinner 1s linear infinite",
                  }}
                />
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Loading conversations...
                </span>
              </div>
            ) : (
              <>
                {filteredConversations.length > 0 && (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    {filteredConversations.map((c) => {
                      const isActive = c._id === activeConversationId;
                      const showOnline = c.type === "direct" && c.isOnline;
                      const latestMsg = c.lastMessage;
                      const isHovered = hoveredConvId === c._id;

                      return (
                        <div
                          key={c._id}
                          onClick={() => {
                            setActiveConversationId(c._id);
                            // On mobile auto-collapse sidebar to show chat
                            if (isMobile) setSidebarCollapsed(true);
                          }}
                          onMouseEnter={() => setHoveredConvId(c._id)}
                          onMouseLeave={() => setHoveredConvId(null)}
                          style={{
                            padding: 12,
                            borderRadius: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            cursor: "pointer",
                            background: isActive
                              ? "var(--color-primary-light)"
                              : isHovered
                                ? "var(--color-surface-hover)"
                                : "transparent",
                            transition: "background 0.2s",
                            border: isActive
                              ? "1px solid rgba(99, 102, 241, 0.15)"
                              : "1px solid transparent",
                          }}
                        >
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            <Avatar src={c.avatar} name={c.name} size={40} />
                            {showOnline && (
                              <span
                                style={{
                                  position: "absolute",
                                  bottom: 0,
                                  right: 0,
                                  width: 10,
                                  height: 10,
                                  background: "#10b981",
                                  borderRadius: "50%",
                                  border: "2px solid var(--color-surface)",
                                }}
                              />
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: 4,
                              }}
                            >
                              <h4
                                style={{
                                  fontSize: "0.875rem",
                                  fontWeight: 600,
                                  margin: 0,
                                  color: "var(--color-text)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: "75%",
                                }}
                              >
                                {c.name}
                              </h4>
                              {latestMsg && (
                                <span
                                  style={{
                                    fontSize: "10px",
                                    color: "var(--color-text-tertiary)",
                                  }}
                                >
                                  {new Date(
                                    latestMsg.createdAt,
                                  ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <p
                                style={{
                                  fontSize: "0.75rem",
                                  color: isActive
                                    ? "var(--color-primary)"
                                    : "var(--color-text-secondary)",
                                  margin: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: "85%",
                                }}
                              >
                                {latestMsg ? (
                                  <>
                                    {latestMsg.sender._id === user?._id
                                      ? "You: "
                                      : `${latestMsg.sender.name}: `}
                                    {latestMsg.content || "Sent an attachment"}
                                  </>
                                ) : (
                                  "No messages yet"
                                )}
                              </p>
                              {c.unreadCount > 0 && (
                                <span
                                  style={{
                                    background: "var(--color-danger)",
                                    color: "white",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    borderRadius: "50%",
                                    minWidth: 18,
                                    height: 18,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "0 4px",
                                  }}
                                >
                                  {c.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {matchingExternalUsers.length > 0 && (
                  <div
                    style={{
                      paddingTop: 12,
                      borderTop: "1px solid var(--color-border)",
                      marginTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <h5
                      style={{
                        padding: "0 8px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "var(--color-text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        margin: "0 0 6px 0",
                      }}
                    >
                      Start new chat
                    </h5>
                    {matchingExternalUsers.map((u) => (
                      <div
                        key={u._id}
                        onClick={() => {
                          handleStartDirectChat(u._id);
                          if (isMobile) setSidebarCollapsed(true);
                        }}
                        onMouseEnter={() => setHoveredContactId(u._id)}
                        onMouseLeave={() => setHoveredContactId(null)}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          cursor: "pointer",
                          background:
                            hoveredContactId === u._id
                              ? "var(--color-surface-hover)"
                              : "transparent",
                          transition: "background 0.2s",
                        }}
                      >
                        <Avatar src={u.avatar} name={u.name} size={32} />
                        <div>
                          <h4
                            style={{
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              margin: 0,
                              color: "var(--color-text)",
                            }}
                          >
                            {u.name}
                          </h4>
                          <p
                            style={{
                              fontSize: "10px",
                              color: "var(--color-text-tertiary)",
                              margin: 0,
                              textTransform: "capitalize",
                            }}
                          >
                            {u.role}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {filteredConversations.length === 0 &&
                  matchingExternalUsers.length === 0 && (
                    <div
                      style={{
                        padding: "32px 16px",
                        textAlign: "center",
                        color: "var(--color-text-tertiary)",
                        fontSize: "0.75rem",
                      }}
                    >
                      No chats or members found
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Messages Board */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "var(--color-bg)",
            minWidth: 0,
          }}
        >
          {activeConv ? (
            <>
              {/* Conversation Header */}
              <div
                style={{
                  height: isMobile ? 56 : 64,
                  padding: isMobile ? "0 12px" : "0 24px",
                  borderBottom: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  zIndex: 10,
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Back / Expand sidebar button — visible when collapsed or always on mobile */}
                  {(sidebarCollapsed || isMobile) && (
                    <button
                      onClick={() => setSidebarCollapsed(false)}
                      style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        color: "var(--color-text-secondary)",
                        padding: 6,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--color-surface-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "none")
                      }
                      title="Show chat list"
                    >
                      {/* <MessageSquare size={18} /> */}
                      <PanelLeftOpen size={18} />
                    </button>
                  )}
                  <Avatar
                    src={activeConv.avatar}
                    name={activeConv.name}
                    size={38}
                  />
                  <div>
                    <h3
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        margin: 0,
                        color: "var(--color-text)",
                      }}
                    >
                      {activeConv.name}
                    </h3>
                    <p
                      style={{
                        fontSize: "10px",
                        color: "var(--color-text-tertiary)",
                        margin: 0,
                        fontWeight: 500,
                      }}
                    >
                      {typingUsers.length > 0 ? (
                        <span
                          style={{
                            color: "var(--color-primary)",
                            animation: "pulse-dot 1.5s infinite",
                          }}
                        >
                          {typingUsers.map((u) => u.name).join(", ")} typing...
                        </span>
                      ) : activeConv.type === "direct" ? (
                        activeConv.isOnline ? (
                          <span style={{ color: "#10b981" }}>Online</span>
                        ) : (
                          "Offline"
                        )
                      ) : (
                        `Group · ${activeConv.participants?.length || 0} participants`
                      )}
                    </p>
                  </div>
                </div>

                {/* Delete Chat — inline confirm */}
                <div style={{ position: "relative" }}>
                  {pendingDeleteConv ? (
                    <DeleteConfirm
                      label="Delete this chat?"
                      onConfirm={handleDeleteConversation}
                      onCancel={() => setPendingDeleteConv(false)}
                    />
                  ) : (
                    <button
                      onClick={() => setPendingDeleteConv(true)}
                      style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        color: "var(--color-text-tertiary)",
                        padding: "8px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(239, 68, 68, 0.1)";
                        e.currentTarget.style.color = "var(--color-danger)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "none";
                        e.currentTarget.style.color =
                          "var(--color-text-tertiary)";
                      }}
                      title="Delete Chat"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>

              {/* Messages Log Panel */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {loadingMessages ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      flex: 1,
                      justifyContent: "center",
                      alignItems: "center",
                      minHeight: "200px",
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        border: "3px solid var(--color-surface-hover)",
                        borderTopColor: "var(--color-primary)",
                        animation: "chatsPageSpinner 1s linear infinite",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--color-text-secondary)",
                        fontWeight: 500,
                      }}
                    >
                      Loading your messages...
                    </span>
                  </div>
                ) : messages.length === 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: 1,
                      color: "var(--color-text-tertiary)",
                      fontSize: "0.875rem",
                      textAlign: "center",
                      padding: "40px 20px",
                    }}
                  >
                    No messages yet. Send a message to start the conversation!
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMe = msg.sender._id === user?._id;
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const isNewDate =
                      !prevMsg ||
                      new Date(msg.createdAt).toDateString() !==
                        new Date(prevMsg.createdAt).toDateString();
                    // FIX: use corrected read status helper
                    const isRead = isMessageRead(msg);
                    const isMsgHovered = hoveredMsgId === msg._id;
                    const isGroup = activeConv.type === "group";

                    return (
                      <div
                        key={msg._id}
                        style={{ display: "flex", flexDirection: "column" }}
                      >
                        {isNewDate && (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center",
                              margin: "16px 0",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                color: "var(--color-text-tertiary)",
                                background: "var(--color-surface-hover)",
                                padding: "4px 12px",
                                borderRadius: 20,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              {formatMessageDateHeader(msg.createdAt)}
                            </span>
                          </div>
                        )}

                        <div
                          onMouseEnter={() => setHoveredMsgId(msg._id)}
                          onMouseLeave={() => {
                            setHoveredMsgId(null);
                          }}
                          style={{
                            display: "flex",
                            justifyContent: isMe ? "flex-end" : "flex-start",
                            alignItems: "flex-end",
                            gap: 8,
                            width: "100%",
                            position: "relative",
                          }}
                        >
                          {/* Avatar for received messages in group */}
                          {!isMe && isGroup && (
                            <div style={{ flexShrink: 0, marginBottom: 4 }}>
                              <Avatar
                                src={msg.sender.avatar}
                                name={msg.sender.name}
                                size={28}
                              />
                            </div>
                          )}

                          {/* Action Icons — my messages (left side) */}
                          {isMe && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                opacity:
                                  isMsgHovered ||
                                  activeReactionPickerId === msg._id
                                    ? 1
                                    : 0,
                                transition: "opacity 0.2s",
                                pointerEvents:
                                  isMsgHovered ||
                                  activeReactionPickerId === msg._id
                                    ? "auto"
                                    : "none",
                                flexDirection: "row-reverse",
                              }}
                            >
                              {/* Inline delete confirm for message */}
                              {pendingDeleteMsgId === msg._id ? (
                                <DeleteConfirm
                                  label="Delete for everyone?"
                                  onConfirm={() => handleDeleteMessage(msg._id)}
                                  onCancel={() => setPendingDeleteMsgId(null)}
                                />
                              ) : (
                                <>
                                  {/* Reaction picker */}
                                  <div style={{ position: "relative" }}>
                                    <button
                                      onClick={() =>
                                        setActiveReactionPickerId(
                                          activeReactionPickerId === msg._id
                                            ? null
                                            : msg._id,
                                        )
                                      }
                                      style={{
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        padding: "4px",
                                        color: "var(--color-text-tertiary)",
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        transition: "background 0.2s",
                                      }}
                                      onMouseEnter={(e) =>
                                        (e.currentTarget.style.background =
                                          "var(--color-surface-hover)")
                                      }
                                      onMouseLeave={(e) =>
                                        (e.currentTarget.style.background =
                                          "none")
                                      }
                                      title="React"
                                    >
                                      <Smile size={16} />
                                    </button>
                                    {activeReactionPickerId === msg._id && (
                                      <div
                                        style={{
                                          position: "absolute",
                                          bottom: "100%",
                                          right: 0,
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                          padding: "6px 8px",
                                          background: "var(--color-surface)",
                                          border:
                                            "1px solid var(--color-border)",
                                          borderRadius: 12,
                                          boxShadow: "var(--shadow-lg)",
                                          zIndex: 60,
                                          whiteSpace: "nowrap",
                                          marginBottom: 6,
                                        }}
                                      >
                                        {emojis.map((e) => (
                                          <button
                                            key={e}
                                            onClick={() => {
                                              handleReactToMessage(msg._id, e);
                                              setActiveReactionPickerId(null);
                                            }}
                                            style={{
                                              border: "none",
                                              background: "none",
                                              cursor: "pointer",
                                              padding: "2px 4px",
                                              fontSize: "1rem",
                                              transition: "transform 0.1s",
                                            }}
                                            onMouseEnter={(e) =>
                                              (e.currentTarget.style.transform =
                                                "scale(1.25)")
                                            }
                                            onMouseLeave={(e) =>
                                              (e.currentTarget.style.transform =
                                                "scale(1)")
                                            }
                                          >
                                            {e}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {/* Forward */}
                                  <button
                                    onClick={() => {
                                      setForwardingMessage(msg);
                                      setForwardSuccessConvIds([]);
                                    }}
                                    style={{
                                      border: "none",
                                      background: "none",
                                      cursor: "pointer",
                                      padding: "4px",
                                      color: "var(--color-text-tertiary)",
                                      borderRadius: "50%",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      transition: "background 0.2s",
                                    }}
                                    onMouseEnter={(e) =>
                                      (e.currentTarget.style.background =
                                        "var(--color-surface-hover)")
                                    }
                                    onMouseLeave={(e) =>
                                      (e.currentTarget.style.background =
                                        "none")
                                    }
                                    title="Forward"
                                  >
                                    <ReplyAll
                                      size={20}
                                      style={{ transform: "scaleX(-1)" }}
                                    />
                                  </button>

                                  {/* Reply */}
                                  <button
                                    onClick={() => setReplyingTo(msg)}
                                    style={{
                                      border: "none",
                                      background: "none",
                                      cursor: "pointer",
                                      padding: "4px",
                                      color: "var(--color-text-tertiary)",
                                      borderRadius: "50%",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      transition: "background 0.2s",
                                    }}
                                    onMouseEnter={(e) =>
                                      (e.currentTarget.style.background =
                                        "var(--color-surface-hover)")
                                    }
                                    onMouseLeave={(e) =>
                                      (e.currentTarget.style.background =
                                        "none")
                                    }
                                    title="Reply"
                                  >
                                    <Reply size={20} />
                                  </button>

                                  {/* Edit */}
                                  {!msg.isDeleted && (
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(msg._id);
                                        setEditMessageInput(msg.content);
                                      }}
                                      style={{
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        padding: "4px",
                                        color: "var(--color-text-tertiary)",
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        transition: "background 0.2s",
                                      }}
                                      onMouseEnter={(e) =>
                                        (e.currentTarget.style.background =
                                          "var(--color-surface-hover)")
                                      }
                                      onMouseLeave={(e) =>
                                        (e.currentTarget.style.background =
                                          "none")
                                      }
                                      title="Edit"
                                    >
                                      <Edit3 size={16} />
                                    </button>
                                  )}

                                  {/* Delete */}
                                  {!msg.isDeleted && (
                                    <button
                                      onClick={() =>
                                        setPendingDeleteMsgId(msg._id)
                                      }
                                      style={{
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        padding: "4px",
                                        color: "var(--color-danger)",
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        transition: "background 0.2s",
                                      }}
                                      onMouseEnter={(e) =>
                                        (e.currentTarget.style.background =
                                          "rgba(239, 68, 68, 0.1)")
                                      }
                                      onMouseLeave={(e) =>
                                        (e.currentTarget.style.background =
                                          "none")
                                      }
                                      title="Delete for Everyone"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          <div
                            style={{ position: "relative", maxWidth: "70%" }}
                          >
                            {/* Sender name — group chats, received messages only */}
                            {!isMe && isGroup && (
                              <p
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  color: "var(--color-primary)",
                                  margin: "0 0 3px 4px",
                                }}
                              >
                                {msg.sender.name}
                              </p>
                            )}

                            {/* Reply context */}
                            {msg.parentMessage && (
                              <div
                                style={{
                                  marginBottom: 4,
                                  padding: 8,
                                  borderRadius: 10,
                                  background: "rgba(0,0,0,0.05)",
                                  borderLeft: "4px solid var(--color-border)",
                                  fontSize: "11px",
                                  color: "var(--color-text-secondary)",
                                }}
                              >
                                <span
                                  style={{ fontWeight: 600, display: "block" }}
                                >
                                  {msg.parentMessage.sender.name}
                                </span>
                                <span
                                  style={{
                                    display: "block",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {msg.parentMessage.content}
                                </span>
                              </div>
                            )}

                            {/* Main Bubble */}
                            <div
                              style={{
                                padding: "10px 14px",
                                borderRadius: isMe
                                  ? "16px 16px 0px 16px"
                                  : "16px 16px 16px 0px",
                                background: isMe
                                  ? "var(--color-primary)"
                                  : "var(--color-surface)",
                                color: isMe ? "white" : "var(--color-text)",
                                border: isMe
                                  ? "none"
                                  : "1px solid var(--color-border)",
                                boxShadow: "var(--shadow-sm)",
                                wordBreak: "break-word",
                                fontSize: "0.875rem",
                              }}
                            >
                              {msg.isDeleted ? (
                                <span
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontStyle: "italic",
                                    opacity: 0.7,
                                    fontSize: "0.8125rem",
                                    color: isMe
                                      ? "rgba(255,255,255,0.8)"
                                      : "var(--color-text-tertiary)",
                                  }}
                                >
                                  <Ban size={14} />
                                  This message was deleted
                                </span>
                              ) : editingMessageId === msg._id ? (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                  }}
                                >
                                  <textarea
                                    className="input"
                                    style={{
                                      width: "100%",
                                      minWidth: 200,
                                      height: 60,
                                      background: isMe
                                        ? "rgba(255,255,255,0.15)"
                                        : "var(--color-bg)",
                                      color: isMe
                                        ? "white"
                                        : "var(--color-text)",
                                      border: "1px solid rgba(255,255,255,0.3)",
                                      borderRadius: 8,
                                      fontSize: "0.875rem",
                                      padding: 8,
                                      resize: "none",
                                    }}
                                    value={editMessageInput}
                                    onChange={(e) =>
                                      setEditMessageInput(e.target.value)
                                    }
                                    autoFocus
                                  />
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      gap: 6,
                                    }}
                                  >
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(null);
                                        setEditMessageInput("");
                                      }}
                                      className="btn btn-ghost"
                                      style={{
                                        height: 24,
                                        padding: "0 8px",
                                        fontSize: "10px",
                                        color: isMe
                                          ? "rgba(255,255,255,0.8)"
                                          : "var(--color-text-secondary)",
                                      }}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleEditMessage(msg._id)}
                                      className="btn btn-primary"
                                      style={{
                                        height: 24,
                                        padding: "0 12px",
                                        fontSize: "10px",
                                        borderRadius: 6,
                                        background: isMe
                                          ? "white"
                                          : "var(--color-primary)",
                                        color: isMe
                                          ? "var(--color-primary)"
                                          : "white",
                                        border: "none",
                                        fontWeight: 700,
                                      }}
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {msg.attachments &&
                                    msg.attachments.length > 0 && (
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 8,
                                          marginBottom: 6,
                                        }}
                                      >
                                        {msg.attachments.map((att) => {
                                          const cacheKey = `${att.originalName || att.fileName || att.filename}-${att.fileSize || 0}`;
                                          const localUrl =
                                            localPreviewCache.get(cacheKey);
                                          const fileUrl =
                                            localUrl ||
                                            (att.filePath
                                              ? `${SOCKET_URL}${att.filePath}`
                                              : `${SOCKET_URL}/uploads/${att.fileName || att.filename}`);
                                          const ext =
                                            (
                                              att.fileName ||
                                              att.filename ||
                                              att.originalName ||
                                              ""
                                            )
                                              .split(".")
                                              .pop()
                                              ?.toLowerCase() || "";
                                          const isImage =
                                            att.fileType?.startsWith(
                                              "image/",
                                            ) ||
                                            att.contentType?.startsWith(
                                              "image/",
                                            ) ||
                                            [
                                              "png",
                                              "jpg",
                                              "jpeg",
                                              "gif",
                                              "webp",
                                              "svg",
                                            ].includes(ext);

                                          if (isImage) {
                                            return (
                                              <div
                                                key={att._id}
                                                style={{
                                                  position: "relative",
                                                  borderRadius: 8,
                                                  overflow: "hidden",
                                                  maxWidth: 220,
                                                }}
                                              >
                                                <img
                                                  src={fileUrl}
                                                  alt={att.originalName}
                                                  style={{
                                                    objectFit: "cover",
                                                    maxHeight: 150,
                                                    width: "100%",
                                                    borderRadius: 8,
                                                    display: "block",
                                                  }}
                                                />
                                                <div
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      setPreviewFile({
                                                          url: fileUrl,
                                                          type: att.fileType || att.contentType || `image/${ext}`,
                                                          name: att.originalName || att.fileName || att.filename || ''
                                                      });
                                                  }}
                                                  style={{
                                                    position: "absolute",
                                                    inset: 0,
                                                    background:
                                                      "rgba(0,0,0,0.4)",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    color: "white",
                                                    cursor: "pointer",
                                                  }}
                                                >
                                                  <Eye size={18} />
                                                </div>
                                              </div>
                                            );
                                          }
                                          return (
                                            <div
                                              key={att._id}
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  setPreviewFile({
                                                      url: fileUrl,
                                                      type: att.fileType || att.contentType || '',
                                                      name: att.originalName || att.fileName || att.filename || ''
                                                  });
                                              }}
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                padding: 8,
                                                borderRadius: 8,
                                                background: isMe
                                                  ? "rgba(255,255,255,0.15)"
                                                  : "var(--color-bg)",
                                                border:
                                                  "1px solid rgba(0,0,0,0.05)",
                                                color: "inherit",
                                                cursor: "pointer",
                                              }}
                                            >
                                              <FileText
                                                size={20}
                                                style={{
                                                  color: isMe
                                                    ? "white"
                                                    : "var(--color-primary)",
                                                }}
                                              />
                                              <div
                                                style={{ flex: 1, minWidth: 0 }}
                                              >
                                                <p
                                                  style={{
                                                    fontSize: "0.75rem",
                                                    fontWeight: 600,
                                                    margin: 0,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  {att.originalName}
                                                </p>
                                                <p
                                                  style={{
                                                    fontSize: "9px",
                                                    opacity: 0.8,
                                                    margin: 0,
                                                  }}
                                                >
                                                  {(
                                                    att.fileSize / 1024
                                                  ).toFixed(1)}{" "}
                                                  KB
                                                </p>
                                              </div>
                                              <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Trigger download
                                                    const link = document.createElement('a');
                                                    link.href = fileUrl;
                                                    link.download = att.originalName;
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    link.remove();
                                                }}
                                                style={{
                                                  color: "inherit",
                                                  display: "flex",
                                                  cursor: "pointer",
                                                  padding: "4px",
                                                  borderRadius: "4px"
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.1)"}
                                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                              >
                                                <Download size={14} />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                  {msg.content && (
                                    <p
                                      style={{
                                        margin: 0,
                                        lineHeight: 1.5,
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      {renderMessageContent(msg.content)}
                                      {msg.isEdited && (
                                        <span
                                          style={{
                                            fontSize: "10px",
                                            opacity: 0.7,
                                            marginLeft: 6,
                                            fontStyle: "italic",
                                            color: "inherit",
                                            display: "inline-block",
                                          }}
                                        >
                                          (edited)
                                        </span>
                                      )}
                                    </p>
                                  )}
                                </>
                              )}

                              {/* Message footer: time + read receipt */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  gap: 4,
                                  marginTop: 4,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "9px",
                                    opacity: 0.7,
                                    color: isMe
                                      ? "rgba(255,255,255,0.8)"
                                      : "var(--color-text-tertiary)",
                                  }}
                                >
                                  {new Date(msg.createdAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                                {/* FIX: show read receipt using corrected isMessageRead helper */}
                                {isMe &&
                                  (isRead ? (
                                    <CheckCheck
                                      size={12}
                                      style={{ color: "#93c5fd" }}
                                    />
                                  ) : (
                                    <Check
                                      size={12}
                                      style={{ color: "rgba(255,255,255,0.6)" }}
                                    />
                                  ))}
                              </div>
                            </div>

                            {/* Reaction Pills */}
                            {msg.reactions && msg.reactions.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 4,
                                  marginTop: 4,
                                  justifyContent: isMe
                                    ? "flex-end"
                                    : "flex-start",
                                }}
                              >
                                {Object.entries(
                                  msg.reactions.reduce(
                                    (acc: Record<string, number>, cur) => {
                                      acc[cur.emoji] =
                                        (acc[cur.emoji] || 0) + 1;
                                      return acc;
                                    },
                                    {},
                                  ),
                                ).map(([emoji, count]) => (
                                  <button
                                    key={emoji}
                                    onClick={() =>
                                      handleReactToMessage(msg._id, emoji)
                                    }
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 2,
                                      padding: "2px 6px",
                                      borderRadius: 12,
                                      background: "var(--color-surface)",
                                      border: "1px solid var(--color-border)",
                                      fontSize: "10px",
                                      cursor: "pointer",
                                      boxShadow: "var(--shadow-sm)",
                                    }}
                                    title={msg.reactions
                                      .filter((r) => r.emoji === emoji)
                                      .map((r) => r.user.name)
                                      .join(", ")}
                                  >
                                    <span>{emoji}</span>
                                    <span
                                      style={{
                                        fontWeight: 600,
                                        color: "var(--color-text-secondary)",
                                      }}
                                    >
                                      {count}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Action Icons — received messages (right side), now includes Reply */}
                          {!isMe && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                opacity:
                                  isMsgHovered ||
                                  activeReactionPickerId === msg._id
                                    ? 1
                                    : 0,
                                transition: "opacity 0.2s",
                                pointerEvents:
                                  isMsgHovered ||
                                  activeReactionPickerId === msg._id
                                    ? "auto"
                                    : "none",
                              }}
                            >
                              {/* Reaction */}
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={() =>
                                    setActiveReactionPickerId(
                                      activeReactionPickerId === msg._id
                                        ? null
                                        : msg._id,
                                    )
                                  }
                                  style={{
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                    padding: "4px",
                                    color: "var(--color-text-tertiary)",
                                    borderRadius: "50%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "background 0.2s",
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--color-surface-hover)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background = "none")
                                  }
                                  title="React"
                                >
                                  <Smile size={16} />
                                </button>
                                {activeReactionPickerId === msg._id && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      bottom: "100%",
                                      left: 0,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: "6px 8px",
                                      background: "var(--color-surface)",
                                      border: "1px solid var(--color-border)",
                                      borderRadius: 12,
                                      boxShadow: "var(--shadow-lg)",
                                      zIndex: 60,
                                      whiteSpace: "nowrap",
                                      marginBottom: 6,
                                    }}
                                  >
                                    {emojis.map((e) => (
                                      <button
                                        key={e}
                                        onClick={() => {
                                          handleReactToMessage(msg._id, e);
                                          setActiveReactionPickerId(null);
                                        }}
                                        style={{
                                          border: "none",
                                          background: "none",
                                          cursor: "pointer",
                                          padding: "2px 4px",
                                          fontSize: "1rem",
                                          transition: "transform 0.1s",
                                        }}
                                        onMouseEnter={(e) =>
                                          (e.currentTarget.style.transform =
                                            "scale(1.25)")
                                        }
                                        onMouseLeave={(e) =>
                                          (e.currentTarget.style.transform =
                                            "scale(1)")
                                        }
                                      >
                                        {e}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* FIX: Reply button now available on received messages too */}
                              <button
                                onClick={() => setReplyingTo(msg)}
                                style={{
                                  border: "none",
                                  background: "none",
                                  cursor: "pointer",
                                  padding: "4px",
                                  color: "var(--color-text-tertiary)",
                                  borderRadius: "50%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background =
                                    "var(--color-surface-hover)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background = "none")
                                }
                                title="Reply"
                              >
                                <Reply size={20} />
                              </button>

                              {/* Forward */}
                              <button
                                onClick={() => {
                                  setForwardingMessage(msg);
                                  setForwardSuccessConvIds([]);
                                }}
                                style={{
                                  border: "none",
                                  background: "none",
                                  cursor: "pointer",
                                  padding: "4px",
                                  color: "var(--color-text-tertiary)",
                                  borderRadius: "50%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background =
                                    "var(--color-surface-hover)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background = "none")
                                }
                                title="Forward"
                              >
                                {/* <CornerUpRight size={16} /> */}
                                <ReplyAll
                                  size={20}
                                  style={{ transform: "scaleX(-1)" }}
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* COMPOSER PANEL */}
              <div
                style={{
                  padding: 16,
                  borderTop: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  position: "relative",
                }}
              >
                {/* Mentions autocomplete */}
                {showMentions && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 16,
                      marginBottom: 8,
                      width: 240,
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      boxShadow: "var(--shadow-lg)",
                      maxHeight: 180,
                      overflowY: "auto",
                      padding: 6,
                      zIndex: 50,
                    }}
                  >
                    <div
                      style={{
                        padding: "4px 8px",
                        fontSize: "9px",
                        fontWeight: 700,
                        color: "var(--color-text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--color-border)",
                        marginBottom: 4,
                      }}
                    >
                      Mention Team Member
                    </div>
                    {activeConv.participants
                      .filter(
                        (p: any) =>
                          p._id !== user?._id &&
                          p.name.toLowerCase().includes(mentionFilter),
                      )
                      .map((p: any) => (
                        <div
                          key={p._id}
                          onClick={() => selectMention(p)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: 6,
                            cursor: "pointer",
                            borderRadius: 8,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "var(--color-surface-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <Avatar src={p.avatar} name={p.name} size={24} />
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "var(--color-text)",
                            }}
                          >
                            {p.name}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {/* Upload progress */}
                {isUploadingFile && uploadingQueue.length > 0 && (
                  <div
                    style={{
                      padding: "12px 16px",
                      background: "var(--color-surface)",
                      borderRadius: 16,
                      border: "1px solid var(--color-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      marginBottom: 8,
                      boxShadow: "var(--shadow-md)",
                      maxHeight: 180,
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--color-text-secondary)",
                        marginBottom: 2,
                      }}
                    >
                      Uploading attachments (
                      {
                        uploadingQueue.filter((f) => f.status === "completed")
                          .length
                      }
                      /{uploadingQueue.length})
                    </div>
                    {uploadingQueue.map((file) => (
                      <div
                        key={file.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            border: "2px solid var(--color-surface-hover)",
                            borderTopColor:
                              file.status === "failed"
                                ? "var(--color-danger)"
                                : file.status === "completed"
                                  ? "#10b981"
                                  : "var(--color-primary)",
                            animation:
                              file.status === "uploading"
                                ? "chatsPageSpinner 1s linear infinite"
                                : "none",
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: 2,
                              fontSize: "11px",
                            }}
                          >
                            <span
                              style={{
                                color: "var(--color-text)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "80%",
                              }}
                            >
                              {file.name}
                            </span>
                            <span
                              style={{
                                fontWeight: 600,
                                color:
                                  file.status === "failed"
                                    ? "var(--color-danger)"
                                    : file.status === "completed"
                                      ? "#10b981"
                                      : "var(--color-primary)",
                              }}
                            >
                              {file.status === "failed"
                                ? "Failed"
                                : file.status === "completed"
                                  ? "Done"
                                  : `${file.progress}%`}
                            </span>
                          </div>
                          <div
                            style={{
                              height: 4,
                              borderRadius: 2,
                              background: "var(--color-surface-hover)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${file.progress}%`,
                                background:
                                  file.status === "failed"
                                    ? "var(--color-danger)"
                                    : file.status === "completed"
                                      ? "#10b981"
                                      : "var(--color-primary)",
                                transition: "width 0.1s ease",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply preview */}
                {replyingTo && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 12,
                      background: "var(--color-surface-hover)",
                      borderLeft: "4px solid var(--color-primary)",
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: "12px" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          display: "block",
                          color: "var(--color-text)",
                        }}
                      >
                        Replying to {replyingTo.sender.name}
                      </span>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--color-text-secondary)",
                          fontSize: "11px",
                        }}
                      >
                        {replyingTo.content || "Attachment asset"}
                      </span>
                    </div>
                    <button
                      onClick={() => setReplyingTo(null)}
                      style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        padding: 4,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Composer form */}
                <form
                  onSubmit={handleSendMessage}
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                    title="Add attachment"
                  >
                    <Paperclip size={18} />
                  </button>

                  <div
                    style={{
                      flex: 1,
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <textarea
                      rows={1}
                      value={messageInput}
                      onChange={handleInputChange}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type a message... Use @ to mention"
                      className="input"
                      style={{
                        minHeight: 40,
                        maxHeight: 120,
                        paddingRight: 40,
                        resize: "none",
                        paddingTop: 10,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowComposerEmoji(!showComposerEmoji)}
                      style={{
                        position: "absolute",
                        right: 12,
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {showComposerEmoji ? (
                        <X size={18} />
                      ) : (
                        <Smile size={18} />
                      )}
                    </button>

                    {/* Emoji picker — higher zIndex than reaction picker */}
                    {showComposerEmoji && (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          bottom: "100%",
                          marginBottom: 12,
                          width: 250,
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 16,
                          boxShadow: "var(--shadow-xl)",
                          padding: 8,
                          display: "grid",
                          gridTemplateColumns: "repeat(6, 1fr)",
                          gap: 4,
                          zIndex: 70,
                        }}
                      >
                        {[
                          "😀",
                          "😃",
                          "😄",
                          "😁",
                          "😆",
                          "😅",
                          "😂",
                          "🤣",
                          "😊",
                          "😇",
                          "🙂",
                          "🙃",
                          "😉",
                          "😌",
                          "😍",
                          "🥰",
                          "😘",
                          "😗",
                          "😙",
                          "😚",
                          "😋",
                          "😛",
                          "😝",
                          "😜",
                          "🤪",
                          "🤨",
                          "🧐",
                          "🤓",
                          "😎",
                          "🥸",
                          "🥳",
                          "😏",
                          "😒",
                          "😞",
                          "😔",
                          "😟",
                        ].map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => {
                              setMessageInput((prev) => prev + e);
                              setShowComposerEmoji(false);
                            }}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              fontSize: "1.25rem",
                              padding: 4,
                            }}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            /* Unselected landing view */
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                textAlign: "center",
              }}
            >
              {sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="btn btn-secondary"
                  style={{
                    marginBottom: 24,
                    gap: 8,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <MessageSquare size={16} /> Show Chats
                </button>
              )}
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 24,
                  background: "var(--color-primary-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-primary)",
                  marginBottom: 24,
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <MessageSquare size={38} />
              </div>
              <h3
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  margin: "0 0 8px 0",
                  color: "var(--color-text)",
                }}
              >
                FlowDesk Chat
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--color-text-secondary)",
                  maxWidth: 320,
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Start direct conversations with colleagues in real-time. Share
                file uploads, mention colleagues, and react to messages
                instantly.
              </p>
            </div>
          )}
        </div>

        {/* MODAL: Forward Message */}
        <Modal isOpen={forwardingMessage !== null} onClose={() => { setForwardingMessage(null); setForwardSuccessConvIds([]); }} zIndex={1000}>
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 440,
              padding: 24,
              background: "var(--color-surface)",
              borderRadius: 16,
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "80vh",
            }}
          >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <h3
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    margin: 0,
                    color: "var(--color-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <CornerUpRight
                    style={{ color: "var(--color-primary)" }}
                    size={20}
                  />
                  Forward Message
                </h3>
                {/* FIX: also reset forwardSuccessConvIds on X close */}
                <button
                  onClick={() => {
                    setForwardingMessage(null);
                    setForwardSuccessConvIds([]);
                  }}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: "var(--color-text-secondary)",
                    display: "flex",
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  background: "var(--color-bg)",
                  borderLeft: "4px solid var(--color-primary)",
                  borderRadius: 8,
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                  marginBottom: 16,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{ fontWeight: 600, display: "block", marginBottom: 2 }}
                >
                  Original Message:
                </span>
                {forwardingMessage?.content || "[File Attachment]"}
              </div>

              {/* <div style={{ position: "relative", marginBottom: 16 }}> */}
              <div style={{ marginBottom: 16 }}>
                {/* <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: 13,
                    color: "var(--color-text-tertiary)",
                  }}
                /> */}
                <input
                  type="text"
                  className="input"
                  placeholder="Search chats..."
                  style={{
                    fontSize: "0.75rem",
                    paddingLeft: 38,
                    width: "100%",
                    height: 40,
                  }}
                  value={forwardSearchQuery}
                  onChange={(e) => setForwardSearchQuery(e.target.value)}
                />
                <div
                  style={{
                    marginTop: 12,
                    maxHeight: 300,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    padding: 8,
                    background: "var(--color-bg)",
                  }}
                >
                  {/* {filteredForwardConversations.map((conv) => (
                    <div
                      key={conv._id}
                      onClick={() => handleForwardMessage(conv._id)}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <Avatar src={conv.avatar} name={conv.name} size={36} />

                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{conv.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Existing conversation
                        </div>
                      </div>

                      {forwardSuccessConvIds.includes(conv._id) && (
                        <CheckCheck size={18} color="#10b981" />
                      )}
                    </div>
                  ))} */}

                  {filteredForwardUsers.map((u) => {
                    const existingConversation = conversations.find(
                      (c) =>
                        c.type === "direct" &&
                        c.participants.some((p) => p._id === u._id),
                    );

                    return (
                      <div
                        key={u._id}
                        onClick={() =>
                          handleForwardMessage(
                            existingConversation?._id,
                            !existingConversation ? u._id : undefined,
                          )
                        }
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <Avatar src={u.avatar} name={u.name} size={36} />

                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{u.name}</div>

                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {existingConversation
                              ? "Existing chat"
                              : "Start new chat"}
                          </div>
                        </div>

                        {existingConversation &&
                          forwardSuccessConvIds.includes(
                            existingConversation._id,
                          ) && <CheckCheck size={18} color="#10b981" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button
                  onClick={() => {
                    setForwardingMessage(null);
                    setForwardSuccessConvIds([]);
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1, fontSize: "0.75rem", fontWeight: 700 }}
                >
                  Done
                </button>
              </div>
            </div>
          </Modal>
      </div>
    </>
  );
}
