import { Router } from 'express';
import {
    getCaseFiles,
    getCaseFileStats,
    getCaseFile,
    getCaseFileTimeline,
    createCaseFile,
    updateCaseFile,
    updateCaseFileDoc,
    advanceCaseFileDoc,
    toggleWorkflowItem,
    addClarification,
    updateClarification,
    deleteClarification,
    setClarificationsCleared,
    sanctionCaseFile,
    loseCaseFile,
    reopenCaseFile,
    deleteCaseFile,
} from '../controllers/caseFileController';
import { getConversionOverview } from '../controllers/conversionOverviewController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

// Specific routes before parameterized routes
router.get('/stats', getCaseFileStats);
router.get('/overview', getConversionOverview);
router.get('/', getCaseFiles);
router.get('/:id/timeline', getCaseFileTimeline);
router.get('/:id', getCaseFile);

// Converting a lead mirrors a lead status change — any CRM user can do it.
router.post('/', createCaseFile);

// Managing the tracker (status, product, docs, notes) is admin/manager only.
router.put('/:id', authorize('admin', 'manager'), updateCaseFile);
router.patch('/:id/docs/:docId/advance', authorize('admin', 'manager'), advanceCaseFileDoc);
router.patch('/:id/docs/:docId', authorize('admin', 'manager'), updateCaseFileDoc);
router.patch('/:id/workflow/:group/:itemKey', authorize('admin', 'manager'), toggleWorkflowItem);

router.post('/:id/clarifications', authorize('admin', 'manager'), addClarification);
router.post('/:id/clarifications/clear', authorize('admin', 'manager'), setClarificationsCleared);
router.patch('/:id/clarifications/:clarificationId', authorize('admin', 'manager'), updateClarification);
router.delete('/:id/clarifications/:clarificationId', authorize('admin', 'manager'), deleteClarification);

router.post('/:id/sanction', authorize('admin', 'manager'), sanctionCaseFile);
router.post('/:id/lose', authorize('admin', 'manager'), loseCaseFile);
router.post('/:id/reopen', authorize('admin', 'manager'), reopenCaseFile);

router.delete('/:id', authorize('admin'), deleteCaseFile);

export default router;
