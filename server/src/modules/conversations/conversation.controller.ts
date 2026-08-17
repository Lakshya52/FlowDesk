import { Response } from 'express';
import Conversation, { ConversationType } from './conversation.model';
import Message from './message.model';
import Attachment from '../files/attachment.model';
import User from '../users/user.model';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { io, activeUsers } from '../../index';
import { uploadToGridFS, deleteFromGridFS } from '../../shared/utils/gridfs';
import { createNotification } from '../../shared/services/notification.service';
import { NotificationType } from '../notifications/notification.model';

export const getConversations = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!._id;

        // Fetch all conversations where user is a participant
        const conversations = await Conversation.find({ participants: userId })
            .populate('participants', 'name email avatar role employeeId isActive')
            .populate('createdBy', 'name')
            .sort({ updatedAt: -1 });

        const results = await Promise.all(conversations.map(async (conv) => {
            // Find last message
            const lastMessage = await Message.findOne({ conversation: conv._id })
                .sort({ createdAt: -1 })
                .populate('sender', 'name email avatar')
                .populate('attachments');

            let lastMessageObj = lastMessage ? (lastMessage as any).toObject() : null;

            // Count unread messages (current user is not in readBy)
            const unreadCount = await Message.countDocuments({
                conversation: conv._id,
                sender: { $ne: userId },
                'readBy.user': { $ne: userId }
            });

            let name = conv.name;
            let avatar = conv.avatar;
            let isOnline = false;

            if (conv.type === ConversationType.DIRECT) {
                // Find the other participant (if self-chat, use self)
                const otherParticipant = conv.participants.find(p => p._id.toString() !== userId.toString()) || conv.participants[0];
                if (otherParticipant) {
                    name = (otherParticipant as any).name;
                    avatar = (otherParticipant as any).avatar;
                    isOnline = activeUsers.has((otherParticipant._id).toString());
                }
            }



            return {
                _id: conv._id,
                type: conv.type,
                name,
                avatar,
                participants: conv.participants,
                createdBy: conv.createdBy,
                admins: conv.admins,
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
                lastMessage: lastMessageObj,
                unreadCount,
                isOnline
            };
        }));

        // Sort by last message date, or conversation update date
        results.sort((a, b) => {
            const timeA = a.lastMessage ? a.lastMessage.createdAt.getTime() : a.updatedAt.getTime();
            const timeB = b.lastMessage ? b.lastMessage.createdAt.getTime() : b.updatedAt.getTime();
            return timeB - timeA;
        });

        // WhatsApp style: filter out direct conversations that have no messages
        const filteredResults = results.filter(c => {
            if (c.type === ConversationType.DIRECT) {
                return c.lastMessage !== null;
            }
            return true;
        });

        res.json({ conversations: filteredResults });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getMessages = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id: conversationId } = req.params;
        const userId = req.user!._id;

        // Check if conversation exists and user is participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            res.status(404).json({ message: 'Conversation not found' });
            return;
        }

        const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) {
            res.status(403).json({ message: 'Not authorized to view this conversation' });
            return;
        }

        // Mark all unread incoming messages in this conversation as read
        await Message.updateMany(
            {
                conversation: conversationId,
                sender: { $ne: userId },
                'readBy.user': { $ne: userId }
            },
            {
                $push: { readBy: { user: userId, readAt: new Date() } }
            }
        );

        // Fetch messages log
        const messages = await Message.find({ conversation: conversationId })
            .sort({ createdAt: 1 })
            .populate('sender', 'name email avatar role')
            .populate('attachments')
            .populate('mentions', 'name')
            .populate({
                path: 'parentMessage',
                populate: { path: 'sender', select: 'name' }
            });

        // Convert messages to plain objects
        const decryptedMessages = messages.map((msg: any) => {
            const msgObj = msg.toObject ? (msg as any).toObject() : msg;
            return msgObj;
        });

        // Notify other participants in the conversation that messages were read
        io.to(`conversation_${conversationId}`).emit('messages_read', {
            conversationId,
            readerId: userId.toString(),
            readAt: new Date().toISOString(),
        });

        res.json({ messages: decryptedMessages });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createConversation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { type, name, avatar, participants } = req.body;
        const userId = req.user!._id;

        if (!type || !participants || !Array.isArray(participants) || participants.length === 0) {
            res.status(400).json({ message: 'Type and participants are required' });
            return;
        }

        // Unique participants including creator
        const participantIds = Array.from(new Set([...participants, userId.toString()]));

        if (type === ConversationType.DIRECT) {
            if (participantIds.length > 2) {
                res.status(400).json({ message: 'Direct conversation can have at most 2 participants' });
                return;
            }

            const targetUserId = participantIds.find(p => p !== userId.toString()) || userId.toString();

            // Check if DM already exists
            const existing = await Conversation.findOne({
                type: ConversationType.DIRECT,
                participants: { $all: [userId, targetUserId], $size: participantIds.length }
            }).populate('participants', 'name email avatar role employeeId isActive');

            if (existing) {
                // Format the existing conversation to match getConversations response
                const lastMessage = await Message.findOne({ conversation: existing._id })
                    .sort({ createdAt: -1 })
                    .populate('sender', 'name email avatar')
                    .populate('attachments');



                const unreadCount = await Message.countDocuments({
                    conversation: existing._id,
                    sender: { $ne: userId },
                    'readBy.user': { $ne: userId }
                });

                const otherParticipant = existing.participants.find(p => p._id.toString() !== userId.toString()) || existing.participants[0];
                const isOnline = activeUsers.has(otherParticipant._id.toString());

                res.status(200).json({
                    conversation: {
                        _id: existing._id,
                        type: existing.type,
                        name: (otherParticipant as any).name,
                        avatar: (otherParticipant as any).avatar,
                        participants: existing.participants,
                        createdAt: existing.createdAt,
                        updatedAt: existing.updatedAt,
                        lastMessage,
                        unreadCount,
                        isOnline
                    }
                });
                return;
            }
        }

        // Create new conversation
        const conversation = await Conversation.create({
            type,
            name: type === ConversationType.GROUP ? (name || 'New Group') : undefined,
            avatar: type === ConversationType.GROUP ? (avatar || '') : undefined,
            participants: participantIds,
            createdBy: type === ConversationType.GROUP ? userId : undefined,
            admins: type === ConversationType.GROUP ? [userId] : undefined
        });

        const populated = await Conversation.findById(conversation._id)
            .populate('participants', 'name email avatar role employeeId isActive');

        if (!populated) {
            res.status(500).json({ message: 'Failed to create conversation' });
            return;
        }

        let formattedName = populated.name;
        let formattedAvatar = populated.avatar;
        let isOnline = false;

        if (populated.type === ConversationType.DIRECT) {
            const otherParticipant = populated.participants.find(p => p._id.toString() !== userId.toString()) || populated.participants[0];
            formattedName = (otherParticipant as any).name;
            formattedAvatar = (otherParticipant as any).avatar;
            isOnline = activeUsers.has(otherParticipant._id.toString());
        }

        const formattedResult = {
            _id: populated._id,
            type: populated.type,
            name: formattedName,
            avatar: formattedAvatar,
            participants: populated.participants,
            createdBy: populated.createdBy,
            admins: populated.admins,
            createdAt: populated.createdAt,
            updatedAt: populated.updatedAt,
            lastMessage: null,
            unreadCount: 0,
            isOnline
        };

        // Notify all participants about new conversation via their personal socket rooms
        participantIds.forEach(pId => {
            io.to(`user_${pId}`).emit('new_conversation', formattedResult);
        });

        res.status(201).json({ conversation: formattedResult });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id: conversationId } = req.params;
        const { content, mentions, parentMessageId } = req.body;
        const senderId = req.user!._id;

        // Check if conversation exists and user is participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            res.status(404).json({ message: 'Conversation not found' });
            return;
        }

        const isParticipant = conversation.participants.some(p => p.toString() === senderId.toString());
        if (!isParticipant) {
            res.status(403).json({ message: 'Not authorized to send messages to this conversation' });
            return;
        }

        let attachmentIds: string[] = [];

        // Handle attachment file upload via multer
        if (req.file) {
            const { filename } = await uploadToGridFS(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype
            );
            const attachment = await Attachment.create({
                fileName: filename,
                originalName: req.file.originalname,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                filePath: `/uploads/${filename}`,
                uploadedBy: senderId,
            });
            attachmentIds.push(attachment._id.toString());
        }

        // Create the message
        const message = await Message.create({
            conversation: conversationId,
            sender: senderId,
            content: content || '',
            attachments: attachmentIds,
            parentMessage: parentMessageId || undefined,
            mentions: mentions || [],
            readBy: [{ user: senderId, readAt: new Date() }] // Sender has read it
        });

        // Update conversation's updatedAt field
        conversation.updatedAt = new Date();
        await conversation.save();

        const populated = await Message.findById(message._id)
            .populate('sender', 'name email avatar role')
            .populate('attachments')
            .populate('mentions', 'name')
            .populate({
                path: 'parentMessage',
                populate: { path: 'sender', select: 'name' }
            });

        if (!populated) {
            res.status(500).json({ message: 'Failed to populate message' });
            return;
        }

        // Emit new message event to all participants' personal rooms
        conversation.participants.forEach(pId => {
            io.to(`user_${pId.toString()}`).emit('new_chat_message', populated);
        });

        // Mentions notification triggering
        if (mentions && Array.isArray(mentions)) {
            const mentionPromises = mentions.map((mId: string) => {
                if (mId === senderId.toString()) return Promise.resolve(); // Don't notify self

                return createNotification({
                    user: mId,
                    type: NotificationType.DIRECT_MESSAGE,
                    title: 'New Mention',
                    message: `${req.user!.name} mentioned you in a chat message`,
                    link: `/chat?convId=${conversationId}&msgId=${message._id}`
                });
            });
            await Promise.all(mentionPromises);
        }

        res.status(201).json({ message: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const markConversationRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const userId = req.user!._id;
        const readAt = new Date();
        // Mark all unread incoming messages as read
        await Message.updateMany(
            {
                conversation: id,
                sender: { $ne: userId },
                'readBy.user': { $ne: userId },
            },
            { $push: { readBy: { user: userId, readAt } } }
        );
        // Broadcast read event
        io.to(`conversation_${id}`).emit('messages_read', {
            conversationId: id,
            readerId: userId.toString(),
            readAt: readAt.toISOString(),
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const toggleReaction = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user!._id;

        if (!emoji) {
            res.status(400).json({ message: 'Emoji is required' });
            return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
            res.status(404).json({ message: 'Message not found' });
            return;
        }

        // Verify if user is participant of conversation
        const conversation = await Conversation.findById(message.conversation);
        if (!conversation || !conversation.participants.some(p => p.toString() === userId.toString())) {
            res.status(403).json({ message: 'Not authorized' });
            return;
        }

        const existingReactionIndex = message.reactions.findIndex(r => r.user.toString() === userId.toString());

        if (existingReactionIndex > -1) {
            const currentEmoji = message.reactions[existingReactionIndex].emoji;
            if (currentEmoji === emoji) {
                // If same emoji, remove it (toggle off)
                message.reactions.splice(existingReactionIndex, 1);
            } else {
                // If different emoji, replace it
                message.reactions[existingReactionIndex].emoji = emoji;
            }
        } else {
            // Add new reaction
            message.reactions.push({ user: userId, emoji });
        }

        await message.save();

        const updated = await Message.findById(messageId)
            .populate('reactions.user', 'name');

        const socketPayload = {
            messageId,
            conversationId: message.conversation.toString(),
            reactions: updated ? updated.reactions : message.reactions
        };

        // Broadcast reaction update to the conversation room
        io.to(`conversation_${message.conversation}`).emit('message_reaction_updated', socketPayload);

        // Also emit to user rooms to update lists if needed
        conversation.participants.forEach(pId => {
            io.to(`user_${pId.toString()}`).emit('message_reaction_updated', socketPayload);
        });

        res.json({ reactions: socketPayload.reactions });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteConversation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id: conversationId } = req.params;
        const userId = req.user!._id;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            res.status(404).json({ message: 'Conversation not found' });
            return;
        }

        // Verify if user is participant
        const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) {
            res.status(403).json({ message: 'Not authorized to delete this conversation' });
            return;
        }

        // Delete all message attachments in this conversation
        const messages = await Message.find({ conversation: conversationId }).populate('attachments');
        for (const msg of messages) {
            if (msg.attachments && msg.attachments.length > 0) {
                for (const att of msg.attachments as any[]) {
                    try {
                        await deleteFromGridFS(att.fileName);
                        await Attachment.findByIdAndDelete(att._id);
                    } catch (err) {
                        console.error('Failed to delete conversation attachment:', err);
                    }
                }
            }
        }

        // Deleting the conversation document
        await Conversation.findByIdAndDelete(conversationId);

        // Delete all messages belonging to this conversation
        await Message.deleteMany({ conversation: conversationId });

        // Notify all participants so it disappears from their sidebar in real-time
        conversation.participants.forEach(pId => {
            io.to(`user_${pId.toString()}`).emit('conversation_deleted', conversationId);
        });

        res.json({ message: 'Conversation deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { messageId } = req.params;
        const userId = req.user!._id;

        const message = await Message.findById(messageId).populate('attachments');
        if (!message) {
            res.status(404).json({ message: 'Message not found' });
            return;
        }

        // Only sender can delete for everyone
        if (message.sender.toString() !== userId.toString()) {
            res.status(403).json({ message: 'Not authorized to delete this message' });
            return;
        }

        // Delete attachments from GridFS and Attachment collection
        if (message.attachments && message.attachments.length > 0) {
            for (const att of message.attachments as any[]) {
                try {
                    await deleteFromGridFS(att.fileName);
                    await Attachment.findByIdAndDelete(att._id);
                } catch (err) {
                    console.error('Failed to delete attachment file:', err);
                }
            }
        }

        message.content = 'This message was deleted';
        message.attachments = [];
        message.isDeleted = true;
        await message.save();

        // Notify participants
        const conversation = await Conversation.findById(message.conversation);
        if (conversation) {
            const socketPayload = {
                messageId: message._id,
                conversationId: message.conversation.toString(),
                content: message.content,
                attachments: [],
                isDeleted: true
            };
            conversation.participants.forEach(pId => {
                io.to(`user_${pId.toString()}`).emit('message_deleted', socketPayload);
            });
        }

        res.json({ message });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const forwardMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { messageId } = req.params;
        const { targetConversationId } = req.body;
        const senderId = req.user!._id;

        if (!targetConversationId) {
            res.status(400).json({ message: 'Target conversation ID is required' });
            return;
        }

        // Find original message
        const originalMessage = await Message.findById(messageId).populate('attachments');
        if (!originalMessage) {
            res.status(404).json({ message: 'Original message not found' });
            return;
        }

        // Check if target conversation exists and current user is a participant
        const targetConversation = await Conversation.findById(targetConversationId);
        if (!targetConversation) {
            res.status(404).json({ message: 'Target conversation not found' });
            return;
        }

        const isParticipant = targetConversation.participants.some(p => p.toString() === senderId.toString());
        if (!isParticipant) {
            res.status(403).json({ message: 'Not authorized to send messages to this conversation' });
            return;
        }

        // Clone the original attachments
        const attachmentIds = originalMessage.attachments.map(att => (att as any)._id.toString());

        // Forward the message
        const forwarded = await Message.create({
            conversation: targetConversationId,
            sender: senderId,
            content: originalMessage.content || '',
            attachments: attachmentIds,
            readBy: [{ user: senderId, readAt: new Date() }]
        });

        // Update target conversation's updatedAt field
        targetConversation.updatedAt = new Date();
        await targetConversation.save();

        const populated = await Message.findById(forwarded._id)
            .populate('sender', 'name email avatar role')
            .populate('attachments')
            .populate({
                path: 'parentMessage',
                populate: { path: 'sender', select: 'name' }
            });

        if (!populated) {
            res.status(500).json({ message: 'Failed to populate forwarded message' });
            return;
        }

        // Emit new message event to all participants of target conversation
        targetConversation.participants.forEach(pId => {
            io.to(`user_${pId.toString()}`).emit('new_chat_message', populated);
        });

        res.status(201).json({ message: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const editMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        const userId = req.user!._id;

        if (!content || !content.trim()) {
            res.status(400).json({ message: 'Content is required to edit message' });
            return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
            res.status(404).json({ message: 'Message not found' });
            return;
        }

        if (message.sender.toString() !== userId.toString()) {
            res.status(403).json({ message: 'You are not authorized to edit this message' });
            return;
        }

        if (message.isDeleted) {
            res.status(400).json({ message: 'Cannot edit a deleted message' });
            return;
        }

        // Update message content
        message.content = content.trim();
        message.isEdited = true;
        await message.save();

        const populated = await Message.findById(message._id)
            .populate('sender', 'name email avatar role')
            .populate('attachments')
            .populate({
                path: 'parentMessage',
                populate: { path: 'sender', select: 'name' }
            });

        if (!populated) {
            res.status(500).json({ message: 'Failed to populate edited message' });
            return;
        }

        // Notify all participants of the conversation
        const conversation = await Conversation.findById(message.conversation);
        if (conversation) {
            conversation.participants.forEach(pId => {
                io.to(`user_${pId.toString()}`).emit('message_edited', populated);
            });
        }

        res.json({ message: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
