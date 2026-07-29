import mongoose, { Schema, Document } from 'mongoose';

export interface IBackupSchedule extends Document {
  tenantId: mongoose.Types.ObjectId;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number;
  minute: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  email: string;
  isActive: boolean;
  nextRunAt: Date;
  lastRunAt?: Date;
  lastRunStatus?: 'success' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const backupScheduleSchema = new Schema<IBackupSchedule>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    hour: { type: Number, required: true, min: 0, max: 23 },
    minute: { type: Number, required: true, min: 0, max: 59 },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    dayOfMonth: { type: Number, min: 1, max: 31 },
    email: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    nextRunAt: { type: Date, required: true },
    lastRunAt: { type: Date },
    lastRunStatus: { type: String, enum: ['success', 'failed'] },
  },
  { timestamps: true }
);

const BackupSchedule = mongoose.model<IBackupSchedule>('BackupSchedule', backupScheduleSchema);

// Drop the old unique index on tenantId if it exists from a previous schema
BackupSchedule.collection.dropIndex('tenantId_1').catch(() => {});

export default BackupSchedule;
