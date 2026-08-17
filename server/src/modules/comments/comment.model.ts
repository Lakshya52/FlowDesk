import mongoose, { Document, Schema } from 'mongoose';

export interface IMention {
    user: mongoose.Types.ObjectId;
    indices: [number, number];
}

export interface IComment extends Document {
    content: string;
    author: mongoose.Types.ObjectId;
    assignment?: mongoose.Types.ObjectId;
    task?: mongoose.Types.ObjectId;
    mentions: IMention[];
    createdAt: Date;
    updatedAt: Date;
}

const mentionSchema = new Schema<IMention>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    indices: { type: [Number] as any },
});

const commentSchema = new Schema<IComment>(
    {
        content: { type: String, required: true },
        author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        assignment: { type: Schema.Types.ObjectId, ref: 'Assignment' },
        task: { type: Schema.Types.ObjectId, ref: 'Task' },
        mentions: [mentionSchema],
    },
    { timestamps: true }
);

commentSchema.index({ assignment: 1, createdAt: -1 });
commentSchema.index({ task: 1, createdAt: -1 });

export default mongoose.model<IComment>('Comment', commentSchema);
