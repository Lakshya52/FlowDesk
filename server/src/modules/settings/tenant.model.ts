import mongoose, { Document, Schema } from 'mongoose';

export type TenantPlan = 'free' | 'starter' | 'pro' | 'enterprise';

export interface ITenantSettings {
    geoFenceRadius: number;
}

export interface ITenant extends Document {
    name: string;
    website?: string;
    phone?: string;
    industry?: string;
    ownerId: mongoose.Types.ObjectId;
    plan: TenantPlan;
    isActive: boolean;
    maxUsers: number | null;
    trialEndsAt?: Date;
    settings: ITenantSettings;
    createdAt: Date;
    updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
    {
        name: { type: String, required: true, trim: true },
        website: { type: String, trim: true },
        phone: { type: String, trim: true },
        industry: { type: String, trim: true },
        ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        plan: {
            type: String,
            enum: ['free', 'starter', 'pro', 'enterprise'],
            default: 'free',
        },
        isActive: { type: Boolean, default: true },
        maxUsers: { type: Number, default: null },
        trialEndsAt: { type: Date, default: null },
        settings: {
            type: {
                geoFenceRadius: { type: Number, default: 100, min: 10, max: 10000 },
            },
            default: () => ({ geoFenceRadius: 100 }),
        },
    },
    { timestamps: true }
);

tenantSchema.index({ ownerId: 1 });
tenantSchema.index({ isActive: 1 });

export default mongoose.model<ITenant>('Tenant', tenantSchema);