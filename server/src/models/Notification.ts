import mongoose, { Document, Schema } from 'mongoose';

export enum NotificationType {
    TASK_ASSIGNED = 'task_assigned',
    DEADLINE_APPROACHING = 'deadline_approaching',
    STATUS_CHANGED = 'status_changed',
    FILE_UPLOADED = 'file_uploaded',
    MENTION = 'mention',
    COMMENT_ADDED = 'comment_added',
    REPLY = 'reply',
    DIRECT_MESSAGE = 'direct_message',
    PROJECT_CREATED = 'project_created',
    CALENDAR_REMINDER = 'calendar_reminder',
    CALENDAR_SHARED = 'calendar_shared',
    EVENT_INVITE = 'event_invite',
    BOARD_INVITED = 'board_invited',
}

export interface INotification extends Document {
    user: mongoose.Types.ObjectId;
    type: NotificationType;
    title: string;
    message: string;
    isRead: boolean;
    link?: string;
    metadata?: any;
    createdAt: Date;
    updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: Object.values(NotificationType), required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        isRead: { type: Boolean, default: false },
        link: { type: String },
        metadata: { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', notificationSchema);
