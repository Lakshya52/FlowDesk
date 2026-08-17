import mongoose, { Document, Schema } from 'mongoose';

export interface ICounter extends Document {
    modelName: string;
    seq: number;
}

const counterSchema = new Schema<ICounter>({
    modelName: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
});

export default mongoose.model<ICounter>('Counter', counterSchema);
