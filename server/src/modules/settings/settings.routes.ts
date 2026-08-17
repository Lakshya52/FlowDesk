import { Router } from 'express';
import { getSettings, updateSettings } from './settings.controller';
import { authenticate, authorize } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getSettings);
router.put('/', authorize('admin', 'manager'), updateSettings);

export default router;
