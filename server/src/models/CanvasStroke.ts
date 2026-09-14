
import mongoose, { Schema, Document } from 'mongoose';

export interface ICanvasStrokePoint {
  x: number;
  y: number;
}

export interface ICanvasStroke extends Document {
  userId: mongoose.Types.ObjectId;
  points: ICanvasStrokePoint[];
  color: string;
  width: number;
  createdAt: Date;
  updatedAt: Date;
}

const CanvasStrokePointSchema: Schema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false }
);

const CanvasStrokeSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    points: { type: [CanvasStrokePointSchema], required: true },
    color: { type: String, default: '#6366f1' },
    width: { type: Number, default: 4 },
  },
  { timestamps: true }
);

CanvasStrokeSchema.index({ userId: 1 });

export default mongoose.model<ICanvasStroke>('CanvasStroke', CanvasStrokeSchema);
