import mongoose, { Document, Schema } from 'mongoose';

export interface IAttachment extends Document {
    fileName: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    filePath: string;
    uploadedBy: mongoose.Types.ObjectId;
    assignment?: mongoose.Types.ObjectId;
    task?: mongoose.Types.ObjectId;
    version: number;
    /** E2EE: base64 AES-GCM IV of the encrypted file bytes. Absent ⇒ legacy plaintext file. */
    encIv?: string;
    /** E2EE: per-file AES key wrapped under the conversation key, base64(iv||ct). */
    encKey?: string;
    createdAt: Date;
    updatedAt: Date;
}

const attachmentSchema = new Schema<IAttachment>(
    {
        fileName: { type: String, required: true },
        originalName: { type: String, required: true },
        fileType: { type: String, required: true },
        fileSize: { type: Number, required: true },
        filePath: { type: String, required: true },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        assignment: { type: Schema.Types.ObjectId, ref: 'Assignment' },
        task: { type: Schema.Types.ObjectId, ref: 'Task' },
        version: { type: Number, default: 1 },
        encIv: { type: String },
        encKey: { type: String },
    },
    { timestamps: true }
);

attachmentSchema.index({ assignment: 1 });
attachmentSchema.index({ task: 1 });

export default mongoose.model<IAttachment>('Attachment', attachmentSchema);
