import { create } from 'zustand';
import api from '@/lib/api';

export interface UserSnippet {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
    role: string;
    employeeId?: string;
    isActive: boolean;
}

export interface AttachmentSnippet {
    _id: string;
    fileName: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    filePath?: string;
    filename?: string;
    contentType?: string;
}

export interface MessageSnippet {
    _id: string;
    conversation: string;
    sender: UserSnippet;
    content: string;
    attachments: AttachmentSnippet[];
    parentMessage?: {
        _id: string;
        content: string;
        sender: {
            name: string;
        };
    };
    mentions: UserSnippet[];
    reactions: {
        user: {
            _id: string;
            name: string;
        };
        emoji: string;
    }[];
    readBy: {
        user: string;
        readAt: Date;
    }[];
    isDeleted?: boolean;
    isEdited?: boolean;
    createdAt: string;
}

export interface ConversationSnippet {
    _id: string;
    type: 'direct' | 'group';
    name: string;
    avatar?: string;
    participants: UserSnippet[];
    createdBy?: {
        _id: string;
        name: string;
    };
    admins?: string[];
    createdAt: string;
    updatedAt: string;
    lastMessage: MessageSnippet | null;
    unreadCount: number;
    isOnline: boolean;
}

interface ChatState {
    conversations: ConversationSnippet[];
    totalUnreadCount: number;
    activeConversationId: string | null;
    activeChatUserId: string | null; // Track direct chat partner to ignore unread increments
    isLoading: boolean;
    fetchConversations: () => Promise<void>;
    setActiveConversationId: (id: string | null) => void;
    setActiveChatUserId: (id: string | null) => void;
    handleNewMessage: (message: MessageSnippet, currentUserId: string) => void;
    handleUserStatusChange: (userId: string, status: 'online' | 'offline', currentUserId?: string) => void;
    handleReactionUpdate: (messageId: string, conversationId: string, reactions: any[]) => void;
    markAsRead: (conversationId: string) => Promise<void>;
    updateLastMessage: (conversationId: string, message: MessageSnippet) => void;
    deleteConversation: (id: string) => Promise<void>;
    handleConversationDeleted: (id: string) => void;
    handleMessageDeleted: (payload: { messageId: string; conversationId: string; content: string; attachments: any[]; isDeleted: boolean }) => void;
    addConversation: (conv: ConversationSnippet) => void;
    setConversations: (conversations: ConversationSnippet[]) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
    conversations: [],
    totalUnreadCount: 0,
    activeConversationId: null,
    activeChatUserId: null,
    isLoading: false,

    fetchConversations: async () => {
        set({ isLoading: true });
        try {
            const { data } = await api.get('/conversations');
            const conversations = data.conversations || [];
            const totalUnreadCount = conversations.reduce((acc: number, cur: ConversationSnippet) => acc + cur.unreadCount, 0);
            set({ conversations, totalUnreadCount, isLoading: false });
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
            set({ isLoading: false });
        }
    },

    setActiveConversationId: (id) => {
        set({ activeConversationId: id });
        if (id) {
            // Clear unread count for this conversation in the store
            const { conversations } = get();
            const updated = conversations.map(c => {
                if (c._id === id) {
                    return { ...c, unreadCount: 0 };
                }
                return c;
            });
            const totalUnreadCount = updated.reduce((acc, cur) => acc + cur.unreadCount, 0);
            set({ conversations: updated, totalUnreadCount });
        }
    },

    setActiveChatUserId: (id) => {
        set({ activeChatUserId: id });
    },

    handleNewMessage: (message, currentUserId) => {
        const { conversations, activeConversationId } = get();
        const conversationId = message.conversation;

        // Check if conversation exists in list
        const exists = conversations.some(c => c._id === conversationId);

        if (!exists) {
            // Re-fetch conversation list to grab the new channel
            get().fetchConversations();
            return;
        }

        const updated = conversations.map(c => {
            if (c._id === conversationId) {
                const senderId = typeof message.sender === 'object' && message.sender !== null
                    ? message.sender._id
                    : message.sender;
                const isFromMe = String(senderId) === String(currentUserId);
                const isCurrentActive = String(activeConversationId) === String(conversationId);
                const increment = (!isFromMe && !isCurrentActive) ? 1 : 0;

                return {
                    ...c,
                    lastMessage: message,
                    unreadCount: c.unreadCount + increment,
                    updatedAt: new Date().toISOString()
                };
            }
            return c;
        });

        // Re-sort: put conversation at top
        updated.sort((a, b) => {
            const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
            const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
            return timeB - timeA;
        });

        const totalUnreadCount = updated.reduce((acc, cur) => acc + cur.unreadCount, 0);
        set({ conversations: updated, totalUnreadCount });
    },

