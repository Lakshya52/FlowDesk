import mongoose, { Document, Schema } from 'mongoose';

export interface ICompany extends Document {
    name: string;
    slug: string;
    tenantId: mongoose.Types.ObjectId;
    parentCompanyId?: mongoose.Types.ObjectId | null;
    industry?: string;
    description?: string;
    website?: string;
    email?: string;
    phone?: string;
    phoneCountryCode?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        postalCode?: string;
    };
    status: 'active' | 'inactive';
    plan: 'free' | 'starter' | 'business' | 'enterprise';
    subscriptionStartDate?: Date;
    subscriptionEndDate?: Date;
    ownerId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const companySchema = new Schema<ICompany>(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, lowercase: true, trim: true },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        parentCompanyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
        industry: { type: String, trim: true },
        description: { type: String, trim: true },
        website: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        phone: { type: String, trim: true },
        phoneCountryCode: { type: String, trim: true, default: '+91' },
        address: {
            street: { type: String, trim: true },
            city: { type: String, trim: true },
            state: { type: String, trim: true },
            country: { type: String, trim: true, default: 'India' },
            postalCode: { type: String, trim: true },
        },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' },
        plan: { type: String, enum: ['free', 'starter', 'business', 'enterprise'], default: 'free' },
        subscriptionStartDate: { type: Date },
        subscriptionEndDate: { type: Date },
        ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

companySchema.index({ tenantId: 1, slug: 1 }, { unique: true });
companySchema.index({ parentCompanyId: 1 });
companySchema.index({ name: 1 });
companySchema.index({ status: 1 });

// Virtual for child companies
companySchema.virtual('childCompanies', {
    ref: 'Company',
    localField: '_id',
    foreignField: 'parentCompanyId',
});

// Virtual for contacts
companySchema.virtual('contacts', {
    ref: 'Contact',
    localField: '_id',
    foreignField: 'companyId',
});

// Include virtuals in toJSON
companySchema.set('toJSON', { virtuals: true });
companySchema.set('toObject', { virtuals: true });

export default mongoose.model<ICompany>('Company', companySchema);
