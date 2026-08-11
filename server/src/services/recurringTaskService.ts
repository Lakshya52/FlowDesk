import Assignment from '../models/Assignment';
import Task from '../models/Task';
import { createNotifications, NotificationPayload } from './notificationService';
import { NotificationType } from '../models/Notification';
import { startFieldVisitHeartbeat } from './fieldVisitHeartbeatService';
import { emitBlueprintSpawn } from './superAdminEvents';

// Max instances spawned per blueprint per cycle (catch-up cap)
const CATCH_UP_LIMIT = 30;

// Patterns the engine currently handles
const SUPPORTED_PATTERNS = ['daily', 'weekly'];

/**
 * Apply an "HH:MM" spawn time to a date (local time).
 */
const applySpawnTime = (date: Date, hours: number, minutes: number): Date => {
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    return d;
};

const getSpawnTime = (template: any): { hours: number; minutes: number } => {
    const [hours = 0, minutes = 0] = (template.recurringTime || '00:00').split(':').map(Number);
    return { hours, minutes };
};

const getWeekdays = (template: any): number[] => {
    if (Array.isArray(template.recurringWeekdays) && template.recurringWeekdays.length > 0) {
        return template.recurringWeekdays.map(Number);
    }
    const fallback = template.recurringStartDate ? new Date(template.recurringStartDate).getDay() : 0;
    return [fallback];
};

const firstSelectedWeekdayOnOrAfter = (date: Date, weekdays: number[]): Date => {
    const sorted = [...weekdays].sort((a, b) => a - b);
    for (let offset = 0; offset <= 6; offset++) {
        const candidate = new Date(date);
        candidate.setDate(date.getDate() + offset);
        if (sorted.includes(candidate.getDay())) {
            candidate.setHours(0, 0, 0, 0);
            return candidate;
        }
    }
    const d = new Date(date);
    d.setDate(d.getDate() + 7);
    d.setHours(0, 0, 0, 0);
    return d;
};

// Next selected weekday STRICTLY after `after` (same day never returned — prevents duplicate slot spawns)
const nextSelectedWeekday = (after: Date, weekdays: number[]): Date => {
    const sorted = [...weekdays].sort((a, b) => a - b);
    for (let offset = 1; offset <= 7; offset++) {
        const candidate = new Date(after);
        candidate.setDate(after.getDate() + offset);
        if (sorted.includes(candidate.getDay())) {
            candidate.setHours(0, 0, 0, 0);
            return candidate;
        }
    }
    const d = new Date(after);
    d.setDate(d.getDate() + 7);
    d.setHours(0, 0, 0, 0);
    return d;
};

/**
 * Compute the next spawn slot.
 * The cadence anchor (lastSpawnedAt) lives on the template (D1) so editing an
 * instance's own start date never shifts the schedule.
 * Returns null when the pattern is not implemented or the template is malformed.
 */
export const nextSpawnDate = (template: any, lastSpawnedAt: Date | null): Date | null => {
    const { hours, minutes } = getSpawnTime(template);

    if (!lastSpawnedAt) {
        const start = template.recurringStartDate ? new Date(template.recurringStartDate) : null;
        if (!start || isNaN(start.getTime())) return null;

        if (template.recurringPattern === 'weekly') {
            const first = firstSelectedWeekdayOnOrAfter(start, getWeekdays(template));
            return applySpawnTime(first, hours, minutes);
        }
        if (template.recurringPattern === 'daily') {
            return applySpawnTime(start, hours, minutes);
        }
        return null;
    }

    const last = new Date(lastSpawnedAt);
    switch (template.recurringPattern) {
        case 'daily': {
            const next = new Date(last);
            next.setDate(next.getDate() + 1);
            return applySpawnTime(next, hours, minutes);
        }
        case 'weekly': {
            const next = nextSelectedWeekday(last, getWeekdays(template));
            return applySpawnTime(next, hours, minutes);
        }
        default:
            return null;
    }
};

const getAnchor = async (template: any): Promise<Date | null> => {
    if (template.recurringLastSpawnedAt) {
        return new Date(template.recurringLastSpawnedAt);
    }
    const lastChild = await Assignment.findOne({
        parentAssignmentId: template._id,
        isRecurring: false,
    }).sort({ startDate: -1 });
    return lastChild ? new Date(lastChild.startDate) : null;
};

