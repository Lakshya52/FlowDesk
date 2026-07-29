import mongoose, { Document, Schema } from 'mongoose';

export interface IContact extends Document {
    companyId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    name: string;
    email?: string;
    phone?: string;
    phoneCountryCode?: string;
    position?: string;
    department?: string;
    isPrimary: boolean;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const contactSchema = new Schema<IContact>(
    {
        companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        name: { type: String, required: true, trim: true },
        email: { type: String, trim: true, lowercase: true },
        phone: { type: String, trim: true },
        phoneCountryCode: { type: String, trim: true, default: '+91' },
        position: { type: String, trim: true },
        department: { type: String, trim: true },
        isPrimary: { type: Boolean, default: false },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
);

contactSchema.index({ companyId: 1 });
contactSchema.index({ email: 1 });
contactSchema.index({ isPrimary: 1 });
contactSchema.index({ tenantId: 1 });

export default mongoose.model<IContact>('Contact', contactSchema);
