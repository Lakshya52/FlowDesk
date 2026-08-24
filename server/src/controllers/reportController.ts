import { Response } from 'express';
import mongoose from 'mongoose';
import Task from '../models/Task';
import Assignment from '../models/Assignment';
import ActivityLog from '../models/ActivityLog';
import Team from '../models/Team';
import User from '../models/User';
import { AuthRequest } from '../middlewares/auth';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getTenantId, getTenantUserIds } from '../utils/tenant';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Safely cast a value to ObjectId; returns null when invalid (no 500s). */
const safeObjectId = (val: unknown): mongoose.Types.ObjectId | null => {
    if (!val || typeof val !== 'string' || !mongoose.Types.ObjectId.isValid(val)) return null;
    return new mongoose.Types.ObjectId(val);
};

/** Escape user input for safe embedding in a RegExp. */
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface ReportRange { start?: Date; end?: Date }

/**
 * Normalizes startDate/endDate query params.
 * endDate is expanded to end-of-day. Invalid values are ignored.
 */
const buildRange = (query: Record<string, unknown>): ReportRange => {
    const range: ReportRange = {};
    const start = new Date(String(query.startDate || ''));
    if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        range.start = start;
    }
    const end = new Date(String(query.endDate || ''));
    if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        range.end = end;
    }
    return range;
};

