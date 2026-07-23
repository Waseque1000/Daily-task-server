import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Task } from '../models/Task';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(['todo', 'in-progress', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  taskDate: z.string().or(z.date()),
  dueDate: z.string().or(z.date()).optional(),
});

const updateTaskSchema = taskSchema.partial();

// Get tasks for a specific date
router.get('/date/:date', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params;
    const userId = req.userId!;
    
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const tasks = await Task.find({
      userId,
      taskDate: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error: any) {
    console.error('GET /date/:date error:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch tasks', detail: error?.message });
  }
});

// Get tasks for date range (for dashboard)
router.get('/range', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { start, end } = req.query;
    const userId = req.userId!;

    const tasks = await Task.find({
      userId,
      taskDate: {
        $gte: new Date(start as string),
        $lte: new Date(end as string),
      },
    }).sort({ taskDate: -1 });

    res.json(tasks);
  } catch (error: any) {
    console.error('GET /range error:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch tasks', detail: error?.message });
  }
});

// Get all tasks for stats
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    const tasks = await Task.find({ userId }).sort({ taskDate: -1 });
    
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate streak
    const tasksByDate = new Map<string, { total: number; completed: number }>();
    tasks.forEach(task => {
      const dateKey = new Date(task.taskDate).toISOString().split('T')[0];
      const existing = tasksByDate.get(dateKey) || { total: 0, completed: 0 };
      existing.total++;
      if (task.status === 'completed') existing.completed++;
      tasksByDate.set(dateKey, existing);
    });

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateKey = checkDate.toISOString().split('T')[0];
      
      const dayData = tasksByDate.get(dateKey);
      if (dayData && dayData.completed > 0) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    // Daily stats for charts
    const dailyStats: Record<string, { total: number; completed: number; byPriority: Record<string, number> }> = {};
    tasks.forEach(task => {
      const dateKey = new Date(task.taskDate).toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { total: 0, completed: 0, byPriority: { low: 0, medium: 0, high: 0 } };
      }
      dailyStats[dateKey].total++;
      if (task.status === 'completed') dailyStats[dateKey].completed++;
      dailyStats[dateKey].byPriority[task.priority]++;
    });

    res.json({
      totalTasks,
      completedTasks,
      completionRate,
      streak,
      dailyStats,
    });
  } catch (error: any) {
    console.error('GET /stats error:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch stats', detail: error?.message });
  }
});

// Create task
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const validated = taskSchema.parse(req.body);
    const userId = req.userId!;

    const task = await Task.create({
      userId,
      title: validated.title,
      description: validated.description || '',
      status: 'todo',
      priority: validated.priority || 'medium',
      taskDate: new Date(validated.taskDate),
      dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
    });

    res.status(201).json(task);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('POST / error:', error?.message || error);
    res.status(500).json({ error: 'Failed to create task', detail: error?.message });
  }
});

// Update task
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const validated = updateTaskSchema.parse(req.body);

    const task = await Task.findOneAndUpdate(
      { _id: id, userId },
      { $set: validated },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('PUT /:id error:', error?.message || error);
    res.status(500).json({ error: 'Failed to update task', detail: error?.message });
  }
});

// Delete task
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const task = await Task.findOneAndDelete({ _id: id, userId });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /:id error:', error?.message || error);
    res.status(500).json({ error: 'Failed to delete task', detail: error?.message });
  }
});

// Auto rollover
router.post('/rollover', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await Task.updateMany(
      {
        userId,
        taskDate: { $lt: today },
        status: { $in: ['todo', 'in-progress'] },
      },
      {
        $set: {
          taskDate: today,
          carriedOver: true,
        },
      }
    );

    res.json({ rolledOver: result.modifiedCount });
  } catch (error: any) {
    console.error('POST /rollover error:', error?.message || error);
    res.status(500).json({ error: 'Failed to rollover tasks', detail: error?.message });
  }
});

export default router;
