import BackupSchedule from '../models/BackupSchedule';
import { triggerScheduledBackup } from '../controllers/backupController';

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

export const startBackupScheduler = () => {
  console.log('[BACKUP-SCHEDULER] Starting backup scheduler...');

  setInterval(async () => {
    try {
      const now = new Date();
      const dueSchedules = await BackupSchedule.find({
        isActive: true,
        nextRunAt: { $lte: now },
      });

      for (const schedule of dueSchedules) {
        console.log(`[BACKUP-SCHEDULER] Running backup for tenant ${schedule.tenantId}`);

        const success = await triggerScheduledBackup(
          schedule.tenantId.toString(),
          schedule.email
        );

        schedule.lastRunAt = now;
        schedule.lastRunStatus = success ? 'success' : 'failed';
        schedule.nextRunAt = calculateNextRun(schedule);
        await schedule.save();

        console.log(`[BACKUP-SCHEDULER] Tenant ${schedule.tenantId}: ${success ? 'OK' : 'FAILED'}`);
      }
    } catch (error) {
      console.error('[BACKUP-SCHEDULER] Error:', error);
    }
  }, 60 * 1000);

  console.log('[BACKUP-SCHEDULER] Running every 60 seconds');
};
