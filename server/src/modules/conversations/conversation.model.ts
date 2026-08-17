import mongoose, { Document, Schema } from 'mongoose';

export enum ConversationType {
    DIRECT = 'direct',
    GROUP = 'group',
}

export interface IConversation extends Document {
    type: ConversationType;
    name?: string;
    avatar?: string;
    participants: mongoose.Types.ObjectId[];
    createdBy?: mongoose.Types.ObjectId;
    admins?: mongoose.Types.ObjectId[];
    readBy?: mongoose.Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
    {
        type: {
            type: String,
            enum: Object.values(ConversationType),
            required: true,
            default: ConversationType.DIRECT,
        },
        name: {
            type: String,
            trim: true,
            required: function (this: IConversation) {
                return this.type === ConversationType.GROUP;
            },
        },
        avatar: {
            type: String,
        },
        participants: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
        ],
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        admins: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    { timestamps: true }
);

// Indexes for fast querying of conversation lists
conversationSchema.index({ participants: 1 });
conversationSchema.index({ type: 1 });

export default mongoose.model<IConversation>('Conversation', conversationSchema);
