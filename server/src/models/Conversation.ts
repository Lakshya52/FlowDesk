import mongoose, { Document, Schema } from 'mongoose';

export enum ConversationType {
    DIRECT = 'direct',
    GROUP = 'group',
}

export interface IKeyWrap {
    userId: mongoose.Types.ObjectId;
    deviceId: string;
    /** Ephemeral ECDH public key (JWK string) used to wrap the key for this device. */
    epk: string;
    /** base64(iv || AES-GCM(conversationKey)) under the ephemeral-derived KEK. */
    ct: string;
}

export interface IConversation extends Document {
    type: ConversationType;
    name?: string;
    avatar?: string;
    participants: mongoose.Types.ObjectId[];
    createdBy?: mongoose.Types.ObjectId;
    admins?: mongoose.Types.ObjectId[];
    readBy?: mongoose.Types.ObjectId[];
    keyWraps?: IKeyWrap[];
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
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        keyWraps: [
            {
                userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                deviceId: { type: String, required: true },
                epk: { type: String, required: true },
                ct: { type: String, required: true },
                _id: false,
            },
        ],
    },
    { timestamps: true }
);

// Indexes for fast querying of conversation lists
conversationSchema.index({ participants: 1 });
conversationSchema.index({ type: 1 });

export default mongoose.model<IConversation>('Conversation', conversationSchema);
