"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTask = exports.updateTask = exports.getTask = exports.getTasks = exports.createTask = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const mongoose = mongoose_1.default;
const Task_1 = __importDefault(require("../models/Task"));
const ActivityLog_1 = __importStar(require("../models/ActivityLog"));
const notificationService_1 = require("../services/notificationService");
const Notification_1 = require("../models/Notification");
const tenant_1 = require("../utils/tenant");
const createTask = async (req, res) => {
    try {
        const AssignmentModel = mongoose.model('Assignment');
        let assignment = null;
        if (req.body.assignment) {
            assignment = await AssignmentModel.findById(req.body.assignment);
            if (!assignment) {
                res.status(404).json({ message: 'Assignment not found' });
                return;
            }
            const isCreator = assignment.createdBy.toString() === req.user._id.toString();
            const isInTeam = assignment.team?.some((id) => id.toString() === req.user._id.toString());
            if (req.user.role !== 'admin' && !isCreator && !isInTeam) {
                res.status(403).json({ message: 'Insufficient permissions: You are not included in this project.' });
                return;
            }
            if (assignment.status === 'not_started') {
                assignment.status = 'in_progress';
                await assignment.save();
            }
        }
        const task = await Task_1.default.create({
            ...req.body,
            createdBy: req.user._id,
        });
        if (task.assignedTo.toString() !== req.user._id.toString()) {
            const link = assignment
                ? `/assignments/${task.assignment}?tab=tasks&taskId=${task._id}`
                : `/tasks?taskId=${task._id}`;
            await (0, notificationService_1.createNotification)({
                user: task.assignedTo,
                type: Notification_1.NotificationType.TASK_ASSIGNED,
                title: 'New Task Assigned',
                message: `You have been assigned task: ${task.title}`,
                link,
            });
        }
        await ActivityLog_1.default.create({
            action: 'Task created',
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.TASK,
            entityId: task._id,
            metadata: { title: task.title },
        });
        const populated = await Task_1.default.findById(task._id)
            .populate('assignedTo', 'name email avatar')
            .populate('createdBy', 'name email')
            .populate('assignment', 'title');
        res.status(201).json({ task: populated });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createTask = createTask;
const getTasks = async (req, res) => {
    try {
        const { assignment: assignmentId, status, priority, assignedTo, search, companyId } = req.query;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        let andConditions = [
            // Base tenant filter: task assigned to or created by users in this tenant
            { $or: [{ assignedTo: { $in: tenantUserIds } }, { createdBy: { $in: tenantUserIds } }] }
        ];
        if (assignmentId)
            andConditions.push({ assignment: assignmentId });
        if (status)
            andConditions.push({ status: status });
        if (priority)
            andConditions.push({ priority: priority });
        if (assignedTo)
            andConditions.push({ assignedTo: assignedTo });
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            // Search by task title OR by company name via assignment
            const AssignmentModel = (await Promise.resolve().then(() => __importStar(require('../models/Assignment')))).default;
            const CompanyModel = (await Promise.resolve().then(() => __importStar(require('../models/Company')))).default;
            const matchedCompany = await CompanyModel.findOne({ name: searchRegex });
            if (matchedCompany) {
                const companyAssignments = await AssignmentModel.find({ companyId: matchedCompany._id }).distinct('_id');
                andConditions.push({
                    $or: [
                        { title: searchRegex },
                        { assignment: { $in: companyAssignments } }
                    ]
                });
            }
            else {
                andConditions.push({ title: searchRegex });
            }
        }
        if (companyId) {
            const AssignmentModel = (await Promise.resolve().then(() => __importStar(require('../models/Assignment')))).default;
            const assignments = await AssignmentModel.find({ companyId }).distinct('_id');
            andConditions.push({ assignment: { $in: assignments } });
        }
        // Roles and permissions visibility enforcement
        if (req.user.role === 'member') {
            // Employees see tasks assigned to them OR tasks in projects where they are in the team
            const AssignmentModel = (await Promise.resolve().then(() => __importStar(require('../models/Assignment')))).default;
            const myProjectIds = await AssignmentModel.find({
                $or: [
                    { team: req.user._id },
                    { createdBy: req.user._id }
                ]
            }).distinct('_id');
            andConditions.push({
                $or: [
                    { assignedTo: req.user._id },
                    { assignment: { $in: myProjectIds } }
                ]
            });
        }
        else if (req.user.role === 'manager') {
            // Managers see tasks in projects they manage OR standalone tasks they created/are assigned to
            const Team = (await Promise.resolve().then(() => __importStar(require('../models/Team')))).default;
            const AssignmentModel = (await Promise.resolve().then(() => __importStar(require('../models/Assignment')))).default;
            const managedTeams = await Team.find({ manager: req.user._id }).distinct('_id');
            const myProjectIds = await AssignmentModel.find({
                $or: [
                    { createdBy: req.user._id },
                    { teams: { $in: managedTeams } },
                    { team: req.user._id }
                ]
            }).distinct('_id');
            andConditions.push({
                $or: [
                    { assignment: { $in: myProjectIds } },
                    {
                        $and: [
                            { assignment: { $exists: false } },
                            { $or: [{ assignedTo: req.user._id }, { createdBy: req.user._id }] }
                        ]
                    }
                ]
            });
        }
        // Admins have no additional filters (see all)
        const filter = andConditions.length > 0 ? { $and: andConditions } : {};
        const tasks = await Task_1.default.find(filter)
            .populate('assignedTo', 'name email avatar')
            .populate('createdBy', 'name email')
            .populate('assignment', 'title')
            .sort({ createdAt: -1 });
        res.json({ tasks });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTasks = getTasks;
const getTask = async (req, res) => {
    try {
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const task = await Task_1.default.findById(req.params.id)
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
        if (req.user.role !== 'admin') {
            if (task.assignment) {
                const AssignmentModel = (await Promise.resolve().then(() => __importStar(require('../models/Assignment')))).default;
                const assignment = await AssignmentModel.findById(task.assignment);
                const isMember = assignment?.team?.some((id) => id.toString() === req.user._id.toString());
                if (!isMember && req.user.role === 'member') {
                    res.status(403).json({ message: 'Access denied' });
                    return;
                }
            }
            else if (req.user.role === 'member' && task.assignedTo?.toString() !== req.user._id.toString() && task.createdBy?.toString() !== req.user._id.toString()) {
                res.status(403).json({ message: 'Access denied' });
                return;
            }
        }
        res.json({ task });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTask = getTask;
const updateTask = async (req, res) => {
    try {
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const oldTask = await Task_1.default.findById(req.params.id);
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
        if (req.user.role !== 'admin') {
            let authorized = false;
            if (oldTask.assignment) {
                const AssignmentModel = mongoose.model('Assignment');
                const assignment = await AssignmentModel.findById(oldTask.assignment);
                const isProjectCreator = assignment?.createdBy?.toString() === req.user._id.toString();
                const isInProjectTeam = assignment?.team?.some((id) => id.toString() === req.user._id.toString());
                authorized = isProjectCreator || isInProjectTeam;
            }
            else {
                const isCreator = oldTask.createdBy?.toString() === req.user._id.toString();
                const isAssigned = oldTask.assignedTo?.toString() === req.user._id.toString();
                authorized = isCreator || isAssigned;
            }
            if (!authorized) {
                res.status(403).json({ message: 'Insufficient permissions.' });
                return;
            }
        }
        // Security check for status override
        if (req.user.role === 'member') {
            // Member CANNOT set status to completed directly
            if (req.body.status === 'completed') {
                req.body.status = 'review';
            }
        }
        // Everyone authorized above to update everything
        const userId = req.user._id.toString();
        const task = await Task_1.default.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' })
            .populate('assignedTo', 'name email avatar')
            .populate('createdBy', 'name email')
            .populate('assignment', 'title');
        // Notify on status change
        if (req.body.status && req.body.status !== oldTask.status) {
            const notifyLink = oldTask.assignment
                ? `/assignments/${oldTask.assignment}?tab=tasks&taskId=${oldTask._id}`
                : `/tasks?taskId=${oldTask._id}`;
            if (userId !== oldTask.assignedTo.toString()) {
                await (0, notificationService_1.createNotification)({
                    user: oldTask.assignedTo,
                    type: Notification_1.NotificationType.STATUS_CHANGED,
                    title: 'Task Status Updated',
                    message: `Task "${oldTask.title}" status changed to ${req.body.status}`,
                    link: notifyLink,
                });
            }
            if (userId !== oldTask.createdBy.toString()) {
                await (0, notificationService_1.createNotification)({
                    user: oldTask.createdBy,
                    type: Notification_1.NotificationType.STATUS_CHANGED,
                    title: 'Task Status Updated',
                    message: `Task "${oldTask.title}" status changed to ${req.body.status} by ${req.user.name}`,
                    link: notifyLink,
                });
            }
        }
        await ActivityLog_1.default.create({
            action: 'Task updated',
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.TASK,
            entityId: oldTask._id,
            metadata: { updates: Object.keys(req.body), status: req.body.status },
        });
        res.json({ task });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateTask = updateTask;
const deleteTask = async (req, res) => {
    try {
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const task = await Task_1.default.findById(req.params.id);
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
        if (req.user.role !== 'admin') {
            let authorized = false;
            if (task.assignment) {
                const AssignmentModel = mongoose.model('Assignment');
                const assignment = await AssignmentModel.findById(task.assignment);
                const isProjectCreator = assignment?.createdBy?.toString() === req.user._id.toString();
                const isInProjectTeam = assignment?.team?.some((id) => id.toString() === req.user._id.toString());
                authorized = isProjectCreator || isInProjectTeam;
            }
            else {
                const isCreator = task.createdBy?.toString() === req.user._id.toString();
                const isAssigned = task.assignedTo?.toString() === req.user._id.toString();
                authorized = isCreator || isAssigned;
            }
            if (!authorized) {
                res.status(403).json({ message: 'Insufficient permissions.' });
                return;
            }
        }
        await task.deleteOne();
        await ActivityLog_1.default.create({
            action: 'Task deleted',
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.TASK,
            entityId: task._id,
            metadata: { title: task.title },
        });
        res.json({ message: 'Task deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteTask = deleteTask;
//# sourceMappingURL=taskController.js.map