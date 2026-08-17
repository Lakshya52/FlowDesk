import mongoose, { Document, Schema } from 'mongoose';

export interface ICalendar extends Document {
  name: string;
  description?: string;
  color: string;
  icon?: string;
  owner?: mongoose.Types.ObjectId; // null for admin-managed holidays
  visibility: 'private' | 'shared' | 'public';
  isArchived: boolean;
  isDefault: boolean;
  isSystem: boolean; // true for system calendars like global holidays
  sharedWith: {
    user: mongoose.Types.ObjectId;
    permission: 'owner' | 'editor' | 'viewer';
    status: 'pending' | 'accepted' | 'rejected';
  }[];
  teamId?: mongoose.Types.ObjectId;
  googleCalendarId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const calendarSchema = new Schema<ICalendar>(
  {
    name: { type: String, required: true },
    description: { type: String },
    color: { type: String, required: true, default: '#6366f1' },
    icon: { type: String },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
    visibility: { 
      type: String, 
      enum: ['private', 'shared', 'public'], 
      default: 'private' 
    },
    isArchived: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    sharedWith: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        permission: { 
          type: String, 
          enum: ['owner', 'editor', 'viewer'], 
          default: 'viewer' 
        },
        status: {
          type: String,
          enum: ['pending', 'accepted', 'rejected'],
          default: 'pending'
        }
      }
    ],
    teamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    googleCalendarId: { type: String, default: null },
  },
  { timestamps: true }
);

calendarSchema.index({ owner: 1 });
calendarSchema.index({ teamId: 1 });
calendarSchema.index({ 'sharedWith.user': 1 });

export default mongoose.model<ICalendar>('Calendar', calendarSchema);
