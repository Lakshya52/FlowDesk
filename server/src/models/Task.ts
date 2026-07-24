import mongoose, { Document, Schema } from 'mongoose';

export enum TaskStatus {
    TODO = 'todo',
    IN_PROGRESS = 'in_progress',
    REVIEW = 'review',
    COMPLETED = 'completed',
}

export enum Priority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    URGENT = 'urgent',
}

export interface ISubtask {
    title: string;
    completed: boolean;
}

export interface ITask extends Document {
    title: string;
    description: string;
    assignment?: mongoose.Types.ObjectId;
    assignedTo: mongoose.Types.ObjectId;
    createdBy: mongoose.Types.ObjectId;
    board?: mongoose.Types.ObjectId;
    dueDate: Date;
    priority: Priority;
    status: string;
    rank: number;
    subtasks: ISubtask[];
    dependencies: mongoose.Types.ObjectId[];
    timeEstimate?: number;
    timeSpent?: number;
    createdAt: Date;
    updatedAt: Date;
}

const subtaskSchema = new Schema<ISubtask>({
    title: { type: String, required: true },
    completed: { type: Boolean, default: false },
});

const taskSchema = new Schema<ITask>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        assignment: { type: Schema.Types.ObjectId, ref: 'Assignment' },
        assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        dueDate: { type: Date },
        priority: { type: String, enum: Object.values(Priority), default: Priority.MEDIUM },
        status: { type: String, default: TaskStatus.TODO },
        rank: { type: Number, default: 0 },
        board: { type: Schema.Types.ObjectId, ref: 'Board' },
        subtasks: [subtaskSchema],
        dependencies: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
        timeEstimate: { type: Number },
        timeSpent: { type: Number, default: 0 },
    },
    { timestamps: true }
);

taskSchema.index({ assignment: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ board: 1 });

export default mongoose.model<ITask>('Task', taskSchema);