/** UTC-safe 'YYYY-MM-DD' key for grouping day buckets. */
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Builds the list of consecutive UTC day keys between two dates (inclusive). */
const dayKeysBetween = (start: Date, end: Date): string[] => {
    const keys: string[] = [];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    let guard = 0;
    while (cursor <= last && guard < 400) {
        keys.push(dayKey(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        guard++;
    }
    return keys;
};

const STALE_DAYS = 7;
const HOURS_PER_WEEK = 40;

/**
 * Role-based scoping shared by every report.
 * Returns mongo match stages plus the resolved user roster.
 */
const getBaseFilters = async (req: AuthRequest) => {
    const userRole = req.user!.role;
    const userId = req.user!._id;
    const tenantId = getTenantId(req.user);
    const { teamId, employeeId, projectId, status, startDate, endDate } = req.query;
    const tenantUserIds = await getTenantUserIds(req.user);
    const range = buildRange(req.query as Record<string, unknown>);

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
        const managedMembers = allManagedMembers.filter((m: any) => tenantUserIds.includes(m.toString()));

        const tId = teamId ? safeObjectId(teamId) : null;
        if (tId) {
            // Managers may only inspect teams they actually manage
            const ownsTeam = managedTeams.some((id: any) => id.toString() === tId.toString());
            if (!ownsTeam) {
                userFilter._id = null;
                taskMatch.assignedTo = null;
                activityMatch.user = null;
            } else {
                const team = await Team.findOne({ _id: tId, manager: userId });
                const roster: any[] = [...(team?.members || []), team?.manager].filter(Boolean);
                const tenantRoster = roster.filter((m: any) => tenantUserIds.includes(m.toString()))
                    .map((id) => new mongoose.Types.ObjectId(id.toString()));
                userFilter._id = { $in: tenantRoster };
                taskMatch.assignedTo = { $in: tenantRoster };
                activityMatch.user = { $in: tenantRoster };
            }
        } else {
            teamFilter._id = { $in: managedTeams };
            const roster = Array.from(new Set([...managedMembers, userId.toString()]))
                .map((id) => new mongoose.Types.ObjectId(id));
            userFilter._id = { $in: roster };
            taskMatch.assignedTo = { $in: roster };
            activityMatch.user = { $in: roster };
        }
    } else if (userRole === 'admin') {
        // Always apply tenant scoping for admin
        const tId = teamId ? safeObjectId(teamId) : null;
        if (tId) {
            const team = await Team.findOne({ _id: tId, tenantId: tenantObjectId });
            const roster: any[] = [...(team?.members || []), team?.manager].filter(Boolean);
            const tenantRoster = roster.filter((m: any) => tenantUserIds.includes(m.toString()))
                .map((id) => new mongoose.Types.ObjectId(id.toString()));
            taskMatch.assignedTo = { $in: tenantRoster };
            activityMatch.user = { $in: tenantRoster };
            userFilter._id = { $in: tenantRoster };
        } else if (employeeId) {
            if (!tenantUserIds.includes(employeeId as string)) {
                // Employee not in this tenant — force empty result set
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
            const tenantObjectIds = tenantUserIds.map((id) => new mongoose.Types.ObjectId(id));
            taskMatch.assignedTo = { $in: tenantObjectIds };
            activityMatch.user = { $in: tenantObjectIds };
            userFilter._id = { $in: tenantObjectIds };
        }
    }

    // 2. Query-based filters
    if (status) taskMatch.status = status;
    const pId = projectId ? safeObjectId(projectId) : null;
    if (projectId && !pId) {
        // Malformed project id → guarantee an empty result instead of crashing
        taskMatch._id = null;
    } else if (pId) {
        taskMatch.assignment = pId;
    }

    // 3. Date range (activity window)
    if (range.start || range.end) {
        const dateFilter: any = {};
        if (range.start) dateFilter.$gte = range.start;
        if (range.end) dateFilter.$lte = range.end;
        taskMatch.updatedAt = dateFilter;
        activityMatch.createdAt = dateFilter;
    }

    return { userFilter, teamFilter, taskMatch, activityMatch, range, tenantUserIds, tenantId };
};

/**
 * Effective reporting window: explicit range when provided,
 * otherwise the last N days ending today (UTC day boundaries).
 */
const resolveWindow = (range: ReportRange, defaultDays: number) => {
    const now = new Date();
    const end = range.end || new Date(now.getTime() + 86400000); // include today fully
    const fallbackStart = new Date(end.getTime() - (defaultDays - 1) * 86400000);
    fallbackStart.setUTCHours(0, 0, 0, 0);
    const start = range.start || fallbackStart;
    return { start, end, keys: dayKeysBetween(start, end) };
};

/* ------------------------------------------------------------------ */
/* Employee Tracking Report                                            */
/* ------------------------------------------------------------------ */

export const getEmployeeTrackingReport = async (req: AuthRequest, res: Response) => {
    try {
        const { taskMatch, range } = await getBaseFilters(req);
        const window = resolveWindow(range, 30);

        const now = new Date();

        // Per-employee metrics
        const employeeAggregation = await Task.aggregate([
            { $match: taskMatch },
            {
                $group: {
                    _id: '$assignedTo',
                    assignedCount: { $sum: 1 },
                    completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    overdueCount: {
                        $sum: {
                            $cond: [
                                { $and: [
                                    { $ne: ['$status', 'completed'] },
                                    { $ne: [{ $ifNull: ['$dueDate', null] }, null] },
                                    { $lt: ['$dueDate', now] },
                                ] },
                                1, 0,
                            ],
                        },
                    },
                    openCount: { $sum: { $cond: [{ $ne: ['$status', 'completed'] }, 1, 0] } },
                    activeDays: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } } },
                    completionTimes: {
                        $push: {
                            $cond: [
                                { $eq: ['$status', 'completed'] },
                                { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 86400000] },
                                null,
                            ],
                        },
                    },
                },
            },
            {
                $addFields: {
                    validCompletionTimes: {
                        $filter: { input: '$completionTimes', as: 't', cond: { $ne: ['$$t', null] } },
                    },
                },
            },
            {
                $addFields: {
                    completionRate: {
                        $cond: [
                            { $gt: ['$assignedCount', 0] },
                            { $round: [{ $multiply: [{ $divide: ['$completedCount', '$assignedCount'] }, 100] }, 0] },
                            0,
                        ],
                    },
                    avgCompletionDays: {
                        $cond: [
                            { $gt: [{ $size: '$validCompletionTimes' }, 0] },
                            { $round: [{ $avg: '$validCompletionTimes' }, 1] },
                            null,
                        ],
                    },
                    activeDays: { $size: '$activeDays' },
                },
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            {
                $project: {
                    _id: 1,
                    name: '$user.name',
                    avatar: '$user.avatar',
                    assignedCount: 1,
                    completedCount: 1,
                    overdueCount: 1,
                    openCount: 1,
                    completionRate: 1,
                    avgCompletionDays: 1,
                    activeDays: 1,
                },
            },
            { $sort: { overdueCount: -1, assignedCount: -1 } },
        ]);

        // Overall stats
        const totals = await Task.aggregate([
            { $match: taskMatch },
            {
                $group: {
                    _id: null,
                    totalTasks: { $sum: 1 },
                    completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    overdueTasks: {
                        $sum: {
                            $cond: [
                                { $and: [
                                    { $ne: ['$status', 'completed'] },
                                    { $ne: [{ $ifNull: ['$dueDate', null] }, null] },
                                    { $lt: ['$dueDate', now] },
                                ] },
                                1, 0,
                            ],
                        },
                    },
                    completionTimes: {
                        $push: {
                            $cond: [
                                { $eq: ['$status', 'completed'] },
                                { $subtract: ['$updatedAt', '$createdAt'] },
                                null,
                            ],
                        },
                    },
                },
            },
            {
                $addFields: {
                    validCompletionTimes: {
                        $filter: { input: '$completionTimes', as: 't', cond: { $ne: ['$$t', null] } },
                    },
                },
            },
            {
                $project: {
                    totalTasks: 1,
                    completedTasks: 1,
                    overdueTasks: 1,
                    completionRate: {
                        $cond: [
                            { $gt: ['$totalTasks', 0] },
                            { $round: [{ $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] }, 0] },
                            0,
                        ],
                    },
                    avgCompletionDays: {
                        $cond: [
                            { $gt: [{ $size: '$validCompletionTimes' }, 0] },
                            { $round: [{ $divide: [{ $avg: '$validCompletionTimes' }, 86400000] }, 1] },
                            0,
                        ],
                    },
                },
            },
        ]);

        // Daily trend over the effective window (created vs completed per day)
        const dailyTrendsRaw = await Task.aggregate([
            {
                $match: {
                    ...taskMatch,
                    $or: [
                        { createdAt: { $gte: window.start, $lte: window.end } },
                        { $and: [{ status: 'completed' }, { updatedAt: { $gte: window.start, $lte: window.end } }] },
                    ],
                },
            },
            {
                $facet: {
                    created: [
                        { $match: { createdAt: { $gte: window.start, $lte: window.end } } },
                        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                    ],
                    completed: [
                        { $match: { status: 'completed', updatedAt: { $gte: window.start, $lte: window.end } } },
                        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, count: { $sum: 1 } } },
                    ],
                },
            },
        ]);

        const createdMap = new Map((dailyTrendsRaw[0]?.created || []).map((r: any) => [r._id, r.count]));
        const completedMap = new Map((dailyTrendsRaw[0]?.completed || []).map((r: any) => [r._id, r.count]));
        const dailyTrends = window.keys.map((k) => ({
            _id: k,
            created: createdMap.get(k) || 0,
            completed: completedMap.get(k) || 0,
        }));

        res.json({
            data: {
                overallStats: {
                    totalEmployees: employeeAggregation.length,
                    ...(totals[0] || { totalTasks: 0, completedTasks: 0, overdueTasks: 0, completionRate: 0, avgCompletionDays: 0 }),
                },
                employeeStats: employeeAggregation,
                dailyTrends,
            },
        });
    } catch (error: any) {
        console.error('getEmployeeTrackingReport error:', error);
        res.status(500).json({ message: 'Failed to generate employee tracking report' });
    }
};

