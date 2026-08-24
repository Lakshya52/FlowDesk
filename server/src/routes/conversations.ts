import { Router } from 'express';
import {
    getConversations,
    getMessages,
    createConversation,
    sendMessage,
    toggleReaction,
    deleteConversation,
    deleteMessage,
    forwardMessage,
    editMessage,
    markConversationRead,
    getConversationKeys,
    putConversationKeys
} from '../controllers/conversationController';
import { authenticate } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

// Apply auth middleware to all conversation routes
router.use(authenticate);

router.get('/', getConversations);
router.post('/', createConversation);
router.delete('/:id', deleteConversation);
router.get('/:id/messages', getMessages);
router.get('/:id/keys', getConversationKeys);
router.put('/:id/keys', putConversationKeys);
router.post('/:id/read', markConversationRead);
router.post('/:id/messages', upload.single('file'), sendMessage);
router.post('/messages/:messageId/react', toggleReaction);
router.post('/messages/:messageId/forward', forwardMessage);
router.put('/messages/:messageId', editMessage);
router.delete('/messages/:messageId', deleteMessage);

export default router;
