import mongoose, { Document, Schema } from 'mongoose';

// Fully customizable status vocabulary for file documents.
// Managed on the CRM → Conversions → Files → Docs Structure page.
export interface IDocStatus extends Document {
    name: string;
    color: string;
    order: number;
    isDefault: boolean;   // applied to newly added documents
    isResolved: boolean;  // counts as "done" in progress (e.g. Verified, Not Applicable)
    isActive: boolean;
    tenantId: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const docStatusSchema = new Schema<IDocStatus>(
    {
        name: { type: String, required: true, trim: true },
        color: { type: String, trim: true, default: '#94a3b8' },
        order: { type: Number, default: 0 },
        isDefault: { type: Boolean, default: false },
        isResolved: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

docStatusSchema.index({ tenantId: 1 });

export default mongoose.model<IDocStatus>('DocStatus', docStatusSchema);

// Seeded the first time a tenant opens the docs structure.
export const DEFAULT_DOC_STATUSES = [
    { name: 'Pending', color: '#94a3b8', order: 0, isDefault: true, isResolved: false },
    { name: 'Received', color: '#3b82f6', order: 1, isDefault: false, isResolved: false },
    { name: 'Verified', color: '#22c55e', order: 2, isDefault: false, isResolved: true },
    { name: 'Rejected', color: '#ef4444', order: 3, isDefault: false, isResolved: false },
    { name: 'Not Applicable', color: '#64748b', order: 4, isDefault: false, isResolved: true },
];
