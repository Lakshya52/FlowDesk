import mongoose, { Document, Schema } from 'mongoose';

// A required-document template entry inside a loan product.
export interface ILoanProductDoc {
    _id?: mongoose.Types.ObjectId;
    name: string;
    required: boolean;
    order: number;
}

export interface ILoanProduct extends Document {
    name: string;
    description?: string;
    isActive: boolean;
    order: number;
    docs: ILoanProductDoc[];
    tenantId: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const loanProductDocSchema = new Schema<ILoanProductDoc>(
    {
        name: { type: String, required: true, trim: true },
        required: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
    },
    { _id: true }
);

const loanProductSchema = new Schema<ILoanProduct>(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        isActive: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
        docs: { type: [loanProductDocSchema], default: [] },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

loanProductSchema.index({ tenantId: 1 });
loanProductSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model<ILoanProduct>('LoanProduct', loanProductSchema);
