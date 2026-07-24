import { Router } from 'express';
import { createTask, getTasks, getTask, updateTask, deleteTask, reorderTasks } from '../controllers/taskController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.post('/', authorize('admin', 'manager', 'member'), createTask);
router.get('/', getTasks);
router.get('/:id', getTask);
router.put('/reorder', authorize('admin', 'manager', 'member'), reorderTasks);
router.put('/:id', authorize('admin', 'manager', 'member'), updateTask);
router.delete('/:id', authorize('admin', 'manager', 'member'), deleteTask);

export default router;
