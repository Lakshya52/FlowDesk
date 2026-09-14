
import mongoose, { Schema, Document } from 'mongoose';

export interface ICanvasText extends Document {
  userId: mongoose.Types.ObjectId;
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  createdAt: Date;
  updatedAt: Date;
}

const CanvasTextSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, default: 240 },
    text: { type: String, default: '' },
    fontSize: { type: Number, default: 15 },
    align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  },
  { timestamps: true }
);

CanvasTextSchema.index({ userId: 1 });

export default mongoose.model<ICanvasText>('CanvasText', CanvasTextSchema);
