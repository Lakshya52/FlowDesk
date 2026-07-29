import { Response } from 'express';
import mongoose from 'mongoose';
import Task from '../models/Task';
import Assignment from '../models/Assignment';
import ActivityLog from '../models/ActivityLog';
import Attachment from '../models/Attachment';
import Team from '../models/Team';
import User from '../models/User';
import { AuthRequest } from '../middlewares/auth';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getTenantId, getTenantUserIds } from '../utils/tenant';

/**
 * Helper to get role-based constraints and shared filters
 */
const getBaseFilters = async (req: AuthRequest) => {
    const userRole = req.user!.role;
    const userId = req.user!._id;
    const tenantId = getTenantId(req.user);
    const { teamId, employeeId, projectId, status, startDate, endDate } = req.query;
    const tenantUserIds = await getTenantUserIds(req.user);

    let userFilter: any = {};
    let teamFilter: any = {};
    const taskMatch: any = {};
    const activityMatch: any = {};

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    // 1. Role-based scoping with tenant enforcement
    if (userRole === 'member') {
        userFilter._id = userId;
        teamFilter.members = userId;
        taskMatch.assignedTo = userId;
        activityMatch.user = userId;
    } else if (userRole === 'manager') {
        const managedTeams = await Team.find({ manager: userId, tenantId: tenantObjectId }).distinct('_id');
        const allManagedMembers = await Team.find({ manager: userId, tenantId: tenantObjectId }).distinct('members');
        const managedMembers = allManagedMembers.filter((m: any) =>
            tenantUserIds.includes(m.toString())
        );
        
        if (teamId) {
            const tId = new mongoose.Types.ObjectId(teamId as string);
            teamFilter._id = tId;
            const team = await Team.findOne({ _id: tId, tenantId: tenantObjectId });
            const roster = [...(team?.members || []), team?.manager].filter(Boolean);
            const tenantRoster = roster.filter((m: any) => tenantUserIds.includes(m.toString()));
            userFilter._id = { $in: tenantRoster };
            taskMatch.assignedTo = { $in: tenantRoster };
            activityMatch.user = { $in: tenantRoster };
        } else {
            teamFilter._id = { $in: managedTeams };
            const roster = Array.from(new Set([...managedMembers, userId.toString()]));
            userFilter._id = { $in: roster };
            taskMatch.assignedTo = { $in: roster };
            activityMatch.user = { $in: roster };
        }
    } else if (userRole === 'admin') {
        // Always apply tenant scoping for admin
        if (teamId) {
            const team = await Team.findOne({ _id: teamId, tenantId: tenantObjectId });
            const roster = [...(team?.members || []), team?.manager].filter(Boolean);
            const tenantRoster = roster.filter((m: any) => tenantUserIds.includes(m.toString()));
            taskMatch.assignedTo = { $in: tenantRoster };
            activityMatch.user = { $in: tenantRoster };
            userFilter._id = { $in: tenantRoster };
        } else if (employeeId) {
            if (!tenantUserIds.includes(employeeId as string)) {
                // Employee not in this tenant — return empty
                userFilter._id = null;
                taskMatch.assignedTo = null;
                activityMatch.user = null;
            } else {
                const eId = new mongoose.Types.ObjectId(employeeId as string);
                userFilter._id = eId;
                taskMatch.assignedTo = eId;
                activityMatch.user = eId;
            }
        } else {
            // No specific filter — scope to all tenant users
            taskMatch.assignedTo = { $in: tenantUserIds };
            activityMatch.user = { $in: tenantUserIds };
            userFilter._id = { $in: tenantUserIds };
        }
    }

    // 2. Query-based filters
    if (status) taskMatch.status = status;
    if (projectId) taskMatch.assignment = new mongoose.Types.ObjectId(projectId as string);

    if (startDate || endDate) {
        const dateFilter: any = {};
        if (startDate) dateFilter.$gte = new Date(startDate as string);
        if (endDate) {
            const end = new Date(endDate as string);
            end.setHours(23, 59, 59, 999);
            dateFilter.$lte = end;
        }
        // For reports, we typically care about activity occurring in the range
        taskMatch.updatedAt = dateFilter; 
        activityMatch.createdAt = dateFilter;
    }

    return { userFilter, teamFilter, taskMatch, activityMatch };
};

