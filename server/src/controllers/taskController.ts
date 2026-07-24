import { Response } from 'express';
import mongooseLib from 'mongoose';
const mongoose = mongooseLib;
import Task from '../models/Task';
import Board from '../models/Board';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import { AuthRequest } from '../middlewares/auth';
import { createNotification } from '../services/notificationService';
import { NotificationType } from '../models/Notification';
import { getTenantUserIds } from '../utils/tenant';

export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const AssignmentModel = mongoose.model('Assignment');
        let assignment: any = null;

        if (req.body.assignment) {
            assignment = await AssignmentModel.findById(req.body.assignment);
            if (!assignment) {
                res.status(404).json({ message: 'Assignment not found' });
                return;
            }

            const isCreator = assignment.createdBy.toString() === req.user!._id.toString();
            const isInTeam = assignment.team?.some((id: any) => id.toString() === req.user!._id.toString());

            if (req.user!.role !== 'admin' && !isCreator && !isInTeam) {
                res.status(403).json({ message: 'Insufficient permissions: You are not included in this project.' });
                return;
            }

            if (assignment.status === 'not_started') {
                assignment.status = 'in_progress';
                await assignment.save();
            }
        }

        let rank = req.body.rank ?? 0;
        if (req.body.board && req.body.status) {
            const maxRankTask = await Task.findOne({ board: req.body.board, status: req.body.status })
                .sort({ rank: -1 })
                .select('rank');
            rank = (maxRankTask?.rank ?? -1) + 1;
        }

        const task = await Task.create({
            ...req.body,
            rank,
            createdBy: req.user!._id,
        });

        if (task.assignedTo.toString() !== req.user!._id.toString()) {
            const link = assignment
                ? `/assignments/${task.assignment}?tab=tasks&taskId=${task._id}`
                : `/tasks?taskId=${task._id}`;
            await createNotification({
                user: task.assignedTo,
                type: NotificationType.TASK_ASSIGNED,
                title: 'New Task Assigned',
                message: `You have been assigned task: ${task.title}`,
                link,
            });
        }

        await ActivityLog.create({
            action: 'Task created',
            user: req.user!._id,
            entityType: EntityType.TASK,
            entityId: task._id,
            metadata: { title: task.title },
        });

        const populated = await Task.findById(task._id)
            .populate('assignedTo', 'name email avatar')
            .populate('createdBy', 'name email')
            .populate('assignment', 'title');

        res.status(201).json({ task: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getTasks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { assignment: assignmentId, status, priority, assignedTo, search, companyId, board: boardId } = req.query;

        // Determine board membership up front — board membership is
        // explicitly allowed to cross tenant boundaries (see getBoards/getBoard),
        // so it must be able to bypass the tenant filter below.
        let isBoardMember = false;
        if (boardId) {
            const board = await Board.findById(boardId).select('members createdBy');
            if (board) {
                const uid = req.user!._id.toString();
                isBoardMember =
                    board.createdBy.toString() === uid ||
                    board.members.some((m: any) => m.toString() === uid);
            }
        }

        const tenantUserIds = await getTenantUserIds(req.user);
        let andConditions: any[] = [];

        if (!isBoardMember) {
            // Base tenant filter: task assigned to or created by users in this tenant.
            // Skipped for board members since boards can include cross-tenant users.
            andConditions.push({
                $or: [{ assignedTo: { $in: tenantUserIds } }, { createdBy: { $in: tenantUserIds } }]
            });
        }

        if (assignmentId) andConditions.push({ assignment: assignmentId });
        if (boardId) andConditions.push({ board: boardId });
        if (status) andConditions.push({ status: status });
        if (priority) andConditions.push({ priority: priority });
        if (assignedTo) andConditions.push({ assignedTo: assignedTo });
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            // Search by task title OR by company name via assignment
            const AssignmentModel = (await import('../models/Assignment')).default;
            const CompanyModel = (await import('../models/Company')).default;
            const matchedCompany = await CompanyModel.findOne({ name: searchRegex });
            if (matchedCompany) {
                const companyAssignments = await AssignmentModel.find({ companyId: matchedCompany._id }).distinct('_id');
                andConditions.push({
                    $or: [
                        { title: searchRegex },
                        { assignment: { $in: companyAssignments } }
                    ]
                });
            } else {
                andConditions.push({ title: searchRegex });
            }
        }

        if (companyId) {
            const AssignmentModel = (await import('../models/Assignment')).default;
            const assignments = await AssignmentModel.find({ companyId }).distinct('_id');
            andConditions.push({ assignment: { $in: assignments } });
        }

        // Roles and permissions visibility enforcement
        // (isBoardMember already computed above)
        if (isBoardMember) {
            // Board membership already grants visibility into every task
            // scoped to this board; skip the assignment/assignedTo filter.
        } else if (req.user!.role === 'member') {
            // Employees see tasks assigned to them OR tasks in projects where they are in the team
            const AssignmentModel = (await import('../models/Assignment')).default;
            const myProjectIds = await AssignmentModel.find({
                $or: [
                    { team: req.user!._id },
                    { createdBy: req.user!._id }
                ]
            }).distinct('_id');

            andConditions.push({
                $or: [
                    { assignedTo: req.user!._id },
                    { assignment: { $in: myProjectIds } }
                ]
            });
        } else if (req.user!.role === 'manager') {
            // Managers see tasks in projects they manage OR standalone tasks they created/are assigned to
            const Team = (await import('../models/Team')).default;
            const AssignmentModel = (await import('../models/Assignment')).default;
            const managedTeams = await Team.find({ manager: req.user!._id }).distinct('_id');
            const myProjectIds = await AssignmentModel.find({
                $or: [
                    { createdBy: req.user!._id },
                    { teams: { $in: managedTeams } },
                    { team: req.user!._id }
                ]
            }).distinct('_id');

            andConditions.push({
                $or: [
                    { assignment: { $in: myProjectIds } },
                    {
                        $and: [
                            { assignment: { $exists: false } },
                            { $or: [{ assignedTo: req.user!._id }, { createdBy: req.user!._id }] }
                        ]
                    }
                ]
            });
        }
        // Admins have no additional filters (see all)

        const filter = andConditions.length > 0 ? { $and: andConditions } : {};

        const tasks = await Task.find(filter)
            .populate('assignedTo', 'name email avatar')
            .populate('createdBy', 'name email')
            .populate('assignment', 'title')
            .populate('board', 'title color')
            .sort({ rank: 1, createdAt: -1 });

        res.json({ tasks });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantUserIds = await getTenantUserIds(req.user);
        const task = await Task.findById(req.params.id)
            .populate('assignedTo', 'name email avatar')
            .populate('createdBy', 'name email')
            .populate('assignment', 'title')
            .populate('dependencies', 'title status');

        if (!task) {
            res.status(404).json({ message: 'Task not found' });
            return;
        }

        // Tenant check
        const assigneeInTenant = task.assignedTo && tenantUserIds.includes(task.assignedTo.toString());
        const creatorInTenant = task.createdBy && tenantUserIds.includes(task.createdBy.toString());
        if (!assigneeInTenant && !creatorInTenant) {
            res.status(403).json({ message: 'Access denied' });
            return;
        }

        // Security check
        if (req.user!.role !== 'admin') {
            if (task.assignment) {
                const AssignmentModel = (await import('../models/Assignment')).default;
                const assignment = await AssignmentModel.findById(task.assignment);

                const isMember = assignment?.team?.some((id: any) => id.toString() === req.user!._id.toString());

                if (!isMember && req.user!.role === 'member') {
                    res.status(403).json({ message: 'Access denied' });
                    return;
                }
            } else if (req.user!.role === 'member' && task.assignedTo?.toString() !== req.user!._id.toString() && task.createdBy?.toString() !== req.user!._id.toString()) {
                res.status(403).json({ message: 'Access denied' });
                return;
            }
        }

        res.json({ task });
        console.log("this is the probleeeemmmmmmmm.......!!!!!!!!!!!!!")
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantUserIds = await getTenantUserIds(req.user);
        const oldTask = await Task.findById(req.params.id);
        if (!oldTask) {
            res.status(404).json({ message: 'Task not found' });
            return;
        }

        // Tenant check
        const assigneeInTenant = oldTask.assignedTo && tenantUserIds.includes(oldTask.assignedTo.toString());
        const creatorInTenant = oldTask.createdBy && tenantUserIds.includes(oldTask.createdBy.toString());
        if (!assigneeInTenant && !creatorInTenant) {
            res.status(403).json({ message: 'Access denied' });
            return;
        }

        // Authorization check: Admin OR owner OR in project team
        if (req.user!.role !== 'admin') {
            let authorized = false;

            if (oldTask.assignment) {
                const AssignmentModel = mongoose.model('Assignment');
                const assignment: any = await AssignmentModel.findById(oldTask.assignment);
                const isProjectCreator = assignment?.createdBy?.toString() === req.user!._id.toString();
                const isInProjectTeam = assignment?.team?.some((id: any) => id.toString() === req.user!._id.toString());
                authorized = isProjectCreator || isInProjectTeam;
            } else {
                const isCreator = oldTask.createdBy?.toString() === req.user!._id.toString();
                const isAssigned = oldTask.assignedTo?.toString() === req.user!._id.toString();
                authorized = isCreator || isAssigned;
            }

            if (!authorized) {
                res.status(403).json({ message: 'Insufficient permissions.' });
                return;
            }
        }

        // Everyone authorized above to update everything
        const userId = req.user!._id.toString();

        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' })
            .populate('assignedTo', 'name email avatar')
            .populate('createdBy', 'name email')
            .populate('assignment', 'title');

        // Notify on status change
        if (req.body.status && req.body.status !== oldTask.status) {
            const notifyLink = oldTask.assignment
                ? `/assignments/${oldTask.assignment}?tab=tasks&taskId=${oldTask._id}`
                : `/tasks?taskId=${oldTask._id}`;

            if (userId !== oldTask.assignedTo.toString()) {
                await createNotification({
                    user: oldTask.assignedTo,
                    type: NotificationType.STATUS_CHANGED,
                    title: 'Task Status Updated',
                    message: `Task "${oldTask.title}" status changed to ${req.body.status}`,
                    link: notifyLink,
                });
            }

            if (userId !== oldTask.createdBy.toString()) {
                await createNotification({
                    user: oldTask.createdBy,
                    type: NotificationType.STATUS_CHANGED,
                    title: 'Task Status Updated',
                    message: `Task "${oldTask.title}" status changed to ${req.body.status} by ${req.user!.name}`,
                    link: notifyLink,
                });
            }
        }

        await ActivityLog.create({
            action: 'Task updated',
            user: req.user!._id,
            entityType: EntityType.TASK,
            entityId: oldTask._id,
            metadata: { updates: Object.keys(req.body), status: req.body.status },
        });

        res.json({ task });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const reorderTasks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates) || updates.length === 0) {
            res.status(400).json({ message: 'updates must be a non-empty array of { taskId, rank }' });
            return;
        }

        const bulkOps = updates.map(({ taskId, rank }: { taskId: string; rank: number }) => ({
            updateOne: {
                filter: { _id: taskId },
                update: { rank },
            },
        }));

        await Task.bulkWrite(bulkOps);

        res.json({ message: 'Tasks reordered successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteTask = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantUserIds = await getTenantUserIds(req.user);
        const task = await Task.findById(req.params.id);
        if (!task) {
            res.status(404).json({ message: 'Task not found' });
            return;
        }

        // Tenant check
        const assigneeInTenant = task.assignedTo && tenantUserIds.includes(task.assignedTo.toString());
        const creatorInTenant = task.createdBy && tenantUserIds.includes(task.createdBy.toString());
        if (!assigneeInTenant && !creatorInTenant) {
            res.status(403).json({ message: 'Access denied' });
            return;
        }

        // Authorization check: Admin OR owner OR in project team
        if (req.user!.role !== 'admin') {
            let authorized = false;

            if (task.assignment) {
                const AssignmentModel = mongoose.model('Assignment');
                const assignment: any = await AssignmentModel.findById(task.assignment);
                const isProjectCreator = assignment?.createdBy?.toString() === req.user!._id.toString();
                const isInProjectTeam = assignment?.team?.some((id: any) => id.toString() === req.user!._id.toString());
                authorized = isProjectCreator || isInProjectTeam;
            } else {
                const isCreator = task.createdBy?.toString() === req.user!._id.toString();
                const isAssigned = task.assignedTo?.toString() === req.user!._id.toString();
                authorized = isCreator || isAssigned;
            }

            if (!authorized) {
                res.status(403).json({ message: 'Insufficient permissions.' });
                return;
            }
        }

        await task.deleteOne();

        await ActivityLog.create({
            action: 'Task deleted',
            user: req.user!._id,
            entityType: EntityType.TASK,
            entityId: task._id,
            metadata: { title: task.title },
        });

        res.json({ message: 'Task deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
