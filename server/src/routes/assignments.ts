import { Router } from 'express';
import { createAssignment, getAssignments, getAssignment, updateAssignment, deleteAssignment, updateAssignmentCanvas, downloadSampleAssignmentsExcel, previewImportAssignments, importAssignmentsExcel } from '../controllers/assignmentController';
import { authenticate, authorize } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

// Public route (no auth) — sample Excel download
router.get('/import/sample', downloadSampleAssignmentsExcel);

router.use(authenticate);

router.post('/', authorize('admin', 'manager', 'member'), createAssignment);
router.get('/', getAssignments);
router.get('/:id', getAssignment);
router.put('/:id', authorize('admin', 'manager', 'member'), updateAssignment);
router.patch('/:id/canvas', updateAssignmentCanvas);
router.delete('/:id', authorize('admin', 'manager', 'member'), deleteAssignment);

// Import routes (must be before generic /:id to avoid route conflict)
router.post('/import/preview', authorize('admin', 'manager', 'member'), upload.single('file'), previewImportAssignments);
router.post('/import/excel', authorize('admin', 'manager', 'member'), upload.single('file'), importAssignmentsExcel);

export default router;
