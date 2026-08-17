import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { authorize } from '../../shared/middlewares/auth.middleware';
import { exportBackup, getSchedule, createSchedule, deleteSchedule, emailBackupNow } from './backup.controller';

const router = Router();

router.use(authenticate);

router.post('/export', authorize('admin'), exportBackup);
router.post('/email-now', authorize('admin'), emailBackupNow);
router.get('/schedule', authorize('admin'), getSchedule);
router.post('/schedule', authorize('admin'), createSchedule);
router.delete('/schedule/:id', authorize('admin'), deleteSchedule);

export default router;
