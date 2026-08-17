import { Router } from 'express';
import { uploadFile, getFiles, downloadFile, deleteFile } from './file.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { upload } from '../../shared/middlewares/upload.middleware';

const router = Router();

router.use(authenticate);

router.post('/', upload.single('file'), uploadFile);
router.get('/', getFiles);
router.get('/:id/download', downloadFile);
router.delete('/:id', deleteFile);

export default router;
