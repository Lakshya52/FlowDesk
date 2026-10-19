import { Router } from 'express';
import {
    getDocStatuses,
    createDocStatus,
    updateDocStatus,
    reorderDocStatuses,
    deleteDocStatus,
} from '../controllers/docStatusController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', getDocStatuses);
router.post('/', authorize('admin', 'manager'), createDocStatus);
router.put('/reorder', authorize('admin', 'manager'), reorderDocStatuses);
router.put('/:id', authorize('admin', 'manager'), updateDocStatus);
router.delete('/:id', authorize('admin', 'manager'), deleteDocStatus);

export default router;
