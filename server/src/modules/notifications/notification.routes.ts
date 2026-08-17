import { Router } from 'express';
import { getNotifications, markAsRead, markAllAsRead } from './notification.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
// subscribe/unsubscribe routes removed - native notifications via Electron IPC

export default router;