const spawnInstance = async (template: any, slotDate: Date): Promise<boolean> => {
    const newAssignment = new Assignment({
        title: template.title,
        clientName: template.clientName,
        companyId: template.companyId,
        description: template.description,
        priority: template.priority,
        status: 'not_started',
        startDate: slotDate,
        dueDate: template.recurringDueDays
            ? new Date(new Date(slotDate).setDate(slotDate.getDate() + template.recurringDueDays))
            : null,
        createdBy: template.createdBy,
        team: template.team,
        teams: template.teams,
        isRecurring: false,
        parentAssignmentId: template._id,
    });

    try {
        await newAssignment.save();
    } catch (err: any) {
        // Duplicate slot (parentAssignmentId + startDate) — already spawned
        if (err?.code === 11000) {
            console.log(`[Recurring] Slot ${slotDate.toISOString()} for "${template.title}" already exists, skipping.`);
            return false;
        }
        throw err;
    }

    // Clone tasks from the blueprint
    try {
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
                subtasks: (t.subtasks || []).map((s: any) => ({ title: s.title, completed: false })),
                dependencies: [],
            }));
            await Task.insertMany(clonedTasks);
            console.log(`[Recurring] Cloned ${clonedTasks.length} tasks to "${newAssignment.title}"`);
        }
    } catch (error) {
        console.error(`[Recurring] Failed to clone tasks for "${newAssignment.title}":`, error);
    }

    // Advance the cadence anchor only after a successful spawn
    template.recurringLastSpawnedAt = slotDate;
    template.recurringSpawnedCount = (template.recurringSpawnedCount || 0) + 1;
    await template.save();

    emitBlueprintSpawn(template, newAssignment);

    // Notify team members (except the creator) that a new instance was spawned
    if (template.recurringNotifyOnSpawn !== false) {
        const teamIds: string[] = ((template.team || []) as any[])
            .map((m: any) => (m._id || m).toString())
            .filter((userId: string) => userId !== template.createdBy?.toString());
        const memberIds = Array.from(new Set(teamIds));
        if (memberIds.length > 0) {
            const payloads: NotificationPayload[] = memberIds.map((userId: string) => ({
                user: userId,
                type: NotificationType.PROJECT_CREATED,
                title: 'New Project Instance',
                message: `A new instance of "${template.title}" was created.`,
                link: `/assignments/${newAssignment._id}?tab=tasks`,
            }));
            await createNotifications(payloads);
        }
    }

    console.log(`[Recurring] Spawned "${newAssignment.title}" at ${slotDate.toISOString()}`);
    return true;
};

const processTemplate = async (template: any, now: Date) => {
    if (template.recurringPaused) {
        console.log(`[Recurring] "${template.title}" is paused, skipping.`);
        return;
    }
    if (!SUPPORTED_PATTERNS.includes(template.recurringPattern)) {
        return; // monthly / yearly — coming soon
    }

    const spawnedCount = await Assignment.countDocuments({ parentAssignmentId: template._id });
    const maxInstances = template.recurringMaxInstances;
    if (maxInstances && spawnedCount >= maxInstances) {
        console.log(`[Recurring] "${template.title}" reached max instances (${spawnedCount}/${maxInstances}), skipping.`);
        return;
    }

    // null anchor = first-ever spawn: nextSpawnDate computes the slot from recurringStartDate
    const anchor = await getAnchor(template);

    let nextSpawn = nextSpawnDate(template, anchor);
    if (!nextSpawn) {
        console.log(`[Recurring] "${template.title}" has no valid start date / anchor, skipping.`);
        return;
    }

    let spawned = 0;

    while (nextSpawn && spawned < CATCH_UP_LIMIT) {
        if (nextSpawn > now) break;

        if (template.recurringEndDate) {
            const endInclusive = new Date(template.recurringEndDate);
            endInclusive.setHours(23, 59, 59, 999);
            if (nextSpawn > endInclusive) {
                console.log(`[Recurring] "${template.title}" next spawn ${nextSpawn.toISOString()} is past the end date, stopping.`);
                break;
            }
        }

        const ok = await spawnInstance(template, nextSpawn);
        if (!ok) break; // duplicate slot — anchor did not advance, stop to avoid a loop
        spawned += 1;
        nextSpawn = nextSpawnDate(template, nextSpawn);
    }

    if (spawned > 0) {
        console.log(`[Recurring] "${template.title}" spawned ${spawned} instance(s).`);
    }
};

