import { Router } from 'express';
import { uploadFile, getFiles, downloadFile, downloadByName, deleteFile } from '../controllers/fileController';
import { authenticate } from '../middlewares/auth';
import { uploadDoc } from '../middlewares/upload';

const router = Router();

router.use(authenticate);

router.post('/', uploadDoc.single('file'), uploadFile);
router.get('/', getFiles);
router.get('/by-name/:filename', downloadByName);
router.get('/:id/download', downloadFile);
router.delete('/:id', deleteFile);

export default router;
