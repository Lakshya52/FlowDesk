import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaign extends Document {
    name: string;
    purpose: string;
    description?: string;
    people: mongoose.Types.ObjectId[];
    tenantId: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
    {
        name: { type: String, required: true, trim: true },
        purpose: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        people: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

campaignSchema.index({ tenantId: 1 });
campaignSchema.index({ name: 1 });

export default mongoose.model<ICampaign>('Campaign', campaignSchema);
