import { Router } from 'express';
import { getCrmSummary, exportCrmSummary } from './crmSummary.controller';
import { authenticate, authorize } from '../../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', authorize('admin', 'manager', 'member'), getCrmSummary);
router.get('/export', authorize('admin', 'manager', 'member'), exportCrmSummary);

export default router;
