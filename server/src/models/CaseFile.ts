import mongoose, { Document, Schema } from 'mongoose';

export type CaseFileStatus = 'in_process' | 'closed' | 'lost';

// One document checklist entry on a caseFile. Copied from the product's
// template when a product is assigned, then kept in sync (see caseFileService).
export interface ICaseFileDoc {
    _id?: mongoose.Types.ObjectId;
    name: string;
    required: boolean;
    statusId?: mongoose.Types.ObjectId | null;
    statusChangedAt?: Date | null;  // when the status last moved
    touched: boolean;               // user has worked on it — never auto-removed
    removedFromTemplate?: boolean;  // template dropped it, kept for history
}

// A hardcoded sub-checkpoint inside the Proposal / Finalizing stages.
export interface ICaseFileWorkflowItem {
    key: string;
    done: boolean;
    doneAt?: Date | null;
    doneBy?: mongoose.Types.ObjectId | null;
}

export interface ICaseFileWorkflow {
    proposal: ICaseFileWorkflowItem[];
    finalizing: ICaseFileWorkflowItem[];
}

// A clarification is a note on the caseFile. Unresolved notes keep the
// Clarifications checkpoint open; resolving them completes it.
export interface ICaseFileClarification {
    _id?: mongoose.Types.ObjectId;
    text: string;
    resolved: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    resolvedAt?: Date | null;
    resolvedBy?: mongoose.Types.ObjectId | null;
}

export interface ICaseFile extends Document {
    leadId: mongoose.Types.ObjectId;
    // Snapshot so the tracker stays readable even if the lead changes
    leadName?: string;
    companyName?: string;
    phone?: string;
    productId?: mongoose.Types.ObjectId | null;
    status: CaseFileStatus;
    docs: ICaseFileDoc[];
    workflow: ICaseFileWorkflow;
    clarifications: ICaseFileClarification[];
    // Explicit confirmation that the lead needs no clarifications. Without
    // this, an empty Clarifications checkpoint stays open (it is not silently
    // auto-completed).
    clarificationsCleared: boolean;
    clarificationsClearedAt?: Date | null;
    clarificationsClearedBy?: mongoose.Types.ObjectId | null;
    notes?: string;
    convertedAt: Date;
    sanctionedAt?: Date | null;
    lostAt?: Date | null;
    lostReason?: string;
    closedAt?: Date | null;
    tenantId: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const caseFileDocSchema = new Schema<ICaseFileDoc>(
    {
        name: { type: String, required: true, trim: true },
        required: { type: Boolean, default: true },
        statusId: { type: Schema.Types.ObjectId, ref: 'DocStatus', default: null },
        statusChangedAt: { type: Date, default: null },
        touched: { type: Boolean, default: false },
        removedFromTemplate: { type: Boolean, default: false },
    },
    { _id: true }
);

const workflowItemSchema = new Schema<ICaseFileWorkflowItem>(
    {
        key: { type: String, required: true },
        done: { type: Boolean, default: false },
        doneAt: { type: Date, default: null },
        doneBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { _id: false }
);

const clarificationSchema = new Schema<ICaseFileClarification>(
    {
        text: { type: String, required: true, trim: true },
        resolved: { type: Boolean, default: false },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: Date.now },
        resolvedAt: { type: Date, default: null },
        resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { _id: true }
);

const caseFileSchema = new Schema<ICaseFile>(
    {
        leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
        leadName: { type: String, trim: true },
        companyName: { type: String, trim: true },
        phone: { type: String, trim: true },
        productId: { type: Schema.Types.ObjectId, ref: 'LoanProduct', default: null },
        status: { type: String, enum: ['in_process', 'closed', 'lost'], default: 'in_process' },
        docs: { type: [caseFileDocSchema], default: [] },
        workflow: {
            proposal: { type: [workflowItemSchema], default: [] },
            finalizing: { type: [workflowItemSchema], default: [] },
        },
        clarifications: { type: [clarificationSchema], default: [] },
        clarificationsCleared: { type: Boolean, default: false },
        clarificationsClearedAt: { type: Date, default: null },
        clarificationsClearedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        notes: { type: String, trim: true },
        convertedAt: { type: Date, default: Date.now },
        sanctionedAt: { type: Date, default: null },
        lostAt: { type: Date, default: null },
        lostReason: { type: String, trim: true },
        closedAt: { type: Date, default: null },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

caseFileSchema.index({ tenantId: 1 });
// One caseFile per lead
caseFileSchema.index({ tenantId: 1, leadId: 1 }, { unique: true });
caseFileSchema.index({ tenantId: 1, status: 1 });
caseFileSchema.index({ tenantId: 1, productId: 1 });

export default mongoose.model<ICaseFile>('CaseFile', caseFileSchema, 'conversions');
