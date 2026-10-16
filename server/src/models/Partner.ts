import mongoose, { Document, Schema } from 'mongoose';

export type PartnerType = 'company' | 'individual';

export interface IPartner extends Document {
    // New fields
    companyName?: string;
    personName: string;
    phone?: string;
    email?: string;
    pan?: string;
    gst?: string;
    partnerType: PartnerType;
    purpose?: string;
    description?: string;
    agreementFileName?: string;
    agreementOriginalName?: string;
    agreementFilePath?: string;
    agreementFileType?: string;
    agreementFileSize?: number;
    // Legacy (kept for old documents)
    name?: string;
    people?: mongoose.Types.ObjectId[];
    tenantId: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const partnerSchema = new Schema<IPartner>(
    {
        companyName: { type: String, trim: true },
        personName: { type: String, required: true, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        pan: { type: String, trim: true, uppercase: true },
        gst: { type: String, trim: true, uppercase: true },
        partnerType: { type: String, enum: ['company', 'individual'], default: 'company', required: true },
        purpose: { type: String, trim: true },
        description: { type: String, trim: true },
        agreementFileName: { type: String },
        agreementOriginalName: { type: String },
        agreementFilePath: { type: String },
        agreementFileType: { type: String },
        agreementFileSize: { type: Number },
        // Legacy
        name: { type: String, trim: true },
        people: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

partnerSchema.index({ tenantId: 1 });
partnerSchema.index({ companyName: 1 });
partnerSchema.index({ personName: 1 });
partnerSchema.index({ email: 1 });
partnerSchema.index({ phone: 1 });
// Legacy index parity
partnerSchema.index({ name: 1 });

export default mongoose.model<IPartner>('Partner', partnerSchema);