export const getEmployeeTrackingReport = async (req: AuthRequest, res: Response) => {
    try {
        const { taskMatch } = await getBaseFilters(req);

        const employeeAggregation = await Task.aggregate([
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
        
        const totals = await Task.aggregate([
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

        const dailyTrends = await Task.aggregate([
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
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getWorkloadReport = async (req: AuthRequest, res: Response) => {
    try {
        const { taskMatch, userFilter } = await getBaseFilters(req);

        // Filter for active tasks unless status is explicitly requested as 'completed'
        const activeTaskMatch = { ...taskMatch };
        if (!activeTaskMatch.status) {
            activeTaskMatch.status = { $ne: 'completed' };
        }

        const workloadDistribution = await Task.aggregate([
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

        const totalEmployees = await User.countDocuments(userFilter);

        // Actual Heatmap logic for the last 28 days
        const twentyEightDaysAgo = new Date();
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
        
        const heatmapRaw = await Task.aggregate([
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
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getActivityReport = async (req: AuthRequest, res: Response) => {
    try {
        const { activityMatch, taskMatch } = await getBaseFilters(req);

        // Attachment Activity - filtered by project if specified
        const attachmentMatch: any = { assignment: { $exists: true } };
        if (taskMatch.assignment) attachmentMatch.assignment = taskMatch.assignment;
        if (taskMatch.createdAt) attachmentMatch.createdAt = taskMatch.createdAt;

        const fileCountPerProject = await Attachment.aggregate([
            { $match: attachmentMatch },
            { $group: { _id: '$assignment', fileCount: { $sum: 1 } } },
            { $lookup: { from: 'assignments', localField: '_id', foreignField: '_id', as: 'project' } },
            { $unwind: '$project' },
            { $project: { title: '$project.title', fileCount: 1 } },
            { $sort: { fileCount: -1 } },
            { $limit: 10 }
        ]);

        // Activity Logs - filtered by user/team/date
        const activityDistribution = await ActivityLog.aggregate([
            { $match: activityMatch },
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 }
        ]);

        const recentActivities = await ActivityLog.find(activityMatch)
            .populate('user', 'name avatar')
            .sort({ createdAt: -1 })
            .limit(15);

        const totalActivities = await ActivityLog.countDocuments(activityMatch);

        res.json({ 
            data: { 
                fileCountPerProject, 
                activityDistribution, 
                recentActivities, 
                totalActivities 
            } 
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};



export const exportReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { type, reportType } = req.query;
        if (!type || !reportType) {
            res.status(400).json({ message: 'Missing type or reportType query parameters' });
            return;
        }

        const { taskMatch, activityMatch } = await getBaseFilters(req);
        
        let dataToExport: any[] = [];
        let columns: { header: string; key: string; width?: number }[] = [];

        if (reportType === 'employee') {
            const employeeAggregation = await Task.aggregate([
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
        } else if (reportType === 'workload') {
             dataToExport = await Task.aggregate([
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
        } else if (reportType === 'activity') {
            dataToExport = await ActivityLog.aggregate([
                { $match: activityMatch },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
            columns = [
                { header: 'Action', key: '_id', width: 30 },
                { header: 'Count', key: 'count', width: 15 }
            ];
        } else {
            const tasks = await Task.find(taskMatch).populate('assignedTo', 'name').populate('assignment', 'title').lean();
            dataToExport = tasks.map((t: any) => ({
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
            const rows = dataToExport.map(row => 
                columns.map(c => {
                    const val = row[c.key] !== undefined ? row[c.key] : '';
                    return `"${String(val).replace(/"/g, '""')}"`;
                }).join(',')
            );
            res.send([headerRow, ...rows].join('\n'));
            return;
        }

        if (type === 'excel') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            
            const workbook = new ExcelJS.Workbook();
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
            
            const doc = new PDFDocument({ margin: 30 });
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

    } catch (error: any) {
        console.error('Export Error:', error);
        res.status(500).json({ message: error.message });
    }
};
