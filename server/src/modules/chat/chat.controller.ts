import { Response } from 'express';
import ChatMessage from './chatMessage.model';
import Attachment from '../files/attachment.model';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { io } from '../../index';
import { createNotification } from '../../shared/services/notification.service';
import { NotificationType } from '../notifications/notification.model';

import { uploadToGridFS } from '../../shared/utils/gridfs';

export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { content, assignmentId, attachments: bodyAttachments, mentions, parentMessageId } = req.body;
        if (!assignmentId) {
            res.status(400).json({ message: 'assignmentId is required' });
            return;
        }

        // Authorization: user must be on the assignment team or be the creator
        const AssignmentModel = (await import('../assignments/assignment.model')).default;
        const assignment = await AssignmentModel.findById(assignmentId);
        if (!assignment) {
            res.status(404).json({ message: 'Assignment not found' });
            return;
        }
        const isInTeam = assignment.team?.some((id: any) => id.toString() === req.user!._id.toString());
        const isCreator = assignment.createdBy.toString() === req.user!._id.toString();
        if (req.user!.role !== 'admin' && !isInTeam && !isCreator) {
            res.status(403).json({ message: 'Not authorized to send messages in this assignment' });
            return;
        }
        let attachmentIds: string[] = [];
        if (bodyAttachments && Array.isArray(bodyAttachments) && bodyAttachments.length > 0) {
            for (const att of bodyAttachments) {
                if (typeof att === 'string') {
                    attachmentIds.push(att);
                } else if (att.buffer && att.originalName) {
                    const { filename } = await uploadToGridFS(
                        Buffer.from(att.buffer, 'base64'),
                        att.originalName,
                        att.fileType
                    );
                    const attachment = await Attachment.create({
                        fileName: filename,
                        originalName: att.originalName,
                        fileType: att.fileType,
                        fileSize: att.fileSize,
                        filePath: `/uploads/${filename}`,
                        uploadedBy: req.user!._id,
                    });
                    attachmentIds.push(attachment._id.toString());
                }
            }
        }

        // Create chat message
        const message = await ChatMessage.create({
            content: content || '',
            sender: req.user!._id,
            assignment: assignmentId,
            attachments: attachmentIds,
            mentions: mentions || [],
            parentMessage: parentMessageId,
        });

        const populated = await ChatMessage.findById(message._id)
            .populate('sender', 'name email avatar')
            .populate('mentions', 'name avatar')
            .populate({
                path: 'attachments',
                populate: { path: 'uploadedBy', select: 'name email' },
            })
            .populate({
                path: 'parentMessage',
                populate: { path: 'sender', select: 'name' }
            });

        // Convert to plain object for response
        const populatedObj = populated ? (populated as any).toObject() : null;

        // Emit to all users in the assignment room
        io.to(`assignment_${assignmentId}`).emit('new_message', populatedObj);

        // Notify mentioned users
        if (mentions && Array.isArray(mentions)) {
            const mentionPromises = mentions.map((userId: string) => {
                // Don't notify yourself
                if (userId === req.user!._id.toString()) return Promise.resolve();

                return createNotification({
                    user: userId,
                    type: NotificationType.MENTION,
                    title: 'New Mention',
                    message: `${req.user!.name} mentioned you in a message`,
                    link: `/assignments/${assignmentId}?tab=chat&msgId=${message._id}`,
                });
            });
            await Promise.all(mentionPromises);
        }

        // Notify reply recipient
        if (parentMessageId) {
            const parentMsg = await ChatMessage.findById(parentMessageId);
            if (parentMsg && parentMsg.sender.toString() !== req.user!._id.toString()) {
                await createNotification({
                    user: parentMsg.sender.toString(),
                    type: NotificationType.REPLY,
                    title: 'New Reply',
                    message: `${req.user!.name} replied to your message`,
                    link: `/assignments/${assignmentId}?tab=chat&msgId=${message._id}`,
                });
            }
        }

        res.status(201).json({ message: populatedObj });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getMessages = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { assignmentId, page = '1', limit = '50' } = req.query;
        if (!assignmentId) {
            res.status(400).json({ message: 'assignmentId is required' });
            return;
        }

        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
            res.status(400).json({ message: 'Invalid pagination parameters' });
            return;
        }
        const skip = (pageNum - 1) * limitNum;

        const total = await ChatMessage.countDocuments({ assignment: assignmentId });

        const messages = await ChatMessage.find({ assignment: assignmentId })
            .populate('sender', 'name email avatar')
            .populate('mentions', 'name avatar')
            .populate({
                path: 'attachments',
                populate: { path: 'uploadedBy', select: 'name email' },
            })
            .populate({
                path: 'parentMessage',
                populate: { path: 'sender', select: 'name' }
            })
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limitNum);

        // Convert messages to plain objects
        const decryptedMessages = messages.map(msg => {
            const msgObj = (msg as any).toObject();
            return msgObj;
        });

        res.json({ messages: decryptedMessages, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const message = await ChatMessage.findById(req.params.id);
        if (!message) {
            res.status(404).json({ message: 'Message not found' });
            return;
        }

        // Only sender or admin can delete
        if (message.sender.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
            res.status(403).json({ message: 'Not authorized to delete this message' });
            return;
        }

        await ChatMessage.findByIdAndDelete(req.params.id);
        res.json({ message: 'Message deleted' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
