"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportReport = exports.getActivityReport = exports.getWorkloadReport = exports.getEmployeeTrackingReport = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Task_1 = __importDefault(require("../models/Task"));
const ActivityLog_1 = __importDefault(require("../models/ActivityLog"));
const Attachment_1 = __importDefault(require("../models/Attachment"));
const Team_1 = __importDefault(require("../models/Team"));
const User_1 = __importDefault(require("../models/User"));
const exceljs_1 = __importDefault(require("exceljs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const tenant_1 = require("../utils/tenant");
/**
 * Helper to get role-based constraints and shared filters
 */
const getBaseFilters = async (req) => {
    const userRole = req.user.role;
    const userId = req.user._id;
    const { teamId, employeeId, projectId, status, startDate, endDate } = req.query;
    const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
    let userFilter = {};
    let teamFilter = {};
    const taskMatch = {};
    const activityMatch = {};
    // 1. Role-based scoping with tenant enforcement
    if (userRole === 'member') {
        userFilter._id = userId;
        teamFilter.members = userId;
        taskMatch.assignedTo = userId;
        activityMatch.user = userId;
    }
    else if (userRole === 'manager') {
        const managedTeams = await Team_1.default.find({ manager: userId }).distinct('_id');
        const allManagedMembers = await Team_1.default.find({ manager: userId }).distinct('members');
        const managedMembers = allManagedMembers.filter((m) => tenantUserIds.includes(m.toString()));
        if (teamId) {
            const tId = new mongoose_1.default.Types.ObjectId(teamId);
            teamFilter._id = tId;
            const team = await Team_1.default.findById(tId);
            const roster = [...(team?.members || []), team?.manager].filter(Boolean);
            const tenantRoster = roster.filter((m) => tenantUserIds.includes(m.toString()));
            userFilter._id = { $in: tenantRoster };
            taskMatch.assignedTo = { $in: tenantRoster };
            activityMatch.user = { $in: tenantRoster };
        }
        else {
            teamFilter._id = { $in: managedTeams };
            const roster = Array.from(new Set([...managedMembers, userId.toString()]));
            userFilter._id = { $in: roster };
            taskMatch.assignedTo = { $in: roster };
            activityMatch.user = { $in: roster };
        }
    }
    else if (userRole === 'admin') {
        // Always apply tenant scoping for admin
        if (teamId) {
            const team = await Team_1.default.findById(teamId);
            const roster = [...(team?.members || []), team?.manager].filter(Boolean);
            const tenantRoster = roster.filter((m) => tenantUserIds.includes(m.toString()));
            taskMatch.assignedTo = { $in: tenantRoster };
            activityMatch.user = { $in: tenantRoster };
            userFilter._id = { $in: tenantRoster };
        }
        else if (employeeId) {
            if (!tenantUserIds.includes(employeeId)) {
                // Employee not in this tenant — return empty
                userFilter._id = null;
                taskMatch.assignedTo = null;
                activityMatch.user = null;
            }
            else {
                const eId = new mongoose_1.default.Types.ObjectId(employeeId);
                userFilter._id = eId;
                taskMatch.assignedTo = eId;
                activityMatch.user = eId;
            }
        }
        else {
            // No specific filter — scope to all tenant users
            taskMatch.assignedTo = { $in: tenantUserIds };
            activityMatch.user = { $in: tenantUserIds };
            userFilter._id = { $in: tenantUserIds };
        }
    }
    // 2. Query-based filters
    if (status)
        taskMatch.status = status;
    if (projectId)
        taskMatch.assignment = new mongoose_1.default.Types.ObjectId(projectId);
    if (startDate || endDate) {
        const dateFilter = {};
        if (startDate)
            dateFilter.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.$lte = end;
        }
        // For reports, we typically care about activity occurring in the range
        taskMatch.updatedAt = dateFilter;
        activityMatch.createdAt = dateFilter;
    }
    return { userFilter, teamFilter, taskMatch, activityMatch };
};
const getEmployeeTrackingReport = async (req, res) => {
    try {
        const { taskMatch } = await getBaseFilters(req);
        const employeeAggregation = await Task_1.default.aggregate([
            { $match: taskMatch },
            {
                $group: {
                    _id: '$assignedTo',
                    tasks: { $push: '$_id' },
                    assignments: { $addToSet: '$assignment' },
                    activeDays: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } } }
                }
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            {
                $project: {
                    name: '$user.name',
                    avatar: '$user.avatar',
                    taskCount: { $size: '$tasks' },
                    assignmentCount: { $size: '$assignments' },
                    activeDaysCount: { $size: '$activeDays' }
                }
            },
            { $sort: { activeDaysCount: -1, taskCount: -1 } }
        ]);
        const totalEmployees = employeeAggregation.length;
        const totals = await Task_1.default.aggregate([
            { $match: taskMatch },
            {
                $group: {
                    _id: null,
                    uniqueAssignments: { $addToSet: '$assignment' },
                    totalTasks: { $sum: 1 }
                }
            }
        ]);
        const overallTotalAssignments = totals[0]?.uniqueAssignments.length || 0;
        const overallTotalTasks = totals[0]?.totalTasks || 0;
        const avgActiveDays = totalEmployees > 0
            ? Math.round(employeeAggregation.reduce((acc, curr) => acc + curr.activeDaysCount, 0) / totalEmployees)
            : 0;
        const dailyTrends = await Task_1.default.aggregate([
            { $match: taskMatch },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                    tasksHandled: { $sum: 1 },
                    uniqueEmployees: { $addToSet: '$assignedTo' }
                }
            },
            { $project: { _id: 1, tasksHandled: 1, activeEmployees: { $size: '$uniqueEmployees' } } },
            { $sort: { _id: 1 } },
            { $limit: 30 }
        ]);
        res.json({
            data: {
                employeeStats: employeeAggregation,
                overallStats: {
                    totalEmployees,
                    totalAssignments: overallTotalAssignments,
                    totalTasks: overallTotalTasks,
                    avgActiveDays
                },
                dailyTrends
            }
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getEmployeeTrackingReport = getEmployeeTrackingReport;
const getWorkloadReport = async (req, res) => {
    try {
        const { taskMatch, userFilter } = await getBaseFilters(req);
        // Filter for active tasks unless status is explicitly requested as 'completed'
        const activeTaskMatch = { ...taskMatch };
        if (!activeTaskMatch.status) {
            activeTaskMatch.status = { $ne: 'completed' };
        }
        const workloadDistribution = await Task_1.default.aggregate([
            { $match: activeTaskMatch },
            {
                $group: {
                    _id: '$assignedTo',
                    taskCount: { $sum: 1 },
                    urgentCount: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } }
                }
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            { $project: { name: '$user.name', taskCount: 1, urgentCount: 1 } },
            { $sort: { taskCount: -1 } }
        ]);
        const totalEmployees = await User_1.default.countDocuments(userFilter);
        // Actual Heatmap logic for the last 28 days
        const twentyEightDaysAgo = new Date();
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
        const heatmapRaw = await Task_1.default.aggregate([
            { $match: { ...taskMatch, updatedAt: { $gte: twentyEightDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                    tasks: { $sum: 1 }
                }
            }
        ]);
        res.json({
            data: {
                workloadDistribution,
                totalEmployees,
                heatmapRaw
            }
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getWorkloadReport = getWorkloadReport;
const getActivityReport = async (req, res) => {
    try {
        const { activityMatch, taskMatch } = await getBaseFilters(req);
        // Attachment Activity - filtered by project if specified
        const attachmentMatch = { assignment: { $exists: true } };
        if (taskMatch.assignment)
            attachmentMatch.assignment = taskMatch.assignment;
        if (taskMatch.createdAt)
            attachmentMatch.createdAt = taskMatch.createdAt;
        const fileCountPerProject = await Attachment_1.default.aggregate([
            { $match: attachmentMatch },
            { $group: { _id: '$assignment', fileCount: { $sum: 1 } } },
            { $lookup: { from: 'assignments', localField: '_id', foreignField: '_id', as: 'project' } },
            { $unwind: '$project' },
            { $project: { title: '$project.title', fileCount: 1 } },
            { $sort: { fileCount: -1 } },
            { $limit: 10 }
        ]);
        // Activity Logs - filtered by user/team/date
        const activityDistribution = await ActivityLog_1.default.aggregate([
            { $match: activityMatch },
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 }
        ]);
        const recentActivities = await ActivityLog_1.default.find(activityMatch)
            .populate('user', 'name avatar')
            .sort({ createdAt: -1 })
            .limit(15);
        const totalActivities = await ActivityLog_1.default.countDocuments(activityMatch);
        res.json({
            data: {
                fileCountPerProject,
                activityDistribution,
                recentActivities,
                totalActivities
            }
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getActivityReport = getActivityReport;
const exportReport = async (req, res) => {
    try {
        const { type, reportType } = req.query;
        if (!type || !reportType) {
            res.status(400).json({ message: 'Missing type or reportType query parameters' });
            return;
        }
        const { taskMatch, activityMatch } = await getBaseFilters(req);
        let dataToExport = [];
        let columns = [];
        if (reportType === 'employee') {
            const employeeAggregation = await Task_1.default.aggregate([
                { $match: taskMatch },
                {
                    $group: {
                        _id: '$assignedTo',
                        tasks: { $push: '$_id' },
                        assignments: { $addToSet: '$assignment' },
                        activeDays: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } } }
                    }
                },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
                { $unwind: '$user' },
                {
                    $project: {
                        name: '$user.name',
                        taskCount: { $size: '$tasks' },
                        assignmentCount: { $size: '$assignments' },
                        activeDaysCount: { $size: '$activeDays' }
                    }
                },
                { $sort: { activeDaysCount: -1, taskCount: -1 } }
            ]);
            dataToExport = employeeAggregation;
            columns = [
                { header: 'Employee', key: 'name', width: 30 },
                { header: 'Assignments Worked On', key: 'assignmentCount', width: 25 },
                { header: 'Tasks Handled', key: 'taskCount', width: 20 },
                { header: 'Active Days', key: 'activeDaysCount', width: 20 }
            ];
        }
        else if (reportType === 'workload') {
            dataToExport = await Task_1.default.aggregate([
                { $match: taskMatch },
                { $group: { _id: '$assignedTo', taskCount: { $sum: 1 } } },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
                { $unwind: '$user' },
                { $project: { name: '$user.name', taskCount: 1 } }
            ]);
            columns = [
                { header: 'Employee Name', key: 'name', width: 30 },
                { header: 'Task Count', key: 'taskCount', width: 15 }
            ];
        }
        else if (reportType === 'activity') {
            dataToExport = await ActivityLog_1.default.aggregate([
                { $match: activityMatch },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
            columns = [
                { header: 'Action', key: '_id', width: 30 },
                { header: 'Count', key: 'count', width: 15 }
            ];
        }
        else {
            const tasks = await Task_1.default.find(taskMatch).populate('assignedTo', 'name').populate('assignment', 'title').lean();
            dataToExport = tasks.map((t) => ({
                title: t.title,
                status: t.status,
                priority: t.priority,
                assignedTo: t.assignedTo?.name || 'Unassigned',
                project: t.assignment?.title || 'No Project'
            }));
            columns = [
                { header: 'Task Title', key: 'title', width: 40 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Priority', key: 'priority', width: 15 },
                { header: 'Assigned To', key: 'assignedTo', width: 25 },
                { header: 'Project', key: 'project', width: 30 }
            ];
        }
        const filename = `report_${reportType}_${Date.now()}`;
        if (type === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            const headerRow = columns.map(c => c.header).join(',');
            const rows = dataToExport.map(row => columns.map(c => {
                const val = row[c.key] !== undefined ? row[c.key] : '';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(','));
            res.send([headerRow, ...rows].join('\n'));
            return;
        }
        if (type === 'excel') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            const workbook = new exceljs_1.default.Workbook();
            const worksheet = workbook.addWorksheet('Report');
            worksheet.columns = columns;
            dataToExport.forEach(row => worksheet.addRow(row));
            await workbook.xlsx.write(res);
            res.end();
            return;
        }
        if (type === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            const doc = new pdfkit_1.default({ margin: 30 });
            doc.pipe(res);
            doc.fontSize(16).text(`FlowDesk Report - ${String(reportType).toUpperCase()}`, { align: 'center' });
            doc.moveDown();
            doc.fontSize(12);
            dataToExport.forEach((row, idx) => {
                const text = columns.map(c => `${c.header}: ${row[c.key]}`).join(' | ');
                doc.text(`${idx + 1}. ${text}`);
                doc.moveDown(0.5);
            });
            doc.end();
            return;
        }
        res.status(400).json({ message: 'Invalid export type' });
    }
    catch (error) {
        console.error('Export Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.exportReport = exportReport;
//# sourceMappingURL=reportController.js.map