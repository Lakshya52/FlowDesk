import mongoose, { Document, Schema } from 'mongoose';

export interface ILeadNote {
    text: string;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
}

export interface IFollowUpLog {
    scheduledAt: Date;
    createdAt: Date;
}

export interface IMeetingLog {
    scheduledAt: Date;
    createdAt: Date;
    status: 'scheduled' | 'done' | 'canceled';
    mode?: 'virtual' | 'physical';
    location?: string;
    link?: string;
}

export interface ILead extends Document {
    databaseId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    name: string;
    designation?: string;
    phone?: string;
    alternatePhone?: string;
    companyName?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    pincode?: string;
    companyPan?: string;
    companyGst?: string;
    industry?: string;
    email?: string;
    website?: string;
    priority: 'very_high' | 'high' | 'medium' | 'low';
    source: string;
    sourceType?: 'udyam' | 'self' | 'partner';
    partnerId?: mongoose.Types.ObjectId;
    product?: string;
    productId?: mongoose.Types.ObjectId;
    status: 'new' | 'attempted' | 'connected' | 'interested' | 'callback_scheduled' | 'meeting_scheduled' | 'not_interested' | 'not_reachable' | 'do_not_call' | 'closed_won' | 'closed_lost';
    callCount: number;
    lastCallAt?: Date;
    callDuration: number;
    nextFollowupAt?: Date;
    scheduleType?: 'follow_up' | 'meeting';
    meetingStatus?: 'scheduled' | 'done' | 'canceled';
    meetingAt?: Date;
    // A meeting is either online (link) or in person (location).
    meetingMode?: 'virtual' | 'physical';
    meetingLocation?: string;
    meetingLink?: string;
    followUpCount: number;
    meetingCount: number;
    followUpLogs: IFollowUpLog[];
    meetingLogs: IMeetingLog[];
    notes: ILeadNote[];
    createdAt: Date;
    updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
    {
        databaseId: { type: Schema.Types.ObjectId, ref: 'Database' },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        name: { type: String, required: true, trim: true },
        designation: { type: String, trim: true },
        phone: { type: String, trim: true },
        alternatePhone: { type: String, trim: true },
        companyName: { type: String, trim: true },
        addressLine: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        pincode: { type: String, trim: true },
        companyPan: { type: String, trim: true },
        companyGst: { type: String, trim: true },
        industry: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        website: { type: String, trim: true },
        priority: {
            type: String,
            enum: ['very high', 'high', 'medium', 'low'],
            default: 'medium',
        },
        source: {
            type: String,
            required: true,
        },
        sourceType: {
            type: String,
            enum: ['udyam', 'self', 'partner'],
            default: 'udyam',
        },
        partnerId: { type: Schema.Types.ObjectId, ref: 'Partner' },
        // Product the partner gave this lead for (id filled when the name
        // matches a LoanProduct in the catalog)
        product: { type: String, trim: true },
        productId: { type: Schema.Types.ObjectId, ref: 'LoanProduct' },
        status: {
            type: String,
            enum: [
                'new',
                'attempted',
                'connected',
                'interested',
                'callback_scheduled',
                'meeting_scheduled',
                'not_interested',
                'not_reachable',
                'do_not_call',
                'closed_won',
                'closed_lost',
            ],
            default: 'new',
        },
        callCount: { type: Number, default: 0 },
        lastCallAt: { type: Date },
        callDuration: { type: Number, default: 0 },
        nextFollowupAt: { type: Date },
        scheduleType: { type: String, enum: ['follow_up', 'meeting'] },
        meetingStatus: { type: String, enum: ['scheduled', 'done', 'canceled'], default: 'scheduled' },
        meetingAt: { type: Date },
        meetingMode: { type: String, enum: ['virtual', 'physical'] },
        meetingLocation: { type: String, trim: true },
        meetingLink: { type: String, trim: true },
        followUpCount: { type: Number, default: 0 },
        meetingCount: { type: Number, default: 0 },
        followUpLogs: [
            {
                scheduledAt: { type: Date, required: true },
                createdAt: { type: Date, default: Date.now },
            },
        ],
        meetingLogs: [
            {
                scheduledAt: { type: Date, required: true },
                createdAt: { type: Date, default: Date.now },
                status: { type: String, enum: ['scheduled', 'done', 'canceled'], default: 'scheduled' },
                mode: { type: String, enum: ['virtual', 'physical'] },
                location: { type: String, trim: true },
                link: { type: String, trim: true },
            },
        ],
        notes: [
            {
                text: { type: String, required: true },
                createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
                createdAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

leadSchema.index({ databaseId: 1 });
leadSchema.index({ partnerId: 1 });
leadSchema.index({ tenantId: 1 });
leadSchema.index({ tenantId: 1, name: 1 });
leadSchema.index({ tenantId: 1, phone: 1 });
leadSchema.index({ tenantId: 1, companyName: 1 });
leadSchema.index({ tenantId: 1, email: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ alternatePhone: 1 });
leadSchema.index({ companyName: 1 });
leadSchema.index({ companyPan: 1 });
leadSchema.index({ companyGst: 1 });
leadSchema.index({ designation: 1 });
leadSchema.index({ name: 1 });
leadSchema.index({ status: 1 });

export default mongoose.model<ILead>('Lead', leadSchema);
