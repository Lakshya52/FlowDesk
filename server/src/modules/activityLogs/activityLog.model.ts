import mongoose, { Document, Schema } from 'mongoose';

export enum EntityType {
    ASSIGNMENT = 'assignment',
    TASK = 'task',
    COMMENT = 'comment',
    ATTACHMENT = 'attachment',
    USER = 'user',
    COMPANY = 'company',
    CONTACT = 'contact',
    TEAM = 'team',
    CAMPAIGN = 'campaign',
    LEAD = 'lead',
}

export interface IActivityLog extends Document {
    action: string;
    user: mongoose.Types.ObjectId;
    entityType: EntityType;
    entityId: mongoose.Types.ObjectId;
    metadata?: Record<string, any>;
    createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
    {
        action: { type: String, required: true },
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        entityType: { type: String, enum: Object.values(EntityType), required: true },
        entityId: { type: Schema.Types.ObjectId, required: true },
        metadata: { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
activityLogSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
