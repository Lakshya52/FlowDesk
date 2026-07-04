"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalSearch = exports.getReports = exports.getReportFilters = exports.getCalendarEvents = exports.getDashboardStats = void 0;
const Assignment_1 = __importDefault(require("../models/Assignment"));
const Task_1 = __importDefault(require("../models/Task"));
const Team_1 = __importDefault(require("../models/Team"));
const User_1 = __importDefault(require("../models/User"));
const ActivityLog_1 = __importDefault(require("../models/ActivityLog"));
const Lead_1 = __importDefault(require("../models/Lead"));
const tenant_1 = require("../utils/tenant");
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user._id;
        const userRole = req.user.role;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        // Get all users in this tenant for tenant scoping
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        // Base filters for role-based access
        const assignmentFilter = {};
        const taskFilter = {};
        const activityFilter = {};
        if (userRole === 'member') {
            assignmentFilter.team = userId;
            taskFilter.assignedTo = userId;
            activityFilter['$or'] = [
                { user: userId }
            ];
        }
        else if (userRole === 'manager') {
            const managedTeams = await Team_1.default.find({ manager: userId }).distinct('_id');
            const allManagedMembers = await Team_1.default.find({ manager: userId }).distinct('members');
            // Only include managed members that belong to this tenant
            const managedMembers = allManagedMembers.filter((m) => tenantUserIds.includes(m.toString()));
            // Managers see assignments they created OR where their team is assigned
            assignmentFilter['$or'] = [
                { createdBy: userId },
                { teams: { $in: managedTeams } }
            ];
            // Managers see tasks they assigned OR assigned to their team members
            taskFilter['$or'] = [
                { assignedTo: { $in: managedMembers } },
                { createdBy: userId },
                { assignedTo: userId }
            ];
            activityFilter['$or'] = [
                { user: userId },
                { user: { $in: managedMembers } },
                { user: userId }
            ];
        }
        else {
            // Admin — scope all data to this tenant
            assignmentFilter.createdBy = { $in: tenantUserIds };
            taskFilter.assignedTo = { $in: tenantUserIds };
            activityFilter.user = { $in: tenantUserIds };
        }
        // Active assignments
        const activeAssignments = await Assignment_1.default.countDocuments({
            ...assignmentFilter,
            status: { $in: ['not_started', 'in_progress'] },
        });
        // Total assignments
        const totalAssignments = await Assignment_1.default.countDocuments(assignmentFilter);
        // Tasks due today
        const tasksDueToday = await Task_1.default.countDocuments({
            ...taskFilter,
            dueDate: { $gte: todayStart, $lt: todayEnd },
            status: { $ne: 'completed' },
        });
        // Overdue tasks
        const overdueTasks = await Task_1.default.countDocuments({
            ...taskFilter,
            dueDate: { $lt: todayStart },
            status: { $ne: 'completed' },
        });
        // Completed this week
        const completedThisWeek = await Task_1.default.countDocuments({
            ...taskFilter,
            status: 'completed',
            updatedAt: { $gte: weekStart },
        });
        // Total tasks
        const totalTasks = await Task_1.default.countDocuments(taskFilter);
        // Total call duration across all leads (scoped by tenantId directly on Lead model)
        const tenantId = (req.user.tenantId?._id || req.user.tenantId).toString();
        const callDurationResult = await Lead_1.default.aggregate([
            { $match: { tenantId: tenantId } },
            { $group: { _id: null, total: { $sum: '$callDuration' } } },
        ]);
        const totalCallDuration = callDurationResult[0]?.total || 0;
        // Task status breakdown
        const tasksByStatus = await Task_1.default.aggregate([
            { $match: taskFilter },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);
        // Recent activity with pagination (7 per page as requested)
        const page = parseInt(req.query.page) || 1;
        const limit = 7;
        const skip = (page - 1) * limit;
        const recentActivity = await ActivityLog_1.default.find(activityFilter)
            .populate('user', 'name email avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        const totalActivities = await ActivityLog_1.default.countDocuments(activityFilter);
        // Team workload (scoped to tenant users)
        const teamWorkload = await Task_1.default.aggregate([
            { $match: { status: { $ne: 'completed' }, assignedTo: { $in: tenantUserIds } } },
            { $group: { _id: '$assignedTo', taskCount: { $sum: 1 } } },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: 0,
                    userId: '$_id',
                    name: '$user.name',
                    email: '$user.email',
                    avatar: '$user.avatar',
                    taskCount: 1,
                },
            },
            { $sort: { taskCount: -1 } },
            { $limit: 10 },
        ]);
        // Upcoming deadlines
        const upcomingDeadlines = await Task_1.default.find({
            ...taskFilter,
            dueDate: { $gte: todayStart },
            status: { $ne: 'completed' },
        })
            .populate('assignedTo', 'name email avatar')
            .populate('assignment', 'title')
            .sort({ dueDate: 1 })
            .limit(5);
        // Weekly completion data for trend chart
        const weeklyCompletionData = await Task_1.default.aggregate([
            {
                $match: {
                    ...taskFilter,
                    status: 'completed',
                    updatedAt: { $gte: weekStart }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                    completed: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        res.json({
            stats: {
                activeAssignments,
                totalAssignments,
                tasksDueToday,
                overdueTasks,
                completedThisWeek,
                totalTasks,
                totalCallDuration,
            },
            tasksByStatus,
            recentActivity,
            totalActivities,
            currentPage: page,
            totalPages: Math.ceil(totalActivities / limit),
            teamWorkload,
            upcomingDeadlines,
            weeklyCompletionData,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getDashboardStats = getDashboardStats;
const getCalendarEvents = async (req, res) => {
    try {
        const { start, end, userId, assignmentId } = req.query;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const userRole = req.user.role;
        // Tenants-scoped base filter for tasks
        const taskFilter = {
            assignedTo: { $in: tenantUserIds }
        };
        if (start && end) {
            taskFilter.dueDate = { $gte: new Date(start), $lte: new Date(end) };
        }
        if (userId) {
            // Only allow filtering by userId if it belongs to this tenant
            if (tenantUserIds.includes(userId) || userRole !== 'member') {
                taskFilter.assignedTo = userId;
            }
        }
        if (assignmentId)
            taskFilter.assignment = assignmentId;
        if (userRole === 'member') {
            taskFilter.assignedTo = req.user._id;
        }
        const tasks = await Task_1.default.find(taskFilter)
            .populate('assignedTo', 'name email avatar')
            .populate('assignment', 'title')
            .sort({ dueDate: 1 });
        // Tenant-scoped base filter for assignments
        const assignmentFilter = {
            createdBy: { $in: tenantUserIds }
        };
        if (assignmentId)
            assignmentFilter._id = assignmentId;
        if (userRole === 'member') {
            assignmentFilter.team = req.user._id;
        }
        if (start && end) {
            assignmentFilter.dueDate = { $gte: new Date(start), $lte: new Date(end) };
        }
        const assignments = await Assignment_1.default.find(assignmentFilter)
            .populate('createdBy', 'name email')
            .sort({ dueDate: 1 });
        res.json({ tasks, assignments });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCalendarEvents = getCalendarEvents;
const getReportFilters = async (req, res) => {
    try {
        const userRole = req.user.role;
        const userId = req.user._id;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        let teams = [];
        let employees = [];
        if (userRole === 'admin') {
            teams = await Team_1.default.find({
                $or: [
                    { members: { $in: tenantUserIds } },
                    { manager: { $in: tenantUserIds } }
                ]
            }).select('name _id members manager').lean();
            employees = await User_1.default.find({
                _id: { $in: tenantUserIds }
            }).select('name _id email employeeId').lean();
        }
        else if (userRole === 'manager') {
            // Include teams managed by the user AND teams where they are a member (within tenant)
            teams = await Team_1.default.find({
                $or: [
                    { manager: userId },
                    { members: userId }
                ]
            }).select('name _id members manager').lean();
            const teamIds = teams.map(t => t._id);
            const teamMembers = await Team_1.default.find({ _id: { $in: teamIds } }).distinct('members');
            // Intersect team members with tenant users
            const tenantTeamMembers = teamMembers.filter((m) => tenantUserIds.includes(m.toString()));
            employees = await User_1.default.find({
                _id: { $in: [...tenantTeamMembers, userId.toString()] }
            }).select('name _id email employeeId').lean();
        }
        else {
            // For members, let them see their own teams and teammates (within tenant)
            teams = await Team_1.default.find({ members: userId }).select('name _id members manager').lean();
            const teamIds = teams.map(t => t._id);
            const teamMembers = await Team_1.default.find({ _id: { $in: teamIds } }).distinct('members');
            const tenantTeamMembers = teamMembers.filter((m) => tenantUserIds.includes(m.toString()));
            employees = await User_1.default.find({
                _id: { $in: [...tenantTeamMembers, userId.toString()] }
            }).select('name _id email employeeId').lean();
        }
        // Ensure we always return arrays and non-null values
        res.json({
            teams: Array.isArray(teams) ? teams : [],
            employees: Array.isArray(employees) ? employees : []
        });
    }
    catch (error) {
        console.error('Error in getReportFilters:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getReportFilters = getReportFilters;
const getReports = async (req, res) => {
    try {
        const { startDate, endDate, teamId, employeeId } = req.query;
        const userRole = req.user.role;
        const userId = req.user._id;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        }
        // Tenant scope: only tasks assigned to users in this tenant
        let baseMatch = {
            ...dateFilter,
            assignedTo: { $in: tenantUserIds }
        };
        // Role-based constraints
        if (userRole === 'member') {
            baseMatch.assignedTo = userId;
        }
        else if (userRole === 'manager') {
            const managedTeams = await Team_1.default.find({ manager: userId }).distinct('_id');
            const allManagedMembers = await Team_1.default.find({ manager: userId }).distinct('members');
            const managedMembers = allManagedMembers.filter((m) => tenantUserIds.includes(m.toString()));
            if (teamId) {
                if (!managedTeams.map(id => id.toString()).includes(teamId)) {
                    res.status(403).json({ message: 'Forbidden' });
                    return;
                }
                const team = await Team_1.default.findById(teamId);
                const tenantTeamMembers = (team?.members || []).filter((m) => tenantUserIds.includes(m.toString()));
                baseMatch.assignedTo = { $in: tenantTeamMembers };
            }
            else if (employeeId) {
                if (!managedMembers.map(id => id.toString()).includes(employeeId)) {
                    res.status(403).json({ message: 'Forbidden' });
                    return;
                }
                baseMatch.assignedTo = employeeId;
            }
            else {
                baseMatch.assignedTo = { $in: managedMembers };
            }
        }
        else if (userRole === 'admin') {
            if (teamId) {
                const team = await Team_1.default.findById(teamId);
                const tenantTeamMembers = (team?.members || []).filter((m) => tenantUserIds.includes(m.toString()));
                baseMatch.assignedTo = { $in: tenantTeamMembers };
            }
            else if (employeeId) {
                if (!tenantUserIds.includes(employeeId)) {
                    res.status(403).json({ message: 'Forbidden' });
                    return;
                }
                baseMatch.assignedTo = employeeId;
            }
        }
        // Productivity report
        const completedTasks = await Task_1.default.aggregate([
            { $match: { status: 'completed', ...baseMatch } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);
        // Task delay report
        const delayedTasks = await Task_1.default.find({
            ...baseMatch,
            dueDate: { $lt: new Date() },
            status: { $ne: 'completed' },
        })
            .populate('assignedTo', 'name email employeeId')
            .populate('assignment', 'title')
            .sort({ dueDate: 1 });
        // Assignment completion analytics (Filtered by team if provided, scoped to tenant)
        const assignmentFilter = {
            createdBy: { $in: tenantUserIds }
        };
        if (teamId) {
            assignmentFilter.teams = teamId;
        }
        const assignmentStats = await Assignment_1.default.aggregate([
            { $match: assignmentFilter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);
        // Per-user productivity
        const userProductivity = await Task_1.default.aggregate([
            { $match: { status: 'completed', ...baseMatch } },
            { $group: { _id: '$assignedTo', completed: { $sum: 1 } } },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: 0,
                    userId: '$_id',
                    name: '$user.name',
                    employeeId: '$user.employeeId',
                    completed: 1,
                },
            },
            { $sort: { completed: -1 } },
        ]);
        res.json({
            completedTasks,
            delayedTasks,
            assignmentStats,
            userProductivity,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getReports = getReports;
const globalSearch = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            res.json({ tasks: [], assignments: [], users: [], teams: [] });
            return;
        }
        const userId = req.user._id;
        const userRole = req.user.role;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const searchRegex = new RegExp(query, 'i');
        // Base filters with tenant scoping
        const taskFilter = {
            title: searchRegex,
            $or: [
                { assignedTo: { $in: tenantUserIds } },
                { createdBy: { $in: tenantUserIds } }
            ]
        };
        const assignmentFilter = {
            $or: [
                { title: searchRegex },
                { clientName: searchRegex }
            ],
            createdBy: { $in: tenantUserIds }
        };
        const userFilter = {
            $or: [
                { name: searchRegex },
                { email: searchRegex },
                { employeeId: searchRegex }
            ],
            _id: { $in: tenantUserIds }
        };
        const teamFilter = {
            name: searchRegex,
            $or: [
                { members: { $in: tenantUserIds } },
                { manager: { $in: tenantUserIds } }
            ]
        };
        // Role-based visibility refinement
        if (userRole === 'member') {
            taskFilter.assignedTo = userId;
            assignmentFilter.team = userId;
            const myTeams = await Team_1.default.find({ members: userId }).distinct('_id');
            teamFilter._id = { $in: myTeams };
            const teamMembers = await Team_1.default.find({ members: userId }).distinct('members');
            const tenantTeamMembers = teamMembers.filter((m) => tenantUserIds.includes(m.toString()));
            userFilter._id = { $in: tenantTeamMembers };
        }
        else if (userRole === 'manager') {
            const managedTeams = await Team_1.default.find({ manager: userId }).distinct('_id');
            const allManagedMembers = await Team_1.default.find({ manager: userId }).distinct('members');
            const managedMembers = allManagedMembers.filter((m) => tenantUserIds.includes(m.toString()));
            taskFilter.assignedTo = { $in: [...managedMembers, userId] };
            assignmentFilter.$or.push({ teams: { $in: managedTeams } });
            teamFilter.$or = [{ manager: userId }, { _id: { $in: managedTeams } }];
            userFilter._id = { $in: [userId.toString(), ...managedMembers] };
        }
        const [tasks, assignments, users, teams] = await Promise.all([
            Task_1.default.find(taskFilter).limit(5).populate('assignedTo', 'name').populate('assignment', 'title'),
            Assignment_1.default.find(assignmentFilter).limit(5),
            User_1.default.find(userFilter).limit(5).select('name email avatar role employeeId'),
            Team_1.default.find(teamFilter).limit(5).populate('manager', 'name'),
        ]);
        res.json({ tasks, assignments, users, teams });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.globalSearch = globalSearch;
//# sourceMappingURL=dashboardController.js.map