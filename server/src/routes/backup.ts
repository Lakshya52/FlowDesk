import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/auth';
import { exportBackup, getSchedule, createSchedule, deleteSchedule, emailBackupNow } from '../controllers/backupController';

const router = Router();

router.use(authenticate);

router.post('/export', authorize('admin'), exportBackup);
router.post('/email-now', authorize('admin'), emailBackupNow);
router.get('/schedule', authorize('admin'), getSchedule);
router.post('/schedule', authorize('admin'), createSchedule);
router.delete('/schedule/:id', authorize('admin'), deleteSchedule);

export default router;
