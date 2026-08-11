import mongoose, { Document, Schema } from 'mongoose';
import { emitSuperAdminEvent } from '../services/superAdminEvents';

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

activityLogSchema.post('save', (doc: any) => {
    // Resolve the acting user + their tenant, then push a live event to super admins.
    // Fire-and-forget: never block the activity log write on the socket emit.
    mongoose
        .model('User')
        .findById(doc.user)
        .select('name email role')
        .lean()
        .then(async (user: any) => {
            let tenantName: string | null = null;
            if (user?.tenantId) {
                const tenant = (await mongoose
                    .model('Tenant')
                    .findById(user.tenantId)
                    .select('name')
                    .lean()) as { name?: string } | null;
                tenantName = tenant?.name || null;
            }
            emitSuperAdminEvent({
                type: 'activity',
                entityType: doc.entityType,
                action: doc.action,
                entityId: doc.entityId?.toString(),
                title: doc.metadata?.title || null,
                user: user ? { name: user.name, email: user.email, role: user.role } : null,
                tenant: tenantName,
                metadata: doc.metadata || undefined,
            });
        })
        .catch(() => {
            // broadcast is best-effort
        });
});

export default mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