    handleUserStatusChange: (userId, status, currentUserId) => {
        const { conversations } = get();
        const updated = conversations.map(c => {
            if (c.type === 'direct') {
                // Find if the status update is for the OTHER participant in this direct chat
                const otherParticipant = c.participants.find(p => p._id === userId && p._id !== currentUserId);
                if (otherParticipant) {
                    return { ...c, isOnline: status === 'online' };
                }
            }
            return c;
        });
        set({ conversations: updated });
    },

    handleReactionUpdate: (messageId, conversationId, reactions) => {
        const { conversations } = get();
        const updated = conversations.map(c => {
            if (c._id === conversationId && c.lastMessage?._id === messageId) {
                return {
                    ...c,
                    lastMessage: {
                        ...c.lastMessage,
                        reactions
                    }
                };
            }
            return c;
        });
        set({ conversations: updated });
    },

    // markAsRead: async (conversationId) => {
    //     try {
    //         await api.get(`/conversations/${conversationId}/messages`);
    //         const { conversations } = get();
    //         const updated = conversations.map(c => {
    //             if (c._id === conversationId) {
    //                 return { ...c, unreadCount: 0 };
    //             }
    //             return c;
    //         });
    //         const totalUnreadCount = updated.reduce((acc, cur) => acc + cur.unreadCount, 0);
    //         set({ conversations: updated, totalUnreadCount });
    //     } catch (error) {
    //         console.error('Failed to mark conversation as read:', error);
    //     }
    // },

    // markAsRead: async (conversationId) => {
    //     try {
    //         await api.post(`/conversations/${conversationId}/read`);
    //         const { conversations } = get();
    //         const updated = conversations.map(c => {
    //             if (c._id === conversationId) {
    //                 return { ...c, unreadCount: 0 };
    //             }
    //             return c;
    //         });
    //         const totalUnreadCount = updated.reduce((acc, cur) => acc + cur.unreadCount, 0);
    //         set({ conversations: updated, totalUnreadCount });
    //     } catch (error) {
    //         console.error('Failed to mark conversation as read:', error);
    //     }
    // },

     markAsRead: async (conversationId) => {
        // Just update the local unread badge — the actual DB read marking
        // is handled by getMessages (on fetch) and mark_messages_read (via socket)
        const { conversations } = get();
        const updated = conversations.map(c => {
            if (c._id === conversationId) {
                return { ...c, unreadCount: 0 };
            }
            return c;
        });
        const totalUnreadCount = updated.reduce((acc, cur) => acc + cur.unreadCount, 0);
        set({ conversations: updated, totalUnreadCount });
    },

    updateLastMessage: (conversationId, message) => {
        const { conversations } = get();
        const updated = conversations.map(c => {
            if (c._id === conversationId) {
                return { ...c, lastMessage: message };
            }
            return c;
        });
        set({ conversations: updated });
    },

    deleteConversation: async (id) => {
        try {
            await api.delete(`/conversations/${id}`);
            const { conversations, activeConversationId } = get();
            const updated = conversations.filter(c => c._id !== id);
            const totalUnreadCount = updated.reduce((acc, cur) => acc + cur.unreadCount, 0);
            const nextActiveId = activeConversationId === id ? null : activeConversationId;
            set({ conversations: updated, totalUnreadCount, activeConversationId: nextActiveId });
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        }
    },

    handleConversationDeleted: (id) => {
        const { conversations, activeConversationId } = get();
        const updated = conversations.filter(c => c._id !== id);
        const totalUnreadCount = updated.reduce((acc, cur) => acc + cur.unreadCount, 0);
        const nextActiveId = activeConversationId === id ? null : activeConversationId;
        set({ conversations: updated, totalUnreadCount, activeConversationId: nextActiveId });
    },

    handleMessageDeleted: (payload) => {
        const { conversations } = get();
        const updated = conversations.map(c => {
            if (c._id === payload.conversationId && c.lastMessage?._id === payload.messageId) {
                return {
                    ...c,
                    lastMessage: {
                        ...c.lastMessage,
                        content: payload.content,
                        attachments: payload.attachments,
                        isDeleted: payload.isDeleted
                    }
                };
            }
            return c;
        });
        set({ conversations: updated });
    },

    addConversation: (conv) => {
        const { conversations } = get();
        const exists = conversations.some(c => c._id === conv._id);
        if (!exists) {
            const updated = [conv, ...conversations];
            const totalUnreadCount = updated.reduce((acc, cur) => acc + cur.unreadCount, 0);
            set({ conversations: updated, totalUnreadCount });
        }
    },
    setConversations: (conversations) => {
        const totalUnreadCount = conversations.reduce((acc, cur) => acc + cur.unreadCount, 0);
        set({ conversations, totalUnreadCount });
    }
}));
