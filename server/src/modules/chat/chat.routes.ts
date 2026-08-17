import { Router } from 'express';
import { sendMessage, getMessages, deleteMessage } from './chat.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { upload } from '../../shared/middlewares/upload.middleware';

const router = Router();

router.use(authenticate);

router.post('/', upload.single('file'), sendMessage);
router.get('/', getMessages);
router.delete('/:id', deleteMessage);

export default router;
