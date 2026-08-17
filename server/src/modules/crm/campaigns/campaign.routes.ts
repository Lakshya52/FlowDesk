import { Router } from 'express';
import { createCampaign, getCampaigns, getCampaign, updateCampaign, deleteCampaign, importCampaignExcel, downloadCampaignSampleExcel } from './campaign.controller';
import { authenticate, authorize } from '../../../shared/middlewares/auth.middleware';
import { upload } from '../../../shared/middlewares/upload.middleware';

const router = Router();

router.get('/import/sample', downloadCampaignSampleExcel);

router.use(authenticate);

router.post('/import/excel', authorize('admin'), upload.single('file'), importCampaignExcel);
router.post('/', authorize('admin', 'manager'), createCampaign);
router.get('/', getCampaigns);
router.get('/:id', getCampaign);
router.put('/:id', authorize('admin', 'manager'), updateCampaign);
router.delete('/:id', authorize('admin', 'manager'), deleteCampaign);

export default router;
