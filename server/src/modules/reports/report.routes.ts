import { Router } from 'express';
import { 
    getEmployeeTrackingReport, 
    getWorkloadReport, 
    getActivityReport, 
    exportReport
} from './report.controller';
import { authenticate, authorize } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/employee-tracking', authorize('admin', 'manager', 'member'), getEmployeeTrackingReport);
router.get('/workload', authorize('admin', 'manager', 'member'), getWorkloadReport);
router.get('/activity', authorize('admin', 'manager', 'member'), getActivityReport);

router.get('/export', authorize('admin', 'manager'), exportReport);

export default router;