let scanInProgress = false;

export const processRecurringAssignments = async () => {
    if (scanInProgress) return;
    scanInProgress = true;
    try {
        const now = new Date();

        const templates = await Assignment.find({
            isRecurring: true,
            parentAssignmentId: null,
        });

        for (const template of templates) {
            try {
                await processTemplate(template, now);
            } catch (error) {
                console.error(`[Recurring] Error processing "${template.title}":`, error);
            }
        }
    } catch (error) {
        console.error('[Recurring] Error processing recurring assignments:', error);
    } finally {
        scanInProgress = false;
        lastScanAt = new Date();
    }
};

let lastScanAt: Date | null = null;

export const getRecurringJobStatus = () => ({
    running: scanInProgress,
    nextTickAt,
    lastScanAt,
    safetyScanIntervalMs: 1000 * 60 * 5,
});

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
let nextTimer: ReturnType<typeof setTimeout> | null = null;
let nextTickAt: Date | null = null;
const SCHEDULE_BUFFER_MS = 1000;

// Find the earliest future spawn slot across all active blueprints (used to arm an exact timer).
const getNextSpawnSlot = async (): Promise<Date | null> => {
    const templates = await Assignment.find({
        isRecurring: true,
        parentAssignmentId: null,
    });

    let nearest: Date | null = null;
    for (const template of templates) {
        if (template.recurringPaused) continue;
        if (!template.recurringPattern || !SUPPORTED_PATTERNS.includes(template.recurringPattern)) continue;
        const slot = nextSpawnDate(template, template.recurringLastSpawnedAt || null);
        if (!slot) continue;
        if (slot.getTime() <= Date.now()) continue; // due — handled by the scan pass
        if (!nearest || slot < nearest) nearest = slot;
    }
    return nearest;
};

// Arm a one-shot timer that fires exactly at the next spawn slot (like the backup scheduler).
export const scheduleNextTick = async () => {
    if (nextTimer) {
        clearTimeout(nextTimer);
        nextTimer = null;
    }

    try {
        const nearest = await getNextSpawnSlot();
        if (!nearest) {
            nextTickAt = null;
            console.log('[Recurring] No future spawn slots, timer idle (safety scan will re-check).');
            return;
        }

        const delay = Math.max(
            SCHEDULE_BUFFER_MS,
            nearest.getTime() - Date.now() + SCHEDULE_BUFFER_MS,
        );

        nextTickAt = nearest;

        nextTimer = setTimeout(async () => {
            nextTimer = null;
            nextTickAt = null;
            await processRecurringAssignments();
            await scheduleNextTick();
        }, delay);

        console.log(`[Recurring] Next spawn tick at ${nearest.toISOString()} (in ~${Math.round(delay / 1000)}s)`);
    } catch (error) {
        console.error('[Recurring] scheduleNextTick error:', error);
        // Retry in 1 minute on error
        nextTimer = setTimeout(() => scheduleNextTick(), 60 * 1000);
    }
};

// Re-arm the exact timer (e.g. after a blueprint is created or edited)
export const rescheduleRecurringJob = () => {
    scheduleNextTick();
};

// Start the background job
export const startRecurringJob = () => {
    // Run once on server start (catch-up), then arm the exact-timer for future slots
    processRecurringAssignments().then(() => scheduleNextTick());
    processTaskDeadlines();

    // Safety scan every 5 minutes — catches new/modified blueprints and re-arms the timer
    recurringInterval = setInterval(() => {
        processRecurringAssignments();
        processTaskDeadlines();
        scheduleNextTick();
    }, 1000 * 60 * 5);

    startFieldVisitHeartbeat();
};

export const stopRecurringJob = () => {
    if (recurringInterval) {
        clearInterval(recurringInterval);
        recurringInterval = null;
    }
    if (nextTimer) {
        clearTimeout(nextTimer);
        nextTimer = null;
    }
};