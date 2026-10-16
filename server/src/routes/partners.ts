import { Router } from 'express';
import { createPartner, getPartners, getPartner, updatePartner, deletePartner, importPartnerExcel, downloadPartnerSampleExcel } from '../controllers/partnerController';
import { authenticate, authorize } from '../middlewares/auth';
import { upload, uploadDoc } from '../middlewares/upload';

const router = Router();

router.get('/import/sample', downloadPartnerSampleExcel);

router.use(authenticate);

router.post('/import/excel', authorize('admin'), upload.single('file'), importPartnerExcel);
// Agreement upload is optional; multer tolerates missing file on FormData/JSON posts
router.post('/', authorize('admin', 'manager'), uploadDoc.single('agreement'), createPartner);
router.get('/', getPartners);
router.get('/:id', getPartner);
router.put('/:id', authorize('admin', 'manager'), uploadDoc.single('agreement'), updatePartner);
router.delete('/:id', authorize('admin', 'manager'), deletePartner);

export default router;
