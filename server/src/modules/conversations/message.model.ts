import mongoose, { Document, Schema } from 'mongoose';

export interface IMessageReaction {
    user: mongoose.Types.ObjectId;
    emoji: string;
}

export interface IMessageReadBy {
    user: mongoose.Types.ObjectId;
    readAt: Date;
}

export interface IMessage extends Document {
    conversation: mongoose.Types.ObjectId;
    sender: mongoose.Types.ObjectId;
    content: string;
    attachments: mongoose.Types.ObjectId[];
    parentMessage?: mongoose.Types.ObjectId;
    mentions: mongoose.Types.ObjectId[];
    reactions: IMessageReaction[];
    readBy: IMessageReadBy[];
    isDeleted?: boolean;
    isEdited?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
    {
        conversation: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            index: true,
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        content: {
            type: String,
            default: '',
        },
        attachments: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Attachment',
            },
        ],
        parentMessage: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
        },
        mentions: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        reactions: [
            {
                user: {
                    type: Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
                emoji: {
                    type: String,
                    required: true,
                },
            },
        ],
        readBy: [
            {
                user: {
                    type: Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
                readAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        isDeleted: {
            type: Boolean,
            default: false,
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Indexes for fast history loading and sorting
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, sender: 1, 'readBy.user': 1 });

export default mongoose.model<IMessage>('Message', messageSchema);
