import mongoose, { Document, Schema } from 'mongoose';

export interface IExpense {
    type: 'travel' | 'fuel' | 'food' | 'other';
    amount: number;
    description: string;
    receiptImage?: string;
}

export interface IFieldVisit extends Document {
    tenantId: mongoose.Types.ObjectId;
    employeeId: mongoose.Types.ObjectId;
    clientId: mongoose.Types.ObjectId;
    clientType: 'company' | 'lead';
    clientName: string;
    scheduledDate?: Date;
    scheduledTime?: string;
    checkInTime?: Date;
    checkInSelfie?: string;
    checkInLocation?: {
        type: 'Point';
        coordinates: [number, number];
        address: string;
    };
    checkOutTime?: Date;
    checkOutSelfie?: string;
    checkOutLocation?: {
        type: 'Point';
        coordinates: [number, number];
        address: string;
    };
    status: 'scheduled' | 'checked_in' | 'checked_out' | 'cancelled';
    outcome?: 'completed' | 'rescheduled' | 'no_contact' | 'met_other';
    meetingNotes?: string;
    rescheduledDate?: Date;
    rescheduledTime?: string;
    otherPersonName?: string;
    otherPersonContact?: string;
    otherPersonNotes?: string;
    otherPersonOutcome?: string;
    followUpDate?: Date;
    digitalSignature?: string;
    remarks?: string;
    remarksAddedAt?: Date;
    visitOrder?: number;
    routeOptimized: boolean;
    expenses: IExpense[];
    geoFenceRadius: number;
    geoFenceBreached: boolean;
    trackingLost: boolean;
    lastLocationUpdateAt?: Date;
    trackingStartedAt?: Date;
    trackingEndedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
    {
        type: { type: String, enum: ['travel', 'fuel', 'food', 'other'], required: true },
        amount: { type: Number, required: true },
        description: { type: String, default: '' },
        receiptImage: { type: String },
    },
    { _id: true }
);

const fieldVisitSchema = new Schema<IFieldVisit>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        clientId: { type: Schema.Types.ObjectId, required: true },
        clientType: { type: String, enum: ['company', 'lead'], required: true },
        clientName: { type: String, trim: true },
        scheduledDate: { type: Date },
        scheduledTime: { type: String, trim: true },
        checkInTime: { type: Date },
        checkInSelfie: { type: String },
        checkInLocation: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] },
            address: { type: String, default: '' },
        },
        checkOutTime: { type: Date },
        checkOutSelfie: { type: String },
        checkOutLocation: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] },
            address: { type: String, default: '' },
        },
        status: {
            type: String,
            enum: ['scheduled', 'checked_in', 'checked_out', 'cancelled'],
            default: 'scheduled',
        },
        outcome: { type: String, enum: ['completed', 'rescheduled', 'no_contact', 'met_other'] },
        meetingNotes: { type: String, trim: true },
        rescheduledDate: { type: Date },
        rescheduledTime: { type: String, trim: true },
        otherPersonName: { type: String, trim: true },
        otherPersonContact: { type: String, trim: true },
        otherPersonNotes: { type: String, trim: true },
        otherPersonOutcome: { type: String, trim: true },
        followUpDate: { type: Date },
        digitalSignature: { type: String },
        visitOrder: { type: Number },
        routeOptimized: { type: Boolean, default: false },
        expenses: [expenseSchema],
        remarks: { type: String, trim: true },
        remarksAddedAt: { type: Date },
        geoFenceRadius: { type: Number, default: 100 },
        geoFenceBreached: { type: Boolean, default: false },
        trackingLost: { type: Boolean, default: false },
        lastLocationUpdateAt: { type: Date },
        trackingStartedAt: { type: Date },
        trackingEndedAt: { type: Date },
    },
    { timestamps: true }
);

fieldVisitSchema.index({ tenantId: 1, employeeId: 1 });
fieldVisitSchema.index({ tenantId: 1, status: 1 });
fieldVisitSchema.index({ tenantId: 1, clientId: 1 });
fieldVisitSchema.index({ tenantId: 1, checkInTime: -1 });
fieldVisitSchema.index({ employeeId: 1, status: 1 });

export default mongoose.model<IFieldVisit>('FieldVisit', fieldVisitSchema);
