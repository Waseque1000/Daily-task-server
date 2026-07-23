"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const Task_1 = require("../models/Task");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const taskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().max(2000).optional(),
    status: zod_1.z.enum(['todo', 'in-progress', 'completed']).optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high']).optional(),
    taskDate: zod_1.z.string().or(zod_1.z.date()),
    dueDate: zod_1.z.string().or(zod_1.z.date()).optional(),
});
const updateTaskSchema = taskSchema.partial();
// Get tasks for a specific date
router.get('/date/:date', auth_1.authenticate, async (req, res) => {
    try {
        const { date } = req.params;
        const userId = req.userId;
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const tasks = await Task_1.Task.find({
            userId,
            taskDate: { $gte: startOfDay, $lte: endOfDay },
        }).sort({ createdAt: -1 });
        res.json(tasks);
    }
    catch (error) {
        console.error('GET /date/:date error:', error?.message || error);
        res.status(500).json({ error: 'Failed to fetch tasks', detail: error?.message });
    }
});
// Get tasks for date range (for dashboard)
router.get('/range', auth_1.authenticate, async (req, res) => {
    try {
        const { start, end } = req.query;
        const userId = req.userId;
        const tasks = await Task_1.Task.find({
            userId,
            taskDate: {
                $gte: new Date(start),
                $lte: new Date(end),
            },
        }).sort({ taskDate: -1 });
        res.json(tasks);
    }
    catch (error) {
        console.error('GET /range error:', error?.message || error);
        res.status(500).json({ error: 'Failed to fetch tasks', detail: error?.message });
    }
});
// Get all tasks for stats
router.get('/stats', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const tasks = await Task_1.Task.find({ userId }).sort({ taskDate: -1 });
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
        // Calculate streak
        const tasksByDate = new Map();
        tasks.forEach(task => {
            const dateKey = new Date(task.taskDate).toISOString().split('T')[0];
            const existing = tasksByDate.get(dateKey) || { total: 0, completed: 0 };
            existing.total++;
            if (task.status === 'completed')
                existing.completed++;
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
            }
            else if (i > 0) {
                break;
            }
        }
        // Daily stats for charts
        const dailyStats = {};
        tasks.forEach(task => {
            const dateKey = new Date(task.taskDate).toISOString().split('T')[0];
            if (!dailyStats[dateKey]) {
                dailyStats[dateKey] = { total: 0, completed: 0, byPriority: { low: 0, medium: 0, high: 0 } };
            }
            dailyStats[dateKey].total++;
            if (task.status === 'completed')
                dailyStats[dateKey].completed++;
            dailyStats[dateKey].byPriority[task.priority]++;
        });
        res.json({
            totalTasks,
            completedTasks,
            completionRate,
            streak,
            dailyStats,
        });
    }
    catch (error) {
        console.error('GET /stats error:', error?.message || error);
        res.status(500).json({ error: 'Failed to fetch stats', detail: error?.message });
    }
});
// Create task
router.post('/', auth_1.authenticate, async (req, res) => {
    try {
        const validated = taskSchema.parse(req.body);
        const userId = req.userId;
        const task = await Task_1.Task.create({
            userId,
            title: validated.title,
            description: validated.description || '',
            status: 'todo',
            priority: validated.priority || 'medium',
            taskDate: new Date(validated.taskDate),
            dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        });
        res.status(201).json(task);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('POST / error:', error?.message || error);
        res.status(500).json({ error: 'Failed to create task', detail: error?.message });
    }
});
// Update task
router.put('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const validated = updateTaskSchema.parse(req.body);
        const task = await Task_1.Task.findOneAndUpdate({ _id: id, userId }, { $set: validated }, { new: true });
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json(task);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('PUT /:id error:', error?.message || error);
        res.status(500).json({ error: 'Failed to update task', detail: error?.message });
    }
});
// Delete task
router.delete('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const task = await Task_1.Task.findOneAndDelete({ _id: id, userId });
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('DELETE /:id error:', error?.message || error);
        res.status(500).json({ error: 'Failed to delete task', detail: error?.message });
    }
});
// Auto rollover
router.post('/rollover', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const result = await Task_1.Task.updateMany({
            userId,
            taskDate: { $lt: today },
            status: { $in: ['todo', 'in-progress'] },
        }, {
            $set: {
                taskDate: today,
                carriedOver: true,
            },
        });
        res.json({ rolledOver: result.modifiedCount });
    }
    catch (error) {
        console.error('POST /rollover error:', error?.message || error);
        res.status(500).json({ error: 'Failed to rollover tasks', detail: error?.message });
    }
});
exports.default = router;
//# sourceMappingURL=tasks.js.map