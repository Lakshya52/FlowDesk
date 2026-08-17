import mongoose, { Document, Schema } from 'mongoose';

export interface ICalendarEvent extends Document {
  title: string;
  description?: string;
  calendar: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  eventType: 'event' | 'meeting' | 'holiday' | 'birthday' | 'reminder' | 'goal' | 'training' | 'task';
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  location?: string;
  notes?: string;
  isImportant: boolean;
  isPinned: boolean;

  isRecurring: boolean;
  recurrenceRule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    daysOfWeek?: number[]; // 0-6
    endDate?: Date;
    count?: number;
  };
  recurringParentId?: mongoose.Types.ObjectId;

  reminders: {
    type: 'in_app' | 'email' | 'push';
    minutesBefore: number;
  }[];

  attendees: {
    user: mongoose.Types.ObjectId;
    status: 'pending' | 'accepted' | 'declined';
  }[];

  comments: {
    user: mongoose.Types.ObjectId;
    text: string;
    createdAt: Date;
  }[];

  linkedTask?: mongoose.Types.ObjectId;
  linkedAssignment?: mongoose.Types.ObjectId;
  googleEventId?: string;

  createdAt: Date;
  updatedAt: Date;
}

const calendarEventSchema = new Schema<ICalendarEvent>(
  {
    title: { type: String, required: true },
    description: { type: String },
    calendar: { type: Schema.Types.ObjectId, ref: 'Calendar', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // Optional for system events
    eventType: { 
      type: String, 
      enum: ['event', 'meeting', 'holiday', 'birthday', 'reminder', 'goal', 'training', 'task'],
      default: 'event'
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    status: { 
      type: String, 
      enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
      default: 'scheduled'
    },
    location: { type: String },
    notes: { type: String },
    isImportant: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },

    isRecurring: { type: Boolean, default: false },
    recurrenceRule: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
      interval: { type: Number, default: 1 },
      daysOfWeek: [{ type: Number }],
      endDate: { type: Date },
      count: { type: Number }
    },
    recurringParentId: { type: Schema.Types.ObjectId, ref: 'CalendarEvent' },

    reminders: [
      {
        type: { type: String, enum: ['in_app', 'email', 'push'], default: 'in_app' },
        minutesBefore: { type: Number, required: true }
      }
    ],

    attendees: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
      }
    ],

    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],

    linkedTask: { type: Schema.Types.ObjectId, ref: 'Task' },
    linkedAssignment: { type: Schema.Types.ObjectId, ref: 'Assignment' },
    googleEventId: { type: String, default: null },
  },
  { timestamps: true }
);

calendarEventSchema.index({ calendar: 1 });
calendarEventSchema.index({ startDate: 1, endDate: 1 });
calendarEventSchema.index({ createdBy: 1 });
calendarEventSchema.index({ eventType: 1 });
calendarEventSchema.index({ recurringParentId: 1 });
calendarEventSchema.index({ googleEventId: 1 }, { sparse: true });

export default mongoose.model<ICalendarEvent>('CalendarEvent', calendarEventSchema);
