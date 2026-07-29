import { Response } from 'express';
import Board from '../models/Board';
import Task from '../models/Task';
import { AuthRequest } from '../middlewares/auth';
import { getTenantUserIds, getTenantId } from '../utils/tenant';
import { createNotification } from '../services/notificationService';
import { NotificationType } from '../models/Notification';
import { emitBoardCreated, emitBoardUpdated, emitBoardDeleted, emitTaskUpdated } from '../services/taskSocketService';

const generateKey = (label: string): string => {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
};

const DEFAULT_COLUMNS = [
    { key: 'todo', label: 'To Do', color: '#94a3b8', order: 0 },
    { key: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 1 },
    { key: 'review', label: 'Review', color: '#f59e0b', order: 2 },
    { key: 'completed', label: 'Completed', color: '#22c55e', order: 3 },
];

export const createBoard = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { title, description, color, members } = req.body;
        if (!title?.trim()) {
            res.status(400).json({ message: 'Title is required' });
            return;
        }

        const allMembers = new Set<string>([req.user!._id.toString()]);
        if (members && Array.isArray(members)) {
            members.forEach((m: string) => allMembers.add(m));
        }

        const board = await Board.create({
            title: title.trim(),
            description: description || '',
            color: color || '#3b82f6',
            createdBy: req.user!._id,
            members: Array.from(allMembers),
            columns: DEFAULT_COLUMNS,
        });

        const populated = await Board.findById(board._id)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar');

        try {
            const tenantId = getTenantId(req.user!);
            emitBoardCreated(tenantId, populated);
        } catch {}

        res.status(201).json({ board: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getBoards = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!._id.toString();

        let filter: any;
        if (req.user!.role === 'admin') {
            const tenantUserIds = await getTenantUserIds(req.user);
            filter = {
                $or: [
                    { createdBy: { $in: tenantUserIds } },
                    { members: { $in: tenantUserIds } },
                ],
            };
        } else {
            filter = {
                $or: [
                    { createdBy: userId },
                    { members: userId },
                ],
            };
        }

        const boards = await Board.find(filter)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar')
            .sort({ updatedAt: -1 });

        res.json({ boards });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getPendingRequests = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!._id.toString();
        const boards = await Board.find({
            'requests.user': userId,
            'requests.status': 'pending',
        })
            .populate('createdBy', 'name email avatar')
            .populate('requests.user', 'name email avatar')
            .populate('members', 'name email avatar');

        res.json({ boards });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getBoard = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar')
            .populate('requests.user', 'name email avatar')
            .populate('invitations.user', 'name email avatar')
            .populate('invitations.invitedBy', 'name email avatar');

        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        if (req.user!.role !== 'admin') {
            const userId = req.user!._id.toString();
            const isCreator = board.createdBy._id.toString() === userId;
            const isMember = board.members.some((m: any) => m._id.toString() === userId);
            if (!isCreator && !isMember) {
                res.status(403).json({ message: 'Access denied' });
                return;
            }
        }

        res.json({ board });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateBoard = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        if (req.user!.role !== 'admin' && board.createdBy.toString() !== req.user!._id.toString()) {
            res.status(403).json({ message: 'Only the board creator can update it' });
            return;
        }

        const { title, description, color } = req.body;
        if (title !== undefined) board.title = title.trim();
        if (description !== undefined) board.description = description;
        if (color !== undefined) board.color = color;

        await board.save();

        const populated = await Board.findById(board._id)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar');

        try {
            const tenantId = getTenantId(req.user!);
            emitBoardUpdated(tenantId, populated);
        } catch {}

        res.json({ board: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteBoard = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        if (req.user!.role !== 'admin' && board.createdBy.toString() !== req.user!._id.toString()) {
            res.status(403).json({ message: 'Only the board creator can delete it' });
            return;
        }

        await Task.updateMany({ board: board._id }, { $unset: { board: '' } });
        await board.deleteOne();

        try {
            const tenantId = getTenantId(req.user!);
            emitBoardDeleted(tenantId, board._id.toString());
        } catch {}

        res.json({ message: 'Board deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateColumns = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const userId = req.user!._id.toString();
        if (req.user!.role !== 'admin' && board.createdBy.toString() !== userId && !board.members.some((m: any) => m.toString() === userId)) {
            res.status(403).json({ message: 'Access denied' });
            return;
        }

        const { columns } = req.body;
        if (!Array.isArray(columns)) {
            res.status(400).json({ message: 'Columns must be an array' });
            return;
        }

        board.columns = columns.map((col: any, idx: number) => ({
            key: col.key || generateKey(col.label || `column-${idx}`),
            label: col.label || `Column ${idx + 1}`,
            color: col.color || '#94a3b8',
            order: col.order ?? idx,
        }));

        await board.save();

        res.json({ board });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const addColumn = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const { label, color } = req.body;
        if (!label?.trim()) {
            res.status(400).json({ message: 'Column label is required' });
            return;
        }

        let key = generateKey(label);
        const existingKeys = board.columns.map(c => c.key);
        let counter = 1;
        while (existingKeys.includes(key)) {
            key = `${generateKey(label)}_${counter}`;
            counter++;
        }

        const maxOrder = board.columns.reduce((max, c) => Math.max(max, c.order), -1);

        board.columns.push({
            key,
            label: label.trim(),
            color: color || '#94a3b8',
            order: maxOrder + 1,
        });

        await board.save();

        try {
            const tenantId = getTenantId(req.user!);
            emitBoardUpdated(tenantId, board);
        } catch {}

        res.json({ board });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const renameColumn = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const { key: oldKey } = req.params;
        const { label } = req.body;
        if (!label?.trim()) {
            res.status(400).json({ message: 'Label is required' });
            return;
        }

        const column = board.columns.find(c => c.key === oldKey);
        if (!column) {
            res.status(404).json({ message: 'Column not found' });
            return;
        }

        const newKey = generateKey(label);
        if (newKey !== oldKey && board.columns.some(c => c.key === newKey)) {
            res.status(400).json({ message: 'A column with this name already exists' });
            return;
        }

        const oldKeyForTasks = column.key;
        column.label = label.trim();
        column.key = newKey;

        await board.save();

        if (newKey !== oldKeyForTasks) {
            await Task.updateMany(
                { board: board._id, status: oldKeyForTasks },
                { $set: { status: newKey } }
            );
        }

        try {
            const tenantId = getTenantId(req.user!);
            emitBoardUpdated(tenantId, board);
            if (newKey !== oldKeyForTasks) {
                emitTaskUpdated(tenantId, { boardId: board._id, oldStatus: oldKeyForTasks, newStatus: newKey });
            }
        } catch {}

        res.json({ board });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteColumn = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const { key } = req.params;
        const columnIndex = board.columns.findIndex(c => c.key === key);
        if (columnIndex === -1) {
            res.status(404).json({ message: 'Column not found' });
            return;
        }

        if (board.columns.length <= 1) {
            res.status(400).json({ message: 'Cannot delete the last column' });
            return;
        }

        const taskCount = await Task.countDocuments({ board: board._id, status: key });
        if (taskCount > 0) {
            res.status(400).json({ message: `Cannot delete: ${taskCount} task(s) are still in this column. Move them first.` });
            return;
        }

        board.columns.splice(columnIndex, 1);
        board.columns.forEach((col, idx) => { col.order = idx; });

        await board.save();

        try {
            const tenantId = getTenantId(req.user!);
            emitBoardUpdated(tenantId, board);
        } catch {}

        res.json({ board });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const reorderColumns = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const { columnKeys } = req.body;
        if (!Array.isArray(columnKeys)) {
            res.status(400).json({ message: 'columnKeys must be an array' });
            return;
        }

        const reordered = columnKeys
            .map((key: string, idx: number) => {
                const col = board.columns.find(c => c.key === key);
                if (!col) return null;
                return { key: col.key, label: col.label, color: col.color, order: idx };
            })
            .filter(Boolean);

        board.columns = reordered as any;
        await board.save();

        try {
            const tenantId = getTenantId(req.user!);
            emitBoardUpdated(tenantId, board);
        } catch {}

        res.json({ board });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const requestToJoin = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const userId = req.user!._id.toString();

        if (board.members.some((m: any) => m.toString() === req.user!._id.toString())) {
            res.status(400).json({ message: 'You are already a member' });
            return;
        }

        const existingRequest = board.requests.find(
            (r: any) => r.user.toString() === userId && r.status === 'pending'
        );
        if (existingRequest) {
            res.status(400).json({ message: 'Request already pending' });
            return;
        }

        board.requests.push({
            user: req.user!._id,
            status: 'pending',
            requestedAt: new Date(),
        } as any);

        await board.save();

        res.json({ message: 'Request sent' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const handleRequest = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        if (board.createdBy.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
            res.status(403).json({ message: 'Only the board creator can manage requests' });
            return;
        }

        const { requestId } = req.params;
        const { action } = req.body;

        if (!['accepted', 'rejected'].includes(action)) {
            res.status(400).json({ message: 'Action must be "accepted" or "rejected"' });
            return;
        }

        const request = (board.requests as any).id(requestId);
        if (!request) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }

        request.status = action;

        if (action === 'accepted') {
            const requestUserId = request.user.toString();
            if (!board.members.includes(request.user)) {
                board.members.push(request.user);
            }
        }

        await board.save();

        const populated = await Board.findById(board._id)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar')
            .populate('requests.user', 'name email avatar');

        res.json({ board: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const removeMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const { memberId } = req.params;
        const userId = req.user!._id.toString();

        if (req.user!.role !== 'admin' && board.createdBy.toString() !== userId) {
            res.status(403).json({ message: 'Only the board creator can remove members' });
            return;
        }

        if (memberId === board.createdBy.toString()) {
            res.status(400).json({ message: 'Cannot remove the board creator' });
            return;
        }

        board.members = board.members.filter((m: any) => m.toString() !== memberId);
        await board.save();

        const populated = await Board.findById(board._id)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar');

        res.json({ board: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const addMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const userId = req.user!._id.toString();
        if (req.user!.role !== 'admin' && board.createdBy.toString() !== userId) {
            res.status(403).json({ message: 'Only the board creator can add members' });
            return;
        }

        const { userId: memberUserId } = req.body;
        if (!memberUserId) {
            res.status(400).json({ message: 'userId is required' });
            return;
        }

        if (board.members.includes(memberUserId)) {
            res.status(400).json({ message: 'User is already a member' });
            return;
        }

        board.members.push(memberUserId);
        await board.save();

        const populated = await Board.findById(board._id)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar');

        res.json({ board: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const inviteToBoard = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const userId = req.user!._id.toString();
        if (req.user!.role !== 'admin' && board.createdBy.toString() !== userId) {
            res.status(403).json({ message: 'Only the board creator can invite members' });
            return;
        }

        const { userId: invitedUserId } = req.body;
        if (!invitedUserId) {
            res.status(400).json({ message: 'userId is required' });
            return;
        }

        if (board.members.includes(invitedUserId)) {
            res.status(400).json({ message: 'User is already a member' });
            return;
        }

        const existingInvitation = (board.invitations as any).find(
            (inv: any) => inv.user.toString() === invitedUserId && inv.status === 'pending'
        );
        if (existingInvitation) {
            res.status(400).json({ message: 'Invitation already pending' });
            return;
        }

        board.invitations.push({
            user: invitedUserId,
            invitedBy: req.user!._id,
            status: 'pending',
            invitedAt: new Date(),
        } as any);

        await board.save();

        await createNotification({
            user: invitedUserId,
            type: NotificationType.BOARD_INVITED,
            title: 'Board Invitation',
            message: `${req.user!.name} invited you to the board "${board.title}"`,
            link: '/boards',
        });

        const populated = await Board.findById(board._id)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar')
            .populate('invitations.user', 'name email avatar')
            .populate('invitations.invitedBy', 'name email avatar');

        res.json({ board: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const handleInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const board = await Board.findById(req.params.id);
        if (!board) {
            res.status(404).json({ message: 'Board not found' });
            return;
        }

        const { invitationId } = req.params;
        const { action } = req.body;

        if (!['accepted', 'declined'].includes(action)) {
            res.status(400).json({ message: 'Action must be "accepted" or "declined"' });
            return;
        }

        const invitation = (board.invitations as any).id(invitationId);
        if (!invitation) {
            res.status(404).json({ message: 'Invitation not found' });
            return;
        }

        const userId = req.user!._id.toString();
        if (invitation.user.toString() !== userId) {
            res.status(403).json({ message: 'You can only respond to your own invitations' });
            return;
        }

        if (invitation.status !== 'pending') {
            res.status(400).json({ message: 'Invitation already responded to' });
            return;
        }

        invitation.status = action;

        if (action === 'accepted') {
            const invitedUserId = invitation.user.toString();
            if (!board.members.some((m: any) => m.toString() === invitedUserId)) {
                board.members.push(invitation.user);
            }
        }

        await board.save();

        const populated = await Board.findById(board._id)
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar')
            .populate('invitations.user', 'name email avatar')
            .populate('invitations.invitedBy', 'name email avatar');

        res.json({ board: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getPendingInvitations = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!._id.toString();
        const boards = await Board.find({
            'invitations.user': userId,
            'invitations.status': 'pending',
        })
            .populate('createdBy', 'name email avatar')
            .populate('members', 'name email avatar')
            .populate('invitations.user', 'name email avatar')
            .populate('invitations.invitedBy', 'name email avatar');

        res.json({ boards });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
