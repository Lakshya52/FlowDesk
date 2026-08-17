import mongoose, { Document, Schema } from 'mongoose';

export interface IChatMessage extends Document {
    content: string;
    sender: mongoose.Types.ObjectId;
    assignment: mongoose.Types.ObjectId;
    attachments: mongoose.Types.ObjectId[];
    mentions: mongoose.Types.ObjectId[];
    parentMessage?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
    {
        content: { type: String, default: '' },
        sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        assignment: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
        attachments: [{ type: Schema.Types.ObjectId, ref: 'Attachment' }],
        mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        parentMessage: { type: Schema.Types.ObjectId, ref: 'ChatMessage' },
    },
    { timestamps: true }
);

chatMessageSchema.index({ assignment: 1, createdAt: -1 });

export default mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
