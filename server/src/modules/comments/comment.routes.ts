import { Router } from 'express';
import { createComment, getComments, deleteComment, searchUsers } from './comment.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', createComment);
router.get('/', getComments);
router.delete('/:id', deleteComment);
router.get('/users/search', searchUsers);

export default router;
