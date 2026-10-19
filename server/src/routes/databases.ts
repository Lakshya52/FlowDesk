import { Router } from 'express';
import { createDatabase, getDatabases, getDatabase, updateDatabase, deleteDatabase, importDatabaseExcel, downloadDatabaseSampleExcel } from '../controllers/databaseController';
import { authenticate, authorize } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

router.get('/import/sample', downloadDatabaseSampleExcel);

router.use(authenticate);

router.post('/import/excel', authorize('admin'), upload.single('file'), importDatabaseExcel);
router.post('/', authorize('admin', 'manager'), createDatabase);
router.get('/', getDatabases);
router.get('/:id', getDatabase);
router.put('/:id', authorize('admin', 'manager'), updateDatabase);
router.delete('/:id', authorize('admin', 'manager'), deleteDatabase);

export default router;
