import Assignment from '../models/Assignment';
import Task from '../models/Task';
import mongoose from 'mongoose';
import { createNotifications, NotificationPayload } from './notificationService';
import { NotificationType } from '../models/Notification';
import { startFieldVisitHeartbeat } from './fieldVisitHeartbeatService';

export const processRecurringAssignments = async () => {
    try {
        const now = new Date();

        // Find all root recurring assignments where recurringStartDate has been reached
        const templates = await Assignment.find({
            isRecurring: true,
            parentAssignmentId: null,
        });

        for (const template of templates) {
            if (template.recurringPattern === 'daily') {
                await processDailyTemplate(template, now);
            }
            // weekly, monthly, yearly — coming soon
        }
    } catch (error) {
        console.error('[Recurring] Error processing recurring assignments:', error);
    }
};

const processDailyTemplate = async (template: any, now: Date) => {
    // Parse recurringTime (e.g. "09:30"), default to "00:00"
    const [hours, minutes] = (template.recurringTime || '00:00').split(':').map(Number);

    // Build start-of-day for recurringStartDate
    const recurringStart = new Date(template.recurringStartDate!);
    recurringStart.setHours(0, 0, 0, 0);

    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);

    // Don't process if recurringStartDate is in the future
    if (recurringStart > todayMidnight) {
        console.log(`[Recurring Daily] "${template.title}" starts on ${recurringStart.toDateString()}, skipping.`);
        return;
    }

    // Find the last spawned instance
    const lastChild = await Assignment.findOne({
        parentAssignmentId: template._id,
        isRecurring: false,
    }).sort({ startDate: -1 });

    let shouldSpawn = false;
    let nextSpawnTime: Date;

    if (!lastChild) {
        // First instance — scheduled time is recurringStartDate + recurringTime
        nextSpawnTime = new Date(recurringStart);
        nextSpawnTime.setHours(hours, minutes, 0, 0);

        if (now >= nextSpawnTime) {
            shouldSpawn = true;
        }
    } else {
        // Next instance = last spawn date + 24 hours, at the same time
        const lastSpawnDate = new Date(lastChild.startDate);
        nextSpawnTime = new Date(lastSpawnDate);
        nextSpawnTime.setDate(nextSpawnTime.getDate() + 1);
        nextSpawnTime.setHours(hours, minutes, 0, 0);

        if (now >= nextSpawnTime) {
            shouldSpawn = true;
        }
    }

    if (!shouldSpawn) {
        console.log(`[Recurring Daily] "${template.title}" next spawn at ${nextSpawnTime!.toISOString()}, not yet.`);
        return;
    }

    // Create the new instance
    const newAssignment = new Assignment({
        title: template.title,
        clientName: template.clientName,
        companyId: template.companyId,
        description: template.description,
        priority: template.priority,
        status: 'not_started',
        startDate: nextSpawnTime,
        dueDate: null,
        createdBy: template.createdBy,
        team: template.team,
        teams: template.teams,
        isRecurring: false,
        parentAssignmentId: template._id,
    });

    await newAssignment.save();

    // Clone tasks from template
    const templateTasks = await Task.find({ assignment: template._id });
    if (templateTasks.length > 0) {
        const clonedTasks = templateTasks.map((t: any) => ({
            title: t.title,
            description: t.description,
            assignment: newAssignment._id,
            assignedTo: t.assignedTo,
            createdBy: t.createdBy,
            dueDate: null,
            priority: t.priority,
            status: 'todo',
            subtasks: t.subtasks.map((s: any) => ({ title: s.title, completed: false })),
            dependencies: [],
        }));
        await Task.insertMany(clonedTasks);
        console.log(`[Recurring Daily] Cloned ${templateTasks.length} tasks to "${newAssignment.title}"`);
    }

    console.log(`[Recurring Daily] Spawned "${newAssignment.title}" at ${nextSpawnTime.toISOString()}`);
};

// Process tasks that are near deadline (24 hours)
export const processTaskDeadlines = async () => {
    try {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);

        const soonTasks = await Task.find({
            dueDate: { $gte: in23Hours, $lte: tomorrow },
            status: { $ne: 'completed' },
            assignedTo: { $exists: true, $ne: null }
        }).populate('assignment', 'title');

        if (soonTasks.length > 0) {
            const payloads: NotificationPayload[] = soonTasks.map((task: any) => ({
                user: task.assignedTo.toString(),
                type: NotificationType.DEADLINE_APPROACHING,
                title: 'Task Deadline Approaching',
                message: `Your task "${task.title}" is due in 24 hours.`,
                link: `/assignments/${(task.assignment as any)._id}?tab=tasks&taskId=${task._id}`
            }));

            await createNotifications(payloads);
            console.log(`[Deadline Checker] Sent ${payloads.length} deadline notifications.`);
        }
    } catch (error) {
        console.error('[Deadline Checker] Error processing task deadlines:', error);
    }
};

let recurringInterval: ReturnType<typeof setInterval> | null = null;

// Start the background job
export const startRecurringJob = () => {
    // Run once on server start
    processRecurringAssignments();
    processTaskDeadlines();

    // Run every hour — fine for daily pattern since we check exact timestamps
    // For daily: spawns only when `now >= nextSpawnTime`, so no duplicates
    recurringInterval = setInterval(() => {
        processRecurringAssignments();
        processTaskDeadlines();
    }, 1000 * 60 * 60);

    startFieldVisitHeartbeat();
};

export const stopRecurringJob = () => {
    if (recurringInterval) {
        clearInterval(recurringInterval);
        recurringInterval = null;
    }
};