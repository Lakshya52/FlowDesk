import { Router } from 'express';
import {
    createBoard,
    getBoards,
    getBoard,
    getPendingRequests,
    updateBoard,
    deleteBoard,
    updateColumns,
    addColumn,
    renameColumn,
    deleteColumn,
    reorderColumns,
    requestToJoin,
    handleRequest,
    removeMember,
    addMember,
    inviteToBoard,
    handleInvitation,
    getPendingInvitations,
} from '../controllers/boardController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.post('/', authorize('admin', 'manager', 'member'), createBoard);
router.get('/', getBoards);
router.get('/requests/pending', getPendingRequests);
router.get('/invitations/pending', getPendingInvitations);
router.get('/:id', getBoard);
router.put('/:id', authorize('admin', 'manager', 'member'), updateBoard);
router.delete('/:id', authorize('admin', 'manager', 'member'), deleteBoard);

router.put('/:id/columns', authorize('admin', 'manager', 'member'), updateColumns);
router.post('/:id/columns', authorize('admin', 'manager', 'member'), addColumn);
router.put('/:id/columns/:key/rename', authorize('admin', 'manager', 'member'), renameColumn);
router.delete('/:id/columns/:key', authorize('admin', 'manager', 'member'), deleteColumn);
router.put('/:id/columns/reorder', authorize('admin', 'manager', 'member'), reorderColumns);

router.post('/:id/request', authorize('admin', 'manager', 'member'), requestToJoin);
router.put('/:id/requests/:requestId', handleRequest);
router.post('/:id/invite', authorize('admin', 'manager', 'member'), inviteToBoard);
router.put('/:id/invitations/:invitationId', handleInvitation);
router.post('/:id/members', authorize('admin', 'manager', 'member'), addMember);
router.delete('/:id/members/:memberId', authorize('admin', 'manager', 'member'), removeMember);

export default router;
