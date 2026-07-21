import mongoose, { Document, Schema } from 'mongoose';

export interface ITask extends Document {
  userId: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  taskDate: Date;
  dueDate?: Date;
  carriedOver: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['todo', 'in-progress', 'completed'],
      default: 'todo',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    taskDate: { type: Date, required: true, index: true },
    dueDate: { type: Date },
    carriedOver: { type: Boolean, default: false },
  },
  { timestamps: true }
);

taskSchema.index({ userId: 1, taskDate: 1 });
taskSchema.index({ userId: 1, status: 1 });

export const Task = mongoose.model<ITask>('Task', taskSchema);
