import mongoose, { Document, Schema } from 'mongoose';

export interface IBoardColumn {
    key: string;
    label: string;
    color: string;
    order: number;
}

export interface IBoardRequest {
    user: mongoose.Types.ObjectId;
    status: 'pending' | 'accepted' | 'rejected';
    requestedAt: Date;
}

export interface IBoardInvitation {
    user: mongoose.Types.ObjectId;
    invitedBy: mongoose.Types.ObjectId;
    status: 'pending' | 'accepted' | 'declined';
    invitedAt: Date;
}

export interface IBoard extends Document {
    title: string;
    description: string;
    createdBy: mongoose.Types.ObjectId;
    members: mongoose.Types.ObjectId[];
    color: string;
    columns: IBoardColumn[];
    requests: IBoardRequest[];
    invitations: IBoardInvitation[];
    createdAt: Date;
    updatedAt: Date;
}

const boardColumnSchema = new Schema<IBoardColumn>(
    {
        key: { type: String, required: true },
        label: { type: String, required: true, trim: true },
        color: { type: String, default: '#94a3b8' },
        order: { type: Number, required: true },
    },
    { _id: false }
);

const boardRequestSchema = new Schema<IBoardRequest>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending',
        },
        requestedAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const boardInvitationSchema = new Schema<IBoardInvitation>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined'],
            default: 'pending',
        },
        invitedAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const boardSchema = new Schema<IBoard>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        color: { type: String, default: '#3b82f6' },
        columns: [boardColumnSchema],
        requests: [boardRequestSchema],
        invitations: [boardInvitationSchema],
    },
    { timestamps: true }
);

boardSchema.index({ createdBy: 1 });
boardSchema.index({ members: 1 });

export default mongoose.model<IBoard>('Board', boardSchema);