/* ------------------------------------------------------------------ */
/* Workload Report                                                     */
/* ------------------------------------------------------------------ */

export const getWorkloadReport = async (req: AuthRequest, res: Response) => {
    try {
        const { taskMatch, userFilter, range } = await getBaseFilters(req);
        const now = new Date();
        const staleCutoff = new Date(now.getTime() - STALE_DAYS * 86400000);

        // Open tasks only, unless an explicit status filter was requested
        const openTaskMatch: any = { ...taskMatch };
        if (!openTaskMatch.status) openTaskMatch.status = { $ne: 'completed' };

        const workloadDistribution = await Task.aggregate([
            { $match: openTaskMatch },
            {
                $group: {
                    _id: '$assignedTo',
                    openTasks: { $sum: 1 },
                    estimatedHours: { $sum: { $ifNull: ['$timeEstimate', 0] } },
                    urgentHighCount: { $sum: { $cond: [{ $in: ['$priority', ['urgent', 'high']] }, 1, 0] } },
                    staleCount: {
                        $sum: { $cond: [{ $lt: ['$updatedAt', staleCutoff] }, 1, 0] },
                    },
                },
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            {
                $project: {
                    name: '$user.name',
                    avatar: '$user.avatar',
                    openTasks: 1,
                    estimatedHours: { $round: ['$estimatedHours', 1] },
                    urgentHighCount: 1,
                    staleCount: 1,
                    capacityPct: {
                        $min: [
                            { $round: [{ $multiply: [{ $divide: ['$estimatedHours', HOURS_PER_WEEK] }, 100] }, 0] },
                            999,
                        ],
                    },
                },
            },
            { $sort: { estimatedHours: -1, openTasks: -1 } },
        ]);

        const summary = {
            totalOpenTasks: workloadDistribution.reduce((acc: number, w: any) => acc + w.openTasks, 0),
            totalEstimatedHours: Math.round(workloadDistribution.reduce((acc: number, w: any) => acc + w.estimatedHours, 0)),
            overloadedMembers: workloadDistribution.filter((w: any) => w.capacityPct > 100).length,
            staleTotal: workloadDistribution.reduce((acc: number, w: any) => acc + w.staleCount, 0),
        };

        // Heatmap over the effective window (server-generated day keys → timezone-safe)
        const heatmapWindow = resolveWindow(range, 28);
        const heatMatch: any = { ...taskMatch };
        delete heatMatch.updatedAt; // heatmap spans its own full window
        const heatmapRaw = await Task.aggregate([
            { $match: { ...heatMatch, updatedAt: { $gte: heatmapWindow.start, $lte: heatmapWindow.end } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, tasks: { $sum: 1 } } },
        ]);
        const heatMap = new Map(heatmapRaw.map((h: any) => [h._id, h.tasks]));
        const heatmapSeries = heatmapWindow.keys.map((k) => ({ _id: k, tasks: heatMap.get(k) || 0 }));

        res.json({
            data: {
                workloadDistribution,
                summary,
                heatmapSeries,
                hoursPerWeek: HOURS_PER_WEEK,
                totalMembers: workloadDistribution.length,
            },
        });
    } catch (error: any) {
        console.error('getWorkloadReport error:', error);
        res.status(500).json({ message: 'Failed to generate workload report' });
    }
};

/* ------------------------------------------------------------------ */
/* Activity Report                                                     */
/* ------------------------------------------------------------------ */

export const getActivityReport = async (req: AuthRequest, res: Response) => {
    try {
        const { activityMatch, range, userFilter, tenantUserIds } = await getBaseFilters(req);
        const window = resolveWindow(range, 30);
        const tenantObjectIds = tenantUserIds.map((id) => new mongoose.Types.ObjectId(id));

        // Actions over time
        const actionsOverTimeRaw = await ActivityLog.aggregate([
            { $match: { ...activityMatch, createdAt: { $gte: window.start, $lte: window.end } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        ]);
        const actionMap = new Map(actionsOverTimeRaw.map((r: any) => [r._id, r.count]));
        const actionsOverTime = window.keys.map((k) => ({ _id: k, count: actionMap.get(k) || 0 }));

        // Distribution by action type
        const activityDistribution = await ActivityLog.aggregate([
            { $match: activityMatch },
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 },
        ]);

        // Top contributors
        const topContributors = await ActivityLog.aggregate([
            { $match: activityMatch },
            { $group: { _id: '$user', count: { $sum: 1 }, lastActive: { $max: '$createdAt' } } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            {
                $project: {
                    name: '$user.name',
                    avatar: '$user.avatar',
                    count: 1,
                    lastActive: 1,
                },
            },
            { $sort: { count: -1 } },
            { $limit: 8 },
        ]);

        // Most active projects — resolve project ref from entityType
        const activeProjects = await ActivityLog.aggregate([
            { $match: activityMatch },
            {
                $lookup: {
                    from: 'tasks',
                    let: { eid: '$entityId', etype: '$entityType' },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$_id', '$$eid'] }, { $eq: ['$$etype', 'task'] }] } } },
                        { $project: { assignment: 1 } },
                    ],
                    as: 'taskDoc',
                },
            },
            {
                $addFields: {
                    projRef: {
                        $switch: {
                            branches: [
                                { case: { $eq: ['$entityType', 'assignment'] }, then: '$entityId' },
                                {
                                    case: { $and: [{ $eq: ['$entityType', 'task'] }, { $gt: [{ $size: '$taskDoc' }, 0] }] },
                                    then: { $arrayElemAt: ['$taskDoc.assignment', 0] },
                                },
                            ],
                            default: '$metadata.assignmentId',
                        },
                    },
                },
            },
            { $match: { projRef: { $ne: null } } },
            { $group: { _id: '$projRef', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            {
                // Tenant guard: only resolve titles for projects created inside this tenant
                $lookup: {
                    from: 'assignments',
                    let: { pid: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$_id', '$$pid'] },
                                createdBy: { $in: tenantObjectIds },
                            },
                        },
                        { $project: { title: 1 } },
                    ],
                    as: 'project',
                },
            },
            { $unwind: '$project' },
            { $project: { title: '$project.title', count: 1 } },
        ]);

        // Inactive members — tenant roster vs recent activity
        let memberDocs: any[] = [];
        try {
            memberDocs = await User.find(
                userFilter && userFilter._id !== undefined ? { _id: userFilter._id } : { _id: { $in: tenantUserIds.map((id) => new mongoose.Types.ObjectId(id)) } }
            )
                .select('name avatar lastLogin')
                .lean();
        } catch {
            memberDocs = [];
        }
        if (userFilter._id === null) memberDocs = []; // forced-empty scope
        // Member activity — full tenant roster with per-member engagement status.
        // Engagement = last trackable WORK action. Logins are excluded from the
        // status on purpose (opening the app ≠ contributing), but surfaced as info.
        const recentByUser = await ActivityLog.aggregate([
            { $match: { user: { $in: memberDocs.map((m) => m._id) } } },
            { $group: { _id: '$user', lastActive: { $max: '$createdAt' } } },
        ]);
        const lastActiveMap = new Map(recentByUser.map((r: any) => [String(r._id), r.lastActive]));
        const memberActivity = memberDocs
            .map((m) => {
                const lastActive = lastActiveMap.get(String(m._id)) || null;
                const daysInactive = lastActive
                    ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000)
                    : null;
                const status: 'active' | 'inactive' | 'never' =
                    daysInactive === null ? 'never'
                        : daysInactive >= STALE_DAYS ? 'inactive'
                            : 'active';
                return {
                    _id: m._id,
                    name: m.name,
                    avatar: m.avatar,
                    status,
                    lastActive,
                    daysInactive,
                    lastLogin: m.lastLogin || null,
                };
            })
            .sort((a, b) => (a.daysInactive ?? 99999) - (b.daysInactive ?? 99999)); // most recent first

        const totalActivities = await ActivityLog.countDocuments(activityMatch);

        res.json({
            data: {
                totalActivities,
                actionsOverTime,
                activityDistribution,
                topContributors,
                activeProjects,
                memberActivity,
                inactivityThresholdDays: STALE_DAYS,
            },
        });
    } catch (error: any) {
        console.error('getActivityReport error:', error);
        res.status(500).json({ message: 'Failed to generate activity report' });
    }
};

/* ------------------------------------------------------------------ */
/* Project Health Report                                               */
/* ------------------------------------------------------------------ */

export const getProjectHealthReport = async (req: AuthRequest, res: Response) => {
    try {
        const { tenantUserIds, userFilter } = await getBaseFilters(req);
        const userRole = req.user!.role;
        const userId = req.user!._id;
        const now = new Date();
        const weekAhead = new Date(now.getTime() + 7 * 86400000);

        // Which projects can this user see?
        let assignmentMatch: any = {};
        if (userRole === 'admin') {
            assignmentMatch.createdBy = { $in: tenantUserIds.map((id) => new mongoose.Types.ObjectId(id)) };
        } else if (userRole === 'manager') {
            const managedTeams = await Team.find({ manager: userId }).distinct('_id');
            assignmentMatch = {
                $or: [
                    { createdBy: userId },
                    { team: userId },
                    { teams: { $in: managedTeams } },
                ],
            };
        } else {
            assignmentMatch = { $or: [{ createdBy: userId }, { team: userId }] };
        }

        // Optional query filters (Assignment enums here, not Task enums)
        const ASSIGNMENT_STATUSES = ['not_started', 'in_progress', 'completed', 'delayed'];
        const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
        const extras: any[] = [];
        const qTeam = safeObjectId(req.query.teamId);
        if (qTeam) extras.push({ teams: qTeam });
        const qEmployee = safeObjectId(req.query.employeeId);
        if (qEmployee) extras.push({ $or: [{ createdBy: qEmployee }, { team: qEmployee }] });
        if (ASSIGNMENT_STATUSES.includes(String(req.query.status))) extras.push({ status: req.query.status });
        if (PRIORITIES.includes(String(req.query.priority))) extras.push({ priority: req.query.priority });
        const qSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        if (qSearch) {
            const rx = new RegExp(escapeRegex(qSearch), 'i');
            extras.push({ $or: [{ title: rx }, { clientName: rx }] });
        }
        if (!extras.length && typeof req.query.projectId === 'string' && req.query.projectId) {
            // Direct single-project pick
            const pId = safeObjectId(req.query.projectId);
            if (pId) extras.push({ _id: pId });
        }
        if (extras.length) assignmentMatch = { $and: [assignmentMatch, ...extras] };
        if (userFilter._id === null) assignmentMatch = { _id: null }; // forced-empty scope

        const projects = await Assignment.find(assignmentMatch)
            .select('title clientName status priority dueDate updatedAt')
            .lean();

        const projectIds = projects.map((p: any) => p._id);

        // Task rollup per project
        const taskRollup = await Task.aggregate([
            { $match: { assignment: { $in: projectIds } } },
            {
                $group: {
                    _id: '$assignment',
                    totalTasks: { $sum: 1 },
                    completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    overdueTasks: {
                        $sum: {
                            $cond: [
                                { $and: [
                                    { $ne: ['$status', 'completed'] },
                                    { $ne: [{ $ifNull: ['$dueDate', null] }, null] },
                                    { $lt: ['$dueDate', now] },
                                ] },
                                1, 0,
                            ],
                        },
                    },
                    dueThisWeek: {
                        $sum: {
                            $cond: [
                                { $and: [
                                    { $ne: ['$status', 'completed'] },
                                    { $ne: [{ $ifNull: ['$dueDate', null] }, null] },
                                    { $gte: ['$dueDate', now] },
                                    { $lte: ['$dueDate', weekAhead] },
                                ] },
                                1, 0,
                            ],
                        },
                    },
                },
            },
        ]);
        const rollupMap = new Map(taskRollup.map((t: any) => [String(t._id), t]));

        // Last activity per project (tasks + direct assignment logs)
        // Tenant guard: only consider logs authored by users of this tenant
        const activityAgg = await ActivityLog.aggregate([
            { $match: { user: { $in: tenantUserIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
            {
                $facet: {
                    byTask: [
                        { $match: { entityType: 'task' } },
                        {
                            $lookup: {
                                from: 'tasks',
                                localField: 'entityId',
                                foreignField: '_id',
                                as: 't',
                            },
                        },
                        { $unwind: '$t' },
                        { $match: { 't.assignment': { $in: projectIds } } },
                        { $group: { _id: '$t.assignment', lastActivityAt: { $max: '$createdAt' } } },
                    ],
                    byAssignment: [
                        { $match: { entityType: 'assignment', entityId: { $in: projectIds } } },
                        { $group: { _id: '$entityId', lastActivityAt: { $max: '$createdAt' } } },
                    ],
                },
            },
        ]);
        const lastActivityMap = new Map<string, Date>();
        for (const row of [...(activityAgg[0]?.byTask || []), ...(activityAgg[0]?.byAssignment || [])]) {
            const key = String(row._id);
            const prev = lastActivityMap.get(key);
            if (!prev || new Date(row.lastActivityAt) > new Date(prev)) {
                lastActivityMap.set(key, row.lastActivityAt);
            }
        }

        const rows = projects.map((p: any) => {
            const r = rollupMap.get(String(p._id)) || {
                totalTasks: 0, completedTasks: 0, overdueTasks: 0, dueThisWeek: 0,
            };
            const completionPct = r.totalTasks > 0 ? Math.round((r.completedTasks / r.totalTasks) * 100) : 0;
            const lastActivityAt = lastActivityMap.get(String(p._id))
                || p.updatedAt
                || null;
            const daysSinceActivity = lastActivityAt
                ? Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86400000)
                : null;
            const overdue = r.overdueTasks > 0;
            const pastDue = p.dueDate && new Date(p.dueDate) < now && completionPct < 100;
            const stalled = daysSinceActivity !== null && daysSinceActivity >= STALE_DAYS * 2;
            const dueSoon = r.dueThisWeek > 0;
            let health: 'red' | 'yellow' | 'green' = 'green';
            if (overdue || pastDue) health = 'red';
            else if (stalled || (dueSoon && completionPct < 50)) health = 'yellow';

            return {
                _id: p._id,
                title: p.title,
                clientName: p.clientName,
                status: p.status,
                priority: p.priority,
                dueDate: p.dueDate,
                totalTasks: r.totalTasks,
                completedTasks: r.completedTasks,
                completionPct,
                overdueTasks: r.overdueTasks,
                dueThisWeek: r.dueThisWeek,
                lastActivityAt,
                daysSinceActivity,
                health,
            };
        });

        // Default ordering: worst health first, then most overdue
        const rank = { red: 0, yellow: 1, green: 2 } as const;
        rows.sort((a: any, b: any) => {
            return rank[a.health as keyof typeof rank] - rank[b.health as keyof typeof rank]
                || b.overdueTasks - a.overdueTasks;
        });

        const summary = {
            totalProjects: rows.length,
            redCount: rows.filter((r: any) => r.health === 'red').length,
            yellowCount: rows.filter((r: any) => r.health === 'yellow').length,
            greenCount: rows.filter((r: any) => r.health === 'green').length,
        };

        // Exports request the unbounded set via ?all=1 (see buildProjectHealthPayload)
        if (String(req.query.all) === '1') {
            res.json({ data: { projects: rows, summary } });
            return;
        }

        // Server-side sorting (whitelisted keys only)
        const SORT_FIELDS = ['health', 'overdueTasks', 'completionPct', 'dueThisWeek', 'daysSinceActivity', 'title'];
        const sortBy = SORT_FIELDS.includes(String(req.query.sortBy)) ? String(req.query.sortBy) : null;
        const sortDir = String(req.query.sortDir) === 'asc' ? 1 : -1;
        let sortedRows = rows;
        if (sortBy) {
            const valOf = (r: any): string | number => {
                if (sortBy === 'title') return String(r.title || '').toLowerCase();
                if (sortBy === 'health') return rank[r.health as keyof typeof rank] ?? 3;
                const v = r[sortBy];
                return typeof v === 'number' ? v : -1; // nulls last in both directions
            };
            sortedRows = [...rows].sort((a: any, b: any) => {
                const va = valOf(a), vb = valOf(b);
                const cmp = typeof va === 'string' || typeof vb === 'string'
                    ? String(va).localeCompare(String(vb))
                    : va - vb;
                // Stable tiebreak keeps riskiest projects on top
                return cmp * sortDir
                    || (rank[a.health as keyof typeof rank] ?? 3) - (rank[b.health as keyof typeof rank] ?? 3);
            });
        }

        // Server-side pagination — payload stays bounded regardless of project count
        const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? ''), 10) || 12, 6), 48);
        const total = sortedRows.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const page = Math.min(Math.max(Number.parseInt(String(req.query.page ?? ''), 10) || 1, 1), totalPages);
        const pageRows = sortedRows.slice((page - 1) * limit, page * limit);

        res.json({
            data: {
                projects: pageRows,
                summary,
                pagination: { page, limit, total, totalPages },
            },
        });
    } catch (error: any) {
        console.error('getProjectHealthReport error:', error);
        res.status(500).json({ message: 'Failed to generate project health report' });
    }
};

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/** Neutralize spreadsheet formula injection (=, +, -, @ prefixes). */
const sanitizeCell = (val: unknown): string => {
    const s = String(val ?? '');
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

export const exportReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { type, reportType } = req.query;
        if (!type || !reportType) {
            res.status(400).json({ message: 'Missing type or reportType query parameters' });
            return;
        }

        let dataToExport: any[] = [];
        let columns: { header: string; key: string; width?: number }[] = [];

        if (reportType === 'employee') {
            const data = (await buildEmployeePayload(req))?.data;
            if (!data) { res.status(500).json({ message: 'Failed to build employee report' }); return; }
            dataToExport = data.employeeStats.map((e: any) => ({
                name: e.name,
                assignedCount: e.assignedCount,
                completedCount: e.completedCount,
                completionRate: `${e.completionRate}%`,
                overdueCount: e.overdueCount,
                avgCompletionDays: e.avgCompletionDays ?? '—',
                activeDays: e.activeDays,
            }));
            columns = [
                { header: 'Employee', key: 'name', width: 26 },
                { header: 'Assigned Tasks', key: 'assignedCount', width: 16 },
                { header: 'Completed', key: 'completedCount', width: 12 },
                { header: 'Completion %', key: 'completionRate', width: 14 },
                { header: 'Overdue', key: 'overdueCount', width: 10 },
                { header: 'Avg Completion (days)', key: 'avgCompletionDays', width: 20 },
                { header: 'Active Days', key: 'activeDays', width: 12 },
            ];
        } else if (reportType === 'workload') {
            const data = (await buildWorkloadPayload(req))?.data;
            if (!data) { res.status(500).json({ message: 'Failed to build workload report' }); return; }
            dataToExport = data.workloadDistribution.map((w: any) => ({
                name: w.name,
                openTasks: w.openTasks,
                estimatedHours: w.estimatedHours,
                capacityPct: `${w.capacityPct}%`,
                urgentHighCount: w.urgentHighCount,
                staleCount: w.staleCount,
            }));
            columns = [
                { header: 'Member', key: 'name', width: 26 },
                { header: 'Open Tasks', key: 'openTasks', width: 12 },
                { header: 'Estimated Hours', key: 'estimatedHours', width: 16 },
                { header: 'Capacity %', key: 'capacityPct', width: 12 },
                { header: 'Urgent/High', key: 'urgentHighCount', width: 12 },
                { header: `Stale (>${7}d)`, key: 'staleCount', width: 12 },
            ];
        } else if (reportType === 'activity') {
            const data = (await buildActivityPayload(req))?.data;
            if (!data) { res.status(500).json({ message: 'Failed to build activity report' }); return; }
            dataToExport = data.activityDistribution.map((a: any) => ({ action: a._id, count: a.count }));
            columns = [
                { header: 'Action', key: 'action', width: 32 },
                { header: 'Count', key: 'count', width: 12 },
            ];
        } else if (reportType === 'project-health') {
            const data = (await buildProjectHealthPayload(req))?.data;
            if (!data) { res.status(500).json({ message: 'Failed to build project health report' }); return; }
            dataToExport = data.projects.map((p: any) => ({
                title: p.title,
                clientName: p.clientName,
                status: p.status,
                totalTasks: p.totalTasks,
                completedTasks: p.completedTasks,
                completionPct: `${p.completionPct}%`,
                overdueTasks: p.overdueTasks,
                dueThisWeek: p.dueThisWeek,
                daysSinceActivity: p.daysSinceActivity ?? '—',
                health: p.health.toUpperCase(),
            }));
            columns = [
                { header: 'Project', key: 'title', width: 30 },
                { header: 'Client', key: 'clientName', width: 22 },
                { header: 'Status', key: 'status', width: 14 },
                { header: 'Total Tasks', key: 'totalTasks', width: 12 },
                { header: 'Completed', key: 'completedTasks', width: 12 },
                { header: 'Completion %', key: 'completionPct', width: 14 },
                { header: 'Overdue', key: 'overdueTasks', width: 10 },
                { header: 'Due This Week', key: 'dueThisWeek', width: 14 },
                { header: 'Days Since Activity', key: 'daysSinceActivity', width: 18 },
                { header: 'Health', key: 'health', width: 10 },
            ];
        } else {
            res.status(400).json({ message: 'Invalid reportType' });
            return;
        }

        const generated = new Date().toISOString().slice(0, 10);
        const filename = `flowdesk-${String(reportType)}-report-${generated}`;

        if (type === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            const escapeCsv = (v: unknown) => `"${sanitizeCell(v).replace(/"/g, '""')}"`;
            const headerRow = columns.map((c) => escapeCsv(c.header)).join(',');
            const rows = dataToExport.map((row) =>
                columns.map((c) => escapeCsv(row[c.key])).join(',')
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
            const header = worksheet.getRow(1);
            header.font = { bold: true };
            dataToExport.forEach((row) => worksheet.addRow(row));
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        if (type === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            const doc = new PDFDocument({ margin: 36, size: 'A4' });
            doc.pipe(res);

            doc.fontSize(18).font('Helvetica-Bold')
                .text(`FlowDesk ${String(reportType).replace('-', ' ')} report`, { align: 'center' });
            doc.moveDown(0.3);
            doc.fontSize(9).font('Helvetica').fillColor('#666')
                .text(`Generated ${new Date().toLocaleString()}`, { align: 'center' });
            doc.moveDown(1);

            const colWidths = columns.map(() => undefined as unknown as number);
            void colWidths;
            const usableWidth = doc.page.width - 72;
            const widths = columns.map(() => usableWidth / columns.length);

            const drawHeader = () => {
                const y = doc.y;
                doc.rect(36, y, usableWidth, 20).fill('#f1f5f9');
                doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
                columns.forEach((c, i) => {
                    doc.text(String(c.header), 40 + widths.slice(0, i).reduce((a: number, b) => a + b, 0), y + 6, {
                        width: widths[i] - 8, ellipsis: true, lineBreak: false,
                    });
                });
                doc.y = y + 24;
            };

            drawHeader();
            doc.fontSize(8).font('Helvetica');
            dataToExport.forEach((row, idx) => {
                if (doc.y > doc.page.height - 72) {
                    doc.addPage();
                    drawHeader();
                    doc.fontSize(8).font('Helvetica');
                }
                const y = doc.y;
                if (idx % 2 === 1) {
                    doc.rect(36, y - 2, usableWidth, 16).fill('#fafafa');
                }
                doc.fillColor('#334155');
                columns.forEach((c, i) => {
                    doc.text(sanitizeCell(row[c.key]), 40 + widths.slice(0, i).reduce((a: number, b) => a + b, 0), y, {
                        width: widths[i] - 8, ellipsis: true, lineBreak: false,
                    });
                });
                doc.y = y + 16;
            });

            doc.end();
            return;
        }

        res.status(400).json({ message: 'Invalid export type' });
    } catch (error: any) {
        console.error('Export Error:', error);
        res.status(500).json({ message: 'Failed to export report' });
    }
};

/* ------------------------------------------------------------------ */
/* Payload builders reused by view + export (single source of truth)   */
/* ------------------------------------------------------------------ */

/** Runs a report controller against a capturing stub response. */
const capturePayload = async (
    fn: (req: AuthRequest, res: Response) => Promise<void | Response>,
    req: AuthRequest
): Promise<{ data: any } | null> => {
    let payload: any = null;
    const res: any = {
        json: (v: any) => { payload = v; return v; },
        status: () => res,
        setHeader: () => res,
        send: () => res,
        end: () => res,
        pipe: () => res,
    };
    await fn(req, res);
    return payload;
};

const buildEmployeePayload = (req: AuthRequest) => capturePayload(getEmployeeTrackingReport, req);
const buildWorkloadPayload = (req: AuthRequest) => capturePayload(getWorkloadReport, req);
const buildActivityPayload = (req: AuthRequest) => capturePayload(getActivityReport, req);
// Exports always receive the full, unpaginated project set
const buildProjectHealthPayload = (req: AuthRequest) => {
    req.query = { ...req.query, all: '1' };
    return capturePayload(getProjectHealthReport, req);
};
