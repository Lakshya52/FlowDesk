import mongoose, { Document, Schema } from 'mongoose';

export interface IDatabase extends Document {
    name: string;
    purpose: string;
    description?: string;
    people: mongoose.Types.ObjectId[];
    tenantId: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const databaseSchema = new Schema<IDatabase>(
    {
        name: { type: String, required: true, trim: true },
        purpose: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        people: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

databaseSchema.index({ tenantId: 1 });
databaseSchema.index({ name: 1 });

export default mongoose.model<IDatabase>('Database', databaseSchema);
