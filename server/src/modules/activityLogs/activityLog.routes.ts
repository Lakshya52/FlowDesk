import { Router } from 'express';
import { getCrmActivityLogs } from './activityLog.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getCrmActivityLogs);

export default router;
