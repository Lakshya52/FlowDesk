import BackupSchedule from '../models/BackupSchedule';
import Tenant from '../models/Tenant';
import { triggerScheduledBackup } from '../controllers/backupController';
import { emitBackupCompleted } from './superAdminEvents';

const calculateNextRun = (schedule: any): Date => {
  const now = new Date();
  const next = new Date();
  next.setHours(schedule.hour, schedule.minute, 0, 0);

  if (schedule.frequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (schedule.frequency === 'weekly') {
    const targetDay = schedule.dayOfWeek ?? 0;
    const diff = (targetDay - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + diff);
    if (next <= now) next.setDate(next.getDate() + 7);
  } else if (schedule.frequency === 'monthly') {
    const targetDay = schedule.dayOfMonth ?? 1;
    next.setDate(targetDay);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next;
};

const CONCURRENCY = 5;

let nextTimer: ReturnType<typeof setTimeout> | null = null;
let safetyInterval: ReturnType<typeof setInterval> | null = null;
let nextBackupAt: Date | null = null;

export const getBackupJobStatus = () => ({
  nextBackupAt,
  safetyScanIntervalMs: 1.5 * 60 * 60 * 1000,
});

const runBackup = async (schedule: any) => {
  try {
    const fresh = await BackupSchedule.findById(schedule._id);
    if (!fresh || !fresh.isActive) return;

    const now = new Date();
    console.log(`[BACKUP-SCHEDULER] Running backup for tenant ${fresh.tenantId}`);

    const success = await triggerScheduledBackup(
      fresh.tenantId.toString(),
      fresh.email
    );

    fresh.lastRunAt = now;
    fresh.lastRunStatus = success ? 'success' : 'failed';
    fresh.nextRunAt = calculateNextRun(fresh);
    await fresh.save();

    let tenantName: string | null = null;
    try {
      const tenant = await Tenant.findById(fresh.tenantId).select('name').lean();
      tenantName = tenant?.name || null;
    } catch {
      // tenant name is optional
    }
    emitBackupCompleted(tenantName, success);

    console.log(`[BACKUP-SCHEDULER] Tenant ${fresh.tenantId}: ${success ? 'OK' : 'FAILED'}`);
  } catch (error) {
    console.error('[BACKUP-SCHEDULER] Error:', error);
  }
};

const scheduleNext = async () => {
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }

  try {
    const nearest = await BackupSchedule
      .findOne({ isActive: true, nextRunAt: { $gt: new Date() } })
      .sort({ nextRunAt: 1 });

    if (!nearest) {
      nextBackupAt = null;
      console.log('[BACKUP-SCHEDULER] No future backups scheduled');
      return;
    }

    const delay = nearest.nextRunAt.getTime() - Date.now();
    if (delay <= 0) {
      scanAllSchedules();
      return;
    }

    nextBackupAt = nearest.nextRunAt;
    nextTimer = setTimeout(() => scanAllSchedules(), delay);
    console.log(`[BACKUP-SCHEDULER] Next backup at ${nearest.nextRunAt.toISOString()} (in ${Math.round(delay / 1000)}s)`);
  } catch (error) {
    console.error('[BACKUP-SCHEDULER] scheduleNext error:', error);
    // Retry in 5 minutes on error
    nextTimer = setTimeout(() => scheduleNext(), 5 * 60 * 1000);
  }
};

const scanAllSchedules = async () => {
  try {
    const now = new Date();
    const dueSchedules = await BackupSchedule.find({
      isActive: true,
      nextRunAt: { $lte: now },
    });

    // Process in batches of CONCURRENCY
    for (let i = 0; i < dueSchedules.length; i += CONCURRENCY) {
      const batch = dueSchedules.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((s) => runBackup(s)));
    }
  } catch (error) {
    console.error('[BACKUP-SCHEDULER] Scan error:', error);
  }

  // Schedule the next future backup
  await scheduleNext();
};

export const startBackupScheduler = () => {
  console.log('[BACKUP-SCHEDULER] Starting backup scheduler...');

  // Process any past-due backups and schedule the next one
  scanAllSchedules();

  // Safety scan every 1.5 hours to catch new/modified schedules
  safetyInterval = setInterval(scanAllSchedules, 1.5 * 60 * 60 * 1000);
  console.log('[BACKUP-SCHEDULER] Safety scan every 1.5 hours');
};

export const stopBackupScheduler = () => {
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
  if (safetyInterval) {
    clearInterval(safetyInterval);
    safetyInterval = null;
  }
};
